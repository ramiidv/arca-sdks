import { describe, it, expect } from 'vitest';
import { ArcaValidationError } from '@ramiidv/arca-common';
import { cuit, date, id, type Field } from '@ramiidv/arca-common/schema';
import { REQ, encode, importe, importePositivo, porcentaje } from '../src/schemas.js';

/** Codifica un solo campo con el tipo `f` (como lo haría un request con ese elemento). */
const enc = (f: Field, v: unknown, name = 'x') => encode({ [name]: v }, { [name]: f }, 'test')[name];

describe('validación local', () => {
  it('cuit usa el dígito verificador y devuelve 11 dígitos', () => {
    expect(enc(cuit(), '20-12345678-6')).toBe('20123456786');
    expect(enc(cuit(), 20123456786)).toBe('20123456786');
    const err = (() => {
      try {
        enc(cuit(), '20123456780', 'cuitContraparte');
      } catch (e) {
        return e as ArcaValidationError;
      }
    })();
    expect(err).toBeInstanceOf(ArcaValidationError);
    expect(err?.field).toBe('cuitContraparte');
  });

  it('date devuelve xsd:date y rechaza fechas inexistentes', () => {
    expect(enc(date(), '20261101')).toBe('2026-11-01');
    expect(enc(date(), '2026-11-01')).toBe('2026-11-01');
    expect(() => enc(date(), '2026-02-30')).toThrow(ArcaValidationError);
    expect(() => enc(date(), 20261101)).toThrow(ArcaValidationError);
  });

  it('importe redondea a 2 decimales y rechaza NaN/Infinity/negativos', () => {
    expect(enc(importePositivo(), 10)).toBe('10.00');
    expect(enc(importePositivo(), 1.005 + 1e-9)).toBe('1.01');
    expect(enc(importe(), -5)).toBe('-5.00');
    expect(() => enc(importePositivo(), Number.NaN)).toThrow(ArcaValidationError);
    expect(() => enc(importePositivo(), Infinity)).toThrow(ArcaValidationError);
    expect(() => enc(importePositivo(), -1)).toThrow(/mayor o igual a 0/);
    expect(() => enc(importePositivo(), 1e14)).toThrow(/menor o igual a 9999999999999.99/);
  });

  it('porcentaje 0..100', () => {
    expect(enc(porcentaje(), 3.5)).toBe('3.50');
    expect(() => enc(porcentaje(), 101)).toThrow(ArcaValidationError);
  });

  it('long (codCtaCte) acepta number o string de dígitos', () => {
    expect(enc(id(), 123)).toBe('123');
    // Se envía tal cual: "00123" es un xsd:long válido.
    expect(enc(id(), '00123')).toBe('00123');
    expect(() => enc(id(), 0)).toThrow(ArcaValidationError);
    expect(() => enc(id(), '12a')).toThrow(ArcaValidationError);
    expect(() => enc(id(), 1.5)).toThrow(ArcaValidationError);
  });

  it('idCtaCte valida la factura', () => {
    expect(() =>
      encode(
        { idCtaCte: { idFactura: { cuitEmisor: '30712345671', codTipoCmp: 201, ptoVta: 0, nroCmp: 1 } } },
        REQ.idCtaCte,
        'test',
      ),
    ).toThrow(/ptoVta/);
    expect(() =>
      encode(
        { idCtaCte: { idFactura: { cuitEmisor: '30712345671', codTipoCmp: 201, ptoVta: 1, nroCmp: 100000000 } } },
        REQ.idCtaCte,
        'test',
      ),
    ).toThrow(/nroCmp/);
  });

  it('reporta todos los errores juntos, con la ruta de cada campo', () => {
    const err = (() => {
      try {
        encode(
          {
            idCtaCte: { codCtaCte: 1 },
            saldoAceptado: -1,
            codMoneda: 'PES',
            cotizacionMonedaUlt: 0,
            retenciones: [{ codTipo: 1, importe: 1, porcentaje: 200 }],
          },
          REQ.aceptarFECred,
          'aceptarFECred',
        );
      } catch (e) {
        return e as ArcaValidationError;
      }
    })();
    expect(err).toBeInstanceOf(ArcaValidationError);
    expect(err?.details.map((d) => d.field)).toEqual([
      'retenciones[0].porcentaje',
      'saldoAceptado',
      'cotizacionMonedaUlt',
    ]);
  });

  it('rechaza campos que no existen en el XSD', () => {
    expect(() => encode({ cuitConsultada: 20123456786, otro: 1 }, REQ.consultarObligadoRecepcion, 'test')).toThrow(
      /otro: campo desconocido/,
    );
  });

  it('CBU: 22 dígitos y dígitos verificadores', () => {
    const base = { idCtaCte: { codCtaCte: 1 }, saldoAceptado: 1, codMoneda: 'PES', cotizacionMonedaUlt: 1 };
    expect(encode({ ...base, cbuComprador: '2850590940090418135201' }, REQ.aceptarFECred, 't').CBUComprador).toBe(
      '2850590940090418135201',
    );
    expect(() => encode({ ...base, cbuComprador: '2850590940090418135202' }, REQ.aceptarFECred, 't')).toThrow(
      /cbuComprador/,
    );
  });
});
