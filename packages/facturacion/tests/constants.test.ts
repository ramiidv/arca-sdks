import { describe, expect, it } from 'vitest';
import {
  CbteTipo,
  Moneda,
  NOTA_CREDITO_MAP,
  NOTA_DEBITO_MAP,
  CBTES_ASOCIABLES,
  TributoTipo,
  isFacturaFCE,
  isNotaCredito,
  isNotaCreditoODebito,
  isNotaDebito,
  isTipoA,
  isTipoB,
  isUmedSinCantidad,
} from '../src/constants.js';

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

describe('NOTA_CREDITO_MAP / NOTA_DEBITO_MAP (validación 10040)', () => {
  it('infieren la nota de la clase también desde notas, recibos y FCE', () => {
    expect(NOTA_CREDITO_MAP[CbteTipo.FACTURA_A]).toBe(CbteTipo.NOTA_CREDITO_A);
    expect(NOTA_CREDITO_MAP[CbteTipo.NOTA_DEBITO_A]).toBe(CbteTipo.NOTA_CREDITO_A);
    expect(NOTA_CREDITO_MAP[CbteTipo.RECIBO_B]).toBe(CbteTipo.NOTA_CREDITO_B);
    expect(NOTA_CREDITO_MAP[CbteTipo.RECIBO_C]).toBe(CbteTipo.NOTA_CREDITO_C);
    expect(NOTA_CREDITO_MAP[CbteTipo.FCE_NOTA_DEBITO_B]).toBe(CbteTipo.FCE_NOTA_CREDITO_B);
    expect(NOTA_DEBITO_MAP[CbteTipo.FCE_NOTA_CREDITO_C]).toBe(CbteTipo.FCE_NOTA_DEBITO_C);
    expect(NOTA_DEBITO_MAP[CbteTipo.LIQUIDACION_B]).toBe(CbteTipo.NOTA_DEBITO_B);
    expect(NOTA_CREDITO_MAP[CbteTipo.FACTURA_E]).toBe(CbteTipo.NOTA_CREDITO_E);
    // Los remitos se asocian a facturas, pero no se anulan con una nota.
    expect(NOTA_CREDITO_MAP[88]).toBeUndefined();
    expect(NOTA_CREDITO_MAP[CbteTipo.COMPRA_BIENES_USADOS]).toBeUndefined();
  });

  it('cubren todo comprobante de WSFEv1 asociable a una nota, con una nota que lo asocia', () => {
    for (const map of [NOTA_CREDITO_MAP, NOTA_DEBITO_MAP]) {
      for (const [original, nota] of Object.entries(map)) {
        if (nota === CbteTipo.NOTA_CREDITO_E || nota === CbteTipo.NOTA_DEBITO_E) continue;
        expect(CBTES_ASOCIABLES[nota]).toContain(Number(original));
        expect(CbteTipo[Number(original)]).toBeDefined();
      }
    }
    expect(NOTA_CREDITO_MAP[CbteTipo.CBTE_A_ANEXO_I_RG1415]).toBe(CbteTipo.NOTA_CREDITO_A);
    expect(NOTA_DEBITO_MAP[CbteTipo.RECIBO_M]).toBe(CbteTipo.NOTA_DEBITO_M);
    expect(NOTA_CREDITO_MAP[CbteTipo.NOTA_CREDITO_C]).toBe(CbteTipo.NOTA_CREDITO_C);
  });

  it('en FCE una NC no asocia otra NC ni una ND otra ND (10157, 10183)', () => {
    expect(NOTA_CREDITO_MAP[CbteTipo.FCE_NOTA_CREDITO_A]).toBeUndefined();
    expect(NOTA_DEBITO_MAP[CbteTipo.FCE_NOTA_DEBITO_C]).toBeUndefined();
    expect(NOTA_DEBITO_MAP[CbteTipo.FCE_NOTA_CREDITO_A]).toBe(CbteTipo.FCE_NOTA_DEBITO_A);
    expect(NOTA_CREDITO_MAP[CbteTipo.FCE_FACTURA_B]).toBe(CbteTipo.FCE_NOTA_CREDITO_B);
  });

  it('isNotaCredito / isNotaDebito no incluyen la clase E (va por WSFEX)', () => {
    expect(isNotaCredito(CbteTipo.NOTA_CREDITO_E)).toBe(false);
    expect(isNotaDebito(CbteTipo.NOTA_DEBITO_E)).toBe(false);
    expect(isNotaCredito(CbteTipo.FCE_NOTA_CREDITO_B)).toBe(true);
    expect(isNotaCredito(CbteTipo.NOTA_DEBITO_A)).toBe(false);
    expect(isNotaDebito(CbteTipo.NOTA_DEBITO_M)).toBe(true);
  });

  it('isNotaCreditoODebito e isTipoB', () => {
    for (const t of [2, 3, 7, 8, 12, 13, 52, 53, 202, 203, 207, 208, 212, 213])
      expect(isNotaCreditoODebito(t)).toBe(true);
    for (const t of [1, 6, 11, 20, 21, 201]) expect(isNotaCreditoODebito(t)).toBe(false);
    for (const t of [6, 7, 8, 9, 10, 35, 40, 61, 64, 206, 207, 208]) expect(isTipoB(t)).toBe(true);
    for (const t of [1, 11, 49, 51, 211]) expect(isTipoB(t)).toBe(false);
  });
});
