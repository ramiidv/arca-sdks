import { afipSoapCall, checkServiceErrors } from '@ramiidv/arca-common';
import type { ArcaEvent, CallOptions, LegacyTlsMode, ServerStatus, SoapOperationKind } from '@ramiidv/arca-common';
import { MTXCA_NAMESPACE } from './constants.js';
import { buildComprobante, XsdFields } from './serialize.js';
import { ResponseReader } from './parse.js';
import type { R } from './parse.js';
import type {
  ActividadVigente,
  CodigoDescripcion,
  CodigoDescripcionString,
  CotizacionResult,
  FechaInput,
  MtxcaAuth,
  MtxcaAutorizarResult,
  MtxcaCAEA,
  MtxcaCAEANoUtilizadoResult,
  MtxcaComprobanteCAE,
  MtxcaComprobanteCAEA,
  MtxcaComprobanteConsultado,
  MtxcaConsultaComprobanteResult,
  MtxcaInformarCAEAResult,
  MtxcaResultado,
  PuntoVenta,
} from './types.js';

export interface MtxcaClientConfig {
  /** URL del servicio (ver `MTXCA_ENDPOINTS`). */
  endpoint: string;
  /** Timeout por request en ms (default: 30000). */
  timeout?: number;
  /** Reintentos de consultas ante errores transitorios (default: 1). Las emisiones nunca se reintentan. */
  retries?: number;
  /** Delay base del backoff en ms (default: 1000). */
  retryDelayMs?: number;
  onEvent?: (event: ArcaEvent) => void;
  fetch?: typeof fetch;
  legacyTls?: LegacyTlsMode;
}

const SERVICE = 'WSMTXCA';

function isResultado(value: string): value is MtxcaResultado {
  return value === 'A' || value === 'O' || value === 'R';
}

function validated<T>(build: (f: XsdFields) => T): T {
  const f = new XsdFields();
  const value = build(f);
  f.throwIfErrors('Parámetros inválidos');
  return value;
}

function validCaea(caea: string | number): string {
  return validated((f) => f.codigoAutorizacion('caea', caea, true)) as string;
}

/**
 * Cliente de bajo nivel de WSMTXCA: una función por operación del WSDL. No
 * maneja la autenticación (recibe `MtxcaAuth`) ni la numeración.
 *
 * - Valida los requests contra el XSD y redondea importes (`ArcaValidationError`).
 * - Las consultas lanzan `ArcaServiceError` si ARCA devuelve `arrayErrores`.
 * - Las emisiones (`autorizar*`, `informar*`, `solicitarCAEA`) usan
 *   `kind: 'emision'`: no se reintentan y, si no hay respuesta, el
 *   `ArcaSoapError` tiene `uncertain: true`.
 */
export class MtxcaClient {
  private readonly config: MtxcaClientConfig;

  constructor(config: MtxcaClientConfig) {
    if (!config?.endpoint) throw new TypeError('MtxcaClient: endpoint es obligatorio');
    this.config = config;
  }

  get endpoint(): string {
    return this.config.endpoint;
  }

  private call(
    method: string,
    params: R,
    kind: SoapOperationKind,
    opts?: CallOptions,
    requestElement: string | null = `${method}Request`,
  ): Promise<R> {
    const { endpoint, timeout, retries, retryDelayMs, onEvent, fetch, legacyTls } = this.config;
    return afipSoapCall(endpoint, MTXCA_NAMESPACE, method, params, {
      timeout,
      retries,
      retryDelayMs,
      onEvent,
      fetch,
      legacyTls,
      kind,
      signal: opts?.signal,
      requestElement,
      responseElement: `${method}Response`,
      soapActionFromMethod: true,
    });
  }

  private static authRequest(auth: MtxcaAuth): R {
    return { token: auth.token, sign: auth.sign, cuitRepresentada: auth.cuitRepresentada };
  }

  /** Llamada autenticada: `authRequest` primero, como en todos los request del XSD. */
  private callAuth(
    method: string,
    auth: MtxcaAuth,
    params: R,
    kind: SoapOperationKind,
    opts?: CallOptions,
  ): Promise<R> {
    return this.call(method, { authRequest: MtxcaClient.authRequest(auth), ...params }, kind, opts);
  }

  /** Consulta: lanza `ArcaServiceError` si la respuesta trae `arrayErrores`. */
  private async consulta(method: string, auth: MtxcaAuth, params: R, opts?: CallOptions): Promise<R> {
    const result = await this.callAuth(method, auth, params, 'consulta', opts);
    checkServiceErrors(result, `${SERVICE} ${method}`);
    return result;
  }

  // =========================================================================
  // Estado
  // =========================================================================

  /** `dummy`: estado de los servidores. No requiere autenticación. */
  async dummy(opts?: CallOptions): Promise<ServerStatus> {
    const result = await this.call('dummy', {}, 'consulta', opts, null);
    const r = new ResponseReader('dummy', 'consulta');
    return {
      appserver: r.str(result, 'appserver'),
      authserver: r.str(result, 'authserver'),
      dbserver: r.str(result, 'dbserver'),
    };
  }

  // =========================================================================
  // CAE
  // =========================================================================

  /**
   * `autorizarComprobante`. Valida contra el XSD y redondea; no valida la
   * coherencia de importes (eso lo hace `ArcaMtxca.autorizar`). Un rechazo
   * devuelve `resultado: 'R'` con `errores` (no lanza).
   */
  async autorizarComprobante(
    auth: MtxcaAuth,
    comprobante: MtxcaComprobanteCAE,
    opts?: CallOptions,
  ): Promise<MtxcaAutorizarResult> {
    return this.autorizarCAE('autorizarComprobante', auth, comprobante, opts);
  }

  /** `autorizarAjusteIVA`: comprobante de ajuste de IVA con CAE (ND/NC 2, 3, 7, 8, 52, 53). */
  async autorizarAjusteIVA(
    auth: MtxcaAuth,
    comprobante: MtxcaComprobanteCAE,
    opts?: CallOptions,
  ): Promise<MtxcaAutorizarResult> {
    return this.autorizarCAE('autorizarAjusteIVA', auth, comprobante, opts);
  }

  private async autorizarCAE(
    method: string,
    auth: MtxcaAuth,
    comprobante: MtxcaComprobanteCAE,
    opts?: CallOptions,
  ): Promise<MtxcaAutorizarResult> {
    const comprobanteCAERequest = buildComprobante(comprobante, 'cae');
    const result = await this.callAuth(method, auth, { comprobanteCAERequest }, 'emision', opts);
    const r = new ResponseReader(method, 'emision');
    const resultado = this.resultado(r, result, method);
    const base = {
      observaciones: r.codigosDescripciones(result['arrayObservaciones'], 'arrayObservaciones'),
      errores: r.codigosDescripciones(result['arrayErrores'], 'arrayErrores'),
      evento: r.evento(result),
    };
    if (resultado === 'R') return { resultado, ...base };
    const cr = r.obj(result, 'comprobanteResponse');
    return {
      resultado,
      comprobante: {
        cuit: r.str(cr, 'cuit', 'comprobanteResponse.cuit'),
        codigoTipoComprobante: r.num(cr, 'codigoTipoComprobante', 'comprobanteResponse.codigoTipoComprobante'),
        numeroPuntoVenta: r.num(cr, 'numeroPuntoVenta', 'comprobanteResponse.numeroPuntoVenta'),
        numeroComprobante: r.num(cr, 'numeroComprobante', 'comprobanteResponse.numeroComprobante'),
        fechaEmision: r.str(cr, 'fechaEmision', 'comprobanteResponse.fechaEmision'),
        cae: r.str(cr, 'CAE', 'comprobanteResponse.CAE'),
        fechaVencimientoCAE: r.str(cr, 'fechaVencimientoCAE', 'comprobanteResponse.fechaVencimientoCAE'),
      },
      ...base,
    };
  }

  /**
   * `resultado` es obligatorio. Si falta y hay `arrayErrores`, es un rechazo
   * (`ArcaServiceError`); si falta sin errores, la respuesta es ilegible
   * (`ArcaSoapError` con `uncertain`).
   */
  private resultado(r: ResponseReader, result: R, method: string): MtxcaResultado {
    if (!r.has(result, 'resultado')) {
      checkServiceErrors(result, `${SERVICE} ${method}`);
      throw r.invalid('resultado');
    }
    const resultado = r.str(result, 'resultado');
    if (!isResultado(resultado)) throw r.invalid('resultado', `valor "${resultado}" inesperado en`);
    return resultado;
  }

  // =========================================================================
  // CAEA
  // =========================================================================

  /**
   * `solicitarCAEA`. `periodo` AAAAMM, `orden` 1 (primera quincena) o 2.
   * Lanza `ArcaServiceError` si ARCA lo rechaza. Es una emisión: si el
   * resultado es incierto, recuperalo con `consultarCAEAEntreFechas`.
   */
  async solicitarCAEA(auth: MtxcaAuth, periodo: number, orden: number, opts?: CallOptions): Promise<MtxcaCAEA> {
    const solicitudCAEA = validated((f) => {
      const p = f.int('periodo', periodo, true, 190001, 999912);
      if (p !== undefined && (p % 100 < 1 || p % 100 > 12)) f.fail('periodo', 'formato AAAAMM', periodo);
      return { periodo: p, orden: f.int('orden', orden, true, 1, 2) };
    });
    const result = await this.callAuth('solicitarCAEA', auth, { solicitudCAEA }, 'emision', opts);
    checkServiceErrors(result, `${SERVICE} solicitarCAEA`);
    const r = new ResponseReader('solicitarCAEA', 'emision');
    return this.parseCAEA(r, r.obj(result, 'CAEAResponse'), 'CAEAResponse');
  }

  /** `consultarCAEA`: datos de un CAEA otorgado. */
  async consultarCAEA(auth: MtxcaAuth, caea: string, opts?: CallOptions): Promise<MtxcaCAEA> {
    const result = await this.consulta('consultarCAEA', auth, { CAEA: validCaea(caea) }, opts);
    const r = new ResponseReader('consultarCAEA', 'consulta');
    return this.parseCAEA(r, r.obj(result, 'CAEAResponse'), 'CAEAResponse');
  }

  /** `consultarCAEAEntreFechas`: CAEAs otorgados con vigencia entre dos fechas. */
  async consultarCAEAEntreFechas(
    auth: MtxcaAuth,
    fechaDesde: FechaInput,
    fechaHasta: FechaInput,
    opts?: CallOptions,
  ): Promise<MtxcaCAEA[]> {
    const params = validated((f) => ({
      fechaDesde: f.date('fechaDesde', fechaDesde, true),
      fechaHasta: f.date('fechaHasta', fechaHasta, true),
    }));
    const result = await this.consulta('consultarCAEAEntreFechas', auth, params, opts);
    const r = new ResponseReader('consultarCAEAEntreFechas', 'consulta');
    return r
      .list(result['arrayCAEAResponse'], 'CAEAResponse')
      .map((c, i) => this.parseCAEA(r, c, `arrayCAEAResponse.CAEAResponse[${i}]`));
  }

  private parseCAEA(r: ResponseReader, c: R, path: string): MtxcaCAEA {
    return {
      fechaProceso: r.str(c, 'fechaProceso', `${path}.fechaProceso`),
      caea: r.str(c, 'CAEA', `${path}.CAEA`),
      periodo: r.num(c, 'periodo', `${path}.periodo`),
      orden: r.num(c, 'orden', `${path}.orden`),
      fechaDesde: r.str(c, 'fechaDesde', `${path}.fechaDesde`),
      fechaHasta: r.str(c, 'fechaHasta', `${path}.fechaHasta`),
      fechaTopeInforme: r.str(c, 'fechaTopeInforme', `${path}.fechaTopeInforme`),
      observaciones: r.codigosDescripciones(c['arrayObservaciones'], `${path}.arrayObservaciones`),
    };
  }

  /** `informarComprobanteCAEA`. Un rechazo devuelve `resultado: 'R'` con `errores`. */
  async informarComprobanteCAEA(
    auth: MtxcaAuth,
    comprobante: MtxcaComprobanteCAEA,
    opts?: CallOptions,
  ): Promise<MtxcaInformarCAEAResult> {
    return this.informarCAEA('informarComprobanteCAEA', auth, comprobante, opts);
  }

  /** `informarAjusteIVACAEA`. Un rechazo devuelve `resultado: 'R'` con `errores`. */
  async informarAjusteIVACAEA(
    auth: MtxcaAuth,
    comprobante: MtxcaComprobanteCAEA,
    opts?: CallOptions,
  ): Promise<MtxcaInformarCAEAResult> {
    return this.informarCAEA('informarAjusteIVACAEA', auth, comprobante, opts);
  }

  private async informarCAEA(
    method: string,
    auth: MtxcaAuth,
    comprobante: MtxcaComprobanteCAEA,
    opts?: CallOptions,
  ): Promise<MtxcaInformarCAEAResult> {
    const comprobanteCAEARequest = buildComprobante(comprobante, 'caea');
    const result = await this.callAuth(method, auth, { comprobanteCAEARequest }, 'emision', opts);
    const r = new ResponseReader(method, 'emision');
    const resultado = this.resultado(r, result, method);
    const base = {
      observaciones: r.codigosDescripciones(result['arrayObservaciones'], 'arrayObservaciones'),
      errores: r.codigosDescripciones(result['arrayErrores'], 'arrayErrores'),
      evento: r.evento(result),
    };
    if (resultado === 'R') return { resultado, fechaProceso: r.optStr(result, 'fechaProceso'), ...base };
    const cr = r.obj(result, 'comprobanteCAEAResponse');
    return {
      resultado,
      fechaProceso: r.str(result, 'fechaProceso'),
      comprobante: {
        caea: r.str(cr, 'CAEA', 'comprobanteCAEAResponse.CAEA'),
        codigoTipoComprobante: r.num(cr, 'codigoTipoComprobante', 'comprobanteCAEAResponse.codigoTipoComprobante'),
        numeroPuntoVenta: r.num(cr, 'numeroPuntoVenta', 'comprobanteCAEAResponse.numeroPuntoVenta'),
        numeroComprobante: r.num(cr, 'numeroComprobante', 'comprobanteCAEAResponse.numeroComprobante'),
      },
      ...base,
    };
  }

  /** `informarCAEANoUtilizado`: informa que un CAEA no se usó en ningún punto de venta. */
  async informarCAEANoUtilizado(
    auth: MtxcaAuth,
    caea: string,
    opts?: CallOptions,
  ): Promise<MtxcaCAEANoUtilizadoResult> {
    return this.caeaNoUtilizado('informarCAEANoUtilizado', auth, { CAEA: validCaea(caea) }, opts);
  }

  /** `informarCAEANoUtilizadoPtoVta`: informa que un CAEA no se usó en un punto de venta. */
  async informarCAEANoUtilizadoPtoVta(
    auth: MtxcaAuth,
    caea: string,
    numeroPuntoVenta: number,
    opts?: CallOptions,
  ): Promise<MtxcaCAEANoUtilizadoResult> {
    const ptoVta = validated((f) => f.int('numeroPuntoVenta', numeroPuntoVenta, true, 1, 99998));
    return this.caeaNoUtilizado(
      'informarCAEANoUtilizadoPtoVta',
      auth,
      { CAEA: validCaea(caea), numeroPuntoVenta: ptoVta },
      opts,
    );
  }

  private async caeaNoUtilizado(
    method: string,
    auth: MtxcaAuth,
    params: R,
    opts?: CallOptions,
  ): Promise<MtxcaCAEANoUtilizadoResult> {
    const result = await this.callAuth(method, auth, params, 'emision', opts);
    const r = new ResponseReader(method, 'emision');
    const resultado = this.resultado(r, result, method);
    const aprobado = resultado !== 'R';
    const conPtoVta = 'numeroPuntoVenta' in params;
    return {
      resultado,
      fechaProceso: aprobado ? r.str(result, 'fechaProceso') : r.optStr(result, 'fechaProceso'),
      caea: aprobado ? r.str(result, 'CAEA') : r.optStr(result, 'CAEA'),
      ...(conPtoVta
        ? { numeroPuntoVenta: aprobado ? r.num(result, 'numeroPuntoVenta') : r.optNum(result, 'numeroPuntoVenta') }
        : {}),
      errores: r.codigosDescripciones(result['arrayErrores'], 'arrayErrores'),
      evento: r.evento(result),
    };
  }

  /** `consultarPtosVtaCAEANoInformados`: puntos de venta que todavía no informaron movimientos para el CAEA. */
  async consultarPtosVtaCAEANoInformados(auth: MtxcaAuth, caea: string, opts?: CallOptions): Promise<PuntoVenta[]> {
    const result = await this.consulta('consultarPtosVtaCAEANoInformados', auth, { CAEA: validCaea(caea) }, opts);
    const r = new ResponseReader('consultarPtosVtaCAEANoInformados', 'consulta');
    return this.parsePuntosVenta(r, r.list(result['arrayPuntosVenta'], 'puntoVenta'));
  }

  // =========================================================================
  // Consultas de comprobantes
  // =========================================================================

  /**
   * `consultarUltimoComprobanteAutorizado`. Lanza `ArcaServiceError` ante
   * cualquier error, incluido 1502 (no hay comprobantes para ese punto de venta
   * y tipo); `ArcaMtxca.ultimoComprobante` lo traduce a 0.
   */
  async consultarUltimoComprobanteAutorizado(
    auth: MtxcaAuth,
    ptoVta: number,
    cbteTipo: number,
    opts?: CallOptions,
  ): Promise<number> {
    const consultaUltimoComprobanteAutorizadoRequest = validated((f) => ({
      codigoTipoComprobante: f.int('cbteTipo', cbteTipo, true),
      numeroPuntoVenta: f.int('ptoVta', ptoVta, true, 1, 99998),
    }));
    const result = await this.consulta(
      'consultarUltimoComprobanteAutorizado',
      auth,
      { consultaUltimoComprobanteAutorizadoRequest },
      opts,
    );
    return new ResponseReader('consultarUltimoComprobanteAutorizado', 'consulta').num(result, 'numeroComprobante');
  }

  /** `consultarComprobante`: datos de un comprobante autorizado (CAE) o informado (CAEA). */
  async consultarComprobante(
    auth: MtxcaAuth,
    cbteTipo: number,
    ptoVta: number,
    cbteNro: number,
    opts?: CallOptions,
  ): Promise<MtxcaConsultaComprobanteResult> {
    const consultaComprobanteRequest = validated((f) => ({
      codigoTipoComprobante: f.int('cbteTipo', cbteTipo, true),
      numeroPuntoVenta: f.int('ptoVta', ptoVta, true, 1, 99998),
      numeroComprobante: f.int('cbteNro', cbteNro, true, 1, 99999999),
    }));
    const result = await this.consulta('consultarComprobante', auth, { consultaComprobanteRequest }, opts);
    const r = new ResponseReader('consultarComprobante', 'consulta');
    return {
      comprobante: parseComprobante(r, r.obj(result, 'comprobante')),
      observaciones: r.codigosDescripciones(result['arrayObservaciones'], 'arrayObservaciones'),
      evento: r.evento(result),
    };
  }

  // =========================================================================
  // Parámetros
  // =========================================================================

  private async codigos(
    method: string,
    container: string,
    auth: MtxcaAuth,
    opts?: CallOptions,
    params: R = {},
  ): Promise<CodigoDescripcion[]> {
    const result = await this.consulta(method, auth, params, opts);
    const r = new ResponseReader(method, 'consulta');
    return r
      .requiredList(result, container, 'codigoDescripcion')
      .map((cd, i) => r.codigoDescripcion(cd, `${container}[${i}]`));
  }

  consultarTiposComprobante(auth: MtxcaAuth, opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.codigos('consultarTiposComprobante', 'arrayTiposComprobante', auth, opts);
  }

  consultarTiposDocumento(auth: MtxcaAuth, opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.codigos('consultarTiposDocumento', 'arrayTiposDocumento', auth, opts);
  }

  consultarAlicuotasIVA(auth: MtxcaAuth, opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.codigos('consultarAlicuotasIVA', 'arrayAlicuotasIVA', auth, opts);
  }

  consultarCondicionesIVA(auth: MtxcaAuth, opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.codigos('consultarCondicionesIVA', 'arrayCondicionesIVA', auth, opts);
  }

  /** Condiciones de IVA del receptor admitidas para un tipo de comprobante (RG 5616). */
  async consultarCondicionesIVAReceptor(
    auth: MtxcaAuth,
    cbteTipo: number,
    opts?: CallOptions,
  ): Promise<CodigoDescripcion[]> {
    const consultaCondicionesIVAReceptorRequest = validated((f) => ({
      codigoTipoComprobante: f.int('cbteTipo', cbteTipo, true),
    }));
    const result = await this.consulta(
      'consultarCondicionesIVAReceptor',
      auth,
      { consultaCondicionesIVAReceptorRequest },
      opts,
    );
    const r = new ResponseReader('consultarCondicionesIVAReceptor', 'consulta');
    return r.codigosDescripciones(result['arrayCondicionesIVAReceptor'], 'arrayCondicionesIVAReceptor');
  }

  consultarUnidadesMedida(auth: MtxcaAuth, opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.codigos('consultarUnidadesMedida', 'arrayUnidadesMedida', auth, opts);
  }

  consultarTiposTributo(auth: MtxcaAuth, opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.codigos('consultarTiposTributo', 'arrayTiposTributo', auth, opts);
  }

  consultarTiposDatosAdicionales(auth: MtxcaAuth, opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.codigos('consultarTiposDatosAdicionales', 'arrayTiposDatosAdicionales', auth, opts);
  }

  async consultarMonedas(auth: MtxcaAuth, opts?: CallOptions): Promise<CodigoDescripcionString[]> {
    const result = await this.consulta('consultarMonedas', auth, {}, opts);
    const r = new ResponseReader('consultarMonedas', 'consulta');
    return r.requiredList(result, 'arrayMonedas', 'codigoDescripcion').map((m, i) => ({
      codigo: r.str(m, 'codigo', `arrayMonedas[${i}].codigo`),
      descripcion: r.str(m, 'descripcion', `arrayMonedas[${i}].descripcion`),
    }));
  }

  /**
   * `consultarCotizacionMoneda`. `cotizacion` es `null` si ARCA no tiene
   * cotización para la moneda en esa fecha (responde sin valor y sin error).
   */
  async consultarCotizacionMoneda(
    auth: MtxcaAuth,
    codigoMoneda: string,
    fechaCotizacion: FechaInput,
    opts?: CallOptions,
  ): Promise<CotizacionResult> {
    const params = validated((f) => ({
      codigoMoneda: f.text('codigoMoneda', codigoMoneda, true, 3),
      fechaCotizacion: f.date('fechaCotizacion', fechaCotizacion, true),
    }));
    const result = await this.consulta('consultarCotizacionMoneda', auth, params, opts);
    const r = new ResponseReader('consultarCotizacionMoneda', 'consulta');
    return {
      codigoMoneda: params.codigoMoneda as string,
      fechaCotizacion: params.fechaCotizacion as string,
      cotizacion: r.optNum(result, 'cotizacionMoneda') ?? null,
    };
  }

  private async puntosVenta(method: string, auth: MtxcaAuth, opts?: CallOptions): Promise<PuntoVenta[]> {
    const result = await this.consulta(method, auth, {}, opts);
    const r = new ResponseReader(method, 'consulta');
    return this.parsePuntosVenta(r, r.requiredList(result, 'arrayPuntosVenta', 'puntoVenta'));
  }

  private parsePuntosVenta(r: ResponseReader, list: R[]): PuntoVenta[] {
    return list.map((pv, i) => ({
      numeroPuntoVenta: r.num(pv, 'numeroPuntoVenta', `puntoVenta[${i}].numeroPuntoVenta`),
      bloqueado: r.str(pv, 'bloqueado', `puntoVenta[${i}].bloqueado`),
      fechaBaja: r.optStr(pv, 'fechaBaja'),
    }));
  }

  consultarPuntosVenta(auth: MtxcaAuth, opts?: CallOptions): Promise<PuntoVenta[]> {
    return this.puntosVenta('consultarPuntosVenta', auth, opts);
  }

  consultarPuntosVentaCAE(auth: MtxcaAuth, opts?: CallOptions): Promise<PuntoVenta[]> {
    return this.puntosVenta('consultarPuntosVentaCAE', auth, opts);
  }

  consultarPuntosVentaCAEA(auth: MtxcaAuth, opts?: CallOptions): Promise<PuntoVenta[]> {
    return this.puntosVenta('consultarPuntosVentaCAEA', auth, opts);
  }

  /** `consultarActividadesVigentes`: actividades vigentes del emisor. */
  async consultarActividadesVigentes(auth: MtxcaAuth, opts?: CallOptions): Promise<ActividadVigente[]> {
    const result = await this.consulta('consultarActividadesVigentes', auth, {}, opts);
    const r = new ResponseReader('consultarActividadesVigentes', 'consulta');
    return r.list(result['arrayActividades'], 'actividad').map((a, i) => ({
      codigo: r.num(a, 'codigo', `arrayActividades[${i}].codigo`),
      orden: r.num(a, 'orden', `arrayActividades[${i}].orden`),
      descripcion: r.str(a, 'descripcion', `arrayActividades[${i}].descripcion`),
    }));
  }
}

/** Parsea un `ComprobanteType` de `consultarComprobante`. */
function parseComprobante(r: ResponseReader, c: R): MtxcaComprobanteConsultado {
  const periodo = r.optObj(c, 'periodoComprobantesAsociados');
  return {
    codigoTipoComprobante: r.num(c, 'codigoTipoComprobante', 'comprobante.codigoTipoComprobante'),
    numeroPuntoVenta: r.num(c, 'numeroPuntoVenta', 'comprobante.numeroPuntoVenta'),
    numeroComprobante: r.num(c, 'numeroComprobante', 'comprobante.numeroComprobante'),
    fechaEmision: r.optStr(c, 'fechaEmision'),
    codigoTipoAutorizacion: r.optStr(c, 'codigoTipoAutorizacion'),
    codigoAutorizacion: r.optStr(c, 'codigoAutorizacion'),
    fechaVencimiento: r.optStr(c, 'fechaVencimiento'),
    codigoTipoDocumento: r.optNum(c, 'codigoTipoDocumento'),
    numeroDocumento: r.optStr(c, 'numeroDocumento'),
    condicionIVAReceptor: r.optNum(c, 'condicionIVAReceptor'),
    importeGravado: r.optNum(c, 'importeGravado'),
    importeNoGravado: r.optNum(c, 'importeNoGravado'),
    importeExento: r.optNum(c, 'importeExento'),
    importeSubtotal: r.num(c, 'importeSubtotal', 'comprobante.importeSubtotal'),
    importeOtrosTributos: r.optNum(c, 'importeOtrosTributos'),
    importeTotal: r.num(c, 'importeTotal', 'comprobante.importeTotal'),
    codigoMoneda: r.str(c, 'codigoMoneda', 'comprobante.codigoMoneda'),
    cotizacionMoneda: r.optNum(c, 'cotizacionMoneda'),
    cancelaEnMismaMonedaExtranjera: r.optStr(c, 'cancelaEnMismaMonedaExtranjera'),
    observaciones: r.optStr(c, 'observaciones'),
    codigoConcepto: r.num(c, 'codigoConcepto', 'comprobante.codigoConcepto'),
    fechaServicioDesde: r.optStr(c, 'fechaServicioDesde'),
    fechaServicioHasta: r.optStr(c, 'fechaServicioHasta'),
    fechaVencimientoPago: r.optStr(c, 'fechaVencimientoPago'),
    fechaHoraGen: r.optStr(c, 'fechaHoraGen'),
    comprobantesAsociados: r.list(c['arrayComprobantesAsociados'], 'comprobanteAsociado').map((a, i) => {
      const p = `comprobante.arrayComprobantesAsociados[${i}]`;
      return {
        codigoTipoComprobante: r.num(a, 'codigoTipoComprobante', `${p}.codigoTipoComprobante`),
        numeroPuntoVenta: r.num(a, 'numeroPuntoVenta', `${p}.numeroPuntoVenta`),
        numeroComprobante: r.num(a, 'numeroComprobante', `${p}.numeroComprobante`),
        cuit: r.optStr(a, 'cuit'),
        fechaEmision: r.optStr(a, 'fechaEmision'),
      };
    }),
    periodoComprobantesAsociados: periodo
      ? {
          fechaDesde: r.str(periodo, 'fechaDesde', 'comprobante.periodoComprobantesAsociados.fechaDesde'),
          fechaHasta: r.str(periodo, 'fechaHasta', 'comprobante.periodoComprobantesAsociados.fechaHasta'),
        }
      : undefined,
    otrosTributos: r.list(c['arrayOtrosTributos'], 'otroTributo').map((t, i) => {
      const p = `comprobante.arrayOtrosTributos[${i}]`;
      return {
        codigo: r.num(t, 'codigo', `${p}.codigo`),
        descripcion: r.optStr(t, 'descripcion'),
        baseImponible: r.num(t, 'baseImponible', `${p}.baseImponible`),
        importe: r.num(t, 'importe', `${p}.importe`),
      };
    }),
    items: r.requiredList(c, 'arrayItems', 'item').map((it, i) => {
      const p = `comprobante.arrayItems[${i}]`;
      return {
        unidadesMtx: r.optNum(it, 'unidadesMtx'),
        codigoMtx: r.optStr(it, 'codigoMtx'),
        codigo: r.optStr(it, 'codigo'),
        descripcion: r.str(it, 'descripcion', `${p}.descripcion`),
        cantidad: r.optNum(it, 'cantidad'),
        codigoUnidadMedida: r.num(it, 'codigoUnidadMedida', `${p}.codigoUnidadMedida`),
        precioUnitario: r.optNum(it, 'precioUnitario'),
        importeBonificacion: r.optNum(it, 'importeBonificacion'),
        codigoCondicionIVA: r.num(it, 'codigoCondicionIVA', `${p}.codigoCondicionIVA`),
        importeIVA: r.optNum(it, 'importeIVA'),
        importeItem: r.num(it, 'importeItem', `${p}.importeItem`),
      };
    }),
    subtotalesIVA: r.list(c['arraySubtotalesIVA'], 'subtotalIVA').map((s, i) => ({
      codigo: r.num(s, 'codigo', `comprobante.arraySubtotalesIVA[${i}].codigo`),
      importe: r.num(s, 'importe', `comprobante.arraySubtotalesIVA[${i}].importe`),
    })),
    datosAdicionales: r.list(c['arrayDatosAdicionales'], 'datoAdicional').map((d, i) => ({
      t: r.num(d, 't', `comprobante.arrayDatosAdicionales[${i}].t`),
      c1: r.optStr(d, 'c1'),
      c2: r.optStr(d, 'c2'),
      c3: r.optStr(d, 'c3'),
      c4: r.optStr(d, 'c4'),
      c5: r.optStr(d, 'c5'),
      c6: r.optStr(d, 'c6'),
    })),
    compradores: r.list(c['arrayCompradores'], 'comprador').map((x, i) => {
      const p = `comprobante.arrayCompradores[${i}]`;
      return {
        codigoTipoDocumento: r.num(x, 'codigoTipoDocumento', `${p}.codigoTipoDocumento`),
        numeroDocumento: r.str(x, 'numeroDocumento', `${p}.numeroDocumento`),
        porcentaje: r.num(x, 'porcentaje', `${p}.porcentaje`),
      };
    }),
    actividades: r
      .list(c['arrayActividades'], 'actividad')
      .map((a, i) => r.num(a, 'codigo', `comprobante.arrayActividades[${i}].codigo`)),
  };
}
