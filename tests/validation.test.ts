import { describe, it, expect } from 'vitest';
import { ArcaValidationError, validateConstatarInput } from '../src/index.js';
import type { ConstatarInput } from '../src/index.js';

const validInput: ConstatarInput = {
  CbteModo: 'CAE',
  CuitEmisor: 30712345671,
  PtoVta: 1,
  CbteTipo: 1,
  CbteNro: 150,
  CbteFch: '20260315',
  ImpTotal: 12100,
  CodAutorizacion: '73429843294823',
  DocTipoReceptor: 80,
  DocNroReceptor: 20123456786,
};

function fieldsOf(input: ConstatarInput): string[] {
  try {
    validateConstatarInput(input);
    return [];
  } catch (e) {
    expect(e).toBeInstanceOf(ArcaValidationError);
    return (e as ArcaValidationError).details.map((d) => d.field);
  }
}

describe('validateConstatarInput', () => {
  it('acepta input válido', () => {
    expect(fieldsOf(validInput)).toEqual([]);
  });

  it('acepta CAI y CAEA, CUIT con guiones, fecha ISO y Date', () => {
    expect(fieldsOf({ ...validInput, CbteModo: 'CAI', CuitEmisor: '30-71234567-1', CbteFch: '2026-03-15' })).toEqual([]);
    expect(fieldsOf({ ...validInput, CbteModo: 'CAEA', CbteFch: new Date('2026-03-15T15:00:00Z') })).toEqual([]);
  });

  it('acepta ImpTotal = 0 y receptor omitido', () => {
    const { DocTipoReceptor: _t, DocNroReceptor: _n, ...rest } = validInput;
    expect(fieldsOf({ ...rest, ImpTotal: 0 })).toEqual([]);
  });

  it('rechaza CbteModo desconocido', () => {
    expect(fieldsOf({ ...validInput, CbteModo: 'CAX' as never })).toEqual(['CbteModo']);
  });

  it('rechaza CuitEmisor con dígito verificador inválido', () => {
    expect(fieldsOf({ ...validInput, CuitEmisor: 30712345672 })).toEqual(['CuitEmisor']);
  });

  it('rechaza PtoVta, CbteTipo y CbteNro fuera de rango o no enteros', () => {
    expect(fieldsOf({ ...validInput, PtoVta: 0 })).toEqual(['PtoVta']);
    expect(fieldsOf({ ...validInput, PtoVta: 99999 })).toEqual(['PtoVta']);
    expect(fieldsOf({ ...validInput, CbteTipo: 1.5 })).toEqual(['CbteTipo']);
    expect(fieldsOf({ ...validInput, CbteNro: 100_000_000 })).toEqual(['CbteNro']);
  });

  it('rechaza fechas inválidas o inexistentes', () => {
    expect(fieldsOf({ ...validInput, CbteFch: '15/03/2026' })).toEqual(['CbteFch']);
    expect(fieldsOf({ ...validInput, CbteFch: '20230230' })).toEqual(['CbteFch']);
    expect(fieldsOf({ ...validInput, CbteFch: '' })).toEqual(['CbteFch']);
  });

  it('rechaza ImpTotal negativo, NaN, Infinity o con más de 13 enteros', () => {
    for (const ImpTotal of [-1, NaN, Infinity, 1e13]) {
      expect(fieldsOf({ ...validInput, ImpTotal })).toEqual(['ImpTotal']);
    }
  });

  it('rechaza CodAutorizacion que no tenga 14 dígitos', () => {
    expect(fieldsOf({ ...validInput, CodAutorizacion: '12345' })).toEqual(['CodAutorizacion']);
    expect(fieldsOf({ ...validInput, CodAutorizacion: '7342984329482A' })).toEqual(['CodAutorizacion']);
  });

  it('exige DocTipoReceptor y DocNroReceptor juntos', () => {
    expect(fieldsOf({ ...validInput, DocNroReceptor: undefined })).toEqual(['DocNroReceptor']);
    expect(fieldsOf({ ...validInput, DocTipoReceptor: undefined })).toEqual(['DocTipoReceptor']);
  });

  it('valida el documento del receptor', () => {
    expect(fieldsOf({ ...validInput, DocTipoReceptor: 123 })).toEqual(['DocTipoReceptor']);
    expect(fieldsOf({ ...validInput, DocTipoReceptor: 96, DocNroReceptor: '12.345.678' })).toEqual(['DocNroReceptor']);
    expect(fieldsOf({ ...validInput, DocTipoReceptor: 96, DocNroReceptor: '12345678' })).toEqual([]);
    // DocTipo 80 (CUIT): dígito verificador
    expect(fieldsOf({ ...validInput, DocNroReceptor: 20123456789 })).toEqual(['DocNroReceptor']);
  });

  it('valida Opcionales', () => {
    expect(fieldsOf({ ...validInput, Opcionales: [] })).toEqual(['Opcionales']);
    expect(
      fieldsOf({
        ...validInput,
        Opcionales: [
          { Id: '01', Valor: 'x' },
          { Id: '01', Valor: 'y' },
          { Id: '12345', Valor: '' },
        ],
      }),
    ).toEqual(['Opcionales[1].Id', 'Opcionales[2].Id', 'Opcionales[2].Valor']);
  });

  it('informa todos los errores juntos', () => {
    expect(fieldsOf({ ...validInput, PtoVta: 0, CbteNro: 0, ImpTotal: -1 })).toEqual(['PtoVta', 'CbteNro', 'ImpTotal']);
  });
});
