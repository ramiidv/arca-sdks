import { describe, expect, it } from 'vitest';
import { ArcaValidationError, generarUrlQR, QR_URL } from '../src/index.js';

const decode = (url: string) => JSON.parse(Buffer.from(url.split('?p=')[1], 'base64').toString());

const base = {
  fecha: '2026-03-28',
  cuit: 20123456786,
  ptoVta: 1,
  tipoCmp: 6,
  nroCmp: 150,
  importe: 121,
  moneda: 'PES',
  ctz: 1,
  tipoDocRec: 99,
  nroDocRec: 0,
  codAut: 74512345678901,
};

describe('generarUrlQR', () => {
  it('URL de la especificación vigente (arca.gob.ar) con el JSON versión 1', () => {
    const url = generarUrlQR(base);
    expect(QR_URL).toBe('https://www.arca.gob.ar/fe/qr/');
    expect(url).toMatch(/^https:\/\/www\.arca\.gob\.ar\/fe\/qr\/\?p=.+$/);
    expect(decode(url)).toEqual({
      ver: 1,
      fecha: '2026-03-28',
      cuit: 20123456786,
      ptoVta: 1,
      tipoCmp: 6,
      nroCmp: 150,
      importe: 121,
      moneda: 'PES',
      ctz: 1,
      tipoDocRec: 99,
      nroDocRec: 0,
      tipoCodAut: 'E',
      codAut: 74512345678901,
    });
  });

  it('reproduce el ejemplo de la especificación', () => {
    const url = generarUrlQR(
      {
        fecha: '20201013',
        cuit: '30-00000000-7',
        ptoVta: 10,
        tipoCmp: 1,
        nroCmp: 94,
        importe: 12100,
        moneda: 'DOL',
        ctz: 65,
        tipoDocRec: 80,
        nroDocRec: '20000000001',
        codAut: '70417054367476',
      },
      { baseUrl: 'https://www.afip.gob.ar/fe/qr/' },
    );
    // Texto codificado del ejemplo oficial (sin los saltos de línea del PDF).
    expect(url).toBe(
      'https://www.afip.gob.ar/fe/qr/?p=eyJ2ZXIiOjEsImZlY2hhIjoiMjAyMC0xMC0xMyIsImN1aXQiOjMwMDAwMDAwMDA3LCJwdG9WdGEiOjEwLCJ0aXBvQ21wIjoxLCJucm9DbXAiOjk0LCJpbXBvcnRlIjoxMjEwMCwibW9uZWRhIjoiRE9MIiwiY3R6Ijo2NSwidGlwb0RvY1JlYyI6ODAsIm5yb0RvY1JlYyI6MjAwMDAwMDAwMDEsInRpcG9Db2RBdXQiOiJFIiwiY29kQXV0Ijo3MDQxNzA1NDM2NzQ3Nn0=',
    );
  });

  it('convierte la fecha YYYYMMDD o Date a YYYY-MM-DD y el CAE string a número', () => {
    const p = decode(generarUrlQR({ ...base, fecha: '20261030', codAut: '04512345678901' }));
    expect(p.fecha).toBe('2026-10-30');
    expect(p.codAut).toBe(4512345678901);
    expect(decode(generarUrlQR({ ...base, fecha: new Date('2026-10-30T15:00:00Z') })).fecha).toBe('2026-10-30');
  });

  it('omite tipoDocRec/nroDocRec si no corresponden', () => {
    const { tipoDocRec, nroDocRec, ...sinReceptor } = base;
    const p = decode(generarUrlQR(sinReceptor));
    expect(p).not.toHaveProperty('tipoDocRec');
    expect(p).not.toHaveProperty('nroDocRec');
  });

  it('respeta tipoCodAut=A para CAEA', () => {
    expect(decode(generarUrlQR({ ...base, tipoCodAut: 'A' })).tipoCodAut).toBe('A');
  });

  it('redondea importe a 2 decimales y ctz a 6, mitad al par (como los importes de WSFE)', () => {
    const p = decode(generarUrlQR({ ...base, importe: 1.005, moneda: 'DOL', ctz: 1234.5678905 }));
    expect(p.importe).toBe(1);
    expect(p.ctz).toBe(1234.56789);
    expect(decode(generarUrlQR({ ...base, importe: 1.015, ctz: 1234.5678915 }))).toMatchObject({
      importe: 1.02,
      ctz: 1234.567892,
    });
    expect(() => generarUrlQR({ ...base, ctz: 0.0000001 })).toThrow(/ctz/);
  });

  it('ptoVta hasta 5 dígitos y nroCmp hasta 8', () => {
    expect(decode(generarUrlQR({ ...base, ptoVta: 99999, nroCmp: 99999999 }))).toMatchObject({
      ptoVta: 99999,
      nroCmp: 99999999,
    });
    expect(() => generarUrlQR({ ...base, ptoVta: 100000 })).toThrow(/ptoVta debe tener como máximo 5 dígitos/);
    expect(() => generarUrlQR({ ...base, nroCmp: 100000000 })).toThrow(/nroCmp debe tener como máximo 8 dígitos/);
  });

  it('rechaza fecha inexistente, CAE que no es de 14 dígitos y CUIT inválido', () => {
    expect(() => generarUrlQR({ ...base, fecha: '20261399' })).toThrow(ArcaValidationError);
    expect(() => generarUrlQR({ ...base, codAut: '123' })).toThrow(ArcaValidationError);
    expect(() => generarUrlQR({ ...base, cuit: 20123456789 })).toThrow(ArcaValidationError);
    expect(() => generarUrlQR({ ...base, ptoVta: 0 })).toThrow(ArcaValidationError);
    expect(() => generarUrlQR({ ...base, moneda: '' })).toThrow(ArcaValidationError);
    expect(() => generarUrlQR({ ...base, tipoCodAut: 'X' as 'E' })).toThrow(ArcaValidationError);
    expect(() => generarUrlQR({ ...base, nroDocRec: 'abc' })).toThrow(ArcaValidationError);
  });

  it('largos de la especificación: tipoCmp 3 dígitos, moneda 3 caracteres, tipoDocRec 2 dígitos, 13 enteros', () => {
    expect(() => generarUrlQR({ ...base, tipoCmp: 1000 })).toThrow(/tipoCmp debe tener como máximo 3 dígitos/);
    expect(() => generarUrlQR({ ...base, moneda: 'DOLAR' })).toThrow(/moneda/);
    expect(() => generarUrlQR({ ...base, tipoDocRec: 100 })).toThrow(/tipoDocRec/);
    expect(() => generarUrlQR({ ...base, tipoDocRec: '80' as unknown as number })).toThrow(/tipoDocRec/);
    expect(() => generarUrlQR({ ...base, importe: 1e13 })).toThrow(/importe/);
    expect(() => generarUrlQR({ ...base, ctz: 1e13 })).toThrow(/ctz/);
    expect(decode(generarUrlQR({ ...base, tipoCmp: 201, importe: 9_999_999_999_999.99 }))).toMatchObject({
      tipoCmp: 201,
      importe: 9_999_999_999_999.99,
    });
  });

  it('nroDocRec de hasta 20 dígitos se escribe como número sin perder precisión', () => {
    const url = generarUrlQR({ ...base, tipoDocRec: 91, nroDocRec: '12345678901234567890' });
    const json = Buffer.from(url.split('?p=')[1], 'base64').toString();
    expect(json).toContain('"nroDocRec":12345678901234567890,');
    expect(Buffer.from(generarUrlQR({ ...base, nroDocRec: '0020' }).split('?p=')[1], 'base64').toString()).toContain(
      '"nroDocRec":20,',
    );
    expect(() => generarUrlQR({ ...base, nroDocRec: '123456789012345678901' })).toThrow(/20 dígitos/);
    expect(() => generarUrlQR({ ...base, nroDocRec: 2 ** 53 })).toThrow(/nroDocRec/);
  });
});

describe('generarUrlQR: nroDocRec', () => {
  const json = (url: string) => Buffer.from(url.split('?p=')[1], 'base64').toString();

  it('como number se escribe tal cual; ceros a la izquierda de un string se quitan', () => {
    expect(json(generarUrlQR({ ...base, tipoDocRec: 80, nroDocRec: 20123456786 }))).toContain(
      '"nroDocRec":20123456786,',
    );
    expect(json(generarUrlQR({ ...base, tipoDocRec: 99, nroDocRec: '000' }))).toContain('"nroDocRec":0,');
    expect(json(generarUrlQR({ ...base, tipoDocRec: 99, nroDocRec: 0 }))).toContain('"nroDocRec":0,');
  });

  it('string vacío o solo espacios: no se incluye', () => {
    expect(json(generarUrlQR({ ...base, nroDocRec: '   ' }))).not.toContain('nroDocRec');
  });

  it('rechaza negativos, decimales, signos y un number fuera de rango seguro', () => {
    for (const nroDocRec of [-1, 1.5, '-1', '1.5', '1e5', '12 34']) {
      expect(() => generarUrlQR({ ...base, nroDocRec })).toThrow(ArcaValidationError);
    }
    expect(() => generarUrlQR({ ...base, nroDocRec: Number.MAX_SAFE_INTEGER + 2 })).toThrow(/como string/);
  });
});
