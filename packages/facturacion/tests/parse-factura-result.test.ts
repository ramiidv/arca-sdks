import { describe, it, expect } from 'vitest';
import { ArcaRechazoError, ArcaResponseError } from '@ramiidv/arca-common';
import { parseFacturaResult } from '../src/facturacion.js';
import type { FECAESolicitarResult, Importes } from '../src/types.js';

const OP = { operacion: 'FECAESolicitar' } as const;

const importes: Importes = {
  total: 121,
  neto: 100,
  iva: 21,
  exento: 0,
  noGravado: 0,
  tributos: 0,
};

describe('parseFacturaResult', () => {
  it('parsea resultado aprobado', () => {
    const raw: FECAESolicitarResult = {
      feCabResp: {
        cuit: 20123456789,
        ptoVta: 1,
        cbteTipo: 6,
        fchProceso: '20260328120000',
        cantReg: 1,
        resultado: 'A',
        reproceso: 'N',
      },
      feDetResp: [
        {
          concepto: 1,
          docTipo: 99,
          docNro: 0,
          cbteDesde: 150,
          cbteHasta: 150,
          cbteFch: '20260328',
          resultado: 'A',
          cae: '74512345678901',
          caeFchVto: '20260407',
        },
      ],
    };

    const result = parseFacturaResult(raw, importes, OP);

    expect(result).not.toHaveProperty('aprobada');
    expect(result.cae).toBe('74512345678901');
    expect(result.caeVencimiento).toBe('20260407');
    expect(result.cbteNro).toBe(150);
    expect(result.ptoVta).toBe(1);
    expect(result.cbteTipo).toBe(6);
    expect(result.importes).toEqual(importes);
    expect(result.observaciones).toEqual([]);
    expect(result.raw).toBe(raw);
  });

  it('resultado rechazado → ArcaRechazoError con las observaciones', () => {
    const raw: FECAESolicitarResult = {
      feCabResp: {
        cuit: 20123456789,
        ptoVta: 1,
        cbteTipo: 6,
        fchProceso: '20260328120000',
        cantReg: 1,
        resultado: 'R',
        reproceso: 'N',
      },
      feDetResp: [
        {
          concepto: 1,
          docTipo: 99,
          docNro: 0,
          cbteDesde: 150,
          cbteHasta: 150,
          cbteFch: '20260328',
          resultado: 'R',
          cae: '',
          caeFchVto: '',
          observaciones: [{ code: 10016, msg: 'Error de test' }],
        },
      ],
    };

    const err = (() => {
      try {
        parseFacturaResult(raw, importes, OP);
      } catch (e) {
        return e as ArcaRechazoError;
      }
    })();

    expect(err).toBeInstanceOf(ArcaRechazoError);
    expect(err?.operacion).toBe('FECAESolicitar');
    expect(err?.observaciones).toEqual([{ code: 10016, msg: 'Error de test' }]);
    expect(err?.errors).toEqual([]);
  });

  it('resultado aprobado sin CAE o sin detalle → ArcaResponseError incierto', () => {
    const raw: FECAESolicitarResult = {
      feCabResp: {
        cuit: 20123456789,
        ptoVta: 1,
        cbteTipo: 6,
        fchProceso: '20260328120000',
        cantReg: 1,
        resultado: 'A',
        reproceso: 'N',
      },
      feDetResp: [
        { concepto: 1, docTipo: 99, docNro: 0, cbteDesde: 150, cbteHasta: 150, cbteFch: '20260328', resultado: 'A' },
      ],
    };
    expect(() => parseFacturaResult(raw, importes, OP)).toThrow(ArcaResponseError);
    expect(() => parseFacturaResult({ ...raw, feDetResp: [] }, importes, OP)).toThrow(ArcaResponseError);
  });

  it('maneja array de FECAEDetResponse', () => {
    const raw: FECAESolicitarResult = {
      feCabResp: {
        cuit: 20123456789,
        ptoVta: 1,
        cbteTipo: 6,
        fchProceso: '20260328120000',
        cantReg: 2,
        resultado: 'A',
        reproceso: 'N',
      },
      feDetResp: [
        {
          concepto: 1,
          docTipo: 99,
          docNro: 0,
          cbteDesde: 150,
          cbteHasta: 150,
          cbteFch: '20260328',
          resultado: 'A',
          cae: '11111111111111',
          caeFchVto: '20260407',
        },
        {
          concepto: 1,
          docTipo: 99,
          docNro: 0,
          cbteDesde: 151,
          cbteHasta: 151,
          cbteFch: '20260328',
          resultado: 'A',
          cae: '22222222222222',
          caeFchVto: '20260407',
        },
      ],
    };

    const result = parseFacturaResult(raw, importes, OP);
    expect(result.cae).toBe('11111111111111');
    expect(result.cbteNro).toBe(150); // first one
  });

  it('rechazo con varias observaciones: todas en el error', () => {
    const raw: FECAESolicitarResult = {
      feCabResp: {
        cuit: 20123456789,
        ptoVta: 1,
        cbteTipo: 6,
        fchProceso: '20260328120000',
        cantReg: 1,
        resultado: 'R',
        reproceso: 'N',
      },
      feDetResp: [
        {
          concepto: 1,
          docTipo: 99,
          docNro: 0,
          cbteDesde: 150,
          cbteHasta: 150,
          cbteFch: '20260328',
          resultado: 'R',
          cae: '',
          caeFchVto: '',
          observaciones: [
            { code: 10001, msg: 'Error 1' },
            { code: 10002, msg: 'Error 2' },
          ],
        },
      ],
    };

    expect(() => parseFacturaResult(raw, importes, OP)).toThrow(
      expect.objectContaining({ observaciones: [expect.anything(), expect.anything()] }),
    );
  });
});
