import { describe, it, expect } from 'vitest';
import { validateFacturarOpts, validateFacturarExpoOpts, validateInvoiceRequest } from '../src/validation.js';
import { IvaTipo, CbteTipo, DocTipo, CondicionIva } from '../src/constants.js';

describe('validateFacturarOpts', () => {
  const validOpts = {
    ptoVta: 1,
    cbteTipo: CbteTipo.FACTURA_B,
    items: [{ neto: 100, iva: IvaTipo.IVA_21 }],
  };

  it('acepta opts válidos', () => {
    expect(() => validateFacturarOpts(validOpts)).not.toThrow();
  });

  it('rechaza ptoVta 0', () => {
    expect(() => validateFacturarOpts({ ...validOpts, ptoVta: 0 })).toThrow('ptoVta');
  });

  it('rechaza items vacío', () => {
    expect(() => validateFacturarOpts({ ...validOpts, items: [] })).toThrow('items');
  });

  it('rechaza neto negativo', () => {
    expect(() =>
      validateFacturarOpts({
        ...validOpts,
        items: [{ neto: -10, iva: IvaTipo.IVA_21 }],
      }),
    ).toThrow('negativo');
  });

  it('rechaza iva + exento en mismo item', () => {
    expect(() =>
      validateFacturarOpts({
        ...validOpts,
        items: [{ neto: 100, iva: IvaTipo.IVA_21, exento: true }],
      }),
    ).toThrow('iva');
  });

  it('rechaza moneda extranjera sin cotización', () => {
    expect(() =>
      validateFacturarOpts({
        ...validOpts,
        moneda: 'DOL',
      }),
    ).toThrow('cotizacion');
  });

  it('rechaza Factura A sin condicionIva', () => {
    expect(() =>
      validateFacturarOpts({
        ...validOpts,
        docTipo: DocTipo.CUIT,
        docNro: 30712345671,
      }),
    ).toThrow('condicionIva');
  });

  it('acepta Factura A con condicionIva', () => {
    expect(() =>
      validateFacturarOpts({
        ...validOpts,
        docTipo: DocTipo.CUIT,
        docNro: 30712345671,
        condicionIva: CondicionIva.RESPONSABLE_INSCRIPTO,
      }),
    ).not.toThrow();
  });

  it('no requiere condicionIva para consumidor final', () => {
    expect(
      () => validateFacturarOpts(validOpts), // default docTipo=99
    ).not.toThrow();
  });

  it('rechaza servicio incompleto', () => {
    expect(() =>
      validateFacturarOpts({
        ...validOpts,
        servicio: { desde: '20260301', hasta: '20260331', vtoPago: '' as any },
      }),
    ).toThrow('vtoPago');
  });
});

describe('validateFacturarExpoOpts', () => {
  const validOpts = {
    ptoVta: 1,
    cbteTipo: CbteTipo.FACTURA_E,
    tipoExpo: 1,
    pais: 203,
    cliente: {
      nombre: 'ACME',
      cuitPais: 50000000016,
      domicilio: '123 Main St',
      idImpositivo: 'XX',
    },
    moneda: 'DOL',
    cotizacion: 1200,
    formaPago: 'Wire',
    items: [{ codigo: 'X', descripcion: 'Y', cantidad: 1, unidad: 7, precioUnitario: 10 }],
  };

  it('acepta opts válidos', () => {
    expect(() => validateFacturarExpoOpts(validOpts)).not.toThrow();
  });

  it('rechaza sin tipoExpo', () => {
    expect(() => validateFacturarExpoOpts({ ...validOpts, tipoExpo: 0 as any })).toThrow('tipoExpo');
  });

  it('rechaza sin cliente.domicilio', () => {
    expect(() =>
      validateFacturarExpoOpts({
        ...validOpts,
        cliente: { ...validOpts.cliente, domicilio: '' },
      }),
    ).toThrow('domicilio');
  });

  it('rechaza sin cliente', () => {
    expect(() => validateFacturarExpoOpts({ ...validOpts, cliente: undefined as any })).toThrow('cliente');
  });

  it('rechaza sin moneda', () => {
    expect(() => validateFacturarExpoOpts({ ...validOpts, moneda: '' })).toThrow('moneda');
  });

  it('rechaza item sin descripción', () => {
    expect(() =>
      validateFacturarExpoOpts({
        ...validOpts,
        items: [{ codigo: 'X', descripcion: '', cantidad: 1, unidad: 7, precioUnitario: 10 }],
      }),
    ).toThrow('descripcion');
  });
});

describe('validateInvoiceRequest', () => {
  it('rechaza sin ptoVta', () => {
    expect(() =>
      validateInvoiceRequest({
        ptoVta: 0,
        cbteTipo: 6,
        invoices: [
          {
            cbteDesde: 1,
            cbteHasta: 1,
            cbteFch: '20260328',
            impTotal: 121,
            impTotConc: 0,
            impNeto: 100,
            impOpEx: 0,
            impTrib: 0,
            impIva: 21,
            monId: 'PES',
            monCotiz: 1,
            concepto: 1,
            docTipo: 99,
            docNro: 0,
          },
        ],
      }),
    ).toThrow('ptoVta');
  });

  it('rechaza invoices vacío', () => {
    expect(() => validateInvoiceRequest({ ptoVta: 1, cbteTipo: 6, invoices: [] })).toThrow('invoices');
  });
});

describe('validateInvoiceRequest (raw)', () => {
  const inv = {
    concepto: 1,
    docTipo: 99,
    docNro: 0,
    cbteDesde: 1,
    cbteHasta: 1,
    cbteFch: '20261030',
    impTotal: 121,
    impTotConc: 0,
    impNeto: 100,
    impOpEx: 0,
    impTrib: 0,
    impIva: 21,
    monId: 'PES',
    monCotiz: 1,
    condicionIvaReceptorId: 5,
  };
  const req = (extra: Record<string, unknown>) => ({ ptoVta: 1, cbteTipo: 6, invoices: [{ ...inv, ...extra }] });

  it('acepta un detalle válido', () => {
    expect(() => validateInvoiceRequest(req({}))).not.toThrow();
  });

  it.each([
    ['cbteFch inexistente', { cbteFch: '20261399' }, 'cbteFch'],
    ['cbteFch con guiones', { cbteFch: '2026-10-30' }, 'cbteFch'],
    ['fchServDesde inválida', { fchServDesde: '20261132' }, 'fchServDesde'],
    ['PES con monCotiz 2', { monCotiz: 2 }, 'monCotiz'],
    ['DOL sin monCotiz ni canMisMonExt S', { monId: 'DOL', monCotiz: undefined }, 'monCotiz'],
    ['canMisMonExt S con PES', { canMisMonExt: 'S' }, 'canMisMonExt'],
    ['impTotal NaN', { impTotal: Number.NaN }, 'impTotal'],
  ])('rechaza %s', (_, extra, field) => {
    expect(() => validateInvoiceRequest(req(extra) as never)).toThrow(field);
  });

  it('DOL con canMisMonExt S puede omitir monCotiz', () => {
    expect(() =>
      validateInvoiceRequest(req({ monId: 'DOL', monCotiz: undefined, canMisMonExt: 'S' }) as never),
    ).not.toThrow();
  });
});
