import { describe, it, expect } from 'vitest';
import { ArcaValidationError } from '@ramiidv/arca-common';
import { validateComprobanteCAE, validateComprobanteCAEA } from '../src/validation.js';
import { roundDecimal, roundImporte } from '../src/format.js';
import type { MtxcaComprobanteBase, MtxcaItem } from '../src/types.js';
import { facturaA } from './helpers.js';

function fields(fn: () => void): string[] {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ArcaValidationError);
    return (e as ArcaValidationError).details.map((d) => d.field);
  }
  return [];
}

const mtx = { unidadesMtx: 1, codigoMtx: '0123456789913' };

/** Factura B del manual: un ítem 21% con precio con IVA y uno exento. */
function facturaB(): MtxcaComprobanteBase {
  return {
    codigoTipoComprobante: 6,
    numeroPuntoVenta: 4000,
    codigoTipoDocumento: 96,
    numeroDocumento: 24999999,
    condicionIVAReceptor: 5,
    importeGravado: 100,
    importeNoGravado: 0,
    importeExento: 100,
    importeSubtotal: 200,
    importeOtrosTributos: 0.01,
    importeTotal: 221.01,
    codigoMoneda: 'PES',
    cotizacionMoneda: 1,
    codigoConcepto: 1,
    otrosTributos: [{ codigo: 99, descripcion: 'Otro', baseImponible: 100, importe: 0.01 }],
    items: [
      {
        ...mtx,
        descripcion: 'Producto 1',
        cantidad: 1,
        codigoUnidadMedida: 1,
        precioUnitario: 121,
        importeBonificacion: 0,
        codigoCondicionIVA: 5,
        importeItem: 121,
      },
      {
        ...mtx,
        descripcion: 'Producto 2',
        cantidad: 1,
        codigoUnidadMedida: 7,
        precioUnitario: 100,
        codigoCondicionIVA: 2,
        importeItem: 100,
      },
    ],
    subtotalesIVA: [{ codigo: 5, importe: 21 }],
  };
}

describe('redondeo', () => {
  it('importes a 2 decimales, mitad al par (Round Half Even), sin errores binarios', () => {
    expect(roundImporte(1.005)).toBe(1);
    expect(roundImporte(-1.005)).toBe(-1);
    expect(roundImporte(1.015)).toBe(1.02);
    expect(roundImporte(8.565)).toBe(8.56);
    expect(roundImporte(8.575)).toBe(8.58);
    expect(roundImporte(2.675)).toBe(2.68);
    expect(roundImporte(-8.575)).toBe(-8.58);
    expect(roundImporte(1.0051)).toBe(1.01);
    expect(roundImporte(0.1 + 0.2)).toBe(0.3);
    expect(roundImporte(121.004999)).toBe(121);
    expect(roundImporte(1e-7)).toBe(0);
    expect(Object.is(roundImporte(-0.001), 0)).toBe(true);
  });

  it('cantidad y precio a 6 decimales', () => {
    expect(roundDecimal(1.23456789)).toBe(1.234568);
    expect(roundDecimal(0.0000005)).toBe(0);
    expect(roundDecimal(0.0000015)).toBe(0.000002);
  });
});

describe('validateComprobanteCAE', () => {
  it('acepta la Factura A y la Factura B del manual', () => {
    expect(fields(() => validateComprobanteCAE(facturaA()))).toEqual([]);
    expect(fields(() => validateComprobanteCAE(facturaB()))).toEqual([]);
  });

  it('acepta una bonificación (99) sin cantidad ni precio, con IVA e importe negativos', () => {
    const base = facturaA({ importeOtrosTributos: undefined, otrosTributos: undefined });
    const bonif: MtxcaItem = {
      descripcion: 'Bonificación',
      codigoUnidadMedida: 99,
      codigoCondicionIVA: 5,
      importeIVA: -2.1,
      importeItem: -12.1,
    };
    const c = {
      ...base,
      items: [...base.items, bonif],
      importeGravado: 90,
      importeSubtotal: 90,
      importeTotal: 108.9,
      subtotalesIVA: [{ codigo: 5, importe: 18.9 }],
    };
    expect(fields(() => validateComprobanteCAE(c))).toEqual([]);
  });

  it('una bonificación con cantidad/precio, positiva o sola es inválida', () => {
    const base = facturaA();
    const bonif: MtxcaItem = {
      descripcion: 'Bonif',
      codigoUnidadMedida: 99,
      codigoCondicionIVA: 4,
      cantidad: 1,
      precioUnitario: 10,
      importeIVA: 0,
      importeItem: 10,
    };
    const f = fields(() => validateComprobanteCAE({ ...base, items: [...base.items, bonif] }));
    expect(f).toEqual(
      expect.arrayContaining([
        'items[1].cantidad',
        'items[1].precioUnitario',
        'items[1].importeItem',
        'items[1].codigoUnidadMedida',
      ]),
    );
  });

  it('un ítem común sin unidadesMtx/codigoMtx/cantidad/precio es inválido (500, 503, 507, 509)', () => {
    const base = facturaA();
    const item: MtxcaItem = {
      descripcion: 'X',
      codigoUnidadMedida: 7,
      codigoCondicionIVA: 5,
      importeIVA: 21,
      importeItem: 121,
    };
    expect(fields(() => validateComprobanteCAE({ ...base, items: [item] }))).toEqual(
      expect.arrayContaining([
        'items[0].unidadesMtx',
        'items[0].codigoMtx',
        'items[0].cantidad',
        'items[0].precioUnitario',
      ]),
    );
  });

  it('importeIVA: obligatorio en A, prohibido en B (514)', () => {
    const a = facturaA();
    expect(fields(() => validateComprobanteCAE({ ...a, items: [{ ...a.items[0], importeIVA: undefined }] }))).toContain(
      'items[0].importeIVA',
    );
    const b = facturaB();
    expect(
      fields(() => validateComprobanteCAE({ ...b, items: [{ ...b.items[0], importeIVA: 21 }, b.items[1]] })),
    ).toContain('items[0].importeIVA');
  });

  it('fórmula del ítem: importeItem e importeIVA según precio, cantidad y bonificación (515, 519)', () => {
    const a = facturaA();
    expect(
      fields(() => validateComprobanteCAE({ ...a, items: [{ ...a.items[0], importeIVA: 20, importeItem: 120 }] })),
    ).toEqual(expect.arrayContaining(['items[0].importeIVA', 'items[0].importeItem']));
  });

  it('subtotales de IVA: faltante, sobrante, repetido o con importe distinto (401-403)', () => {
    const a = facturaA();
    expect(fields(() => validateComprobanteCAE({ ...a, subtotalesIVA: undefined }))).toContain('subtotalesIVA');
    expect(
      fields(() =>
        validateComprobanteCAE({
          ...a,
          subtotalesIVA: [
            { codigo: 5, importe: 21 },
            { codigo: 4, importe: 0 },
          ],
        }),
      ),
    ).toContain('subtotalesIVA[1].codigo');
    expect(fields(() => validateComprobanteCAE({ ...a, subtotalesIVA: [{ codigo: 5, importe: 20 }] }))).toContain(
      'subtotalesIVA[0].importe',
    );
    expect(
      fields(() =>
        validateComprobanteCAE({
          ...a,
          subtotalesIVA: [
            { codigo: 5, importe: 21 },
            { codigo: 5, importe: 21 },
          ],
        }),
      ),
    ).toContain('subtotalesIVA[1].codigo');
  });

  it('totales: gravado, subtotal, otros tributos y total coherentes (110-116)', () => {
    const a = facturaA();
    expect(fields(() => validateComprobanteCAE({ ...a, importeTotal: 122.02 }))).toEqual([
      'importeTotal',
      'importeTotal',
    ]);
    expect(fields(() => validateComprobanteCAE({ ...a, importeTotal: 122.01 }))).toEqual([]); // margen 0.01
    expect(fields(() => validateComprobanteCAE({ ...a, importeGravado: 99 }))).toEqual(
      expect.arrayContaining(['importeGravado', 'importeSubtotal']),
    );
    expect(fields(() => validateComprobanteCAE({ ...a, importeOtrosTributos: 2 }))).toEqual(
      expect.arrayContaining(['importeOtrosTributos']),
    );
    const b = facturaB();
    expect(fields(() => validateComprobanteCAE({ ...b, importeExento: 0, importeSubtotal: 100 }))).toContain(
      'importeExento',
    );
  });

  it('receptor CUIT obligatorio en clase A (128, 129) y par tipo/número (108)', () => {
    expect(fields(() => validateComprobanteCAE(facturaA({ codigoTipoDocumento: 96 })))).toContain(
      'codigoTipoDocumento',
    );
    expect(fields(() => validateComprobanteCAE(facturaA({ codigoTipoDocumento: undefined })))).toEqual(
      expect.arrayContaining(['numeroDocumento', 'codigoTipoDocumento']),
    );
  });

  it('fechas de servicio según el concepto (122-125, 133)', () => {
    expect(fields(() => validateComprobanteCAE(facturaA({ codigoConcepto: 2 })))).toEqual(
      expect.arrayContaining(['fechaServicioDesde', 'fechaServicioHasta', 'fechaVencimientoPago']),
    );
    expect(
      fields(() =>
        validateComprobanteCAE(
          facturaA({
            codigoConcepto: 2,
            fechaServicioDesde: '2026-11-30',
            fechaServicioHasta: '2026-11-01',
            fechaVencimientoPago: '2026-10-01',
          }),
        ),
      ),
    ).toEqual(['fechaServicioHasta', 'fechaVencimientoPago']);
    expect(fields(() => validateComprobanteCAE(facturaA({ fechaServicioDesde: '2026-11-01' })))).toContain(
      'fechaServicioDesde',
    );
  });

  it('moneda: PES con cotización 1 y cotización obligatoria (120, 194)', () => {
    expect(fields(() => validateComprobanteCAE(facturaA({ cotizacionMoneda: 2 })))).toContain('cotizacionMoneda');
    expect(fields(() => validateComprobanteCAE(facturaA({ cotizacionMoneda: undefined })))).toContain(
      'cotizacionMoneda',
    );
  });

  it('condición de IVA desconocida se informa (no se adivina la alícuota)', () => {
    const a = facturaA();
    expect(fields(() => validateComprobanteCAE({ ...a, items: [{ ...a.items[0], codigoCondicionIVA: 9 }] }))).toContain(
      'items[0].codigoCondicionIVA',
    );
  });

  it('re-lanza errores que no son de validación', () => {
    const bad = facturaA();
    Object.defineProperty(bad, 'items', {
      get() {
        throw new TypeError('boom');
      },
    });
    expect(() => validateComprobanteCAE(bad)).toThrow(TypeError);
  });
});

describe('validateComprobanteCAEA', () => {
  it('aplica las reglas de presencia de ítems, no las de importes', () => {
    expect(fields(() => validateComprobanteCAEA(facturaA({ importeTotal: 1 })))).toEqual([]);
    const a = facturaA();
    expect(fields(() => validateComprobanteCAEA({ ...a, items: [{ ...a.items[0], codigoMtx: undefined }] }))).toContain(
      'items[0].codigoMtx',
    );
  });
});

/** Mensajes de error (`campo: mensaje`) de una validación. */
function messages(fn: () => void): string[] {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ArcaValidationError);
    return (e as ArcaValidationError).details.map((d) => `${d.field}: ${d.message}`);
  }
  return [];
}

const servicios = { fechaServicioDesde: '2026-11-01', fechaServicioHasta: '2026-11-30' };
const caea = (c: MtxcaComprobanteBase) => ({ ...c, numeroComprobante: 1, caea: '36434058476543' });

describe('FCE MiPyME: fechaVencimientoPago (148, 149 / 764, 765)', () => {
  const fce = (tipo: number, overrides: Partial<MtxcaComprobanteBase> = {}) =>
    facturaA({ codigoTipoComprobante: tipo, ...overrides });

  for (const tipo of [201, 206]) {
    it(`${tipo}: obligatoria aunque el concepto sea 1`, () => {
      expect(fields(() => validateComprobanteCAE(fce(tipo, { fechaVencimientoPago: '2026-11-30' })))).toEqual([]);
      expect(messages(() => validateComprobanteCAE(fce(tipo)))).toEqual([
        expect.stringMatching(/^fechaVencimientoPago: .*\(148\)$/),
      ]);
      expect(
        fields(() =>
          validateComprobanteCAE(fce(tipo, { codigoConcepto: 2, ...servicios, fechaVencimientoPago: '2026-11-30' })),
        ),
      ).toEqual([]);
      expect(messages(() => validateComprobanteCAE(fce(tipo, { codigoConcepto: 2, ...servicios })))).toEqual([
        expect.stringMatching(/\(148\)$/),
      ]);
      expect(messages(() => validateComprobanteCAEA(caea(fce(tipo))))).toEqual([expect.stringMatching(/\(764\)$/)]);
      expect(fields(() => validateComprobanteCAEA(caea(fce(tipo, { fechaVencimientoPago: '2026-11-30' }))))).toEqual(
        [],
      );
    });
  }

  for (const tipo of [202, 203, 207, 208]) {
    it(`${tipo}: no corresponde, cualquiera sea el concepto`, () => {
      expect(fields(() => validateComprobanteCAE(fce(tipo)))).toEqual([]);
      expect(fields(() => validateComprobanteCAE(fce(tipo, { codigoConcepto: 2, ...servicios })))).toEqual([]);
      expect(messages(() => validateComprobanteCAE(fce(tipo, { fechaVencimientoPago: '2026-11-30' })))).toEqual([
        expect.stringMatching(/^fechaVencimientoPago: .*\(149\)$/),
      ]);
      expect(
        messages(() =>
          validateComprobanteCAE(fce(tipo, { codigoConcepto: 3, ...servicios, fechaVencimientoPago: '2026-11-30' })),
        ),
      ).toEqual([expect.stringMatching(/\(149\)$/)]);
      expect(messages(() => validateComprobanteCAEA(caea(fce(tipo, { fechaVencimientoPago: '2026-11-30' }))))).toEqual([
        expect.stringMatching(/\(765\)$/),
      ]);
      expect(fields(() => validateComprobanteCAEA(caea(fce(tipo))))).toEqual([]);
    });
  }

  it('fuera de FCE sigue la regla por concepto (124)', () => {
    expect(messages(() => validateComprobanteCAE(facturaA({ fechaVencimientoPago: '2026-11-30' })))).toEqual([
      expect.stringMatching(/^fechaVencimientoPago: .*\(122-124\)$/),
    ]);
  });

  it('FCE: descripción de tributo obligatoria (302) y un solo comprador (433)', () => {
    const tributo = { codigo: 1, baseImponible: 100, importe: 1 };
    expect(messages(() => validateComprobanteCAE(fce(202, { otrosTributos: [tributo] })))).toEqual([
      expect.stringMatching(/^otrosTributos\[0\]\.descripcion: .*\(302\)$/),
    ]);
    expect(fields(() => validateComprobanteCAE(facturaA({ otrosTributos: [tributo] })))).toEqual([]);
    const comprador = { codigoTipoDocumento: 80, numeroDocumento: '30000000007', porcentaje: 50 };
    expect(messages(() => validateComprobanteCAE(fce(202, { compradores: [comprador, comprador] })))).toEqual([
      expect.stringMatching(/^compradores: .*\(433\)$/),
    ]);
    expect(fields(() => validateComprobanteCAE(facturaA({ compradores: [comprador, comprador] })))).toEqual([]);
  });
});

describe('reglas del manual (190, 118, 160, 161, 432, 516)', () => {
  it('condicionIVAReceptor es obligatoria (190 en CAE, 390 en CAEA)', () => {
    expect(messages(() => validateComprobanteCAE(facturaA({ condicionIVAReceptor: undefined })))).toEqual([
      expect.stringMatching(/^condicionIVAReceptor: es obligatoria .*\(190\)$/),
    ]);
    expect(messages(() => validateComprobanteCAEA(caea(facturaA({ condicionIVAReceptor: undefined }))))).toEqual([
      expect.stringMatching(/\(390\)$/),
    ]);
  });

  it('cancelaEnMismaMonedaExtranjera "S" solo en 1, 6, 51, 201 y 206 (118)', () => {
    const dolares = { codigoMoneda: 'DOL', cotizacionMoneda: undefined, cancelaEnMismaMonedaExtranjera: 'S' as const };
    expect(fields(() => validateComprobanteCAE(facturaA(dolares)))).toEqual([]);
    const nd = facturaA({
      ...dolares,
      codigoTipoComprobante: 2,
      comprobantesAsociados: [{ codigoTipoComprobante: 1, numeroPuntoVenta: 4000, numeroComprobante: 1 }],
    });
    expect(messages(() => validateComprobanteCAE(nd))).toEqual([
      expect.stringMatching(/^cancelaEnMismaMonedaExtranjera: .*\(118\)$/),
    ]);
    expect(
      fields(() => validateComprobanteCAE({ ...nd, cancelaEnMismaMonedaExtranjera: 'N', cotizacionMoneda: 1000 })),
    ).toEqual([]);
  });

  it('ND/NC: comprobantes asociados o período, no ambos (160, 161 / 778, 779)', () => {
    const asociado = { codigoTipoComprobante: 1, numeroPuntoVenta: 4000, numeroComprobante: 1 };
    const periodo = { fechaDesde: '2026-10-01', fechaHasta: '2026-10-31' };
    for (const tipo of [2, 3, 52, 53]) {
      expect(messages(() => validateComprobanteCAE(facturaA({ codigoTipoComprobante: tipo })))).toEqual([
        expect.stringMatching(/^comprobantesAsociados: .*\(160\)$/),
      ]);
      expect(
        fields(() =>
          validateComprobanteCAE(facturaA({ codigoTipoComprobante: tipo, comprobantesAsociados: [asociado] })),
        ),
      ).toEqual([]);
      expect(
        fields(() =>
          validateComprobanteCAE(facturaA({ codigoTipoComprobante: tipo, periodoComprobantesAsociados: periodo })),
        ),
      ).toEqual([]);
      expect(
        messages(() =>
          validateComprobanteCAE(
            facturaA({
              codigoTipoComprobante: tipo,
              comprobantesAsociados: [asociado],
              periodoComprobantesAsociados: periodo,
            }),
          ),
        ),
      ).toEqual([expect.stringMatching(/^periodoComprobantesAsociados: .*\(161\)$/)]);
    }
    expect(messages(() => validateComprobanteCAEA(caea(facturaA({ codigoTipoComprobante: 3 }))))).toEqual([
      expect.stringMatching(/\(778\)$/),
    ]);
    expect(
      messages(() =>
        validateComprobanteCAEA(
          caea(
            facturaA({
              codigoTipoComprobante: 3,
              comprobantesAsociados: [asociado],
              periodoComprobantesAsociados: periodo,
            }),
          ),
        ),
      ),
    ).toEqual([expect.stringMatching(/\(779\)$/)]);
  });

  it('compradores solo con concepto 1 (432); en CAEA no se admiten (753)', () => {
    const compradores = [{ codigoTipoDocumento: 80, numeroDocumento: '30000000007', porcentaje: 100 }];
    expect(fields(() => validateComprobanteCAE(facturaA({ compradores })))).toEqual([]);
    expect(
      messages(() =>
        validateComprobanteCAE(
          facturaA({ compradores, codigoConcepto: 2, ...servicios, fechaVencimientoPago: '2026-11-30' }),
        ),
      ),
    ).toEqual([expect.stringMatching(/^compradores: .*\(432\)$/)]);
    expect(messages(() => validateComprobanteCAEA(caea(facturaA({ compradores }))))).toEqual([
      expect.stringMatching(/^compradores: .*\(753\)$/),
    ]);
  });

  it('el IVA de las bonificaciones no puede superar el IVA de su alícuota (516)', () => {
    const base = facturaA({ importeOtrosTributos: undefined, otrosTributos: undefined });
    const bonif: MtxcaItem = {
      descripcion: 'Bonificación',
      codigoUnidadMedida: 99,
      codigoCondicionIVA: 5,
      importeIVA: -25.2,
      importeItem: -145.2,
    };
    const c = {
      ...base,
      items: [...base.items, bonif],
      importeGravado: -20,
      importeSubtotal: -20,
      importeTotal: 0,
      subtotalesIVA: [{ codigo: 5, importe: -4.2 }],
    };
    expect(messages(() => validateComprobanteCAE(c))).toContainEqual(
      expect.stringMatching(/^items\[1\]\.importeIVA: .*\(25\.20\).*21\.00 \(516\)$/),
    );
  });
});
