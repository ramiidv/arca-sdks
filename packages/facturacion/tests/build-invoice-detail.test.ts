import { describe, it, expect } from 'vitest';
import { buildInvoiceDetail } from '../src/facturacion.js';
import { IvaTipo, DocTipo, Concepto, Moneda, CbteTipo, CondicionIva } from '../src/constants.js';

describe('buildInvoiceDetail', () => {
  it('construye factura B consumidor final con defaults', () => {
    const { detail, importes } = buildInvoiceDetail(
      {
        ptoVta: 1,
        cbteTipo: CbteTipo.FACTURA_B,
        items: [{ neto: 100, iva: IvaTipo.IVA_21 }],
      },
      42,
    );

    expect(detail.concepto).toBe(Concepto.PRODUCTOS);
    expect(detail.docTipo).toBe(DocTipo.CONSUMIDOR_FINAL);
    expect(detail.docNro).toBe(0);
    expect(detail.cbteDesde).toBe(42);
    expect(detail.cbteHasta).toBe(42);
    expect(detail.monId).toBe(Moneda.PESOS);
    expect(detail.monCotiz).toBe(1);
    expect(detail.impNeto).toBe(100);
    expect(detail.impIva).toBe(21);
    expect(detail.impTotal).toBe(121);
    expect(detail.impTotConc).toBe(0);
    expect(detail.impOpEx).toBe(0);
    expect(detail.impTrib).toBe(0);
    expect(detail.iva).toHaveLength(1);
    expect(detail.condicionIvaReceptorId).toBe(CondicionIva.CONSUMIDOR_FINAL);
    expect(importes.total).toBe(121);
  });

  it('auto-detecta SERVICIOS cuando se provee servicio', () => {
    const { detail } = buildInvoiceDetail(
      {
        ptoVta: 1,
        cbteTipo: CbteTipo.FACTURA_A,
        docTipo: DocTipo.CUIT,
        docNro: 30712345671,
        condicionIva: CondicionIva.RESPONSABLE_INSCRIPTO,
        items: [{ neto: 1000, iva: IvaTipo.IVA_21 }],
        servicio: {
          desde: '20260301',
          hasta: '20260331',
          vtoPago: '20260415',
        },
      },
      1,
    );

    expect(detail.concepto).toBe(Concepto.SERVICIOS);
    expect(detail.fchServDesde).toBe('20260301');
    expect(detail.fchServHasta).toBe('20260331');
    expect(detail.fchVtoPago).toBe('20260415');
    expect(detail.condicionIvaReceptorId).toBe(CondicionIva.RESPONSABLE_INSCRIPTO);
  });

  it('tipo C no genera array Iva', () => {
    const { detail } = buildInvoiceDetail(
      {
        ptoVta: 1,
        cbteTipo: CbteTipo.FACTURA_C,
        items: [{ neto: 5000 }],
      },
      1,
    );

    expect(detail.impNeto).toBe(5000);
    expect(detail.impIva).toBe(0);
    expect(detail.impTotal).toBe(5000);
    expect(detail.iva).toBeUndefined();
  });

  it('acepta Date objects para servicio y fecha', () => {
    const { detail } = buildInvoiceDetail(
      {
        ptoVta: 1,
        cbteTipo: CbteTipo.FACTURA_B,
        items: [{ neto: 100, iva: IvaTipo.IVA_21 }],
        fecha: new Date('2026-03-28T12:00:00'),
        servicio: {
          desde: new Date('2026-03-01'),
          hasta: new Date('2026-03-31'),
          vtoPago: new Date('2026-04-15'),
        },
      },
      1,
    );

    expect(detail.cbteFch).toMatch(/^\d{8}$/);
    expect(detail.fchServDesde).toMatch(/^\d{8}$/);
  });

  it('pasa CanMisMonExt cuando se especifica', () => {
    const { detail } = buildInvoiceDetail(
      {
        ptoVta: 1,
        cbteTipo: CbteTipo.FACTURA_A,
        items: [{ neto: 1000, iva: IvaTipo.IVA_21 }],
        moneda: 'DOL',
        cotizacion: 1200,
        canMisMonExt: 'S',
      },
      1,
    );

    expect(detail.monId).toBe('DOL');
    expect(detail.monCotiz).toBe(1200);
    expect(detail.canMisMonExt).toBe('S');
  });
});
