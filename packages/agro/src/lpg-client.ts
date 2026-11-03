import { SoapServiceClient, parseServerStatus } from '@ramiidv/arca-common';
import type { CallOptions, ServerStatus, ServiceErrorDetail, SoapOperationKind } from '@ramiidv/arca-common';
import { LPG_NAMESPACE } from './constants.js';
import type { ServiceContext } from './context.js';
import { ArcaAgroServiceError } from './errors.js';
import {
  at,
  checkErrors,
  decodeResult,
  requireValue,
  soloSinRegistros,
  ticketAuth,
  withAdvertencias,
} from './internal.js';
import { encodeRequest, obj, wrapped } from './schema.js';
import type { Schema } from './schema.js';
import * as S from './lpg-schemas.js';
import type { CodigoDescripcion } from './types.js';
import type {
  AjusteConsultaResultado,
  AjusteContratoParams,
  AjusteContratoResultado,
  AjusteUnificadoParams,
  AjusteUnificadoResultado,
  AnulacionCertificacionResultado,
  AnulacionContraDocumentoParams,
  AnulacionLiquidacionResultado,
  AsociarAContratoParams,
  AutorizarAnticipoParams,
  CancelarAnticipoParams,
  CertificacionConsultaResultado,
  CertificacionResultado,
  CertificadoConSaldoLpg,
  CgAutorizarParams,
  CgBuscarCertConSaldoDisponibleParams,
  CgBuscarCtgParams,
  CgInformarCalidadParams,
  CtgCertificableLpg,
  GradoEntregadoLpg,
  LiquidacionAutorizarParams,
  LiquidacionConsultaResultado,
  LiquidacionPorContratoParams,
  LiquidacionResultado,
  LsgAjustarXCoeParams,
  LsgAjustarXContratoParams,
  LsgAjusteResultado,
  LsgAutorizarParams,
  LsgAutorizarResultado,
  LsgConsultaResultado,
} from './lpg-types.js';
import { checkBloqueCertificado, checkCalidadCg, requireAjuste } from './validation.js';

const SERVICE = 'WSLPG';

/** Elementos de request/response de cada operación (del WSDL). */
interface Op {
  method: string;
  req: string;
  resp: string;
  /** Hijo del `<op>Resp` que common no desenvuelve solo (no termina en `Return`). */
  ret?: string;
}

const op = (method: string, req: string, resp = req.replace(/Req$/, 'Resp')): Op => ({ method, req, resp });

const OPS = {
  liquidacionAutorizar: op('liquidacionAutorizar', 'liquidacionReq'),
  liquidacionXCoeConsultar: op('liquidacionXCoeConsultar', 'liqConsXCoeReq'),
  liquidacionXNroOrdenConsultar: op('liquidacionXNroOrdenConsultar', 'liqConsXNroOrdenReq'),
  liquidacionUltimoNroOrdenConsultar: op('liquidacionUltimoNroOrdenConsultar', 'liqUltNroOrdenReq'),
  liquidacionAnular: op('liquidacionAnular', 'anulacionReq'),
  lpgAnularContraDocumento: op('lpgAnularContraDocumento', 'LpgAnularContraDocumentoReq'),
  liquidacionAjustarUnificado: op('liquidacionAjustarUnificado', 'ajustarUnificadoReq'),
  liquidacionAjustarContrato: op('liquidacionAjustarContrato', 'ajustarContratoReq'),
  asociarLiquidacionAContrato: {
    ...op('asociarLiquidacionAContrato', 'asociarLiqAContratoReq'),
    ret: 'liquidacion',
  },
  liquidacionPorContratoConsultar: {
    ...op('liquidacionPorContratoConsultar', 'liquidacionPorContratoConsultarReq'),
    ret: 'liqPorContratoCons',
  },
  lpgAutorizarAnticipo: op('lpgAutorizarAnticipo', 'LpgAutorizarAnticipoReq'),
  lpgCancelarAnticipo: op('lpgCancelarAnticipo', 'LpgCancelarAnticipoReq'),
  ajusteXCoeConsultar: op('ajusteXCoeConsultar', 'ajusteXCoeConsReq', 'ajusteXcoeConsResp'),
  ajusteXNroOrdenConsultar: op('ajusteXNroOrdenConsultar', 'ajusteXNroOrdenConsReq'),
  ajustePorContratoConsultar: op('ajustePorContratoConsultar', 'ajustePorContratoConsultarReq'),
  lsgAutorizar: op('lsgAutorizar', 'lsgAutorizarReq'),
  lsgConsultarXCoe: op('lsgConsultarXCoe', 'lsgConsultarXCoeReq'),
  lsgConsultarXNroOrden: op('lsgConsultarXNroOrden', 'lsgConsultarXNroOrdenReq'),
  lsgConsultarUltimoNroOrden: op('lsgConsultarUltimoNroOrden', 'lsgConsultarUltimoNroOrdenReq'),
  lsgConsultarXContrato: { ...op('lsgConsultarXContrato', 'lsgConsultarXContratoReq'), ret: 'liqPorContratoCons' },
  lsgAnular: op('lsgAnular', 'lsgAnularReq'),
  lsgAnularContraDocumento: op('lsgAnularContraDocumento', 'LsgAnularContraDocumentoReq'),
  lsgAjustarXCoe: op('lsgAjustarXCoe', 'lsgAjustarXCoeReq'),
  lsgAjustarXContrato: op('lsgAjustarXContrato', 'lsgAjustarXContratoReq'),
  lsgAsociarAContrato: op('lsgAsociarAContrato', 'lsgAsociarAContratoReq'),
  cgAutorizar: op('cgAutorizar', 'cgAutorizarReq'),
  cgInformarCalidad: op('cgInformarCalidad', 'CgInformarCalidadReq'),
  cgSolicitarAnulacion: op('cgSolicitarAnulacion', 'cgSolicitarAnulacionReq'),
  cgConfirmarAnulacion: op('cgConfirmarAnulacion', 'cgConfirmarAnulacionReq'),
  cgConsultarUltimoNroOrden: op('cgConsultarUltimoNroOrden', 'cgConsultarUltimoNroOrdenReq'),
  cgConsultarXCoe: op('cgConsultarXCoe', 'cgConsultarXCoeReq'),
  // El WSDL usa mayúscula inicial en estos elementos.
  cgConsultarXNroOrden: op('cgConsultarXNroOrden', 'CgConsultarXNroOrdenReq'),
  cgBuscarCtg: op('cgBuscarCtg', 'cgBuscarCtgReq'),
  cgBuscarCertConSaldoDisponible: op('cgBuscarCertConSaldoDisponible', 'cgBuscarCertConSaldoDisponibleReq'),
  provinciasConsultar: op('provinciasConsultar', 'provinciasReq'),
  localidadXProvinciaConsultar: op('localidadXProvinciaConsultar', 'localidadReq'),
  tipoOperacionXActividadConsultar: op('tipoOperacionXActividadConsultar', 'tipoOperacionReq'),
  puertoConsultar: op('puertoConsultar', 'puertoReq'),
  tipoActividadConsultar: op('tipoActividadConsultar', 'tipoActividadReq'),
  tipoActividadRepresentadoConsultar: op('tipoActividadRepresentadoConsultar', 'tipoActividadRepresentadoReq'),
  tipoCertificadoDepositoConsultar: op('tipoCertificadoDepositoConsultar', 'tipoCertificadoDepReq'),
  tipoRetencionConsultar: op('tipoRetencionConsultar', 'tipoRetencionReq'),
  tipoDeduccionConsultar: op('tipoDeduccionConsultar', 'tipoDeduccionReq'),
  tipoGranoConsultar: op('tipoGranoConsultar', 'tipoGranoReq'),
  codigoGradoReferenciaConsultar: op('codigoGradoReferenciaConsultar', 'gradoReferenciaReq'),
  codigoGradoEntregadoXTipoGranoConsultar: op('codigoGradoEntregadoXTipoGranoConsultar', 'gradoEntregadoReq'),
  campaniasConsultar: op('campaniasConsultar', 'campaniaReq'),
  dummy: op('dummy', '', 'dummyResp'),
} as const;

/** Ruta del COE en las respuestas con `autorizacion` (liquidaciones, anticipos, contradocumentos, certificaciones). */
const COE_AUTORIZACION = 'autorizacion.coe';
/** Ruta del COE en las respuestas de ajuste unificado y sus consultas. */
const COE_AJUSTE = 'ajusteUnificado.coe';

/** `pdf` de los requests (`LpgSiNoType`). */
const siNo = (pdf: boolean | undefined) => (pdf === undefined ? undefined : pdf ? 'S' : 'N');

/**
 * Cliente de WSLPG (Liquidación Primaria y Secundaria de Granos). Se accede como `agro.lpg`.
 *
 * Cubre todas las operaciones del WSDL: liquidación primaria (autorizar,
 * consultar, anular por contradocumento, último número de orden, ajuste
 * unificado y por contrato, asociación a contrato, anticipos), liquidación
 * secundaria (`lsg*`), certificación primaria (`cg*`) y las paramétricas.
 *
 * Las autorizaciones, anulaciones, ajustes, asociaciones, anticipos y la
 * calidad de una certificación son emisiones: nunca se reintentan y, si la
 * respuesta se pierde, el
 * `ArcaSoapError` tiene `uncertain: true` (ver README, "Recuperar una emisión
 * incierta").
 *
 * El error 1021 (no se pudo generar el PDF) no cancela la operación: el
 * resultado viene sin `pdf` y con el error en `advertencias`. En las consultas
 * de listas, el error 600 (sin registros, manual WSLPG §1.7) devuelve `[]`.
 */
export class LpgClient extends SoapServiceClient {
  readonly #ctx: ServiceContext;

  /** @internal Se construye desde `ArcaAgro`. */
  constructor(ctx: ServiceContext) {
    super({ endpoint: ctx.endpoint, namespace: LPG_NAMESPACE, transport: ctx.transport });
    this.#ctx = ctx;
  }

  // ============================================================
  // Internos
  // ============================================================

  /**
   * Llama a una operación de WSLPG y devuelve el nodo `*Return` (common lo
   * desenvuelve), sin verificar errores.
   */
  async #request(
    o: Op,
    body: Record<string, unknown> | null,
    kind: SoapOperationKind,
    opts?: CallOptions,
  ): Promise<Record<string, unknown>> {
    // `LpgAuthType`: token, sign y cuit (no `cuitRepresentada`).
    const params =
      body === null
        ? {}
        : { auth: { ...(await ticketAuth(this.#ctx.getTicket, opts)), cuit: this.#ctx.cuit }, ...body };
    const result = await this.soapCall(o.method, params, {
      kind,
      signal: this.#ctx.callOptions(opts).signal,
      requestElement: body === null ? null : o.req,
      responseElement: o.resp,
      soapActionFromMethod: true,
      parseNumbers: false,
    });
    const inner = o.ret === undefined ? result : result[o.ret];
    return inner !== null && typeof inner === 'object' && !Array.isArray(inner)
      ? (inner as Record<string, unknown>)
      : {};
  }

  /**
   * `#request` y verificación de `errores` y `erroresFormato`: devuelve el
   * nodo y los errores admitidos.
   *
   * @param conResultado En emisiones: la respuesta trae el resultado (ver `checkErrors`).
   */
  async #call(
    o: Op,
    body: Record<string, unknown> | null,
    kind: SoapOperationKind,
    opts?: CallOptions,
    conResultado?: (node: Record<string, unknown>) => boolean,
  ): Promise<{ node: Record<string, unknown>; advertencias: ServiceErrorDetail[] }> {
    const node = await this.#request(o, body, kind, opts);
    const advertencias = checkErrors(node, SERVICE, o.method, kind, conResultado);
    return { node, advertencias };
  }

  /** Llama, decodifica y agrega `advertencias`. */
  async #operacion<T extends object>(
    o: Op,
    body: Record<string, unknown>,
    schema: Schema,
    kind: SoapOperationKind,
    opts?: CallOptions,
    conResultado?: (node: Record<string, unknown>) => boolean,
  ): Promise<T> {
    const { node, advertencias } = await this.#call(o, body, kind, opts, conResultado);
    return withAdvertencias(decodeResult<T>(node, schema, o.method, kind), advertencias);
  }

  /**
   * Llama, decodifica y exige el COE en `coePath` (ej: `autorizacion.coe`).
   * En emisiones que crean un comprobante, si la respuesta trae errores y
   * también el COE, el error es `uncertain`. En las operaciones sobre un
   * comprobante que ya existe (`sobreExistente`: asociar a contrato, informar
   * calidad) el COE de la respuesta es el que se informó, así que no indica que
   * la operación se haya procesado.
   */
  async #conCoe<T extends object>(
    o: Op,
    body: Record<string, unknown>,
    schema: Schema,
    coePath: string,
    kind: SoapOperationKind,
    opts?: CallOptions,
    sobreExistente = false,
  ): Promise<T> {
    const conResultado = sobreExistente ? undefined : (n: Record<string, unknown>) => Boolean(at(n, coePath));
    const res = await this.#operacion<T>(o, body, schema, kind, opts, conResultado);
    requireValue(at(res, coePath), coePath, SERVICE, o.method, kind);
    return res;
  }

  /**
   * Consulta de lista: devuelve `<key>` del resultado. Si el único error no
   * admitido es el 600 ("sin registros", manual WSLPG §1.7), devuelve `[]`.
   */
  async #lista<T>(o: Op, body: Record<string, unknown>, schema: Schema, key: string, opts?: CallOptions): Promise<T[]> {
    const node = await this.#request(o, body, 'consulta', opts);
    if (soloSinRegistros(node, SERVICE)) return [];
    checkErrors(node, SERVICE, o.method, 'consulta');
    return decodeResult<Record<string, T[]>>(node, schema, o.method, 'consulta')[key];
  }

  /** `{ coe, pdf }` (`LpgLiqConsXCoeReqType`). */
  #coePdf(o: Op, coe: string | number, pdf: boolean | undefined): Record<string, unknown> {
    return encodeRequest({ coe, pdf: siNo(pdf) }, S.CONSULTA_X_COE, o.method);
  }

  #nroOrden(o: Op, ptoEmision: number, nroOrden: number): Record<string, unknown> {
    return encodeRequest({ ptoEmision, nroOrden }, S.CONSULTA_X_NRO_ORDEN, o.method);
  }

  async #ultimoNroOrden(o: Op, ptoEmision: number, opts?: CallOptions): Promise<number> {
    const body = encodeRequest({ ptoEmision }, S.ULT_NRO_ORDEN, o.method);
    const { node } = await this.#call(o, body, 'consulta', opts);
    return decodeResult<{ nroOrden: number }>(node, S.R_ULT_NRO_ORDEN, o.method, 'consulta').nroOrden;
  }

  /** `liquidacionAnular` / `lsgAnular`: `resultado: 'R'` lanza. */
  async #anular(o: Op, body: Record<string, unknown>, opts?: CallOptions): Promise<AnulacionLiquidacionResultado> {
    const { node, advertencias } = await this.#call(o, body, 'emision', opts, (n) => at(n, 'resultado') === 'A');
    const res = decodeResult<AnulacionLiquidacionResultado>(node, S.R_ANULACION_RETURN, o.method, 'emision');
    if (res.resultado === 'R') {
      throw new ArcaAgroServiceError(
        `${SERVICE} ${o.method}: anulación rechazada (resultado R)`,
        advertencias,
        SERVICE,
        o.method,
        node,
      );
    }
    return withAdvertencias(res, advertencias);
  }

  /** `lpgAnularContraDocumento` / `lsgAnularContraDocumento` (`LpgAnularContraDocumentoReqType`). */
  async #anularContraDocumento(
    o: Op,
    params: AnulacionContraDocumentoParams,
    opts?: CallOptions,
  ): Promise<LiquidacionConsultaResultado> {
    const body = encodeRequest(params, S.ANULAR_CONTRA_DOCUMENTO, o.method);
    return this.#conCoe(o, body, S.R_LIQ_CONS_RETURN, COE_AUTORIZACION, 'emision', opts);
  }

  async #parametrica<T = CodigoDescripcion>(
    o: Op,
    container: string,
    body: Record<string, unknown> = {},
    opts?: CallOptions,
    item = 'codigoDescripcion',
    itemSchema: Schema = S.R_CODIGO_DESCRIPCION,
  ): Promise<T[]> {
    return this.#lista<T>(o, body, { [container]: wrapped(item, obj(itemSchema), 0) }, container, opts);
  }

  // ============================================================
  // Liquidación primaria
  // ============================================================

  /**
   * Autoriza una liquidación primaria de granos. Emisión: si falla con
   * `uncertain`, consultá `liquidacionUltimoNroOrdenConsultar(ptoEmision)` y
   * `liquidacionXNroOrdenConsultar` antes de reintentar.
   */
  async liquidacionAutorizar(params: LiquidacionAutorizarParams, opts?: CallOptions): Promise<LiquidacionResultado> {
    const o = OPS.liquidacionAutorizar;
    const body = encodeRequest(params, S.LIQUIDACION_AUTORIZAR, o.method);
    return this.#conCoe(o, body, S.R_LIQ_RETURN, COE_AUTORIZACION, 'emision', opts);
  }

  /** Consulta una liquidación por COE. `pdf: true` pide la constancia en base64. */
  async liquidacionXCoeConsultar(
    coe: string | number,
    params: { pdf?: boolean } = {},
    opts?: CallOptions,
  ): Promise<LiquidacionConsultaResultado> {
    const o = OPS.liquidacionXCoeConsultar;
    const body = this.#coePdf(o, coe, params.pdf);
    return this.#conCoe(o, body, S.R_LIQ_CONS_RETURN, COE_AUTORIZACION, 'consulta', opts);
  }

  /** Consulta una liquidación por punto de emisión y número de orden. */
  async liquidacionXNroOrdenConsultar(
    ptoEmision: number,
    nroOrden: number,
    opts?: CallOptions,
  ): Promise<LiquidacionConsultaResultado> {
    const o = OPS.liquidacionXNroOrdenConsultar;
    const body = this.#nroOrden(o, ptoEmision, nroOrden);
    return this.#conCoe(o, body, S.R_LIQ_CONS_RETURN, COE_AUTORIZACION, 'consulta', opts);
  }

  /**
   * Último número de orden de liquidación para un punto de emisión.
   * @throws ArcaAgroResponseError si ARCA no devuelve `nroOrden`.
   */
  async liquidacionUltimoNroOrdenConsultar(ptoEmision: number, opts?: CallOptions): Promise<number> {
    return this.#ultimoNroOrden(OPS.liquidacionUltimoNroOrdenConsultar, ptoEmision, opts);
  }

  /**
   * Anula una liquidación por COE. Emisión.
   * @deprecated Discontinuado desde el manual WSLPG v1.21 (sigue en el WSDL): usá
   *   `lpgAnularContraDocumento`.
   * @throws ArcaAgroServiceError si ARCA responde `resultado: 'R'` (rechazada).
   */
  async liquidacionAnular(coe: string | number, opts?: CallOptions): Promise<AnulacionLiquidacionResultado> {
    const o = OPS.liquidacionAnular;
    return this.#anular(o, encodeRequest({ coe }, S.ANULACION, o.method), opts);
  }

  /**
   * Anula una liquidación generando un contradocumento: una nueva liquidación
   * con la misma información que la anulada (manual WSLPG §2.4.47), que arranca
   * en estado `PA` (pendiente de aceptación del vendedor, §2.4.6.2). La
   * respuesta sigue el WSDL (`LpgLiqConsRespType`, como `liquidacionXCoeConsultar`),
   * aunque el manual la describe como la de un ajuste unificado. Consume un número de
   * orden del mismo contador que las liquidaciones. Emisión: si falla con
   * `uncertain`, consultá `liquidacionUltimoNroOrdenConsultar(puntoEmision)` y
   * `liquidacionXNroOrdenConsultar` antes de reintentar.
   */
  async lpgAnularContraDocumento(
    params: AnulacionContraDocumentoParams,
    opts?: CallOptions,
  ): Promise<LiquidacionConsultaResultado> {
    return this.#anularContraDocumento(OPS.lpgAnularContraDocumento, params, opts);
  }

  /**
   * Ajuste unificado (crédito y/o débito) de una liquidación. Emisión: si falla
   * con `uncertain`, consultá `liquidacionUltimoNroOrdenConsultar` (el contador
   * es compartido con las liquidaciones) y `ajusteXNroOrdenConsultar`.
   */
  async liquidacionAjustarUnificado(
    params: AjusteUnificadoParams,
    opts?: CallOptions,
  ): Promise<AjusteUnificadoResultado> {
    const o = OPS.liquidacionAjustarUnificado;
    const body = encodeRequest(params, S.AJUSTE_UNIFICADO, o.method, requireAjuste);
    return this.#conCoe(o, body, S.R_AJUSTE_UNIFICADO_RETURN, COE_AJUSTE, 'emision', opts);
  }

  /**
   * Ajuste único de todas las liquidaciones activas de un contrato (crédito
   * y/o débito). Emisión: si falla con `uncertain`, consultá
   * `liquidacionUltimoNroOrdenConsultar` y `ajusteXNroOrdenConsultar` (o
   * `ajustePorContratoConsultar`).
   */
  async liquidacionAjustarContrato(params: AjusteContratoParams, opts?: CallOptions): Promise<AjusteContratoResultado> {
    const o = OPS.liquidacionAjustarContrato;
    const body = encodeRequest(params, S.AJUSTE_CONTRATO, o.method, requireAjuste);
    return this.#conCoe(o, body, S.R_AJUSTE_CONTRATO_RETURN, 'ajusteContrato.coe', 'emision', opts);
  }

  /** Asocia una liquidación original (COE) a un contrato. Emisión; devuelve la liquidación. */
  async asociarLiquidacionAContrato(
    params: AsociarAContratoParams,
    opts?: CallOptions,
  ): Promise<LiquidacionConsultaResultado> {
    const o = OPS.asociarLiquidacionAContrato;
    const body = encodeRequest(params, S.ASOCIAR_A_CONTRATO, o.method);
    return this.#conCoe(o, body, S.R_LIQ_CONS_RETURN, COE_AUTORIZACION, 'emision', opts, true);
  }

  /**
   * Autoriza un anticipo de liquidación primaria. Emisión: si falla con
   * `uncertain`, consultá `liquidacionUltimoNroOrdenConsultar(ptoEmision)` y
   * `liquidacionXNroOrdenConsultar` antes de reintentar.
   */
  async lpgAutorizarAnticipo(params: AutorizarAnticipoParams, opts?: CallOptions): Promise<LiquidacionResultado> {
    const o = OPS.lpgAutorizarAnticipo;
    const body = encodeRequest(params, S.AUTORIZAR_ANTICIPO, o.method);
    return this.#conCoe(o, body, S.R_LIQ_RETURN, COE_AUTORIZACION, 'emision', opts);
  }

  /**
   * Cancela el anticipo `coe` con una nueva liquidación (`ptoEmision`,
   * `nroOrden`). Emisión: si falla con `uncertain`, consultá
   * `liquidacionUltimoNroOrdenConsultar(ptoEmision)` y `liquidacionXNroOrdenConsultar`.
   */
  async lpgCancelarAnticipo(params: CancelarAnticipoParams, opts?: CallOptions): Promise<LiquidacionConsultaResultado> {
    const o = OPS.lpgCancelarAnticipo;
    const { pdf, ...rest } = params;
    // `pdf` es obligatorio en el XSD: sin `pdf: true` se envía `N`.
    const body = encodeRequest({ ...rest, pdf: siNo(pdf ?? false) }, S.CANCELAR_ANTICIPO, o.method);
    return this.#conCoe(o, body, S.R_LIQ_CONS_RETURN, COE_AUTORIZACION, 'emision', opts);
  }

  /** Consulta un ajuste por COE. `pdf: true` pide la constancia en base64. */
  async ajusteXCoeConsultar(
    coe: string | number,
    params: { pdf?: boolean } = {},
    opts?: CallOptions,
  ): Promise<AjusteConsultaResultado> {
    const o = OPS.ajusteXCoeConsultar;
    const body = this.#coePdf(o, coe, params.pdf);
    return this.#conCoe(o, body, S.R_AJUSTE_CONS_RETURN, COE_AJUSTE, 'consulta', opts);
  }

  /**
   * Consulta un ajuste por punto de emisión y número de orden. Sirve para
   * recuperar un `liquidacionAjustarUnificado` incierto (el número de orden es
   * el mismo contador que el de las liquidaciones).
   */
  async ajusteXNroOrdenConsultar(
    ptoEmision: number,
    nroOrden: number,
    opts?: CallOptions,
  ): Promise<AjusteConsultaResultado> {
    const o = OPS.ajusteXNroOrdenConsultar;
    const body = this.#nroOrden(o, ptoEmision, nroOrden);
    return this.#conCoe(o, body, S.R_AJUSTE_CONS_RETURN, COE_AJUSTE, 'consulta', opts);
  }

  /** Consulta el ajuste de un contrato (un único ajuste: sin ajuste, ARCA responde 600 y se lanza). */
  async ajustePorContratoConsultar(nroContrato: number, opts?: CallOptions): Promise<AjusteConsultaResultado> {
    const o = OPS.ajustePorContratoConsultar;
    const body = encodeRequest({ nroContrato }, S.AJUSTE_POR_CONTRATO, o.method);
    return this.#conCoe(o, body, S.R_AJUSTE_CONS_RETURN, COE_AJUSTE, 'consulta', opts);
  }

  /** COEs de las liquidaciones asociadas a un contrato. Sin resultados → `[]`. */
  async liquidacionPorContratoConsultar(params: LiquidacionPorContratoParams, opts?: CallOptions): Promise<string[]> {
    const o = OPS.liquidacionPorContratoConsultar;
    const body = encodeRequest(params, S.LIQ_POR_CONTRATO, o.method);
    return this.#lista(o, body, S.R_LIQ_POR_CONTRATO_RETURN, 'coeRelacionados', opts);
  }

  // ============================================================
  // Liquidación secundaria (lsg*)
  // ============================================================

  /**
   * Autoriza una liquidación secundaria de granos. Emisión: si falla con
   * `uncertain`, consultá `lsgConsultarUltimoNroOrden(ptoEmision)` y
   * `lsgConsultarXNroOrden` antes de reintentar.
   */
  async lsgAutorizar(params: LsgAutorizarParams, opts?: CallOptions): Promise<LsgAutorizarResultado> {
    const o = OPS.lsgAutorizar;
    const body = encodeRequest(params, S.LSG_AUTORIZAR, o.method);
    return this.#conCoe(o, body, S.R_LSG_AUTORIZAR_RETURN, COE_AUTORIZACION, 'emision', opts);
  }

  /**
   * Consulta una liquidación secundaria por COE (un ajuste con crédito y débito
   * trae dos `liquidaciones`). `pdf: true` pide la constancia en base64.
   */
  async lsgConsultarXCoe(
    coe: string | number,
    params: { pdf?: boolean } = {},
    opts?: CallOptions,
  ): Promise<LsgConsultaResultado> {
    const o = OPS.lsgConsultarXCoe;
    return this.#operacion(o, this.#coePdf(o, coe, params.pdf), S.R_LSG_CONSULTA_RETURN, 'consulta', opts);
  }

  /** Consulta una liquidación secundaria por punto de emisión y número de orden. */
  async lsgConsultarXNroOrden(ptoEmision: number, nroOrden: number, opts?: CallOptions): Promise<LsgConsultaResultado> {
    const o = OPS.lsgConsultarXNroOrden;
    const body = this.#nroOrden(o, ptoEmision, nroOrden);
    return this.#operacion(o, body, S.R_LSG_CONSULTA_RETURN, 'consulta', opts);
  }

  /** Último número de orden de liquidación secundaria para un punto de emisión. */
  async lsgConsultarUltimoNroOrden(ptoEmision: number, opts?: CallOptions): Promise<number> {
    return this.#ultimoNroOrden(OPS.lsgConsultarUltimoNroOrden, ptoEmision, opts);
  }

  /** COEs de las liquidaciones secundarias asociadas a un contrato. Sin resultados → `[]`. */
  async lsgConsultarXContrato(params: LiquidacionPorContratoParams, opts?: CallOptions): Promise<string[]> {
    const o = OPS.lsgConsultarXContrato;
    const body = encodeRequest(params, S.LIQ_POR_CONTRATO, o.method);
    return this.#lista(o, body, S.R_LIQ_POR_CONTRATO_RETURN, 'coeRelacionados', opts);
  }

  /**
   * Anula una liquidación secundaria por COE. Emisión.
   * @deprecated Discontinuado desde el manual WSLPG v1.22 (sigue en el WSDL): usá
   *   `lsgAnularContraDocumento`.
   * @throws ArcaAgroServiceError si ARCA responde `resultado: 'R'` (rechazada).
   */
  async lsgAnular(
    coe: string | number,
    params: { pdf?: boolean } = {},
    opts?: CallOptions,
  ): Promise<AnulacionLiquidacionResultado> {
    const o = OPS.lsgAnular;
    return this.#anular(o, this.#coePdf(o, coe, params.pdf), opts);
  }

  /**
   * Anula una liquidación secundaria generando un contradocumento (misma
   * información que la anulada). Emisión: si falla con `uncertain`, consultá
   * `lsgConsultarUltimoNroOrden(puntoEmision)` y `lsgConsultarXNroOrden`.
   */
  async lsgAnularContraDocumento(
    params: AnulacionContraDocumentoParams,
    opts?: CallOptions,
  ): Promise<LiquidacionConsultaResultado> {
    return this.#anularContraDocumento(OPS.lsgAnularContraDocumento, params, opts);
  }

  /**
   * Ajusta una liquidación secundaria por COE (crédito y/o débito). Emisión:
   * si falla con `uncertain`, consultá `lsgConsultarUltimoNroOrden` y
   * `lsgConsultarXNroOrden`.
   */
  async lsgAjustarXCoe(params: LsgAjustarXCoeParams, opts?: CallOptions): Promise<LsgAjusteResultado> {
    const o = OPS.lsgAjustarXCoe;
    const body = encodeRequest(params, S.LSG_AJUSTAR_X_COE, o.method, requireAjuste);
    return this.#conCoe(o, body, S.R_LSG_AJUSTE_RETURN, 'coe', 'emision', opts);
  }

  /** Ajusta las liquidaciones secundarias de un contrato. Emisión (ver `lsgAjustarXCoe`). */
  async lsgAjustarXContrato(params: LsgAjustarXContratoParams, opts?: CallOptions): Promise<LsgAjusteResultado> {
    const o = OPS.lsgAjustarXContrato;
    const body = encodeRequest(params, S.LSG_AJUSTAR_X_CONTRATO, o.method, requireAjuste);
    return this.#conCoe(o, body, S.R_LSG_AJUSTE_RETURN, 'coe', 'emision', opts);
  }

  /** Asocia una liquidación secundaria (COE) a un contrato. Emisión; devuelve la liquidación. */
  async lsgAsociarAContrato(params: AsociarAContratoParams, opts?: CallOptions): Promise<LsgConsultaResultado> {
    const o = OPS.lsgAsociarAContrato;
    const body = encodeRequest(params, S.ASOCIAR_A_CONTRATO, o.method);
    // Las liquidaciones de la respuesta ya existían: no indican que la asociación se haya procesado.
    return this.#operacion(o, body, S.R_LSG_CONSULTA_RETURN, 'emision', opts);
  }

  // ============================================================
  // Certificación primaria de granos (cg*)
  // ============================================================

  /**
   * Autoriza una certificación (primaria, retiro/transferencia o preexistente).
   * Lleva solo el bloque de `cabecera.tipoCertificado`. Emisión: si falla con
   * `uncertain`, consultá `cgConsultarUltimoNroOrden` y `cgConsultarXNroOrden`
   * antes de reintentar.
   */
  async cgAutorizar(params: CgAutorizarParams, opts?: CallOptions): Promise<CertificacionResultado> {
    const o = OPS.cgAutorizar;
    const body = encodeRequest(params, S.CG_AUTORIZAR, o.method, checkBloqueCertificado);
    return this.#conCoe(o, body, S.R_CG_AUTORIZAR_RETURN, COE_AUTORIZACION, 'emision', opts);
  }

  /**
   * Informa la calidad de una certificación primaria. Emisión; devuelve la
   * certificación (como `cgConsultarXCoe`).
   */
  async cgInformarCalidad(
    params: CgInformarCalidadParams,
    opts?: CallOptions,
  ): Promise<CertificacionConsultaResultado> {
    const o = OPS.cgInformarCalidad;
    const body = encodeRequest(params, S.CG_INFORMAR_CALIDAD, o.method, checkCalidadCg);
    return this.#conCoe(o, body, S.R_CG_CONSULTAR_RETURN, COE_AUTORIZACION, 'emision', opts, true);
  }

  /** Consulta una certificación por COE. `pdf: true` pide la constancia en base64. */
  async cgConsultarXCoe(
    coe: string | number,
    params: { pdf?: boolean } = {},
    opts?: CallOptions,
  ): Promise<CertificacionConsultaResultado> {
    const o = OPS.cgConsultarXCoe;
    const body = this.#coePdf(o, coe, params.pdf);
    return this.#conCoe(o, body, S.R_CG_CONSULTAR_RETURN, COE_AUTORIZACION, 'consulta', opts);
  }

  /** Consulta una certificación por punto de emisión y número de orden. */
  async cgConsultarXNroOrden(
    ptoEmision: number,
    nroOrden: number,
    opts?: CallOptions,
  ): Promise<CertificacionConsultaResultado> {
    const o = OPS.cgConsultarXNroOrden;
    const body = this.#nroOrden(o, ptoEmision, nroOrden);
    return this.#conCoe(o, body, S.R_CG_CONSULTAR_RETURN, COE_AUTORIZACION, 'consulta', opts);
  }

  /** CTG/CPE confirmadas disponibles para certificar. Sin resultados → `[]`. */
  async cgBuscarCtg(params: CgBuscarCtgParams, opts?: CallOptions): Promise<CtgCertificableLpg[]> {
    const o = OPS.cgBuscarCtg;
    const body = encodeRequest(params, S.CG_BUSCAR_CTG, o.method);
    return this.#lista(o, body, S.R_CG_BUSCAR_CTG_RETURN, 'ctg', opts);
  }

  /** Certificados de depósito con saldo disponible. Sin resultados → `[]`. */
  async cgBuscarCertConSaldoDisponible(
    params: CgBuscarCertConSaldoDisponibleParams,
    opts?: CallOptions,
  ): Promise<CertificadoConSaldoLpg[]> {
    const o = OPS.cgBuscarCertConSaldoDisponible;
    const body = encodeRequest(params, S.CG_BUSCAR_CERT_SALDO, o.method);
    return this.#lista(o, body, S.R_CG_BUSCAR_CERT_SALDO_RETURN, 'certificado', opts);
  }

  /** Último número de orden de certificación para un punto de emisión. */
  async cgConsultarUltimoNroOrden(ptoEmision: number, opts?: CallOptions): Promise<number> {
    return this.#ultimoNroOrden(OPS.cgConsultarUltimoNroOrden, ptoEmision, opts);
  }

  /** Solicita la anulación de una certificación. Emisión. */
  async cgSolicitarAnulacion(
    coe: string | number,
    params: { pdf?: boolean } = {},
    opts?: CallOptions,
  ): Promise<AnulacionCertificacionResultado> {
    return this.#cgAnulacion(OPS.cgSolicitarAnulacion, coe, params, opts);
  }

  /** Confirma la anulación de una certificación. Emisión. */
  async cgConfirmarAnulacion(
    coe: string | number,
    params: { pdf?: boolean } = {},
    opts?: CallOptions,
  ): Promise<AnulacionCertificacionResultado> {
    return this.#cgAnulacion(OPS.cgConfirmarAnulacion, coe, params, opts);
  }

  async #cgAnulacion(
    o: Op,
    coe: string | number,
    params: { pdf?: boolean },
    opts?: CallOptions,
  ): Promise<AnulacionCertificacionResultado> {
    return this.#operacion(o, this.#coePdf(o, coe, params.pdf), S.R_CG_ANULACION_RETURN, 'emision', opts);
  }

  // ============================================================
  // Paramétricas
  // ============================================================

  async provinciasConsultar(opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.#parametrica(OPS.provinciasConsultar, 'provincias', {}, opts);
  }

  /** Localidades de una provincia (`codProvincia` es `xs:string` en el XSD). */
  async localidadXProvinciaConsultar(codProvincia: string | number, opts?: CallOptions): Promise<CodigoDescripcion[]> {
    const o = OPS.localidadXProvinciaConsultar;
    const body = encodeRequest({ codProvincia: String(codProvincia) }, S.LOCALIDADES, o.method);
    return this.#parametrica(o, 'localidades', body, opts);
  }

  /** Tipos de operación habilitados para una actividad. */
  async tipoOperacionXActividadConsultar(nroActLiquida: number, opts?: CallOptions): Promise<CodigoDescripcion[]> {
    const o = OPS.tipoOperacionXActividadConsultar;
    const body = encodeRequest({ nroActLiquida }, S.TIPO_OPERACION, o.method);
    return this.#parametrica(o, 'tiposOperacion', body, opts);
  }

  async puertoConsultar(opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.#parametrica(OPS.puertoConsultar, 'puertos', {}, opts);
  }

  async tipoActividadConsultar(opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.#parametrica(OPS.tipoActividadConsultar, 'tiposActividad', {}, opts);
  }

  async tipoActividadRepresentadoConsultar(opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.#parametrica(OPS.tipoActividadRepresentadoConsultar, 'tiposActividad', {}, opts);
  }

  async tipoCertificadoDepositoConsultar(opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.#parametrica(OPS.tipoCertificadoDepositoConsultar, 'tiposCertDep', {}, opts);
  }

  async tipoRetencionConsultar(opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.#parametrica(OPS.tipoRetencionConsultar, 'tiposRetencion', {}, opts);
  }

  async tipoDeduccionConsultar(opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.#parametrica(OPS.tipoDeduccionConsultar, 'tiposDeduccion', {}, opts);
  }

  async tipoGranoConsultar(opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.#parametrica(OPS.tipoGranoConsultar, 'granos', {}, opts);
  }

  async codigoGradoReferenciaConsultar(opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.#parametrica(OPS.codigoGradoReferenciaConsultar, 'gradosRef', {}, opts);
  }

  /** Grados entregados (con su valor) para un tipo de grano. */
  async codigoGradoEntregadoXTipoGranoConsultar(codGrano: number, opts?: CallOptions): Promise<GradoEntregadoLpg[]> {
    const o = OPS.codigoGradoEntregadoXTipoGranoConsultar;
    const body = encodeRequest({ codGrano }, S.GRADO_ENTREGADO, o.method);
    return this.#parametrica<GradoEntregadoLpg>(o, 'gradoEnt', body, opts, 'gradoEnt', S.R_GRADO_ENTREGADO);
  }

  async campaniasConsultar(opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.#parametrica(OPS.campaniasConsultar, 'campanias', {}, opts);
  }

  /** Estado de los servidores de WSLPG (no requiere autenticación). */
  async dummy(opts?: CallOptions): Promise<ServerStatus> {
    return parseServerStatus((await this.#call(OPS.dummy, null, 'consulta', opts)).node);
  }
}
