import { describe, expect, it } from 'vitest';
import {
  ArcaValidationError,
  Condicion,
  TipoComprobante,
  buildAnulacionRequest,
  buildCertificadoRequest,
  formatImporte,
  formatSireDateTime,
} from '../src/index.js';
import type { AnularCertificadoParams as AnularParams, EmitirCertificadoParams } from '../src/index.js';

const BASE: EmitirCertificadoParams = {
  regimen: 831,
  condicion: Condicion.INSCRIPTO,
  fechaRetencion: '2026-10-30',
  imposibilidadRetencion: false,
  importeRetencion: 2100,
  importeBaseCalculo: 20000,
  regimenExclusion: false,
  tipoComprobante: TipoComprobante.FACTURA,
  fechaComprobante: '2026-10-30',
  numeroComprobante: '00003-00008497',
  importeComprobante: 24200,
  cuitRetenido: 30500010912,
};

function fieldsOf(fn: () => unknown): string[] {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ArcaValidationError);
    return (e as ArcaValidationError).details.map((d) => d.field);
  }
  throw new Error('no lanzó');
}

describe('formatSireDateTime', () => {
  it('serializa con zona -03:00 (AAAA-MM-DDThh:mm:ss.SSSXXX)', () => {
    expect(formatSireDateTime('2026-10-30')).toBe('2026-10-30T00:00:00.000-03:00');
    expect(formatSireDateTime('20261030')).toBe('2026-10-30T00:00:00.000-03:00');
    expect(formatSireDateTime('2026-10-30T11:16')).toBe('2026-10-30T11:16:00.000-03:00');
    expect(formatSireDateTime('2026-10-30T11:16:05.5')).toBe('2026-10-30T11:16:05.500-03:00');
    expect(formatSireDateTime('2026-10-30T02:00:00Z')).toBe('2026-10-29T23:00:00.000-03:00');
    expect(formatSireDateTime('2026-10-30T11:16:00.969-03:00')).toBe('2026-10-30T11:16:00.969-03:00');
    expect(formatSireDateTime(new Date('2026-10-30T14:16:00.123Z'))).toBe('2026-10-30T11:16:00.123-03:00');
  });

  it('misma salida que la implementación anterior (offset fijo -03:00) para Date', () => {
    const anterior = (ms: number): string => {
      const pad = (n: number, w: number) => String(n).padStart(w, '0');
      const d = new Date(ms - 3 * 3_600_000);
      return (
        `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}` +
        `T${pad(d.getUTCHours(), 2)}:${pad(d.getUTCMinutes(), 2)}:${pad(d.getUTCSeconds(), 2)}` +
        `.${pad(d.getUTCMilliseconds(), 3)}-03:00`
      );
    };
    const desde = Date.UTC(2019, 11, 1);
    const paso = 7_919_999_999 / 500; // ~0,5 años en 500 pasos, ms variados
    for (let i = 0; i < 2000; i++) {
      const ms = Math.round(desde + i * paso + (i % 1000));
      expect(formatSireDateTime(new Date(ms))).toBe(anterior(ms));
    }
    for (const iso of ['2026-12-31T23:59:59.999Z', '2027-01-01T02:59:59.999Z', '2026-01-01T03:00:00.000Z']) {
      expect(formatSireDateTime(new Date(iso))).toBe(anterior(Date.parse(iso)));
      expect(formatSireDateTime(iso)).toBe(anterior(Date.parse(iso)));
    }
  });

  it('rechaza fechas inexistentes o mal formadas', () => {
    for (const v of ['2026-02-30', '2026-13-01', '30/10/2026', '2026-10-30T25:00', '', 'hoy']) {
      expect(() => formatSireDateTime(v, 'fechaRetencion')).toThrow(ArcaValidationError);
    }
    expect(() => formatSireDateTime(new Date('x'))).toThrow(ArcaValidationError);
  });
});

describe('formatImporte', () => {
  it('redondea a 2 decimales', () => {
    expect(formatImporte(0)).toBe('0.00');
    expect(formatImporte(2100)).toBe('2100.00');
    expect(formatImporte(10.005)).toBe('10.01');
    expect(formatImporte(99_999_999_999.99)).toBe('99999999999.99');
  });

  it('rechaza NaN, Infinity, negativos y más de 11 enteros', () => {
    for (const v of [NaN, Infinity, -Infinity, -0.01, 100_000_000_000, '10' as unknown as number]) {
      expect(() => formatImporte(v, 'importeRetencion')).toThrow(ArcaValidationError);
    }
  });
});

describe('buildCertificadoRequest', () => {
  it('arma el certificado con version 100 e impuesto 216', () => {
    const req = buildCertificadoRequest(BASE);
    expect(req).toMatchObject({
      version: 100,
      impuesto: 216,
      cuitRetenido: 30500010912,
      importeRetencion: '2100.00',
      condicion: 1,
    });
  });

  it('importes NaN/Infinity/negativos', () => {
    expect(
      fieldsOf(() =>
        buildCertificadoRequest({
          ...BASE,
          importeRetencion: NaN,
          importeBaseCalculo: Infinity,
          importeComprobante: -1,
        }),
      ).sort(),
    ).toEqual(['importeBaseCalculo', 'importeComprobante', 'importeRetencion']);
  });

  it('CUIT retenido con dígito verificador inválido', () => {
    expect(fieldsOf(() => buildCertificadoRequest({ ...BASE, cuitRetenido: '30500010913' }))).toEqual(['cuitRetenido']);
  });

  it('obligatorios del XSD', () => {
    const fields = fieldsOf(() => buildCertificadoRequest({} as EmitirCertificadoParams));
    expect(fields).toEqual(
      expect.arrayContaining([
        'regimen',
        'fechaRetencion',
        'imposibilidadRetencion',
        'importeRetencion',
        'importeBaseCalculo',
        'regimenExclusion',
        'tipoComprobante',
        'fechaComprobante',
        'importeComprobante',
        'cuitRetenido',
      ]),
    );
  });

  it('obligatoriedad condicional del manual', () => {
    expect(fieldsOf(() => buildCertificadoRequest({ ...BASE, condicion: undefined }))).toEqual(['condicion']);
    expect(fieldsOf(() => buildCertificadoRequest({ ...BASE, condicion: 3 }))).toEqual(['condicion']);
    expect(fieldsOf(() => buildCertificadoRequest({ ...BASE, imposibilidadRetencion: true }))).toEqual([
      'motivoNoRetencion',
    ]);
    expect(fieldsOf(() => buildCertificadoRequest({ ...BASE, regimenExclusion: true })).sort()).toEqual([
      'fechaPublicacion',
      'porcentajeExclusion',
    ]);
    expect(
      fieldsOf(() =>
        buildCertificadoRequest({
          ...BASE,
          regimenExclusion: true,
          porcentajeExclusion: 30,
          fechaPublicacion: '2026-01-01',
        }),
      ),
    ).toEqual(['porcentajeExclusion']);
    expect(
      fieldsOf(() => buildCertificadoRequest({ ...BASE, tipoComprobante: TipoComprobante.NOTA_CREDITO })).sort(),
    ).toEqual([
      'fechaRetencionCertificadoOriginal',
      'importeCertificadoOriginal',
      'motivoEmisionNotaCredito',
      'numeroCertificadoOriginal',
    ]);
    expect(fieldsOf(() => buildCertificadoRequest({ ...BASE, numeroCertificadoOriginal: '1' }))).toEqual([
      'numeroCertificadoOriginal',
    ]);
    expect(fieldsOf(() => buildCertificadoRequest({ ...BASE, motivoEmisionNotaCredito: 'x' }))).toEqual([
      'motivoEmisionNotaCredito',
    ]);
  });

  it('numeroComprobante según la tabla TIPO_COMPROBANTE', () => {
    expect(fieldsOf(() => buildCertificadoRequest({ ...BASE, numeroComprobante: undefined }))).toEqual([
      'numeroComprobante',
    ]);
    expect(fieldsOf(() => buildCertificadoRequest({ ...BASE, numeroComprobante: '3-8497' }))).toEqual([
      'numeroComprobante',
    ]);
    expect(
      buildCertificadoRequest({
        ...BASE,
        tipoComprobante: TipoComprobante.ORDEN_DE_PAGO,
        numeroComprobante: 'OP0123456789',
      }).numeroComprobante,
    ).toBe('OP0123456789');
    expect(
      fieldsOf(() =>
        buildCertificadoRequest({
          ...BASE,
          tipoComprobante: TipoComprobante.ORDEN_DE_PAGO,
          numeroComprobante: 'OP01234567890',
        }),
      ),
    ).toEqual(['numeroComprobante']);
    // X(n): "caracteres alfanuméricos" (manual 5.3), más separadores - / .
    for (const tipo of [5, 6, 9, 11]) {
      for (const numero of ['A 1', 'Ñ1', '-A1', 'A_1']) {
        expect(
          fieldsOf(() => buildCertificadoRequest({ ...BASE, tipoComprobante: tipo, numeroComprobante: numero })),
        ).toEqual(['numeroComprobante']);
      }
      for (const numero of ['Ab12', 'OP-1234', 'A/1', 'A.1']) {
        expect(
          buildCertificadoRequest({ ...BASE, tipoComprobante: tipo, numeroComprobante: numero }).numeroComprobante,
        ).toBe(numero);
      }
    }
    expect(fieldsOf(() => buildCertificadoRequest({ ...BASE, tipoComprobante: 7 }))).toEqual(['tipoComprobante']);
  });

  it('longitudes y enteros', () => {
    expect(fieldsOf(() => buildCertificadoRequest({ ...BASE, codigoTrazabilidad: 'x'.repeat(37) }))).toEqual([
      'codigoTrazabilidad',
    ]);
    expect(fieldsOf(() => buildCertificadoRequest({ ...BASE, regimen: 1000 }))).toEqual(['regimen']);
    expect(fieldsOf(() => buildCertificadoRequest({ ...BASE, regimen: 8.5 }))).toEqual(['regimen']);
    expect(fieldsOf(() => buildCertificadoRequest({ ...BASE, cae: '1'.repeat(15) }))).toEqual(['cae']);
  });

  it('rechaza campos desconocidos y textos vacíos', () => {
    expect(
      fieldsOf(() => buildCertificadoRequest({ ...BASE, observaciones: 'x' } as unknown as EmitirCertificadoParams)),
    ).toEqual(['observaciones']);
    expect(fieldsOf(() => buildCertificadoRequest({ ...BASE, codigoTrazabilidad: '   ' }))).toEqual([
      'codigoTrazabilidad',
    ]);
    expect(
      fieldsOf(() =>
        buildCertificadoRequest({ ...BASE, tipoComprobante: TipoComprobante.ORDEN_DE_PAGO, numeroComprobante: ' ' }),
      ),
    ).toEqual(['numeroComprobante']);
  });

  it('acumula errores de fechas con los del schema, sin duplicar', () => {
    expect(
      fieldsOf(() => buildCertificadoRequest({ ...BASE, fechaRetencion: '2026-02-30', regimen: 0 })).sort(),
    ).toEqual(['fechaRetencion', 'regimen']);
  });

  it('serializa en el orden del XSD', () => {
    const req = buildCertificadoRequest({ ...BASE, cae: '12345678901234', codigoTrazabilidad: 'T-1' });
    expect(Object.keys(req)).toEqual([
      'version',
      'codigoTrazabilidad',
      'impuesto',
      'regimen',
      'fechaRetencion',
      'condicion',
      'imposibilidadRetencion',
      'importeRetencion',
      'importeBaseCalculo',
      'regimenExclusion',
      'tipoComprobante',
      'fechaComprobante',
      'numeroComprobante',
      'cae',
      'importeComprobante',
      'cuitRetenido',
    ]);
    expect(req.imposibilidadRetencion).toBe(false);
    expect(req.cuitRetenido).toBe(30500010912);
  });

  it('no acepta motivoAnulacion en emitir', () => {
    expect(fieldsOf(() => buildCertificadoRequest({ ...BASE, motivoAnulacion: 1 } as EmitirCertificadoParams))).toEqual(
      ['motivoAnulacion'],
    );
  });
});

describe('reglas de fechas (manual 3.2.2)', () => {
  const NC = {
    ...BASE,
    tipoComprobante: TipoComprobante.NOTA_CREDITO,
    motivoEmisionNotaCredito: 'Devolución',
    numeroCertificadoOriginal: '0000000000012345',
    fechaRetencionCertificadoOriginal: '2026-10-01',
    importeCertificadoOriginal: 100,
  };

  it('fechaRetencion a partir del 2019-12-01 (fecha de Argentina)', () => {
    expect(
      fieldsOf(() =>
        buildCertificadoRequest({ ...BASE, fechaRetencion: '2019-11-30', fechaComprobante: '2019-11-30' }),
      ),
    ).toEqual(['fechaRetencion']);
    expect(() =>
      buildCertificadoRequest({ ...BASE, fechaRetencion: '2019-12-01', fechaComprobante: '2019-12-01' }),
    ).not.toThrow();
    // 2019-12-01T02:00Z es el 30/11 a las 23:00 en Argentina.
    expect(
      fieldsOf(() =>
        buildCertificadoRequest({
          ...BASE,
          fechaRetencion: '2019-12-01T02:00:00Z',
          fechaComprobante: '2019-11-30',
        }),
      ),
    ).toEqual(['fechaRetencion']);
  });

  it('fechaComprobante <= fechaRetencion (compara fechas calendario, no la hora)', () => {
    expect(fieldsOf(() => buildCertificadoRequest({ ...BASE, fechaComprobante: '2026-10-31' }))).toEqual([
      'fechaComprobante',
    ]);
    expect(() =>
      buildCertificadoRequest({ ...BASE, fechaRetencion: '2026-10-30T08:00', fechaComprobante: '2026-10-30T20:00' }),
    ).not.toThrow();
    expect(() => buildCertificadoRequest({ ...BASE, fechaComprobante: '2026-10-01' })).not.toThrow();
    // Date: se toma la fecha de Argentina (2026-10-31T01:00Z = 30/10 22:00 en AR).
    expect(() =>
      buildCertificadoRequest({ ...BASE, fechaComprobante: new Date('2026-10-31T01:00:00Z') }),
    ).not.toThrow();
  });

  it('tipos 3, 19 y 20: fechaComprobante igual a fechaRetencion', () => {
    expect(() => buildCertificadoRequest(NC)).not.toThrow();
    for (const tipoComprobante of [3, 19, 20]) {
      const extra = tipoComprobante === 3 ? {} : { motivoEmisionNotaCredito: undefined };
      expect(
        fieldsOf(() => buildCertificadoRequest({ ...NC, ...extra, tipoComprobante, fechaComprobante: '2026-10-29' })),
      ).toEqual(['fechaComprobante']);
    }
  });

  it('una fecha inválida no genera errores de comparación', () => {
    expect(fieldsOf(() => buildCertificadoRequest({ ...BASE, fechaComprobante: '2026-02-30' }))).toEqual([
      'fechaComprobante',
    ]);
  });
});

describe('importes negativos', () => {
  const LIQ = {
    ...BASE,
    numeroCertificadoOriginal: '0000000000012345',
    fechaRetencionCertificadoOriginal: '2026-10-01',
    importeCertificadoOriginal: 100,
  };

  it('importeComprobante negativo solo para los tipos 19 y 20 ("con valor negativo")', () => {
    for (const tipoComprobante of [19, 20]) {
      expect(buildCertificadoRequest({ ...LIQ, tipoComprobante, importeComprobante: -1234.5 }).importeComprobante).toBe(
        '-1234.50',
      );
    }
    for (const tipoComprobante of [1, 17, 18]) {
      const extra = tipoComprobante === 1 ? BASE : LIQ;
      const fields = fieldsOf(() =>
        buildCertificadoRequest({ ...BASE, ...extra, tipoComprobante, importeComprobante: -1 }),
      );
      expect(fields).toContain('importeComprobante');
    }
    expect(
      fieldsOf(() => buildCertificadoRequest({ ...LIQ, tipoComprobante: 19, importeComprobante: -100_000_000_000 })),
    ).toEqual(['importeComprobante']);
  });

  it('los demás importes siguen siendo no negativos', () => {
    expect(fieldsOf(() => buildCertificadoRequest({ ...LIQ, tipoComprobante: 19, importeRetencion: -1 }))).toEqual([
      'importeRetencion',
    ]);
  });
});

describe('textos opcionales (coe, coeOriginal, cae)', () => {
  it('sin valor se omiten; con espacios se rechazan (manual 5.1, punto 5)', () => {
    expect(Object.keys(buildCertificadoRequest(BASE))).not.toContain('coe');
    expect(fieldsOf(() => buildCertificadoRequest({ ...BASE, coe: ' '.repeat(12) }))).toEqual(['coe']);
  });
});

describe('buildAnulacionRequest', () => {
  it('arma el certificadoAnulacion', () => {
    expect(buildAnulacionRequest({ numeroCertificado: '123', motivoAnulacion: 2 })).toEqual({
      version: 100,
      codigoTrazabilidad: undefined,
      impuesto: 216,
      numeroCertificado: '123',
      motivoAnulacion: 2,
    });
  });

  it('rechaza motivoAnulacion fuera de la tabla y campos desconocidos', () => {
    expect(fieldsOf(() => buildAnulacionRequest({ numeroCertificado: '1', motivoAnulacion: 5 }))).toEqual([
      'motivoAnulacion',
    ]);
    expect(
      fieldsOf(() =>
        buildAnulacionRequest({ numeroCertificado: '1', motivoAnulacion: 1, motivo: 'x' } as unknown as AnularParams),
      ),
    ).toEqual(['motivo']);
  });

  it('numeroCertificado de más de 25 caracteres', () => {
    expect(fieldsOf(() => buildAnulacionRequest({ numeroCertificado: '1'.repeat(26), motivoAnulacion: 1 }))).toEqual([
      'numeroCertificado',
    ]);
  });
});
