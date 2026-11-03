import { ArcaSdkBase, ArcaServiceError, formatDate } from '@ramiidv/arca-common';
import type { CallOptions, QROptions, ServerStatus } from '@ramiidv/arca-common';
import { MTXCA_ENDPOINTS, MTXCA_SERVICE_ID } from './constants.js';
import { MtxcaClient } from './mtxca-client.js';
import { urlQR } from './qr.js';
import type { ComprobanteQR } from './qr.js';
import { buildComprobante } from './serialize.js';
import { reglaFechaHoraGen, reglasComprobanteCAE, reglasComprobanteCAEA } from './validation.js';
import type {
  ActividadVigente,
  ArcaMtxcaConfig,
  AutorizarOptions,
  AutorizarRequest,
  CodigoDescripcion,
  CodigoDescripcionString,
  CotizacionResult,
  FechaInput,
  MtxcaAuth,
  MtxcaAutorizarResult,
  MtxcaCAEA,
  MtxcaCAEANoUtilizadoResult,
  MtxcaComprobanteCAEA,
  MtxcaConsultaComprobanteResult,
  MtxcaInformarCAEAResult,
  PuntoVenta,
} from './types.js';

/** Error 1502 de consultarUltimoComprobanteAutorizado: no hay comprobantes para ese punto de venta y tipo. */
const SIN_COMPROBANTES = 1502;

/**
 * Cliente de alto nivel de WSMTXCA (factura electrónica con detalle de
 * ítems): autenticación WSAA automática, numeración y validación local.
 *
 * @example
 * ```ts
 * const mtxca = new ArcaMtxca({ cert, key, cuit: '20123456786' });
 * const res = await mtxca.autorizar({ ...comprobante });
 * if (res.resultado === 'R') console.error(res.errores);
 * else console.log(res.comprobante.cae);
 * ```
 */
export class ArcaMtxca extends ArcaSdkBase<'mtxca'> {
  /** Cliente SOAP de bajo nivel (acceso directo). */
  public readonly client: MtxcaClient;

  /** @throws ArcaValidationError si la CUIT es inválida. */
  constructor(config: ArcaMtxcaConfig) {
    super(config, { mtxca: MTXCA_SERVICE_ID });
    this.client = new MtxcaClient({
      endpoint: this.endpoint(MTXCA_ENDPOINTS, config.endpoints?.mtxca),
      ...this.transport,
      onEvento: config.onEvento,
    });
  }

  private async auth(opts?: CallOptions): Promise<MtxcaAuth> {
    const ticket = await this.ticket('mtxca', opts);
    return { token: ticket.token, sign: ticket.sign, cuitRepresentada: this.cuit };
  }

  // =========================================================================
  // CAE
  // =========================================================================

  /**
   * Autoriza un comprobante con detalle de ítems (`autorizarComprobante`).
   *
   * - Valida contra el XSD, redondea importes y (salvo `validarImportes: false`)
   *   valida la coherencia de importes según el manual.
   * - Sin `numeroComprobante`, usa el último autorizado + 1. Las solicitudes
   *   para un mismo punto de venta y tipo deben ser secuenciales (error 135).
   * - Un rechazo devuelve `resultado: 'R'` con `errores`; `O` es aprobado con
   *   observaciones.
   * - Si lanza `ArcaSoapError` con `uncertain: true`, el comprobante pudo
   *   haberse autorizado: NO reintentes a ciegas; usá `ultimoComprobante()` y
   *   `consultarComprobante()` para saber si quedó autorizado.
   */
  async autorizar(request: AutorizarRequest, opts?: AutorizarOptions): Promise<MtxcaAutorizarResult> {
    return this.autorizarCAE('autorizarComprobante', request, opts);
  }

  /**
   * Autoriza un ajuste de IVA (`autorizarAjusteIVA`, ND/NC 2, 3, 7, 8, 52, 53).
   * Tiene reglas propias (ej. importeSubtotal 0, sin gravado/no gravado/exento),
   * así que solo se valida contra el XSD. Misma numeración y manejo de errores
   * que `autorizar()`.
   */
  async autorizarAjusteIVA(request: AutorizarRequest, opts?: CallOptions): Promise<MtxcaAutorizarResult> {
    return this.autorizarCAE('autorizarAjusteIVA', request, { ...opts, validarImportes: false });
  }

  private async autorizarCAE(
    method: 'autorizarComprobante' | 'autorizarAjusteIVA',
    request: AutorizarRequest,
    opts?: AutorizarOptions,
  ): Promise<MtxcaAutorizarResult> {
    // Valida antes de pedir el número: un error local no debe costar requests.
    buildComprobante(
      { ...request, numeroComprobante: request?.numeroComprobante ?? 1 },
      'cae',
      opts?.validarImportes !== false
        ? (c, errors) => reglasComprobanteCAE(c, errors, { cuitEmisor: this.cuit })
        : undefined,
    );

    const numeroComprobante =
      request.numeroComprobante ??
      (await this.siguienteComprobante(request.numeroPuntoVenta, request.codigoTipoComprobante, opts));
    const auth = await this.auth(opts);
    const comprobante = { ...request, numeroComprobante };
    return method === 'autorizarComprobante'
      ? this.client.autorizarComprobante(auth, comprobante, this.callOptions(opts))
      : this.client.autorizarAjusteIVA(auth, comprobante, this.callOptions(opts));
  }

  /**
   * Último número autorizado o informado para un punto de venta y tipo. Si no
   * hay ninguno (error 1502 de ARCA), devuelve 0. Cualquier otro error lanza
   * `ArcaServiceError`.
   */
  async ultimoComprobante(ptoVta: number, cbteTipo: number, opts?: CallOptions): Promise<number> {
    const auth = await this.auth(opts);
    try {
      return await this.client.consultarUltimoComprobanteAutorizado(auth, ptoVta, cbteTipo, this.callOptions(opts));
    } catch (e) {
      if (e instanceof ArcaServiceError && e.errors.length > 0 && e.errors.every((x) => x.code === SIN_COMPROBANTES)) {
        return 0;
      }
      throw e;
    }
  }

  /** Siguiente número de comprobante (último + 1). */
  async siguienteComprobante(ptoVta: number, cbteTipo: number, opts?: CallOptions): Promise<number> {
    return (await this.ultimoComprobante(ptoVta, cbteTipo, opts)) + 1;
  }

  /** Consulta un comprobante autorizado (CAE) o informado (CAEA). Lanza `ArcaServiceError` si no existe. */
  async consultarComprobante(
    cbteTipo: number,
    ptoVta: number,
    cbteNro: number,
    opts?: CallOptions,
  ): Promise<MtxcaConsultaComprobanteResult> {
    const auth = await this.auth(opts);
    return this.client.consultarComprobante(auth, cbteTipo, ptoVta, cbteNro, this.callOptions(opts));
  }

  /**
   * URL del código QR (RG 4892) de un comprobante autorizado con CAE o
   * informado con CAEA, con la CUIT de la instancia como emisor.
   *
   * @example
   * ```ts
   * const res = await mtxca.autorizar(req);
   * if (res.resultado !== 'R') console.log(mtxca.urlQR(req, res));
   * // Más tarde: mtxca.urlQR((await mtxca.consultarComprobante(1, 4000, 25)).comprobante)
   * ```
   * @throws ArcaValidationError si el comprobante fue rechazado o falta algún dato (ver `urlQR`).
   */
  urlQR(
    comprobante: ComprobanteQR,
    resultado?: MtxcaAutorizarResult | MtxcaInformarCAEAResult,
    options?: QROptions,
  ): string {
    return urlQR(this.cuit, comprobante, resultado, options);
  }

  // =========================================================================
  // CAEA
  // =========================================================================

  /**
   * Solicita un CAEA para `periodo` (AAAAMM) y `orden` (1: días 1-15, 2: 16
   * a fin de mes). Lanza `ArcaServiceError` si ARCA lo rechaza. Si lanza
   * `ArcaSoapError` con `uncertain`, consultá `consultarCAEAEntreFechas()`.
   */
  async solicitarCAEA(periodo: number, orden: number, opts?: CallOptions): Promise<MtxcaCAEA> {
    const auth = await this.auth(opts);
    return this.client.solicitarCAEA(auth, periodo, orden, this.callOptions(opts));
  }

  /** Consulta un CAEA otorgado. */
  async consultarCAEA(caea: string, opts?: CallOptions): Promise<MtxcaCAEA> {
    const auth = await this.auth(opts);
    return this.client.consultarCAEA(auth, caea, this.callOptions(opts));
  }

  /** CAEAs otorgados entre dos fechas. */
  async consultarCAEAEntreFechas(
    fechaDesde: FechaInput,
    fechaHasta: FechaInput,
    opts?: CallOptions,
  ): Promise<MtxcaCAEA[]> {
    const auth = await this.auth(opts);
    return this.client.consultarCAEAEntreFechas(auth, fechaDesde, fechaHasta, this.callOptions(opts));
  }

  /**
   * Informa un comprobante emitido con CAEA (`informarComprobanteCAEA`). Valida
   * el XSD y las reglas excluyentes del manual (ítems, receptor, condición de
   * IVA del receptor, FCE, comprobantes asociados, datos adicionales,
   * compradores, `fechaHoraGen`; ver `validateComprobanteCAEA`). Un rechazo devuelve
   * `resultado: 'R'`. Ante `uncertain`, verificá con `consultarComprobante()`.
   */
  async informarComprobanteCAEA(
    comprobante: MtxcaComprobanteCAEA,
    opts?: CallOptions,
  ): Promise<MtxcaInformarCAEAResult> {
    buildComprobante(comprobante, 'caea', (c, errors) => reglasComprobanteCAEA(c, errors, { cuitEmisor: this.cuit }));
    const auth = await this.auth(opts);
    return this.client.informarComprobanteCAEA(auth, comprobante, this.callOptions(opts));
  }

  /**
   * Informa un ajuste de IVA emitido con CAEA (`informarAjusteIVACAEA`). Valida
   * el XSD y `fechaHoraGen`, obligatoria en todo comprobante CAEA (754).
   */
  async informarAjusteIVACAEA(comprobante: MtxcaComprobanteCAEA, opts?: CallOptions): Promise<MtxcaInformarCAEAResult> {
    buildComprobante(comprobante, 'caea', reglaFechaHoraGen);
    const auth = await this.auth(opts);
    return this.client.informarAjusteIVACAEA(auth, comprobante, this.callOptions(opts));
  }

  /** Informa que un CAEA no se utilizó. Un rechazo devuelve `resultado: 'R'`. */
  async informarCAEANoUtilizado(caea: string, opts?: CallOptions): Promise<MtxcaCAEANoUtilizadoResult> {
    const auth = await this.auth(opts);
    return this.client.informarCAEANoUtilizado(auth, caea, this.callOptions(opts));
  }

  /** Informa que un CAEA no se utilizó en un punto de venta. Un rechazo devuelve `resultado: 'R'`. */
  async informarCAEANoUtilizadoPtoVta(
    caea: string,
    ptoVta: number,
    opts?: CallOptions,
  ): Promise<MtxcaCAEANoUtilizadoResult> {
    const auth = await this.auth(opts);
    return this.client.informarCAEANoUtilizadoPtoVta(auth, caea, ptoVta, this.callOptions(opts));
  }

  /** Puntos de venta que todavía no informaron movimientos para un CAEA. */
  async consultarPtosVtaCAEANoInformados(caea: string, opts?: CallOptions): Promise<PuntoVenta[]> {
    const auth = await this.auth(opts);
    return this.client.consultarPtosVtaCAEANoInformados(auth, caea, this.callOptions(opts));
  }

  // =========================================================================
  // Estado
  // =========================================================================

  /** Estado del servicio (`dummy`). No requiere autenticación. */
  async status(opts?: CallOptions): Promise<ServerStatus> {
    return this.client.dummy(this.callOptions(opts));
  }

  // =========================================================================
  // Parámetros
  // =========================================================================

  async getTiposComprobante(opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.client.consultarTiposComprobante(await this.auth(opts), this.callOptions(opts));
  }

  async getTiposDocumento(opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.client.consultarTiposDocumento(await this.auth(opts), this.callOptions(opts));
  }

  async getAlicuotasIVA(opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.client.consultarAlicuotasIVA(await this.auth(opts), this.callOptions(opts));
  }

  /** Condiciones de IVA de los ítems. */
  async getCondicionesIVA(opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.client.consultarCondicionesIVA(await this.auth(opts), this.callOptions(opts));
  }

  /** Condiciones de IVA del receptor admitidas para un tipo de comprobante (RG 5616). */
  async getCondicionesIVAReceptor(cbteTipo: number, opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.client.consultarCondicionesIVAReceptor(await this.auth(opts), cbteTipo, this.callOptions(opts));
  }

  async getMonedas(opts?: CallOptions): Promise<CodigoDescripcionString[]> {
    return this.client.consultarMonedas(await this.auth(opts), this.callOptions(opts));
  }

  /**
   * Cotización de una moneda para una fecha (default: hoy en Argentina).
   * `cotizacion` es `null` si ARCA no tiene cotización.
   */
  async getCotizacionMoneda(
    codigoMoneda: string,
    fecha: FechaInput = formatDate(new Date()),
    opts?: CallOptions,
  ): Promise<CotizacionResult> {
    return this.client.consultarCotizacionMoneda(await this.auth(opts), codigoMoneda, fecha, this.callOptions(opts));
  }

  async getUnidadesMedida(opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.client.consultarUnidadesMedida(await this.auth(opts), this.callOptions(opts));
  }

  async getTiposTributo(opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.client.consultarTiposTributo(await this.auth(opts), this.callOptions(opts));
  }

  async getTiposDatosAdicionales(opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.client.consultarTiposDatosAdicionales(await this.auth(opts), this.callOptions(opts));
  }

  async getActividadesVigentes(opts?: CallOptions): Promise<ActividadVigente[]> {
    return this.client.consultarActividadesVigentes(await this.auth(opts), this.callOptions(opts));
  }

  async getPuntosVenta(opts?: CallOptions): Promise<PuntoVenta[]> {
    return this.client.consultarPuntosVenta(await this.auth(opts), this.callOptions(opts));
  }

  async getPuntosVentaCAE(opts?: CallOptions): Promise<PuntoVenta[]> {
    return this.client.consultarPuntosVentaCAE(await this.auth(opts), this.callOptions(opts));
  }

  async getPuntosVentaCAEA(opts?: CallOptions): Promise<PuntoVenta[]> {
    return this.client.consultarPuntosVentaCAEA(await this.auth(opts), this.callOptions(opts));
  }
}
