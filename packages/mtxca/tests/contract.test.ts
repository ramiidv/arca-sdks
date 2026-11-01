/**
 * Contrato: los schemas del DSL contra el XSD del WSDL de producción
 * (`wsdl/wsmtxca.wsdl`). Cada caso es `[nombre, schema, tipo XSD, dirección, ignore]`.
 */
import { readFileSync } from 'node:fs';
import type { Schema } from '@ramiidv/arca-common/schema';
import { checkSchemaAgainstXsd, loadXsdTypes } from '@ramiidv/arca-common/testing';
import { describe, expect, it } from 'vitest';
import {
  ACTIVIDADES_VIGENTES_RESPONSE,
  CAEA_ENTRE_FECHAS_RESPONSE,
  CAEA_NO_UTILIZADO,
  CAEA_NO_UTILIZADO_PTO_VTA,
  CAEA_RESPONSE,
  CODIGO_DESCRIPCION,
  COMPROBANTE_CAE,
  COMPROBANTE_CAE_RESPONSE,
  COMPROBANTE_CAEA,
  COMPROBANTE_CAEA_RESPONSE,
  COMPROBANTE_CONSULTADO,
  CON_CAEA,
  CON_CAEA_PTO_VTA,
  CONDICIONES_IVA_RECEPTOR_RESPONSE,
  CONSULTA_COMPROBANTE,
  CONSULTA_COMPROBANTE_RESPONSE,
  CONSULTA_CONDICIONES_IVA,
  CONSULTA_ULTIMO,
  COTIZACION,
  COTIZACION_RESPONSE,
  ENTRE_FECHAS,
  FECHA_PROCESO,
  PARAMETROS,
  PUNTOS_VENTA_RESPONSE,
  RESULTADO,
  SOLICITUD_CAEA,
  ULTIMO_RESPONSE,
} from '../src/schemas.js';

const types = loadXsdTypes(readFileSync(new URL('../wsdl/wsmtxca.wsdl', import.meta.url), 'utf8'));

/** `authRequest` lo agrega `MtxcaClient.callAuth` a todos los requests (no es parte de estos schemas). */
const AUTH = ['authRequest'];

type Caso = [string, Schema, string, 'request' | 'response', string[]?];

const CASOS: Caso[] = [
  // Requests
  ['COMPROBANTE_CAE', COMPROBANTE_CAE, 'ComprobanteType', 'request'],
  ['COMPROBANTE_CAEA', COMPROBANTE_CAEA, 'ComprobanteType', 'request'],
  ['SOLICITUD_CAEA', SOLICITUD_CAEA, 'SolicitudCAEAType', 'request'],
  ['CONSULTA_ULTIMO', CONSULTA_ULTIMO, 'ConsultaUltimoComprobanteAutorizadoRequestType', 'request'],
  ['CONSULTA_COMPROBANTE', CONSULTA_COMPROBANTE, 'ConsultaComprobanteRequestType', 'request'],
  ['CONSULTA_CONDICIONES_IVA', CONSULTA_CONDICIONES_IVA, 'ConsultaCondicionesIVARequestType', 'request'],
  ['COTIZACION', COTIZACION, 'ConsultarCotizacionMonedaRequestType', 'request', AUTH],
  ['ENTRE_FECHAS', ENTRE_FECHAS, 'ConsultarCAEAEntreFechasRequestType', 'request', AUTH],
  ['CON_CAEA (consultarCAEA)', CON_CAEA, 'ConsultarCAEARequestType', 'request', AUTH],
  ['CON_CAEA (informarCAEANoUtilizado)', CON_CAEA, 'InformarCAEANoUtilizadoRequestType', 'request', AUTH],
  [
    'CON_CAEA (consultarPtosVtaCAEANoInformados)',
    CON_CAEA,
    'ConsultarPtosVtaCAEANoInformadosRequestType',
    'request',
    AUTH,
  ],
  ['CON_CAEA_PTO_VTA', CON_CAEA_PTO_VTA, 'InformarCAEANoUtilizadoPtoVtaRequestType', 'request', AUTH],

  // Respuestas
  ['RESULTADO (autorizarComprobante)', RESULTADO, 'AutorizarComprobanteResponseType', 'response'],
  ['RESULTADO (autorizarAjusteIVA)', RESULTADO, 'AutorizarAjusteIVAResponseType', 'response'],
  ['RESULTADO (informarComprobanteCAEA)', RESULTADO, 'InformarComprobanteCAEAResponseType', 'response'],
  ['RESULTADO (informarAjusteIVACAEA)', RESULTADO, 'InformarAjusteIVACAEAResponseType', 'response'],
  ['FECHA_PROCESO (informarComprobanteCAEA)', FECHA_PROCESO, 'InformarComprobanteCAEAResponseType', 'response'],
  ['FECHA_PROCESO (informarAjusteIVACAEA)', FECHA_PROCESO, 'InformarAjusteIVACAEAResponseType', 'response'],
  ['COMPROBANTE_CAE_RESPONSE', COMPROBANTE_CAE_RESPONSE, 'ComprobanteCAEResponseType', 'response'],
  ['COMPROBANTE_CAEA_RESPONSE', COMPROBANTE_CAEA_RESPONSE, 'ComprobanteCAEAResponseType', 'response'],
  ['CAEA_RESPONSE', CAEA_RESPONSE, 'CAEAResponseType', 'response'],
  ['CAEA_ENTRE_FECHAS_RESPONSE', CAEA_ENTRE_FECHAS_RESPONSE, 'ConsultarCAEAEntreFechasResponseType', 'response'],
  ['CAEA_NO_UTILIZADO', CAEA_NO_UTILIZADO, 'InformarCAEANoUtilizadoResponseType', 'response'],
  ['CAEA_NO_UTILIZADO_PTO_VTA', CAEA_NO_UTILIZADO_PTO_VTA, 'InformarCAEANoUtilizadoPtoVtaResponseType', 'response'],
  ['ULTIMO_RESPONSE', ULTIMO_RESPONSE, 'ConsultarUltimoComprobanteAutorizadoResponseType', 'response'],
  ['CONSULTA_COMPROBANTE_RESPONSE', CONSULTA_COMPROBANTE_RESPONSE, 'ConsultarComprobanteResponseType', 'response'],
  ['COMPROBANTE_CONSULTADO', COMPROBANTE_CONSULTADO, 'ComprobanteType', 'response'],
  ['CODIGO_DESCRIPCION', CODIGO_DESCRIPCION, 'CodigoDescripcionType', 'response'],
  [
    'CONDICIONES_IVA_RECEPTOR_RESPONSE',
    CONDICIONES_IVA_RECEPTOR_RESPONSE,
    'ConsultarCondicionesIVAReceptorResponseType',
    'response',
  ],
  ['COTIZACION_RESPONSE', COTIZACION_RESPONSE, 'ConsultarCotizacionMonedaResponseType', 'response'],
  [
    'PUNTOS_VENTA_RESPONSE (consultarPuntosVenta*)',
    PUNTOS_VENTA_RESPONSE,
    'ConsultarPuntosVentaResponseType',
    'response',
  ],
  [
    'PUNTOS_VENTA_RESPONSE (consultarPtosVtaCAEANoInformados)',
    PUNTOS_VENTA_RESPONSE,
    'ConsultarPtosVtaCAEANoInformadosResponseType',
    'response',
  ],
  [
    'ACTIVIDADES_VIGENTES_RESPONSE',
    ACTIVIDADES_VIGENTES_RESPONSE,
    'ConsultarActividadesVigentesResponseType',
    'response',
  ],
  // Consultas de parámetros: `consultarX` → `ConsultarXResponseType`.
  ...Object.entries(PARAMETROS).map(
    ([method, schema]): Caso => [
      `PARAMETROS.${method}`,
      schema,
      `${method[0].toUpperCase()}${method.slice(1)}ResponseType`,
      'response',
    ],
  ),
];

describe('contrato DSL ↔ XSD (wsmtxca.wsdl)', () => {
  it.each(CASOS)('%s', (_name, schema, tipo, direction, ignore) => {
    expect(checkSchemaAgainstXsd(schema, tipo, types, { direction, ignore })).toEqual([]);
  });
});
