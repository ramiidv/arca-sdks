import { validateCuit, WsaaClient } from '@ramiidv/arca-common';
import type { CallOptions, ServerStatus } from '@ramiidv/arca-common';
import { WSCDC_ENDPOINTS, WSCDC_SERVICE_ID } from './constants.js';
import { CdcClient } from './cdc-client.js';
import { validateConstatarInput } from './validation.js';
import type {
  ArcaCdcConfig,
  CdcAuth,
  ConstatarInput,
  ConstatarResult,
  DocTipoItem,
  ModalidadItem,
  OpcionalTipoItem,
  TipoCbteItem,
} from './types.js';

/**
 * Cliente de alto nivel del WSCDC (Constatación de Comprobantes). Maneja la
 * autenticación WSAA (servicio `wscdc`) automáticamente.
 *
 * @example
 * ```ts
 * const cdc = new ArcaCdc({ cert, key, cuit: 20123456786 });
 * const r = await cdc.constatar({
 *   CbteModo: 'CAE',
 *   CuitEmisor: 30712345671,
 *   PtoVta: 1,
 *   CbteTipo: 1,
 *   CbteNro: 150,
 *   CbteFch: '20260315',
 *   ImpTotal: 12100,
 *   CodAutorizacion: '73429843294823',
 *   DocTipoReceptor: 80,
 *   DocNroReceptor: 20123456786,
 * });
 * r.Resultado; // 'A' | 'R'
 * ```
 */
export class ArcaCdc {
  /** Cliente WSAA (acceso directo). */
  public readonly wsaa: WsaaClient;
  /** Cliente WSCDC de bajo nivel (acceso directo). */
  public readonly client: CdcClient;

  private readonly cuit: string;

  constructor(config: ArcaCdcConfig) {
    this.cuit = validateCuit(config.cuit);
    const production = config.production ?? false;

    this.wsaa = new WsaaClient({
      cert: config.cert,
      key: config.key,
      production,
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

    this.client = new CdcClient({
      endpoint: config.endpoints?.wscdc ?? WSCDC_ENDPOINTS[production ? 'production' : 'testing'],
      timeout: config.timeout,
      retries: config.retries,
      retryDelayMs: config.retryDelayMs,
      onEvent: config.onEvent,
      fetch: config.fetch,
      legacyTls: config.legacyTls,
    });
  }

  /**
   * Constata un comprobante (CAE, CAI o CAEA), propio o de terceros
   * (`ComprobanteConstatar`). Es una consulta: se puede reintentar.
   *
   * @returns `Resultado` `A` (constatado, con posibles observaciones) o `R`
   *   (rechazo funcional; motivos en `Observaciones`).
   * @throws ArcaValidationError si el input es inválido (antes de llamar a ARCA).
   * @throws ArcaServiceError si ARCA devuelve `Errors` (formato, autenticación 600-602, infraestructura 500-503).
   */
  async constatar(input: ConstatarInput, opts?: CallOptions): Promise<ConstatarResult> {
    validateConstatarInput(input);
    return this.client.constatar(await this.auth(opts), input, opts);
  }

  /** Estado del servicio (`ComprobanteDummy`). No requiere autenticación. */
  async status(opts?: CallOptions): Promise<ServerStatus> {
    return this.client.dummy(opts);
  }

  /** Modalidades de autorización habilitadas (`ComprobantesModalidadConsultar`). */
  async getModalidades(opts?: CallOptions): Promise<ModalidadItem[]> {
    return this.client.getModalidades(await this.auth(opts), opts);
  }

  /** Tipos de comprobante habilitados (`ComprobantesTipoConsultar`). */
  async getTiposCbte(opts?: CallOptions): Promise<TipoCbteItem[]> {
    return this.client.getTiposCbte(await this.auth(opts), opts);
  }

  /** Tipos de documento habilitados (`DocumentosTipoConsultar`). */
  async getDocTipos(opts?: CallOptions): Promise<DocTipoItem[]> {
    return this.client.getDocTipos(await this.auth(opts), opts);
  }

  /** Identificadores válidos para `Opcionales` (`OpcionalesTipoConsultar`). */
  async getTiposOpcionales(opts?: CallOptions): Promise<OpcionalTipoItem[]> {
    return this.client.getTiposOpcionales(await this.auth(opts), opts);
  }

  /** Descarta los tickets WSAA cacheados (memoria y `ticketStorage`). */
  async clearAuthCache(): Promise<void> {
    await this.wsaa.clearAllTickets();
  }

  private async auth(opts?: CallOptions): Promise<CdcAuth> {
    const ticket = await this.wsaa.getAccessTicket(WSCDC_SERVICE_ID, opts);
    return { Token: ticket.token, Sign: ticket.sign, Cuit: this.cuit };
  }
}
