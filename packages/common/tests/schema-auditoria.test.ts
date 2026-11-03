import { describe, expect, it } from 'vitest';
import { ArcaResponseError, ArcaValidationError, formatDate, formatDateTimeAR as fromIndex } from '../src/index.js';
import {
  base64,
  bool,
  custom,
  datetime,
  dec,
  decodeResponse,
  encodeRequest,
  formatDateTimeAR,
  importe,
  int,
  nonEmptyStr,
  opt,
  porcentaje,
  roundHalfEven,
  roundHalfUp,
  list,
  siNo,
  str,
  wrapped,
} from '../src/schema.js';

const encodeErrors = (input: unknown, schema: Parameters<typeof encodeRequest>[1]) => {
  try {
    encodeRequest(input, schema, 'test');
    return [];
  } catch (e) {
    expect(e).toBeInstanceOf(ArcaValidationError);
    return (e as ArcaValidationError).details.map((d) => d.message);
  }
};

describe('formatDateTimeAR', () => {
  it('hora de Argentina, con o sin milisegundos; el mismo desde index y schema', () => {
    const d = new Date('2026-11-01T03:04:05.007Z');
    expect(formatDateTimeAR(d)).toBe('2026-11-01T00:04:05-03:00');
    expect(formatDateTimeAR(d, { millis: true })).toBe('2026-11-01T00:04:05.007-03:00');
    expect(fromIndex).toBe(formatDateTimeAR);
    // Cambio de día en Argentina.
    expect(formatDateTimeAR(new Date('2026-01-01T02:59:59.999Z'), { millis: true })).toBe(
      '2025-12-31T23:59:59.999-03:00',
    );
  });

  it('formatDate usa la misma fecha calendario de Argentina', () => {
    const d = new Date('2026-01-01T02:59:59Z');
    expect(formatDate(d)).toBe('20251231');
    expect(formatDateTimeAR(d).slice(0, 10).replace(/-/g, '')).toBe(formatDate(d));
  });

  it('un Date inválido lanza ArcaValidationError', () => {
    expect(() => formatDateTimeAR(new Date('x'))).toThrow(ArcaValidationError);
  });
});

describe('roundHalfEven', () => {
  it.each([
    [8.565, 2, 8.56],
    [8.575, 2, 8.58],
    [2.675, 2, 2.68],
    [2.665, 2, 2.66],
    [1.005, 2, 1.0],
    [1.015, 2, 1.02],
    [0.5, 0, 0],
    [1.5, 0, 2],
    [2.5, 0, 2],
    [-2.675, 2, -2.68],
    [-8.565, 2, -8.56],
    [-0.005, 2, 0],
    [1234567890.125, 2, 1234567890.12],
    [1234567890.135, 2, 1234567890.14],
    [99999999999.995, 2, 100000000000],
    [1.23456785, 6, 1.234568],
    [10, 2, 10],
  ])('roundHalfEven(%d, %d) = %d', (value, digits, expected) => {
    expect(roundHalfEven(value, digits)).toBe(expected);
  });

  it('difiere de roundHalfUp solo en las mitades exactas con par a la izquierda', () => {
    expect(roundHalfUp(8.565, 2)).toBe(8.57);
    expect(roundHalfEven(8.565, 2)).toBe(8.56);
    expect(roundHalfUp(8.566, 2)).toBe(roundHalfEven(8.566, 2));
    expect(Object.is(roundHalfEven(-0.001, 2), 0)).toBe(true);
  });
});

describe('nonEmptyStr / importe / porcentaje', () => {
  it('nonEmptyStr rechaza vacío y solo espacios, con largo mínimo/máximo', () => {
    const schema = { a: nonEmptyStr(), b: nonEmptyStr({ max: 3 }), c: nonEmptyStr({ min: 2 }) };
    expect(encodeErrors({ a: 'x', b: 'abc', c: 'ab' }, schema)).toEqual([]);
    expect(encodeErrors({ a: '', b: '   ', c: 'a' }, schema)).toEqual([
      'a: no puede estar vacío',
      'b: no puede estar vacío',
      'c: debe tener al menos 2 caracteres',
    ]);
    expect(encodeErrors({ a: 'x', b: 'abcd', c: 'ab' }, schema)).toEqual(['b: debe tener como máximo 3 caracteres']);
  });

  it('importe: 2 decimales, no negativo, tope opcional', () => {
    expect(encodeRequest({ a: 10.015, b: 0 }, { a: importe(), b: importe(100) }, 't')).toEqual({
      a: '10.02',
      b: '0.00',
    });
    expect(encodeErrors({ a: -1, b: 100.01 }, { a: importe(), b: importe(100) })).toEqual([
      'a: debe ser mayor o igual a 0',
      'b: debe ser menor o igual a 100',
    ]);
  });

  it('porcentaje: 0 a 100 con 2 decimales', () => {
    expect(encodeRequest({ p: 10.555 }, { p: porcentaje() }, 't')).toEqual({ p: '10.56' });
    expect(encodeErrors({ p: 100.5 }, { p: porcentaje() })).toEqual(['p: debe ser menor o igual a 100']);
    expect(encodeErrors({ p: -0.5 }, { p: porcentaje() })).toEqual(['p: debe ser mayor o igual a 0']);
  });
});

describe('encodeRequest: casos borde', () => {
  it('datetime: Date inválido, string inválido y string sin zona horaria', () => {
    expect(encodeErrors({ d: new Date('x') }, { d: datetime() })).toEqual(['d: fecha/hora inválida']);
    expect(encodeErrors({ d: '2026-13-01T10:00:00-03:00' }, { d: datetime() })).toHaveLength(1);
    expect(encodeErrors({ d: '01/11/2026 10:00' }, { d: datetime() })).toHaveLength(1);
    // Sin zona horaria se envía tal cual (el servicio la interpreta como hora local de ARCA).
    expect(encodeRequest({ d: '2026-11-01T10:00:00' }, { d: datetime() }, 't')).toEqual({ d: '2026-11-01T10:00:00' });
    // xsd:dateTime exige los segundos.
    expect(encodeErrors({ d: '2026-11-01T08:30' }, { d: datetime() })).toHaveLength(1);
    expect(encodeErrors({ d: '2026-11-01T08:30-03:00' }, { d: datetime() })).toHaveLength(1);
  });

  it('list/wrapped: maxItems en requests', () => {
    expect(encodeErrors({ l: ['a', 'b', 'c'] }, { l: list(str(), 1, 2) })).toEqual([
      'l debe tener como máximo 2 elemento(s)',
    ]);
    expect(encodeRequest({ l: ['a', 'b'] }, { l: wrapped('x', str(), 1, 2) }, 't')).toEqual({ l: { x: ['a', 'b'] } });
  });

  it('str rechaza caracteres de control que XML 1.0 no admite (tab, LF y CR sí)', () => {
    expect(encodeErrors({ s: 'a\u0000b' }, { s: str() })).toEqual(['s: tiene caracteres de control que XML no admite']);
    expect(encodeErrors({ s: 'a\u001Fb' }, { s: str() })).toHaveLength(1);
    expect(encodeRequest({ s: 'a\tb\nc\rd' }, { s: str() }, 't')).toEqual({ s: 'a\tb\nc\rd' });
  });

  it('base64 tiene que ser string', () => {
    expect(encodeRequest({ b: 'QUJD' }, { b: base64() }, 't')).toEqual({ b: 'QUJD' });
    expect(encodeErrors({ b: Buffer.from('x') }, { b: base64() })).toEqual(['b: debe ser un string base64']);
  });

  it('dec con max', () => {
    expect(encodeErrors({ n: 10.006 }, { n: dec(2, undefined, 10) })).toEqual(['n: debe ser menor o igual a 10']);
    expect(encodeRequest({ n: 10.004 }, { n: dec(2, undefined, 10) }, 't')).toEqual({ n: '10.00' });
  });

  it('un request que no es un objeto', () => {
    expect(encodeErrors('hola', { a: str() })).toEqual(['el request debe ser un objeto']);
    expect(encodeErrors([1], { a: str() })).toEqual(['el request debe ser un objeto']);
  });
});

describe('decodeResponse: casos borde', () => {
  it('bool acepta 1/0 además de true/false; siNo solo S/N', () => {
    const r = decodeResponse<Record<string, unknown>>(
      { a: '1', b: '0', c: 'true', d: 'S' },
      { a: bool(), b: bool(), c: bool(), d: siNo() },
      'r',
    );
    expect(r).toEqual({ a: true, b: false, c: true, d: true });
    expect(() => decodeResponse({ d: '1' }, { d: siNo() }, 'r')).toThrow(/r\.d no es S\/N/);
  });

  it('custom decode que llama a fail lanza ArcaResponseError con la ruta', () => {
    const schema = {
      x: custom(
        (v) => v,
        (text, fail) => (text.length === 3 ? text : fail('debe tener 3 caracteres')),
      ),
    };
    expect(decodeResponse({ x: 'abc' }, schema, 'r')).toEqual({ x: 'abc' });
    expect(() => decodeResponse({ x: 'abcd' }, schema, 'r')).toThrow(ArcaResponseError);
    expect(() => decodeResponse({ x: 'abcd' }, schema, 'r')).toThrow(
      'Respuesta inválida: r.x: debe tener 3 caracteres',
    );
  });

  it("kind: 'emision' hace el error por defecto incierto; error tiene prioridad", () => {
    const schema = { n: dec(2) };
    const consulta = (() => {
      try {
        decodeResponse({ n: 'x' }, schema, 'r');
      } catch (e) {
        return e as ArcaResponseError;
      }
    })();
    expect(consulta).toMatchObject({ uncertain: false });

    const emision = (() => {
      try {
        decodeResponse({ n: 'x' }, schema, 'r', { kind: 'emision' });
      } catch (e) {
        return e as ArcaResponseError;
      }
    })();
    expect(emision).toBeInstanceOf(ArcaResponseError);
    expect(emision).toMatchObject({ uncertain: true });

    class Propio extends Error {}
    expect(() => decodeResponse({ n: 'x' }, schema, 'r', { kind: 'emision', error: (m) => new Propio(m) })).toThrow(
      Propio,
    );
  });
});

describe('str: texto que XML no admite', () => {
  it('rechaza surrogates UTF-16 sueltos y acepta pares válidos (emoji)', () => {
    expect(encodeErrors({ s: 'a\uD800b' }, { s: str() })).toHaveLength(1);
    expect(encodeErrors({ s: 'a\uDC00' }, { s: str() })).toHaveLength(1);
    expect(encodeRequest({ s: 'ok 😀' }, { s: str() }, 't')).toEqual({ s: 'ok 😀' });
  });

  it('maxItems también con opt() y sin tope', () => {
    expect(encodeErrors({ l: [1, 2] }, { l: opt(list(int(), 1, 1)) })).toEqual([
      'l debe tener como máximo 1 elemento(s)',
    ]);
    expect(encodeErrors({}, { l: opt(wrapped('x', int(), 1, 1)) })).toEqual([]);
    expect(encodeRequest({ l: [1, 2, 3] }, { l: list(int()) }, 't')).toEqual({ l: [1, 2, 3] });
  });
});
