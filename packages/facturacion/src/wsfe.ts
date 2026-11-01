import { SoapServiceClient, ensureArray, extractServiceErrors, parseServerStatus } from '@ramiidv/arca-common';
import type {
  ArcaEvent,
  CallOptions,
  LegacyTlsMode,
  ServerStatus,
  ServiceTransport,
  SoapOperationKind,
} from '@ramiidv/arca-common';
import { ENDPOINTS, WSFE_ERRORES_INTERNOS, WSFE_NAMESPACE } from './constants.js';
import { encodeRequest } from '@ramiidv/arca-common/schema';
import type { Schema } from '@ramiidv/arca-common/schema';
import { decodeArca } from './decode.js';
import { ArcaResultadoIncierto, ArcaSoapError, ArcaWSFEError } from './errors.js';
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
} from './types.js';

type R = Record<string, any>;

/** Opciones de transporte de los clientes de bajo nivel (`WsfeClient`, `WsfexClient`). */
export interface WsClientOptions {
  /** Timeout en ms (default: 30000). */
  timeoutMs?: number;
  /** Reintentos en consultas (default: 1). Las emisiones nunca se reintentan. */
  retries?: number;
  /** Delay base del backoff en ms (default: 1000). */
  retryDelayMs?: number;
  onEvent?: (event: ArcaEvent) => void;
  /** `fetch` propio (proxy, mTLS, tests). */
  fetch?: typeof fetch;
  /** Transporte TLS legacy para hosts con DH de 1024 bits (default: `auto`). */
  legacyTls?: LegacyTlsMode;
  /** URL del servicio. Si no se indica, la de ARCA según `production`. */
  endpoint?: string;
}

/** Lanza `ArcaWSFEError` si la respuesta trae `Errors` (formato de WSFEv1). */
function checkErrors(result: R): void {
  const errors = extractServiceErrors(result);
  if (errors.length > 0) throw new ArcaWSFEError(errors.map((e) => ({ code: e.code, msg: e.msg })));
}

/** Falta un campo obligatorio en la respuesta de una consulta. */
function sinCampo(method: string, campo: string): ArcaSoapError {
  return new ArcaSoapError(`Respuesta de ${method} sin ${campo}`);
}

/** Opciones de transporte de arca-common a partir de `WsClientOptions` (`timeoutMs` → `timeout`). */
export function transportDe(opts: WsClientOptions): ServiceTransport {
  return {
    timeout: opts.timeoutMs,
    retries: opts.retries,
    retryDelayMs: opts.retryDelayMs,
    onEvent: opts.onEvent,
    fetch: opts.fetch,
    legacyTls: opts.legacyTls,
  };
}

/** Cliente de bajo nivel de WSFEv1 (Factura electrónica, mercado interno). */
export class WsfeClient extends SoapServiceClient {
  constructor(production: boolean, opts: WsClientOptions = {}) {
    super({
      endpoint: opts.endpoint ?? (production ? ENDPOINTS.wsfe.production : ENDPOINTS.wsfe.testing),
      namespace: WSFE_NAMESPACE,
      transport: transportDe(opts),
    });
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
    const result = await this.call(method, { Auth: auth, ...body }, opts);
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
    request: { PtoVta: number; CbteTipo: number; invoices: InvoiceDetail[] },
    detalleKey: 'FECAEDetResponse' | 'FECAEADetResponse',
    response: Schema,
    opts?: CallOptions,
  ): Promise<T> {
    const incierto = (cause: unknown) =>
      new ArcaResultadoIncierto(
        operacion,
        request.invoices.map((inv) => intentoDesdeComprobante(request.PtoVta, request.CbteTipo, inv)),
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
    const errores = extractServiceErrors(result);
    if (errores.some((e) => WSFE_ERRORES_INTERNOS.includes(e.code))) {
      throw incierto(new ArcaWSFEError(errores.map((e) => ({ code: e.code, msg: e.msg }))));
    }

    // Errores de negocio: ARCA rechazó el request, no se emitió nada.
    checkErrors(result);

    // Una respuesta con forma inválida tampoco garantiza que no se haya emitido.
    let decoded: R;
    try {
      decoded = decodeArca<R>(result, response, operacion);
    } catch (err) {
      throw incierto(err);
    }
    const detResp = decoded.FeDetResp as R | undefined;
    if (!detResp || detResp[detalleKey] === undefined || !decoded.FeCabResp) {
      throw incierto(new ArcaSoapError(`Respuesta de ${operacion} sin FeCabResp/FeDetResp`));
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
        FeCabReq: { CantReg: request.invoices.length, PtoVta: request.PtoVta, CbteTipo: request.CbteTipo },
        FeDetReq: request.invoices.map(detInput),
      },
      S.FECAE_REQ,
      'FECAESolicitar',
    );
    return this.emitir<FECAESolicitarResult>(
      'FECAESolicitar',
      { Auth: auth, FeCAEReq: feCAEReq },
      request,
      'FECAEDetResponse',
      S.FECAE_RESP,
      opts,
    );
  }

  async ultimoComprobante(auth: WsfeAuth, ptoVta: number, cbteTipo: number, opts?: CallOptions): Promise<number> {
    const result = await this.consulta<FECompUltimoAutorizadoResult>(
      'FECompUltimoAutorizado',
      auth,
      { PtoVta: ptoVta, CbteTipo: cbteTipo },
      { request: S.ULTIMO_REQ, response: S.ULTIMO_RESP },
      opts,
    );
    return result.CbteNro;
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
      { FeCompConsReq: { CbteTipo: cbteTipo, CbteNro: cbteNro, PtoVta: ptoVta } },
      { request: S.COMP_CONSULTAR_REQ, response: S.COMP_CONSULTA_RESP },
      opts,
    );
    if (!result.ResultGet) throw sinCampo('FECompConsultar', 'ResultGet');
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
    const result = await this.consulta<{ ResultGet?: T[] }>(
      method,
      auth,
      params.values,
      { request: params.request, response: S.tablaWsfe(itemKey, item) },
      opts,
    );
    return result.ResultGet ?? [];
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
      values: { ClaseCmp: claseCmp },
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

  async getPuntosVenta(auth: WsfeAuth, opts?: CallOptions): Promise<PtoVentaItem[]> {
    return this.getParam(auth, 'FEParamGetPtosVenta', 'PtoVenta', S.PTO_VENTA, opts);
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
    const result = await this.consulta<{ ResultGet?: Partial<CotizacionResult> & { MonCotiz: number } }>(
      'FEParamGetCotizacion',
      auth,
      { MonId: monedaId, FchCotiz: opts?.fchCotiz },
      { request: S.COTIZACION_REQ, response: S.COTIZACION_RESP },
      opts,
    );
    const r = result.ResultGet;
    if (!r) throw sinCampo('FEParamGetCotizacion', 'ResultGet');
    return { MonId: r.MonId ?? monedaId, MonCotiz: r.MonCotiz, FchCotiz: r.FchCotiz ?? '' };
  }

  async getCantMaxRegistros(auth: WsfeAuth, opts?: CallOptions): Promise<number> {
    const result = await this.consulta<{ RegXReq: number }>(
      'FECompTotXRequest',
      auth,
      {},
      { response: S.REG_X_REQ_RESP },
      opts,
    );
    return result.RegXReq;
  }

  // ============================================================
  // CAEA - Autorización Anticipada
  // ============================================================

  private async caeaGet(method: string, auth: WsfeAuth, periodo: string, orden: number, opts?: CallOptions) {
    const result = await this.consulta<{ ResultGet?: CaeaSolicitarResult; Events?: unknown }>(
      method,
      auth,
      { Periodo: periodo, Orden: orden },
      { request: S.CAEA_REQ, response: S.CAEA_GET_RESP },
      opts,
    );
    const r = result.ResultGet;
    if (!r) throw sinCampo(method, 'ResultGet.CAEA');
    const caea: CaeaSolicitarResult = {
      ...r,
      FchVigDesde: r.FchVigDesde ?? '',
      FchVigHasta: r.FchVigHasta ?? '',
      FchTopeInf: r.FchTopeInf ?? '',
      FchProceso: r.FchProceso ?? '',
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
        FeCabReq: { CantReg: request.invoices.length, PtoVta: request.PtoVta, CbteTipo: request.CbteTipo },
        FeDetReq: request.invoices.map((inv) => ({
          ...detInput(inv),
          CAEA: inv.CAEA,
          CbteFchHsGen: inv.CbteFchHsGen,
        })),
      },
      S.FECAEA_REQ,
      'FECAEARegInformativo',
    );
    return this.emitir<CaeaRegInfResult>(
      'FECAEARegInformativo',
      { Auth: auth, FeCAEARegInfReq: feCAEARegInfReq },
      request,
      'FECAEADetResponse',
      S.FECAEA_RESP,
      opts,
    );
  }

  /**
   * Informa que un punto de venta no tuvo movimientos con un CAEA (emisión, no
   * se reintenta). Un `ArcaSoapError` con `uncertain: true` significa que no se
   * sabe si quedó informado: verificarlo con `consultarSinMovimientoCAEA`.
   */
  async sinMovimientoCAEA(auth: WsfeAuth, caea: string, ptoVta: number, opts?: CallOptions): Promise<CaeaSinMovResult> {
    const method = 'FECAEASinMovimientoInformar';
    const body = encodeRequest({ PtoVta: ptoVta, CAEA: caea }, S.CAEA_SIN_MOV_INFORMAR_REQ, method);
    const raw = await this.call(method, { Auth: auth, ...body }, { ...opts, kind: 'emision' });
    checkErrors(raw);
    let result: CaeaSinMovResult | undefined;
    try {
      result = decodeArca<CaeaSinMovResult>(raw, S.CAEA_SIN_MOV_RESP, method);
    } catch {
      // Forma inválida: se trata como respuesta sin Resultado.
    }
    if (result?.Resultado !== 'A' && result?.Resultado !== 'R') {
      throw new ArcaSoapError(`Respuesta de ${method} sin Resultado`, { uncertain: true });
    }
    return result;
  }

  /**
   * Consulta los informes "sin movimiento" de un CAEA
   * (`FECAEASinMovimientoConsultar`). Devuelve `[]` si no hay ninguno.
   * @param caea - CAEA a consultar.
   * @param ptoVta - Punto de venta vinculado al CAEA.
   */
  async consultarSinMovimientoCAEA(
    auth: WsfeAuth,
    caea: string,
    ptoVta: number,
    opts?: CallOptions,
  ): Promise<CaeaSinMovItem[]> {
    const result = await this.consulta<{ ResultGet?: { FECAEASinMov?: CaeaSinMovItem | CaeaSinMovItem[] } }>(
      'FECAEASinMovimientoConsultar',
      auth,
      { CAEA: caea, PtoVta: ptoVta },
      { request: S.CAEA_SIN_MOV_CONSULTAR_REQ, response: S.CAEA_SIN_MOV_CONS_RESP },
      opts,
    );
    return ensureArray(result.ResultGet?.FECAEASinMov).map((i) => ({ ...i, FchProceso: i.FchProceso ?? '' }));
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
    Concepto: inv.Concepto,
    DocTipo: inv.DocTipo,
    DocNro: inv.DocNro,
    CbteDesde: inv.CbteDesde,
    CbteHasta: inv.CbteHasta,
    CbteFch: inv.CbteFch,
    ImpTotal: inv.ImpTotal,
    ImpTotConc: inv.ImpTotConc,
    ImpNeto: inv.ImpNeto,
    ImpOpEx: inv.ImpOpEx,
    ImpTrib: inv.ImpTrib,
    ImpIVA: inv.ImpIVA,
    FchServDesde: inv.FchServDesde || undefined,
    FchServHasta: inv.FchServHasta || undefined,
    FchVtoPago: inv.FchVtoPago || undefined,
    MonId: inv.MonId,
    MonCotiz: inv.MonCotiz ?? undefined,
    CanMisMonExt: inv.CanMisMonExt || undefined,
    CondicionIVAReceptorId: inv.CondicionIVAReceptorId ?? undefined,
    CbtesAsoc: lista(inv.CbtesAsoc)?.map((c) => ({
      Tipo: c.Tipo,
      PtoVta: c.PtoVta,
      Nro: c.Nro,
      Cuit: presente(c.Cuit) ? String(c.Cuit) : undefined,
      CbteFch: c.CbteFch || undefined,
    })),
    Tributos: lista(inv.Tributos)?.map((t) => ({
      Id: t.Id,
      Desc: t.Desc || undefined,
      BaseImp: t.BaseImp,
      Alic: t.Alic,
      Importe: t.Importe,
    })),
    Iva: lista(inv.Iva)?.map((i) => ({ Id: i.Id, BaseImp: i.BaseImp, Importe: i.Importe })),
    Opcionales: lista(inv.Opcionales)?.map((o) => ({ Id: o.Id, Valor: o.Valor })),
    Compradores: lista(inv.Compradores)?.map((c) => ({
      DocTipo: c.DocTipo,
      DocNro: c.DocNro,
      Porcentaje: c.Porcentaje,
    })),
    PeriodoAsoc: inv.PeriodoAsoc
      ? { FchDesde: inv.PeriodoAsoc.FchDesde, FchHasta: inv.PeriodoAsoc.FchHasta }
      : undefined,
    Actividades: lista(inv.Actividades)?.map((a) => ({ Id: a.Id })),
  };
}

/**
 * Arma un `FEDetRequest` en el orden de la secuencia del WSDL de WSFEv1
 * (Concepto … ImpIVA, FchServ*, MonId, MonCotiz, CanMisMonExt,
 * CondicionIVAReceptorId, CbtesAsoc, Tributos, Iva, Opcionales, Compradores,
 * PeriodoAsoc, Actividades). Los opcionales ausentes no se envían.
 *
 * @throws ArcaValidationError si un campo no tiene el tipo del WSDL.
 */
export function buildDetRequest(inv: InvoiceDetail): R {
  return encodeRequest(detInput(inv), S.FE_DET_REQ, 'FECAEDetRequest');
}
