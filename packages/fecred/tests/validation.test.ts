import { describe, it, expect } from 'vitest';
import { ArcaValidationError } from '@ramiidv/arca-common';
import { cuit, date, id, type Field, type Schema } from '@ramiidv/arca-common/schema';
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

  it('porcentaje: mayor a 0 y menor a 100', () => {
    expect(enc(porcentaje(), 3.5)).toBe('3.50');
    expect(enc(porcentaje(), 0.01)).toBe('0.01');
    expect(enc(porcentaje(), 99.99)).toBe('99.99');
    expect(() => enc(porcentaje(), 0)).toThrow(ArcaValidationError);
    expect(() => enc(porcentaje(), 100)).toThrow(ArcaValidationError);
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
            importeTotalRetPesos: 1,
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
      'cotizacionMonedaUlt', // XSD: mayor a 0
      'cotizacionMonedaUlt', // manual: con PES, 1 (2007)
    ]);
  });

  it('rechaza campos que no existen en el XSD', () => {
    expect(() =>
      encode(
        { cuitConsultada: 20123456786, fechaEmision: '2026-11-01', otro: 1 },
        REQ.consultarMontoObligadoRecepcion,
        'test',
      ),
    ).toThrow(/otro: campo desconocido/);
  });

  it('CBU: 22 dígitos y dígitos verificadores', () => {
    const base = { idCtaCte: { codCtaCte: 1 }, saldoAceptado: 1, codMoneda: 'PES', cotizacionMonedaUlt: 1 };
    const conCBU = { ...base, informaCBU: true };
    expect(encode({ ...conCBU, cbuComprador: '2850590940090418135201' }, REQ.aceptarFECred, 't').CBUComprador).toBe(
      '2850590940090418135201',
    );
    expect(() => encode({ ...conCBU, cbuComprador: '2850590940090418135202' }, REQ.aceptarFECred, 't')).toThrow(
      /cbuComprador/,
    );
  });

  it('reglas del manual v2.0.3 en aceptarFECred', () => {
    const base = { idCtaCte: { codCtaCte: 1 }, saldoAceptado: 100, codMoneda: 'PES', cotizacionMonedaUlt: 1 };
    const fields = (input: object) => {
      try {
        encode(input, REQ.aceptarFECred, 'aceptarFECred');
        return [];
      } catch (e) {
        return (e as ArcaValidationError).details.map((d) => d.message);
      }
    };
    const cbu = '2850590940090418135201';
    expect(fields({ ...base, cbuComprador: cbu })).toEqual([expect.stringMatching(/\(12013\)$/)]);
    expect(fields({ ...base, informaCBU: true })).toEqual([expect.stringMatching(/\(12013\)$/)]);
    expect(fields({ ...base, informaCBU: true, cbuComprador: cbu, saldoAceptado: 0 })).toEqual([
      expect.stringMatching(/\(2016\)$/),
    ]);
    expect(fields({ ...base, retenciones: [{ codTipo: 1, importe: 1, porcentaje: 3 }] })).toEqual([
      expect.stringMatching(/\(12007\)$/),
    ]);
    expect(fields({ ...base, importeCancelado: 10 })).toEqual([expect.stringMatching(/\(12008\)$/)]);
    expect(
      fields({
        ...base,
        importeCancelado: 10,
        tipoCancelacion: 'TOT',
        formasCancelacion: [
          { codigo: 1, descripcion: 'Transferencia' },
          { codigo: 1, descripcion: 'Transferencia' },
        ],
      }),
    ).toEqual([expect.stringMatching(/\(4002\)$/)]);
    expect(fields({ ...base, cotizacionMonedaUlt: 2 })).toEqual([expect.stringMatching(/\(2007, 12000\)$/)]);
    expect(
      fields({ ...base, importeTotalRetPesos: 3, retenciones: [{ codTipo: 1, importe: 3, porcentaje: 100 }] }),
    ).toEqual([expect.stringMatching(/porcentaje/)]);
  });

  it('aceptarFECred: casos límite de las reglas del manual', () => {
    const base = { idCtaCte: { codCtaCte: 1 }, saldoAceptado: 100, codMoneda: 'PES', cotizacionMonedaUlt: 1 };
    const cbu = '2850590940090418135201';
    const messages = (input: object, schema: Schema = REQ.aceptarFECred) => {
      try {
        encode(input, schema, 'test');
        return [];
      } catch (e) {
        return (e as ArcaValidationError).details.map((d) => d.message);
      }
    };
    // informaCBU false sin CBU es válido; false con CBU, no.
    expect(messages({ ...base, informaCBU: false })).toEqual([]);
    expect(messages({ ...base, informaCBU: false, cbuComprador: cbu })).toEqual([expect.stringMatching(/\(12013\)$/)]);
    // CBU con cancelación total.
    expect(
      messages({
        ...base,
        informaCBU: true,
        cbuComprador: cbu,
        importeCancelado: 100,
        tipoCancelacion: 'TOT',
        formasCancelacion: [{ codigo: 1, descripcion: 'Transferencia' }],
      }),
    ).toEqual([expect.stringMatching(/\(12012\)$/)]);
    // Un importe 0 cuenta como "no informado" (las listas vacías ya las rechaza el schema).
    expect(messages({ ...base, importeTotalRetPesos: 0, importeCancelado: 0 })).toEqual([]);
    expect(messages({ ...base, importeTotalRetPesos: 5 })).toEqual([expect.stringMatching(/\(12007\)$/)]);
    // Las reglas de aceptación corren aunque falte saldoAceptado (que informa el schema).
    const { saldoAceptado: _, ...sinSaldo } = base;
    expect(messages({ ...sinSaldo, informaCBU: true })).toEqual([
      expect.stringMatching(/^saldoAceptado/),
      expect.stringMatching(/\(12013\)$/),
    ]);
    // Sin cotización solo informa el faltante (no la regla de PES); en otra moneda no hay regla.
    const { cotizacionMonedaUlt: __, ...sinCotizacion } = base;
    expect(messages(sinCotizacion)).toEqual([expect.stringMatching(/^cotizacionMonedaUlt/)]);
    expect(messages({ ...base, codMoneda: 'DOL', cotizacionMonedaUlt: 1000 })).toEqual([]);
    // Las reglas de aceptarFECred no se aplican a otras operaciones.
    expect(
      messages(
        { idCtaCte: { codCtaCte: 1 }, formasCancelacion: [{ codigo: 1, descripcion: 'T' }], importeCancelacion: 1 },
        REQ.informarCancelacionTotalFECred,
      ),
    ).toEqual([]);
  });

  it('códigos repetidos en ajustes, retenciones y motivos de rechazo', () => {
    const motivo = { codMotivo: 1, descMotivo: 'x', justificacion: 'y' };
    expect(() => encode({ idCtaCte: { codCtaCte: 1 }, motivos: [motivo, motivo] }, REQ.rechazarFECred, 't')).toThrow(
      /motivos\[1\]\.codMotivo: código repetido \(3001\)/,
    );
    const base = { idCtaCte: { codCtaCte: 1 }, saldoAceptado: 100, codMoneda: 'DOL', cotizacionMonedaUlt: 1000 };
    expect(() =>
      encode(
        {
          ...base,
          ajustesOperacion: [
            { codigo: 1, importe: 1 },
            { codigo: 1, importe: -1 },
          ],
        },
        REQ.aceptarFECred,
        't',
      ),
    ).toThrow(/\(2013\)/);
    expect(() =>
      encode(
        {
          ...base,
          importeTotalRetPesos: 2,
          retenciones: [
            { codTipo: 2, importe: 1, porcentaje: 3 },
            { codTipo: 2, importe: 1, porcentaje: 3 },
          ],
        },
        REQ.aceptarFECred,
        't',
      ),
    ).toThrow(/\(2003\)/);
  });
});
