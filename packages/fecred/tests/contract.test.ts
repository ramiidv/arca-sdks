/**
 * Tests de contrato: cada schema de `src/schemas.ts` contra su tipo del XSD
 * embebido en el WSDL de producción (`wsdl/wsfecred.wsdl`).
 *
 * Los requests se comparan con el `*RequestType` de la operación (sin
 * `authRequest`, que arma `FecredClient.call()` fuera del schema) y las
 * respuestas con el `*ReturnType` (lo que decodifica el cliente).
 */
import { readFileSync } from 'node:fs';
import type { Schema } from '@ramiidv/arca-common/schema';
import { checkSchemaAgainstXsd, loadXsdTypes } from '@ramiidv/arca-common/testing';
import { describe, expect, it } from 'vitest';
import { REQ, RESP } from '../src/schemas.js';

const types = loadXsdTypes(readFileSync(new URL('../wsdl/wsfecred.wsdl', import.meta.url), 'utf8'));

/** `authRequest` lo agrega `FecredClient.call()` a todos los requests; no es parte de los schemas. */
const AUTH = ['authRequest'];

/** Operaciones sin parámetros (solo `authRequest`): el schema es vacío. */
const SIN_PARAMETROS: Schema = {};

const requests: [operacion: string, schema: Schema, tipoXsd: string][] = [
  [
    'consultarMontoObligadoRecepcion',
    REQ.consultarMontoObligadoRecepcion,
    'ConsultarMontoObligadoRecepcionRequestType',
  ],
  ['consultarCtasCtes', REQ.consultarCtasCtes, 'ConsultarCtasCtesRequestType'],
  ['consultarCtaCte', REQ.idCtaCte, 'ConsultarCtaCteRequestType'],
  ['consultarComprobantes', REQ.consultarComprobantes, 'ConsultarComprobanteRequestType'],
  ['consultarHistorialEstadosComprobante', REQ.idComprobante, 'ConsultarHistorialEstadosComprobanteRequestType'],
  ['consultarHistorialEstadosCtaCte', REQ.idCtaCte, 'ConsultarHistorialEstadosCtaCteRequestType'],
  ['obtenerRemitos', REQ.idComprobante, 'ObtenerRemitosRequestType'],
  ['aceptarFECred', REQ.aceptarFECred, 'AceptarFECredRequestType'],
  ['rechazarFECred', REQ.rechazarFECred, 'RechazarFECredRequestType'],
  ['informarCancelacionTotalFECred', REQ.informarCancelacionTotalFECred, 'InformarCancelacionTotalFECredRequestType'],
  ['modificarOpcionTransferencia', REQ.modificarOpcionTransferencia, 'ModificarOpcionTransferenciaRequestType'],
  ['informarFacturaAgtDptoCltv', REQ.informarFacturaAgtDptoCltv, 'InformarFacturaAgtDptoCltvRequestType'],
  ['rechazarNotaDC', REQ.rechazarNotaDC, 'RechazarNotaDCRequestType'],
  ['consultarFacturasAgtDptoCltv', REQ.consultarFacturasAgtDptoCltv, 'ConsultarFacturasAgtDptoCltvRequestType'],
  ['consultarCuentasEnAgtDptoCltv', SIN_PARAMETROS, 'ConsultarCuentasEnAgtDptoCltvRequestType'],
  ['consultarTiposRetenciones', SIN_PARAMETROS, 'ConsultarCodigoDescripcionRequestType'],
];

const responses: [nombre: string, schema: Schema, tipoXsd: string][] = [
  [
    'consultarMontoObligadoRecepcion',
    RESP.consultarMontoObligadoRecepcion,
    'ConsultarMontoObligadoRecepcionReturnType',
  ],
  ['consultarCtasCtes', RESP.consultarCtasCtes, 'ConsultarCtasCtesReturnType'],
  ['consultarCtaCte', RESP.consultarCtaCte, 'ConsultarCtaCteReturnType'],
  ['consultarComprobantes', RESP.consultarComprobantes, 'ConsultarCmpReturnType'],
  [
    'consultarHistorialEstadosComprobante',
    RESP.consultarHistorialEstadosComprobante,
    'ConsultarHistorialEstadosComprobanteReturnType',
  ],
  [
    'consultarHistorialEstadosCtaCte',
    RESP.consultarHistorialEstadosCtaCte,
    'consultarHistorialEstadosCtaCteReturnType',
  ],
  ['obtenerRemitos', RESP.obtenerRemitos, 'ObtenerRemitosReturnType'],
  ['operacion', RESP.operacion, 'OperacionFECredReturnType'],
  ['rechazarNotaDC', RESP.rechazarNotaDC, 'RechazarNotaDCReturnType'],
  ['info (OperacionFECred)', RESP.info, 'OperacionFECredReturnType'],
  ['info (RechazarNotaDC)', RESP.info, 'RechazarNotaDCReturnType'],
  ['consultarCuentasEnAgtDptoCltv', RESP.consultarCuentasEnAgtDptoCltv, 'ConsultarCuentasEnAgtDptoCltvReturnType'],
  ['consultarFacturasAgtDptoCltv', RESP.consultarFacturasAgtDptoCltv, 'ConsultarFacturasAgtDptoCltvReturnType'],
  ['consultarTiposRetenciones', RESP.consultarTiposRetenciones, 'ConsultarTiposRetencionesReturnType'],
  ['codigosDescripciones', RESP.codigosDescripciones, 'ConsultarCodigoDescripcionReturnType'],
];

describe('contrato con el XSD de wsfecred', () => {
  it.each(requests)('request %s ↔ %s', (_op, schema, tipo) => {
    expect(checkSchemaAgainstXsd(schema, tipo, types, { direction: 'request', ignore: AUTH })).toEqual([]);
  });

  it.each(responses)('respuesta %s ↔ %s', (_op, schema, tipo) => {
    expect(checkSchemaAgainstXsd(schema, tipo, types, { direction: 'response' })).toEqual([]);
  });

  it('los wrappers de las operaciones usan esos tipos', () => {
    const typeOf = (el: string) => types.elements.get(el)?.type;
    for (const [op, , tipo] of requests) {
      expect(typeOf(`${op}Request`)).toBe(tipo);
    }
    for (const op of [
      'consultarTiposFormasCancelacion',
      'consultarTiposMotivosRechazo',
      'consultarTiposAjustesOperacion',
    ]) {
      expect(typeOf(`${op}Request`)).toBe('ConsultarCodigoDescripcionRequestType');
      expect(typeOf(`${op}Response`)).toBe('ConsultarCodigoDescripcionResponseType');
    }
  });
});
