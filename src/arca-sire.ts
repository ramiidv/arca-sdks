import { WsaaClient } from '@ramiidv/arca-common';
import type { CallOptions, ServerStatus } from '@ramiidv/arca-common';
import { ENDPOINTS, SIRE_SERVICE_ID } from './constants.js';
import { SireClient } from './sire-client.js';
import { buildAnulacionRequest, buildCertificadoRequest, toCuitNumber } from './validation.js';
import type {
  AnularCertificadoParams,
  ArcaSireConfig,
  CertificadoResult,
  EmitirCertificadoParams,
  WsAuth,
} from './types.js';

/**
 * SDK del web service SIRE de ARCA para emitir y anular certificados de
 * retención electrónicos de IVA (formulario C2005, RG 4523/2019).
 *
 * Autentica con WSAA (servicio `sire-ws`), valida los datos localmente y
 * serializa el request según el XSD oficial.
 *
 * @example
 * ```ts
 * const sire = new ArcaSire({ cert, key, cuit: '20123456786', production: false });
 * const { certificadoNro, codigoSeguridad } = await sire.emitirCertificado({
 *   regimen: 831,
 *   condicion: Condicion.INSCRIPTO,
 *   fechaRetencion: '2026-10-30T11:16:00',
 *   imposibilidadRetencion: false,
 *   importeRetencion: 2100,
 *   importeBaseCalculo: 20000,
 *   regimenExclusion: false,
 *   tipoComprobante: TipoComprobante.FACTURA,
 *   fechaComprobante: '2026-10-30',
 *   numeroComprobante: '00003-00008497',
 *   importeComprobante: 24200,
 *   cuitRetenido: '30500010912',
 * });
 * ```
 */
export class ArcaSire {
  /** Cliente WSAA (ej: `await sire.wsaa.clearTicket('sire-ws')`). */
  public readonly wsaa: WsaaClient;
  /** Cliente SOAP de bajo nivel. */
  public readonly client: SireClient;

  private readonly cuitAgente: number;

  constructor(config: ArcaSireConfig) {
    this.cuitAgente = toCuitNumber(config.cuit, 'cuit');
    const env = config.production ? 'production' : 'testing';

    this.wsaa = new WsaaClient({
      cert: config.cert,
      key: config.key,
      production: config.production,
      endpoint: config.endpoints?.wsaa,
      tokenTTLMinutes: config.tokenTTLMinutes,
      timeout: config.timeout,
      retries: config.retries,
      retryDelayMs: config.retryDelayMs,
      onEvent: config.onEvent,
      ticketStorage: config.ticketStorage,
      clockOffsetMs: config.clockOffsetMs,
      autoClockSkew: config.autoClockSkew,
      loginErrorCooldownMs: config.loginErrorCooldownMs,
      fetch: config.fetch,
      legacyTls: config.legacyTls,
    });

    this.client = new SireClient({
      endpoint: config.endpoints?.sire ?? ENDPOINTS.sire[env],
      timeout: config.timeout,
      retries: config.retries,
      retryDelayMs: config.retryDelayMs,
      onEvent: config.onEvent,
      fetch: config.fetch,
      legacyTls: config.legacyTls,
    });
  }

  /**
   * Emite un certificado de retención C2005 (`emitir`).
   *
   * Los datos se validan antes de autenticar (`ArcaValidationError`). Un
   * rechazo de ARCA lanza `ArcaSireServiceError` (no se emitió nada). Un
   * `ArcaSoapError` con `uncertain: true` significa que el certificado pudo
   * haberse emitido: no reintentes a ciegas (ver README, "Resultado incierto").
   */
  async emitirCertificado(params: EmitirCertificadoParams, opts?: CallOptions): Promise<CertificadoResult> {
    const certificado = buildCertificadoRequest(params);
    const auth = await this.auth(opts);
    return this.client.emitir(auth, this.cuitAgente, certificado, opts);
  }

  /**
   * Anula un certificado C2005 ya emitido (`anular`). Devuelve el número y el
   * código de seguridad del certificado de anulación. Mismo manejo de errores
   * que `emitirCertificado`.
   */
  async anularCertificado(params: AnularCertificadoParams, opts?: CallOptions): Promise<CertificadoResult> {
    const certificadoAnulacion = buildAnulacionRequest(params);
    const auth = await this.auth(opts);
    return this.client.anular(auth, this.cuitAgente, certificadoAnulacion, opts);
  }

  /** Estado de los servidores de SIRE (`dummy`, sin autenticación). */
  async status(opts?: CallOptions): Promise<ServerStatus> {
    return this.client.dummy(opts);
  }

  private async auth(opts?: CallOptions): Promise<WsAuth> {
    const ticket = await this.wsaa.getAccessTicket(SIRE_SERVICE_ID, opts);
    return { token: ticket.token, sign: ticket.sign };
  }
}
