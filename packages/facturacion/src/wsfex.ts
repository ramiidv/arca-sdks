import { SoapServiceClient, ensureArray, parseServerStatus } from '@ramiidv/arca-common';
import type { CallOptions, ServerStatus, SoapOperationKind } from '@ramiidv/arca-common';
import { ENDPOINTS, WSFEX_ERRORES_INTERNOS, WSFEX_NAMESPACE } from './constants.js';
import { encodeRequest } from '@ramiidv/arca-common/schema';
import type { Schema } from '@ramiidv/arca-common/schema';
import { decodeArca } from './decode.js';
import { ArcaResultadoInciertoExpo, ArcaSoapError, ArcaWSFEError } from './errors.js';
import * as S from './schemas.js';
import { transportDe } from './wsfe.js';
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
  WsfexErr,
  MensajeArca,
} from './types.js';

type R = Record<string, unknown>;

/** Error de WSFEX en `FEXErr` (código distinto de 0), o `undefined`. */
function fexErr(result: R): WsfexErr | undefined {
  const err = result.FEXErr as R | undefined;
  if (!err || err.ErrCode === undefined || Number(err.ErrCode) === 0) return undefined;
  return { ErrCode: Number(err.ErrCode), ErrMsg: String(err.ErrMsg ?? '') };
}

function checkFexErr(result: R): void {
  const err = fexErr(result);
  if (err) throw new ArcaWSFEError([{ code: err.ErrCode, msg: err.ErrMsg }], 'WSFEX');
}

/** `FEXEvents` con código distinto de 0, normalizado. */
export function eventosWsfex(result: { FEXEvents?: unknown } | undefined): MensajeArca[] {
  return ensureArray((result as R | undefined)?.FEXEvents as R | R[] | undefined)
    .filter((e) => e && Number(e.EventCode) !== 0)
    .map((e) => ({ code: Number(e.EventCode), msg: String(e.EventMsg ?? '') }));
}

function sinCampo(method: string, campo: string): ArcaSoapError {
  return new ArcaSoapError(`Respuesta de ${method} sin ${campo}`);
}

const lista = <T>(v: T[] | undefined) => (v && v.length > 0 ? v : undefined);

/**
 * Arma el `Cmp` (ClsFEXRequest) en el orden de la secuencia del WSDL de WSFEX,
 * envolviendo los arrays (`Permisos/Permiso`, `Cmps_asoc/Cmp_asoc`,
 * `Items/Item`, `Opcionales/Opcional`, `Actividades/Actividad`). Los
 * opcionales vacíos no se envían, salvo `Permiso_existente: ""`.
 *
 * @throws ArcaValidationError si un campo no tiene el tipo del WSDL.
 */
export function buildFexCmp(inv: WsfexInvoice): R {
  const cmp: R = {
    Id: inv.Id,
    Fecha_cbte: inv.Fecha_cbte,
    Cbte_Tipo: inv.Cbte_Tipo,
    Punto_vta: inv.Punto_vta,
    Cbte_nro: inv.Cbte_nro,
    Tipo_expo: inv.Tipo_expo,
    // "" se envía como elemento vacío: el manual pide Permiso_existente "vacío" fuera de Factura E de bienes.
    Permiso_existente: inv.Permiso_existente ?? undefined,
    Permisos: lista(inv.Permisos)?.map((p) => ({ Id_permiso: p.Id_permiso, Dst_merc: p.Dst_merc })),
    Dst_cmp: inv.Dst_cmp,
    Cliente: inv.Cliente,
    Cuit_pais_cliente: inv.Cuit_pais_cliente,
    Domicilio_cliente: inv.Domicilio_cliente,
    Id_impositivo: inv.Id_impositivo || undefined,
    Moneda_Id: inv.Moneda_Id,
    Moneda_ctz: inv.Moneda_ctz,
    CanMisMonExt: inv.CanMisMonExt || undefined,
    Obs_comerciales: inv.Obs_comerciales || undefined,
    Imp_total: inv.Imp_total,
    Obs: inv.Obs || undefined,
    Cmps_asoc: lista(inv.Cmps_asoc)?.map((c) => ({
      Cbte_tipo: c.Cbte_tipo,
      Cbte_punto_vta: c.Cbte_punto_vta,
      Cbte_nro: c.Cbte_nro,
      Cbte_cuit: c.Cbte_cuit,
    })),
    Forma_pago: inv.Forma_pago || undefined,
    Incoterms: inv.Incoterms || undefined,
    Incoterms_Ds: inv.Incoterms_Ds || undefined,
    Idioma_cbte: inv.Idioma_cbte,
    Items: lista(inv.Items)?.map((i) => ({
      Pro_codigo: i.Pro_codigo || undefined,
      Pro_ds: i.Pro_ds,
      Pro_qty: i.Pro_qty,
      Pro_umed: i.Pro_umed,
      Pro_precio_uni: i.Pro_precio_uni,
      Pro_bonificacion: i.Pro_bonificacion,
      Pro_total_item: i.Pro_total_item,
    })),
    Opcionales: lista(inv.Opcionales)?.map((o) => ({ Id: o.Id, Valor: o.Valor })),
    Fecha_pago: inv.Fecha_pago || undefined,
    Actividades: lista(inv.Actividades)?.map((a) => ({ Id: a.Id })),
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
   */
  async authorize(auth: WsfeAuth, invoice: WsfexInvoice, opts?: CallOptions): Promise<WsfexAuthResult> {
    const cmp = buildFexCmp(invoice);
    let result: R;
    try {
      result = await this.call('FEXAuthorize', { Auth: auth, Cmp: cmp }, { ...opts, kind: 'emision' });
    } catch (err) {
      if (err instanceof ArcaSoapError && err.uncertain) throw new ArcaResultadoInciertoExpo(invoice, { cause: err });
      throw err;
    }

    const err = fexErr(result);
    if (err && WSFEX_ERRORES_INTERNOS.includes(err.ErrCode)) {
      throw new ArcaResultadoInciertoExpo(invoice, {
        cause: new ArcaWSFEError([{ code: err.ErrCode, msg: err.ErrMsg }], 'WSFEX'),
      });
    }
    if (err) throw new ArcaWSFEError([{ code: err.ErrCode, msg: err.ErrMsg }], 'WSFEX');

    let decoded: WsfexAuthResult;
    try {
      decoded = decodeArca<WsfexAuthResult>(result, S.FEX_AUTHORIZE_RESP, 'FEXAuthorize');
    } catch (cause) {
      throw new ArcaResultadoInciertoExpo(invoice, { cause });
    }
    const r = decoded.FEXResultAuth;
    if (!r || (r.Resultado !== 'A' && r.Resultado !== 'R')) {
      throw new ArcaResultadoInciertoExpo(invoice, {
        cause: new ArcaSoapError('Respuesta de FEXAuthorize sin FEXResultAuth.Resultado', { uncertain: true }),
      });
    }
    return decoded;
  }

  /** Último comprobante autorizado (`FEXGetLast_CMP`). */
  async getLastCmp(auth: WsfeAuth, ptoVta: number, cbteTipo: number, opts?: CallOptions): Promise<number> {
    const result = await this.consulta<WsfexLastCmpResult>(
      'FEXGetLast_CMP',
      {
        Auth: {
          Token: auth.Token,
          Sign: auth.Sign,
          Cuit: auth.Cuit,
          ...encodeRequest({ Pto_venta: ptoVta, Cbte_Tipo: cbteTipo }, S.FEX_LAST_CMP_REQ, 'FEXGetLast_CMP'),
        },
      },
      S.FEX_LAST_CMP_RESP,
      opts,
    );
    const nro = result.FEXResult_LastCMP?.Cbte_nro;
    if (nro === undefined) throw sinCampo('FEXGetLast_CMP', 'FEXResult_LastCMP.Cbte_nro');
    return nro;
  }

  /** Último `Id` de request usado (`FEXGetLast_ID`). */
  async getLastId(auth: WsfeAuth, opts?: CallOptions): Promise<number> {
    const result = await this.consulta<WsfexLastIdResult>('FEXGetLast_ID', { Auth: auth }, S.FEX_LAST_ID_RESP, opts);
    const id = result.FEXResultGet?.Id;
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
    const cmp = encodeRequest(
      { Cbte_tipo: cbteTipo, Punto_vta: ptoVta, Cbte_nro: cbteNro },
      S.FEX_GET_CMP_REQ,
      'FEXGetCMP',
    );
    const result = await this.consulta<WsfexGetCmpResult>(
      'FEXGetCMP',
      { Auth: auth, Cmp: cmp },
      S.FEX_GET_CMP_RESP,
      opts,
    );
    if (!result.FEXResultGet) throw sinCampo('FEXGetCMP', 'FEXResultGet');
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
    const params = encodeRequest({ Mon_id: monId, FchCotiz: opts?.fchCotiz }, S.FEX_CTZ_REQ, 'FEXGetPARAM_Ctz');
    const result = await this.consulta<{ FEXResultGet?: WsfexCotizacion }>(
      'FEXGetPARAM_Ctz',
      { Auth: auth, ...params },
      S.FEX_CTZ_RESP,
      opts,
    );
    const r = result.FEXResultGet;
    if (!r) throw sinCampo('FEXGetPARAM_Ctz', 'FEXResultGet.Mon_ctz');
    return r;
  }

  /**
   * Verifica un permiso de embarque (`FEXCheck_Permiso`). Devuelve el `Status`
   * que informa ARCA (ej: "OK").
   */
  async checkPermiso(auth: WsfeAuth, idPermiso: string, dstMerc: number, opts?: CallOptions): Promise<string> {
    const params = encodeRequest(
      { ID_Permiso: idPermiso, Dst_merc: dstMerc },
      S.FEX_CHECK_PERMISO_REQ,
      'FEXCheck_Permiso',
    );
    const result = await this.consulta<{ FEXResultGet?: { Status?: string } }>(
      'FEXCheck_Permiso',
      { Auth: auth, ...params },
      S.FEX_CHECK_PERMISO_RESP,
      opts,
    );
    const status = result.FEXResultGet?.Status;
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
    const result = await this.consulta<{ FEXResultGet?: T[] }>(method, params, S.tablaWsfex(itemKey), opts);
    return result.FEXResultGet ?? [];
  }

  /** Tipos de comprobante de exportación. */
  async getTiposCbte(auth: WsfeAuth, opts?: CallOptions): Promise<WsfexParamItem[]> {
    return this.getParamList('FEXGetPARAM_Cbte_Tipo', 'ClsFEXResponse_Cbte_Tipo', { Auth: auth }, opts);
  }

  /** Monedas disponibles. */
  async getMonedas(auth: WsfeAuth, opts?: CallOptions): Promise<WsfexParamItem[]> {
    return this.getParamList('FEXGetPARAM_MON', 'ClsFEXResponse_Mon', { Auth: auth }, opts);
  }

  /** Monedas con su cotización a una fecha (`FEXGetPARAM_MON_CON_COTIZACION`). */
  async getMonedasConCotizacion(auth: WsfeAuth, opts?: CallOptions & { fechaCtz?: string }): Promise<WsfexParamItem[]> {
    const params = encodeRequest(
      { Fecha_CTZ: opts?.fechaCtz },
      S.FEX_MON_CON_COTIZACION_REQ,
      'FEXGetPARAM_MON_CON_COTIZACION',
    );
    return this.getParamList(
      'FEXGetPARAM_MON_CON_COTIZACION',
      'ClsFEXResponse_Mon_CON_Cotizacion',
      { Auth: auth, ...params },
      opts,
    );
  }

  /** Países destino (`FEXGetPARAM_DST_pais`). */
  async getPaises(auth: WsfeAuth, opts?: CallOptions): Promise<WsfexParamItem[]> {
    return this.getParamList('FEXGetPARAM_DST_pais', 'ClsFEXResponse_DST_pais', { Auth: auth }, opts);
  }

  /** Idiomas disponibles. */
  async getIdiomas(auth: WsfeAuth, opts?: CallOptions): Promise<WsfexParamItem[]> {
    return this.getParamList('FEXGetPARAM_Idiomas', 'ClsFEXResponse_Idi', { Auth: auth }, opts);
  }

  /** Incoterms disponibles. */
  async getIncoterms(auth: WsfeAuth, opts?: CallOptions): Promise<WsfexParamItem[]> {
    return this.getParamList('FEXGetPARAM_Incoterms', 'ClsFEXResponse_Inc', { Auth: auth }, opts);
  }

  /** Unidades de medida. */
  async getUMed(auth: WsfeAuth, opts?: CallOptions): Promise<WsfexParamItem[]> {
    return this.getParamList('FEXGetPARAM_UMed', 'ClsFEXResponse_UMed', { Auth: auth }, opts);
  }

  /** Tipos de exportación. */
  async getTiposExpo(auth: WsfeAuth, opts?: CallOptions): Promise<WsfexParamItem[]> {
    return this.getParamList('FEXGetPARAM_Tipo_Expo', 'ClsFEXResponse_Tex', { Auth: auth }, opts);
  }

  /** CUITs de países. */
  async getCuitsPais(auth: WsfeAuth, opts?: CallOptions): Promise<WsfexParamItem[]> {
    return this.getParamList('FEXGetPARAM_DST_CUIT', 'ClsFEXResponse_DST_cuit', { Auth: auth }, opts);
  }

  /** Puntos de venta habilitados para exportación (`FEXGetPARAM_PtoVenta`). */
  async getPuntosVenta(auth: WsfeAuth, opts?: CallOptions): Promise<WsfexPtoVenta[]> {
    return this.getParamList('FEXGetPARAM_PtoVenta', 'ClsFEXResponse_PtoVenta', { Auth: auth }, opts);
  }

  /** Tipos de datos opcionales (`FEXGetPARAM_Opcionales`). */
  async getOpcionales(auth: WsfeAuth, opts?: CallOptions): Promise<WsfexParamItem[]> {
    return this.getParamList('FEXGetPARAM_Opcionales', 'ClsFEXResponse_Opc', { Auth: auth }, opts);
  }

  /** Actividades del emisor (`FEXGetPARAM_Actividades`). */
  async getActividades(auth: WsfeAuth, opts?: CallOptions): Promise<WsfexParamItem[]> {
    return this.getParamList('FEXGetPARAM_Actividades', 'ClsFEXResponse_ActividadTipo', { Auth: auth }, opts);
  }
}
