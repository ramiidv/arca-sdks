import { describe, it, expect } from 'vitest';
import { validateCPE, validateCTG, validateLiquidacion } from '../src/validation.js';
import { ArcaValidationError } from '@ramiidv/arca-common';
import type { CartaPorteAutomotor, SolicitudCTG, Liquidacion } from '../src/types.js';

// ---------------------------------------------------------------------------
// Helpers: valid baseline objects
// ---------------------------------------------------------------------------

function validCPE(): CartaPorteAutomotor {
  return {
    cuitTitularCartaPorte: 20123456789,
    sucursal: 1,
    nroOrden: 0,
    codTipoCartaPorte: 1,
    codGrano: 23,
    codLocalidadProcedencia: 10270,
    codProvProcedencia: 1,
    codLocalidadDestino: 10350,
    codProvDestino: 1,
    cuitDestino: 30111222334,
    plantaDestino: 1,
    pesoNeto: 30000,
    pesoBruto: 32000,
    pesoTara: 2000,
    patente: 'ABC123',
    cuitTransportista: 20999888777,
    fechaEmision: '2026-03-31',
  };
}

function validCTG(): SolicitudCTG {
  return {
    nroCartaPorte: 1000001,
    codEspecie: 23,
    cuitDestino: 30111222334,
    cuitDestinatario: 30111222334,
    codLocalidadOrigen: 10270,
    codLocalidadDestino: 10350,
    codCosecha: 2526,
    pesoNeto: 30000,
  };
}

function validLiquidacion(): Liquidacion {
  return {
    cuitComprador: 30111222334,
    cuitVendedor: 20123456789,
    codGrano: 23,
    pesoNeto: 30000,
    precioRefTn: 350000,
  };
}

// ---------------------------------------------------------------------------
// CPE Validation
// ---------------------------------------------------------------------------

describe('validateCPE', () => {
  it('should pass with valid CPE input', () => {
    expect(() => validateCPE(validCPE())).not.toThrow();
  });

  it('should pass with nroOrden = 0 (non-negative)', () => {
    const cpe = validCPE();
    cpe.nroOrden = 0;
    expect(() => validateCPE(cpe)).not.toThrow();
  });

  it('should throw when cuitTitularCartaPorte is missing', () => {
    const cpe = validCPE();
    (cpe as Record<string, unknown>).cuitTitularCartaPorte = undefined;
    expect(() => validateCPE(cpe)).toThrow(ArcaValidationError);
  });

  it('should throw when sucursal is 0', () => {
    const cpe = validCPE();
    cpe.sucursal = 0;
    expect(() => validateCPE(cpe)).toThrow(ArcaValidationError);
  });

  it('should throw when nroOrden is negative', () => {
    const cpe = validCPE();
    cpe.nroOrden = -1;
    expect(() => validateCPE(cpe)).toThrow(ArcaValidationError);
  });

  it('should throw when codGrano is 0', () => {
    const cpe = validCPE();
    cpe.codGrano = 0;
    expect(() => validateCPE(cpe)).toThrow(ArcaValidationError);
  });

  it('should throw when pesoNeto is 0', () => {
    const cpe = validCPE();
    cpe.pesoNeto = 0;
    expect(() => validateCPE(cpe)).toThrow(ArcaValidationError);
  });

  it('should throw when pesoNeto is negative', () => {
    const cpe = validCPE();
    cpe.pesoNeto = -500;
    expect(() => validateCPE(cpe)).toThrow(ArcaValidationError);
  });

  it('should throw when cuitDestino has wrong format', () => {
    const cpe = validCPE();
    cpe.cuitDestino = 123 as unknown as number; // not 11 digits
    expect(() => validateCPE(cpe)).toThrow(ArcaValidationError);
  });

  it('should throw when cuitTransportista has wrong format', () => {
    const cpe = validCPE();
    cpe.cuitTransportista = 999 as unknown as number;
    expect(() => validateCPE(cpe)).toThrow(ArcaValidationError);
  });

  it('should collect multiple errors at once', () => {
    const cpe = validCPE();
    cpe.sucursal = 0;
    cpe.codGrano = 0;
    cpe.pesoNeto = -1;

    try {
      validateCPE(cpe);
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ArcaValidationError);
      const valError = error as ArcaValidationError;
      expect(valError.details.length).toBeGreaterThanOrEqual(3);
    }
  });
});

// ---------------------------------------------------------------------------
// CTG Validation
// ---------------------------------------------------------------------------

describe('validateCTG', () => {
  it('should pass with valid CTG input', () => {
    expect(() => validateCTG(validCTG())).not.toThrow();
  });

  it('should throw when nroCartaPorte is missing', () => {
    const ctg = validCTG();
    (ctg as Record<string, unknown>).nroCartaPorte = undefined;
    expect(() => validateCTG(ctg)).toThrow(ArcaValidationError);
  });

  it('should throw when codEspecie is 0', () => {
    const ctg = validCTG();
    ctg.codEspecie = 0;
    expect(() => validateCTG(ctg)).toThrow(ArcaValidationError);
  });

  it('should throw when pesoNeto is 0', () => {
    const ctg = validCTG();
    ctg.pesoNeto = 0;
    expect(() => validateCTG(ctg)).toThrow(ArcaValidationError);
  });

  it('should throw when cuitDestino is invalid', () => {
    const ctg = validCTG();
    ctg.cuitDestino = 12345 as unknown as number;
    expect(() => validateCTG(ctg)).toThrow(ArcaValidationError);
  });

  it('should throw when cuitDestinatario is invalid', () => {
    const ctg = validCTG();
    ctg.cuitDestinatario = 0 as unknown as number;
    expect(() => validateCTG(ctg)).toThrow(ArcaValidationError);
  });

  it('should throw when codLocalidadOrigen is 0', () => {
    const ctg = validCTG();
    ctg.codLocalidadOrigen = 0;
    expect(() => validateCTG(ctg)).toThrow(ArcaValidationError);
  });

  it('should throw when codLocalidadDestino is 0', () => {
    const ctg = validCTG();
    ctg.codLocalidadDestino = 0;
    expect(() => validateCTG(ctg)).toThrow(ArcaValidationError);
  });

  it('should throw when codCosecha is missing', () => {
    const ctg = validCTG();
    (ctg as Record<string, unknown>).codCosecha = undefined;
    expect(() => validateCTG(ctg)).toThrow(ArcaValidationError);
  });

  it('should validate optional cuitTransportista when provided', () => {
    const ctg = validCTG();
    ctg.cuitTransportista = 999; // invalid
    expect(() => validateCTG(ctg)).toThrow(ArcaValidationError);
  });

  it('should pass when optional cuitTransportista is omitted', () => {
    const ctg = validCTG();
    delete ctg.cuitTransportista;
    expect(() => validateCTG(ctg)).not.toThrow();
  });

  it('should collect multiple errors at once', () => {
    const ctg = validCTG();
    ctg.codEspecie = 0;
    ctg.pesoNeto = 0;
    ctg.codLocalidadOrigen = 0;

    try {
      validateCTG(ctg);
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ArcaValidationError);
      const valError = error as ArcaValidationError;
      expect(valError.details.length).toBeGreaterThanOrEqual(3);
    }
  });
});

// ---------------------------------------------------------------------------
// Liquidacion Validation
// ---------------------------------------------------------------------------

describe('validateLiquidacion', () => {
  it('should pass with valid liquidacion input', () => {
    expect(() => validateLiquidacion(validLiquidacion())).not.toThrow();
  });

  it('should pass when precioRefTn is 0', () => {
    const liq = validLiquidacion();
    liq.precioRefTn = 0;
    expect(() => validateLiquidacion(liq)).not.toThrow();
  });

  it('should pass when precioRefTn is omitted', () => {
    const liq = validLiquidacion();
    delete liq.precioRefTn;
    expect(() => validateLiquidacion(liq)).not.toThrow();
  });

  it('should throw when cuitComprador is missing', () => {
    const liq = validLiquidacion();
    (liq as Record<string, unknown>).cuitComprador = undefined;
    expect(() => validateLiquidacion(liq)).toThrow(ArcaValidationError);
  });

  it('should throw when cuitVendedor is missing', () => {
    const liq = validLiquidacion();
    (liq as Record<string, unknown>).cuitVendedor = undefined;
    expect(() => validateLiquidacion(liq)).toThrow(ArcaValidationError);
  });

  it('should throw when codGrano is 0', () => {
    const liq = validLiquidacion();
    liq.codGrano = 0;
    expect(() => validateLiquidacion(liq)).toThrow(ArcaValidationError);
  });

  it('should throw when pesoNeto is 0', () => {
    const liq = validLiquidacion();
    liq.pesoNeto = 0;
    expect(() => validateLiquidacion(liq)).toThrow(ArcaValidationError);
  });

  it('should throw when pesoNeto is negative', () => {
    const liq = validLiquidacion();
    liq.pesoNeto = -100;
    expect(() => validateLiquidacion(liq)).toThrow(ArcaValidationError);
  });

  it('should throw when precioRefTn is negative', () => {
    const liq = validLiquidacion();
    liq.precioRefTn = -1;
    expect(() => validateLiquidacion(liq)).toThrow(ArcaValidationError);
  });

  it('should validate optional cuitCorredorVendedor when provided', () => {
    const liq = validLiquidacion();
    liq.cuitCorredorVendedor = 555; // invalid
    expect(() => validateLiquidacion(liq)).toThrow(ArcaValidationError);
  });

  it('should validate optional cuitCorredorComprador when provided', () => {
    const liq = validLiquidacion();
    liq.cuitCorredorComprador = 555; // invalid
    expect(() => validateLiquidacion(liq)).toThrow(ArcaValidationError);
  });

  it('should collect multiple errors at once', () => {
    const liq = validLiquidacion();
    (liq as Record<string, unknown>).cuitComprador = undefined;
    (liq as Record<string, unknown>).cuitVendedor = undefined;
    liq.codGrano = 0;
    liq.pesoNeto = -1;

    try {
      validateLiquidacion(liq);
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ArcaValidationError);
      const valError = error as ArcaValidationError;
      expect(valError.details.length).toBeGreaterThanOrEqual(4);
    }
  });
});

// ---------------------------------------------------------------------------
// Invalid CUIT format (cross-cutting)
// ---------------------------------------------------------------------------

describe('Invalid CUIT format', () => {
  it('should throw for CPE with non-11-digit cuitTitularCartaPorte', () => {
    const cpe = validCPE();
    cpe.cuitTitularCartaPorte = 12345;
    expect(() => validateCPE(cpe)).toThrow(ArcaValidationError);
  });

  it('should throw for CTG with non-11-digit cuitDestino', () => {
    const ctg = validCTG();
    ctg.cuitDestino = 9999999;
    expect(() => validateCTG(ctg)).toThrow(ArcaValidationError);
  });

  it('should throw for Liquidacion with non-11-digit cuitComprador', () => {
    const liq = validLiquidacion();
    liq.cuitComprador = 1;
    expect(() => validateLiquidacion(liq)).toThrow(ArcaValidationError);
  });

  it('should include field details in the thrown error', () => {
    const cpe = validCPE();
    cpe.cuitTitularCartaPorte = 12345;

    try {
      validateCPE(cpe);
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ArcaValidationError);
      const valError = error as ArcaValidationError;
      const cuitDetail = valError.details.find(d => d.field === 'cuitTitularCartaPorte');
      expect(cuitDetail).toBeDefined();
      expect(cuitDetail!.message).toContain('11 digitos');
      expect(cuitDetail!.value).toBe(12345);
    }
  });
});
