/**
 * Guard de red de los tests de integración (setupFiles del proyecto `integration`).
 *
 * Solo deja conectar a los hosts de homologación de WSAA y de los `ENDPOINTS` de
 * cada paquete (`packages/<paquete>/src/constants.ts`); cualquier otro host,
 * producción incluida, se bloquea antes de abrir el socket. El chequeo está en
 * `net.Socket.prototype.connect`, por donde pasa toda conexión TCP (fetch,
 * node:http/https/http2/tls/net); `fetch` además lo verifica antes de empezar,
 * para que el error diga qué host se bloqueó.
 */
import { existsSync, readdirSync } from 'node:fs';
import net from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WSAA_ENDPOINTS } from '@ramiidv/arca-common';

interface Endpoints {
  testing: string;
  production: string;
}

const PACKAGES = new URL('../../packages/', import.meta.url);

async function endpointsDeLosPaquetes(): Promise<Endpoints[]> {
  const encontrados: Endpoints[] = [];
  for (const paquete of readdirSync(PACKAGES).sort()) {
    const constants = fileURLToPath(new URL(`${paquete}/src/constants.ts`, PACKAGES));
    if (!existsSync(constants)) continue;
    const mod = (await import(pathToFileURL(constants).href)) as { ENDPOINTS?: Record<string, Endpoints> };
    encontrados.push(...Object.values(mod.ENDPOINTS ?? {}));
  }
  return encontrados;
}

const normalizar = (host: string) =>
  host
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');

/** Hosts de homologación permitidos. */
export const HOSTS_HOMOLOGACION: ReadonlySet<string> = new Set(
  [WSAA_ENDPOINTS, ...(await endpointsDeLosPaquetes())].map((e) => normalizar(new URL(e.testing).hostname)),
);

const mensaje = (host: string) =>
  `guard de homologación: conexión a ${host} bloqueada (solo hosts de homologación de ARCA)`;

/**
 * Host de los argumentos de `socket.connect`: `(options[, cb])`, `(port[, host][, cb])`
 * o `(path[, cb])`; Node también lo llama con `[options, cb]` ya normalizados.
 * `undefined` para un socket local (`path`, IPC), que no sale a la red.
 */
export function hostDeConnect(args: readonly unknown[]): string | undefined {
  let [primero, segundo] = args;
  if (Array.isArray(primero)) [primero, segundo] = primero;
  if (typeof primero === 'object' && primero !== null) {
    const o = primero as { host?: unknown; path?: unknown };
    if (o.path !== undefined && o.path !== null) return undefined;
    return normalizar(typeof o.host === 'string' && o.host ? o.host : 'localhost');
  }
  if (typeof primero === 'string' && !/^\d+$/.test(primero)) return undefined;
  return normalizar(typeof segundo === 'string' && segundo ? segundo : 'localhost');
}

const INSTALADO = Symbol.for('arca-sdks.guard-homologacion');
const estado = globalThis as typeof globalThis & { [INSTALADO]?: true };

if (!estado[INSTALADO]) {
  estado[INSTALADO] = true;

  const connectOriginal = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
    const host = hostDeConnect(args);
    if (host !== undefined && !HOSTS_HOMOLOGACION.has(host)) {
      // Como un error de red: el socket se destruye y lo emite, sin conectar.
      process.nextTick(() => this.destroy(new Error(mensaje(host))));
      return this;
    }
    return Reflect.apply(connectOriginal, this, args);
  } as typeof connectOriginal;

  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const host = normalizar(new URL(input instanceof Request ? input.url : input).hostname);
    if (!HOSTS_HOMOLOGACION.has(host)) throw new Error(mensaje(host));
    return fetchOriginal(input, init);
  };
}
