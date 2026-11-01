/**
 * Tests de contrato: los schemas del DSL contra los tipos de los WSDL oficiales
 * de producción de WSFEv1 (`wsdl/wsfev1.wsdl`) y WSFEX (`wsdl/wsfexv1.wsdl`).
 */
import { readFileSync } from 'node:fs';
import { obj, wrapped } from '@ramiidv/arca-common/schema';
import type { Schema } from '@ramiidv/arca-common/schema';
import { checkSchemaAgainstXsd, loadXsdTypes } from '@ramiidv/arca-common/testing';
import { describe, expect, it } from 'vitest';
import * as S from '../src/schemas.js';

const wsdl = (file: string) => loadXsdTypes(readFileSync(new URL(`../wsdl/${file}`, import.meta.url), 'utf8'));
const wsfe = wsdl('wsfev1.wsdl');
const wsfex = wsdl('wsfexv1.wsdl');

type Case = [name: string, xsdType: string, direction: 'request' | 'response', schema: Schema, ignore?: string[]];

const tablaWsfe = (item: string, schema: Schema): Schema => ({ ResultGet: wrapped(item, obj(schema), 0) });

const wsfeCases: Case[] = [
  // Requests (el bloque `Auth` no usa el DSL: se arma en el cliente).
  ['FE_DET_REQ', 'FECAEDetRequest', 'request', S.FE_DET_REQ],
  ['FECAEA_DET_REQ', 'FECAEADetRequest', 'request', S.FECAEA_DET_REQ],
  ['FECAE_REQ', 'FECAERequest', 'request', S.FECAE_REQ],
  ['FECAEA_REQ', 'FECAEARequest', 'request', S.FECAEA_REQ],
  ['FECAESolicitar', 'FECAESolicitar', 'request', { FeCAEReq: obj(S.FECAE_REQ) }],
  ['FECAEARegInformativo', 'FECAEARegInformativo', 'request', { FeCAEARegInfReq: obj(S.FECAEA_REQ) }],
  ['ULTIMO_REQ', 'FECompUltimoAutorizado', 'request', S.ULTIMO_REQ],
  ['COMP_CONSULTAR_REQ', 'FECompConsultar', 'request', S.COMP_CONSULTAR_REQ],
  ['CAEA_REQ (solicitar)', 'FECAEASolicitar', 'request', S.CAEA_REQ],
  ['CAEA_REQ (consultar)', 'FECAEAConsultar', 'request', S.CAEA_REQ],
  ['CAEA_SIN_MOV_INFORMAR_REQ', 'FECAEASinMovimientoInformar', 'request', S.CAEA_SIN_MOV_INFORMAR_REQ],
  ['CAEA_SIN_MOV_CONSULTAR_REQ', 'FECAEASinMovimientoConsultar', 'request', S.CAEA_SIN_MOV_CONSULTAR_REQ],
  ['COTIZACION_REQ', 'FEParamGetCotizacion', 'request', S.COTIZACION_REQ],
  ['CONDICION_IVA_REQ', 'FEParamGetCondicionIvaReceptor', 'request', S.CONDICION_IVA_REQ],
  // Respuestas
  ['FECAE_RESP', 'FECAEResponse', 'response', S.FECAE_RESP],
  ['FECAEA_RESP', 'FECAEAResponse', 'response', S.FECAEA_RESP],
  ['ULTIMO_RESP', 'FERecuperaLastCbteResponse', 'response', S.ULTIMO_RESP],
  ['COMP_CONSULTA_RESP', 'FECompConsultaResponse', 'response', S.COMP_CONSULTA_RESP],
  ['REG_X_REQ_RESP', 'FERegXReqResponse', 'response', S.REG_X_REQ_RESP],
  ['CAEA_GET_RESP', 'FECAEAGetResponse', 'response', S.CAEA_GET_RESP],
  ['CAEA_SIN_MOV_CONS_RESP', 'FECAEASinMovConsResponse', 'response', S.CAEA_SIN_MOV_CONS_RESP],
  ['CAEA_SIN_MOV_RESP', 'FECAEASinMovResponse', 'response', S.CAEA_SIN_MOV_RESP],
  ['COTIZACION_RESP', 'FECotizacionResponse', 'response', S.COTIZACION_RESP],
  ['FEParamGetTiposCbte', 'CbteTipoResponse', 'response', tablaWsfe('CbteTipo', S.PARAM_ITEM)],
  ['FEParamGetTiposConcepto', 'ConceptoTipoResponse', 'response', tablaWsfe('ConceptoTipo', S.PARAM_ITEM)],
  ['FEParamGetTiposDoc', 'DocTipoResponse', 'response', tablaWsfe('DocTipo', S.PARAM_ITEM)],
  ['FEParamGetTiposIva', 'IvaTipoResponse', 'response', tablaWsfe('IvaTipo', S.PARAM_ITEM)],
  ['FEParamGetTiposTributos', 'FETributoResponse', 'response', tablaWsfe('TributoTipo', S.PARAM_ITEM)],
  ['FEParamGetTiposOpcional', 'OpcionalTipoResponse', 'response', tablaWsfe('OpcionalTipo', S.PARAM_ITEM)],
  ['FEParamGetTiposMonedas', 'MonedaResponse', 'response', tablaWsfe('Moneda', S.MONEDA)],
  [
    'FEParamGetCondicionIvaReceptor',
    'CondicionIvaReceptorResponse',
    'response',
    tablaWsfe('CondicionIvaReceptor', S.CONDICION_IVA),
  ],
  ['FEParamGetPtosVenta', 'FEPtoVentaResponse', 'response', tablaWsfe('PtoVenta', S.PTO_VENTA)],
  ['FEParamGetTiposPaises', 'FEPaisResponse', 'response', tablaWsfe('PaisTipo', S.PAIS)],
  ['FEParamGetActividades', 'FEActividadesResponse', 'response', tablaWsfe('ActividadesTipo', S.ACTIVIDAD)],
  ['tablaWsfe', 'FEActividadesResponse', 'response', S.tablaWsfe('ActividadesTipo', S.ACTIVIDAD)],
];

/** Tipo del XSD de cada tabla de parámetros de WSFEX. */
const TABLAS_WSFEX: Record<keyof typeof S.FEX_TABLAS, string> = {
  ClsFEXResponse_Cbte_Tipo: 'FEXResponse_Cbte_Tipo',
  ClsFEXResponse_Tex: 'FEXResponse_Tex',
  ClsFEXResponse_Inc: 'FEXResponse_Inc',
  ClsFEXResponse_Idi: 'FEXResponse_Idi',
  ClsFEXResponse_UMed: 'FEXResponse_Umed',
  ClsFEXResponse_Mon: 'FEXResponse_Mon',
  ClsFEXResponse_Opc: 'FEXResponse_Opc',
  ClsFEXResponse_DST_pais: 'FEXResponse_DST_pais',
  ClsFEXResponse_DST_cuit: 'FEXResponse_DST_cuit',
  ClsFEXResponse_Mon_CON_Cotizacion: 'FEXResponse_Mon_CON_COTIZACION',
  ClsFEXResponse_PtoVenta: 'FEXResponse_PtoVenta',
  ClsFEXResponse_ActividadTipo: 'FEXResponse_Actividades',
};

const wsfexCases: Case[] = [
  // Requests
  ['FEX_CMP_REQ', 'ClsFEXRequest', 'request', S.FEX_CMP_REQ],
  ['FEXAuthorize', 'FEXAuthorize', 'request', { Cmp: obj(S.FEX_CMP_REQ) }],
  // Token, Sign y Cuit son del bloque `Auth`, que arma el cliente.
  ['FEX_LAST_CMP_REQ', 'ClsFEX_LastCMP', 'request', S.FEX_LAST_CMP_REQ, ['Cuit']],
  ['FEX_GET_CMP_REQ', 'ClsFEXGetCMP', 'request', S.FEX_GET_CMP_REQ],
  ['FEX_CTZ_REQ', 'FEXGetPARAM_Ctz', 'request', S.FEX_CTZ_REQ],
  ['FEX_CHECK_PERMISO_REQ', 'FEXCheck_Permiso', 'request', S.FEX_CHECK_PERMISO_REQ],
  ['FEX_MON_CON_COTIZACION_REQ', 'FEXGetPARAM_MON_CON_COTIZACION', 'request', S.FEX_MON_CON_COTIZACION_REQ],
  // Respuestas
  ['FEX_AUTHORIZE_RESP', 'FEXResponseAuthorize', 'response', S.FEX_AUTHORIZE_RESP],
  ['FEX_GET_CMP_RESP', 'FEXGetCMPResponse', 'response', S.FEX_GET_CMP_RESP],
  ['FEX_LAST_CMP_RESP', 'FEXResponseLast_CMP', 'response', S.FEX_LAST_CMP_RESP],
  ['FEX_LAST_ID_RESP', 'FEXResponse_LastID', 'response', S.FEX_LAST_ID_RESP],
  ['FEX_CTZ_RESP', 'FEXResponse_Ctz', 'response', S.FEX_CTZ_RESP],
  ['FEX_CHECK_PERMISO_RESP', 'FEXResponse_CheckPermiso', 'response', S.FEX_CHECK_PERMISO_RESP],
  ...Object.entries(TABLAS_WSFEX).map(
    ([item, xsdType]): Case => [item, xsdType, 'response', S.tablaWsfex(item as keyof typeof S.FEX_TABLAS)],
  ),
];

describe('contrato DSL ↔ WSDL de WSFEv1', () => {
  it.each(wsfeCases)('%s ↔ %s (%s)', (_name, xsdType, direction, schema, ignore) => {
    expect(checkSchemaAgainstXsd(schema, xsdType, wsfe, { direction, ignore })).toEqual([]);
  });
});

describe('contrato DSL ↔ WSDL de WSFEX', () => {
  it.each(wsfexCases)('%s ↔ %s (%s)', (_name, xsdType, direction, schema, ignore) => {
    expect(checkSchemaAgainstXsd(schema, xsdType, wsfex, { direction, ignore })).toEqual([]);
  });
});
