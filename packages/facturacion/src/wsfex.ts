import { ArcaResponseError, SoapServiceClient, ensureArray, parseServerStatus } from '@ramiidv/arca-common';
import type { CallOptions, ServerStatus, SoapOperationKind } from '@ramiidv/arca-common';
import { ENDPOINTS, WSFEX_ERRORES_AUTH, WSFEX_ERRORES_INTERNOS, WSFEX_NAMESPACE } from './constants.js';
import { encodeRequest } from '@ramiidv/arca-common/schema';
import type { Schema } from '@ramiidv/arca-common/schema';
import { decodeArca, sinCampo } from './decode.js';
import { ArcaConflictoExpo, ArcaResultadoInciertoExpo, ArcaSoapError, ArcaWSFEError, authErrorDe } from './errors.js';
import * as S from './schemas.js';
import { authXml, transportDe } from './wsfe.js';
import type { WsClientOptions } from './wsfe.js';
import type {
  WsfeAuth,
  WsfexInvoice,
  WsfexAuthResult,
  WsfexGetCmpResult,
  WsfexLastCmpResult,
  WsfexLastIdResult,
  WsfexParamItem,
  WsfexCotizacion,
  WsfexPtoVenta,
  WsfexEvents,
  MensajeArca,
} from './types.js';

type R = Record<string, unknown>;

interface WsfexErr {
  errCode: number;
  errMsg: string;
}

/** Error de WSFEX en `FEXErr` (código distinto de 0), o `undefined`. */
function fexErr(result: R): WsfexErr | undefined {
  const err = result.FEXErr as R | undefined;
  if (!err || err.ErrCode === undefined || Number(err.ErrCode) === 0) return undefined;
  return { errCode: Number(err.ErrCode), errMsg: String(err.ErrMsg ?? '') };
}

/**
 * Lanza si la respuesta trae `FEXErr`: `ArcaAuthError` para los de
 * autenticación (1000, 1001), `ArcaWSFEError` para el resto.
 */
function checkFexErr(result: R): void {
  const err = fexErr(result);
  if (!err) return;
  const error = new ArcaWSFEError([{ code: err.errCode, msg: err.errMsg }], 'WSFEX');
  if (WSFEX_ERRORES_AUTH.includes(err.errCode)) throw authErrorDe(error);
  throw error;
}

/** `FEXEvents` de una respuesta decodificada, si el código es distinto de 0. */
export function eventosWsfex(result: { fexEvents?: WsfexEvents } | undefined): MensajeArca[] {
  return ensureArray(result?.fexEvents)
    .filter((e) => e.eventCode !== 0)
    .map((e) => ({ code: e.eventCode, msg: e.eventMsg ?? '' }));
}

const lista = <T>(v: T[] | undefined) => (v && v.length > 0 ? v : undefined);

/**
 * Arma el `Cmp` (ClsFEXRequest) con los nombres del XML y en el orden de la
 * secuencia del WSDL de WSFEX, envolviendo los arrays (`Permisos/Permiso`,
 * `Cmps_asoc/Cmp_asoc`, `Items/Item`, `Opcionales/Opcional`,
 * `Actividades/Actividad`). Los opcionales vacíos no se envían, salvo
 * `permisoExistente: ""`.
 *
 * @throws ArcaValidationError si un campo no tiene el tipo del WSDL.
 */
export function buildFexCmp(inv: WsfexInvoice): R {
  const cmp: R = {
    id: inv.id,
    fechaCbte: inv.fechaCbte,
    cbteTipo: inv.cbteTipo,
    puntoVta: inv.puntoVta,
    cbteNro: inv.cbteNro,
    tipoExpo: inv.tipoExpo,
    // "" se envía como elemento vacío: el manual pide Permiso_existente "vacío" fuera de Factura E de bienes.
    permisoExistente: inv.permisoExistente ?? undefined,
    permisos: lista(inv.permisos)?.map((p) => ({ idPermiso: p.idPermiso, dstMerc: p.dstMerc })),
    dstCmp: inv.dstCmp,
    cliente: inv.cliente,
    // Obligatorio en el WSDL (s:long): sin CUIT país (cliente con Id_impositivo, validación 1580) va 0.
    cuitPaisCliente: inv.cuitPaisCliente ?? 0,
    domicilioCliente: inv.domicilioCliente,
    idImpositivo: inv.idImpositivo || undefined,
    monedaId: inv.monedaId,
    monedaCtz: inv.monedaCtz,
    canMisMonExt: inv.canMisMonExt || undefined,
    obsComerciales: inv.obsComerciales || undefined,
    impTotal: inv.impTotal,
    obs: inv.obs || undefined,
    cmpsAsoc: lista(inv.cmpsAsoc)?.map((c) => ({
      cbteTipo: c.cbteTipo,
      cbtePuntoVta: c.cbtePuntoVta,
      cbteNro: c.cbteNro,
      cbteCuit: c.cbteCuit,
    })),
    formaPago: inv.formaPago || undefined,
    incoterms: inv.incoterms || undefined,
    incotermsDs: inv.incotermsDs || undefined,
    idiomaCbte: inv.idiomaCbte,
    items: lista(inv.items)?.map((i) => ({
      proCodigo: i.proCodigo || undefined,
      proDs: i.proDs,
      proQty: i.proQty,
      proUmed: i.proUmed,
      proPrecioUni: i.proPrecioUni,
      proBonificacion: i.proBonificacion,
      proTotalItem: i.proTotalItem,
    })),
    opcionales: lista(inv.opcionales)?.map((o) => ({ id: o.id, valor: o.valor })),
    fechaPago: inv.fechaPago || undefined,
    actividades: lista(inv.actividades)?.map((a) => ({ id: a.id })),
  };
  return encodeRequest(cmp, S.FEX_CMP_REQ, 'FEXAuthorize.Cmp');
}

/** Cliente de bajo nivel de WSFEX (Factura electrónica de exportación). */
export class WsfexClient extends SoapServiceClient {
  constructor(production: boolean, opts: WsClientOptions = {}) {
    super({
      endpoint: opts.endpoint ?? (production ? ENDPOINTS.wsfex.production : ENDPOINTS.wsfex.testing),
      namespace: WSFEX_NAMESPACE,
      transport: transportDe(opts),
    });
  }

  /**
   * WSFEX es ASMX con `elementFormDefault="qualified"`, como WSFEv1. La
   * respuesta queda como texto (`parseNumbers: false`): la convierte el schema
   * de cada operación.
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

  /** Consulta: lanza `ArcaWSFEError` si ARCA devuelve `FEXErr` y decodifica la respuesta. */
  private async consulta<T>(method: string, params: R, response: Schema, opts?: CallOptions): Promise<T> {
    const result = await this.call(method, params, opts);
    checkFexErr(result);
    return decodeArca<T>(result, response, method);
  }

  // ============================================================
  // Facturación de exportación
  // ============================================================

  /**
   * Autoriza un comprobante de exportación (emisión). No se reintenta.
   *
   * - `ArcaResultadoInciertoExpo`: no se sabe si se autorizó (timeout, red,
   *   5xx, error interno 500/501/502/505, respuesta sin `FEXResultAuth`).
   *   Reenviar el mismo `Cmp` con el mismo `Id` (`error.request`).
   * - `ArcaWSFEError`: WSFEX rechazó el request (`FEXErr`).
   * - `ArcaConflictoExpo`: el `Id` ya lo usaba otro comprobante (WSFEX
   *   devolvió la respuesta de ese otro comprobante).
   */
  async authorize(auth: WsfeAuth, invoice: WsfexInvoice, opts?: CallOptions): Promise<WsfexAuthResult> {
    const cmp = buildFexCmp(invoice);
    let result: R;
    try {
      result = await this.call('FEXAuthorize', { Auth: authXml(auth), Cmp: cmp }, { ...opts, kind: 'emision' });
    } catch (err) {
      if (err instanceof ArcaSoapError && err.uncertain) throw new ArcaResultadoInciertoExpo(invoice, { cause: err });
      throw err;
    }

    const err = fexErr(result);
    if (err && WSFEX_ERRORES_INTERNOS.includes(err.errCode)) {
      throw new ArcaResultadoInciertoExpo(invoice, {
        cause: new ArcaWSFEError([{ code: err.errCode, msg: err.errMsg }], 'WSFEX'),
      });
    }
    checkFexErr(result);

    let decoded: WsfexAuthResult;
    try {
      decoded = decodeArca<WsfexAuthResult>(result, S.FEX_AUTHORIZE_RESP, 'FEXAuthorize', 'emision');
    } catch (cause) {
      throw new ArcaResultadoInciertoExpo(invoice, { cause });
    }
    const r = decoded.fexResultAuth;
    if (!r || (r.resultado !== 'A' && r.resultado !== 'R')) {
      throw new ArcaResultadoInciertoExpo(invoice, {
        cause: new ArcaResponseError('Respuesta de FEXAuthorize sin FEXResultAuth.Resultado', true),
      });
    }
    // El Id es único por CUIT: si ya lo usó otro comprobante, WSFEX devuelve esa respuesta.
    if (r.cbteTipo !== invoice.cbteTipo || r.puntoVta !== invoice.puntoVta || r.cbteNro !== Number(invoice.cbteNro)) {
      throw new ArcaConflictoExpo(invoice, decoded, 'la respuesta es de otro comprobante');
    }
    return decoded;
  }

  /** Último comprobante autorizado (`FEXGetLast_CMP`). */
  async getLastCmp(auth: WsfeAuth, ptoVta: number, cbteTipo: number, opts?: CallOptions): Promise<number> {
    const result = await this.consulta<WsfexLastCmpResult>(
      'FEXGetLast_CMP',
      {
        Auth: {
          ...authXml(auth),
          ...encodeRequest({ ptoVenta: ptoVta, cbteTipo }, S.FEX_LAST_CMP_REQ, 'FEXGetLast_CMP'),
        },
      },
      S.FEX_LAST_CMP_RESP,
      opts,
    );
    const nro = result.fexResultLastCmp?.cbteNro;
    if (nro === undefined) throw sinCampo('FEXGetLast_CMP', 'FEXResult_LastCMP.Cbte_nro');
    return nro;
  }

  /** Último `Id` de request usado (`FEXGetLast_ID`). */
  async getLastId(auth: WsfeAuth, opts?: CallOptions): Promise<number> {
    const result = await this.consulta<WsfexLastIdResult>(
      'FEXGetLast_ID',
      { Auth: authXml(auth) },
      S.FEX_LAST_ID_RESP,
      opts,
    );
    const id = result.fexResultGet?.id;
    if (id === undefined) throw sinCampo('FEXGetLast_ID', 'FEXResultGet.Id');
    return id;
  }

  /** Consulta un comprobante de exportación (`FEXGetCMP`). */
  async getCmp(
    auth: WsfeAuth,
    cbteTipo: number,
    ptoVta: number,
    cbteNro: number,
    opts?: CallOptions,
  ): Promise<WsfexGetCmpResult> {
    const cmp = encodeRequest({ cbteTipo, puntoVta: ptoVta, cbteNro }, S.FEX_GET_CMP_REQ, 'FEXGetCMP');
    const result = await this.consulta<WsfexGetCmpResult>(
      'FEXGetCMP',
      { Auth: authXml(auth), Cmp: cmp },
      S.FEX_GET_CMP_RESP,
      opts,
    );
    if (!result.fexResultGet) throw sinCampo('FEXGetCMP', 'FEXResultGet');
    return result;
  }

  /** Estado de los servidores de WSFEX (`FEXDummy`, sin autenticación). */
  async dummy(opts?: CallOptions): Promise<ServerStatus> {
    return parseServerStatus(await this.call('FEXDummy', {}, opts), 'FEXDummy');
  }

  /** Cotización de una moneda (`FEXGetPARAM_Ctz`). */
  async getCotizacion(
    auth: WsfeAuth,
    monId: string,
    opts?: CallOptions & { fchCotiz?: string },
  ): Promise<WsfexCotizacion> {
    const params = encodeRequest({ monId, fchCotiz: opts?.fchCotiz }, S.FEX_CTZ_REQ, 'FEXGetPARAM_Ctz');
    const result = await this.consulta<{ fexResultGet?: WsfexCotizacion }>(
      'FEXGetPARAM_Ctz',
      { Auth: authXml(auth), ...params },
      S.FEX_CTZ_RESP,
      opts,
    );
    const r = result.fexResultGet;
    if (!r) throw sinCampo('FEXGetPARAM_Ctz', 'FEXResultGet.Mon_ctz');
    return r;
  }

  /**
   * Verifica un permiso de embarque (`FEXCheck_Permiso`). Devuelve el `Status`
   * que informa ARCA (ej: "OK").
   */
  async checkPermiso(auth: WsfeAuth, idPermiso: string, dstMerc: number, opts?: CallOptions): Promise<string> {
    const params = encodeRequest({ idPermiso, dstMerc }, S.FEX_CHECK_PERMISO_REQ, 'FEXCheck_Permiso');
    const result = await this.consulta<{ fexResultGet?: { status?: string } }>(
      'FEXCheck_Permiso',
      { Auth: authXml(auth), ...params },
      S.FEX_CHECK_PERMISO_RESP,
      opts,
    );
    const status = result.fexResultGet?.status;
    if (status === undefined) throw sinCampo('FEXCheck_Permiso', 'FEXResultGet.Status');
    return status;
  }

  // ============================================================
  // Parámetros
  // ============================================================

  private async getParamList<T>(
    method: string,
    itemKey: keyof typeof S.FEX_TABLAS,
    params: R,
    opts?: CallOptions,
  ): Promise<T[]> {
    const result = await this.consulta<{ fexResultGet?: T[] }>(method, params, S.tablaWsfex(itemKey), opts);
    return result.fexResultGet ?? [];
  }

  /** Tipos de comprobante de exportación. */
  async getTiposCbte(auth: WsfeAuth, opts?: CallOptions): Promise<WsfexParamItem[]> {
    return this.getParamList('FEXGetPARAM_Cbte_Tipo', 'ClsFEXResponse_Cbte_Tipo', { Auth: authXml(auth) }, opts);
  }

  /** Monedas disponibles. */
  async getMonedas(auth: WsfeAuth, opts?: CallOptions): Promise<WsfexParamItem[]> {
    return this.getParamList('FEXGetPARAM_MON', 'ClsFEXResponse_Mon', { Auth: authXml(auth) }, opts);
  }

  /** Monedas con su cotización a una fecha (`FEXGetPARAM_MON_CON_COTIZACION`). */
  async getMonedasConCotizacion(auth: WsfeAuth, opts?: CallOptions & { fechaCtz?: string }): Promise<WsfexParamItem[]> {
    const params = encodeRequest(
      { fechaCtz: opts?.fechaCtz },
      S.FEX_MON_CON_COTIZACION_REQ,
      'FEXGetPARAM_MON_CON_COTIZACION',
    );
    return this.getParamList(
      'FEXGetPARAM_MON_CON_COTIZACION',
      'ClsFEXResponse_Mon_CON_Cotizacion',
      { Auth: authXml(auth), ...params },
      opts,
    );
  }

  /** Países destino (`FEXGetPARAM_DST_pais`). */
  async getPaises(auth: WsfeAuth, opts?: CallOptions): Promise<WsfexParamItem[]> {
    return this.getParamList('FEXGetPARAM_DST_pais', 'ClsFEXResponse_DST_pais', { Auth: authXml(auth) }, opts);
  }

  /** Idiomas disponibles. */
  async getIdiomas(auth: WsfeAuth, opts?: CallOptions): Promise<WsfexParamItem[]> {
    return this.getParamList('FEXGetPARAM_Idiomas', 'ClsFEXResponse_Idi', { Auth: authXml(auth) }, opts);
  }

  /** Incoterms disponibles. */
  async getIncoterms(auth: WsfeAuth, opts?: CallOptions): Promise<WsfexParamItem[]> {
    return this.getParamList('FEXGetPARAM_Incoterms', 'ClsFEXResponse_Inc', { Auth: authXml(auth) }, opts);
  }

  /** Unidades de medida. */
  async getUMed(auth: WsfeAuth, opts?: CallOptions): Promise<WsfexParamItem[]> {
    return this.getParamList('FEXGetPARAM_UMed', 'ClsFEXResponse_UMed', { Auth: authXml(auth) }, opts);
  }

  /** Tipos de exportación. */
  async getTiposExpo(auth: WsfeAuth, opts?: CallOptions): Promise<WsfexParamItem[]> {
    return this.getParamList('FEXGetPARAM_Tipo_Expo', 'ClsFEXResponse_Tex', { Auth: authXml(auth) }, opts);
  }

  /** CUITs de países. */
  async getCuitsPais(auth: WsfeAuth, opts?: CallOptions): Promise<WsfexParamItem[]> {
    return this.getParamList('FEXGetPARAM_DST_CUIT', 'ClsFEXResponse_DST_cuit', { Auth: authXml(auth) }, opts);
  }

  /** Puntos de venta habilitados para exportación (`FEXGetPARAM_PtoVenta`). */
  async getPuntosVenta(auth: WsfeAuth, opts?: CallOptions): Promise<WsfexPtoVenta[]> {
    return this.getParamList('FEXGetPARAM_PtoVenta', 'ClsFEXResponse_PtoVenta', { Auth: authXml(auth) }, opts);
  }

  /** Tipos de datos opcionales (`FEXGetPARAM_Opcionales`). */
  async getOpcionales(auth: WsfeAuth, opts?: CallOptions): Promise<WsfexParamItem[]> {
    return this.getParamList('FEXGetPARAM_Opcionales', 'ClsFEXResponse_Opc', { Auth: authXml(auth) }, opts);
  }

  /** Actividades del emisor (`FEXGetPARAM_Actividades`). */
  async getActividades(auth: WsfeAuth, opts?: CallOptions): Promise<WsfexParamItem[]> {
    return this.getParamList('FEXGetPARAM_Actividades', 'ClsFEXResponse_ActividadTipo', { Auth: authXml(auth) }, opts);
  }
}
