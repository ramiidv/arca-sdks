import { describe, expect, it } from 'vitest';
import { CbteTipo, Moneda, TributoTipo, isFacturaFCE, isTipoA, isUmedSinCantidad } from '../src/constants.js';

describe('Moneda', () => {
  it('coincide con la tabla de monedas de ARCA (FEParamGetTiposMonedas)', () => {
    // 029 Guaraní y 031 Peso boliviano: estaban invertidos hasta la 6.0.
    expect({ ...Moneda }).toEqual({
      PESOS: 'PES',
      DOLARES: 'DOL',
      EUROS: '060',
      REALES: '012',
      PESOS_URUGUAYOS: '011',
      PESOS_CHILENOS: '033',
      GUARANIES: '029',
      BOLIVIANOS: '031',
      PESOS_COLOMBIANOS: '032',
      PESOS_MEXICANOS: '010',
      LIBRAS_ESTERLINAS: '021',
      YENES: '019',
      FRANCOS_SUIZOS: '009',
      DOLARES_CANADIENSES: '018',
      YUANES: '064',
    });
  });
});

describe('TributoTipo', () => {
  it('incluye 13 - Percepción de IVA No Categorizado (validaciones 10067/10283)', () => {
    expect(TributoTipo.PERCEP_IVA_NO_CATEGORIZADO).toBe(13);
  });
});

describe('clases de comprobante', () => {
  it('isTipoA: clase A y ALEY de la validación 10007', () => {
    const a = [1, 2, 3, 4, 5, 34, 39, 51, 52, 53, 54, 60, 63, 201, 202, 203];
    for (const t of a) expect(isTipoA(t)).toBe(true);
    for (const t of [6, 11, 19, 35, 49, 61, 64, 206, 211]) expect(isTipoA(t)).toBe(false);
  });

  it('isFacturaFCE: 201, 206 y 211', () => {
    expect([201, 206, 211].every(isFacturaFCE)).toBe(true);
    expect(isFacturaFCE(CbteTipo.FCE_NOTA_CREDITO_A)).toBe(false);
  });

  it('isUmedSinCantidad: unidades 0, 97 y 99 de WSFEX', () => {
    expect([0, 97, 99].every(isUmedSinCantidad)).toBe(true);
    expect(isUmedSinCantidad(7)).toBe(false);
  });
});
