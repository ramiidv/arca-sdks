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
import type { EmitirCertificadoParams } from '../src/index.js';

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
        buildCertificadoRequest({ ...BASE, importeRetencion: NaN, importeBaseCalculo: Infinity, importeComprobante: -1 }),
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
        'regimen', 'fechaRetencion', 'imposibilidadRetencion', 'importeRetencion', 'importeBaseCalculo',
        'regimenExclusion', 'tipoComprobante', 'fechaComprobante', 'importeComprobante', 'cuitRetenido',
      ]),
    );
  });

  it('obligatoriedad condicional del manual', () => {
    expect(fieldsOf(() => buildCertificadoRequest({ ...BASE, condicion: undefined }))).toEqual(['condicion']);
    expect(fieldsOf(() => buildCertificadoRequest({ ...BASE, condicion: 3 }))).toEqual(['condicion']);
    expect(fieldsOf(() => buildCertificadoRequest({ ...BASE, imposibilidadRetencion: true }))).toEqual(['motivoNoRetencion']);
    expect(fieldsOf(() => buildCertificadoRequest({ ...BASE, regimenExclusion: true })).sort()).toEqual([
      'fechaPublicacion', 'porcentajeExclusion',
    ]);
    expect(
      fieldsOf(() => buildCertificadoRequest({ ...BASE, regimenExclusion: true, porcentajeExclusion: 30, fechaPublicacion: '2026-01-01' })),
    ).toEqual(['porcentajeExclusion']);
    expect(fieldsOf(() => buildCertificadoRequest({ ...BASE, tipoComprobante: TipoComprobante.NOTA_CREDITO })).sort()).toEqual([
      'fechaRetencionCertificadoOriginal', 'importeCertificadoOriginal', 'motivoEmisionNotaCredito', 'numeroCertificadoOriginal',
    ]);
    expect(fieldsOf(() => buildCertificadoRequest({ ...BASE, numeroCertificadoOriginal: '1' }))).toEqual(['numeroCertificadoOriginal']);
    expect(fieldsOf(() => buildCertificadoRequest({ ...BASE, motivoEmisionNotaCredito: 'x' }))).toEqual(['motivoEmisionNotaCredito']);
  });

  it('numeroComprobante según la tabla TIPO_COMPROBANTE', () => {
    expect(fieldsOf(() => buildCertificadoRequest({ ...BASE, numeroComprobante: undefined }))).toEqual(['numeroComprobante']);
    expect(fieldsOf(() => buildCertificadoRequest({ ...BASE, numeroComprobante: '3-8497' }))).toEqual(['numeroComprobante']);
    expect(
      buildCertificadoRequest({ ...BASE, tipoComprobante: TipoComprobante.ORDEN_DE_PAGO, numeroComprobante: 'OP-123456789' })
        .numeroComprobante,
    ).toBe('OP-123456789');
    expect(
      fieldsOf(() => buildCertificadoRequest({ ...BASE, tipoComprobante: TipoComprobante.ORDEN_DE_PAGO, numeroComprobante: 'OP-1234567890' })),
    ).toEqual(['numeroComprobante']);
    expect(fieldsOf(() => buildCertificadoRequest({ ...BASE, tipoComprobante: 7 }))).toEqual(['tipoComprobante']);
  });

  it('longitudes y enteros', () => {
    expect(fieldsOf(() => buildCertificadoRequest({ ...BASE, codigoTrazabilidad: 'x'.repeat(37) }))).toEqual(['codigoTrazabilidad']);
    expect(fieldsOf(() => buildCertificadoRequest({ ...BASE, regimen: 1000 }))).toEqual(['regimen']);
    expect(fieldsOf(() => buildCertificadoRequest({ ...BASE, regimen: 8.5 }))).toEqual(['regimen']);
    expect(fieldsOf(() => buildCertificadoRequest({ ...BASE, cae: '1'.repeat(15) }))).toEqual(['cae']);
  });

  it('no acepta motivoAnulacion en emitir', () => {
    expect(
      fieldsOf(() => buildCertificadoRequest({ ...BASE, motivoAnulacion: 1 } as EmitirCertificadoParams)),
    ).toEqual(['motivoAnulacion']);
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

  it('numeroCertificado de más de 25 caracteres', () => {
    expect(fieldsOf(() => buildAnulacionRequest({ numeroCertificado: '1'.repeat(26), motivoAnulacion: 1 }))).toEqual([
      'numeroCertificado',
    ]);
  });
});
