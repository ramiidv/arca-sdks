import { EventEmitter } from 'node:events';
import { ArcaSoapError } from './errors.js';
import { anySignal } from './signals.js';
import { afipSoapCall, safeEmit } from './soap-client.js';
import type { AfipSoapCallOptions } from './soap-client.js';
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
  'timeout' | 'retries' | 'retryDelayMs' | 'onEvent' | 'fetch' | 'legacyTls'
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
   * `facturacion.wsaa`). Si se pasa, se ignoran `cert`, `key`,
   * `tokenTTLMinutes`, `ticketStorage`, `clockOffsetMs`, `autoClockSkew`,
   * `loginErrorCooldownMs` y `endpoints.wsaa`, y sus eventos los emite la
   * instancia que lo creó.
   */
  wsaa?: WsaaClient;
  /** Signal global: cancela todas las llamadas de esta instancia (ej: al apagar la app). */
  signal?: AbortSignal;
  /** URLs propias (proxy, mock). Las que no se indiquen usan las oficiales según `production`. */
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
    fetch: config.fetch,
    legacyTls: config.legacyTls,
  });
}

/** Opciones de transporte de una config de SDK. */
export function transportOptions(
  config: Pick<ArcaBaseConfig, 'timeout' | 'retries' | 'retryDelayMs' | 'onEvent' | 'fetch' | 'legacyTls'>,
  onEvent?: (event: ArcaEvent) => void,
): ServiceTransport {
  return {
    timeout: config.timeout,
    retries: config.retries,
    retryDelayMs: config.retryDelayMs,
    onEvent: onEvent ?? config.onEvent,
    fetch: config.fetch,
    legacyTls: config.legacyTls,
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

  /** @throws ArcaValidationError si la CUIT es inválida. */
  constructor(config: ArcaSdkConfig, services: Readonly<Record<TService, string>>) {
    this.cuit = validateCuit(config.cuit);
    this.production = config.production ?? false;
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

// ---------------------------------------------------------------------------
// Clientes de bajo nivel
// ---------------------------------------------------------------------------

/** Configuración de un `SoapServiceClient`. */
export interface SoapServiceClientConfig {
  /** URL del servicio. */
  endpoint: string;
  /** Namespace del WSDL. */
  namespace: string;
  /** Opciones de transporte (timeout, reintentos, eventos, fetch, TLS legacy). */
  transport?: ServiceTransport;
}

/** Opciones de `SoapServiceClient.soapCall`. */
export interface ServiceCallOptions
  extends Pick<
    AfipSoapCallOptions,
    'requestElement' | 'responseElement' | 'qualified' | 'soapAction' | 'soapActionFromMethod' | 'parseNumbers'
  > {
  /** Tipo de operación (default: `consulta`). Las emisiones nunca se reintentan. */
  kind?: SoapOperationKind;
  signal?: AbortSignal;
}

/**
 * Base de los clientes SOAP de bajo nivel de cada servicio: guarda endpoint,
 * namespace y transporte, y llama a `afipSoapCall` con ellos.
 */
export abstract class SoapServiceClient {
  public readonly endpoint: string;
  public readonly namespace: string;
  protected readonly transport: ServiceTransport;

  constructor(config: SoapServiceClientConfig) {
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
    return afipSoapCall(this.endpoint, this.namespace, method, params, {
      ...this.transport,
      ...opts,
      kind: opts.kind ?? 'consulta',
    });
  }
}

/**
 * Convierte la respuesta de un método `dummy` (`appserver`/`dbserver`/
 * `authserver`, en cualquier capitalización: `AppServer` en los servicios
 * ASMX) en un `ServerStatus`.
 *
 * @throws ArcaSoapError si falta alguno de los tres campos.
 */
export function parseServerStatus(result: Record<string, unknown>, method = 'dummy'): ServerStatus {
  const byLower = new Map(Object.keys(result).map((k) => [k.toLowerCase(), result[k]]));
  const field = (name: keyof ServerStatus): string => {
    const value = byLower.get(name);
    if (value === undefined || value === null || value === '' || typeof value === 'object') {
      throw new ArcaSoapError(`Respuesta inválida de ${method}: falta ${name}`);
    }
    return String(value);
  };
  return { appserver: field('appserver'), dbserver: field('dbserver'), authserver: field('authserver') };
}
