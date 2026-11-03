import { ArcaSdkBase } from '@ramiidv/arca-common';
import type { CallOptions, ServerStatus } from '@ramiidv/arca-common';
import { ENDPOINTS, WSCDC_SERVICE_ID } from './constants.js';
import { CdcClient } from './cdc-client.js';
import { buildCmpReq } from './validation.js';
import type {
  ArcaCdcConfig,
  CdcAuth,
  ConstatarInput,
  ConstatarResult,
  DocTipoItem,
  ListaCdc,
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
 *   cbteModo: 'CAE',
 *   cuitEmisor: 30712345671,
 *   ptoVta: 1,
 *   cbteTipo: 1,
 *   cbteNro: 150,
 *   cbteFch: '20260315',
 *   impTotal: 12100,
 *   codAutorizacion: '73429843294823',
 *   docTipoReceptor: 80,
 *   docNroReceptor: 20123456786,
 * });
 * r.resultado; // 'A' | 'R'
 * r.observaciones; // [{ code, msg }]
 * r.eventos; // Events de ARCA
 * ```
 */
export class ArcaCdc extends ArcaSdkBase<'wscdc'> {
  /** Cliente WSCDC de bajo nivel (acceso directo). */
  public readonly client: CdcClient;

  /** @throws ArcaValidationError si la CUIT es inválida. */
  constructor(config: ArcaCdcConfig) {
    super(config, { wscdc: WSCDC_SERVICE_ID });
    this.client = new CdcClient({
      endpoint: this.endpoint(ENDPOINTS.wscdc, config.endpoints?.wscdc),
      transport: this.transport,
    });
  }

  /**
   * Constata un comprobante (CAE, CAI o CAEA), propio o de terceros
   * (`ComprobanteConstatar`). Es una consulta: se puede reintentar.
   *
   * @returns `resultado` `A` (constatado, con posibles observaciones) o `R`
   *   (no constatado; motivos en `observaciones`). Un `R` no es un error: es la
   *   respuesta de la consulta (no lanza `ArcaRechazoError`, que es solo para emisiones).
   * @throws ArcaValidationError si el input es inválido (antes de autenticarse y de llamar a ARCA).
   * @throws ArcaServiceError si ARCA devuelve `Errors` (formato, autenticación 600-602, infraestructura 500-503).
   * @throws ArcaResponseError si la respuesta no tiene la forma esperada.
   */
  async constatar(input: ConstatarInput, opts?: CallOptions): Promise<ConstatarResult> {
    const cmpReq = buildCmpReq(input);
    return this.client.constatarCmpReq(await this.auth(opts), cmpReq, this.callOptions(opts));
  }

  /**
   * Estado del servicio (`ComprobanteDummy`). No requiere autenticación. Devuelve
   * lo que informa ARCA: verificá con `serverStatusOk` de `@ramiidv/arca-common`
   * que los tres servidores estén en `OK`.
   */
  async status(opts?: CallOptions): Promise<ServerStatus> {
    return this.client.dummy(this.callOptions(opts));
  }

  /**
   * Modalidades de autorización habilitadas (`ComprobantesModalidadConsultar`).
   * Como en todas las tablas, los `Events` de ARCA (si vinieron) quedan en `lista.eventos`.
   */
  async getModalidades(opts?: CallOptions): Promise<ListaCdc<ModalidadItem>> {
    return this.client.getModalidades(await this.auth(opts), this.callOptions(opts));
  }

  /** Tipos de comprobante habilitados (`ComprobantesTipoConsultar`). */
  async getTiposCbte(opts?: CallOptions): Promise<ListaCdc<TipoCbteItem>> {
    return this.client.getTiposCbte(await this.auth(opts), this.callOptions(opts));
  }

  /** Tipos de documento habilitados (`DocumentosTipoConsultar`). */
  async getDocTipos(opts?: CallOptions): Promise<ListaCdc<DocTipoItem>> {
    return this.client.getDocTipos(await this.auth(opts), this.callOptions(opts));
  }

  /** Identificadores válidos para `Opcionales` (`OpcionalesTipoConsultar`). */
  async getTiposOpcionales(opts?: CallOptions): Promise<ListaCdc<OpcionalTipoItem>> {
    return this.client.getTiposOpcionales(await this.auth(opts), this.callOptions(opts));
  }

  private async auth(opts?: CallOptions): Promise<CdcAuth> {
    const ticket = await this.ticket('wscdc', opts);
    return { token: ticket.token, sign: ticket.sign, cuit: this.cuit };
  }
}
