import { ArcaSoapError, checkServiceErrors, parseServerStatus, SoapServiceClient } from '@ramiidv/arca-common';
import type { ArcaEvent, CallOptions, LegacyTlsMode, ServerStatus, SoapOperationKind } from '@ramiidv/arca-common';
import { date, dec, decodeResponse, encodeRequest, int, must, obj, opt, wrapped } from '@ramiidv/arca-common/schema';
import type { Schema } from '@ramiidv/arca-common/schema';
import { MTXCA_NAMESPACE } from './constants.js';
import {
  ACTIVIDAD_VIGENTE,
  CAEA_NO_UTILIZADO,
  CAEA_RESPONSE,
  CODIGOS,
  CODIGOS_STRING,
  COMPROBANTE_CAE_RESPONSE,
  COMPROBANTE_CAEA_RESPONSE,
  COMPROBANTE_CONSULTADO,
  CONSULTA_COMPROBANTE,
  CONSULTA_CONDICIONES_IVA,
  CONSULTA_ULTIMO,
  COTIZACION,
  ENTRE_FECHAS,
  EVENTO,
  PTO_VTA,
  PUNTO_VENTA,
  RESULTADO,
  SOLICITUD_CAEA,
} from './schemas.js';
import { buildComprobante, encodeCaea } from './serialize.js';
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
  MtxcaComprobanteCAEAResponse,
  MtxcaComprobanteCAEResponse,
  MtxcaComprobanteConsultado,
  MtxcaConsultaComprobanteResult,
  MtxcaInformarCAEAResult,
  MtxcaResultado,
  PuntoVenta,
} from './types.js';

type R = Record<string, unknown>;

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

/**
 * Respuesta ilegible: `ArcaSoapError` (`uncertain` en emisiones: el
 * comprobante pudo haberse procesado aunque la respuesta no se pueda leer).
 */
function invalid(message: string, kind: SoapOperationKind): ArcaSoapError {
  return new ArcaSoapError(message, { uncertain: kind === 'emision' });
}

function decode<T>(node: unknown, schema: Schema, path: string, kind: SoapOperationKind): T {
  return decodeResponse<T>(node, schema, path, { error: (m) => invalid(m, kind) });
}

/**
 * Elemento obligatorio del XSD que el DSL no verifica: un contenedor de lista
 * (`[]` si viene vacío) o un elemento complejo (`complex`: tiene que tener hijos).
 */
function requerido(node: R, key: string, path: string, kind: SoapOperationKind, complex = false): void {
  const v = node[key];
  const ok = complex ? v !== null && typeof v === 'object' && !Array.isArray(v) : v !== undefined && v !== null;
  if (!ok) throw invalid(`Respuesta inválida: falta ${path}.${key}`, kind);
}

interface ResultadoRaw {
  resultado?: string;
  arrayObservaciones: CodigoDescripcion[];
  arrayErrores: CodigoDescripcion[];
  evento?: CodigoDescripcion;
}

interface CAEARaw extends Omit<MtxcaCAEA, 'caea' | 'observaciones'> {
  CAEA: string;
  arrayObservaciones: CodigoDescripcion[];
}

function toCAEA({ CAEA, arrayObservaciones, ...rest }: CAEARaw): MtxcaCAEA {
  return { ...rest, caea: CAEA, observaciones: arrayObservaciones };
}

/** `ComprobanteType` decodificado, con los nombres del XML. */
interface ComprobanteRaw
  extends Omit<
    MtxcaComprobanteConsultado,
    | 'comprobantesAsociados'
    | 'otrosTributos'
    | 'items'
    | 'subtotalesIVA'
    | 'datosAdicionales'
    | 'compradores'
    | 'actividades'
  > {
  arrayComprobantesAsociados: MtxcaComprobanteConsultado['comprobantesAsociados'];
  arrayOtrosTributos: MtxcaComprobanteConsultado['otrosTributos'];
  arrayItems: MtxcaComprobanteConsultado['items'];
  arraySubtotalesIVA: MtxcaComprobanteConsultado['subtotalesIVA'];
  arrayDatosAdicionales: MtxcaComprobanteConsultado['datosAdicionales'];
  arrayCompradores: MtxcaComprobanteConsultado['compradores'];
  arrayActividades: Array<{ codigo: number }>;
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
export class MtxcaClient extends SoapServiceClient {
  constructor(config: MtxcaClientConfig) {
    if (!config?.endpoint) throw new TypeError('MtxcaClient: endpoint es obligatorio');
    const { endpoint, timeout, retries, retryDelayMs, onEvent, fetch, legacyTls } = config;
    super({
      endpoint,
      namespace: MTXCA_NAMESPACE,
      transport: { timeout, retries, retryDelayMs, onEvent, fetch, legacyTls },
    });
  }

  private call(
    method: string,
    params: R,
    kind: SoapOperationKind,
    opts?: CallOptions,
    requestElement: string | null = `${method}Request`,
  ): Promise<R> {
    return this.soapCall(method, params, {
      kind,
      signal: opts?.signal,
      requestElement,
      responseElement: `${method}Response`,
      soapActionFromMethod: true,
      // Todo como texto: los schemas convierten cada campo según el XSD.
      parseNumbers: false,
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
    return parseServerStatus(await this.call('dummy', {}, 'consulta', opts, null));
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
    const { resultado, base } = this.resultado(result, method);
    if (resultado === 'R') return { resultado, ...base };
    requerido(result, 'comprobanteResponse', method, 'emision', true);
    const { CAE, ...cr } = decode<Omit<MtxcaComprobanteCAEResponse, 'cae'> & { CAE: string }>(
      result['comprobanteResponse'],
      COMPROBANTE_CAE_RESPONSE,
      `${method}.comprobanteResponse`,
      'emision',
    );
    return { resultado, comprobante: { ...cr, cae: CAE }, ...base };
  }

  /**
   * Decodifica `resultado`, `arrayObservaciones`, `arrayErrores` y `evento`.
   * `resultado` es obligatorio: si falta y hay `arrayErrores`, es un rechazo
   * (`ArcaServiceError`); si falta sin errores, la respuesta es ilegible
   * (`ArcaSoapError` con `uncertain`).
   */
  private resultado(
    result: R,
    method: string,
  ): {
    resultado: MtxcaResultado;
    base: { observaciones: CodigoDescripcion[]; errores: CodigoDescripcion[]; evento?: CodigoDescripcion };
  } {
    const r = decode<ResultadoRaw>(result, RESULTADO, method, 'emision');
    if (!r.resultado) {
      checkServiceErrors(result, `${SERVICE} ${method}`);
      throw invalid(`Respuesta inválida: falta ${method}.resultado`, 'emision');
    }
    if (!isResultado(r.resultado)) {
      throw invalid(`Respuesta inválida: valor "${r.resultado}" inesperado en ${method}.resultado`, 'emision');
    }
    return {
      resultado: r.resultado,
      base: { observaciones: r.arrayObservaciones, errores: r.arrayErrores, evento: r.evento },
    };
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
    const solicitudCAEA = encodeRequest({ periodo, orden }, SOLICITUD_CAEA, 'solicitarCAEA', (i, errors) => {
      const p = i['periodo'];
      if (Number.isInteger(p) && ((p as number) % 100 < 1 || (p as number) % 100 > 12)) {
        errors.push({ field: 'periodo', message: 'periodo: debe tener formato AAAAMM (mes 01 a 12)', value: p });
      }
    });
    const result = await this.callAuth('solicitarCAEA', auth, { solicitudCAEA }, 'emision', opts);
    checkServiceErrors(result, `${SERVICE} solicitarCAEA`);
    return this.parseCAEA(result, 'solicitarCAEA', 'emision');
  }

  /** `consultarCAEA`: datos de un CAEA otorgado. */
  async consultarCAEA(auth: MtxcaAuth, caea: string, opts?: CallOptions): Promise<MtxcaCAEA> {
    const CAEA = encodeCaea(caea, 'consultarCAEA');
    const result = await this.consulta('consultarCAEA', auth, { CAEA }, opts);
    return this.parseCAEA(result, 'consultarCAEA', 'consulta');
  }

  /** `CAEAResponse` obligatorio de `solicitarCAEA` / `consultarCAEA`. */
  private parseCAEA(result: R, method: string, kind: SoapOperationKind): MtxcaCAEA {
    requerido(result, 'CAEAResponse', method, kind, true);
    return toCAEA(decode<CAEARaw>(result['CAEAResponse'], CAEA_RESPONSE, `${method}.CAEAResponse`, kind));
  }

  /** `consultarCAEAEntreFechas`: CAEAs otorgados con vigencia entre dos fechas. */
  async consultarCAEAEntreFechas(
    auth: MtxcaAuth,
    fechaDesde: FechaInput,
    fechaHasta: FechaInput,
    opts?: CallOptions,
  ): Promise<MtxcaCAEA[]> {
    const params = encodeRequest({ fechaDesde, fechaHasta }, ENTRE_FECHAS, 'consultarCAEAEntreFechas');
    const result = await this.consulta('consultarCAEAEntreFechas', auth, params, opts);
    const { arrayCAEAResponse } = decode<{ arrayCAEAResponse: CAEARaw[] }>(
      result,
      { arrayCAEAResponse: wrapped('CAEAResponse', obj(CAEA_RESPONSE), 0) },
      'consultarCAEAEntreFechas',
      'consulta',
    );
    return arrayCAEAResponse.map(toCAEA);
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
    const { resultado, base } = this.resultado(result, method);
    const { fechaProceso } = decode<{ fechaProceso?: string }>(
      result,
      { fechaProceso: opt(date()) },
      method,
      'emision',
    );
    if (resultado === 'R') return { resultado, fechaProceso, ...base };
    if (fechaProceso === undefined) throw invalid(`Respuesta inválida: falta ${method}.fechaProceso`, 'emision');
    requerido(result, 'comprobanteCAEAResponse', method, 'emision', true);
    const { CAEA, ...cr } = decode<Omit<MtxcaComprobanteCAEAResponse, 'caea'> & { CAEA: string }>(
      result['comprobanteCAEAResponse'],
      COMPROBANTE_CAEA_RESPONSE,
      `${method}.comprobanteCAEAResponse`,
      'emision',
    );
    return { resultado, fechaProceso, comprobante: { caea: CAEA, ...cr }, ...base };
  }

  /** `informarCAEANoUtilizado`: informa que un CAEA no se usó en ningún punto de venta. */
  async informarCAEANoUtilizado(
    auth: MtxcaAuth,
    caea: string,
    opts?: CallOptions,
  ): Promise<MtxcaCAEANoUtilizadoResult> {
    const CAEA = encodeCaea(caea, 'informarCAEANoUtilizado');
    return this.caeaNoUtilizado('informarCAEANoUtilizado', auth, { CAEA }, opts);
  }

  /** `informarCAEANoUtilizadoPtoVta`: informa que un CAEA no se usó en un punto de venta. */
  async informarCAEANoUtilizadoPtoVta(
    auth: MtxcaAuth,
    caea: string,
    numeroPuntoVenta: number,
    opts?: CallOptions,
  ): Promise<MtxcaCAEANoUtilizadoResult> {
    const method = 'informarCAEANoUtilizadoPtoVta';
    const CAEA = encodeCaea(caea, method);
    const params = encodeRequest({ numeroPuntoVenta }, { numeroPuntoVenta: PTO_VTA }, method);
    return this.caeaNoUtilizado(method, auth, { CAEA, ...params }, opts);
  }

  private async caeaNoUtilizado(
    method: string,
    auth: MtxcaAuth,
    params: R,
    opts?: CallOptions,
  ): Promise<MtxcaCAEANoUtilizadoResult> {
    const result = await this.callAuth(method, auth, params, 'emision', opts);
    const { resultado, base } = this.resultado(result, method);
    const r = decode<{ fechaProceso?: string; CAEA?: string; numeroPuntoVenta?: number }>(
      result,
      CAEA_NO_UTILIZADO,
      method,
      'emision',
    );
    const conPtoVta = 'numeroPuntoVenta' in params;
    // Obligatorios en el XSD; en un rechazo se toleran ausentes.
    const faltante = [
      r.fechaProceso === undefined && 'fechaProceso',
      r.CAEA === undefined && 'CAEA',
      conPtoVta && r.numeroPuntoVenta === undefined && 'numeroPuntoVenta',
    ].find(Boolean);
    if (resultado !== 'R' && faltante) throw invalid(`Respuesta inválida: falta ${method}.${faltante}`, 'emision');
    return {
      resultado,
      fechaProceso: r.fechaProceso,
      caea: r.CAEA,
      ...(conPtoVta ? { numeroPuntoVenta: r.numeroPuntoVenta } : {}),
      errores: base.errores,
      evento: base.evento,
    };
  }

  /** `consultarPtosVtaCAEANoInformados`: puntos de venta que todavía no informaron movimientos para el CAEA. */
  async consultarPtosVtaCAEANoInformados(auth: MtxcaAuth, caea: string, opts?: CallOptions): Promise<PuntoVenta[]> {
    const method = 'consultarPtosVtaCAEANoInformados';
    const result = await this.consulta(method, auth, { CAEA: encodeCaea(caea, method) }, opts);
    return this.parsePuntosVenta(result, method);
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
    const method = 'consultarUltimoComprobanteAutorizado';
    const consultaUltimoComprobanteAutorizadoRequest = encodeRequest(
      { codigoTipoComprobante: cbteTipo, numeroPuntoVenta: ptoVta },
      CONSULTA_ULTIMO,
      method,
    );
    const result = await this.consulta(method, auth, { consultaUltimoComprobanteAutorizadoRequest }, opts);
    return decode<{ numeroComprobante: number }>(result, { numeroComprobante: must(int()) }, method, 'consulta')
      .numeroComprobante;
  }

  /** `consultarComprobante`: datos de un comprobante autorizado (CAE) o informado (CAEA). */
  async consultarComprobante(
    auth: MtxcaAuth,
    cbteTipo: number,
    ptoVta: number,
    cbteNro: number,
    opts?: CallOptions,
  ): Promise<MtxcaConsultaComprobanteResult> {
    const method = 'consultarComprobante';
    const consultaComprobanteRequest = encodeRequest(
      { codigoTipoComprobante: cbteTipo, numeroPuntoVenta: ptoVta, numeroComprobante: cbteNro },
      CONSULTA_COMPROBANTE,
      method,
    );
    const result = await this.consulta(method, auth, { consultaComprobanteRequest }, opts);
    requerido(result, 'comprobante', method, 'consulta', true);
    requerido(result['comprobante'] as R, 'arrayItems', `${method}.comprobante`, 'consulta');
    const r = decode<{
      comprobante: ComprobanteRaw;
      arrayObservaciones: CodigoDescripcion[];
      evento?: CodigoDescripcion;
    }>(
      result,
      { comprobante: obj(COMPROBANTE_CONSULTADO), arrayObservaciones: CODIGOS, evento: EVENTO },
      method,
      'consulta',
    );
    const {
      arrayComprobantesAsociados,
      arrayOtrosTributos,
      arrayItems,
      arraySubtotalesIVA,
      arrayDatosAdicionales,
      arrayCompradores,
      arrayActividades,
      ...c
    } = r.comprobante;
    return {
      comprobante: {
        ...c,
        comprobantesAsociados: arrayComprobantesAsociados,
        otrosTributos: arrayOtrosTributos,
        items: arrayItems,
        subtotalesIVA: arraySubtotalesIVA,
        datosAdicionales: arrayDatosAdicionales,
        compradores: arrayCompradores,
        actividades: arrayActividades.map((a) => a.codigo),
      },
      observaciones: r.arrayObservaciones,
      evento: r.evento,
    };
  }

  // =========================================================================
  // Parámetros
  // =========================================================================

  /** Consulta cuya respuesta es un `ArrayCodigosDescripcionesType` obligatorio. */
  private async codigos<T = CodigoDescripcion>(
    method: string,
    container: string,
    auth: MtxcaAuth,
    opts?: CallOptions,
    lista = CODIGOS,
  ): Promise<T[]> {
    const result = await this.consulta(method, auth, {}, opts);
    requerido(result, container, method, 'consulta');
    return decode<Record<string, T[]>>(result, { [container]: lista }, method, 'consulta')[container];
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
    const method = 'consultarCondicionesIVAReceptor';
    const consultaCondicionesIVAReceptorRequest = encodeRequest(
      { codigoTipoComprobante: cbteTipo },
      CONSULTA_CONDICIONES_IVA,
      method,
    );
    const result = await this.consulta(method, auth, { consultaCondicionesIVAReceptorRequest }, opts);
    return decode<{ arrayCondicionesIVAReceptor: CodigoDescripcion[] }>(
      result,
      { arrayCondicionesIVAReceptor: CODIGOS },
      method,
      'consulta',
    ).arrayCondicionesIVAReceptor;
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

  consultarMonedas(auth: MtxcaAuth, opts?: CallOptions): Promise<CodigoDescripcionString[]> {
    return this.codigos<CodigoDescripcionString>('consultarMonedas', 'arrayMonedas', auth, opts, CODIGOS_STRING);
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
    const method = 'consultarCotizacionMoneda';
    const params = encodeRequest({ codigoMoneda, fechaCotizacion }, COTIZACION, method);
    const result = await this.consulta(method, auth, params, opts);
    const { cotizacionMoneda } = decode<{ cotizacionMoneda?: number }>(
      result,
      { cotizacionMoneda: opt(dec(6)) },
      method,
      'consulta',
    );
    return {
      codigoMoneda: params['codigoMoneda'] as string,
      fechaCotizacion: params['fechaCotizacion'] as string,
      cotizacion: cotizacionMoneda ?? null,
    };
  }

  /** `ArrayPuntosVentaType` (obligatorio salvo en `consultarPtosVtaCAEANoInformados`). */
  private parsePuntosVenta(result: R, method: string, obligatorio = false): PuntoVenta[] {
    if (obligatorio) requerido(result, 'arrayPuntosVenta', method, 'consulta');
    return decode<{ arrayPuntosVenta: PuntoVenta[] }>(
      result,
      { arrayPuntosVenta: wrapped('puntoVenta', PUNTO_VENTA, 0) },
      method,
      'consulta',
    ).arrayPuntosVenta;
  }

  private async puntosVenta(method: string, auth: MtxcaAuth, opts?: CallOptions): Promise<PuntoVenta[]> {
    return this.parsePuntosVenta(await this.consulta(method, auth, {}, opts), method, true);
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
    const method = 'consultarActividadesVigentes';
    const result = await this.consulta(method, auth, {}, opts);
    return decode<{ arrayActividades: ActividadVigente[] }>(
      result,
      { arrayActividades: wrapped('actividad', ACTIVIDAD_VIGENTE, 0) },
      method,
      'consulta',
    ).arrayActividades;
  }
}
