import { describe, expect, it } from 'vitest';
import {
  ArcaAuthError,
  ArcaError,
  ArcaRechazoError,
  ArcaServiceError,
  ArcaSoapError,
  ArcaTicketVigenteError,
  ArcaValidationError,
} from '../src/errors.js';

/** Simula una segunda copia del paquete (ej: build CJS cargado junto al ESM). */
async function loadSecondCopy() {
  const url = new URL('../src/errors.ts', import.meta.url);
  url.searchParams.set('copy', '2');
  return (await import(/* @vite-ignore */ url.href)) as typeof import('../src/errors.js');
}

describe('errores', () => {
  it('tienen code estable y respetan la jerarquía', () => {
    const err = new ArcaTicketVigenteError('wsfe');
    expect(err.code).toBe('ARCA_TICKET_VIGENTE');
    expect(err.name).toBe('ArcaTicketVigenteError');
    expect(err).toBeInstanceOf(ArcaAuthError);
    expect(err).toBeInstanceOf(ArcaError);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(ArcaSoapError);
    expect(new ArcaValidationError('x', []).code).toBe('ARCA_VALIDATION_ERROR');
  });

  it('ArcaRechazoError es un ArcaServiceError con operacion, errors y observaciones', () => {
    const err = new ArcaRechazoError('rechazado', {
      operacion: 'FECAESolicitar',
      errors: [{ code: 10016, msg: 'x' }],
      observaciones: [{ code: 10017, msg: 'y' }],
    });
    expect(err.code).toBe('ARCA_RECHAZO');
    expect(err.name).toBe('ArcaRechazoError');
    expect(err).toBeInstanceOf(ArcaServiceError);
    expect(err.operacion).toBe('FECAESolicitar');
    expect(err.errors).toEqual([{ code: 10016, msg: 'x' }]);
    expect(err.observaciones).toEqual([{ code: 10017, msg: 'y' }]);
    const sinDetalle = new ArcaRechazoError('r', { operacion: 'm' });
    expect(sinDetalle.errors).toEqual([]);
    expect(sinDetalle.observaciones).toEqual([]);
  });

  it('ArcaSoapError acepta el statusCode posicional (compatibilidad)', () => {
    const err = new ArcaSoapError('HTTP 500', 500);
    expect(err.statusCode).toBe(500);
    expect(err.uncertain).toBe(false);
  });

  it('instanceof funciona entre copias distintas del paquete', async () => {
    const copy = await loadSecondCopy();
    expect(copy.ArcaAuthError).not.toBe(ArcaAuthError);

    const fromCopy = new copy.ArcaTicketVigenteError('wsfe');
    expect(fromCopy).toBeInstanceOf(ArcaTicketVigenteError);
    expect(fromCopy).toBeInstanceOf(ArcaAuthError);
    expect(fromCopy).toBeInstanceOf(ArcaError);
    expect(fromCopy).not.toBeInstanceOf(ArcaSoapError);

    expect(new ArcaSoapError('x')).toBeInstanceOf(copy.ArcaError);

    const rechazo = new copy.ArcaRechazoError('r', { operacion: 'm' });
    expect(rechazo).toBeInstanceOf(ArcaRechazoError);
    expect(rechazo).toBeInstanceOf(ArcaServiceError);
    expect(new copy.ArcaServiceError('x', [])).not.toBeInstanceOf(ArcaRechazoError);
  });

  it('instanceof no da falsos positivos con objetos ajenos', () => {
    expect({ name: 'ArcaError' }).not.toBeInstanceOf(ArcaError);
    expect(new Error('x')).not.toBeInstanceOf(ArcaError);
    expect(null).not.toBeInstanceOf(ArcaError);
  });
});

describe('errores: code estático', () => {
  it('el code está en la clase y en la instancia', () => {
    expect(ArcaSoapError.code).toBe('ARCA_SOAP_ERROR');
    expect(new ArcaSoapError('x').code).toBe('ARCA_SOAP_ERROR');
  });

  it('instanceof entre copias no depende del nombre de la clase (minificación)', async () => {
    const copy = await loadSecondCopy();
    Object.defineProperty(copy.ArcaAuthError, 'name', { value: 'a' });
    expect(new copy.ArcaAuthError('x')).toBeInstanceOf(ArcaAuthError);
  });
});

describe('cause en ArcaServiceError, ArcaRechazoError y ArcaValidationError', async () => {
  const { ArcaServiceError } = await import('../src/errors.js');

  it('aceptan cause opcional manteniendo la firma anterior', () => {
    const root = new Error('raíz');
    const svc = new ArcaServiceError('x', [{ code: 1, msg: 'm' }], { cause: root });
    expect(svc.cause).toBe(root);
    expect(svc.errors).toEqual([{ code: 1, msg: 'm' }]);
    expect(new ArcaServiceError('x', []).cause).toBeUndefined();

    const rechazo = new ArcaRechazoError('x', { operacion: 'm' }, { cause: root });
    expect(rechazo.cause).toBe(root);

    const val = new ArcaValidationError('x', [], 'campo', { cause: root });
    expect(val.cause).toBe(root);
    expect(val.field).toBe('campo');
    expect(new ArcaValidationError('x', []).field).toBeUndefined();
  });
});
