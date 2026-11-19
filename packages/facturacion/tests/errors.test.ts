import { describe, expect, it } from 'vitest';
import { ArcaAuthError } from '@ramiidv/arca-common';
import {
  ArcaConflictoExpo,
  ArcaResultadoIncierto,
  ArcaResultadoInciertoExpo,
  ArcaWSFEError,
  authErrorDe,
} from '../src/errors.js';
import { WSFE_ERRORES_AUTH, WSFEX_ERRORES_AUTH } from '../src/constants.js';
import type { IntentoComprobante, WsfexInvoice } from '../src/types.js';

const INTENTO: IntentoComprobante = {
  ptoVta: 1,
  cbteTipo: 6,
  cbteNro: 150,
  importeTotal: 121,
  docTipo: 99,
  docNro: 0,
  fecha: '20261030',
};

const INVOICE: WsfexInvoice = {
  id: 42,
  cbteTipo: 19,
  fechaCbte: '20261030',
  puntoVta: 3,
  cbteNro: 10,
  tipoExpo: 1,
  permisoExistente: 'N',
  dstCmp: 203,
  cliente: 'ACME LTDA',
  cuitPaisCliente: 50000000059,
  domicilioCliente: 'Rua 1',
  monedaId: 'DOL',
  monedaCtz: 1000,
  idiomaCbte: 1,
  impTotal: 10,
  items: [],
};

describe('authErrorDe', () => {
  it('faultCode es el código de autenticación, aunque no sea el primero', () => {
    const err = authErrorDe(
      new ArcaWSFEError([
        { code: 10016, msg: 'Número' },
        { code: 600, msg: 'ValidacionDeToken' },
      ]),
      WSFE_ERRORES_AUTH,
    );
    expect(err).toBeInstanceOf(ArcaAuthError);
    expect(err.faultCode).toBe('600');
    expect(err.retryable).toBe(false);
    expect(err.cause).toBeInstanceOf(ArcaWSFEError);
  });

  it('usa los códigos del servicio indicado (WSFEX 1000/1001)', () => {
    const error = new ArcaWSFEError(
      [
        { code: 600, msg: 'Otro' },
        { code: 1001, msg: 'Token vencido' },
      ],
      'WSFEX',
    );
    expect(authErrorDe(error, WSFEX_ERRORES_AUTH).faultCode).toBe('1001');
  });

  it('sin código de autenticación usa el primero (o "" si no hay errores)', () => {
    expect(authErrorDe(new ArcaWSFEError([{ code: 5, msg: 'x' }]), WSFE_ERRORES_AUTH).faultCode).toBe('5');
    expect(authErrorDe(new ArcaWSFEError([]), WSFE_ERRORES_AUTH).faultCode).toBe('');
  });
});

describe('ArcaWSFEError', () => {
  it('conserva el código original no numérico (rawCode) y lo muestra en el mensaje', () => {
    const err = new ArcaWSFEError([{ code: 0, msg: 'Error raro', rawCode: 'ERR_X' }], 'WSFEX');
    expect(err.errors[0].rawCode).toBe('ERR_X');
    expect(err.message).toBe('WSFEX Error: [ERR_X] Error raro');
  });
});

describe('ArcaResultadoIncierto', () => {
  it('sin intentos lanza TypeError (siempre hay al menos un comprobante enviado)', () => {
    expect(() => new ArcaResultadoIncierto('FECAESolicitar', [])).toThrow(TypeError);
  });

  it('una causa que no es Error no se agrega al mensaje, pero queda en cause', () => {
    const err = new ArcaResultadoIncierto('FECAESolicitar', [INTENTO], { cause: 'texto' });
    expect(err.message).toMatch(/^Resultado incierto de FECAESolicitar para el comprobante 6-1-150\. No se reintentó/);
    expect(err.cause).toBe('texto');
    expect(err.intento).toBe(INTENTO);
    expect(err.intentos).toEqual([INTENTO]);
  });

  it('con una causa Error agrega su mensaje', () => {
    const err = new ArcaResultadoIncierto('FECAEARegInformativo', [INTENTO], { cause: new Error('timeout') });
    expect(err.message).toContain('6-1-150: timeout.');
  });
});

describe('ArcaResultadoInciertoExpo', () => {
  it('expone el intento y el request; una causa que no es Error no va al mensaje', () => {
    const err = new ArcaResultadoInciertoExpo(INVOICE, { cause: 42 });
    expect(err.intento).toEqual({ id: 42, cbteNro: 10, fecha: '20261030' });
    expect(err.request).toBe(INVOICE);
    expect(err.message).toMatch(/19-3-10\. No se reintentó/);
    expect(err.cause).toBe(42);
  });
});

describe('ArcaConflictoExpo', () => {
  it('con FEXResultAuth informa el comprobante que devolvió WSFEX', () => {
    const err = new ArcaConflictoExpo(
      INVOICE,
      { fexResultAuth: { cbteTipo: 19, puntoVta: 3, cbteNro: 7 } } as never,
      'detalle',
    );
    expect(err.message).toContain('WSFEX devolvió el comprobante 19-3-7; el 19-3-10 no se autorizó');
    expect(err.id).toBe(42);
  });

  it('sin FEXResultAuth no muestra "undefined"', () => {
    const err = new ArcaConflictoExpo(INVOICE, {} as never, 'Reproceso="S"');
    expect(err.message).toContain('WSFEX devolvió la respuesta de otra solicitud; el 19-3-10 no se autorizó');
    expect(err.message).not.toContain('undefined');
  });
});
