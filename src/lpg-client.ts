import { afipSoapCall } from '@ramiidv/arca-common';
import type { CallOptions, ServerStatus, SoapOperationKind } from '@ramiidv/arca-common';
import { LPG_NAMESPACE } from './constants.js';
import type { ServiceContext } from './context.js';
import { ArcaAgroResponseError, throwOnServiceErrors } from './errors.js';
import { decodeResponse, encodeRequest, obj, wrapped } from './schema.js';
import type { Schema } from './schema.js';
import * as S from './lpg-schemas.js';
import type { CodigoDescripcion } from './types.js';
import type {
  AjusteUnificadoParams,
  AjusteUnificadoResultado,
  AnulacionCertificacionResultado,
  AnulacionLiquidacionResultado,
  CertificacionResultado,
  CgAutorizarParams,
  GradoEntregadoLpg,
  LiquidacionAutorizarParams,
  LiquidacionConsultaResultado,
  LiquidacionResultado,
} from './lpg-types.js';
import { requireAjuste } from './validation.js';

const SERVICE = 'WSLPG';

/** Elementos de request/response de cada operación (del WSDL). */
interface Op {
  method: string;
  req: string;
  resp: string;
}

const op = (method: string, req: string, resp = req.replace(/Req$/, 'Resp')): Op => ({ method, req, resp });

const OPS = {
  liquidacionAutorizar: op('liquidacionAutorizar', 'liquidacionReq'),
  liquidacionXCoeConsultar: op('liquidacionXCoeConsultar', 'liqConsXCoeReq'),
  liquidacionXNroOrdenConsultar: op('liquidacionXNroOrdenConsultar', 'liqConsXNroOrdenReq'),
  liquidacionUltimoNroOrdenConsultar: op('liquidacionUltimoNroOrdenConsultar', 'liqUltNroOrdenReq'),
  liquidacionAnular: op('liquidacionAnular', 'anulacionReq'),
  liquidacionAjustarUnificado: op('liquidacionAjustarUnificado', 'ajustarUnificadoReq'),
  cgAutorizar: op('cgAutorizar', 'cgAutorizarReq'),
  cgSolicitarAnulacion: op('cgSolicitarAnulacion', 'cgSolicitarAnulacionReq'),
  cgConfirmarAnulacion: op('cgConfirmarAnulacion', 'cgConfirmarAnulacionReq'),
  cgConsultarUltimoNroOrden: op('cgConsultarUltimoNroOrden', 'cgConsultarUltimoNroOrdenReq'),
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

/**
 * Cliente de WSLPG (Liquidación Primaria de Granos). Se accede como `agro.lpg`.
 *
 * Cubre liquidación primaria (autorizar, consultar, anular, último número de
 * orden, ajuste unificado), certificación primaria (`cg*`: autorizar, último
 * número de orden, anulación) y las paramétricas principales.
 *
 * Las autorizaciones, anulaciones y ajustes son emisiones: nunca se
 * reintentan y, si la respuesta se pierde, el `ArcaSoapError` tiene
 * `uncertain: true` (ver README, "Recuperar una emisión incierta").
 */
export class LpgClient {
  readonly #ctx: ServiceContext;

  /** @internal Se construye desde `ArcaAgro`. */
  constructor(ctx: ServiceContext) {
    this.#ctx = ctx;
  }

  // ============================================================
  // Internos
  // ============================================================

  /** `LpgAuthType`: token, sign y cuit (no `cuitRepresentada`). */
  async #auth(opts?: CallOptions) {
    const ticket = await this.#ctx.getTicket(opts);
    return { token: ticket.token, sign: ticket.sign, cuit: this.#ctx.cuit };
  }

  /**
   * Llama a una operación de WSLPG y devuelve el nodo `*Return` (common lo
   * desenvuelve), después de verificar `errores` y `erroresFormato`.
   */
  async #call(
    o: Op,
    body: Record<string, unknown> | null,
    kind: SoapOperationKind,
    opts?: CallOptions,
  ): Promise<Record<string, unknown>> {
    const params = body === null ? {} : { auth: await this.#auth(opts), ...body };
    const result = await afipSoapCall(this.#ctx.endpoint, LPG_NAMESPACE, o.method, params, {
      ...this.#ctx.soap,
      kind,
      signal: opts?.signal,
      requestElement: body === null ? null : o.req,
      responseElement: o.resp,
      soapActionFromMethod: true,
    });
    throwOnServiceErrors(result, SERVICE, o.method);
    return result;
  }

  #decode<T>(node: unknown, schema: Schema, method: string, kind: SoapOperationKind): T {
    try {
      return decodeResponse<T>(node, schema, method);
    } catch (e) {
      if (e instanceof ArcaAgroResponseError && kind === 'emision') throw new ArcaAgroResponseError(e.message, true);
      throw e;
    }
  }

  /** Exige que `node[key].coe` esté presente. */
  #requireCoe<T>(result: T, key: keyof T & string, method: string, kind: SoapOperationKind): T {
    const inner = result[key] as { coe?: string } | undefined;
    if (!inner?.coe) {
      throw new ArcaAgroResponseError(`${SERVICE} ${method}: la respuesta no tiene ${key}.coe`, kind === 'emision');
    }
    return result;
  }

  async #ultimoNroOrden(o: Op, ptoEmision: number, opts?: CallOptions): Promise<number> {
    const body = encodeRequest({ ptoEmision }, S.ULT_NRO_ORDEN, o.method);
    const r = await this.#call(o, body, 'consulta', opts);
    return this.#decode<{ nroOrden: number }>(r, S.R_ULT_NRO_ORDEN, o.method, 'consulta').nroOrden;
  }

  async #parametrica<T = CodigoDescripcion>(
    o: Op,
    container: string,
    body: Record<string, unknown> = {},
    opts?: CallOptions,
    item = 'codigoDescripcion',
    itemSchema: Schema = S.R_CODIGO_DESCRIPCION,
  ): Promise<T[]> {
    const r = await this.#call(o, body, 'consulta', opts);
    const schema: Schema = { [container]: wrapped(item, obj(itemSchema), 0) };
    return this.#decode<Record<string, T[]>>(r, schema, o.method, 'consulta')[container];
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
    const r = await this.#call(o, body, 'emision', opts);
    const res = this.#decode<LiquidacionResultado>(r, S.R_LIQ_RETURN, o.method, 'emision');
    return this.#requireCoe(res, 'autorizacion', o.method, 'emision');
  }

  /** Consulta una liquidación por COE. `pdf: true` pide la constancia en base64. */
  async liquidacionXCoeConsultar(
    coe: string | number,
    params: { pdf?: boolean } = {},
    opts?: CallOptions,
  ): Promise<LiquidacionConsultaResultado> {
    const o = OPS.liquidacionXCoeConsultar;
    const body = encodeRequest({ coe, pdf: params.pdf === undefined ? undefined : params.pdf ? 'S' : 'N' }, S.CONSULTA_X_COE, o.method);
    const r = await this.#call(o, body, 'consulta', opts);
    const res = this.#decode<LiquidacionConsultaResultado>(r, S.R_LIQ_CONS_RETURN, o.method, 'consulta');
    return this.#requireCoe(res, 'autorizacion', o.method, 'consulta');
  }

  /** Consulta una liquidación por punto de emisión y número de orden. */
  async liquidacionXNroOrdenConsultar(
    ptoEmision: number,
    nroOrden: number,
    opts?: CallOptions,
  ): Promise<LiquidacionConsultaResultado> {
    const o = OPS.liquidacionXNroOrdenConsultar;
    const body = encodeRequest({ ptoEmision, nroOrden }, S.CONSULTA_X_NRO_ORDEN, o.method);
    const r = await this.#call(o, body, 'consulta', opts);
    const res = this.#decode<LiquidacionConsultaResultado>(r, S.R_LIQ_CONS_RETURN, o.method, 'consulta');
    return this.#requireCoe(res, 'autorizacion', o.method, 'consulta');
  }

  /**
   * Último número de orden de liquidación para un punto de emisión.
   * @throws ArcaAgroResponseError si ARCA no devuelve `nroOrden`.
   */
  async liquidacionUltimoNroOrdenConsultar(ptoEmision: number, opts?: CallOptions): Promise<number> {
    return this.#ultimoNroOrden(OPS.liquidacionUltimoNroOrdenConsultar, ptoEmision, opts);
  }

  /** Anula una liquidación por COE. Emisión. */
  async liquidacionAnular(coe: string | number, opts?: CallOptions): Promise<AnulacionLiquidacionResultado> {
    const o = OPS.liquidacionAnular;
    const body = encodeRequest({ coe }, S.ANULACION, o.method);
    const r = await this.#call(o, body, 'emision', opts);
    return this.#decode<AnulacionLiquidacionResultado>(r, S.R_ANULACION_RETURN, o.method, 'emision');
  }

  /** Ajuste unificado (crédito y/o débito) de una liquidación. Emisión. */
  async liquidacionAjustarUnificado(params: AjusteUnificadoParams, opts?: CallOptions): Promise<AjusteUnificadoResultado> {
    const o = OPS.liquidacionAjustarUnificado;
    const body = encodeRequest(params, S.AJUSTE_UNIFICADO, o.method, requireAjuste);
    const r = await this.#call(o, body, 'emision', opts);
    const res = this.#decode<AjusteUnificadoResultado>(r, S.R_AJUSTE_UNIFICADO_RETURN, o.method, 'emision');
    return this.#requireCoe(res, 'ajusteUnificado', o.method, 'emision');
  }

  // ============================================================
  // Certificación primaria de granos (cg*)
  // ============================================================

  /**
   * Autoriza una certificación (primaria, retiro/transferencia o preexistente).
   * Emisión: si falla con `uncertain`, consultá `cgConsultarUltimoNroOrden`.
   */
  async cgAutorizar(params: CgAutorizarParams, opts?: CallOptions): Promise<CertificacionResultado> {
    const o = OPS.cgAutorizar;
    const body = encodeRequest(params, S.CG_AUTORIZAR, o.method);
    const r = await this.#call(o, body, 'emision', opts);
    const res = this.#decode<CertificacionResultado>(r, S.R_CG_AUTORIZAR_RETURN, o.method, 'emision');
    return this.#requireCoe(res, 'autorizacion', o.method, 'emision');
  }

  /** Último número de orden de certificación para un punto de emisión. */
  async cgConsultarUltimoNroOrden(ptoEmision: number, opts?: CallOptions): Promise<number> {
    return this.#ultimoNroOrden(OPS.cgConsultarUltimoNroOrden, ptoEmision, opts);
  }

  /** Solicita la anulación de una certificación. Emisión. */
  async cgSolicitarAnulacion(coe: string | number, params: { pdf?: boolean } = {}, opts?: CallOptions): Promise<AnulacionCertificacionResultado> {
    return this.#cgAnulacion(OPS.cgSolicitarAnulacion, coe, params, opts);
  }

  /** Confirma la anulación de una certificación. Emisión. */
  async cgConfirmarAnulacion(coe: string | number, params: { pdf?: boolean } = {}, opts?: CallOptions): Promise<AnulacionCertificacionResultado> {
    return this.#cgAnulacion(OPS.cgConfirmarAnulacion, coe, params, opts);
  }

  async #cgAnulacion(o: Op, coe: string | number, params: { pdf?: boolean }, opts?: CallOptions) {
    const body = encodeRequest({ coe, pdf: params.pdf === undefined ? undefined : params.pdf ? 'S' : 'N' }, S.CONSULTA_X_COE, o.method);
    const r = await this.#call(o, body, 'emision', opts);
    return this.#decode<AnulacionCertificacionResultado>(r, S.R_CG_ANULACION_RETURN, o.method, 'emision');
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
    const r = await this.#call(OPS.dummy, null, 'consulta', opts);
    return this.#decode<ServerStatus>(r, S.R_DUMMY, 'dummy', 'consulta');
  }
}
