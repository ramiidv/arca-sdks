/**
 * Tests de contrato: los schemas de respuesta del SDK contra los XSD de los
 * WSDL de producción (`wsdl/`). Las requests de Padrón no usan el DSL (son
 * `token`/`sign`/`cuitRepresentada` + un parámetro), así que sólo se cubren
 * respuestas.
 */
import { readFileSync } from 'node:fs';
import { checkSchemaAgainstXsd, loadXsdTypes } from '@ramiidv/arca-common/testing';
import type { Schema } from '@ramiidv/arca-common/schema';
import { describe, expect, it } from 'vitest';
import { personaReturnSchema } from '../src/mapping.js';
import { PersonaA4Schema } from '../src/padron-a4.js';
import { PersonaListReturnSchema, PersonaReturnSchema } from '../src/padron-a5.js';
import { PersonaA10Schema } from '../src/padron-a10.js';
import { IdPersonaListReturnSchema, PersonaA13Schema } from '../src/padron-a13.js';
import { ParameterCollectionReturnSchema } from '../src/padron-a100.js';

const wsdl = (name: string) => loadXsdTypes(readFileSync(new URL(`../wsdl/${name}.wsdl`, import.meta.url), 'utf8'));
const a4 = wsdl('a4');
const a5 = wsdl('a5');
const a10 = wsdl('a10');
const a13 = wsdl('a13');
const a100 = wsdl('a100');

const cases: Array<[string, Schema, string, ReturnType<typeof loadXsdTypes>]> = [
  ['A4 getPersona → personaReturn', personaReturnSchema(PersonaA4Schema), 'personaReturn', a4],
  ['A5 getPersona_v2 → personaReturn', PersonaReturnSchema, 'personaReturn', a5],
  ['A5 getPersonaList_v2 → personaListReturn', PersonaListReturnSchema, 'personaListReturn', a5],
  ['A10 getPersona → personaReturn', personaReturnSchema(PersonaA10Schema), 'personaReturn', a10],
  ['A13 getPersona/getPersonaV2 → personaReturn', personaReturnSchema(PersonaA13Schema), 'personaReturn', a13],
  ['A13 getIdPersonaListByDocumento → idPersonaListReturn', IdPersonaListReturnSchema, 'idPersonaListReturn', a13],
  [
    'A100 getParameterCollectionByName → parameterCollectionReturn',
    ParameterCollectionReturnSchema,
    'parameterCollectionReturn',
    a100,
  ],
];

describe('contrato de las respuestas con el XSD oficial', () => {
  it.each(cases)('%s', (_name, schema, xsdType, types) => {
    expect(checkSchemaAgainstXsd(schema, xsdType, types, { direction: 'response' })).toEqual([]);
  });

  it('los WSDL se leen bien: un nombre o una cardinalidad distinta se detecta en un tipo anidado', () => {
    const roto = personaReturnSchema({
      ...PersonaA4Schema,
      domicilio: PersonaA4Schema.idPersona!,
      mail: PersonaA4Schema.apellido!,
    });
    expect(checkSchemaAgainstXsd(roto, 'personaReturn', a4, { direction: 'response' })).toEqual([
      expect.stringMatching(/^personaReturn\.persona\.domicilio: se repite en el XSD/),
      'personaReturn.persona.domicilio: es un tipo complejo en el XSD pero un escalar en el schema',
      expect.stringMatching(/^personaReturn\.persona\.mail: no existe en el XSD/),
    ]);
  });
});
