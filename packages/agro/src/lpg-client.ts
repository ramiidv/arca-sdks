import { SoapServiceClient, parseServerStatus } from '@ramiidv/arca-common';
import type { CallOptions, ServerStatus, ServiceErrorDetail, SoapOperationKind } from '@ramiidv/arca-common';
import { LPG_NAMESPACE } from './constants.js';
import type { ServiceContext } from './context.js';
import { ArcaAgroServiceError } from './errors.js';
import { at, checkErrors, decodeResult, requireValue, ticketAuth, withAdvertencias } from './internal.js';
import { encodeRequest, obj, wrapped } from './schema.js';
import type { Schema } from './schema.js';
import * as S from './lpg-schemas.js';
import type { CodigoDescripcion } from './types.js';
import type {
  AjusteConsultaResultado,
  AjusteUnificadoParams,
  AjusteUnificadoResultado,
  AnulacionCertificacionResultado,
  AnulacionLiquidacionResultado,
  CertificacionConsultaResultado,
  CertificacionResultado,
  CertificadoConSaldoLpg,
  CgAutorizarParams,
  CgBuscarCertConSaldoDisponibleParams,
  CgBuscarCtgParams,
  CtgCertificableLpg,
  GradoEntregadoLpg,
  LiquidacionAutorizarParams,
  LiquidacionConsultaResultado,
  LiquidacionPorContratoParams,
  LiquidacionResultado,
} from './lpg-types.js';
import { requireAjuste } from './validation.js';

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
  liquidacionAjustarUnificado: op('liquidacionAjustarUnificado', 'ajustarUnificadoReq'),
  liquidacionPorContratoConsultar: {
    ...op('liquidacionPorContratoConsultar', 'liquidacionPorContratoConsultarReq'),
    ret: 'liqPorContratoCons',
  },
  ajusteXCoeConsultar: op('ajusteXCoeConsultar', 'ajusteXCoeConsReq', 'ajusteXcoeConsResp'),
  ajusteXNroOrdenConsultar: op('ajusteXNroOrdenConsultar', 'ajusteXNroOrdenConsReq'),
  ajustePorContratoConsultar: op('ajustePorContratoConsultar', 'ajustePorContratoConsultarReq'),
  cgAutorizar: op('cgAutorizar', 'cgAutorizarReq'),
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

/**
 * Cliente de WSLPG (Liquidación Primaria de Granos). Se accede como `agro.lpg`.
 *
 * Cubre liquidación primaria (autorizar, consultar, anular, último número de
 * orden, ajuste unificado y sus consultas), certificación primaria (`cg*`:
 * autorizar, consultar, último número de orden, anulación, búsqueda de CTG y
 * de certificados con saldo) y las paramétricas principales.
 *
 * Las autorizaciones, anulaciones y ajustes son emisiones: nunca se
 * reintentan y, si la respuesta se pierde, el `ArcaSoapError` tiene
 * `uncertain: true` (ver README, "Recuperar una emisión incierta").
 *
 * El error 1021 (no se pudo generar el PDF) no cancela la operación: el
 * resultado viene sin `pdf` y con el error en `advertencias`.
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
   * desenvuelve) y los errores admitidos, después de verificar `errores` y
   * `erroresFormato`.
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
    const node =
      inner !== null && typeof inner === 'object' && !Array.isArray(inner) ? (inner as Record<string, unknown>) : {};
    const advertencias = checkErrors(node, SERVICE, o.method, kind, conResultado);
    return { node, advertencias };
  }

  /**
   * Llama, decodifica y exige `<key>.coe` en el resultado.
   */
  async #conCoe<T extends object>(
    o: Op,
    body: Record<string, unknown>,
    schema: Schema,
    key: string,
    kind: SoapOperationKind,
    opts?: CallOptions,
  ): Promise<T> {
    const { node, advertencias } = await this.#call(o, body, kind, opts, (n) => Boolean(at(n, `${key}.coe`)));
    const res = decodeResult<T>(node, schema, o.method, kind);
    requireValue(
      (res as Record<string, { coe?: string } | undefined>)[key]?.coe,
      `${key}.coe`,
      SERVICE,
      o.method,
      kind,
    );
    return withAdvertencias(res, advertencias);
  }

  /** `{ coe, pdf }` (`LpgLiqConsXCoeReqType`). */
  #coePdf(o: Op, coe: string | number, pdf: boolean | undefined): Record<string, unknown> {
    return encodeRequest({ coe, pdf: pdf === undefined ? undefined : pdf ? 'S' : 'N' }, S.CONSULTA_X_COE, o.method);
  }

  async #ultimoNroOrden(o: Op, ptoEmision: number, opts?: CallOptions): Promise<number> {
    const body = encodeRequest({ ptoEmision }, S.ULT_NRO_ORDEN, o.method);
    const { node } = await this.#call(o, body, 'consulta', opts);
    return decodeResult<{ nroOrden: number }>(node, S.R_ULT_NRO_ORDEN, o.method, 'consulta').nroOrden;
  }

  async #parametrica<T = CodigoDescripcion>(
    o: Op,
    container: string,
    body: Record<string, unknown> = {},
    opts?: CallOptions,
    item = 'codigoDescripcion',
    itemSchema: Schema = S.R_CODIGO_DESCRIPCION,
  ): Promise<T[]> {
    const { node } = await this.#call(o, body, 'consulta', opts);
    const schema: Schema = { [container]: wrapped(item, obj(itemSchema), 0) };
    return decodeResult<Record<string, T[]>>(node, schema, o.method, 'consulta')[container];
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
    return this.#conCoe(o, body, S.R_LIQ_RETURN, 'autorizacion', 'emision', opts);
  }

  /** Consulta una liquidación por COE. `pdf: true` pide la constancia en base64. */
  async liquidacionXCoeConsultar(
    coe: string | number,
    params: { pdf?: boolean } = {},
    opts?: CallOptions,
  ): Promise<LiquidacionConsultaResultado> {
    const o = OPS.liquidacionXCoeConsultar;
    const body = this.#coePdf(o, coe, params.pdf);
    return this.#conCoe(o, body, S.R_LIQ_CONS_RETURN, 'autorizacion', 'consulta', opts);
  }

  /** Consulta una liquidación por punto de emisión y número de orden. */
  async liquidacionXNroOrdenConsultar(
    ptoEmision: number,
    nroOrden: number,
    opts?: CallOptions,
  ): Promise<LiquidacionConsultaResultado> {
    const o = OPS.liquidacionXNroOrdenConsultar;
    const body = encodeRequest({ ptoEmision, nroOrden }, S.CONSULTA_X_NRO_ORDEN, o.method);
    return this.#conCoe(o, body, S.R_LIQ_CONS_RETURN, 'autorizacion', 'consulta', opts);
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
   * @throws ArcaAgroServiceError si ARCA responde `resultado: 'R'` (rechazada).
   */
  async liquidacionAnular(coe: string | number, opts?: CallOptions): Promise<AnulacionLiquidacionResultado> {
    const o = OPS.liquidacionAnular;
    const body = encodeRequest({ coe }, S.ANULACION, o.method);
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
    return this.#conCoe(o, body, S.R_AJUSTE_UNIFICADO_RETURN, 'ajusteUnificado', 'emision', opts);
  }

  /** Consulta un ajuste por COE. `pdf: true` pide la constancia en base64. */
  async ajusteXCoeConsultar(
    coe: string | number,
    params: { pdf?: boolean } = {},
    opts?: CallOptions,
  ): Promise<AjusteConsultaResultado> {
    const o = OPS.ajusteXCoeConsultar;
    return this.#conCoe(
      o,
      this.#coePdf(o, coe, params.pdf),
      S.R_AJUSTE_CONS_RETURN,
      'ajusteUnificado',
      'consulta',
      opts,
    );
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
    const body = encodeRequest({ ptoEmision, nroOrden }, S.CONSULTA_X_NRO_ORDEN, o.method);
    return this.#conCoe(o, body, S.R_AJUSTE_CONS_RETURN, 'ajusteUnificado', 'consulta', opts);
  }

  /** Consulta el ajuste de un contrato. */
  async ajustePorContratoConsultar(nroContrato: number, opts?: CallOptions): Promise<AjusteConsultaResultado> {
    const o = OPS.ajustePorContratoConsultar;
    const body = encodeRequest({ nroContrato }, S.AJUSTE_POR_CONTRATO, o.method);
    return this.#conCoe(o, body, S.R_AJUSTE_CONS_RETURN, 'ajusteUnificado', 'consulta', opts);
  }

  /** COEs de las liquidaciones asociadas a un contrato. Sin resultados → `[]`. */
  async liquidacionPorContratoConsultar(params: LiquidacionPorContratoParams, opts?: CallOptions): Promise<string[]> {
    const o = OPS.liquidacionPorContratoConsultar;
    const body = encodeRequest(params, S.LIQ_POR_CONTRATO, o.method);
    const { node } = await this.#call(o, body, 'consulta', opts);
    return decodeResult<{ coeRelacionados: string[] }>(node, S.R_LIQ_POR_CONTRATO_RETURN, o.method, 'consulta')
      .coeRelacionados;
  }

  // ============================================================
  // Certificación primaria de granos (cg*)
  // ============================================================

  /**
   * Autoriza una certificación (primaria, retiro/transferencia o preexistente).
   * Emisión: si falla con `uncertain`, consultá `cgConsultarUltimoNroOrden` y
   * `cgConsultarXNroOrden` antes de reintentar.
   */
  async cgAutorizar(params: CgAutorizarParams, opts?: CallOptions): Promise<CertificacionResultado> {
    const o = OPS.cgAutorizar;
    const body = encodeRequest(params, S.CG_AUTORIZAR, o.method);
    return this.#conCoe(o, body, S.R_CG_AUTORIZAR_RETURN, 'autorizacion', 'emision', opts);
  }

  /** Consulta una certificación por COE. `pdf: true` pide la constancia en base64. */
  async cgConsultarXCoe(
    coe: string | number,
    params: { pdf?: boolean } = {},
    opts?: CallOptions,
  ): Promise<CertificacionConsultaResultado> {
    const o = OPS.cgConsultarXCoe;
    return this.#conCoe(o, this.#coePdf(o, coe, params.pdf), S.R_CG_CONSULTAR_RETURN, 'autorizacion', 'consulta', opts);
  }

  /** Consulta una certificación por punto de emisión y número de orden. */
  async cgConsultarXNroOrden(
    ptoEmision: number,
    nroOrden: number,
    opts?: CallOptions,
  ): Promise<CertificacionConsultaResultado> {
    const o = OPS.cgConsultarXNroOrden;
    const body = encodeRequest({ ptoEmision, nroOrden }, S.CONSULTA_X_NRO_ORDEN, o.method);
    return this.#conCoe(o, body, S.R_CG_CONSULTAR_RETURN, 'autorizacion', 'consulta', opts);
  }

  /** CTG/CPE confirmadas disponibles para certificar. Sin resultados → `[]`. */
  async cgBuscarCtg(params: CgBuscarCtgParams, opts?: CallOptions): Promise<CtgCertificableLpg[]> {
    const o = OPS.cgBuscarCtg;
    const body = encodeRequest(params, S.CG_BUSCAR_CTG, o.method);
    const { node } = await this.#call(o, body, 'consulta', opts);
    return decodeResult<{ ctg: CtgCertificableLpg[] }>(node, S.R_CG_BUSCAR_CTG_RETURN, o.method, 'consulta').ctg;
  }

  /** Certificados de depósito con saldo disponible. Sin resultados → `[]`. */
  async cgBuscarCertConSaldoDisponible(
    params: CgBuscarCertConSaldoDisponibleParams,
    opts?: CallOptions,
  ): Promise<CertificadoConSaldoLpg[]> {
    const o = OPS.cgBuscarCertConSaldoDisponible;
    const body = encodeRequest(params, S.CG_BUSCAR_CERT_SALDO, o.method);
    const { node } = await this.#call(o, body, 'consulta', opts);
    return decodeResult<{ certificado: CertificadoConSaldoLpg[] }>(
      node,
      S.R_CG_BUSCAR_CERT_SALDO_RETURN,
      o.method,
      'consulta',
    ).certificado;
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

  async #cgAnulacion(o: Op, coe: string | number, params: { pdf?: boolean }, opts?: CallOptions) {
    const { node, advertencias } = await this.#call(o, this.#coePdf(o, coe, params.pdf), 'emision', opts);
    const res = decodeResult<AnulacionCertificacionResultado>(node, S.R_CG_ANULACION_RETURN, o.method, 'emision');
    return withAdvertencias(res, advertencias);
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
