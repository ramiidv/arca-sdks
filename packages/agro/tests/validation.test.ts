import { describe, it, expect } from 'vitest';
import {
  ArcaValidationError,
  validateAjusteUnificado,
  validateAutorizarCPEAutomotor,
  validateAutorizarCPEFerroviaria,
  validateLiquidacion,
} from '../src/index.js';
import {
  formatDateTimeAR,
  encodeRequest,
  decodeResponse,
  dec,
  int,
  id,
  list,
  str,
  opt,
  obj,
  must,
} from '../src/schema.js';
import { ArcaAgroResponseError } from '../src/errors.js';

describe('schema: encode', () => {
  it('redondea decimales según fractionDigits y rechaza NaN/Infinity/negativos', () => {
    const s = { a: dec(2, 0), b: opt(dec(3, 0)) };
    expect(encodeRequest({ a: 1.005, b: 2 }, s, 't')).toEqual({ a: '1.01', b: '2.000' });
    for (const bad of [NaN, Infinity, -1, '1']) {
      expect(() => encodeRequest({ a: bad }, s, 't')).toThrow(ArcaValidationError);
    }
  });

  it('enteros: rechaza decimales y respeta minExclusive', () => {
    expect(() => encodeRequest({ a: 1.5 }, { a: int() }, 't')).toThrow(ArcaValidationError);
    expect(() => encodeRequest({ a: 0 }, { a: int(0, 9, true) }, 't')).toThrow(ArcaValidationError);
    expect(encodeRequest({ a: 1 }, { a: int(0, 9, true) }, 't')).toEqual({ a: 1 });
  });

  it('ids largos: number o string de dígitos → string', () => {
    expect(encodeRequest({ a: 10100012345 }, { a: id() }, 't')).toEqual({ a: '10100012345' });
    expect(encodeRequest({ a: '010100012345' }, { a: id() }, 't')).toEqual({ a: '010100012345' });
    expect(() => encodeRequest({ a: '12A' }, { a: id() }, 't')).toThrow(ArcaValidationError);
  });

  it('listas: mínimo de elementos', () => {
    expect(() => encodeRequest({ a: [] }, { a: list(str()) }, 't')).toThrow(ArcaValidationError);
    expect(encodeRequest({ a: [] }, { a: opt(list(str(), 0)) }, 't')).toEqual({});
  });

  it('reporta todos los errores juntos, con la ruta del campo', () => {
    try {
      encodeRequest({ x: { a: 'no', b: undefined }, extra: 1 }, { x: obj({ a: int(), b: str() }) }, 't');
      expect.unreachable();
    } catch (e) {
      expect((e as ArcaValidationError).details.map((d) => d.field)).toEqual(['extra', 'x.a', 'x.b']);
    }
  });

  it('formatDateTimeAR usa hora de Argentina (-03:00)', () => {
    expect(formatDateTimeAR(new Date('2026-01-01T02:15:30Z'))).toBe('2025-12-31T23:15:30-03:00');
  });
});

describe('schema: decode', () => {
  it('xs:string queda string aunque parezca número; listas ausentes → []', () => {
    const r = decodeResponse<Record<string, unknown>>(
      { codigo: 1, n: '42', l: undefined },
      { codigo: str(), n: int(), l: list(str(), 0) },
      'r',
    );
    expect(r).toEqual({ codigo: '1', n: 42, l: [] });
  });

  it('campo obligatorio faltante → ArcaAgroResponseError', () => {
    expect(() => decodeResponse({}, { a: must(str()) }, 'r')).toThrow(ArcaAgroResponseError);
  });

  it('valor no numérico donde se espera número → error (no NaN)', () => {
    expect(() => decodeResponse({ a: 'abc' }, { a: int() }, 'r')).toThrow(ArcaAgroResponseError);
  });
});

describe('validadores exportados', () => {
  it('validateAutorizarCPEAutomotor detecta errores sin llamar a ARCA', () => {
    expect(() => validateAutorizarCPEAutomotor({} as never)).toThrow(ArcaValidationError);
  });

  it('validateAutorizarCPEFerroviaria', () => {
    expect(() => validateAutorizarCPEFerroviaria({} as never)).toThrow(ArcaValidationError);
  });

  it('validateLiquidacion y validateAjusteUnificado', () => {
    expect(() => validateLiquidacion({ liquidacion: {} } as never)).toThrow(ArcaValidationError);
    expect(() =>
      validateAjusteUnificado({
        ajusteBase: { ptoEmision: 1, nroOrden: 1, coeAjustado: '1', codLocalidad: 1, codProv: 1 },
      }),
    ).toThrow(/ajusteCredito/);
  });
});
