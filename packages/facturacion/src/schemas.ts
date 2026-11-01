/**
 * Schemas de los WSDL de WSFEv1 (`wsdl/wsfev1.wsdl`) y WSFEX (`wsdl/wsfexv1.wsdl`)
 * para el DSL de `@ramiidv/arca-common/schema`.
 *
 * Son servicios ASMX: elementos `qualified` y nombres en PascalCase. Los
 * requests no agregan restricciones de los manuales (las valida
 * `validation.ts` sobre la API de alto nivel): acá solo se fija el orden del
 * XSD, los obligatorios y el tipo de cada campo.
 *
 * Las listas de las respuestas se describen como `obj({ Item: list(...) })` y
 * no con `wrapped()`: los tipos públicos (`FECAESolicitarResult`, etc.)
 * conservan el contenedor del XML (`{ Obs: [...] }`), con la lista siempre
 * como array.
 *
 * @internal No se exporta desde `index.ts`.
 */
import { custom, date8, double, int, list, must, obj, opt, str, wrapped } from '@ramiidv/arca-common/schema';
import type { Field, Schema } from '@ramiidv/arca-common/schema';

/**
 * `xsd:long` de un request: entero >= 0 como `number` o string de dígitos
 * (DocNro, CUIT, números de comprobante). Se envía tal cual.
 */
const long = (): Field =>
  custom((v, fail) => {
    if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) return v;
    if (typeof v === 'string' && /^\d{1,19}$/.test(v)) return v;
    return fail('debe ser un entero >= 0 (number o string de dígitos)');
  });

/** Lista de un contenedor opcional del request (`<Tributos><Tributo/>...</Tributos>`). */
const items = (item: string, schema: Schema): Field => opt(wrapped(item, obj(schema)));

// ===========================================================================
// WSFEv1 - Requests
// ===========================================================================

export const CBTE_ASOC_REQ: Schema = {
  Tipo: int(),
  PtoVta: int(),
  Nro: long(),
  Cuit: opt(str()),
  CbteFch: opt(date8()),
};

export const TRIBUTO_REQ: Schema = {
  Id: int(),
  Desc: opt(str()),
  BaseImp: double(),
  Alic: double(),
  Importe: double(),
};

export const ALIC_IVA_REQ: Schema = { Id: int(), BaseImp: double(), Importe: double() };
export const OPCIONAL_REQ: Schema = { Id: str(), Valor: str() };
export const COMPRADOR_REQ: Schema = { DocTipo: int(), DocNro: long(), Porcentaje: double() };
export const ACTIVIDAD_REQ: Schema = { Id: long() };

/** `FECAEDetRequest` (= `FEDetRequest`), en orden del WSDL. */
export const FE_DET_REQ: Schema = {
  Concepto: int(),
  DocTipo: int(),
  DocNro: long(),
  CbteDesde: long(),
  CbteHasta: long(),
  CbteFch: date8(),
  ImpTotal: double(),
  ImpTotConc: double(),
  ImpNeto: double(),
  ImpOpEx: double(),
  ImpTrib: double(),
  ImpIVA: double(),
  FchServDesde: opt(date8()),
  FchServHasta: opt(date8()),
  FchVtoPago: opt(date8()),
  MonId: str(),
  MonCotiz: opt(double()),
  CanMisMonExt: opt(str()),
  CondicionIVAReceptorId: opt(int()),
  CbtesAsoc: items('CbteAsoc', CBTE_ASOC_REQ),
  Tributos: items('Tributo', TRIBUTO_REQ),
  Iva: items('AlicIva', ALIC_IVA_REQ),
  Opcionales: items('Opcional', OPCIONAL_REQ),
  Compradores: items('Comprador', COMPRADOR_REQ),
  PeriodoAsoc: opt(obj({ FchDesde: date8(), FchHasta: date8() })),
  Actividades: items('Actividad', ACTIVIDAD_REQ),
};

/** `FECAEADetRequest`: `FEDetRequest` + `CAEA` y `CbteFchHsGen` al final. */
export const FECAEA_DET_REQ: Schema = {
  ...FE_DET_REQ,
  CAEA: str({ pattern: /^\d{14}$/ }),
  CbteFchHsGen: str({ pattern: /^\d{14}$/ }),
};

export const FE_CAB_REQ: Schema = { CantReg: int(1), PtoVta: int(1), CbteTipo: int(1) };

/** `FeCAEReq` de FECAESolicitar. */
export const FECAE_REQ: Schema = {
  FeCabReq: obj(FE_CAB_REQ),
  FeDetReq: wrapped('FECAEDetRequest', obj(FE_DET_REQ)),
};

/** `FeCAEARegInfReq` de FECAEARegInformativo. */
export const FECAEA_REQ: Schema = {
  FeCabReq: obj(FE_CAB_REQ),
  FeDetReq: wrapped('FECAEADetRequest', obj(FECAEA_DET_REQ)),
};

// Parámetros de las consultas (sin `Auth`, que arma el cliente), en orden del WSDL.

export const ULTIMO_REQ: Schema = { PtoVta: int(1), CbteTipo: int(1) };
export const COMP_CONSULTAR_REQ: Schema = {
  FeCompConsReq: obj({ CbteTipo: int(1), CbteNro: long(), PtoVta: int(1) }),
};
/** `Periodo` es `s:int` (`AAAAMM`); la API lo recibe como string. */
export const CAEA_REQ: Schema = { Periodo: str({ pattern: /^\d{6}$/ }), Orden: int(1, 2) };
export const CAEA_SIN_MOV_INFORMAR_REQ: Schema = { PtoVta: int(1), CAEA: str() };
export const CAEA_SIN_MOV_CONSULTAR_REQ: Schema = { CAEA: str(), PtoVta: int(1) };
export const COTIZACION_REQ: Schema = { MonId: str({ minLen: 1 }), FchCotiz: opt(date8()) };
export const CONDICION_IVA_REQ: Schema = { ClaseCmp: opt(str()) };

// ===========================================================================
// WSFEv1 - Respuestas
// ===========================================================================

/** `Obs`/`Evt`/`Err` (`Code` es `minOccurs=1`). */
const MENSAJE: Schema = { Code: must(int()), Msg: opt(str()) };

/** Contenedor de lista en una respuesta: `{ Item: X[] }`. */
const arrayOf = (item: string, schema: Schema): Field => opt(obj({ [item]: list(obj(schema), 0) }));

const OBSERVACIONES = arrayOf('Obs', MENSAJE);
const EVENTS = arrayOf('Evt', MENSAJE);
const ERRORS = arrayOf('Err', MENSAJE);

/** `Errors` y `Events`, presentes en casi todas las respuestas de WSFEv1. */
const ERR_EVT: Schema = { Errors: ERRORS, Events: EVENTS };

export const FE_CAB_RESP: Schema = {
  Cuit: must(int()),
  PtoVta: must(int()),
  CbteTipo: must(int()),
  FchProceso: opt(str()),
  CantReg: must(int()),
  Resultado: must(str()),
  Reproceso: opt(str()),
};

/** `FEDetResponse`: lo común a `FECAEDetResponse` y `FECAEADetResponse`. */
const FE_DET_RESP: Schema = {
  Concepto: must(int()),
  DocTipo: must(int()),
  DocNro: must(int()),
  CbteDesde: must(int()),
  CbteHasta: must(int()),
  CbteFch: opt(str()),
  Resultado: must(str()),
  Observaciones: OBSERVACIONES,
};

export const FECAE_DET_RESP: Schema = { ...FE_DET_RESP, CAE: opt(str()), CAEFchVto: opt(str()) };
export const FECAEA_DET_RESP: Schema = { ...FE_DET_RESP, CAEA: opt(str()) };

/** `FECAEResponse` (FECAESolicitar). `FeCabResp`/`FeDetResp` los verifica `emitir`. */
export const FECAE_RESP: Schema = {
  FeCabResp: opt(obj(FE_CAB_RESP)),
  FeDetResp: arrayOf('FECAEDetResponse', FECAE_DET_RESP),
  Events: EVENTS,
  Errors: ERRORS,
};

/** `FECAEAResponse` (FECAEARegInformativo). */
export const FECAEA_RESP: Schema = {
  FeCabResp: opt(obj(FE_CAB_RESP)),
  FeDetResp: arrayOf('FECAEADetResponse', FECAEA_DET_RESP),
  Events: EVENTS,
  Errors: ERRORS,
};

export const ULTIMO_RESP: Schema = { PtoVta: must(int()), CbteTipo: must(int()), CbteNro: must(int()), ...ERR_EVT };

export const CBTE_ASOC_RESP: Schema = {
  Tipo: must(int()),
  PtoVta: must(int()),
  Nro: must(int()),
  Cuit: opt(str()),
  CbteFch: opt(str()),
};
export const TRIBUTO_RESP: Schema = {
  Id: must(int()),
  Desc: opt(str()),
  BaseImp: must(double()),
  Alic: must(double()),
  Importe: must(double()),
};
export const ALIC_IVA_RESP: Schema = { Id: must(int()), BaseImp: must(double()), Importe: must(double()) };
export const OPCIONAL_RESP: Schema = { Id: opt(str()), Valor: opt(str()) };
export const COMPRADOR_RESP: Schema = { DocTipo: must(int()), DocNro: must(int()), Porcentaje: must(double()) };

/** `FECompConsResponse` (ResultGet de FECompConsultar), en orden del WSDL. */
export const COMP_CONS_RESP: Schema = {
  Concepto: must(int()),
  DocTipo: must(int()),
  DocNro: must(int()),
  CbteDesde: must(int()),
  CbteHasta: must(int()),
  CbteFch: opt(str()),
  ImpTotal: must(double()),
  ImpTotConc: must(double()),
  ImpNeto: must(double()),
  ImpOpEx: must(double()),
  ImpTrib: must(double()),
  ImpIVA: must(double()),
  FchServDesde: opt(str()),
  FchServHasta: opt(str()),
  FchVtoPago: opt(str()),
  MonId: opt(str()),
  MonCotiz: opt(double()),
  CanMisMonExt: opt(str()),
  CondicionIVAReceptorId: opt(int()),
  CbtesAsoc: arrayOf('CbteAsoc', CBTE_ASOC_RESP),
  Tributos: arrayOf('Tributo', TRIBUTO_RESP),
  Iva: arrayOf('AlicIva', ALIC_IVA_RESP),
  Opcionales: arrayOf('Opcional', OPCIONAL_RESP),
  Compradores: arrayOf('Comprador', COMPRADOR_RESP),
  PeriodoAsoc: opt(obj({ FchDesde: opt(str()), FchHasta: opt(str()) })),
  Actividades: arrayOf('Actividad', { Id: must(int()) }),
  Resultado: opt(str()),
  CodAutorizacion: opt(str()),
  EmisionTipo: opt(str()),
  FchVto: opt(str()),
  FchProceso: opt(str()),
  Observaciones: OBSERVACIONES,
  PtoVta: must(int()),
  CbteTipo: must(int()),
};

export const COMP_CONSULTA_RESP: Schema = { ResultGet: opt(obj(COMP_CONS_RESP)), ...ERR_EVT };

export const REG_X_REQ_RESP: Schema = { RegXReq: must(int()), ...ERR_EVT };

/**
 * `FECAEAGet`. `Periodo` es `s:int` en el WSDL pero la API lo devuelve como
 * string (`AAAAMM`).
 */
export const CAEA_GET: Schema = {
  CAEA: must(str()),
  Periodo: must(str()),
  Orden: must(int()),
  FchVigDesde: opt(str()),
  FchVigHasta: opt(str()),
  FchTopeInf: opt(str()),
  FchProceso: opt(str()),
  Observaciones: OBSERVACIONES,
};
export const CAEA_GET_RESP: Schema = { ResultGet: opt(obj(CAEA_GET)), ...ERR_EVT };

export const CAEA_SIN_MOV: Schema = { CAEA: must(str()), FchProceso: opt(str()), PtoVta: must(int()) };
export const CAEA_SIN_MOV_CONS_RESP: Schema = { ResultGet: arrayOf('FECAEASinMov', CAEA_SIN_MOV), ...ERR_EVT };
export const CAEA_SIN_MOV_RESP: Schema = {
  CAEA: opt(str()),
  FchProceso: opt(str()),
  PtoVta: opt(int()),
  Resultado: opt(str()),
  ...ERR_EVT,
};

export const COTIZACION: Schema = { MonId: opt(str()), MonCotiz: must(double()), FchCotiz: opt(str()) };
export const COTIZACION_RESP: Schema = { ResultGet: opt(obj(COTIZACION)), ...ERR_EVT };

// Ítems de las tablas de parámetros (`ResultGet/<item>`).

/** `CbteTipo`, `ConceptoTipo`, `DocTipo`, `TributoTipo`; también `IvaTipo` y `OpcionalTipo`, cuyo `Id` la API devuelve como número. */
export const PARAM_ITEM: Schema = { Id: must(int()), Desc: opt(str()), FchDesde: opt(str()), FchHasta: opt(str()) };
/** `Moneda`: `Id` es `s:string` (`"060"` no pierde el cero). */
export const MONEDA: Schema = { Id: must(str()), Desc: opt(str()), FchDesde: opt(str()), FchHasta: opt(str()) };
export const CONDICION_IVA: Schema = { Id: must(int()), Desc: opt(str()), Cmp_Clase: opt(str()) };
export const PTO_VENTA: Schema = {
  Nro: must(int()),
  EmisionTipo: opt(str()),
  Bloqueado: opt(str()),
  FchBaja: opt(str()),
};
export const PAIS: Schema = { Id: must(int()), Desc: opt(str()) };
export const ACTIVIDAD: Schema = { Id: must(int()), Orden: must(int()), Desc: opt(str()) };

/** Respuesta de una tabla de parámetros: `ResultGet/<item>[]` como array. */
export const tablaWsfe = (item: string, schema: Schema): Schema => ({
  ResultGet: wrapped(item, obj(schema), 0),
  ...ERR_EVT,
});

// ===========================================================================
// WSFEX - Requests
// ===========================================================================

export const PERMISO_REQ: Schema = { Id_permiso: str(), Dst_merc: int() };
export const CMP_ASOC_REQ: Schema = { Cbte_tipo: int(), Cbte_punto_vta: int(), Cbte_nro: long(), Cbte_cuit: long() };
export const ITEM_REQ: Schema = {
  Pro_codigo: opt(str()),
  Pro_ds: str(),
  Pro_qty: double(),
  Pro_umed: int(),
  Pro_precio_uni: double(),
  Pro_bonificacion: double(),
  Pro_total_item: double(),
};

/** `ClsFEXRequest` (el `Cmp` de FEXAuthorize), en orden del WSDL. */
export const FEX_CMP_REQ: Schema = {
  Id: long(),
  Fecha_cbte: date8(),
  Cbte_Tipo: int(),
  Punto_vta: int(),
  Cbte_nro: long(),
  Tipo_expo: int(),
  // "" se envía como elemento vacío: el manual lo pide fuera de Factura E de bienes.
  Permiso_existente: opt(str()),
  Permisos: items('Permiso', PERMISO_REQ),
  Dst_cmp: int(),
  Cliente: str(),
  Cuit_pais_cliente: long(),
  Domicilio_cliente: str(),
  Id_impositivo: opt(str()),
  Moneda_Id: str(),
  Moneda_ctz: double(),
  CanMisMonExt: opt(str()),
  Obs_comerciales: opt(str()),
  Imp_total: double(),
  Obs: opt(str()),
  Cmps_asoc: items('Cmp_asoc', CMP_ASOC_REQ),
  Forma_pago: opt(str()),
  Incoterms: opt(str()),
  Incoterms_Ds: opt(str()),
  Idioma_cbte: int(),
  Items: items('Item', ITEM_REQ),
  Opcionales: items('Opcional', OPCIONAL_REQ),
  Fecha_pago: opt(date8()),
  Actividades: items('Actividad', ACTIVIDAD_REQ),
};

// Parámetros de las consultas (sin `Auth`), en orden del WSDL.

/** `Pto_venta` y `Cbte_Tipo` de FEXGetLast_CMP: van dentro de `Auth` (`ClsFEX_LastCMP`). */
export const FEX_LAST_CMP_REQ: Schema = { Pto_venta: int(1), Cbte_Tipo: int(1) };
export const FEX_GET_CMP_REQ: Schema = { Cbte_tipo: int(1), Punto_vta: int(1), Cbte_nro: long() };
export const FEX_CTZ_REQ: Schema = { Mon_id: str({ minLen: 1 }), FchCotiz: opt(date8()) };
export const FEX_CHECK_PERMISO_REQ: Schema = { ID_Permiso: str({ minLen: 1 }), Dst_merc: int(0) };
export const FEX_MON_CON_COTIZACION_REQ: Schema = { Fecha_CTZ: opt(date8()) };

// ===========================================================================
// WSFEX - Respuestas
// ===========================================================================

/** `FEXErr`: `ErrCode` 0 significa "sin error". */
export const FEX_ERR: Schema = { ErrCode: must(int()), ErrMsg: opt(str()) };
export const FEX_EVENTS: Schema = { EventCode: must(int()), EventMsg: opt(str()) };
const FEX_ERR_EVT: Schema = { FEXErr: opt(obj(FEX_ERR)), FEXEvents: opt(obj(FEX_EVENTS)) };

/** `ClsFEXOutAuthorize`. `Resultado` lo verifica `authorize`. */
export const FEX_OUT_AUTHORIZE: Schema = {
  Id: must(int()),
  Cuit: must(int()),
  Cbte_tipo: must(int()),
  Punto_vta: must(int()),
  Cbte_nro: must(int()),
  Cae: opt(str()),
  Fch_venc_Cae: opt(str()),
  Fch_cbte: opt(str()),
  Resultado: opt(str()),
  Reproceso: opt(str()),
  Motivos_Obs: opt(str()),
};
export const FEX_AUTHORIZE_RESP: Schema = { FEXResultAuth: opt(obj(FEX_OUT_AUTHORIZE)), ...FEX_ERR_EVT };

export const PERMISO_RESP: Schema = { Id_permiso: opt(str()), Dst_merc: must(int()) };
export const CMP_ASOC_RESP: Schema = {
  Cbte_tipo: must(int()),
  Cbte_punto_vta: must(int()),
  Cbte_nro: must(int()),
  Cbte_cuit: must(int()),
};
export const ITEM_RESP: Schema = {
  Pro_codigo: opt(str()),
  Pro_ds: opt(str()),
  Pro_qty: must(double()),
  Pro_umed: must(int()),
  Pro_precio_uni: must(double()),
  Pro_bonificacion: must(double()),
  Pro_total_item: must(double()),
};

/** `ClsFEXGetCMPR` (FEXResultGet de FEXGetCMP). `Cuit_pais_cliente` queda como string (CUIT de 11 dígitos). */
export const FEX_GET_CMPR: Schema = {
  Id: must(int()),
  Fecha_cbte: opt(str()),
  Cbte_tipo: must(int()),
  Punto_vta: must(int()),
  Cbte_nro: must(int()),
  Tipo_expo: must(int()),
  Permiso_existente: opt(str()),
  Permisos: arrayOf('Permiso', PERMISO_RESP),
  Dst_cmp: must(int()),
  Cliente: opt(str()),
  Cuit_pais_cliente: must(str()),
  Domicilio_cliente: opt(str()),
  Id_impositivo: opt(str()),
  Moneda_Id: opt(str()),
  Moneda_ctz: must(double()),
  CanMisMonExt: opt(str()),
  Obs_comerciales: opt(str()),
  Imp_total: must(double()),
  Obs: opt(str()),
  Cmps_asoc: arrayOf('Cmp_asoc', CMP_ASOC_RESP),
  Forma_pago: opt(str()),
  Incoterms: opt(str()),
  Incoterms_Ds: opt(str()),
  Idioma_cbte: must(int()),
  Items: arrayOf('Item', ITEM_RESP),
  Fecha_cbte_cae: opt(str()),
  Fch_venc_Cae: opt(str()),
  Cae: opt(str()),
  Resultado: opt(str()),
  Motivos_Obs: opt(str()),
  Opcionales: arrayOf('Opcional', OPCIONAL_RESP),
  Fecha_pago: opt(str()),
  Actividades: arrayOf('Actividad', { Id: must(int()) }),
};
export const FEX_GET_CMP_RESP: Schema = { FEXResultGet: opt(obj(FEX_GET_CMPR)), ...FEX_ERR_EVT };

export const FEX_LAST_CMP_RESP: Schema = {
  FEXResult_LastCMP: opt(obj({ Cbte_nro: must(int()), Cbte_fecha: opt(str()) })),
  ...FEX_ERR_EVT,
};
export const FEX_LAST_ID_RESP: Schema = { FEXResultGet: opt(obj({ Id: must(int()) })), ...FEX_ERR_EVT };
export const FEX_CTZ_RESP: Schema = {
  FEXResultGet: opt(obj({ Mon_ctz: must(double()), Mon_fecha: opt(str()) })),
  ...FEX_ERR_EVT,
};
export const FEX_CHECK_PERMISO_RESP: Schema = { FEXResultGet: opt(obj({ Status: opt(str()) })), ...FEX_ERR_EVT };

// Ítems de las tablas de parámetros de WSFEX (`FEXResultGet/<item>`).

const vigencia = (prefix: string, id: Field): Schema => ({
  [`${prefix}_Id`]: must(id),
  [`${prefix}_Ds`]: opt(str()),
  [`${prefix}_vig_desde`]: opt(str()),
  [`${prefix}_vig_hasta`]: opt(str()),
});

export const FEX_TABLAS = {
  ClsFEXResponse_Cbte_Tipo: vigencia('Cbte', int()),
  ClsFEXResponse_Tex: vigencia('Tex', int()),
  ClsFEXResponse_Inc: vigencia('Inc', str()),
  ClsFEXResponse_Idi: vigencia('Idi', int()),
  ClsFEXResponse_UMed: vigencia('Umed', int()),
  ClsFEXResponse_Mon: vigencia('Mon', str()),
  ClsFEXResponse_Opc: vigencia('Opc', int()),
  // `s:string` en el WSDL, pero la API lo devuelve como número (`FacturarExpoOpts.pais`); no hay códigos con cero a la izquierda.
  ClsFEXResponse_DST_pais: { DST_Codigo: must(int()), DST_Ds: opt(str()) },
  // CUIT de 11 dígitos: queda como string, como hasta ahora.
  ClsFEXResponse_DST_cuit: { DST_CUIT: must(str()), DST_Ds: opt(str()) },
  ClsFEXResponse_Mon_CON_Cotizacion: {
    Mon_Id: must(str()),
    Mon_Ds: opt(str()),
    // `s:string` en el WSDL; la API lo devuelve como número.
    Mon_ctz: opt(double()),
    Fecha_ctz: opt(str()),
  },
  ClsFEXResponse_PtoVenta: { Pve_Nro: must(int()), Pve_Bloqueado: opt(str()), Pve_FchBaja: opt(str()) },
  ClsFEXResponse_ActividadTipo: { Id: must(int()), Orden: must(int()), Desc: opt(str()) },
} satisfies Record<string, Schema>;

/** Respuesta de una tabla de parámetros de WSFEX: `FEXResultGet/<item>[]` como array. */
export const tablaWsfex = (item: keyof typeof FEX_TABLAS): Schema => ({
  FEXResultGet: wrapped(item, obj(FEX_TABLAS[item]), 0),
  ...FEX_ERR_EVT,
});
