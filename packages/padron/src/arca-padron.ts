import { WsaaClient, anySignal, validateCuit } from '@ramiidv/arca-common';
import type { ArcaEvent, CallOptions } from '@ramiidv/arca-common';
import { ENDPOINTS } from './constants.js';
import type { PadronSoapOptions } from './base-client.js';
import { PadronA4Client } from './padron-a4.js';
import { PadronA5Client } from './padron-a5.js';
import { PadronA10Client } from './padron-a10.js';
import { PadronA13Client } from './padron-a13.js';
import { PadronA100Client } from './padron-a100.js';
import type {
  ArcaPadronConfig,
  PadronServicio,
  PadronStatus,
  ParameterRecord,
  PersonaA4,
  PersonaA5,
  PersonaA10,
  PersonaA13,
  WsAuth,
} from './types.js';

/**
 * Main orchestrator class for ARCA Padrón web services.
 *
 * Provides high-level methods that handle WSAA authentication automatically
 * and expose results from the Constancia de Inscripción (ex A5), A4 (full),
 * A10 (basic), A13 (basic) and A100 (parameters) web services.
 *
 * @example
 * ```ts
 * import { ArcaPadron, condicionIvaDesdePadron, FileTicketStorage } from '@ramiidv/arca-padron';
 * import { readFileSync } from 'fs';
 *
 * const client = new ArcaPadron({
 *   cert: readFileSync('cert.pem', 'utf-8'),
 *   key: readFileSync('key.pem', 'utf-8'),
 *   cuit: '20123456789',
 *   production: false,
 *   ticketStorage: new FileTicketStorage('./.arca-tickets'),
 * });
 *
 * const persona = await client.getConstanciaInscripcion('30712345674');
 * const { condicionIva, motivo } = condicionIvaDesdePadron(persona);
 * ```
 */
export class ArcaPadron {
  /** Low-level WSAA client for direct access (se puede compartir con arca-facturacion) */
  public readonly wsaa: WsaaClient;
  /** Low-level Constancia de Inscripción (ex Padrón A5) client */
  public readonly a5: PadronA5Client;
  /** Low-level Padrón A4 client for direct access */
  public readonly a4: PadronA4Client;
  /** Low-level Padrón A10 client for direct access */
  public readonly a10: PadronA10Client;
  /** Low-level Padrón A13 client for direct access */
  public readonly a13: PadronA13Client;
  /** Low-level Padrón A100 client for direct access */
  public readonly a100: PadronA100Client;

  private readonly cuit: string;
  private readonly signal?: AbortSignal;

  constructor(config: ArcaPadronConfig) {
    const isProduction = config.production ?? false;
    const env = isProduction ? 'production' : 'testing';
    this.cuit = validateCuit(config.cuit);
    this.signal = config.signal;
    const onEvent: ((event: ArcaEvent) => void) | undefined = config.onEvent;

    const soapOptions: PadronSoapOptions = {
      timeout: config.timeout,
      retries: config.retries,
      retryDelayMs: config.retryDelayMs,
      fetch: config.fetch,
      legacyTls: config.legacyTls,
    };

    this.wsaa =
      config.wsaa ??
      new WsaaClient({
        cert: config.cert,
        key: config.key,
        production: isProduction,
        endpoint: config.endpoints?.wsaa,
        tokenTTLMinutes: config.tokenTTLMinutes,
        timeout: config.timeout,
        retries: config.retries,
        retryDelayMs: config.retryDelayMs,
        onEvent,
        ticketStorage: config.ticketStorage,
        clockOffsetMs: config.clockOffsetMs,
        autoClockSkew: config.autoClockSkew,
        loginErrorCooldownMs: config.loginErrorCooldownMs,
        fetch: config.fetch,
        legacyTls: config.legacyTls,
      });

    const clientConfig = (svc: PadronServicio) => ({
      endpoint: config.endpoints?.[svc] ?? ENDPOINTS[svc][env],
      namespace: ENDPOINTS[svc].namespace,
      soapOptions,
      onEvent,
    });

    this.a5 = new PadronA5Client(clientConfig('a5'));
    this.a4 = new PadronA4Client(clientConfig('a4'));
    this.a10 = new PadronA10Client(clientConfig('a10'));
    this.a13 = new PadronA13Client(clientConfig('a13'));
    this.a100 = new PadronA100Client(clientConfig('a100'));
  }

  /**
   * Constancia de inscripción (ws_sr_constancia_inscripcion, ex Padrón A5,
   * `getPersona_v2`): datos generales, domicilio fiscal, impuestos del régimen
   * general y monotributo. Combinar con `condicionIvaDesdePadron` para facturar.
   * @param cuit - CUIT a consultar (con o sin guiones)
   * @throws ArcaValidationError si la CUIT es inválida (dígito verificador)
   * @throws ArcaPadronServiceError si ARCA informa la CUIT inexistente, inactiva, etc.
   */
  async getConstanciaInscripcion(cuit: string | number, call?: CallOptions): Promise<PersonaA5> {
    const opts = this.opts(call);
    const auth = await this.getAuth(ENDPOINTS.a5.serviceId, opts);
    return this.a5.getPersona(auth, cuit, opts);
  }

  /**
   * Constancias de inscripción de hasta 250 CUITs en una llamada
   * (`getPersonaList_v2`). Las CUITs inexistentes vuelven con `errorConstancia`
   * ("No existe persona con ese Id") en lugar de hacer fallar la consulta.
   */
  async getConstanciasInscripcion(cuits: Array<string | number>, call?: CallOptions): Promise<PersonaA5[]> {
    const opts = this.opts(call);
    const auth = await this.getAuth(ENDPOINTS.a5.serviceId, opts);
    return this.a5.getPersonaList(auth, cuits, opts);
  }

  /**
   * Datos completos de un contribuyente (Padrón A4).
   * @param cuit - CUIT/CUIL a consultar (con o sin guiones)
   */
  async getPersona(cuit: string | number, call?: CallOptions): Promise<PersonaA4> {
    const opts = this.opts(call);
    const auth = await this.getAuth(ENDPOINTS.a4.serviceId, opts);
    return this.a4.getPersona(auth, cuit, opts);
  }

  /**
   * Datos básicos de un contribuyente (Padrón A10).
   * @param cuit - CUIT/CUIL a consultar (con o sin guiones)
   */
  async getPersonaBasic(cuit: string | number, call?: CallOptions): Promise<PersonaA10> {
    const opts = this.opts(call);
    const auth = await this.getAuth(ENDPOINTS.a10.serviceId, opts);
    return this.a10.getPersona(auth, cuit, opts);
  }

  /**
   * Datos básicos de un contribuyente (Padrón A13, `getPersona`). Con la clave
   * inactiva ARCA responde con error (`reason: 'inactiva'`): ver `getPersonaA13V2`.
   * @param cuit - CUIT/CUIL a consultar (con o sin guiones)
   */
  async getPersonaA13(cuit: string | number, call?: CallOptions): Promise<PersonaA13> {
    const opts = this.opts(call);
    const auth = await this.getAuth(ENDPOINTS.a13.serviceId, opts);
    return this.a13.getPersona(auth, cuit, opts);
  }

  /**
   * Datos básicos de un contribuyente (Padrón A13, `getPersonaV2`): responde
   * también si la clave está INACTIVA (manual A13 v1.4).
   */
  async getPersonaA13V2(cuit: string | number, call?: CallOptions): Promise<PersonaA13> {
    const opts = this.opts(call);
    const auth = await this.getAuth(ENDPOINTS.a13.serviceId, opts);
    return this.a13.getPersonaV2(auth, cuit, opts);
  }

  /**
   * CUITs/CUILs asociados a un número de documento (Padrón A13).
   * @param documento - Número de documento (DNI); se aceptan puntos y espacios
   */
  async getIdPersonaListByDocumento(documento: string | number, call?: CallOptions): Promise<string[]> {
    const opts = this.opts(call);
    const auth = await this.getAuth(ENDPOINTS.a13.serviceId, opts);
    return this.a13.getIdPersonaListByDocumento(auth, documento, opts);
  }

  /**
   * Tabla de parámetros (Padrón A100) por nombre de colección.
   * @param collection - Nombre de la colección (ej: CollectionName.PROVINCIA)
   */
  async getParametros(collection: string, call?: CallOptions): Promise<ParameterRecord[]> {
    const opts = this.opts(call);
    const auth = await this.getAuth(ENDPOINTS.a100.serviceId, opts);
    return this.a100.getParameterCollectionByName(auth, collection, opts);
  }

  /**
   * Estado de los servicios de Padrón (`dummy`, sin autenticación). Consulta
   * todos en paralelo y devuelve el resultado de cada uno por separado: un
   * servicio caído no oculta el estado de los demás.
   *
   * @example
   * ```ts
   * const s = await padron.status();
   * if (s.a4.status === 'fulfilled') console.log(s.a4.value.appserver);
   * else console.error(s.a4.reason);
   * ```
   */
  async status(call?: CallOptions): Promise<PadronStatus> {
    const opts = this.opts(call);
    const [a5, a4, a10, a13, a100] = await Promise.allSettled([
      this.a5.dummy(opts),
      this.a4.dummy(opts),
      this.a10.dummy(opts),
      this.a13.dummy(opts),
      this.a100.dummy(opts),
    ]);
    return { a5, a4, a10, a13, a100 };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private opts(call?: CallOptions): CallOptions {
    return { signal: anySignal(this.signal, call?.signal) };
  }

  private async getAuth(serviceId: string, opts?: CallOptions): Promise<WsAuth> {
    const ticket = await this.wsaa.getAccessTicket(serviceId, opts);
    return {
      Token: ticket.token,
      Sign: ticket.sign,
      CuitRepresentada: this.cuit,
    };
  }
}
