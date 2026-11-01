import { describe, it, expect } from 'vitest';
import { ArcaValidationError, validateConstatarInput } from '../src/index.js';
import { buildCmpReq } from '../src/validation.js';
import type { ConstatarInput } from '../src/index.js';

const validInput: ConstatarInput = {
  cbteModo: 'CAE',
  cuitEmisor: 30712345671,
  ptoVta: 1,
  cbteTipo: 1,
  cbteNro: 150,
  cbteFch: '20260315',
  impTotal: 12100,
  codAutorizacion: '73429843294823',
  docTipoReceptor: 80,
  docNroReceptor: 20123456786,
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
    expect(fieldsOf({ ...validInput, cbteModo: 'CAI', cuitEmisor: '30-71234567-1', cbteFch: '2026-03-15' })).toEqual(
      [],
    );
    expect(fieldsOf({ ...validInput, cbteModo: 'CAEA', cbteFch: new Date('2026-03-15T15:00:00Z') })).toEqual([]);
  });

  it('acepta ImpTotal = 0 y receptor omitido', () => {
    const { docTipoReceptor: _t, docNroReceptor: _n, ...rest } = validInput;
    expect(fieldsOf({ ...rest, impTotal: 0 })).toEqual([]);
  });

  it('rechaza CbteModo desconocido', () => {
    expect(fieldsOf({ ...validInput, cbteModo: 'CAX' as never })).toEqual(['cbteModo']);
  });

  it('rechaza CuitEmisor con dígito verificador inválido', () => {
    expect(fieldsOf({ ...validInput, cuitEmisor: 30712345672 })).toEqual(['cuitEmisor']);
  });

  it('rechaza PtoVta, CbteTipo y CbteNro fuera de rango o no enteros', () => {
    expect(fieldsOf({ ...validInput, ptoVta: 0 })).toEqual(['ptoVta']);
    expect(fieldsOf({ ...validInput, ptoVta: 99999 })).toEqual(['ptoVta']);
    expect(fieldsOf({ ...validInput, cbteTipo: 1.5 })).toEqual(['cbteTipo']);
    expect(fieldsOf({ ...validInput, cbteNro: 100_000_000 })).toEqual(['cbteNro']);
  });

  it('rechaza fechas inválidas o inexistentes', () => {
    expect(fieldsOf({ ...validInput, cbteFch: '15/03/2026' })).toEqual(['cbteFch']);
    expect(fieldsOf({ ...validInput, cbteFch: '20230230' })).toEqual(['cbteFch']);
    expect(fieldsOf({ ...validInput, cbteFch: '' })).toEqual(['cbteFch']);
  });

  it('rechaza ImpTotal negativo, NaN, Infinity o con más de 13 enteros', () => {
    for (const impTotal of [-1, NaN, Infinity, 1e13]) {
      expect(fieldsOf({ ...validInput, impTotal })).toEqual(['impTotal']);
    }
  });

  it('rechaza CodAutorizacion que no tenga 14 dígitos', () => {
    expect(fieldsOf({ ...validInput, codAutorizacion: '12345' })).toEqual(['codAutorizacion']);
    expect(fieldsOf({ ...validInput, codAutorizacion: '7342984329482A' })).toEqual(['codAutorizacion']);
  });

  it('exige DocTipoReceptor y DocNroReceptor juntos', () => {
    expect(fieldsOf({ ...validInput, docNroReceptor: undefined })).toEqual(['docNroReceptor']);
    expect(fieldsOf({ ...validInput, docTipoReceptor: undefined })).toEqual(['docTipoReceptor']);
  });

  it('valida el documento del receptor', () => {
    expect(fieldsOf({ ...validInput, docTipoReceptor: 123 })).toEqual(['docTipoReceptor']);
    expect(fieldsOf({ ...validInput, docTipoReceptor: 96, docNroReceptor: '12.345.678' })).toEqual(['docNroReceptor']);
    expect(fieldsOf({ ...validInput, docTipoReceptor: 96, docNroReceptor: '12345678' })).toEqual([]);
    // DocTipo 80 (CUIT): dígito verificador
    expect(fieldsOf({ ...validInput, docNroReceptor: 20123456789 })).toEqual(['docNroReceptor']);
  });

  it('valida Opcionales', () => {
    expect(fieldsOf({ ...validInput, opcionales: [] })).toEqual(['opcionales']);
    // Los errores del XSD (largos) se reportan antes que los de reglas propias (Id repetido).
    expect(
      fieldsOf({
        ...validInput,
        opcionales: [
          { id: '01', valor: 'x' },
          { id: '01', valor: 'y' },
          { id: '12345', valor: '' },
        ],
      }),
    ).toEqual(['opcionales[2].id', 'opcionales[2].valor', 'opcionales[1].id']);
  });

  it('informa todos los errores juntos', () => {
    expect(fieldsOf({ ...validInput, ptoVta: 0, cbteNro: 0, impTotal: -1 })).toEqual(['ptoVta', 'cbteNro', 'impTotal']);
  });

  it('rechaza campos desconocidos (no existen en CmpDatos)', () => {
    expect(fieldsOf({ ...validInput, Foo: 1 } as never)).toEqual(['Foo']);
    expect(fieldsOf({ ...validInput, opcionales: [{ id: '1', valor: 'x', Extra: 1 } as never] })).toEqual([
      'opcionales[0].Extra',
    ]);
  });

  it('rechaza un Opcional que no es objeto', () => {
    expect(fieldsOf({ ...validInput, opcionales: [null as never] })).toEqual(['opcionales[0]']);
  });

  it('el mensaje del error incluye cada campo', () => {
    const err = (() => {
      try {
        validateConstatarInput({ ...validInput, ptoVta: 0, docNroReceptor: undefined });
      } catch (e) {
        return e as ArcaValidationError;
      }
    })();
    expect(err).toBeInstanceOf(ArcaValidationError);
    expect(err?.field).toBe('ptoVta');
    expect(err?.message).toMatch(/^Validación de ConstatarInput fallida: ptoVta: .*; docNroReceptor: /);
  });
});

describe('buildCmpReq', () => {
  it('normaliza al orden del WSDL: CUIT, fecha AAAAMMDD, ImpTotal con 2 decimales y documento como texto', () => {
    const req = buildCmpReq({
      ...validInput,
      cuitEmisor: '30-71234567-1',
      cbteFch: '2026-03-15',
      impTotal: 12100.456,
      docTipoReceptor: ' 96 ',
      docNroReceptor: '0012345678',
      opcionales: [{ id: '01', valor: 'x' }],
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
    const req = buildCmpReq({ ...validInput, docTipoReceptor: '', docNroReceptor: '' });
    expect(req).not.toHaveProperty('docTipoReceptor');
    expect(req).not.toHaveProperty('docNroReceptor');
  });

  it('acepta ImpTotal con 13 enteros y redondea al límite', () => {
    expect(buildCmpReq({ ...validInput, impTotal: 9_999_999_999_999.99 }).ImpTotal).toBe('9999999999999.99');
    expect(fieldsOf({ ...validInput, impTotal: 9_999_999_999_999.996 })).toEqual(['impTotal']);
  });
});
