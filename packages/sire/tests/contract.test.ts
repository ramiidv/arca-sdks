import { readFileSync } from 'node:fs';
import type { Schema } from '@ramiidv/arca-common/schema';
import { checkSchemaAgainstXsd, loadXsdTypes } from '@ramiidv/arca-common/testing';
import { describe, expect, it } from 'vitest';
import { CERTIFICADO, CERTIFICADO_ANULACION, CERTIFICADO_RESULT } from '../src/schemas.js';

const wsdl = (file: string) => readFileSync(new URL(`../wsdl/${file}`, import.meta.url), 'utf8');
const types = loadXsdTypes(wsdl('sire-c2005.wsdl'), wsdl('sire-c2005.C2005_schema.xsd'));

describe('contrato con el XSD oficial de SIRE (C2005)', () => {
  it.each<[string, Schema, string, 'request' | 'response']>([
    ['certificado (emitir)', CERTIFICADO, 'certificado', 'request'],
    ['certificadoAnulacion (anular)', CERTIFICADO_ANULACION, 'certificadoAnulacion', 'request'],
    ['emitirResponse', CERTIFICADO_RESULT, 'emitirResponse', 'response'],
    ['anularResponse', CERTIFICADO_RESULT, 'anularResponse', 'response'],
  ])('%s', (_, schema, type, direction) => {
    expect(checkSchemaAgainstXsd(schema, type, types, { direction })).toEqual([]);
  });
});
