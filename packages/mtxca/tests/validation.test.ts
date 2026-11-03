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
  it('exige fechaHoraGen (754)', () => {
    expect(messages(() => validateComprobanteCAEA(facturaA()))).toEqual([expect.stringMatching(/\(754\)$/)]);
  });

  it('aplica las reglas de presencia de ítems, no las de importes', () => {
    expect(fields(() => validateComprobanteCAEA(caea(facturaA({ importeTotal: 1 }))))).toEqual([]);
    const a = facturaA();
    expect(
      fields(() => validateComprobanteCAEA({ ...caea(a), items: [{ ...a.items[0], codigoMtx: undefined }] })),
    ).toContain('items[0].codigoMtx');
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
const caea = (c: MtxcaComprobanteBase) => ({
  ...c,
  numeroComprobante: 1,
  caea: '36434058476543',
  fechaHoraGen: '2026-11-01T10:30:00',
});

describe('FCE MiPyME: fechaVencimientoPago (148, 149 / 764, 765)', () => {
  /** FCE válida: datos adicionales de la factura (21, 27) o de la nota (22) y, en las notas, la factura asociada. */
  const fce = (tipo: number, overrides: Partial<MtxcaComprobanteBase> = {}) =>
    facturaA({
      codigoTipoComprobante: tipo,
      ...([201, 206].includes(tipo)
        ? {
            datosAdicionales: [
              { t: 21, c1: '0110599500000041817221' },
              { t: 27, c1: 'SCA' },
            ],
          }
        : {
            datosAdicionales: [{ t: 22, c1: 'N' }],
            comprobantesAsociados: [
              {
                codigoTipoComprobante: tipo < 205 ? 201 : 206,
                numeroPuntoVenta: 1,
                numeroComprobante: 1,
                cuit: '30000000007',
              },
            ],
          }),
      ...overrides,
    });

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
    const compradores = [
      { codigoTipoDocumento: 80, numeroDocumento: '30000000007', porcentaje: 60 },
      { codigoTipoDocumento: 86, numeroDocumento: '20123456786', porcentaje: 40 },
    ];
    expect(messages(() => validateComprobanteCAE(fce(202, { compradores })))).toEqual([
      expect.stringMatching(/^compradores: .*\(433\)$/),
    ]);
    expect(fields(() => validateComprobanteCAE(facturaA({ compradores })))).toEqual([]);
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
    const compradores = [
      { codigoTipoDocumento: 80, numeroDocumento: '30000000007', porcentaje: 50 },
      { codigoTipoDocumento: 86, numeroDocumento: '20123456786', porcentaje: 50 },
    ];
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

describe('reglas del manual v0.25.8: CAEA, No Categorizado, datos adicionales, asociados FCE y compradores', () => {
  const nota = (tipo: number, datos: { t: number; c1?: string }[], asociado: number) =>
    facturaA({
      codigoTipoComprobante: tipo,
      datosAdicionales: datos,
      comprobantesAsociados: [
        { codigoTipoComprobante: asociado, numeroPuntoVenta: 1, numeroComprobante: 1, cuit: '30000000007' },
      ],
    });

  it('el asociado FCE de una nota lleva el CUIT del emisor (210 / 810)', () => {
    const n = nota(203, [{ t: 22, c1: 'N' }], 201);
    expect(fields(() => validateComprobanteCAE(n, { cuitEmisor: '30-00000000-7' }))).toEqual([]);
    expect(messages(() => validateComprobanteCAE(n, { cuitEmisor: 20123456786 }))).toEqual([
      expect.stringMatching(/^comprobantesAsociados\[0\]\.cuit: .*\(210\)$/),
    ]);
    expect(messages(() => validateComprobanteCAEA(caea(n), { cuitEmisor: 20123456786 }))).toEqual([
      expect.stringMatching(/\(810\)$/),
    ]);
    // Sin el CUIT del emisor no se puede verificar.
    expect(fields(() => validateComprobanteCAE(n))).toEqual([]);
  });

  it('CAEA: el IVA en 0 de las condiciones 1 a 3 solo observa (1122) y los mensajes citan códigos de CAEA', () => {
    const exento = facturaA({
      items: [{ ...facturaA().items[0], codigoCondicionIVA: 2, importeIVA: 0.01 }],
      subtotalesIVA: undefined,
    });
    expect(messages(() => validateComprobanteCAE(exento))).toContainEqual(expect.stringMatching(/\(521\)$/));
    expect(messages(() => validateComprobanteCAEA(caea(exento)))).not.toContainEqual(
      expect.stringMatching(/\(52?1\)$/),
    );
    const sinMtx = caea(facturaA({ items: [{ ...facturaA().items[0], codigoMtx: undefined }] }));
    expect(messages(() => validateComprobanteCAEA(sinMtx))).toEqual([
      expect.stringMatching(/^items\[0\]\.codigoMtx: .*\(1103\)$/),
    ]);
  });

  it('CAEA: concepto (713), receptor de clase A (718, 733) y subtotales de IVA (715)', () => {
    expect(messages(() => validateComprobanteCAEA(caea(facturaA({ codigoConcepto: 4 }))))).toContainEqual(
      expect.stringMatching(/\(713\)$/),
    );
    expect(
      messages(() =>
        validateComprobanteCAEA(caea(facturaA({ codigoTipoDocumento: undefined, numeroDocumento: undefined }))),
      ),
    ).toContainEqual(expect.stringMatching(/\(718\)$/));
    expect(messages(() => validateComprobanteCAEA(caea(facturaA({ codigoTipoDocumento: 86 }))))).toContainEqual(
      expect.stringMatching(/\(733\)$/),
    );
    expect(messages(() => validateComprobanteCAEA(caea(facturaA({ subtotalesIVA: [] }))))).toContainEqual(
      expect.stringMatching(/^subtotalesIVA: .*\(715\)$/),
    );
  });

  it('No Categorizado: solo en B con condición 7 (342) y con el tributo 13 si hay gravado (145)', () => {
    const b = { ...facturaB(), codigoTipoDocumento: 80, numeroDocumento: '23000000000', condicionIVAReceptor: 7 };
    expect(messages(() => validateComprobanteCAE(b))).toEqual([expect.stringMatching(/^otrosTributos: .*\(145\)$/)]);
    const conPercepcion = {
      ...b,
      importeOtrosTributos: 1.01,
      importeTotal: 222.01,
      otrosTributos: [
        ...(b.otrosTributos ?? []),
        { codigo: 13, descripcion: 'Percepción', baseImponible: 100, importe: 1 },
      ],
    };
    expect(fields(() => validateComprobanteCAE(conPercepcion))).toEqual([]);
    expect(messages(() => validateComprobanteCAE(facturaA({ numeroDocumento: '23000000000' })))).toContainEqual(
      expect.stringMatching(/\(342\)$/),
    );
  });

  it('datos adicionales de FCE (326-336) y del dato 5 (337-340)', () => {
    const factura = (datos: { t: number; c1?: string }[]) =>
      facturaA({ codigoTipoComprobante: 201, datosAdicionales: datos, fechaVencimientoPago: '2026-11-30' });
    expect(messages(() => validateComprobanteCAE(factura([{ t: 21, c1: 'CBU' }])))).toEqual([
      expect.stringMatching(/\(335\)$/),
    ]);
    expect(messages(() => validateComprobanteCAE(factura([{ t: 27, c1: 'XXX' }])))).toEqual([
      expect.stringMatching(/\(334\)$/),
      expect.stringMatching(/\(331\)$/),
    ]);
    expect(
      messages(() =>
        validateComprobanteCAE(
          factura([
            { t: 21, c1: 'CBU' },
            { t: 27, c1: 'ADC' },
            { t: 22, c1: 'N' },
          ]),
        ),
      ),
    ).toEqual([expect.stringMatching(/\(330\)$/)]);
    expect(messages(() => validateComprobanteCAE(nota(203, [{ t: 22, c1: 'X' }], 201)))).toEqual([
      expect.stringMatching(/\(327\)$/),
    ]);
    expect(messages(() => validateComprobanteCAE(nota(203, [], 201)))).toEqual([expect.stringMatching(/\(329\)$/)]);
    expect(messages(() => validateComprobanteCAE(facturaA({ datosAdicionales: [{ t: 22, c1: 'N' }] })))).toEqual([
      expect.stringMatching(/\(326\)$/),
    ]);
    expect(messages(() => validateComprobanteCAE(facturaA({ datosAdicionales: [{ t: 5, c1: '7' }] })))).toEqual([
      expect.stringMatching(/\(339\)$/),
    ]);
    expect(messages(() => validateComprobanteCAE({ ...facturaB(), datosAdicionales: [{ t: 5, c1: '1' }] }))).toEqual([
      expect.stringMatching(/\(337\)$/),
    ]);
    // En CAEA los mismos datos citan su numeración (933).
    expect(messages(() => validateComprobanteCAEA(caea(factura([{ t: 21, c1: 'CBU' }]))))).toEqual([
      expect.stringMatching(/\(933\)$/),
    ]);
  });

  it('asociados FCE: cuit (209), uno solo (212), anulación (214) y período (159, 162)', () => {
    expect(fields(() => validateComprobanteCAE(nota(203, [{ t: 22, c1: 'N' }], 201)))).toEqual([]);
    expect(
      messages(() =>
        validateComprobanteCAE({
          ...nota(203, [{ t: 22, c1: 'N' }], 201),
          comprobantesAsociados: [{ codigoTipoComprobante: 201, numeroPuntoVenta: 1, numeroComprobante: 1 }],
        }),
      ),
    ).toEqual([expect.stringMatching(/\(209\)$/)]);
    expect(messages(() => validateComprobanteCAE(nota(203, [{ t: 22, c1: 'N' }], 202)))).toEqual([
      expect.stringMatching(/\(212\)$/),
    ]);
    expect(fields(() => validateComprobanteCAE(nota(203, [{ t: 22, c1: 'S' }], 202)))).toEqual([]);
    expect(messages(() => validateComprobanteCAE(nota(202, [{ t: 22, c1: 'S' }], 201)))).toEqual([
      expect.stringMatching(/\(214\)$/),
    ]);
    expect(
      messages(() =>
        validateComprobanteCAE(
          facturaA({ periodoComprobantesAsociados: { fechaDesde: '2026-10-01', fechaHasta: '2026-10-31' } }),
        ),
      ),
    ).toEqual([expect.stringMatching(/\(162\)$/)]);
    expect(messages(() => validateComprobanteCAEA(caea(nota(203, [{ t: 22, c1: 'N' }], 202))))).toEqual([
      expect.stringMatching(/\(812\)$/),
    ]);
  });

  it('compradores (420-429)', () => {
    const ok = [
      { codigoTipoDocumento: 80, numeroDocumento: '30000000007', porcentaje: 60 },
      { codigoTipoDocumento: 86, numeroDocumento: '20123456786', porcentaje: 40 },
    ];
    const con = (compradores: typeof ok) => facturaA({ compradores });
    expect(fields(() => validateComprobanteCAE(con(ok)))).toEqual([]);
    expect(messages(() => validateComprobanteCAE(con([{ ...ok[0], porcentaje: 99.99 }])))).toEqual([
      expect.stringMatching(/\(420\)$/),
      expect.stringMatching(/\(427\)$/),
    ]);
    expect(messages(() => validateComprobanteCAE(con([ok[0], { ...ok[1], codigoTipoDocumento: 96 }])))).toEqual([
      expect.stringMatching(/\(422\)$/),
    ]);
    expect(
      messages(() =>
        validateComprobanteCAE(
          con([
            { ...ok[0], porcentaje: 50 },
            { ...ok[0], porcentaje: 50 },
          ]),
        ),
      ),
    ).toContainEqual(expect.stringMatching(/\(423\)$/));
    expect(
      messages(() =>
        validateComprobanteCAE(
          con([
            { ...ok[0], porcentaje: 40 },
            { ...ok[1], porcentaje: 60 },
          ]),
        ),
      ),
    ).toEqual([expect.stringMatching(/\(429\)$/)]);
    expect(
      messages(() =>
        validateComprobanteCAE(con([ok[1], { ...ok[1], numeroDocumento: '20111111112', porcentaje: 60 }])),
      ),
    ).toEqual([expect.stringMatching(/\(428\)$/)]);
    expect(messages(() => validateComprobanteCAE(con(ok), { cuitEmisor: '20123456786' }))).toEqual([
      expect.stringMatching(/\(426\)$/),
    ]);
  });
});

describe('reglas del manual v0.25.8: casos borde', () => {
  const asociado = (codigoTipoComprobante: number, cuit?: string) => ({
    codigoTipoComprobante,
    numeroPuntoVenta: 1,
    numeroComprobante: 1,
    ...(cuit === undefined ? {} : { cuit }),
  });
  const notaFCE = (overrides: Partial<MtxcaComprobanteBase> = {}) =>
    facturaA({
      codigoTipoComprobante: 203,
      datosAdicionales: [{ t: 22, c1: 'N' }],
      comprobantesAsociados: [asociado(201, '30000000007')],
      ...overrides,
    });

  it('nota FCE: sin comprobantesAsociados (212); el remito asociado no exige cuit (209 solo para FCE)', () => {
    expect(messages(() => validateComprobanteCAE(notaFCE({ comprobantesAsociados: undefined })))).toEqual([
      expect.stringMatching(/^comprobantesAsociados: .*201 o 206 \(212\)$/),
    ]);
    expect(
      fields(() =>
        validateComprobanteCAE(notaFCE({ comprobantesAsociados: [asociado(201, '30000000007'), asociado(91)] })),
      ),
    ).toEqual([]);
    // En una anulación, cualquier FCE cuenta para 212; dos FCE no.
    expect(
      messages(() =>
        validateComprobanteCAE(
          notaFCE({
            datosAdicionales: [{ t: 22, c1: 'S' }],
            comprobantesAsociados: [asociado(201, '30000000007'), asociado(202, '30000000007')],
          }),
        ),
      ),
    ).toEqual([expect.stringMatching(/de anulación .*\(212\)$/)]);
  });

  it('datos adicionales: ítems no objeto se ignoran y el dato 5 en un tipo no admitido solo reporta 337', () => {
    const conNull = { ...facturaA(), datosAdicionales: [null, { t: 5, c1: '1' }] } as unknown as MtxcaComprobanteBase;
    expect(fields(() => validateComprobanteCAE(conNull))).toEqual([]);
    expect(
      messages(() => validateComprobanteCAE({ ...facturaB(), datosAdicionales: [{ t: 5, c1: '9', c2: 'x' }] })),
    ).toEqual([expect.stringMatching(/1, 2, 3, 201, 202 y 203 \(337\)$/)]);
  });

  it('compradores: documentos con guiones, índices originales, 421, empate en 429 y suma con decimales', () => {
    const ok = [
      { codigoTipoDocumento: 80, numeroDocumento: '30-00000000-7', porcentaje: 50 },
      { codigoTipoDocumento: 86, numeroDocumento: 20123456786, porcentaje: 50 },
    ];
    expect(fields(() => validateComprobanteCAE(facturaA({ compradores: ok })))).toEqual([]);
    expect(fields(() => validateComprobanteCAE(facturaA({ compradores: ok, numeroDocumento: 30000000007 })))).toEqual(
      [],
    );
    const tercios = [
      { ...ok[0], porcentaje: 33.34 },
      { ...ok[1], porcentaje: 33.33 },
      { codigoTipoDocumento: 87, numeroDocumento: '20111111112', porcentaje: 33.33 },
    ];
    expect(fields(() => validateComprobanteCAE(facturaA({ compradores: tercios })))).toEqual([]);
    const conBasura = [null, ok[0], { ...ok[1], codigoTipoDocumento: 96 }] as unknown as typeof ok;
    expect(fields(() => validateComprobanteCAE(facturaA({ compradores: conBasura })))).toEqual([
      'compradores[2].codigoTipoDocumento',
    ]);
    expect(messages(() => validateComprobanteCAE(facturaA({ compradores: ok }), { cuitEmisor: 20123456786 }))).toEqual([
      expect.stringMatching(/^compradores\[1\]\.numeroDocumento: .*\(426\)$/),
    ]);
    const sinReceptor = { ...facturaB(), codigoTipoDocumento: undefined, numeroDocumento: undefined, compradores: ok };
    expect(messages(() => validateComprobanteCAE(sinReceptor))).toEqual([
      expect.stringMatching(/^codigoTipoDocumento: .*\(421\)$/),
    ]);
  });

  it('No Categorizado: CUIT con guiones (342) y en CAEA (889, sin 145)', () => {
    expect(messages(() => validateComprobanteCAE(facturaA({ numeroDocumento: '23-00000000-0' })))).toContainEqual(
      expect.stringMatching(/\(342\)$/),
    );
    const b = { ...facturaB(), codigoTipoDocumento: 80, numeroDocumento: '23000000000', condicionIVAReceptor: 7 };
    expect(fields(() => validateComprobanteCAEA(caea(b)))).toEqual([]);
    expect(messages(() => validateComprobanteCAEA(caea({ ...b, condicionIVAReceptor: 5 })))).toEqual([
      expect.stringMatching(/^numeroDocumento: .*\(889\)$/),
    ]);
  });
});
