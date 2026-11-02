import { describe, expect, it } from 'vitest';
import { ArcaResponseError, ArcaValidationError, parseXml } from '../src/index.js';
import {
  bool,
  choice,
  custom,
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
  roundHalfUp,
  siNo,
  str,
  wrapped,
  xml,
} from '../src/schema.js';
import { double } from '../src/schema.js';

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

describe('schema v2', () => {
  it('roundHalfUp redondea sobre el valor decimal escrito', () => {
    expect(roundHalfUp(8.575, 2)).toBe(8.58);
    expect(roundHalfUp(1.005, 2)).toBe(1.01);
    expect(roundHalfUp(-8.575, 2)).toBe(-8.58);
    expect(roundHalfUp(-0.001, 2)).toBe(0);
    expect(roundHalfUp(1e-7, 6)).toBe(0);
    expect(encodeRequest({ a: 8.575 }, { a: dec(2) }, 't')).toEqual({ a: '8.58' });
  });

  it('siNo: boolean en la API, S/N en el XML', () => {
    expect(encodeRequest({ a: true, b: false }, { a: siNo(), b: siNo() }, 't')).toEqual({ a: 'S', b: 'N' });
    expect(decodeResponse({ a: 'S', b: 'N' }, { a: siNo(), b: siNo() }, 'r')).toEqual({ a: true, b: false });
    expect(() => decodeResponse({ a: 'X' }, { a: siNo() }, 'r')).toThrow(ArcaResponseError);
    expect(decodeResponse({ a: 'true' }, { a: bool() }, 'r')).toEqual({ a: true });
  });

  it('double: sin redondeo', () => {
    expect(encodeRequest({ a: 1.23456 }, { a: double(0) }, 't')).toEqual({ a: 1.23456 });
    expect(decodeResponse({ a: '1.5' }, { a: double() }, 'r')).toEqual({ a: 1.5 });
  });

  it('xml(): nombre distinto en el XML, errores con el nombre de la API', () => {
    const s = { cuitEmisor: xml('CUITEmisor', cuit({ decodeAs: 'string' })) };
    expect(encodeRequest({ cuitEmisor: '20123456786' }, s, 't')).toEqual({ CUITEmisor: '20123456786' });
    expect(decodeResponse({ CUITEmisor: '20123456786' }, s, 'r')).toEqual({ cuitEmisor: '20123456786' });
    try {
      encodeRequest({ cuitEmisor: 'x' }, s, 't');
      expect.unreachable();
    } catch (e) {
      expect((e as ArcaValidationError).field).toBe('cuitEmisor');
    }
  });

  it('custom(): codificador y decodificador propios', () => {
    const digitos = custom(
      (v, fail) => {
        const d = String(v).replace(/-/g, '');
        return /^\d+$/.test(d) ? d : fail('debe tener sólo dígitos');
      },
      (t, fail) => (/^\d+$/.test(t) ? t : fail('no son dígitos')),
    );
    expect(encodeRequest({ a: '20-123' }, { a: digitos }, 't')).toEqual({ a: '20123' });
    expect(() => encodeRequest({ a: 'x' }, { a: digitos }, 't')).toThrow(/sólo dígitos/);
    expect(() => decodeResponse({ a: 'x' }, { a: digitos }, 'r')).toThrow(/no son dígitos/);
  });

  it('must() rechaza el valor vacío; opt(str()) lo conserva', () => {
    expect(() => decodeResponse({ a: '' }, { a: must(str()) }, 'r')).toThrow(/vacío/);
    expect(decodeResponse({ a: '' }, { a: opt(str()) }, 'r')).toEqual({ a: '' });
  });

  it('enteros y enums se validan al decodificar', () => {
    expect(() => decodeResponse({ a: '1.5' }, { a: int() }, 'r')).toThrow(/no es entero/);
    expect(() => decodeResponse({ a: 'X' }, { a: str({ values: ['A', 'R'] }) }, 'r')).toThrow(/valor inesperado/);
  });

  it('xsi:nil cuenta como ausente (también en listas)', () => {
    const nil = { '@_nil': 'true' };
    expect(decodeResponse({ a: nil }, { a: opt(str()) }, 'r')).toEqual({});
    expect(() => decodeResponse({ a: nil }, { a: must(str()) }, 'r')).toThrow(/falta/);
    expect(decodeResponse({ l: ['x', nil, 'y'] }, { l: list(str(), 0) }, 'r')).toEqual({ l: ['x', 'y'] });
    expect(decodeResponse({ l: nil }, { l: list(str(), 0) }, 'r', { emptyLists: 'omit' })).toEqual({ l: [] });
  });

  it('must() en listas exige el elemento/contenedor', () => {
    expect(() => decodeResponse({}, { l: must(wrapped('item', str(), 0)) }, 'r')).toThrow(/falta r.l/);
    expect(decodeResponse({ l: '' }, { l: must(wrapped('item', str(), 0)) }, 'r')).toEqual({ l: [] });
  });

  it('objeto vacío: opcional se omite, obligatorio valida sus hijos', () => {
    const s = { o: obj({ a: must(str()) }) };
    expect(decodeResponse({ o: '' }, s, 'r')).toEqual({});
    expect(() => decodeResponse({ o: '' }, { o: must(obj({ a: must(str()) })) }, 'r')).toThrow(/falta r.o.a/);
  });

  it('emptyLists: omit', () => {
    expect(decodeResponse({}, { l: list(str(), 0) }, 'r', { emptyLists: 'omit' })).toEqual({});
  });
});

describe('schema: choice, patternMessage y orden de errores', () => {
  const Req = { idCtaCte: choice({ codCtaCte: id(), idFactura: obj({ nro: int() }) }) };

  it('choice en un request: exactamente una opción', () => {
    expect(encodeRequest({ idCtaCte: { codCtaCte: '123' } }, Req, 't')).toEqual({ idCtaCte: { codCtaCte: '123' } });
    expect(() => encodeRequest({ idCtaCte: {} }, Req, 't')).toThrow(
      /idCtaCte: debe tener exactamente uno de codCtaCte, idFactura/,
    );
    expect(() => encodeRequest({ idCtaCte: { codCtaCte: '1', idFactura: { nro: 1 } } }, Req, 't')).toThrow(
      /exactamente uno/,
    );
  });

  it('choice en una respuesta: al menos una opción', () => {
    const Resp = { info: opt(choice({ a: str(), b: str() })) };
    expect(decodeResponse({ info: { b: 'x' } }, Resp, 'r')).toEqual({ info: { b: 'x' } });
    expect(decodeResponse({}, Resp, 'r')).toEqual({});
    expect(() => decodeResponse({ info: { c: 'x' } }, Resp, 'r')).toThrow(/falta r.info.a\|b/);
    expect(() => decodeResponse({ info: '' }, Resp, 'r')).toThrow(/falta r.info.a\|b/);
  });

  it('patternMessage reemplaza el mensaje del pattern', () => {
    const s = { nombre: str({ pattern: /\S/, patternMessage: 'no puede estar vacío' }) };
    expect(() => encodeRequest({ nombre: ' ' }, s, 't')).toThrow(
      'Validación de t fallida: nombre: no puede estar vacío',
    );
  });

  it('los errores de extraCheck se intercalan según el orden de los campos', () => {
    const s = { a: int(), b: int(), c: int() };
    const err = (() => {
      try {
        encodeRequest({ a: 'x', b: 1, c: 'z' }, s, 't', (_input, errors) => {
          errors.push({ field: 'b', message: 'b: regla extra', value: 1 });
        });
      } catch (e) {
        return e as ArcaValidationError;
      }
    })();
    expect(err?.details.map((d) => d.field)).toEqual(['a', 'b', 'c']);
  });
});
