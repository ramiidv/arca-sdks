import { describe, it, expect } from 'vitest';
import { ArcaValidationError, validateConstatarInput } from '../src/index.js';
import { buildCmpReq } from '../src/validation.js';
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
    expect(fieldsOf({ ...validInput, CbteModo: 'CAI', CuitEmisor: '30-71234567-1', CbteFch: '2026-03-15' })).toEqual(
      [],
    );
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
    // Los errores del XSD (largos) se reportan antes que los de reglas propias (Id repetido).
    expect(
      fieldsOf({
        ...validInput,
        Opcionales: [
          { Id: '01', Valor: 'x' },
          { Id: '01', Valor: 'y' },
          { Id: '12345', Valor: '' },
        ],
      }),
    ).toEqual(['Opcionales[2].Id', 'Opcionales[2].Valor', 'Opcionales[1].Id']);
  });

  it('informa todos los errores juntos', () => {
    expect(fieldsOf({ ...validInput, PtoVta: 0, CbteNro: 0, ImpTotal: -1 })).toEqual(['PtoVta', 'CbteNro', 'ImpTotal']);
  });

  it('rechaza campos desconocidos (no existen en CmpDatos)', () => {
    expect(fieldsOf({ ...validInput, Foo: 1 } as never)).toEqual(['Foo']);
    expect(fieldsOf({ ...validInput, Opcionales: [{ Id: '1', Valor: 'x', Extra: 1 } as never] })).toEqual([
      'Opcionales[0].Extra',
    ]);
  });

  it('rechaza un Opcional que no es objeto', () => {
    expect(fieldsOf({ ...validInput, Opcionales: [null as never] })).toEqual(['Opcionales[0]']);
  });

  it('el mensaje del error incluye cada campo', () => {
    const err = (() => {
      try {
        validateConstatarInput({ ...validInput, PtoVta: 0, DocNroReceptor: undefined });
      } catch (e) {
        return e as ArcaValidationError;
      }
    })();
    expect(err).toBeInstanceOf(ArcaValidationError);
    expect(err?.field).toBe('PtoVta');
    expect(err?.message).toMatch(/^Validación de ConstatarInput fallida: PtoVta: .*; DocNroReceptor: /);
  });
});

describe('buildCmpReq', () => {
  it('normaliza al orden del WSDL: CUIT, fecha AAAAMMDD, ImpTotal con 2 decimales y documento como texto', () => {
    const req = buildCmpReq({
      ...validInput,
      CuitEmisor: '30-71234567-1',
      CbteFch: '2026-03-15',
      ImpTotal: 12100.456,
      DocTipoReceptor: ' 96 ',
      DocNroReceptor: '0012345678',
      Opcionales: [{ Id: '01', Valor: 'x' }],
    });
    expect(req).toEqual({
      CbteModo: 'CAE',
      CuitEmisor: '30712345671',
      PtoVta: 1,
      CbteTipo: 1,
      CbteNro: 150,
      CbteFch: '20260315',
      ImpTotal: '12100.46',
      CodAutorizacion: '73429843294823',
      DocTipoReceptor: '96',
      DocNroReceptor: '0012345678',
      Opcionales: { Opcional: [{ Id: '01', Valor: 'x' }] },
    });
    expect(Object.keys(req)).toEqual([
      'CbteModo',
      'CuitEmisor',
      'PtoVta',
      'CbteTipo',
      'CbteNro',
      'CbteFch',
      'ImpTotal',
      'CodAutorizacion',
      'DocTipoReceptor',
      'DocNroReceptor',
      'Opcionales',
    ]);
  });

  it("DocTipoReceptor/DocNroReceptor vacíos ('') equivalen a no informarlos", () => {
    const req = buildCmpReq({ ...validInput, DocTipoReceptor: '', DocNroReceptor: '' });
    expect(req).not.toHaveProperty('DocTipoReceptor');
    expect(req).not.toHaveProperty('DocNroReceptor');
  });

  it('acepta ImpTotal con 13 enteros y redondea al límite', () => {
    expect(buildCmpReq({ ...validInput, ImpTotal: 9_999_999_999_999.99 }).ImpTotal).toBe('9999999999999.99');
    expect(fieldsOf({ ...validInput, ImpTotal: 9_999_999_999_999.996 })).toEqual(['ImpTotal']);
  });
});
