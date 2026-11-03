import { EventEmitter } from 'node:events';
import { WSAA_ENDPOINTS } from './constants.js';
import { validateEndpoint } from './endpoint.js';
import { ArcaResponseError, ArcaValidationError } from './errors.js';
import { anySignal } from './signals.js';
import { arcaSoapCall, safeEmit } from './soap-client.js';
import type { ArcaSoapCallOptions } from './soap-client.js';
import type {
  AccessTicket,
  ArcaBaseConfig,
  ArcaEvent,
  CallOptions,
  ServerStatus,
  SoapCallOptions,
  SoapOperationKind,
} from './types.js';
import { validateCuit } from './validators.js';
import { WsaaClient } from './wsaa.js';

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

/** Opciones de transporte que un SDK pasa a cada llamada SOAP. */
export type ServiceTransport = Pick<
  SoapCallOptions,
  'timeout' | 'retries' | 'retryDelayMs' | 'onEvent' | 'fetch' | 'legacyTls' | 'maxResponseBytes'
>;

/** URLs de un servicio por entorno. */
export interface EnvEndpoints {
  production: string;
  testing: string;
}

/**
 * Configuración común de las clases principales de los SDKs (`ArcaSdkBase`).
 * Cada SDK la extiende con sus endpoints y opciones propias.
 */
export interface ArcaSdkConfig extends ArcaBaseConfig {
  /**
   * `WsaaClient` compartido con otros SDKs que usan el mismo certificado (ej:
   * `facturacion.wsaa`). Si se pasa, se ignoran `cert`, `key`, `keyPassphrase`,
   * `tokenTTLMinutes`, `ticketStorage`, `clockOffsetMs`, `autoClockSkew`,
   * `loginErrorCooldownMs`, `permanentErrorCooldownMs`,
   * `alreadyAuthenticatedCooldownMs` y `endpoints.wsaa`, y
   * sus eventos los emite la instancia que lo creó. Su entorno
   * (`wsaa.production`) tiene que coincidir con `production`.
   */
  wsaa?: WsaaClient;
  /** Signal global: cancela todas las llamadas de esta instancia (ej: al apagar la app). */
  signal?: AbortSignal;
  /**
   * URLs propias (proxy, mock). Las que no se indiquen usan las oficiales según
   * `production`. Tienen que ser `https://` (`http://` solo en loopback: `localhost`,
   * `127.0.0.0/8`, `::1`) y sin usuario ni contraseña.
   */
  endpoints?: { wsaa?: string };
}

/** Arma un `WsaaClient` con las opciones de WSAA de una config de SDK. */
export function createWsaaClient(
  config: ArcaBaseConfig & { endpoints?: { wsaa?: string } },
  onEvent?: (event: ArcaEvent) => void,
): WsaaClient {
  return new WsaaClient({
    cert: config.cert,
    key: config.key,
    keyPassphrase: config.keyPassphrase,
    production: config.production ?? false,
    endpoint: config.endpoints?.wsaa,
    tokenTTLMinutes: config.tokenTTLMinutes,
    timeout: config.timeout,
    retries: config.retries,
    retryDelayMs: config.retryDelayMs,
    onEvent: onEvent ?? config.onEvent,
    ticketStorage: config.ticketStorage,
    clockOffsetMs: config.clockOffsetMs,
    autoClockSkew: config.autoClockSkew,
    loginErrorCooldownMs: config.loginErrorCooldownMs,
    permanentErrorCooldownMs: config.permanentErrorCooldownMs,
    alreadyAuthenticatedCooldownMs: config.alreadyAuthenticatedCooldownMs,
    fetch: config.fetch,
    legacyTls: config.legacyTls,
    maxResponseBytes: config.maxResponseBytes,
  });
}

/** Opciones de transporte de una config de SDK. */
export function transportOptions(
  config: Pick<
    ArcaBaseConfig,
    'timeout' | 'retries' | 'retryDelayMs' | 'onEvent' | 'fetch' | 'legacyTls' | 'maxResponseBytes'
  >,
  onEvent?: (event: ArcaEvent) => void,
): ServiceTransport {
  return {
    timeout: config.timeout,
    retries: config.retries,
    retryDelayMs: config.retryDelayMs,
    onEvent: onEvent ?? config.onEvent,
    fetch: config.fetch,
    legacyTls: config.legacyTls,
    maxResponseBytes: config.maxResponseBytes,
  };
}

// ---------------------------------------------------------------------------
// Clase base de los SDKs
// ---------------------------------------------------------------------------

/**
 * Base de las clases principales de los SDKs (`ArcaCdc`, `ArcaSire`...).
 *
 * Resuelve lo que todos repiten: valida la CUIT representada, crea (o
 * reutiliza) el `WsaaClient`, arma las opciones de transporte, reparte los
 * eventos a `config.onEvent` y a los suscriptos con `on()`, combina el
 * `signal` global con el de cada llamada y elige los endpoints por entorno.
 *
 * `services` mapea un nombre corto de cada servicio del SDK a su id de WSAA
 * (ej: `{ cpe: 'wscpe', lpg: 'wslpg' }`).
 */
export abstract class ArcaSdkBase<TService extends string = string> {
  /** Cliente WSAA (se puede compartir con otros SDKs vía `config.wsaa`). */
  public readonly wsaa: WsaaClient;
  /** CUIT representada, normalizada a 11 dígitos. */
  public readonly cuit: string;
  /** `true` en producción, `false` en homologación. */
  public readonly production: boolean;

  /** Opciones de transporte para los clientes de bajo nivel. */
  protected readonly transport: ServiceTransport;

  readonly #emitter = new EventEmitter();
  readonly #signal?: AbortSignal;
  readonly #services: Readonly<Record<TService, string>>;

  /**
   * @throws ArcaValidationError si la CUIT es inválida, si el certificado o la
   *   clave son inválidos, si `config.wsaa` es de otro entorno que `production`
   *   o si algún `endpoints.*` no es una URL https.
   */
  constructor(config: ArcaSdkConfig, services: Readonly<Record<TService, string>>) {
    this.cuit = validateCuit(config.cuit);
    for (const [name, url] of Object.entries(config.endpoints ?? {})) {
      if (url !== undefined) validateEndpoint(url, `endpoints.${name}`);
    }
    this.production = config.production ?? false;
    if (config.wsaa) checkSharedWsaa(config.wsaa, this.production);
    this.#signal = config.signal;
    this.#services = services;

    const emit = (event: ArcaEvent) => {
      safeEmit(config.onEvent, event);
      safeEmit((e) => this.#emitter.emit(e.type, e), event);
    };
    this.wsaa = config.wsaa ?? createWsaaClient(config, emit);
    this.transport = transportOptions(config, emit);
  }

  /** Endpoint del servicio según el entorno, salvo que se indique uno propio. */
  protected endpoint(defaults: EnvEndpoints, override?: string): string {
    return override ?? (this.production ? defaults.production : defaults.testing);
  }

  /**
   * Opciones de llamada para los clientes de bajo nivel: sólo el `signal`, con
   * el global combinado con el de la llamada (las demás claves de `opts`, ej:
   * opciones propias de un método, no se reenvían).
   */
  protected callOptions(opts?: CallOptions): CallOptions {
    const signal = anySignal(this.#signal, opts?.signal);
    return signal ? { signal } : {};
  }

  /** Ticket de Acceso del servicio (de cache, storage o login a WSAA). */
  protected ticket(service: TService, opts?: CallOptions): Promise<AccessTicket> {
    return this.wsaa.getAccessTicket(this.#services[service], this.callOptions(opts));
  }

  /**
   * Suscribirse a eventos del SDK (`auth:*`, `request:*`). Los errores de los
   * handlers se ignoran.
   */
  on(event: ArcaEvent['type'], handler: (event: ArcaEvent) => void): this {
    this.#emitter.on(event, handler);
    return this;
  }

  /** Desuscribirse de un evento. */
  off(event: ArcaEvent['type'], handler: (event: ArcaEvent) => void): this {
    this.#emitter.off(event, handler);
    return this;
  }

  /** Invalida los tickets de acceso (memoria y `ticketStorage`) de los servicios de este SDK. */
  async clearAuthCache(): Promise<void> {
    await Promise.all(Object.values<string>(this.#services).map((id) => this.wsaa.clearTicket(id)));
  }
}

/**
 * Un `WsaaClient` compartido tiene que ser del mismo entorno que el SDK: un TA
 * de homologación no sirve en producción (y al revés). Con un endpoint WSAA
 * propio (proxy, mock) no se puede saber, así que no se valida.
 */
function checkSharedWsaa(wsaa: WsaaClient, production: boolean): void {
  const official = wsaa.endpoint === WSAA_ENDPOINTS.production || wsaa.endpoint === WSAA_ENDPOINTS.testing;
  if (!official || wsaa.production === production) return;
  const env = (prod: boolean) => (prod ? 'producción' : 'homologación');
  throw new ArcaValidationError(
    `El WsaaClient compartido (config.wsaa) es de ${env(wsaa.production)} pero el SDK está configurado para ` +
      `${env(production)} (production: ${production}). Usá el mismo valor de production en los dos.`,
    [{ field: 'wsaa', message: 'entorno distinto al del SDK', value: { wsaa: wsaa.production, production } }],
    'wsaa',
  );
}

// ---------------------------------------------------------------------------
// Clientes de bajo nivel
// ---------------------------------------------------------------------------

/**
 * Configuración pública de los clientes de bajo nivel de todos los SDKs
 * (`new WsfeClient({ endpoint, transport })`, `new CdcClient(...)`, etc.): el
 * namespace lo fija cada cliente.
 */
export interface ServiceClientConfig {
  /**
   * URL del servicio (ver `ENDPOINTS` de cada SDK). Tiene que ser `https://`
   * (`http://` solo en loopback) y sin usuario ni contraseña.
   */
  endpoint: string;
  /** Opciones de transporte (timeout, reintentos, eventos, fetch, TLS legacy, tamaño máximo de respuesta). */
  transport?: ServiceTransport;
}

/** Configuración de un `SoapServiceClient`: la de `ServiceClientConfig` más el namespace del WSDL. */
export interface SoapServiceClientConfig extends ServiceClientConfig {
  /** Namespace del WSDL. */
  namespace: string;
}

/** Opciones de `SoapServiceClient.soapCall`. */
export interface ServiceCallOptions
  extends Pick<
    ArcaSoapCallOptions,
    'requestElement' | 'responseElement' | 'qualified' | 'soapAction' | 'soapActionFromMethod' | 'parseNumbers'
  > {
  /** Tipo de operación (default: `consulta`). Las emisiones nunca se reintentan. */
  kind?: SoapOperationKind;
  signal?: AbortSignal;
}

/**
 * Base de los clientes SOAP de bajo nivel de cada servicio: guarda endpoint,
 * namespace y transporte, y llama a `arcaSoapCall` con ellos.
 */
export abstract class SoapServiceClient {
  public readonly endpoint: string;
  public readonly namespace: string;
  protected readonly transport: ServiceTransport;

  /** @throws ArcaValidationError si `endpoint` no es una URL https. */
  constructor(config: SoapServiceClientConfig) {
    validateEndpoint(config.endpoint, 'endpoint');
    this.endpoint = config.endpoint;
    this.namespace = config.namespace;
    this.transport = config.transport ?? {};
  }

  /** Llama a un método del servicio y devuelve su resultado desenvuelto. */
  protected soapCall(
    method: string,
    params: Record<string, unknown>,
    opts: ServiceCallOptions = {},
  ): Promise<Record<string, unknown>> {
    return arcaSoapCall(this.endpoint, this.namespace, method, params, {
      ...this.transport,
      ...opts,
      kind: opts.kind ?? 'consulta',
    });
  }
}

/**
 * Convierte la respuesta de un método `dummy` (`appserver`/`dbserver`/
 * `authserver`, en cualquier capitalización: `AppServer` en los servicios
 * ASMX) en un `ServerStatus`. Los valores quedan tal cual los devolvió el
 * servicio (ver `serverStatusOk`).
 *
 * @throws ArcaResponseError si falta alguno de los tres campos o la respuesta no es un objeto.
 */
export function parseServerStatus(result: Record<string, unknown>, method = 'dummy'): ServerStatus {
  if (result === null || typeof result !== 'object') {
    throw new ArcaResponseError(`Respuesta inválida de ${method}: no es un objeto`);
  }
  const byLower = new Map(Object.keys(result).map((k) => [k.toLowerCase(), result[k]]));
  const field = (name: keyof ServerStatus): string => {
    const value = byLower.get(name);
    if (value === undefined || value === null || value === '' || typeof value === 'object') {
      throw new ArcaResponseError(`Respuesta inválida de ${method}: falta ${name}`);
    }
    return String(value);
  };
  return { appserver: field('appserver'), dbserver: field('dbserver'), authserver: field('authserver') };
}

/**
 * `true` si todos los servidores informados (`appserver`, `dbserver`,
 * `authserver` y cualquier otro campo de texto) están en `OK` (sin distinguir
 * mayúsculas).
 */
export function serverStatusOk(status: ServerStatus): boolean {
  const values = Object.values(status as unknown as Record<string, unknown>).filter((v) => typeof v === 'string');
  return values.length > 0 && values.every((v) => (v as string).trim().toUpperCase() === 'OK');
}

// ---------------------------------------------------------------------------
// Estado de varios servicios
// ---------------------------------------------------------------------------

/**
 * Estado de un servicio dentro de un `status()` de varios servicios. `ok` es
 * `true` solo si el servicio respondió y todos sus servidores están en `OK`; si
 * respondió con algún servidor caído, `status` tiene los valores informados.
 */
export type ServiceStatus = { ok: true; status: ServerStatus } | { ok: false; error: Error; status?: ServerStatus };

/**
 * Consulta el estado de varios servicios en paralelo. Una falla de uno no
 * impide conocer el de los demás: cada uno queda como `{ ok: true, status }`,
 * `{ ok: false, error, status }` (respondió con algún servidor que no está en
 * `OK`) o `{ ok: false, error }` (no respondió).
 */
export async function statusOf<K extends string>(
  checks: Record<K, () => Promise<ServerStatus>>,
): Promise<Record<K, ServiceStatus>> {
  const keys = Object.keys(checks) as K[];
  const results = await Promise.allSettled(keys.map((k) => checks[k]()));
  const out = {} as Record<K, ServiceStatus>;
  keys.forEach((k, i) => {
    const r = results[i];
    if (r.status === 'rejected') {
      out[k] = { ok: false, error: r.reason instanceof Error ? r.reason : new Error(String(r.reason)) };
    } else if (serverStatusOk(r.value)) {
      out[k] = { ok: true, status: r.value };
    } else {
      const detail = Object.entries(r.value as unknown as Record<string, unknown>)
        .map(([name, value]) => `${name}=${String(value)}`)
        .join(', ');
      out[k] = {
        ok: false,
        status: r.value,
        error: new ArcaResponseError(`${k}: servidores no disponibles (${detail})`),
      };
    }
  });
  return out;
}
