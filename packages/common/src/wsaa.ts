import { createHash, randomInt } from 'node:crypto';
import forge from 'node-forge';
import { parseCredentials } from './certificate.js';
import type { ParsedCredentials } from './certificate.js';
import { validateEndpoint } from './endpoint.js';
import { ArcaAuthError, ArcaSoapError, ArcaTicketVigenteError, ArcaValidationError } from './errors.js';
import { soapCallWith, parseXml, buildXml, extractMethodResult, safeEmit, abortedBeforeSend } from './soap-client.js';
import { normalizeAccessTicket } from './ticket-storage.js';
import type { AccessTicket, ArcaEvent, CallOptions, LegacyTlsMode, SoapCallOptions, TicketStorage } from './types.js';
import { WSAA_ENDPOINTS, WSAA_NAMESPACE } from './constants.js';

/** Margen de seguridad antes de considerar un token expirado (2 minutos). */
const EXPIRY_MARGIN_MS = 2 * 60_000;
/** Antigüedad del `generationTime` del TRA, para tolerar relojes levemente adelantados. */
const TRA_GENERATION_OFFSET_MS = 2 * 60_000;
/**
 * Vigencia por defecto del TRA (`expirationTime - now`), en minutos. Corta a
 * propósito: el TRA solo se usa para un login y el TA dura 12 horas igual, así
 * que una vigencia larga solo amplía la ventana en que un CMS filtrado sirve.
 */
const DEFAULT_TOKEN_TTL_MINUTES = 10;
/** Vigencia máxima del TRA que acepta WSAA (24 horas desde su propia hora; más da `xml.expirationTime.invalid`). */
const MAX_TOKEN_TTL_MINUTES = 1440;
/** Vida de un TA según el manual de WSAA (12 horas): se usa si la respuesta no trae `expirationTime`. */
const DEFAULT_TA_LIFETIME_MS = 12 * 60 * 60_000;
/**
 * Un TA que vence a más de 24 horas (de la hora de ARCA) no es plausible (WSAA
 * los emite por 12 horas): se trata como inválido, venga de WSAA o del storage.
 */
const MAX_TA_LIFETIME_MS = 24 * 60 * 60_000;
/** Desfase de reloj máximo que `autoClockSkew` aplica: uno mayor indica un header `Date` absurdo. */
const MAX_AUTO_CLOCK_OFFSET_MS = 24 * 60 * 60_000;
/** Espera por defecto antes de volver a intentar un login fallido (la spec de WSAA pide no reintentar enseguida). */
const DEFAULT_LOGIN_ERROR_COOLDOWN_MS = 60_000;
/**
 * Lapso en el que WSAA rechaza un TA repetido (`coe.alreadyAuthenticated`),
 * según el manual del desarrollador de WSAA (§10.6).
 */
const ALREADY_AUTHENTICATED_COOLDOWN_MS = { production: 2 * 60_000, testing: 10 * 60_000 } as const;
/**
 * Nombre de un servicio (WSN) en el TRA, según el XSD del TRA: empieza con una
 * letra y sigue con letras, dígitos, `_` o `-` (ej: `wsfe`, `ws_sr_padron_a13`,
 * `sire-ws`), de 3 a 32 caracteres.
 */
const SERVICE_NAME_RE = /^[A-Za-z][A-Za-z0-9_-]{2,31}$/;
/**
 * Esperas (ms) entre relecturas del storage tras `coe.alreadyAuthenticated`:
 * otro proceso pudo haber obtenido el TA y estar por guardarlo.
 */
const ALREADY_AUTHENTICATED_REREAD_DELAYS_MS = [0, 250, 750];

export interface WsaaClientConfig {
  /** Certificado X.509 en formato PEM */
  cert: string;
  /** Clave privada RSA en formato PEM (PKCS#1 o PKCS#8, encriptada o no). Tiene que corresponder a `cert`. */
  key: string;
  /** Contraseña de `key`, si está encriptada. */
  keyPassphrase?: string;
  /** Usar producción (default: false = testing/homologación) */
  production?: boolean;
  /**
   * URL del endpoint WSAA. Si se provee, ignora `production` para elegir la URL.
   * Tiene que ser `https://` (`http://` solo en loopback: `localhost`,
   * `127.0.0.0/8`, `::1`) y sin usuario ni contraseña.
   */
  endpoint?: string;
  /**
   * Vigencia del TRA en minutos (`expirationTime` del pedido), de 1 a 1440
   * (default: 10). No es la vida del Ticket de Acceso: WSAA emite cada TA con
   * su propio vencimiento, 12 horas desde su propia hora, sea cual sea la del
   * TRA. WSAA rechaza un `expirationTime` a más de 24 horas de su propia hora
   * (`xml.expirationTime.invalid`), así que el tope es 1438 minutos: deja 2
   * minutos de margen para un reloj local adelantado. Una vigencia corta acota
   * el lapso en que un TRA firmado (CMS) que se filtre sirve para pedir un TA.
   */
  tokenTTLMinutes?: number;
  /** Timeout en milisegundos (default: 30000) */
  timeout?: number;
  /**
   * Reintentos del login ante errores de red con certeza de que el request no
   * se envió (DNS, conexión rechazada; default: 1). Un timeout o un 5xx no se
   * reintentan: WSAA pudo haber emitido el TA.
   */
  retries?: number;
  /** Delay base para backoff exponencial en milisegundos (default: 1000) */
  retryDelayMs?: number;
  /** Callback de eventos */
  onEvent?: (event: ArcaEvent) => void;
  /**
   * Storage persistente de Tickets de Acceso. Sin storage, un reinicio del
   * proceso pierde el TA y WSAA rechaza el login siguiente durante un lapso
   * de retención (ver `ArcaTicketVigenteError`). Recomendado en producción.
   */
  ticketStorage?: TicketStorage;
  /**
   * Diferencia entre el reloj de ARCA y el local, en ms (`relojARCA - relojLocal`).
   * Se aplica al armar el TRA y al evaluar el vencimiento de los tickets. Default: 0.
   */
  clockOffsetMs?: number;
  /**
   * Si WSAA rechaza el TRA por `generationTime`/`expirationTime` (reloj local
   * desfasado), calcula el offset desde el header `Date` de la respuesta,
   * reintenta el login una vez y emite `auth:clock-skew`. Un offset calculado
   * de más de 24 horas no se aplica (se lanza el error original). Default: true.
   */
  autoClockSkew?: boolean;
  /**
   * Tras un login fallido por un error transitorio (`wsaa.*`,
   * `wsn.unavailable`, timeout, HTTP 5xx, respuesta ilegible, o un desfase de
   * reloj que persiste después de corregirlo), durante cuántos ms
   * `getAccessTicket` rechaza enseguida con `ArcaAuthError` (`retryable: true`,
   * `cause` = el error original) sin llamar a WSAA, como pide la
   * especificación. Default: 60000; 0 lo desactiva. No aplica a un TA vigente,
   * un abort ni un error de red sin enviar.
   * `clearTicket`/`clearAllTickets`/`resetLoginCooldown` limpian la espera.
   */
  loginErrorCooldownMs?: number;
  /**
   * Tras un login rechazado por un error que no se resuelve reintentando
   * (cualquier código `xml.*`, `cms.*`, `coe.*` o `wsn.*` salvo
   * `wsn.unavailable`: certificado vencido o no confiable, firma inválida,
   * servicio no autorizado, etc.), la especificación pide no solicitar nuevos
   * TA hasta corregir el problema: durante cuántos ms `getAccessTicket`
   * rechaza con `ArcaAuthError` (`retryable: false`) sin llamar a WSAA.
   * Default: `Infinity` (hasta `clearTicket`/`clearAllTickets`/`resetLoginCooldown`); 0 lo desactiva.
   */
  permanentErrorCooldownMs?: number;
  /**
   * Tras `coe.alreadyAuthenticated` sin un ticket utilizable, durante cuántos
   * ms `getAccessTicket` rechaza con `ArcaTicketVigenteError` sin llamar a
   * WSAA: un pedido dentro del lapso de retención vuelve a ser rechazado.
   * Default: el lapso del manual de WSAA, 120000 en producción y 600000 en
   * homologación; 0 lo desactiva.
   * `clearTicket`/`clearAllTickets`/`resetLoginCooldown` limpian la espera.
   */
  alreadyAuthenticatedCooldownMs?: number;
  /** `fetch` propio para los requests a WSAA. Default: `globalThis.fetch`. */
  fetch?: typeof fetch;
  /** Uso del transporte TLS legacy (ver `SoapCallOptions.legacyTls`). Default: `auto`. */
  legacyTls?: LegacyTlsMode;
  /** Tamaño máximo del body de una respuesta, en bytes (default: 52428800, 50 MB). */
  maxResponseBytes?: number;
}

/**
 * Cliente para el WSAA (Web Service de Autenticación y Autorización) de ARCA.
 * Maneja la creación del TRA, firma CMS/PKCS#7, login, y cache de tokens.
 *
 * Orden de búsqueda de un ticket: memoria → `ticketStorage` → login.
 * Los logins concurrentes para el mismo servicio se deduplican.
 */
export class WsaaClient {
  // Campos privados de ES (#): no aparecen en `util.inspect` ni en `JSON.stringify`.
  /** Certificado y clave parseados una sola vez (en el constructor). */
  readonly #credentials: ParsedCredentials;
  /** Tickets en memoria (token y sign son credenciales). */
  readonly #ticketCache = new Map<string, AccessTicket>();
  /** Storage de tickets (puede tenerlos en memoria, ej: `MemoryTicketStorage`). */
  readonly #storage?: TicketStorage;
  /** Logins en curso: una promesa resuelta muestra su valor (el ticket) en `util.inspect`. */
  readonly #pendingLogins = new Map<string, Promise<AccessTicket>>();
  /** URL de WSAA (LoginCms) que usa este cliente. */
  public readonly endpoint: string;
  /**
   * `true` si el cliente usa WSAA de producción. Con un `endpoint` propio, es
   * `true` si es la URL oficial de producción o si se configuró `production: true`.
   */
  public readonly production: boolean;
  private readonly tokenTTLMinutes: number;
  private readonly soapOpts: Pick<
    SoapCallOptions,
    'timeout' | 'retries' | 'retryDelayMs' | 'fetch' | 'legacyTls' | 'maxResponseBytes'
  >;
  private readonly onEvent?: (event: ArcaEvent) => void;
  private readonly autoClockSkew: boolean;
  private readonly keyPrefix: string;
  private readonly loginErrorCooldownMs: number;
  private readonly permanentErrorCooldownMs: number;
  private readonly alreadyAuthenticatedCooldownMs: number;
  private offsetMs: number;

  /**
   * Servicios para los que WSAA rechazó un login nuevo (alreadyAuthenticated)
   * mientras el ticket actual seguía vigente: hasta que venza, se usa ese
   * ticket en lugar de reintentar el login.
   */
  private readonly loginBlockedUntil = new Map<string, number>();
  /** Último login fallido por servicio, mientras dura su espera. */
  private readonly loginFailures = new Map<string, LoginFailure>();

  /**
   * @throws ArcaValidationError si el certificado o la clave son inválidos, si
   *   no se corresponden, si `tokenTTLMinutes` está fuera de rango o si
   *   `endpoint` no es una URL https.
   */
  constructor(config: WsaaClientConfig) {
    if (config.endpoint !== undefined) validateEndpoint(config.endpoint, 'endpoint');
    this.#credentials = parseCredentials(config.cert, config.key, config.keyPassphrase);
    this.endpoint = config.endpoint ?? (config.production ? WSAA_ENDPOINTS.production : WSAA_ENDPOINTS.testing);
    this.production =
      this.endpoint === WSAA_ENDPOINTS.production ||
      (this.endpoint !== WSAA_ENDPOINTS.testing && (config.production ?? false));
    this.tokenTTLMinutes = config.tokenTTLMinutes ?? DEFAULT_TOKEN_TTL_MINUTES;
    if (
      typeof this.tokenTTLMinutes !== 'number' ||
      !Number.isFinite(this.tokenTTLMinutes) ||
      this.tokenTTLMinutes < 1 ||
      this.tokenTTLMinutes > MAX_TOKEN_TTL_MINUTES
    ) {
      throw new ArcaValidationError(
        `tokenTTLMinutes inválido: ${String(config.tokenTTLMinutes)}. Debe estar entre 1 y ${MAX_TOKEN_TTL_MINUTES} ` +
          '(es la vigencia del TRA; WSAA rechaza más de 24 horas).',
        [
          {
            field: 'tokenTTLMinutes',
            message: `debe estar entre 1 y ${MAX_TOKEN_TTL_MINUTES}`,
            value: config.tokenTTLMinutes,
          },
        ],
        'tokenTTLMinutes',
      );
    }
    this.onEvent = config.onEvent;
    this.#storage = config.ticketStorage;
    this.autoClockSkew = config.autoClockSkew ?? true;
    this.offsetMs = config.clockOffsetMs ?? 0;
    this.loginErrorCooldownMs = Math.max(0, config.loginErrorCooldownMs ?? DEFAULT_LOGIN_ERROR_COOLDOWN_MS);
    this.permanentErrorCooldownMs = Math.max(0, config.permanentErrorCooldownMs ?? Infinity);
    this.alreadyAuthenticatedCooldownMs = Math.max(
      0,
      config.alreadyAuthenticatedCooldownMs ??
        ALREADY_AUTHENTICATED_COOLDOWN_MS[this.production ? 'production' : 'testing'],
    );
    this.soapOpts = {
      timeout: config.timeout,
      retries: config.retries,
      retryDelayMs: config.retryDelayMs,
      fetch: config.fetch,
      legacyTls: config.legacyTls,
      maxResponseBytes: config.maxResponseBytes,
    };
    this.keyPrefix = `${environmentLabel(this.endpoint)}:${certFingerprint(config.cert)}`;
  }

  /** Offset de reloj vigente (`relojARCA - relojLocal`, en ms). Puede cambiar si `autoClockSkew` lo ajusta. */
  get clockOffsetMs(): number {
    return this.offsetMs;
  }

  /** Hora actual según el reloj de ARCA (hora local + `clockOffsetMs`). */
  now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }

  /**
   * Key con la que se guarda el ticket de `service` en el `ticketStorage`:
   * `"{entorno}:{huella del certificado}:{servicio}"`.
   */
  ticketKey(service: string): string {
    return `${this.keyPrefix}:${service}`;
  }

  /**
   * Obtiene un Ticket de Acceso (TA) para el servicio indicado.
   *
   * El `signal` solo cancela la espera de este caller: un login en curso no se
   * aborta, porque un login que llega a WSAA y cuya respuesta se pierde deja
   * un TA vigente que no se puede recuperar, y WSAA rechaza los pedidos
   * repetidos durante un lapso de retención (ver `ArcaTicketVigenteError`).
   *
   * @throws ArcaValidationError si `service` no es un nombre de servicio válido.
   * @throws ArcaAuthError si el login falla (ver `faultCode`, `retryable` y
   *   `cause`), o si el servicio está en espera tras un login fallido.
   * @throws ArcaTicketVigenteError si WSAA indica que ya hay un TA vigente que
   *   no se encuentra, o si el servicio está en la espera posterior a ese rechazo.
   */
  async getAccessTicket(service: string, opts?: CallOptions): Promise<AccessTicket> {
    validateServiceName(service);
    const cached = this.#ticketCache.get(service);
    if (cached && (this.isTicketValid(cached) || this.isLoginBlocked(service, cached))) {
      safeEmit(this.onEvent, { type: 'auth:cache-hit', service, source: 'memory' });
      return cached;
    }

    let pending = this.#pendingLogins.get(service);
    if (!pending) {
      pending = this.resolveTicket(service).finally(() => {
        this.#pendingLogins.delete(service);
      });
      this.#pendingLogins.set(service, pending);
    }
    return raceWithSignal(pending, opts?.signal, (reason) => abortedBeforeSend('getAccessTicket', reason));
  }

  /**
   * Invalida el ticket de un servicio, en memoria y en el `ticketStorage`, y
   * limpia la espera tras un login fallido.
   *
   * Ojo: borrar un TA vigente no garantiza obtener otro: WSAA rechaza los
   * pedidos repetidos (`coe.alreadyAuthenticated`) durante un lapso de
   * retención. Para volver a intentar el login después de corregir un error,
   * sin borrar tickets, usá `resetLoginCooldown`.
   */
  async clearTicket(service: string): Promise<void> {
    this.#ticketCache.delete(service);
    this.loginBlockedUntil.delete(service);
    this.loginFailures.delete(service);
    await this.deleteFromStorage(service);
  }

  /**
   * Invalida todos los tickets que este cliente conoce (los que pasaron por
   * memoria en este proceso), también en el `ticketStorage`, y limpia las
   * esperas tras logins fallidos. Ver la advertencia de `clearTicket`.
   */
  async clearAllTickets(): Promise<void> {
    const services = [...this.#ticketCache.keys()];
    this.#ticketCache.clear();
    this.loginBlockedUntil.clear();
    this.loginFailures.clear();
    await Promise.all(services.map((s) => this.deleteFromStorage(s)));
  }

  /**
   * Limpia la espera tras un login fallido (de `service`, o de todos los
   * servicios), sin tocar los tickets: el próximo `getAccessTicket` vuelve a
   * llamar a WSAA. Usalo después de corregir la causa de un error no
   * reintentable (ej: renovar el certificado o autorizarlo para el servicio).
   */
  resetLoginCooldown(service?: string): void {
    if (service === undefined) this.loginFailures.clear();
    else this.loginFailures.delete(service);
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  /** Vigente con margen: se usa sin intentar renovarlo. */
  private isTicketValid(ticket: AccessTicket): boolean {
    return this.msToExpiry(ticket) > EXPIRY_MARGIN_MS;
  }

  /** Todavía no venció (sin margen): WSAA lo sigue aceptando. */
  private isTicketUsable(ticket: AccessTicket): boolean {
    return this.msToExpiry(ticket) > 0;
  }

  /** Ms hasta el vencimiento; `-Infinity` si es ilegible o vence a más de 24 horas (no plausible). */
  private msToExpiry(ticket: AccessTicket): number {
    const expires = Date.parse(ticket.expirationTime);
    if (!Number.isFinite(expires)) return -Infinity;
    const remaining = expires - this.now().getTime();
    return remaining > MAX_TA_LIFETIME_MS ? -Infinity : remaining;
  }

  private isLoginBlocked(service: string, ticket: AccessTicket): boolean {
    const until = this.loginBlockedUntil.get(service);
    return until !== undefined && until > Date.now() && this.isTicketUsable(ticket);
  }

  private async resolveTicket(service: string): Promise<AccessTicket> {
    const stored = await this.readFromStorage(service);
    if (stored && this.isTicketValid(stored)) {
      this.#ticketCache.set(service, stored);
      safeEmit(this.onEvent, { type: 'auth:cache-hit', service, source: 'storage' });
      return stored;
    }

    // Ticket por vencer (dentro del margen): se intenta renovar, pero si WSAA
    // todavía no lo permite se sigue usando hasta su vencimiento real.
    const expiring = [this.#ticketCache.get(service), stored].find(
      (t): t is AccessTicket => t != null && this.isTicketUsable(t),
    );

    // Login fallido hace poco: WSAA pide no reintentar enseguida.
    const failure = this.loginFailures.get(service);
    if (failure) {
      const remaining = failure.until - Date.now();
      if (remaining > 0) {
        if (expiring) {
          this.#ticketCache.set(service, expiring);
          safeEmit(this.onEvent, { type: 'auth:cache-hit', service, source: 'memory' });
          return expiring;
        }
        throw cooldownError(service, failure, remaining);
      }
      this.loginFailures.delete(service);
    }

    let ticket: AccessTicket;
    try {
      ticket = await this.loginWithClockSkew(service);
    } catch (error) {
      if (isAlreadyAuthenticated(error)) {
        // Otro proceso pudo haber guardado un ticket nuevo mientras nos logueábamos.
        const found = await this.findUsableTicket(service, expiring);
        if (found) {
          const { ticket: usable, source } = found;
          this.#ticketCache.set(service, usable);
          if (!this.isTicketValid(usable)) {
            this.loginBlockedUntil.set(service, Date.now() + this.msToExpiry(usable));
          }
          safeEmit(this.onEvent, { type: 'auth:cache-hit', service, source });
          return usable;
        }
        const waitMs = this.alreadyAuthenticatedCooldownMs;
        if (waitMs > 0) this.loginFailures.set(service, { until: Date.now() + waitMs, error, kind: 'vigente' });
        throw new ArcaTicketVigenteError(service, { cause: error, retryAfterMs: waitMs > 0 ? waitMs : undefined });
      }
      const kind = classifyLoginError(error);
      const waitMs =
        kind === 'permanent' ? this.permanentErrorCooldownMs : kind === 'transient' ? this.loginErrorCooldownMs : 0;
      if (kind !== 'none' && waitMs > 0) {
        this.loginFailures.set(service, { until: Date.now() + waitMs, error, kind });
      }
      if (error instanceof ArcaAuthError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      const advice =
        kind === 'permanent'
          ? '. Es un error que no se resuelve reintentando: corregí la causa (certificado, autorización del ' +
            `servicio en ARCA, configuración) y llamá a resetLoginCooldown("${service}") para volver a intentar`
          : '';
      throw new ArcaAuthError(`WSAA login falló para servicio "${service}": ${msg}${advice}`, {
        cause: error,
        ...errorFields(error),
        retryable: kind !== 'permanent',
      });
    }

    this.#ticketCache.set(service, ticket);
    this.loginBlockedUntil.delete(service);
    await this.writeToStorage(service, ticket);
    return ticket;
  }

  /**
   * Tras `coe.alreadyAuthenticated`: relee el storage unas pocas veces (otro
   * proceso puede estar por guardar el TA que obtuvo) y, si no aparece, usa el
   * ticket por vencer que ya teníamos.
   */
  private async findUsableTicket(
    service: string,
    expiring: AccessTicket | undefined,
  ): Promise<{ ticket: AccessTicket; source: 'memory' | 'storage' } | undefined> {
    const delays = this.#storage ? ALREADY_AUTHENTICATED_REREAD_DELAYS_MS : [];
    for (let i = 0; i < delays.length; i++) {
      if (delays[i] > 0) await delay(delays[i]);
      const again = await this.readFromStorage(service);
      if (again && this.isTicketUsable(again)) return { ticket: again, source: 'storage' };
      // Si ya tenemos un ticket utilizable no hace falta esperar más.
      if (expiring && this.isTicketUsable(expiring)) return { ticket: expiring, source: 'memory' };
    }
    if (expiring && this.isTicketUsable(expiring)) return { ticket: expiring, source: 'memory' };
    return undefined;
  }

  private async loginWithClockSkew(service: string): Promise<AccessTicket> {
    try {
      return await this.performLogin(service);
    } catch (error) {
      if (!this.autoClockSkew || !isClockSkewError(error)) throw error;
      const responseDate = (error as ArcaSoapError).responseDate;
      if (!responseDate) throw error;

      // Un desfase de más de 24 horas no es un reloj corrido sino un header `Date` absurdo: no se aplica.
      const offsetMs = responseDate.getTime() - Date.now();
      if (Math.abs(offsetMs) > MAX_AUTO_CLOCK_OFFSET_MS) throw error;

      const previousOffsetMs = this.offsetMs;
      this.offsetMs = offsetMs;
      safeEmit(this.onEvent, { type: 'auth:clock-skew', service, offsetMs: this.offsetMs, previousOffsetMs });
      try {
        return await this.performLogin(service);
      } catch (retryError) {
        // Si vuelve a fallar por el reloj, ya no es un desfase que se corrige solo: inicia la espera.
        if (retryError !== null && typeof retryError === 'object') skewRetryFailures.add(retryError);
        throw retryError;
      }
    }
  }

  private async performLogin(service: string): Promise<AccessTicket> {
    const start = Date.now();
    const traXml = this.createTRA(service);
    const cms = this.signTRA(traXml);

    const bodyContent = `<loginCms xmlns="${WSAA_NAMESPACE}"><in0>${cms}</in0></loginCms>`;

    // Solo se reintenta si es seguro que el request no se envió: un login que
    // llega a WSAA y cuya respuesta se pierde deja un TA vigente inaccesible.
    const parsed = await soapCallWith(
      this.endpoint,
      bodyContent,
      { ...this.soapOpts, soapAction: '', onEvent: this.onEvent, methodName: 'loginCms' },
      isNotSent,
    );

    const ticket = this.parseLoginResponse(parsed);
    ticket.service = service;

    safeEmit(this.onEvent, {
      type: 'auth:login',
      service,
      durationMs: Date.now() - start,
    });

    return ticket;
  }

  private async readFromStorage(service: string): Promise<AccessTicket | null> {
    if (!this.#storage) return null;
    try {
      const raw = await this.#storage.get(this.ticketKey(service), {
        onError: (error) => this.emitStorageError(service, 'get', error),
      });
      return normalizeAccessTicket(raw);
    } catch (error) {
      this.emitStorageError(service, 'get', error);
      return null;
    }
  }

  private async writeToStorage(service: string, ticket: AccessTicket): Promise<void> {
    if (!this.#storage) return;
    try {
      await this.#storage.set(this.ticketKey(service), ticket);
    } catch (error) {
      // El ticket sigue siendo válido en memoria; no fallar la operación.
      this.emitStorageError(service, 'set', error);
    }
  }

  private async deleteFromStorage(service: string): Promise<void> {
    if (!this.#storage?.delete) return;
    try {
      await this.#storage.delete(this.ticketKey(service));
    } catch (error) {
      this.emitStorageError(service, 'delete', error);
    }
  }

  private emitStorageError(service: string, operation: 'get' | 'set' | 'delete', error: unknown): void {
    safeEmit(this.onEvent, {
      type: 'auth:storage-error',
      service,
      operation,
      error: error instanceof Error ? error : String(error),
    });
  }

  private parseLoginResponse(parsed: Record<string, unknown>): AccessTicket {
    // Los Faults (HTTP 500 o 200) se lanzan como ArcaSoapError con faultCode/faultString.
    const response = extractMethodResult(parsed, 'loginCms');
    const loginReturn = response['loginCmsReturn'] ?? response['return'];
    if (typeof loginReturn !== 'string' || !loginReturn) {
      throw new ArcaAuthError('Respuesta WSAA inválida: falta loginCmsReturn', { retryable: true });
    }
    return this.parseAccessTicket(loginReturn);
  }

  private parseAccessTicket(xml: string): AccessTicket {
    const invalid = (msg: string) => new ArcaAuthError(`Access ticket inválido: ${msg}`, { retryable: true });
    let parsed: Record<string, unknown>;
    try {
      parsed = parseXml(xml, { parseNumbers: false });
    } catch {
      throw invalid('XML ilegible');
    }
    const loginTicketResponse = parsed['loginTicketResponse'] as Record<string, unknown> | undefined;
    if (!loginTicketResponse || typeof loginTicketResponse !== 'object') {
      throw invalid('falta loginTicketResponse');
    }

    const credentials = loginTicketResponse['credentials'] as Record<string, unknown> | undefined;
    if (!credentials || typeof credentials !== 'object') {
      throw invalid('falta credentials');
    }

    const header = loginTicketResponse['header'] as Record<string, unknown> | undefined;

    const token = credentials['token'];
    const sign = credentials['sign'];

    if (typeof token !== 'string' || !token || typeof sign !== 'string' || !sign) {
      throw invalid('falta token o sign');
    }

    const ticket = normalizeAccessTicket({
      token,
      sign,
      // Sin vencimiento en la respuesta: la vida de un TA según el manual (12 horas).
      expirationTime: header?.['expirationTime'] ?? new Date(this.now().getTime() + DEFAULT_TA_LIFETIME_MS),
      generationTime: header?.['generationTime'],
    });
    if (!ticket) {
      throw invalid('expirationTime ilegible');
    }
    const remaining = Date.parse(ticket.expirationTime) - this.now().getTime();
    if (remaining <= 0) {
      throw invalid(`expirationTime (${ticket.expirationTime}) no es posterior a la hora actual`);
    }
    if (remaining > MAX_TA_LIFETIME_MS) {
      throw invalid(`expirationTime (${ticket.expirationTime}) está a más de 24 horas de la hora actual`);
    }
    return ticket;
  }

  /**
   * Crea el Ticket de Requerimiento de Acceso (TRA) XML.
   */
  private createTRA(service: string): string {
    const now = this.now();
    // `uniqueId` es xsd:unsignedInt (32 bits) en la spec de WSAA: un valor al
    // azar evita colisiones entre TRAs generados en el mismo segundo.
    const uniqueId = randomInt(1, 0x1_0000_0000);
    const generationTime = new Date(now.getTime() - TRA_GENERATION_OFFSET_MS).toISOString();
    // WSAA rechaza un expirationTime a más de 24 horas de su propia hora (no la
    // del generationTime): el margen cubre un reloj local levemente adelantado.
    const ttlMs = Math.min(this.tokenTTLMinutes * 60_000, MAX_TOKEN_TTL_MINUTES * 60_000 - TRA_GENERATION_OFFSET_MS);
    const expirationTime = new Date(now.getTime() + ttlMs).toISOString();

    const tra = {
      loginTicketRequest: {
        '@_version': '1.0',
        header: {
          uniqueId,
          generationTime,
          expirationTime,
        },
        service,
      },
    };

    return `<?xml version="1.0" encoding="UTF-8"?>\n${buildXml(tra)}`;
  }

  /**
   * Firma el TRA con CMS/PKCS#7 usando el certificado y la clave privada.
   */
  private signTRA(traXml: string): string {
    const { certificate, privateKey } = this.#credentials;

    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(traXml, 'utf8');
    p7.addCertificate(certificate);
    p7.addSigner({
      key: privateKey,
      certificate,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        {
          type: forge.pki.oids.contentType,
          value: forge.pki.oids.data,
        },
        {
          type: forge.pki.oids.messageDigest,
        },
        {
          type: forge.pki.oids.signingTime,
          // node-forge tipa `value` como string, pero para signingTime espera un Date.
          value: this.now() as unknown as string,
        },
      ],
    });
    p7.sign();

    const asn1 = p7.toAsn1();
    const der = forge.asn1.toDer(asn1);
    return forge.util.encode64(der.getBytes());
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function environmentLabel(endpoint: string): string {
  if (endpoint === WSAA_ENDPOINTS.production) return 'prod';
  if (endpoint === WSAA_ENDPOINTS.testing) return 'homo';
  return createHash('sha256').update(endpoint).digest('hex').slice(0, 8);
}

/** Huella corta del certificado: identifica al emisor sin exponer el PEM. */
function certFingerprint(pem: string): string {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return createHash('sha256').update(body).digest('hex').slice(0, 16);
}

function faultText(error: unknown): string {
  if (!(error instanceof ArcaSoapError)) return '';
  return `${error.faultCode ?? ''} ${error.faultString ?? ''}`;
}

/** WSAA: "coe.alreadyAuthenticated: El CEE ya posee un TA valido para el acceso al WSN solicitado". */
function isAlreadyAuthenticated(error: unknown): boolean {
  return /alreadyAuthenticated|ya posee un TA/i.test(faultText(error));
}

/**
 * Errores de WSAA (spec 1.2.2) que indican un reloj local desfasado:
 * - `xml.generationTime.invalid`: generationTime posterior a la hora de WSAA o
 *   demasiado antiguo.
 * - `xml.expirationTime.expired`: expirationTime anterior a la hora de WSAA.
 *
 * No incluye `xml.expirationTime.invalid` (vigencia pedida mayor a 24 horas):
 * es un error de configuración (`tokenTTLMinutes`), no del reloj.
 */
function isClockSkewError(error: unknown): boolean {
  if (!(error instanceof ArcaSoapError)) return false;
  const code = error.faultCode ?? '';
  if (/generationTime\.invalid|expirationTime\.expired/i.test(code)) return true;
  if (/expirationTime\.invalid/i.test(code)) return false;
  // Sin código reconocible: se mira el texto del Fault.
  const text = error.faultString ?? '';
  return /generationTime/i.test(text) || /expirationTime posee una fecha anterior/i.test(text);
}

/** Errores de reloj que siguieron después de corregir el offset (ver `loginWithClockSkew`). */
const skewRetryFailures = new WeakSet<object>();

/** Error de red con certeza de que el request no se envió (DNS, conexión rechazada, TLS). */
function isNotSent(error: ArcaSoapError): boolean {
  return !error.uncertain && !error.aborted && error.statusCode === undefined && error.faultString === undefined;
}

/** Nombre local de un `faultcode` (`ns1:cms.cert.expired` → `cms.cert.expired`). */
function localFaultCode(faultCode: string | undefined): string {
  return faultCode ? faultCode.slice(faultCode.lastIndexOf(':') + 1) : '';
}

/**
 * Qué espera inicia un login fallido (spec de WSAA 1.2.2):
 * - `permanent`: el error no se resuelve reintentando (`xml.*`, `cms.*`,
 *   `coe.*`, `wsn.*` salvo `wsn.unavailable`): no pedir más TA hasta corregirlo.
 * - `transient`: `wsaa.*`, `wsn.unavailable`, timeout, HTTP 5xx, respuesta
 *   ilegible, Fault sin código conocido, o desfase de reloj que sigue después
 *   de corregir el offset.
 * - `none`: no tiene que ver con el TRA enviado: abort del caller, error de
 *   red sin enviar, o desfase de reloj (se corrige solo o lo corrige el usuario).
 */
function classifyLoginError(error: unknown): 'none' | 'transient' | 'permanent' {
  if (!(error instanceof ArcaSoapError)) return 'transient';
  if (error.aborted || isNotSent(error)) return 'none';
  if (isClockSkewError(error)) return skewRetryFailures.has(error) ? 'transient' : 'none';
  const code = localFaultCode(error.faultCode);
  if (/^wsaa\./i.test(code) || /^wsn\.unavailable$/i.test(code)) return 'transient';
  if (/^(xml|cms|coe|wsn)\./i.test(code)) return 'permanent';
  return 'transient';
}

/** `faultCode`/`statusCode` del error de WSAA, para `ArcaAuthError`. */
function errorFields(error: unknown): { faultCode?: string; statusCode?: number } {
  if (error instanceof ArcaSoapError || error instanceof ArcaAuthError) {
    return { faultCode: error.faultCode, statusCode: error.statusCode };
  }
  return {};
}

interface LoginFailure {
  until: number;
  error: unknown;
  /**
   * `transient`: espera de `loginErrorCooldownMs`; `permanent`: error no
   * reintentable, espera de `permanentErrorCooldownMs`; `vigente`:
   * `coe.alreadyAuthenticated`, espera de `alreadyAuthenticatedCooldownMs`.
   */
  kind: 'transient' | 'permanent' | 'vigente';
}

function cooldownError(service: string, failure: LoginFailure, remainingMs: number): ArcaAuthError {
  if (failure.kind === 'vigente') {
    return new ArcaTicketVigenteError(service, { cause: failure.error, retryAfterMs: remainingMs });
  }
  const msg = failure.error instanceof Error ? failure.error.message : String(failure.error);
  const fields = errorFields(failure.error);
  if (failure.kind === 'permanent') {
    const until = Number.isFinite(remainingMs)
      ? ` (o durante ${Math.ceil(remainingMs / 1000)}s más, permanentErrorCooldownMs)`
      : '';
    return new ArcaAuthError(
      `WSAA rechazó el login para servicio "${service}" con un error que no se resuelve reintentando; ` +
        'no se piden nuevos tickets para este servicio hasta corregir la causa y llamar a ' +
        `resetLoginCooldown("${service}"), clearTicket("${service}") o clearAllTickets()${until}: ${msg}`,
      { cause: failure.error, ...fields, retryable: false },
    );
  }
  return new ArcaAuthError(
    `WSAA login para servicio "${service}" falló recientemente; no se reintenta por ` +
      `${Math.ceil(remainingMs / 1000)}s más (loginErrorCooldownMs): ${msg}`,
    { cause: failure.error, ...fields, retryable: true },
  );
}

/** @throws ArcaValidationError si `service` no es un nombre de servicio de WSAA válido. */
function validateServiceName(service: string): void {
  if (typeof service !== 'string' || !SERVICE_NAME_RE.test(service)) {
    throw new ArcaValidationError(
      `Nombre de servicio WSAA inválido: "${String(service)}". Debe empezar con una letra y tener de 3 a 32 ` +
        'letras, dígitos, "_" o "-" ' +
        '(ej: "wsfe", "ws_sr_padron_a13").',
      [{ field: 'service', message: 'nombre de servicio inválido', value: service }],
      'service',
    );
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function raceWithSignal<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  toError: (reason: unknown) => Error,
): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(toError(signal.reason));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(toError(signal.reason));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}
