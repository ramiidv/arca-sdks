/**
 * Tests de contrato: los schemas del DSL contra los tipos del WSDL oficial de
 * producción de WSCDC (`wsdl/wscdc.wsdl`).
 */
import { readFileSync } from 'node:fs';
import { obj, wrapped } from '@ramiidv/arca-common/schema';
import type { Schema } from '@ramiidv/arca-common/schema';
import { checkSchemaAgainstXsd, loadXsdTypes } from '@ramiidv/arca-common/testing';
import { describe, expect, it } from 'vitest';
import * as S from '../src/schemas.js';

const types = loadXsdTypes(readFileSync(new URL('../wsdl/wscdc.wsdl', import.meta.url), 'utf8'));

/** Respuesta de las tablas de parámetros tal como la decodifica `consultarTabla`. */
const tabla = (child: string, item: Schema): Schema => ({ ResultGet: wrapped(child, obj(item), 0) });

const cases: [name: string, xsdType: string, direction: 'request' | 'response', schema: Schema][] = [
  // Requests (el bloque `Auth` no usa el DSL: se arma en el cliente).
  ['ComprobanteConstatar.CmpReq', 'ComprobanteConstatar', 'request', { CmpReq: obj(S.CMP_REQ) }],
  ['CMP_REQ', 'CmpDatos', 'request', S.CMP_REQ],
  // Respuestas
  ['CMP_RESP', 'CmpDatos', 'response', S.CMP_RESP],
  ['CONSTATAR_RESP', 'CmpResponse', 'response', S.CONSTATAR_RESP],
  ['CONSTATAR_RESP + CmpResp', 'CmpResponse', 'response', { CmpResp: obj(S.CMP_RESP), ...S.CONSTATAR_RESP }],
  ['FAC_MOD_TIPO', 'FacModTipo', 'response', S.FAC_MOD_TIPO],
  ['CBTE_TIPO', 'CbteTipo', 'response', S.CBTE_TIPO],
  ['ID_DESC (DocTipo)', 'DocTipo', 'response', S.ID_DESC],
  ['ID_DESC (OpcionalTipo)', 'OpcionalTipo', 'response', S.ID_DESC],
  ['ComprobantesModalidadConsultar', 'FacModTipoResponse', 'response', tabla('FacModTipo', S.FAC_MOD_TIPO)],
  ['ComprobantesTipoConsultar', 'CbteTipoResponse', 'response', tabla('CbteTipo', S.CBTE_TIPO)],
  ['DocumentosTipoConsultar', 'DocTipoResponse', 'response', tabla('DocTipo', S.ID_DESC)],
  ['OpcionalesTipoConsultar', 'OpcionalTipoResponse', 'response', tabla('OpcionalTipo', S.ID_DESC)],
];

describe('contrato DSL ↔ WSDL de WSCDC', () => {
  it.each(cases)('%s ↔ %s (%s)', (_name, xsdType, direction, schema) => {
    expect(checkSchemaAgainstXsd(schema, xsdType, types, { direction })).toEqual([]);
  });
});
