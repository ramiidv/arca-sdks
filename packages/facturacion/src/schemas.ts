/**
 * Schemas de los WSDL de WSFEv1 (`wsdl/wsfev1.wsdl`) y WSFEX (`wsdl/wsfexv1.wsdl`)
 * para el DSL de `@ramiidv/arca-common/schema`.
 *
 * Son servicios ASMX: elementos `qualified` y nombres en PascalCase (WSFEX
 * también con `_`). En la API los campos son los de ARCA en camelCase
 * (`CbteFch` → `cbteFch`, `Fecha_cbte` → `fechaCbte`): `xml()` guarda el
 * nombre del XML. Las listas son arrays, sin el contenedor (`observaciones`
 * en lugar de `Observaciones/Obs`).
 *
 * Los requests no agregan restricciones de los manuales (las valida
 * `validation.ts`): acá solo se fija el orden del XSD, los obligatorios y el
 * tipo de cada campo. Los importes se redondean a los decimales del manual
 * (`dec`): WSFEv1 Double (13+2) y MonCotiz (4+6); WSFEX Imp_total y
 * Pro_total_item 2 decimales, Moneda_ctz, Pro_qty, Pro_precio_uni y
 * Pro_bonificacion 6.
 *
 * @internal No se exporta desde `index.ts`.
 */
import { custom, date8, dec, double, int, must, obj, opt, str, wrapped, xml } from '@ramiidv/arca-common/schema';
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
  tipo: xml('Tipo', int()),
  ptoVta: xml('PtoVta', int()),
  nro: xml('Nro', long()),
  cuit: xml('Cuit', opt(str())),
  cbteFch: xml('CbteFch', opt(date8())),
};

/** Importe de WSFEv1: Double (13+2), se redondea a 2 decimales. */
const imp = (): Field => dec(2);

export const TRIBUTO_REQ: Schema = {
  id: xml('Id', int()),
  desc: xml('Desc', opt(str())),
  baseImp: xml('BaseImp', imp()),
  alic: xml('Alic', dec(2)),
  importe: xml('Importe', imp()),
};

export const ALIC_IVA_REQ: Schema = {
  id: xml('Id', int()),
  baseImp: xml('BaseImp', imp()),
  importe: xml('Importe', imp()),
};
export const OPCIONAL_REQ: Schema = { id: xml('Id', str()), valor: xml('Valor', str()) };
export const COMPRADOR_REQ: Schema = {
  docTipo: xml('DocTipo', int()),
  docNro: xml('DocNro', long()),
  porcentaje: xml('Porcentaje', dec(2)),
};
export const ACTIVIDAD_REQ: Schema = { id: xml('Id', long()) };

/** `FECAEDetRequest` (= `FEDetRequest`), en orden del WSDL. */
export const FE_DET_REQ: Schema = {
  concepto: xml('Concepto', int()),
  docTipo: xml('DocTipo', int()),
  docNro: xml('DocNro', long()),
  cbteDesde: xml('CbteDesde', long()),
  cbteHasta: xml('CbteHasta', long()),
  cbteFch: xml('CbteFch', date8()),
  impTotal: xml('ImpTotal', imp()),
  impTotConc: xml('ImpTotConc', imp()),
  impNeto: xml('ImpNeto', imp()),
  impOpEx: xml('ImpOpEx', imp()),
  impTrib: xml('ImpTrib', imp()),
  impIva: xml('ImpIVA', imp()),
  fchServDesde: xml('FchServDesde', opt(date8())),
  fchServHasta: xml('FchServHasta', opt(date8())),
  fchVtoPago: xml('FchVtoPago', opt(date8())),
  monId: xml('MonId', str()),
  monCotiz: xml('MonCotiz', opt(dec(6))),
  canMisMonExt: xml('CanMisMonExt', opt(str())),
  condicionIvaReceptorId: xml('CondicionIVAReceptorId', opt(int())),
  cbtesAsoc: xml('CbtesAsoc', items('CbteAsoc', CBTE_ASOC_REQ)),
  tributos: xml('Tributos', items('Tributo', TRIBUTO_REQ)),
  iva: xml('Iva', items('AlicIva', ALIC_IVA_REQ)),
  opcionales: xml('Opcionales', items('Opcional', OPCIONAL_REQ)),
  compradores: xml('Compradores', items('Comprador', COMPRADOR_REQ)),
  periodoAsoc: xml('PeriodoAsoc', opt(obj({ fchDesde: xml('FchDesde', date8()), fchHasta: xml('FchHasta', date8()) }))),
  actividades: xml('Actividades', items('Actividad', ACTIVIDAD_REQ)),
};

/** `FECAEADetRequest`: `FEDetRequest` + `CAEA` y `CbteFchHsGen` al final. */
export const FECAEA_DET_REQ: Schema = {
  ...FE_DET_REQ,
  caea: xml('CAEA', str({ pattern: /^\d{14}$/ })),
  cbteFchHsGen: xml('CbteFchHsGen', str({ pattern: /^\d{14}$/ })),
};

export const FE_CAB_REQ: Schema = {
  cantReg: xml('CantReg', int(1)),
  ptoVta: xml('PtoVta', int(1)),
  cbteTipo: xml('CbteTipo', int(1)),
};

/** `FeCAEReq` de FECAESolicitar. */
export const FECAE_REQ: Schema = {
  feCabReq: xml('FeCabReq', obj(FE_CAB_REQ)),
  feDetReq: xml('FeDetReq', wrapped('FECAEDetRequest', obj(FE_DET_REQ))),
};

/** `FeCAEARegInfReq` de FECAEARegInformativo. */
export const FECAEA_REQ: Schema = {
  feCabReq: xml('FeCabReq', obj(FE_CAB_REQ)),
  feDetReq: xml('FeDetReq', wrapped('FECAEADetRequest', obj(FECAEA_DET_REQ))),
};

// Parámetros de las consultas (sin `Auth`, que arma el cliente), en orden del WSDL.

export const ULTIMO_REQ: Schema = { ptoVta: xml('PtoVta', int(1)), cbteTipo: xml('CbteTipo', int(1)) };
export const COMP_CONSULTAR_REQ: Schema = {
  feCompConsReq: xml(
    'FeCompConsReq',
    obj({ cbteTipo: xml('CbteTipo', int(1)), cbteNro: xml('CbteNro', long()), ptoVta: xml('PtoVta', int(1)) }),
  ),
};
/** `Periodo` es `s:int` (`AAAAMM`); la API lo recibe como string. */
export const CAEA_REQ: Schema = {
  periodo: xml('Periodo', str({ pattern: /^\d{6}$/ })),
  orden: xml('Orden', int(1, 2)),
};
export const CAEA_SIN_MOV_INFORMAR_REQ: Schema = { ptoVta: xml('PtoVta', int(1)), caea: xml('CAEA', str()) };
export const CAEA_SIN_MOV_CONSULTAR_REQ: Schema = { caea: xml('CAEA', str()), ptoVta: xml('PtoVta', int(1)) };
export const COTIZACION_REQ: Schema = {
  monId: xml('MonId', str({ minLen: 1 })),
  fchCotiz: xml('FchCotiz', opt(date8())),
};
export const CONDICION_IVA_REQ: Schema = { claseCmp: xml('ClaseCmp', opt(str())) };

// ===========================================================================
// WSFEv1 - Respuestas
// ===========================================================================

/** `Obs`/`Evt`/`Err` (`Code` es `minOccurs=1`). */
const MENSAJE: Schema = { code: xml('Code', must(int())), msg: xml('Msg', opt(str())) };

/** Lista de una respuesta, sin el contenedor: `<Iva><AlicIva/>...</Iva>` → `iva: [...]`. */
const arrayOf = (item: string, schema: Schema): Field => opt(wrapped(item, obj(schema), 0));

const OBSERVACIONES = arrayOf('Obs', MENSAJE);

/**
 * `Events`, presente en casi todas las respuestas de WSFEv1. `Errors` no se
 * decodifica: si viene, el cliente lanza `ArcaWSFEError` antes.
 */
const ERR_EVT: Schema = { events: xml('Events', arrayOf('Evt', MENSAJE)) };

export const FE_CAB_RESP: Schema = {
  cuit: xml('Cuit', must(int())),
  ptoVta: xml('PtoVta', must(int())),
  cbteTipo: xml('CbteTipo', must(int())),
  fchProceso: xml('FchProceso', opt(str())),
  cantReg: xml('CantReg', must(int())),
  resultado: xml('Resultado', must(str())),
  reproceso: xml('Reproceso', opt(str())),
};

/** `FEDetResponse`: lo común a `FECAEDetResponse` y `FECAEADetResponse`. */
const FE_DET_RESP: Schema = {
  concepto: xml('Concepto', must(int())),
  docTipo: xml('DocTipo', must(int())),
  docNro: xml('DocNro', must(int())),
  cbteDesde: xml('CbteDesde', must(int())),
  cbteHasta: xml('CbteHasta', must(int())),
  cbteFch: xml('CbteFch', opt(str())),
  resultado: xml('Resultado', must(str())),
  observaciones: xml('Observaciones', OBSERVACIONES),
};

export const FECAE_DET_RESP: Schema = {
  ...FE_DET_RESP,
  cae: xml('CAE', opt(str())),
  caeFchVto: xml('CAEFchVto', opt(str())),
};
export const FECAEA_DET_RESP: Schema = { ...FE_DET_RESP, caea: xml('CAEA', opt(str())) };

/** `FECAEResponse` (FECAESolicitar). `FeCabResp`/`FeDetResp` los verifica `emitir`. */
export const FECAE_RESP: Schema = {
  feCabResp: xml('FeCabResp', opt(obj(FE_CAB_RESP))),
  feDetResp: xml('FeDetResp', arrayOf('FECAEDetResponse', FECAE_DET_RESP)),
  ...ERR_EVT,
};

/** `FECAEAResponse` (FECAEARegInformativo). */
export const FECAEA_RESP: Schema = {
  feCabResp: xml('FeCabResp', opt(obj(FE_CAB_RESP))),
  feDetResp: xml('FeDetResp', arrayOf('FECAEADetResponse', FECAEA_DET_RESP)),
  ...ERR_EVT,
};

export const ULTIMO_RESP: Schema = {
  ptoVta: xml('PtoVta', must(int())),
  cbteTipo: xml('CbteTipo', must(int())),
  cbteNro: xml('CbteNro', must(int())),
  ...ERR_EVT,
};

export const CBTE_ASOC_RESP: Schema = {
  tipo: xml('Tipo', must(int())),
  ptoVta: xml('PtoVta', must(int())),
  nro: xml('Nro', must(int())),
  cuit: xml('Cuit', opt(str())),
  cbteFch: xml('CbteFch', opt(str())),
};
export const TRIBUTO_RESP: Schema = {
  id: xml('Id', must(int())),
  desc: xml('Desc', opt(str())),
  baseImp: xml('BaseImp', must(double())),
  alic: xml('Alic', must(double())),
  importe: xml('Importe', must(double())),
};
export const ALIC_IVA_RESP: Schema = {
  id: xml('Id', must(int())),
  baseImp: xml('BaseImp', must(double())),
  importe: xml('Importe', must(double())),
};
export const OPCIONAL_RESP: Schema = { id: xml('Id', opt(str())), valor: xml('Valor', opt(str())) };
export const COMPRADOR_RESP: Schema = {
  docTipo: xml('DocTipo', must(int())),
  docNro: xml('DocNro', must(int())),
  porcentaje: xml('Porcentaje', must(double())),
};

/** `FECompConsResponse` (ResultGet de FECompConsultar), en orden del WSDL. */
export const COMP_CONS_RESP: Schema = {
  concepto: xml('Concepto', must(int())),
  docTipo: xml('DocTipo', must(int())),
  docNro: xml('DocNro', must(int())),
  cbteDesde: xml('CbteDesde', must(int())),
  cbteHasta: xml('CbteHasta', must(int())),
  cbteFch: xml('CbteFch', opt(str())),
  impTotal: xml('ImpTotal', must(double())),
  impTotConc: xml('ImpTotConc', must(double())),
  impNeto: xml('ImpNeto', must(double())),
  impOpEx: xml('ImpOpEx', must(double())),
  impTrib: xml('ImpTrib', must(double())),
  impIva: xml('ImpIVA', must(double())),
  fchServDesde: xml('FchServDesde', opt(str())),
  fchServHasta: xml('FchServHasta', opt(str())),
  fchVtoPago: xml('FchVtoPago', opt(str())),
  monId: xml('MonId', opt(str())),
  monCotiz: xml('MonCotiz', opt(double())),
  canMisMonExt: xml('CanMisMonExt', opt(str())),
  condicionIvaReceptorId: xml('CondicionIVAReceptorId', opt(int())),
  cbtesAsoc: xml('CbtesAsoc', arrayOf('CbteAsoc', CBTE_ASOC_RESP)),
  tributos: xml('Tributos', arrayOf('Tributo', TRIBUTO_RESP)),
  iva: xml('Iva', arrayOf('AlicIva', ALIC_IVA_RESP)),
  opcionales: xml('Opcionales', arrayOf('Opcional', OPCIONAL_RESP)),
  compradores: xml('Compradores', arrayOf('Comprador', COMPRADOR_RESP)),
  periodoAsoc: xml(
    'PeriodoAsoc',
    opt(obj({ fchDesde: xml('FchDesde', opt(str())), fchHasta: xml('FchHasta', opt(str())) })),
  ),
  actividades: xml('Actividades', arrayOf('Actividad', { id: xml('Id', must(int())) })),
  resultado: xml('Resultado', opt(str())),
  codAutorizacion: xml('CodAutorizacion', opt(str())),
  emisionTipo: xml('EmisionTipo', opt(str())),
  fchVto: xml('FchVto', opt(str())),
  fchProceso: xml('FchProceso', opt(str())),
  observaciones: xml('Observaciones', OBSERVACIONES),
  ptoVta: xml('PtoVta', must(int())),
  cbteTipo: xml('CbteTipo', must(int())),
};

export const COMP_CONSULTA_RESP: Schema = { resultGet: xml('ResultGet', opt(obj(COMP_CONS_RESP))), ...ERR_EVT };

export const REG_X_REQ_RESP: Schema = { regXReq: xml('RegXReq', must(int())), ...ERR_EVT };

/**
 * `FECAEAGet`. `Periodo` es `s:int` en el WSDL pero la API lo devuelve como
 * string (`AAAAMM`).
 */
export const CAEA_GET: Schema = {
  caea: xml('CAEA', must(str())),
  periodo: xml('Periodo', must(str())),
  orden: xml('Orden', must(int())),
  fchVigDesde: xml('FchVigDesde', opt(str())),
  fchVigHasta: xml('FchVigHasta', opt(str())),
  fchTopeInf: xml('FchTopeInf', opt(str())),
  fchProceso: xml('FchProceso', opt(str())),
  observaciones: xml('Observaciones', OBSERVACIONES),
};
export const CAEA_GET_RESP: Schema = { resultGet: xml('ResultGet', opt(obj(CAEA_GET))), ...ERR_EVT };

export const CAEA_SIN_MOV: Schema = {
  caea: xml('CAEA', must(str())),
  fchProceso: xml('FchProceso', opt(str())),
  ptoVta: xml('PtoVta', must(int())),
};
export const CAEA_SIN_MOV_CONS_RESP: Schema = {
  resultGet: xml('ResultGet', arrayOf('FECAEASinMov', CAEA_SIN_MOV)),
  ...ERR_EVT,
};
export const CAEA_SIN_MOV_RESP: Schema = {
  caea: xml('CAEA', opt(str())),
  fchProceso: xml('FchProceso', opt(str())),
  ptoVta: xml('PtoVta', opt(int())),
  resultado: xml('Resultado', opt(str())),
  ...ERR_EVT,
};

export const COTIZACION: Schema = {
  monId: xml('MonId', opt(str())),
  monCotiz: xml('MonCotiz', must(double())),
  fchCotiz: xml('FchCotiz', opt(str())),
};
export const COTIZACION_RESP: Schema = { resultGet: xml('ResultGet', opt(obj(COTIZACION))), ...ERR_EVT };

// Ítems de las tablas de parámetros (`ResultGet/<item>`).

/** `CbteTipo`, `ConceptoTipo`, `DocTipo`, `TributoTipo`; también `IvaTipo` y `OpcionalTipo`, cuyo `Id` la API devuelve como número. */
export const PARAM_ITEM: Schema = {
  id: xml('Id', must(int())),
  desc: xml('Desc', opt(str())),
  fchDesde: xml('FchDesde', opt(str())),
  fchHasta: xml('FchHasta', opt(str())),
};
/** `Moneda`: `Id` es `s:string` (`"060"` no pierde el cero). */
export const MONEDA: Schema = {
  id: xml('Id', must(str())),
  desc: xml('Desc', opt(str())),
  fchDesde: xml('FchDesde', opt(str())),
  fchHasta: xml('FchHasta', opt(str())),
};
export const CONDICION_IVA: Schema = {
  id: xml('Id', must(int())),
  desc: xml('Desc', opt(str())),
  cmpClase: xml('Cmp_Clase', opt(str())),
};
export const PTO_VENTA: Schema = {
  nro: xml('Nro', must(int())),
  emisionTipo: xml('EmisionTipo', opt(str())),
  bloqueado: xml('Bloqueado', opt(str())),
  fchBaja: xml('FchBaja', opt(str())),
};
export const PAIS: Schema = { id: xml('Id', must(int())), desc: xml('Desc', opt(str())) };
export const ACTIVIDAD: Schema = {
  id: xml('Id', must(int())),
  orden: xml('Orden', must(int())),
  desc: xml('Desc', opt(str())),
};

/** Respuesta de una tabla de parámetros: `ResultGet/<item>[]` como array. */
export const tablaWsfe = (item: string, schema: Schema): Schema => ({
  resultGet: xml('ResultGet', wrapped(item, obj(schema), 0)),
  ...ERR_EVT,
});

// ===========================================================================
// WSFEX - Requests
// ===========================================================================

export const PERMISO_REQ: Schema = { idPermiso: xml('Id_permiso', str()), dstMerc: xml('Dst_merc', int()) };
export const CMP_ASOC_REQ: Schema = {
  cbteTipo: xml('Cbte_tipo', int()),
  cbtePuntoVta: xml('Cbte_punto_vta', int()),
  cbteNro: xml('Cbte_nro', long()),
  cbteCuit: xml('Cbte_cuit', long()),
};
export const ITEM_REQ: Schema = {
  proCodigo: xml('Pro_codigo', opt(str())),
  proDs: xml('Pro_ds', str()),
  proQty: xml('Pro_qty', dec(6)),
  proUmed: xml('Pro_umed', int()),
  proPrecioUni: xml('Pro_precio_uni', dec(6)),
  proBonificacion: xml('Pro_bonificacion', dec(6)),
  proTotalItem: xml('Pro_total_item', dec(2)),
};

/** `ClsFEXRequest` (el `Cmp` de FEXAuthorize), en orden del WSDL. */
export const FEX_CMP_REQ: Schema = {
  id: xml('Id', long()),
  fechaCbte: xml('Fecha_cbte', date8()),
  cbteTipo: xml('Cbte_Tipo', int()),
  puntoVta: xml('Punto_vta', int()),
  cbteNro: xml('Cbte_nro', long()),
  tipoExpo: xml('Tipo_expo', int()),
  // "" se envía como elemento vacío: el manual lo pide fuera de Factura E de bienes.
  permisoExistente: xml('Permiso_existente', opt(str())),
  permisos: xml('Permisos', items('Permiso', PERMISO_REQ)),
  dstCmp: xml('Dst_cmp', int()),
  cliente: xml('Cliente', str()),
  cuitPaisCliente: xml('Cuit_pais_cliente', long()),
  domicilioCliente: xml('Domicilio_cliente', str()),
  idImpositivo: xml('Id_impositivo', opt(str())),
  monedaId: xml('Moneda_Id', str()),
  monedaCtz: xml('Moneda_ctz', dec(6)),
  canMisMonExt: xml('CanMisMonExt', opt(str())),
  obsComerciales: xml('Obs_comerciales', opt(str())),
  impTotal: xml('Imp_total', dec(2)),
  obs: xml('Obs', opt(str())),
  cmpsAsoc: xml('Cmps_asoc', items('Cmp_asoc', CMP_ASOC_REQ)),
  formaPago: xml('Forma_pago', opt(str())),
  incoterms: xml('Incoterms', opt(str())),
  incotermsDs: xml('Incoterms_Ds', opt(str())),
  idiomaCbte: xml('Idioma_cbte', int()),
  items: xml('Items', items('Item', ITEM_REQ)),
  opcionales: xml('Opcionales', items('Opcional', OPCIONAL_REQ)),
  fechaPago: xml('Fecha_pago', opt(date8())),
  actividades: xml('Actividades', items('Actividad', ACTIVIDAD_REQ)),
};

// Parámetros de las consultas (sin `Auth`), en orden del WSDL.

/** `Pto_venta` y `Cbte_Tipo` de FEXGetLast_CMP: van dentro de `Auth` (`ClsFEX_LastCMP`). */
export const FEX_LAST_CMP_REQ: Schema = { ptoVenta: xml('Pto_venta', int(1)), cbteTipo: xml('Cbte_Tipo', int(1)) };
export const FEX_GET_CMP_REQ: Schema = {
  cbteTipo: xml('Cbte_tipo', int(1)),
  puntoVta: xml('Punto_vta', int(1)),
  cbteNro: xml('Cbte_nro', long()),
};
export const FEX_CTZ_REQ: Schema = {
  monId: xml('Mon_id', str({ minLen: 1 })),
  fchCotiz: xml('FchCotiz', opt(date8())),
};
export const FEX_CHECK_PERMISO_REQ: Schema = {
  idPermiso: xml('ID_Permiso', str({ minLen: 1 })),
  dstMerc: xml('Dst_merc', int(0)),
};
export const FEX_MON_CON_COTIZACION_REQ: Schema = { fechaCtz: xml('Fecha_CTZ', opt(date8())) };

// ===========================================================================
// WSFEX - Respuestas
// ===========================================================================

export const FEX_EVENTS: Schema = { eventCode: xml('EventCode', must(int())), eventMsg: xml('EventMsg', opt(str())) };
/** `FEXEvents`. `FEXErr` no se decodifica: con un código distinto de 0 el cliente lanza `ArcaWSFEError`. */
const FEX_ERR_EVT: Schema = { fexEvents: xml('FEXEvents', opt(obj(FEX_EVENTS))) };

/** `ClsFEXOutAuthorize`. `Resultado` lo verifica `authorize`. */
export const FEX_OUT_AUTHORIZE: Schema = {
  id: xml('Id', must(int())),
  cuit: xml('Cuit', must(int())),
  cbteTipo: xml('Cbte_tipo', must(int())),
  puntoVta: xml('Punto_vta', must(int())),
  cbteNro: xml('Cbte_nro', must(int())),
  cae: xml('Cae', opt(str())),
  fchVencCae: xml('Fch_venc_Cae', opt(str())),
  fchCbte: xml('Fch_cbte', opt(str())),
  resultado: xml('Resultado', opt(str())),
  reproceso: xml('Reproceso', opt(str())),
  motivosObs: xml('Motivos_Obs', opt(str())),
};
export const FEX_AUTHORIZE_RESP: Schema = {
  fexResultAuth: xml('FEXResultAuth', opt(obj(FEX_OUT_AUTHORIZE))),
  ...FEX_ERR_EVT,
};

export const PERMISO_RESP: Schema = { idPermiso: xml('Id_permiso', opt(str())), dstMerc: xml('Dst_merc', must(int())) };
export const CMP_ASOC_RESP: Schema = {
  cbteTipo: xml('Cbte_tipo', must(int())),
  cbtePuntoVta: xml('Cbte_punto_vta', must(int())),
  cbteNro: xml('Cbte_nro', must(int())),
  cbteCuit: xml('Cbte_cuit', must(int())),
};
export const ITEM_RESP: Schema = {
  proCodigo: xml('Pro_codigo', opt(str())),
  proDs: xml('Pro_ds', opt(str())),
  proQty: xml('Pro_qty', must(double())),
  proUmed: xml('Pro_umed', must(int())),
  proPrecioUni: xml('Pro_precio_uni', must(double())),
  proBonificacion: xml('Pro_bonificacion', must(double())),
  proTotalItem: xml('Pro_total_item', must(double())),
};

/** `ClsFEXGetCMPR` (FEXResultGet de FEXGetCMP). `Cuit_pais_cliente` queda como string (CUIT de 11 dígitos). */
export const FEX_GET_CMPR: Schema = {
  id: xml('Id', must(int())),
  fechaCbte: xml('Fecha_cbte', opt(str())),
  cbteTipo: xml('Cbte_tipo', must(int())),
  puntoVta: xml('Punto_vta', must(int())),
  cbteNro: xml('Cbte_nro', must(int())),
  tipoExpo: xml('Tipo_expo', must(int())),
  permisoExistente: xml('Permiso_existente', opt(str())),
  permisos: xml('Permisos', arrayOf('Permiso', PERMISO_RESP)),
  dstCmp: xml('Dst_cmp', must(int())),
  cliente: xml('Cliente', opt(str())),
  cuitPaisCliente: xml('Cuit_pais_cliente', must(str())),
  domicilioCliente: xml('Domicilio_cliente', opt(str())),
  idImpositivo: xml('Id_impositivo', opt(str())),
  monedaId: xml('Moneda_Id', opt(str())),
  monedaCtz: xml('Moneda_ctz', must(double())),
  canMisMonExt: xml('CanMisMonExt', opt(str())),
  obsComerciales: xml('Obs_comerciales', opt(str())),
  impTotal: xml('Imp_total', must(double())),
  obs: xml('Obs', opt(str())),
  cmpsAsoc: xml('Cmps_asoc', arrayOf('Cmp_asoc', CMP_ASOC_RESP)),
  formaPago: xml('Forma_pago', opt(str())),
  incoterms: xml('Incoterms', opt(str())),
  incotermsDs: xml('Incoterms_Ds', opt(str())),
  idiomaCbte: xml('Idioma_cbte', must(int())),
  items: xml('Items', arrayOf('Item', ITEM_RESP)),
  fechaCbteCae: xml('Fecha_cbte_cae', opt(str())),
  fchVencCae: xml('Fch_venc_Cae', opt(str())),
  cae: xml('Cae', opt(str())),
  resultado: xml('Resultado', opt(str())),
  motivosObs: xml('Motivos_Obs', opt(str())),
  opcionales: xml('Opcionales', arrayOf('Opcional', OPCIONAL_RESP)),
  fechaPago: xml('Fecha_pago', opt(str())),
  actividades: xml('Actividades', arrayOf('Actividad', { id: xml('Id', must(int())) })),
};
export const FEX_GET_CMP_RESP: Schema = { fexResultGet: xml('FEXResultGet', opt(obj(FEX_GET_CMPR))), ...FEX_ERR_EVT };

export const FEX_LAST_CMP_RESP: Schema = {
  fexResultLastCmp: xml(
    'FEXResult_LastCMP',
    opt(obj({ cbteNro: xml('Cbte_nro', must(int())), cbteFecha: xml('Cbte_fecha', opt(str())) })),
  ),
  ...FEX_ERR_EVT,
};
export const FEX_LAST_ID_RESP: Schema = {
  fexResultGet: xml('FEXResultGet', opt(obj({ id: xml('Id', must(int())) }))),
  ...FEX_ERR_EVT,
};
export const FEX_CTZ_RESP: Schema = {
  fexResultGet: xml(
    'FEXResultGet',
    opt(obj({ monCtz: xml('Mon_ctz', must(double())), monFecha: xml('Mon_fecha', opt(str())) })),
  ),
  ...FEX_ERR_EVT,
};
export const FEX_CHECK_PERMISO_RESP: Schema = {
  fexResultGet: xml('FEXResultGet', opt(obj({ status: xml('Status', opt(str())) }))),
  ...FEX_ERR_EVT,
};

// Ítems de las tablas de parámetros de WSFEX (`FEXResultGet/<item>`).

/** `<Prefijo>_Id`, `_Ds`, `_vig_desde`, `_vig_hasta` → `prefijoId`, `prefijoDs`, `prefijoVigDesde`, `prefijoVigHasta`. */
const vigencia = (prefix: string, id: Field): Schema => {
  const p = prefix.toLowerCase();
  return {
    [`${p}Id`]: xml(`${prefix}_Id`, must(id)),
    [`${p}Ds`]: xml(`${prefix}_Ds`, opt(str())),
    [`${p}VigDesde`]: xml(`${prefix}_vig_desde`, opt(str())),
    [`${p}VigHasta`]: xml(`${prefix}_vig_hasta`, opt(str())),
  };
};

export const FEX_TABLAS = {
  ClsFEXResponse_Cbte_Tipo: vigencia('Cbte', int()),
  ClsFEXResponse_Tex: vigencia('Tex', int()),
  ClsFEXResponse_Inc: vigencia('Inc', str()),
  ClsFEXResponse_Idi: vigencia('Idi', int()),
  ClsFEXResponse_UMed: vigencia('Umed', int()),
  ClsFEXResponse_Mon: vigencia('Mon', str()),
  ClsFEXResponse_Opc: vigencia('Opc', int()),
  // `s:string` en el WSDL, pero la API lo devuelve como número (`FacturarExpoOpts.pais`); no hay códigos con cero a la izquierda.
  ClsFEXResponse_DST_pais: { dstCodigo: xml('DST_Codigo', must(int())), dstDs: xml('DST_Ds', opt(str())) },
  // CUIT de 11 dígitos: queda como string, como hasta ahora.
  ClsFEXResponse_DST_cuit: { dstCuit: xml('DST_CUIT', must(str())), dstDs: xml('DST_Ds', opt(str())) },
  ClsFEXResponse_Mon_CON_Cotizacion: {
    monId: xml('Mon_Id', must(str())),
    monDs: xml('Mon_Ds', opt(str())),
    // `s:string` en el WSDL; la API lo devuelve como número.
    monCtz: xml('Mon_ctz', opt(double())),
    fechaCtz: xml('Fecha_ctz', opt(str())),
  },
  ClsFEXResponse_PtoVenta: {
    pveNro: xml('Pve_Nro', must(int())),
    pveBloqueado: xml('Pve_Bloqueado', opt(str())),
    pveFchBaja: xml('Pve_FchBaja', opt(str())),
  },
  ClsFEXResponse_ActividadTipo: {
    id: xml('Id', must(int())),
    orden: xml('Orden', must(int())),
    desc: xml('Desc', opt(str())),
  },
} satisfies Record<string, Schema>;

/** Respuesta de una tabla de parámetros de WSFEX: `FEXResultGet/<item>[]` como array. */
export const tablaWsfex = (item: keyof typeof FEX_TABLAS): Schema => ({
  fexResultGet: xml('FEXResultGet', wrapped(item, obj(FEX_TABLAS[item]), 0)),
  ...FEX_ERR_EVT,
});
