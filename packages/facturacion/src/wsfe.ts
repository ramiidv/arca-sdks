import { ArcaResponseError, SoapServiceClient, extractServiceErrors, parseServerStatus } from '@ramiidv/arca-common';
import type { CallOptions, ServerStatus, ServiceClientConfig, SoapOperationKind } from '@ramiidv/arca-common';
import { WSFE_ERRORES_AUTH, WSFE_ERRORES_INTERNOS, WSFE_NAMESPACE } from './constants.js';
import { encodeRequest } from '@ramiidv/arca-common/schema';
import type { Schema } from '@ramiidv/arca-common/schema';
import { decodeArca, sinCampo } from './decode.js';
import { ArcaResultadoIncierto, ArcaSoapError, ArcaWSFEError, authErrorDe } from './errors.js';
import type { OperacionEmision } from './errors.js';
import { eventosWsfe, intentoDesdeComprobante } from './facturacion.js';
import * as S from './schemas.js';
import type {
  WsfeAuth,
  InvoiceRequest,
  InvoiceDetail,
  FECAESolicitarResult,
  FECompUltimoAutorizadoResult,
  FECompConsultarResult,
  ParamItem,
  CondicionIvaItem,
  MonedaItem,
  PtoVentaItem,
  CotizacionResult,
  ActividadItem,
  PaisItem,
  CaeaSolicitarResult,
  CaeaRegInfRequest,
  CaeaRegInfResult,
  CaeaSinMovResult,
  CaeaSinMovItem,
  MensajeArca,
} from './types.js';

type R = Record<string, unknown>;

/** `Errors` de una respuesta de WSFEv1 como `ArcaWSFEError`, o `undefined`. */
function erroresDe(result: R): ArcaWSFEError | undefined {
  const errors = extractServiceErrors(result);
  return errors.length > 0 ? new ArcaWSFEError(errors.map((e) => ({ code: e.code, msg: e.msg }))) : undefined;
}

/**
 * Lanza si la respuesta trae `Errors`: `ArcaAuthError` para los de
 * autenticación (600, 601), `ArcaWSFEError` para el resto.
 */
function checkErrors(result: R): void {
  const error = erroresDe(result);
  if (!error) return;
  if (WSFE_ERRORES_AUTH.some((c) => error.tieneCodigo(c))) throw authErrorDe(error);
  throw error;
}

/** 602 de WSFEv1: la consulta no tiene resultados ("Sin Resultados" / "No existen datos"). */
const SIN_RESULTADOS = 602;

/**
 * 10102 de `FECAEASinMovimientoConsultar`: el CAEA no tiene informes "sin
 * movimiento" ("no se encuentra registrado ... como sin movimientos").
 */
const CAEA_SIN_INFORMES_SIN_MOV = 10102;

/**
 * `[]` si ARCA respondió solo con alguno de los códigos de "sin resultados"
 * indicados (ej. 602, "Sin Resultados"); cualquier otro error se relanza.
 */
async function vacioSiSinResultados<T>(codigos: readonly number[], fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn();
  } catch (err) {
    if (
      err instanceof ArcaWSFEError &&
      err.errors.length > 0 &&
      err.errors.every((e) => codigos.includes(Number(e.code)))
    ) {
      return [];
    }
    throw err;
  }
}

/** Error interno de ARCA (500, 501, 502): no garantiza que no se haya procesado. */
function errorInterno(result: R): ArcaWSFEError | undefined {
  const error = erroresDe(result);
  return error && WSFE_ERRORES_INTERNOS.some((c) => error.tieneCodigo(c)) ? error : undefined;
}

/** Bloque `Auth` de WSFEv1/WSFEX con los nombres del XML. */
export function authXml(auth: WsfeAuth): R {
  return { Token: auth.token, Sign: auth.sign, Cuit: auth.cuit };
}

/**
 * Cliente de bajo nivel de WSFEv1 (Factura electrónica, mercado interno).
 *
 * Devuelve las respuestas de ARCA tal cual (un `Resultado` "R" no lanza): el
 * manejo de rechazos lo hace `ArcaFacturacion`.
 *
 * @example
 * ```ts
 * const wsfe = new WsfeClient({ endpoint: ENDPOINTS.wsfe.testing, transport: { timeout: 60_000 } });
 * ```
 */
export class WsfeClient extends SoapServiceClient {
  constructor(config: ServiceClientConfig) {
    super({ ...config, namespace: WSFE_NAMESPACE });
  }

  /**
   * WSFEv1 es un servicio ASMX con `elementFormDefault="qualified"`: el método
   * declara el namespace por defecto y los hijos lo heredan; el SOAPAction es
   * `namespace + método`. La respuesta queda como texto (`parseNumbers: false`):
   * la convierte el schema de cada operación.
   */
  private call(method: string, params: R, opts?: CallOptions & { kind?: SoapOperationKind }): Promise<R> {
    return this.soapCall(method, params, {
      qualified: true,
      soapActionFromMethod: true,
      parseNumbers: false,
      kind: opts?.kind,
      signal: opts?.signal,
    });
  }

  /**
   * Consulta autenticada: codifica `params` con `request` (orden del WSDL),
   * lanza `ArcaWSFEError` si ARCA devuelve `Errors` y decodifica la respuesta.
   */
  private async consulta<T>(
    method: string,
    auth: WsfeAuth,
    params: R,
    schemas: { request?: Schema; response: Schema },
    opts?: CallOptions,
  ): Promise<T> {
    const body = schemas.request ? encodeRequest(params, schemas.request, method) : {};
    const result = await this.call(method, { Auth: authXml(auth), ...body }, opts);
    checkErrors(result);
    return decodeArca<T>(result, schemas.response, method);
  }

  /**
   * Llama a una operación de emisión: nunca se reintenta, y si no hay certeza
   * de que ARCA no la procesó, lanza ArcaResultadoIncierto.
   */
  private async emitir<T>(
    operacion: OperacionEmision,
    params: R,
    request: { ptoVta: number; cbteTipo: number; invoices: InvoiceDetail[] },
    response: Schema,
    opts?: CallOptions,
  ): Promise<T> {
    const incierto = (cause: unknown) =>
      new ArcaResultadoIncierto(
        operacion,
        request.invoices.map((inv) => intentoDesdeComprobante(request.ptoVta, request.cbteTipo, inv)),
        { cause },
      );

    let result: R;
    try {
      result = await this.call(operacion, params, { ...opts, kind: 'emision' });
    } catch (err) {
      if (err instanceof ArcaSoapError && err.uncertain) throw incierto(err);
      throw err;
    }

    // Un error interno de ARCA no garantiza que no se haya procesado.
    const interno = errorInterno(result);
    if (interno) throw incierto(interno);

    // Errores de negocio o de autenticación: ARCA rechazó el request, no se emitió nada.
    checkErrors(result);

    // Una respuesta con forma inválida tampoco garantiza que no se haya emitido.
    let decoded: R;
    try {
      decoded = decodeArca<R>(result, response, operacion, 'emision');
    } catch (err) {
      throw incierto(err);
    }
    if (!Array.isArray(decoded.feDetResp) || !decoded.feCabResp) {
      throw incierto(new ArcaResponseError(`Respuesta de ${operacion} sin FeCabResp/FeDetResp`, true));
    }
    return decoded as T;
  }

  // ============================================================
  // Facturación
  // ============================================================

  /**
   * Solicita CAE (emisión). No se reintenta: ante un resultado incierto lanza
   * ArcaResultadoIncierto; ante errores de ARCA, ArcaWSFEError.
   */
  async solicitarCAE(auth: WsfeAuth, request: InvoiceRequest, opts?: CallOptions): Promise<FECAESolicitarResult> {
    const feCAEReq = encodeRequest(
      {
        feCabReq: { cantReg: request.invoices.length, ptoVta: request.ptoVta, cbteTipo: request.cbteTipo },
        feDetReq: request.invoices.map(detInput),
      },
      S.FECAE_REQ,
      'FECAESolicitar',
    );
    return this.emitir<FECAESolicitarResult>(
      'FECAESolicitar',
      { Auth: authXml(auth), FeCAEReq: feCAEReq },
      request,
      S.FECAE_RESP,
      opts,
    );
  }

  async ultimoComprobante(auth: WsfeAuth, ptoVta: number, cbteTipo: number, opts?: CallOptions): Promise<number> {
    const result = await this.consulta<FECompUltimoAutorizadoResult>(
      'FECompUltimoAutorizado',
      auth,
      { ptoVta, cbteTipo },
      { request: S.ULTIMO_REQ, response: S.ULTIMO_RESP },
      opts,
    );
    return result.cbteNro;
  }

  async consultarComprobante(
    auth: WsfeAuth,
    cbteTipo: number,
    ptoVta: number,
    cbteNro: number,
    opts?: CallOptions,
  ): Promise<FECompConsultarResult> {
    const result = await this.consulta<FECompConsultarResult>(
      'FECompConsultar',
      auth,
      { feCompConsReq: { cbteTipo, cbteNro, ptoVta } },
      { request: S.COMP_CONSULTAR_REQ, response: S.COMP_CONSULTA_RESP },
      opts,
    );
    if (!result.resultGet) throw sinCampo('FECompConsultar', 'ResultGet');
    return result;
  }

  // ============================================================
  // Parámetros
  // ============================================================

  /** Estado de los servidores de WSFEv1 (`FEDummy`, sin autenticación). */
  async dummy(opts?: CallOptions): Promise<ServerStatus> {
    return parseServerStatus(await this.call('FEDummy', {}, opts), 'FEDummy');
  }

  private async getParam<T>(
    auth: WsfeAuth,
    method: string,
    itemKey: string,
    item: Schema,
    opts?: CallOptions,
    params: { request?: Schema; values: R } = { values: {} },
  ): Promise<T[]> {
    const result = await this.consulta<{ resultGet?: T[] }>(
      method,
      auth,
      params.values,
      { request: params.request, response: S.tablaWsfe(itemKey, item) },
      opts,
    );
    return result.resultGet ?? [];
  }

  async getTiposComprobante(auth: WsfeAuth, opts?: CallOptions): Promise<ParamItem[]> {
    return this.getParam(auth, 'FEParamGetTiposCbte', 'CbteTipo', S.PARAM_ITEM, opts);
  }

  async getTiposConcepto(auth: WsfeAuth, opts?: CallOptions): Promise<ParamItem[]> {
    return this.getParam(auth, 'FEParamGetTiposConcepto', 'ConceptoTipo', S.PARAM_ITEM, opts);
  }

  async getTiposDocumento(auth: WsfeAuth, opts?: CallOptions): Promise<ParamItem[]> {
    return this.getParam(auth, 'FEParamGetTiposDoc', 'DocTipo', S.PARAM_ITEM, opts);
  }

  /**
   * Condiciones frente al IVA del receptor (`FEParamGetCondicionIvaReceptor`).
   * @param claseCmp - Clase de comprobante para filtrar (ej: "A", "B", "C"). Opcional.
   */
  async getCondicionesIva(auth: WsfeAuth, opts?: CallOptions, claseCmp?: string): Promise<CondicionIvaItem[]> {
    return this.getParam(auth, 'FEParamGetCondicionIvaReceptor', 'CondicionIvaReceptor', S.CONDICION_IVA, opts, {
      request: S.CONDICION_IVA_REQ,
      values: { claseCmp },
    });
  }

  async getTiposIva(auth: WsfeAuth, opts?: CallOptions): Promise<ParamItem[]> {
    return this.getParam(auth, 'FEParamGetTiposIva', 'IvaTipo', S.PARAM_ITEM, opts);
  }

  /** Monedas. `Id` es `s:string`: códigos como `"060"` conservan el cero. */
  async getMonedas(auth: WsfeAuth, opts?: CallOptions): Promise<MonedaItem[]> {
    return this.getParam(auth, 'FEParamGetTiposMonedas', 'Moneda', S.MONEDA, opts);
  }

  async getTiposTributo(auth: WsfeAuth, opts?: CallOptions): Promise<ParamItem[]> {
    return this.getParam(auth, 'FEParamGetTiposTributos', 'TributoTipo', S.PARAM_ITEM, opts);
  }

  async getTiposOpcional(auth: WsfeAuth, opts?: CallOptions): Promise<ParamItem[]> {
    return this.getParam(auth, 'FEParamGetTiposOpcional', 'OpcionalTipo', S.PARAM_ITEM, opts);
  }

  /**
   * Puntos de venta del emisor (`FEParamGetPtosVenta`). Devuelve `[]` si no
   * tiene ninguno (ARCA responde el error 602 "Sin Resultados"); cualquier otro
   * error lanza.
   */
  async getPuntosVenta(auth: WsfeAuth, opts?: CallOptions): Promise<PtoVentaItem[]> {
    return vacioSiSinResultados([SIN_RESULTADOS], () =>
      this.getParam<PtoVentaItem>(auth, 'FEParamGetPtosVenta', 'PtoVenta', S.PTO_VENTA, opts),
    );
  }

  /** Actividades del emisor (`FEParamGetActividades`). */
  async getActividades(auth: WsfeAuth, opts?: CallOptions): Promise<ActividadItem[]> {
    return this.getParam(auth, 'FEParamGetActividades', 'ActividadesTipo', S.ACTIVIDAD, opts);
  }

  /** Países (`FEParamGetTiposPaises`). */
  async getTiposPaises(auth: WsfeAuth, opts?: CallOptions): Promise<PaisItem[]> {
    return this.getParam(auth, 'FEParamGetTiposPaises', 'PaisTipo', S.PAIS, opts);
  }

  /**
   * Cotización de una moneda (`FEParamGetCotizacion`).
   * `opts.fchCotiz`: fecha de la cotización (YYYYMMDD). Opcional: sin fecha, ARCA devuelve la vigente.
   */
  async getCotizacion(
    auth: WsfeAuth,
    monedaId: string,
    opts?: CallOptions & { fchCotiz?: string },
  ): Promise<CotizacionResult> {
    const result = await this.consulta<{ resultGet?: Partial<CotizacionResult> & { monCotiz: number } }>(
      'FEParamGetCotizacion',
      auth,
      { monId: monedaId, fchCotiz: opts?.fchCotiz },
      { request: S.COTIZACION_REQ, response: S.COTIZACION_RESP },
      opts,
    );
    const r = result.resultGet;
    if (!r) throw sinCampo('FEParamGetCotizacion', 'ResultGet');
    return { monId: r.monId ?? monedaId, monCotiz: r.monCotiz, fchCotiz: r.fchCotiz ?? '' };
  }

  async getCantMaxRegistros(auth: WsfeAuth, opts?: CallOptions): Promise<number> {
    const result = await this.consulta<{ regXReq: number }>(
      'FECompTotXRequest',
      auth,
      {},
      { response: S.REG_X_REQ_RESP },
      opts,
    );
    return result.regXReq;
  }

  // ============================================================
  // CAEA - Autorización Anticipada
  // ============================================================

  private async caeaGet(method: string, auth: WsfeAuth, periodo: string, orden: number, opts?: CallOptions) {
    const result = await this.consulta<{ resultGet?: CaeaSolicitarResult; events?: MensajeArca[] }>(
      method,
      auth,
      { periodo, orden },
      { request: S.CAEA_REQ, response: S.CAEA_GET_RESP },
      opts,
    );
    const r = result.resultGet;
    if (!r) throw sinCampo(method, 'ResultGet.CAEA');
    const caea: CaeaSolicitarResult = {
      ...r,
      fchVigDesde: r.fchVigDesde ?? '',
      fchVigHasta: r.fchVigHasta ?? '',
      fchTopeInf: r.fchTopeInf ?? '',
      fchProceso: r.fchProceso ?? '',
      eventos: eventosWsfe(result),
    };
    return caea;
  }

  /** Solicita un CAEA (`FECAEASolicitar`). Si ya existe para el período, ARCA devuelve error (usar `consultarCAEA`). */
  async solicitarCAEA(
    auth: WsfeAuth,
    periodo: string,
    orden: number,
    opts?: CallOptions,
  ): Promise<CaeaSolicitarResult> {
    return this.caeaGet('FECAEASolicitar', auth, periodo, orden, opts);
  }

  async consultarCAEA(
    auth: WsfeAuth,
    periodo: string,
    orden: number,
    opts?: CallOptions,
  ): Promise<CaeaSolicitarResult> {
    return this.caeaGet('FECAEAConsultar', auth, periodo, orden, opts);
  }

  /**
   * Informa comprobantes emitidos con CAEA (emisión). No se reintenta: ante un
   * resultado incierto lanza ArcaResultadoIncierto.
   */
  async registrarCAEA(auth: WsfeAuth, request: CaeaRegInfRequest, opts?: CallOptions): Promise<CaeaRegInfResult> {
    // FECAEADetRequest extiende FEDetRequest: CAEA y CbteFchHsGen van al final.
    const feCAEARegInfReq = encodeRequest(
      {
        feCabReq: { cantReg: request.invoices.length, ptoVta: request.ptoVta, cbteTipo: request.cbteTipo },
        feDetReq: request.invoices.map((inv) => ({ ...detInput(inv), caea: inv.caea, cbteFchHsGen: inv.cbteFchHsGen })),
      },
      S.FECAEA_REQ,
      'FECAEARegInformativo',
    );
    return this.emitir<CaeaRegInfResult>(
      'FECAEARegInformativo',
      { Auth: authXml(auth), FeCAEARegInfReq: feCAEARegInfReq },
      request,
      S.FECAEA_RESP,
      opts,
    );
  }

  /**
   * Informa que un punto de venta no tuvo movimientos con un CAEA (emisión, no
   * se reintenta). Un error con `uncertain: true` (`ArcaSoapError` por red,
   * timeout o error interno 500/501/502 de ARCA; `ArcaResponseError` por una
   * respuesta inválida) significa que no se sabe si quedó informado:
   * verificarlo con `consultarSinMovimientoCAEA`.
   */
  async sinMovimientoCAEA(auth: WsfeAuth, caea: string, ptoVta: number, opts?: CallOptions): Promise<CaeaSinMovResult> {
    const method = 'FECAEASinMovimientoInformar';
    const body = encodeRequest({ ptoVta, caea }, S.CAEA_SIN_MOV_INFORMAR_REQ, method);
    const raw = await this.call(method, { Auth: authXml(auth), ...body }, { ...opts, kind: 'emision' });
    const interno = errorInterno(raw);
    if (interno) {
      throw new ArcaSoapError(`${method}: error interno de ARCA, no se sabe si quedó informado: ${interno.message}`, {
        uncertain: true,
        cause: interno,
      });
    }
    checkErrors(raw);
    let result: CaeaSinMovResult | undefined;
    try {
      result = decodeArca<CaeaSinMovResult>(raw, S.CAEA_SIN_MOV_RESP, method, 'emision');
    } catch {
      // Forma inválida: se trata como respuesta sin Resultado.
    }
    if (result?.resultado !== 'A' && result?.resultado !== 'R') {
      throw new ArcaResponseError(`Respuesta de ${method} sin Resultado`, true);
    }
    return result;
  }

  /**
   * Consulta los informes "sin movimiento" de un CAEA
   * (`FECAEASinMovimientoConsultar`). Devuelve `[]` si no hay ninguno: ARCA
   * responde sin `ResultGet` o con el error 10102 ("El CAEA informado no se
   * encuentra registrado ... como sin movimientos") o 602 ("Sin Resultados").
   * Cualquier otro error lanza.
   * @param caea - CAEA a consultar.
   * @param ptoVta - Punto de venta vinculado al CAEA.
   */
  async consultarSinMovimientoCAEA(
    auth: WsfeAuth,
    caea: string,
    ptoVta: number,
    opts?: CallOptions,
  ): Promise<CaeaSinMovItem[]> {
    return vacioSiSinResultados([CAEA_SIN_INFORMES_SIN_MOV, SIN_RESULTADOS], async () => {
      const result = await this.consulta<{ resultGet?: CaeaSinMovItem[] }>(
        'FECAEASinMovimientoConsultar',
        auth,
        { caea, ptoVta },
        { request: S.CAEA_SIN_MOV_CONSULTAR_REQ, response: S.CAEA_SIN_MOV_CONS_RESP },
        opts,
      );
      return (result.resultGet ?? []).map((i) => ({ ...i, fchProceso: i.fchProceso ?? '' }));
    });
  }
}

// ============================================================
// Helpers
// ============================================================

const presente = (v: unknown) => v !== undefined && v !== null && v !== '';
const lista = <T>(v: T[] | undefined) => (v && v.length > 0 ? v : undefined);

/**
 * Campos de un `InvoiceDetail` que se envían en el `FEDetRequest`. Los
 * opcionales vacíos (`undefined`, `null`, `""` o `[]`) no se envían.
 */
function detInput(inv: InvoiceDetail): R {
  return {
    concepto: inv.concepto,
    docTipo: inv.docTipo,
    docNro: inv.docNro,
    cbteDesde: inv.cbteDesde,
    cbteHasta: inv.cbteHasta,
    cbteFch: inv.cbteFch,
    impTotal: inv.impTotal,
    impTotConc: inv.impTotConc,
    impNeto: inv.impNeto,
    impOpEx: inv.impOpEx,
    impTrib: inv.impTrib,
    impIva: inv.impIva,
    fchServDesde: inv.fchServDesde || undefined,
    fchServHasta: inv.fchServHasta || undefined,
    fchVtoPago: inv.fchVtoPago || undefined,
    monId: inv.monId,
    monCotiz: inv.monCotiz ?? undefined,
    canMisMonExt: inv.canMisMonExt || undefined,
    condicionIvaReceptorId: inv.condicionIvaReceptorId ?? undefined,
    cbtesAsoc: lista(inv.cbtesAsoc)?.map((c) => ({
      tipo: c.tipo,
      ptoVta: c.ptoVta,
      nro: c.nro,
      cuit: presente(c.cuit) ? String(c.cuit) : undefined,
      cbteFch: c.cbteFch || undefined,
    })),
    tributos: lista(inv.tributos)?.map((t) => ({
      id: t.id,
      desc: t.desc || undefined,
      baseImp: t.baseImp,
      alic: t.alic,
      importe: t.importe,
    })),
    iva: lista(inv.iva)?.map((i) => ({ id: i.id, baseImp: i.baseImp, importe: i.importe })),
    opcionales: lista(inv.opcionales)?.map((o) => ({ id: o.id, valor: o.valor })),
    compradores: lista(inv.compradores)?.map((c) => ({
      docTipo: c.docTipo,
      docNro: c.docNro,
      porcentaje: c.porcentaje,
    })),
    periodoAsoc: inv.periodoAsoc
      ? { fchDesde: inv.periodoAsoc.fchDesde, fchHasta: inv.periodoAsoc.fchHasta }
      : undefined,
    actividades: lista(inv.actividades)?.map((a) => ({ id: a.id })),
  };
}
