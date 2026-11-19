import { describe, it, expect } from 'vitest';
import { calcularTotales } from '../src/facturacion.js';
import { IvaTipo } from '../src/constants.js';

describe('calcularTotales', () => {
  it('calcula IVA 21% correctamente', () => {
    const { importes, iva } = calcularTotales([{ neto: 100, iva: IvaTipo.IVA_21 }]);

    expect(importes.neto).toBe(100);
    expect(importes.iva).toBe(21);
    expect(importes.total).toBe(121);
    expect(importes.exento).toBe(0);
    expect(importes.noGravado).toBe(0);
    expect(importes.tributos).toBe(0);
    expect(iva).toHaveLength(1);
    expect(iva[0]).toEqual({ id: IvaTipo.IVA_21, baseImp: 100, importe: 21 });
  });

  it.each([
    // [neto, alícuota, IVA]: los empates exactos (x,xx5) se redondean al centavo par.
    [0.5, IvaTipo.IVA_21, 0.1], // 0,105 → 0,10
    [1.5, IvaTipo.IVA_21, 0.32], // 0,315 → 0,32
    [0.1, IvaTipo.IVA_5, 0], // 0,005 → 0,00
    [0.6, IvaTipo.IVA_2_5, 0.02], // 0,015 → 0,02
    [0.2, IvaTipo.IVA_2_5, 0], // 0,005 → 0,00
    [0.51, IvaTipo.IVA_21, 0.11], // 0,1071 → 0,11 (sin empate)
  ])('IVA sobre el neto %d (IvaTipo %i): mitad al par → %d', (neto, alicuota, esperado) => {
    const { importes, iva } = calcularTotales([{ neto, iva: alicuota }]);
    expect(importes.iva).toBe(esperado);
    expect(iva[0].importe).toBe(esperado);
    expect(importes.total).toBe(Math.round((neto + esperado) * 100) / 100);
  });

  it('agrupa múltiples items por alícuota', () => {
    const { importes, iva } = calcularTotales([
      { neto: 1000, iva: IvaTipo.IVA_21 },
      { neto: 500, iva: IvaTipo.IVA_21 },
      { neto: 200, iva: IvaTipo.IVA_10_5 },
    ]);

    expect(importes.neto).toBe(1700);
    expect(importes.iva).toBe(336); // 1500*0.21 + 200*0.105
    expect(importes.total).toBe(2036);
    expect(iva).toHaveLength(2);

    const iva21 = iva.find((i) => i.id === IvaTipo.IVA_21)!;
    expect(iva21.baseImp).toBe(1500);
    expect(iva21.importe).toBe(315);

    const iva105 = iva.find((i) => i.id === IvaTipo.IVA_10_5)!;
    expect(iva105.baseImp).toBe(200);
    expect(iva105.importe).toBe(21);
  });

  it('maneja items exentos', () => {
    const { importes, iva } = calcularTotales([
      { neto: 100, iva: IvaTipo.IVA_21 },
      { neto: 300, exento: true },
    ]);

    expect(importes.neto).toBe(100);
    expect(importes.exento).toBe(300);
    expect(importes.total).toBe(421);
    expect(iva).toHaveLength(1);
  });

  it('maneja items no gravados (sin iva ni exento)', () => {
    const { importes, iva } = calcularTotales([{ neto: 100, iva: IvaTipo.IVA_21 }, { neto: 150 }]);

    expect(importes.neto).toBe(100);
    expect(importes.noGravado).toBe(150);
    expect(importes.total).toBe(271);
    expect(iva).toHaveLength(1);
  });

  it('incluye tributos en el total', () => {
    const { importes } = calcularTotales([{ neto: 1000, iva: IvaTipo.IVA_21 }], {
      tributos: [{ importe: 50 }, { importe: 30 }],
    });

    expect(importes.tributos).toBe(80);
    expect(importes.total).toBe(1000 + 210 + 80);
  });

  it('tipo C: no discrimina IVA', () => {
    const { importes, iva } = calcularTotales([{ neto: 1000, iva: IvaTipo.IVA_21 }, { neto: 500 }], { tipoC: true });

    expect(importes.neto).toBe(1500);
    expect(importes.iva).toBe(0);
    expect(importes.exento).toBe(0);
    expect(importes.noGravado).toBe(0);
    expect(importes.total).toBe(1500);
    expect(iva).toHaveLength(0);
  });

  it('IVA 0% se incluye en neto y en array Iva con importe 0', () => {
    const { importes, iva } = calcularTotales([{ neto: 500, iva: IvaTipo.IVA_0 }]);

    expect(importes.neto).toBe(500);
    expect(importes.iva).toBe(0);
    expect(importes.total).toBe(500);
    expect(iva).toHaveLength(1);
    expect(iva[0]).toEqual({ id: IvaTipo.IVA_0, baseImp: 500, importe: 0 });
  });

  it('redondea a 2 decimales', () => {
    const { importes } = calcularTotales([{ neto: 33.33, iva: IvaTipo.IVA_21 }]);

    expect(importes.iva).toBe(7); // 33.33 * 0.21 = 6.9993 → 7.0
    expect(importes.total).toBe(40.33);
  });

  it('tira error con tipo de IVA desconocido', () => {
    expect(() => calcularTotales([{ neto: 100, iva: 999 }])).toThrow('Tipo de IVA desconocido: 999');
  });
});
