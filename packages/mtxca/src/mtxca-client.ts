import {
  ArcaRechazoError,
  ArcaResponseError,
  checkServiceErrors,
  formatServiceErrors,
  parseServerStatus,
  SoapServiceClient,
} from '@ramiidv/arca-common';
import type {
  CallOptions,
  ServerStatus,
  ServiceClientConfig,
  ServiceErrorDetail,
  SoapOperationKind,
} from '@ramiidv/arca-common';
import { decodeResponse, encodeRequest } from '@ramiidv/arca-common/schema';
import type { Schema } from '@ramiidv/arca-common/schema';
import { MTXCA_NAMESPACE } from './constants.js';
import {
  ACTIVIDADES_VIGENTES_RESPONSE,
  CAEA_ENTRE_FECHAS_RESPONSE,
  CAEA_NO_UTILIZADO,
  CAEA_NO_UTILIZADO_PTO_VTA,
  CAEA_RESPONSE,
  COMPROBANTE_CAE_RESPONSE,
  COMPROBANTE_CAEA_RESPONSE,
  CON_CAEA,
  CON_CAEA_PTO_VTA,
  CONDICIONES_IVA_RECEPTOR_RESPONSE,
  CONSULTA_COMPROBANTE,
  CONSULTA_COMPROBANTE_RESPONSE,
  CONSULTA_CONDICIONES_IVA,
  CONSULTA_ULTIMO,
  COTIZACION,
  COTIZACION_RESPONSE,
  ENTRE_FECHAS,
  EVENTO,
  FECHA_PROCESO,
  PARAMETROS,
  PUNTOS_VENTA_RESPONSE,
  RESULTADO,
  SOLICITUD_CAEA,
  ULTIMO_RESPONSE,
} from './schemas.js';
import { buildComprobante, encodeConCaea } from './serialize.js';
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

/**
 * Configuración del cliente de bajo nivel: `{ endpoint, transport? }` (como en
 * todos los SDKs; el namespace lo fija el cliente) más `onEvento`.
 * `endpoint`: ver `ENDPOINTS.wsmtxca`.
 */
export interface MtxcaClientConfig extends ServiceClientConfig {
  /**
   * Recibe el `evento` (aviso informativo de ARCA) de cualquier respuesta que
   * lo traiga. Los errores del callback se ignoran.
   */
  onEvento?: (evento: CodigoDescripcion, method: string) => void;
}

const SERVICE = 'WSMTXCA';

function isResultado(value: string): value is MtxcaResultado | 'R' {
  return value === 'A' || value === 'O' || value === 'R';
}

/**
 * Respuesta ilegible: `ArcaResponseError` (`uncertain` en emisiones: el
 * comprobante pudo haberse procesado aunque la respuesta no se pueda leer).
 */
function invalid(message: string, kind: SoapOperationKind): ArcaResponseError {
  return new ArcaResponseError(message, kind === 'emision');
}

function decode<T>(node: unknown, schema: Schema, path: string, kind: SoapOperationKind): T {
  return decodeResponse<T>(node, schema, path, { kind });
}

const detalle = (list: CodigoDescripcion[]): ServiceErrorDetail[] =>
  list.map((x) => ({ code: x.codigo, msg: x.descripcion }));

/**
 * Rechazo de una emisión: `ArcaRechazoError` con los errores y observaciones de
 * ARCA. El mensaje lista los errores (o, si no vino ninguno, las observaciones).
 */
function rechazo(method: string, errores: CodigoDescripcion[], observaciones: CodigoDescripcion[]): never {
  const errors = detalle(errores);
  const motivos = formatServiceErrors(errors.length > 0 ? errors : detalle(observaciones));
  throw new ArcaRechazoError(`${SERVICE} ${method}: rechazado${motivos ? `: ${motivos}` : ''}`, {
    operacion: method,
    errors,
    observaciones: detalle(observaciones),
  });
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
  /** Ausente en `informarCAEANoUtilizado*` (sus schemas no la tienen). */
  arrayObservaciones?: CodigoDescripcion[];
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
 * - Las emisiones (`autorizar*`, `informar*`, `solicitarCAEA`) devuelven
 *   siempre una operación aprobada (`A` u `O`): `resultado: 'R'` lanza
 *   `ArcaRechazoError`; `arrayErrores` sin `resultado` (ej. `solicitarCAEA`), `ArcaServiceError`. Usan
 *   `kind: 'emision'`: no se reintentan; si no hay respuesta, el
 *   `ArcaSoapError` tiene `uncertain: true`, y si la respuesta es ilegible, el
 *   `ArcaResponseError` también.
 */
export class MtxcaClient extends SoapServiceClient {
  readonly #onEvento?: MtxcaClientConfig['onEvento'];

  constructor(config: MtxcaClientConfig) {
    if (!config?.endpoint) throw new TypeError('MtxcaClient: endpoint es obligatorio');
    super({ endpoint: config.endpoint, transport: config.transport, namespace: MTXCA_NAMESPACE });
    this.#onEvento = config.onEvento;
  }

  private async call(
    method: string,
    params: R,
    kind: SoapOperationKind,
    opts?: CallOptions,
    requestElement: string | null = `${method}Request`,
  ): Promise<R> {
    const result = await this.soapCall(method, params, {
      kind,
      signal: opts?.signal,
      requestElement,
      responseElement: `${method}Response`,
      soapActionFromMethod: true,
      // Todo como texto: los schemas convierten cada campo según el XSD.
      parseNumbers: false,
    });
    this.notificarEvento(result, method);
    return result;
  }

  /** Pasa el `evento` de la respuesta a `onEvento` (un `evento` ilegible se ignora acá). */
  private notificarEvento(result: R, method: string): void {
    if (!this.#onEvento || result['evento'] === undefined) return;
    try {
      const { evento } = decodeResponse<{ evento?: CodigoDescripcion }>(result, { evento: EVENTO }, method);
      if (evento) this.#onEvento(evento, method);
    } catch {
      // Ignorado a propósito: el callback no debe afectar la operación.
    }
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
   * coherencia de importes (eso lo hace `ArcaMtxca.autorizar`).
   * @throws ArcaRechazoError si ARCA rechaza el comprobante (`errors`, `observaciones`).
   */
  async autorizarComprobante(
    auth: MtxcaAuth,
    comprobante: MtxcaComprobanteCAE,
    opts?: CallOptions,
  ): Promise<MtxcaAutorizarResult> {
    return this.autorizarCAE('autorizarComprobante', auth, comprobante, opts);
  }

  /**
   * `autorizarAjusteIVA`: comprobante de ajuste de IVA con CAE (ND/NC 2, 3, 7, 8, 52, 53).
   * @throws ArcaRechazoError si ARCA lo rechaza.
   */
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
    const { resultado, observaciones, evento } = this.resultado(result, method);
    requerido(result, 'comprobanteResponse', method, 'emision', true);
    const { CAE, ...cr } = decode<Omit<MtxcaComprobanteCAEResponse, 'cae'> & { CAE: string }>(
      result['comprobanteResponse'],
      COMPROBANTE_CAE_RESPONSE,
      `${method}.comprobanteResponse`,
      'emision',
    );
    return { resultado, comprobante: { ...cr, cae: CAE }, observaciones, ...(evento ? { evento } : {}) };
  }

  /**
   * Decodifica `resultado`, `arrayObservaciones`, `arrayErrores` y `evento` de
   * una emisión y lanza si no fue aprobada:
   * - `resultado: 'R'` → `ArcaRechazoError`.
   * - sin `resultado` pero con `arrayErrores` → `ArcaServiceError` (no es un rechazo `R`).
   * - sin `resultado` ni errores, o con un valor desconocido → `ArcaResponseError` con `uncertain`.
   */
  private resultado(
    result: R,
    method: string,
    schema: Schema = RESULTADO,
  ): { resultado: MtxcaResultado; observaciones: CodigoDescripcion[]; evento?: CodigoDescripcion } {
    const r = decode<ResultadoRaw>(result, schema, method, 'emision');
    if (!r.resultado) {
      checkServiceErrors(result, `${SERVICE} ${method}`);
      throw invalid(`Respuesta inválida: falta ${method}.resultado`, 'emision');
    }
    if (!isResultado(r.resultado)) {
      throw invalid(`Respuesta inválida: valor "${r.resultado}" inesperado en ${method}.resultado`, 'emision');
    }
    const observaciones = r.arrayObservaciones ?? [];
    if (r.resultado === 'R') rechazo(method, r.arrayErrores, observaciones);
    return { resultado: r.resultado, observaciones, evento: r.evento };
  }

  // =========================================================================
  // CAEA
  // =========================================================================

  /**
   * `solicitarCAEA`. `periodo` AAAAMM, `orden` 1 (primera quincena) o 2.
   * Es una emisión: si el resultado es incierto, recuperalo con
   * `consultarCAEAEntreFechas`.
   * @throws ArcaServiceError si ARCA no otorga el CAEA (`arrayErrores`; no hay `resultado`).
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
    const params = encodeConCaea({ caea }, CON_CAEA, 'consultarCAEA');
    const result = await this.consulta('consultarCAEA', auth, params, opts);
    return this.parseCAEA(result, 'consultarCAEA', 'consulta');
  }

  /** `CAEAResponse` obligatorio de `solicitarCAEA` / `consultarCAEA`. */
  private parseCAEA(result: R, method: string, kind: SoapOperationKind): MtxcaCAEA {
    requerido(result, 'CAEAResponse', method, kind, true);
    const caea = toCAEA(decode<CAEARaw>(result['CAEAResponse'], CAEA_RESPONSE, `${method}.CAEAResponse`, kind));
    const { evento } = decode<{ evento?: CodigoDescripcion }>(result, { evento: EVENTO }, method, kind);
    return evento ? { ...caea, evento } : caea;
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
      CAEA_ENTRE_FECHAS_RESPONSE,
      'consultarCAEAEntreFechas',
      'consulta',
    );
    return arrayCAEAResponse.map(toCAEA);
  }

  /**
   * `informarComprobanteCAEA`.
   * @throws ArcaRechazoError si ARCA rechaza el comprobante.
   */
  async informarComprobanteCAEA(
    auth: MtxcaAuth,
    comprobante: MtxcaComprobanteCAEA,
    opts?: CallOptions,
  ): Promise<MtxcaInformarCAEAResult> {
    return this.informarCAEA('informarComprobanteCAEA', auth, comprobante, opts);
  }

  /**
   * `informarAjusteIVACAEA`.
   * @throws ArcaRechazoError si ARCA rechaza el ajuste.
   */
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
    const { resultado, observaciones, evento } = this.resultado(result, method);
    const { fechaProceso } = decode<{ fechaProceso?: string }>(result, FECHA_PROCESO, method, 'emision');
    if (fechaProceso === undefined) throw invalid(`Respuesta inválida: falta ${method}.fechaProceso`, 'emision');
    requerido(result, 'comprobanteCAEAResponse', method, 'emision', true);
    const { CAEA, ...cr } = decode<Omit<MtxcaComprobanteCAEAResponse, 'caea'> & { CAEA: string }>(
      result['comprobanteCAEAResponse'],
      COMPROBANTE_CAEA_RESPONSE,
      `${method}.comprobanteCAEAResponse`,
      'emision',
    );
    return {
      resultado,
      fechaProceso,
      comprobante: { caea: CAEA, ...cr },
      observaciones,
      ...(evento ? { evento } : {}),
    };
  }

  /**
   * `informarCAEANoUtilizado`: informa que un CAEA no se usó en ningún punto de venta.
   * @throws ArcaRechazoError si ARCA lo rechaza.
   */
  async informarCAEANoUtilizado(
    auth: MtxcaAuth,
    caea: string,
    opts?: CallOptions,
  ): Promise<MtxcaCAEANoUtilizadoResult> {
    const method = 'informarCAEANoUtilizado';
    return this.caeaNoUtilizado(method, auth, encodeConCaea({ caea }, CON_CAEA, method), CAEA_NO_UTILIZADO, opts);
  }

  /**
   * `informarCAEANoUtilizadoPtoVta`: informa que un CAEA no se usó en un punto de venta.
   * @throws ArcaRechazoError si ARCA lo rechaza.
   */
  async informarCAEANoUtilizadoPtoVta(
    auth: MtxcaAuth,
    caea: string,
    numeroPuntoVenta: number,
    opts?: CallOptions,
  ): Promise<MtxcaCAEANoUtilizadoResult> {
    const method = 'informarCAEANoUtilizadoPtoVta';
    const params = encodeConCaea({ caea, numeroPuntoVenta }, CON_CAEA_PTO_VTA, method);
    return this.caeaNoUtilizado(method, auth, params, CAEA_NO_UTILIZADO_PTO_VTA, opts);
  }

  private async caeaNoUtilizado(
    method: string,
    auth: MtxcaAuth,
    params: R,
    schema: Schema,
    opts?: CallOptions,
  ): Promise<MtxcaCAEANoUtilizadoResult> {
    const result = await this.callAuth(method, auth, params, 'emision', opts);
    const { resultado, evento } = this.resultado(result, method, schema);
    const r = decode<{ fechaProceso?: string; CAEA?: string; numeroPuntoVenta?: number }>(
      result,
      schema,
      method,
      'emision',
    );
    const conPtoVta = 'numeroPuntoVenta' in params;
    // Obligatorios en el XSD (el schema los tiene opcionales para tolerarlos ausentes en un rechazo).
    const faltante = [
      r.fechaProceso === undefined && 'fechaProceso',
      r.CAEA === undefined && 'CAEA',
      conPtoVta && r.numeroPuntoVenta === undefined && 'numeroPuntoVenta',
    ].find(Boolean);
    if (faltante || r.fechaProceso === undefined || r.CAEA === undefined) {
      throw invalid(`Respuesta inválida: falta ${method}.${faltante}`, 'emision');
    }
    return {
      resultado,
      fechaProceso: r.fechaProceso,
      caea: r.CAEA,
      ...(conPtoVta ? { numeroPuntoVenta: r.numeroPuntoVenta } : {}),
      ...(evento ? { evento } : {}),
    };
  }

  /** `consultarPtosVtaCAEANoInformados`: puntos de venta que todavía no informaron movimientos para el CAEA. */
  async consultarPtosVtaCAEANoInformados(auth: MtxcaAuth, caea: string, opts?: CallOptions): Promise<PuntoVenta[]> {
    const method = 'consultarPtosVtaCAEANoInformados';
    const result = await this.consulta(method, auth, encodeConCaea({ caea }, CON_CAEA, method), opts);
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
    return decode<{ numeroComprobante: number }>(result, ULTIMO_RESPONSE, method, 'consulta').numeroComprobante;
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
    }>(result, CONSULTA_COMPROBANTE_RESPONSE, method, 'consulta');
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

  /** Consulta cuya respuesta es un `ArrayCodigosDescripciones[String]Type` obligatorio (ver `PARAMETROS`). */
  private async codigos<T = CodigoDescripcion>(
    method: keyof typeof PARAMETROS,
    auth: MtxcaAuth,
    opts?: CallOptions,
  ): Promise<T[]> {
    const schema: Schema = PARAMETROS[method];
    const [container] = Object.keys(schema) as [string];
    const result = await this.consulta(method, auth, {}, opts);
    requerido(result, container, method, 'consulta');
    return decode<Record<string, T[]>>(result, schema, method, 'consulta')[container];
  }

  consultarTiposComprobante(auth: MtxcaAuth, opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.codigos('consultarTiposComprobante', auth, opts);
  }

  consultarTiposDocumento(auth: MtxcaAuth, opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.codigos('consultarTiposDocumento', auth, opts);
  }

  consultarAlicuotasIVA(auth: MtxcaAuth, opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.codigos('consultarAlicuotasIVA', auth, opts);
  }

  consultarCondicionesIVA(auth: MtxcaAuth, opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.codigos('consultarCondicionesIVA', auth, opts);
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
      CONDICIONES_IVA_RECEPTOR_RESPONSE,
      method,
      'consulta',
    ).arrayCondicionesIVAReceptor;
  }

  consultarUnidadesMedida(auth: MtxcaAuth, opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.codigos('consultarUnidadesMedida', auth, opts);
  }

  consultarTiposTributo(auth: MtxcaAuth, opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.codigos('consultarTiposTributo', auth, opts);
  }

  consultarTiposDatosAdicionales(auth: MtxcaAuth, opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.codigos('consultarTiposDatosAdicionales', auth, opts);
  }

  consultarMonedas(auth: MtxcaAuth, opts?: CallOptions): Promise<CodigoDescripcionString[]> {
    return this.codigos<CodigoDescripcionString>('consultarMonedas', auth, opts);
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
    const { cotizacionMoneda, evento } = decode<{ cotizacionMoneda?: number; evento?: CodigoDescripcion }>(
      result,
      COTIZACION_RESPONSE,
      method,
      'consulta',
    );
    return {
      codigoMoneda: params['codigoMoneda'] as string,
      fechaCotizacion: params['fechaCotizacion'] as string,
      cotizacion: cotizacionMoneda ?? null,
      ...(evento ? { evento } : {}),
    };
  }

  /** `ArrayPuntosVentaType` (obligatorio salvo en `consultarPtosVtaCAEANoInformados`). */
  private parsePuntosVenta(result: R, method: string, obligatorio = false): PuntoVenta[] {
    if (obligatorio) requerido(result, 'arrayPuntosVenta', method, 'consulta');
    return decode<{ arrayPuntosVenta: PuntoVenta[] }>(result, PUNTOS_VENTA_RESPONSE, method, 'consulta')
      .arrayPuntosVenta;
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
    return decode<{ arrayActividades: ActividadVigente[] }>(result, ACTIVIDADES_VIGENTES_RESPONSE, method, 'consulta')
      .arrayActividades;
  }
}
