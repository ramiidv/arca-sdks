import { describe, it, expect } from 'vitest';
import { ArcaValidationError } from '@ramiidv/arca-common';
import {
  cuitParam,
  dateParam,
  idCtaCteParam,
  importeParam,
  longParam,
  porcentajeParam,
} from '../src/validation.js';

describe('validación local', () => {
  it('cuitParam usa el dígito verificador y devuelve 11 dígitos', () => {
    expect(cuitParam('20-12345678-6', 'cuit')).toBe('20123456786');
    expect(cuitParam(20123456786, 'cuit')).toBe('20123456786');
    const err = (() => {
      try {
        cuitParam('20123456780', 'cuitContraparte');
      } catch (e) {
        return e as ArcaValidationError;
      }
    })();
    expect(err).toBeInstanceOf(ArcaValidationError);
    expect(err?.field).toBe('cuitContraparte');
  });

  it('dateParam devuelve xsd:date y rechaza fechas inexistentes', () => {
    expect(dateParam('20261101', 'f')).toBe('2026-11-01');
    expect(dateParam('2026-11-01', 'f')).toBe('2026-11-01');
    expect(() => dateParam('2026-02-30', 'f')).toThrow(ArcaValidationError);
    expect(() => dateParam(20261101, 'f')).toThrow(ArcaValidationError);
  });

  it('importeParam redondea a 2 decimales y rechaza NaN/Infinity/negativos', () => {
    expect(importeParam(10, 'x')).toBe('10.00');
    expect(importeParam(1.005 + 1e-9, 'x')).toBe('1.01');
    expect(importeParam(-5, 'x', true)).toBe('-5.00');
    expect(() => importeParam(Number.NaN, 'x')).toThrow(ArcaValidationError);
    expect(() => importeParam(Infinity, 'x')).toThrow(ArcaValidationError);
    expect(() => importeParam(-1, 'x')).toThrow(/negativo/);
    expect(() => importeParam(1e14, 'x')).toThrow(/máximo/);
  });

  it('porcentajeParam 0..100', () => {
    expect(porcentajeParam(3.5, 'p')).toBe('3.5');
    expect(() => porcentajeParam(101, 'p')).toThrow(ArcaValidationError);
  });

  it('longParam acepta number o string de dígitos', () => {
    expect(longParam(123, 'c')).toBe('123');
    expect(longParam('00123', 'c')).toBe('123');
    expect(() => longParam(0, 'c')).toThrow(ArcaValidationError);
    expect(() => longParam('12a', 'c')).toThrow(ArcaValidationError);
    expect(() => longParam(1.5, 'c')).toThrow(ArcaValidationError);
  });

  it('idCtaCteParam valida la factura', () => {
    expect(() =>
      idCtaCteParam({ idFactura: { cuitEmisor: '30712345671', codTipoCmp: 201, ptoVta: 0, nroCmp: 1 } }),
    ).toThrow(/ptoVta/);
    expect(() =>
      idCtaCteParam({ idFactura: { cuitEmisor: '30712345671', codTipoCmp: 201, ptoVta: 1, nroCmp: 100000000 } }),
    ).toThrow(/nroCmp/);
  });
});
