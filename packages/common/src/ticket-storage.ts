import { randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { chmod, lstat, mkdir, open, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, parse, resolve } from 'node:path';
import type { AccessTicket, TicketStorage, TicketStorageGetOptions } from './types.js';

/**
 * Normaliza un ticket leído de un storage: acepta `expirationTime` como string
 * ISO, epoch en ms o `Date`, y devuelve `null` si el valor no es un ticket válido.
 */
export function normalizeAccessTicket(raw: unknown): AccessTicket | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  if (typeof t['token'] !== 'string' || typeof t['sign'] !== 'string') return null;

  const expirationTime = toIso(t['expirationTime']);
  if (!expirationTime) return null;

  const ticket: AccessTicket = { token: t['token'], sign: t['sign'], expirationTime };
  const generationTime = toIso(t['generationTime']);
  if (generationTime) ticket.generationTime = generationTime;
  if (typeof t['service'] === 'string') ticket.service = t['service'];
  return ticket;
}

function toIso(value: unknown): string | undefined {
  if (value instanceof Date || typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  return undefined;
}

/**
 * Storage en memoria. Útil para tests o para compartir tickets entre varias
 * instancias dentro del mismo proceso. No sobrevive a un reinicio.
 *
 * Guarda copias serializadas (como haría un storage real) para que los bugs de
 * serialización aparezcan también en los tests. Los tickets están en un campo
 * privado (`#`): no aparecen en `util.inspect` ni en `console.log`.
 */
export class MemoryTicketStorage implements TicketStorage {
  readonly #tickets = new Map<string, string>();

  async get(key: string): Promise<AccessTicket | null> {
    const raw = this.#tickets.get(key);
    return raw ? normalizeAccessTicket(JSON.parse(raw)) : null;
  }

  async set(key: string, ticket: AccessTicket): Promise<void> {
    this.#tickets.set(key, JSON.stringify(ticket));
  }

  async delete(key: string): Promise<void> {
    this.#tickets.delete(key);
  }
}

/** Tamaño máximo de un archivo de ticket (un TA real ocupa unos pocos KB). */
const MAX_TICKET_FILE_BYTES = 1024 * 1024;

/**
 * Flags para abrir un archivo de ticket: sin seguir symlinks (`O_NOFOLLOW`) y
 * sin bloquearse si es un FIFO (`O_NONBLOCK`), donde existan (no en Windows).
 */
const READ_FLAGS = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0) | (fsConstants.O_NONBLOCK ?? 0);

/**
 * Storage en archivos: un archivo JSON por ticket dentro de `directory`.
 *
 * - Escritura atómica y durable (archivo temporal con nombre aleatorio +
 *   `fsync` + rename), así un corte de luz no deja un archivo a medio escribir.
 * - Los tickets se guardan en texto plano: el token y el sign dan acceso a los
 *   web services de ARCA con tu CUIT. Los archivos se crean con permisos 0600
 *   y el directorio con 0700.
 * - En POSIX, el directorio tiene que ser un directorio real (no un symlink) y
 *   del usuario del proceso; si no, `get`/`set` lanzan (y `WsaaClient` lo
 *   informa como `auth:storage-error`). Si tiene permisos para el grupo u
 *   otros, se le ajustan a 0700 (salvo el directorio actual, el home o la
 *   raíz, o si `chmod` falla: entonces se rechaza si el grupo u otros pueden
 *   escribir en él).
 * - Los archivos se abren sin seguir symlinks: un symlink, un FIFO, un archivo
 *   de otro usuario o uno de más de 1 MB se ignora (se trata como inexistente
 *   y se informa por `options.onError`).
 * - Un archivo con JSON corrupto se borra y se trata como inexistente (se
 *   informa por `options.onError`, que `WsaaClient` emite como `auth:storage-error`).
 * - Seguro para varios procesos que comparten el directorio (cada key es un archivo).
 *
 * @example
 * ```ts
 * const arca = new ArcaFacturacion({ ..., ticketStorage: new FileTicketStorage("./.arca-tickets") });
 * ```
 */
export class FileTicketStorage implements TicketStorage {
  private directoryReady = false;

  constructor(private readonly directory: string) {}

  async get(key: string, options?: TicketStorageGetOptions): Promise<AccessTicket | null> {
    if (!(await this.checkDirectory(false))) return null;
    const path = this.pathFor(key);
    const report = (message: string) => {
      try {
        options?.onError?.(new Error(message));
      } catch {
        // Un callback que falla no afecta la lectura.
      }
    };
    const raw = await readTicketFile(path);
    if (raw === null) return null;
    if (raw === undefined) {
      report(`Ticket en ${path} ignorado: no es un archivo regular del usuario actual de hasta 1 MB`);
      return null;
    }
    try {
      return normalizeAccessTicket(JSON.parse(raw));
    } catch (err) {
      if (!(err instanceof SyntaxError)) throw err;
      // Archivo corrupto: se descarta para que el próximo login lo reemplace. El
      // mensaje del parser no se incluye: cita parte del contenido del archivo.
      await rm(path, { force: true }).catch(() => {});
      report(`Ticket corrupto en ${path} (descartado): JSON inválido`);
      return null;
    }
  }

  async set(key: string, ticket: AccessTicket): Promise<void> {
    await this.checkDirectory(true);
    const target = this.pathFor(key);
    const tmp = `${target}.${randomUUID()}.tmp`;
    try {
      const handle = await open(tmp, 'wx', 0o600);
      try {
        await handle.writeFile(JSON.stringify(ticket), 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(tmp, target);
    } catch (err) {
      await rm(tmp, { force: true });
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  /**
   * Verifica el directorio (y lo crea si `create`). Devuelve `false` si no
   * existe y no se pidió crearlo.
   * @throws Error si es un symlink, no es un directorio o (en POSIX) es de otro
   *   usuario o tiene permisos de escritura para otros que no se pueden ajustar.
   */
  private async checkDirectory(create: boolean): Promise<boolean> {
    if (this.directoryReady) return true;
    if (create) await mkdir(this.directory, { recursive: true, mode: 0o700 });
    let info: Awaited<ReturnType<typeof lstat>>;
    try {
      info = await lstat(this.directory);
    } catch (err) {
      if (!create && (err as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw err;
    }
    const dir = resolve(this.directory);
    if (info.isSymbolicLink())
      throw new Error(`FileTicketStorage: ${dir} es un symlink; usá la ruta real del directorio`);
    if (!info.isDirectory()) throw new Error(`FileTicketStorage: ${dir} no es un directorio`);

    const uid = process.getuid?.();
    // En Windows no hay uid ni permisos POSIX: no se verifican.
    if (uid !== undefined) {
      if (info.uid !== uid) {
        throw new Error(`FileTicketStorage: ${dir} es de otro usuario (uid ${info.uid}); usá un directorio propio`);
      }
      if ((info.mode & 0o077) !== 0) {
        // Nunca se cambian los permisos del directorio actual, el home ni la raíz
        // (alguien pasó "." o "~"). Ahí, o si `chmod` falla (ej: un filesystem
        // montado que no lo admite), solo se rechaza si otros pueden escribir.
        const protectedDirs = [process.cwd(), homedir(), parse(dir).root].map((d) => resolve(d));
        const restricted =
          !protectedDirs.includes(dir) &&
          (await chmod(this.directory, 0o700).then(
            () => true,
            () => false,
          ));
        if (!restricted && (info.mode & 0o022) !== 0) {
          throw new Error(
            `FileTicketStorage: el grupo u otros usuarios pueden escribir en ${dir}; usá un subdirectorio propio`,
          );
        }
      }
    }
    this.directoryReady = true;
    return true;
  }

  private pathFor(key: string): string {
    return join(this.directory, `${key.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`);
  }
}

/**
 * Lee un archivo de ticket sin seguir symlinks. `null`: no existe;
 * `undefined`: existe pero no es un archivo regular del usuario actual de
 * hasta `MAX_TICKET_FILE_BYTES` (symlink, FIFO, de otro usuario, muy grande).
 */
async function readTicketFile(path: string): Promise<string | null | undefined> {
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(path, READ_FLAGS);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return null;
    // ELOOP (Linux, macOS) / EMLINK (FreeBSD): es un symlink.
    if (code === 'ELOOP' || code === 'EMLINK') return undefined;
    throw err;
  }
  try {
    const info = await handle.stat();
    const uid = process.getuid?.();
    if (!info.isFile() || info.size > MAX_TICKET_FILE_BYTES || (uid !== undefined && info.uid !== uid)) {
      return undefined;
    }
    return await handle.readFile('utf8');
  } finally {
    await handle.close();
  }
}
