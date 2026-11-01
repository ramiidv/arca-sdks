import { describe, expect, it } from 'vitest';
import { ArcaResponseError, ArcaValidationError, parseXml } from '../src/index.js';
import {
  cuit,
  date,
  date8,
  dec,
  decodeResponse,
  encodeRequest,
  formatDateTimeAR,
  id,
  int,
  list,
  must,
  obj,
  opt,
  str,
  wrapped,
} from '../src/schema.js';

describe('schema: encode', () => {
  it('redondea decimales según fractionDigits y rechaza NaN/Infinity/negativos', () => {
    const s = { a: dec(2, 0), b: opt(dec(3, 0)) };
    expect(encodeRequest({ a: 1.005, b: 2 }, s, 't')).toEqual({ a: '1.01', b: '2.000' });
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1, '1']) {
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

  it('respeta el orden del schema, no el del input', () => {
    const out = encodeRequest({ b: 'x', a: 1 }, { a: int(), b: str() }, 't');
    expect(Object.keys(out)).toEqual(['a', 'b']);
  });

  it('str con pattern, valores permitidos y largo', () => {
    const s = { a: str({ pattern: /^\d{4}$/ }), b: opt(str({ values: ['S', 'N'] })), c: opt(str({ maxLen: 2 })) };
    expect(encodeRequest({ a: '0012' }, s, 't')).toEqual({ a: '0012' });
    expect(() => encodeRequest({ a: '12' }, s, 't')).toThrow(/formato inválido/);
    expect(() => encodeRequest({ a: '0012', b: 'X' }, s, 't')).toThrow(/valores permitidos/);
    expect(() => encodeRequest({ a: '0012', c: 'abc' }, s, 't')).toThrow(/como máximo 2/);
  });

  it('CUIT con dígito verificador, normalizado', () => {
    expect(encodeRequest({ a: '20-12345678-6' }, { a: cuit() }, 't')).toEqual({ a: '20123456786' });
    expect(() => encodeRequest({ a: '20123456789' }, { a: cuit() }, 't')).toThrow(ArcaValidationError);
  });

  it('fechas: date (AAAA-MM-DD) y date8 (AAAAMMDD)', () => {
    expect(encodeRequest({ a: '20261101' }, { a: date() }, 't')).toEqual({ a: '2026-11-01' });
    expect(encodeRequest({ a: '2026-11-01' }, { a: date8() }, 't')).toEqual({ a: '20261101' });
    expect(() => encodeRequest({ a: '20261332' }, { a: date8() }, 't')).toThrow(ArcaValidationError);
  });

  it('listas: mínimo de elementos y contenedor wrapped', () => {
    expect(() => encodeRequest({ a: [] }, { a: list(str()) }, 't')).toThrow(ArcaValidationError);
    expect(encodeRequest({ a: [] }, { a: opt(list(str(), 0)) }, 't')).toEqual({});
    expect(encodeRequest({ a: ['x', 'y'] }, { a: wrapped('item', str()) }, 't')).toEqual({ a: { item: ['x', 'y'] } });
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

  it('con parseNumbers:false conserva ceros y decimales de los xs:string', () => {
    const xml = '<r><codPostal>0012</codPostal><dato>10.50</dato><cant>007</cant></r>';
    const node = parseXml(xml, { parseNumbers: false }).r;
    const r = decodeResponse(node, { codPostal: str(), dato: str(), cant: int() }, 'r');
    expect(r).toEqual({ codPostal: '0012', dato: '10.50', cant: 7 });
  });

  it('CUIT como number (default) o string', () => {
    expect(decodeResponse({ a: '20123456786' }, { a: cuit() }, 'r')).toEqual({ a: 20123456786 });
    expect(decodeResponse({ a: '20123456786' }, { a: cuit({ decodeAs: 'string' }) }, 'r')).toEqual({
      a: '20123456786',
    });
  });

  it('campo obligatorio faltante o vacío → ArcaResponseError', () => {
    expect(() => decodeResponse({}, { a: must(str()) }, 'r')).toThrow(ArcaResponseError);
    expect(() => decodeResponse({ a: '' }, { a: must(int()) }, 'r')).toThrow(ArcaResponseError);
  });

  it('valor no numérico donde se espera número → error (no NaN)', () => {
    expect(() => decodeResponse({ a: 'abc' }, { a: int() }, 'r')).toThrow(ArcaResponseError);
  });

  it('un elemento simple repetido → error', () => {
    expect(() => decodeResponse({ a: ['1', '2'] }, { a: int() }, 'r')).toThrow(/más de una vez/);
  });

  it('error propio con options.error', () => {
    class MiError extends Error {}
    expect(() => decodeResponse({}, { a: must(str()) }, 'r', { error: (m) => new MiError(m) })).toThrow(MiError);
  });
});
