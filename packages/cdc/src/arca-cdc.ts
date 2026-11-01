import { ArcaSdkBase } from '@ramiidv/arca-common';
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
export class ArcaCdc extends ArcaSdkBase<'wscdc'> {
  /** Cliente WSCDC de bajo nivel (acceso directo). */
  public readonly client: CdcClient;

  /** @throws ArcaValidationError si la CUIT es inválida. */
  constructor(config: ArcaCdcConfig) {
    super(config, { wscdc: WSCDC_SERVICE_ID });
    this.client = new CdcClient({
      endpoint: this.endpoint(WSCDC_ENDPOINTS, config.endpoints?.wscdc),
      ...this.transport,
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
    return this.client.constatar(await this.auth(opts), input, this.callOptions(opts));
  }

  /** Estado del servicio (`ComprobanteDummy`). No requiere autenticación. */
  async status(opts?: CallOptions): Promise<ServerStatus> {
    return this.client.dummy(this.callOptions(opts));
  }

  /** Modalidades de autorización habilitadas (`ComprobantesModalidadConsultar`). */
  async getModalidades(opts?: CallOptions): Promise<ModalidadItem[]> {
    return this.client.getModalidades(await this.auth(opts), this.callOptions(opts));
  }

  /** Tipos de comprobante habilitados (`ComprobantesTipoConsultar`). */
  async getTiposCbte(opts?: CallOptions): Promise<TipoCbteItem[]> {
    return this.client.getTiposCbte(await this.auth(opts), this.callOptions(opts));
  }

  /** Tipos de documento habilitados (`DocumentosTipoConsultar`). */
  async getDocTipos(opts?: CallOptions): Promise<DocTipoItem[]> {
    return this.client.getDocTipos(await this.auth(opts), this.callOptions(opts));
  }

  /** Identificadores válidos para `Opcionales` (`OpcionalesTipoConsultar`). */
  async getTiposOpcionales(opts?: CallOptions): Promise<OpcionalTipoItem[]> {
    return this.client.getTiposOpcionales(await this.auth(opts), this.callOptions(opts));
  }

  private async auth(opts?: CallOptions): Promise<CdcAuth> {
    const ticket = await this.ticket('wscdc', opts);
    return { Token: ticket.token, Sign: ticket.sign, Cuit: this.cuit };
  }
}
