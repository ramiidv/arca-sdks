import { describe, it, expect } from 'vitest';
import { ArcaValidationError, QR_URL } from '@ramiidv/arca-common';
import { urlQR } from '../src/qr.js';
import type { MtxcaAutorizarResult, MtxcaComprobanteConsultado, MtxcaInformarCAEAResult } from '../src/types.js';
import { facturaA } from './helpers.js';

function payload(url: string): Record<string, unknown> {
  expect(url.startsWith(`${QR_URL}?p=`)).toBe(true);
  return JSON.parse(Buffer.from(url.slice(`${QR_URL}?p=`.length), 'base64').toString());
}

const CAE: MtxcaAutorizarResult = {
  resultado: 'A',
  comprobante: {
    cuit: '20123456786',
    codigoTipoComprobante: 1,
    numeroPuntoVenta: 4000,
    numeroComprobante: 25,
    fechaEmision: '2026-11-02',
    cae: '76443051234567',
    fechaVencimientoCAE: '2026-11-12',
  },
  observaciones: [],
};

describe('urlQR', () => {
  it('CAE: datos de la respuesta (número, fecha asignada, CAE) y del request (importe, moneda, receptor)', () => {
    const { numeroComprobante: _n, ...req } = facturaA({ numeroDocumento: '30-00000000-7' });
    expect(payload(urlQR('20-12345678-6', req, CAE))).toEqual({
      ver: 1,
      fecha: '2026-11-02',
      cuit: 20123456786,
      ptoVta: 4000,
      tipoCmp: 1,
      nroCmp: 25,
      importe: 122,
      moneda: 'PES',
      ctz: 1,
      tipoDocRec: 80,
      nroDocRec: 30000000007,
      tipoCodAut: 'E',
      codAut: 76443051234567,
    });
  });

  it('CAEA: tipoCodAut "A" y la fecha de emisión del comprobante', () => {
    const res: MtxcaInformarCAEAResult = {
      resultado: 'O',
      fechaProceso: '2026-11-20',
      comprobante: { caea: '36434058476543', codigoTipoComprobante: 6, numeroPuntoVenta: 5, numeroComprobante: 9 },
      observaciones: [],
    };
    const p = payload(
      urlQR(20123456786, facturaA({ codigoMoneda: 'DOL', cotizacionMoneda: 1050.5, fechaEmision: '20261103' }), res),
    );
    expect(p).toMatchObject({ fecha: '2026-11-03', tipoCmp: 6, ptoVta: 5, nroCmp: 9, moneda: 'DOL', ctz: 1050.5 });
    expect(p).toMatchObject({ tipoCodAut: 'A', codAut: 36434058476543 });
    expect(() => urlQR(20123456786, facturaA({ fechaEmision: undefined }), res)).toThrow(ArcaValidationError);
  });

  it('desde consultarComprobante (sin resultado), sin receptor si no lo hay', () => {
    const consultado = {
      codigoTipoComprobante: 6,
      numeroPuntoVenta: 4000,
      numeroComprobante: 3,
      fechaEmision: '2026-11-01',
      codigoTipoAutorizacion: 'E',
      codigoAutorizacion: '76443051234567',
      importeSubtotal: 100,
      importeTotal: 100,
      codigoMoneda: 'DOL',
      cotizacionMoneda: 1000,
      codigoConcepto: 1,
    } as MtxcaComprobanteConsultado;
    const p = payload(urlQR('20123456786', consultado, undefined, { baseUrl: QR_URL }));
    expect(p).toMatchObject({ nroCmp: 3, tipoCodAut: 'E', ctz: 1000, importe: 100 });
    expect(p).not.toHaveProperty('tipoDocRec');
    expect(p).not.toHaveProperty('nroDocRec');
    expect(() => urlQR('20123456786', { ...consultado, codigoTipoAutorizacion: undefined })).toThrow(
      ArcaValidationError,
    );
  });

  it('resultado sin comprobante, sin cotización en moneda extranjera o con baseUrl propia', () => {
    // Desde JS se puede pasar cualquier cosa: un resultado sin comprobante no tiene CAE/CAEA.
    const sinComprobante = { resultado: 'A', observaciones: [] } as unknown as MtxcaAutorizarResult;
    expect(() => urlQR('20123456786', facturaA(), sinComprobante)).toThrow(/no tiene comprobante/);
    const err = (() => {
      try {
        urlQR('20123456786', facturaA({ codigoMoneda: 'DOL', cotizacionMoneda: undefined }), CAE);
      } catch (e) {
        return e as ArcaValidationError;
      }
    })();
    expect(err?.field).toBe('cotizacionMoneda');
    expect(urlQR('20123456786', facturaA(), CAE, { baseUrl: 'https://qr.test/' })).toMatch(/^https:\/\/qr\.test\/\?p=/);
  });
});
