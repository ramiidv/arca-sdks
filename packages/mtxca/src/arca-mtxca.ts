import { ArcaServiceError, formatDate, validateCuit, WsaaClient } from '@ramiidv/arca-common';
import type { CallOptions, ServerStatus } from '@ramiidv/arca-common';
import { MTXCA_ENDPOINTS, MTXCA_SERVICE_ID } from './constants.js';
import { MtxcaClient } from './mtxca-client.js';
import { buildComprobante } from './serialize.js';
import { validateComprobanteCAE, validateComprobanteCAEA } from './validation.js';
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
export class ArcaMtxca {
  /** Cliente WSAA (acceso directo). */
  public readonly wsaa: WsaaClient;
  /** Cliente SOAP de bajo nivel (acceso directo). */
  public readonly client: MtxcaClient;
  /** CUIT representada, normalizada a 11 dígitos. */
  public readonly cuit: string;

  constructor(config: ArcaMtxcaConfig) {
    this.cuit = validateCuit(config.cuit);
    const production = config.production ?? false;

    this.wsaa = new WsaaClient({
      cert: config.cert,
      key: config.key,
      production,
      endpoint: config.wsaaEndpoint,
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

    this.client = new MtxcaClient({
      endpoint: config.endpoint ?? (production ? MTXCA_ENDPOINTS.production : MTXCA_ENDPOINTS.testing),
      timeout: config.timeout,
      retries: config.retries,
      retryDelayMs: config.retryDelayMs,
      onEvent: config.onEvent,
      fetch: config.fetch,
      legacyTls: config.legacyTls,
    });
  }

  private async auth(opts?: CallOptions): Promise<MtxcaAuth> {
    const ticket = await this.wsaa.getAccessTicket(MTXCA_SERVICE_ID, opts);
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
    buildComprobante({ ...request, numeroComprobante: request?.numeroComprobante ?? 1 }, 'cae');
    if (opts?.validarImportes !== false) validateComprobanteCAE(request);

    const numeroComprobante =
      request.numeroComprobante ??
      (await this.siguienteComprobante(request.numeroPuntoVenta, request.codigoTipoComprobante, opts));
    const auth = await this.auth(opts);
    const comprobante = { ...request, numeroComprobante };
    return method === 'autorizarComprobante'
      ? this.client.autorizarComprobante(auth, comprobante, opts)
      : this.client.autorizarAjusteIVA(auth, comprobante, opts);
  }

  /**
   * Último número autorizado o informado para un punto de venta y tipo. Si no
   * hay ninguno (error 1502 de ARCA), devuelve 0. Cualquier otro error lanza
   * `ArcaServiceError`.
   */
  async ultimoComprobante(ptoVta: number, cbteTipo: number, opts?: CallOptions): Promise<number> {
    const auth = await this.auth(opts);
    try {
      return await this.client.consultarUltimoComprobanteAutorizado(auth, ptoVta, cbteTipo, opts);
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
    return this.client.consultarComprobante(auth, cbteTipo, ptoVta, cbteNro, opts);
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
    return this.client.solicitarCAEA(auth, periodo, orden, opts);
  }

  /** Consulta un CAEA otorgado. */
  async consultarCAEA(caea: string, opts?: CallOptions): Promise<MtxcaCAEA> {
    const auth = await this.auth(opts);
    return this.client.consultarCAEA(auth, caea, opts);
  }

  /** CAEAs otorgados entre dos fechas. */
  async consultarCAEAEntreFechas(
    fechaDesde: FechaInput,
    fechaHasta: FechaInput,
    opts?: CallOptions,
  ): Promise<MtxcaCAEA[]> {
    const auth = await this.auth(opts);
    return this.client.consultarCAEAEntreFechas(auth, fechaDesde, fechaHasta, opts);
  }

  /**
   * Informa un comprobante emitido con CAEA (`informarComprobanteCAEA`). Valida
   * el XSD y las reglas excluyentes de ítems. Un rechazo devuelve
   * `resultado: 'R'`. Ante `uncertain`, verificá con `consultarComprobante()`.
   */
  async informarComprobanteCAEA(
    comprobante: MtxcaComprobanteCAEA,
    opts?: CallOptions,
  ): Promise<MtxcaInformarCAEAResult> {
    buildComprobante(comprobante, 'caea');
    validateComprobanteCAEA(comprobante);
    const auth = await this.auth(opts);
    return this.client.informarComprobanteCAEA(auth, comprobante, opts);
  }

  /** Informa un ajuste de IVA emitido con CAEA (`informarAjusteIVACAEA`). Solo valida el XSD. */
  async informarAjusteIVACAEA(comprobante: MtxcaComprobanteCAEA, opts?: CallOptions): Promise<MtxcaInformarCAEAResult> {
    const auth = await this.auth(opts);
    return this.client.informarAjusteIVACAEA(auth, comprobante, opts);
  }

  /** Informa que un CAEA no se utilizó. Un rechazo devuelve `resultado: 'R'`. */
  async informarCAEANoUtilizado(caea: string, opts?: CallOptions): Promise<MtxcaCAEANoUtilizadoResult> {
    const auth = await this.auth(opts);
    return this.client.informarCAEANoUtilizado(auth, caea, opts);
  }

  /** Informa que un CAEA no se utilizó en un punto de venta. Un rechazo devuelve `resultado: 'R'`. */
  async informarCAEANoUtilizadoPtoVta(
    caea: string,
    ptoVta: number,
    opts?: CallOptions,
  ): Promise<MtxcaCAEANoUtilizadoResult> {
    const auth = await this.auth(opts);
    return this.client.informarCAEANoUtilizadoPtoVta(auth, caea, ptoVta, opts);
  }

  /** Puntos de venta que todavía no informaron movimientos para un CAEA. */
  async consultarPtosVtaCAEANoInformados(caea: string, opts?: CallOptions): Promise<PuntoVenta[]> {
    const auth = await this.auth(opts);
    return this.client.consultarPtosVtaCAEANoInformados(auth, caea, opts);
  }

  // =========================================================================
  // Estado
  // =========================================================================

  /** Estado del servicio (`dummy`). No requiere autenticación. */
  async status(opts?: CallOptions): Promise<ServerStatus> {
    return this.client.dummy(opts);
  }

  // =========================================================================
  // Parámetros
  // =========================================================================

  async getTiposComprobante(opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.client.consultarTiposComprobante(await this.auth(opts), opts);
  }

  async getTiposDocumento(opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.client.consultarTiposDocumento(await this.auth(opts), opts);
  }

  async getAlicuotasIVA(opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.client.consultarAlicuotasIVA(await this.auth(opts), opts);
  }

  /** Condiciones de IVA de los ítems. */
  async getCondicionesIVA(opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.client.consultarCondicionesIVA(await this.auth(opts), opts);
  }

  /** Condiciones de IVA del receptor admitidas para un tipo de comprobante (RG 5616). */
  async getCondicionesIVAReceptor(cbteTipo: number, opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.client.consultarCondicionesIVAReceptor(await this.auth(opts), cbteTipo, opts);
  }

  async getMonedas(opts?: CallOptions): Promise<CodigoDescripcionString[]> {
    return this.client.consultarMonedas(await this.auth(opts), opts);
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
    return this.client.consultarCotizacionMoneda(await this.auth(opts), codigoMoneda, fecha, opts);
  }

  async getUnidadesMedida(opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.client.consultarUnidadesMedida(await this.auth(opts), opts);
  }

  async getTiposTributo(opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.client.consultarTiposTributo(await this.auth(opts), opts);
  }

  async getTiposDatosAdicionales(opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.client.consultarTiposDatosAdicionales(await this.auth(opts), opts);
  }

  async getActividadesVigentes(opts?: CallOptions): Promise<ActividadVigente[]> {
    return this.client.consultarActividadesVigentes(await this.auth(opts), opts);
  }

  async getPuntosVenta(opts?: CallOptions): Promise<PuntoVenta[]> {
    return this.client.consultarPuntosVenta(await this.auth(opts), opts);
  }

  async getPuntosVentaCAE(opts?: CallOptions): Promise<PuntoVenta[]> {
    return this.client.consultarPuntosVentaCAE(await this.auth(opts), opts);
  }

  async getPuntosVentaCAEA(opts?: CallOptions): Promise<PuntoVenta[]> {
    return this.client.consultarPuntosVentaCAEA(await this.auth(opts), opts);
  }

  // =========================================================================
  // Cache
  // =========================================================================

  /** Descarta el ticket de acceso de WSMTXCA (memoria y `ticketStorage`). */
  async clearAuthCache(): Promise<void> {
    await this.wsaa.clearTicket(MTXCA_SERVICE_ID);
  }
}
