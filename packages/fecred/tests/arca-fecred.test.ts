import { soapFaultResponse, testCert } from '@ramiidv/arca-common/testing';
import { describe, it, expect, vi } from 'vitest';
import { ArcaValidationError, WSAA_ENDPOINTS, type WsaaClient } from '@ramiidv/arca-common';
import * as sdk from '../src/index.js';
import { ArcaFecred, ENDPOINTS, FECRED_NAMESPACE, FECRED_SERVICE_ID } from '../src/index.js';
import { mockFetch, sentRequest, soapResponse, xmlResponse } from './helpers.js';

function fakeWsaa() {
  return {
    getAccessTicket: vi.fn(async () => ({ token: 'T', sign: 'S', expirationTime: '2099-01-01T00:00:00Z' })),
    clearTicket: vi.fn(async () => {}),
  } as unknown as WsaaClient & { getAccessTicket: ReturnType<typeof vi.fn>; clearTicket: ReturnType<typeof vi.fn> };
}

const base = { ...testCert() };

describe('ArcaFecred', () => {
  it('valida el CUIT del config con dígito verificador y lo envía como dígitos', async () => {
    expect(() => new ArcaFecred({ ...base, cuit: '20-12345678-0' })).toThrow(ArcaValidationError);
    const wsaa = fakeWsaa();
    const fetch = mockFetch(
      xmlResponse(
        soapResponse(
          'consultarMontoObligadoRecepcion',
          '<consultarMontoObligadoRecepcionReturn><obligado>S</obligado></consultarMontoObligadoRecepcionReturn>',
        ),
      ),
    );
    const fecred = new ArcaFecred({
      ...base,
      cuit: '20-12345678-6',
      wsaa,
      fetch: fetch,
    });
    const r = await fecred.consultarMontoObligadoRecepcion({ cuitConsultada: 30712345671, fechaEmision: '2026-11-01' });
    expect(r.obligado).toBe(true);
    expect(wsaa.getAccessTicket).toHaveBeenCalledWith('wsfecred', {});
    const { body } = sentRequest(fetch);
    expect(body['ser:consultarMontoObligadoRecepcionRequest'].authRequest).toEqual({
      token: 'T',
      sign: 'S',
      cuitRepresentada: '20123456786',
    });
    expect(fetch.calls[0].url).toBe(ENDPOINTS.wsfecred.testing);
  });

  it('valida los parámetros antes de pedir el ticket a WSAA', async () => {
    const wsaa = fakeWsaa();
    const fetch = mockFetch();
    const fecred = new ArcaFecred({
      ...base,
      cuit: 20123456786,
      wsaa,
      fetch: fetch,
    });
    await expect(fecred.consultarCtasCtes({ rol: 'Emisor', cuitContraparte: '123' })).rejects.toThrow(
      ArcaValidationError,
    );
    expect(wsaa.getAccessTicket).not.toHaveBeenCalled();
    expect(fetch.calls).toHaveLength(0);
  });

  it('producción y endpoints sobrescritos', async () => {
    const dummy = () =>
      xmlResponse(
        soapResponse(
          'dummy',
          '<dummyReturn><appserver>OK</appserver><authserver>OK</authserver><dbserver>OK</dbserver></dummyReturn>',
        ),
      );
    const fetch = mockFetch(dummy(), dummy());
    const f = fetch;
    await new ArcaFecred({ ...base, cuit: 20123456786, production: true, fetch: f }).status();
    await new ArcaFecred({
      ...base,
      cuit: 20123456786,
      fetch: f,
      endpoints: { wsfecred: 'https://proxy.local/fecred' },
    }).status();
    expect(fetch.calls[0].url).toBe(ENDPOINTS.wsfecred.production);
    expect(fetch.calls[1].url).toBe('https://proxy.local/fecred');
  });

  it('pasa el signal de CallOptions', async () => {
    const fetch = mockFetch(
      xmlResponse(
        soapResponse(
          'dummy',
          '<dummyReturn><appserver>OK</appserver><authserver>OK</authserver><dbserver>OK</dbserver></dummyReturn>',
        ),
      ),
    );
    const ctrl = new AbortController();
    ctrl.abort();
    const fecred = new ArcaFecred({ ...base, cuit: 20123456786, fetch: fetch });
    await expect(fecred.status({ signal: ctrl.signal })).rejects.toThrow();
    expect(fetch.calls).toHaveLength(0);
  });

  it('config.signal cancela todas las llamadas', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const fetch = mockFetch();
    const fecred = new ArcaFecred({ ...base, cuit: 20123456786, fetch, signal: ctrl.signal });
    await expect(fecred.status()).rejects.toThrow();
    expect(fetch.calls).toHaveLength(0);
  });

  it('emite eventos de request a config.onEvent y a on()', async () => {
    const fetch = mockFetch(
      xmlResponse(
        soapResponse(
          'dummy',
          '<dummyReturn><appserver>OK</appserver><authserver>OK</authserver><dbserver>OK</dbserver></dummyReturn>',
        ),
      ),
    );
    const onEvent = vi.fn();
    const handler = vi.fn();
    const fecred = new ArcaFecred({ ...base, cuit: 20123456786, fetch, onEvent });
    fecred.on('request:end', handler);
    await fecred.status();
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'request:end', method: 'dummy' }));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(fecred.cuit).toBe('20123456786');
  });

  it('ENDPOINTS solo tiene URLs por servicio; namespace e id de WSAA van aparte', () => {
    expect(ENDPOINTS).toEqual({
      wsfecred: {
        testing: 'https://fwshomo.afip.gob.ar/wsfecred/FECredService',
        production: 'https://serviciosjava.afip.gob.ar/wsfecred/FECredService',
      },
    });
    expect(FECRED_NAMESPACE).toBe('http://ar.gob.afip.wsfecred/FECredService/');
    expect(FECRED_SERVICE_ID).toBe('wsfecred');
    expect(ENDPOINTS).not.toHaveProperty('wsaa');
  });

  it('endpoints.wsaa sobrescribe la URL de WSAA (por defecto, WSAA_ENDPOINTS de common)', () => {
    expect(new ArcaFecred({ ...base, cuit: 20123456786 }).wsaa.endpoint).toBe(WSAA_ENDPOINTS.testing);
    const fecred = new ArcaFecred({ ...base, cuit: 20123456786, endpoints: { wsaa: 'https://proxy.local/wsaa' } });
    expect(fecred.wsaa.endpoint).toBe('https://proxy.local/wsaa');
  });

  it('consultarObligadoRecepcion (deprecada por el manual) ya no existe', () => {
    const fecred = new ArcaFecred({ ...base, cuit: 20123456786, wsaa: fakeWsaa() });
    expect('consultarObligadoRecepcion' in fecred).toBe(false);
    expect('consultarObligadoRecepcion' in fecred.client).toBe(false);
  });

  it('exporta ArcaRechazoError y ArcaResponseError', () => {
    expect(sdk.ArcaRechazoError).toBeTypeOf('function');
    expect(sdk.ArcaResponseError).toBeTypeOf('function');
  });

  it('clearAuthCache descarta el ticket de wsfecred', async () => {
    const wsaa = fakeWsaa();
    await new ArcaFecred({ ...base, cuit: 20123456786, wsaa }).clearAuthCache();
    expect(wsaa.clearTicket).toHaveBeenCalledWith('wsfecred');
  });
});

describe('ArcaFecred: wrappers de las operaciones', () => {
  const ID = { cuitEmisor: '30712345671', codTipoCmp: 201, ptoVta: 3, nroCmp: 125 };
  const MOTIVOS = [{ codMotivo: 1, descMotivo: 'Motivo', justificacion: 'Justificación' }];

  /** [método de ArcaFecred, argumentos, operación SOAP, fragmento del XML que prueba que llegaron los params]. */
  const casos: [keyof ArcaFecred, unknown[], string, string | undefined][] = [
    [
      'consultarMontoObligadoRecepcion',
      [{ cuitConsultada: 30712345671, fechaEmision: '2026-11-01' }],
      'consultarMontoObligadoRecepcion',
      '<cuitConsultada>30712345671</cuitConsultada>',
    ],
    [
      'consultarCtasCtes',
      [{ rol: 'Emisor' }],
      'consultarCtasCtes',
      '<rolCUITRepresentada>Emisor</rolCUITRepresentada>',
    ],
    ['consultarCtaCte', [{ codCtaCte: 77 }], 'consultarCtaCte', '<codCtaCte>77</codCtaCte>'],
    [
      'consultarComprobantes',
      [{ rol: 'Receptor' }],
      'consultarComprobantes',
      '<rolCUITRepresentada>Receptor</rolCUITRepresentada>',
    ],
    ['consultarHistorialEstadosComprobante', [ID], 'consultarHistorialEstadosComprobante', '<nroCmp>125</nroCmp>'],
    [
      'consultarHistorialEstadosCtaCte',
      [{ codCtaCte: 5 }],
      'consultarHistorialEstadosCtaCte',
      '<codCtaCte>5</codCtaCte>',
    ],
    ['obtenerRemitos', [ID], 'obtenerRemitos', '<CUITEmisor>30712345671</CUITEmisor>'],
    [
      'aceptarFECred',
      [{ idCtaCte: { codCtaCte: 1 }, saldoAceptado: 10, codMoneda: 'PES', cotizacionMonedaUlt: 1 }],
      'aceptarFECred',
      '<saldoAceptado>10.00</saldoAceptado>',
    ],
    [
      'rechazarFECred',
      [{ idCtaCte: { codCtaCte: 1 }, motivos: MOTIVOS }],
      'rechazarFECred',
      '<codMotivo>1</codMotivo>',
    ],
    [
      'informarCancelacionTotalFECred',
      [
        {
          idCtaCte: { codCtaCte: 77 },
          formasCancelacion: [{ codigo: 1, descripcion: 'Transferencia' }],
          importeCancelacion: 1500.5,
        },
      ],
      'informarCancelacionTotalFECred',
      '<importeCancelacion>1500.50</importeCancelacion>',
    ],
    ['rechazarNotaDC', [{ idComprobante: ID, motivos: MOTIVOS }], 'rechazarNotaDC', '<nroCmp>125</nroCmp>'],
    [
      'modificarOpcionTransferencia',
      [{ idCtaCte: { codCtaCte: 1 }, opcionTransferencia: 'ADC' }],
      'modificarOpcionTransferencia',
      '<opcionTransferencia>ADC</opcionTransferencia>',
    ],
    [
      'informarFacturaAgtDptoCltv',
      [{ idCtaCte: { codCtaCte: 1 }, ctaAgente: { cuitAgente: '30500012346', idCuenta: 'CTA-001' } }],
      'informarFacturaAgtDptoCltv',
      '<idCuenta>CTA-001</idCuenta>',
    ],
    ['consultarCuentasEnAgtDptoCltv', [], 'consultarCuentasEnAgtDptoCltv', undefined],
    [
      'consultarFacturasAgtDptoCltv',
      [{ idCtaCte: { codCtaCte: 5 } }],
      'consultarFacturasAgtDptoCltv',
      '<codCtaCte>5</codCtaCte>',
    ],
    ['consultarTiposRetenciones', [], 'consultarTiposRetenciones', undefined],
    ['consultarTiposFormasCancelacion', [], 'consultarTiposFormasCancelacion', undefined],
    ['consultarTiposMotivosRechazo', [], 'consultarTiposMotivosRechazo', undefined],
    ['consultarTiposAjustesOperacion', [], 'consultarTiposAjustesOperacion', undefined],
  ];

  it.each(casos)('%s: operación SOAP, authRequest y parámetros', async (metodo, args, operacion, fragmento) => {
    const wsaa = fakeWsaa();
    // La respuesta no importa: se verifica el request enviado.
    const fetch = mockFetch(soapFaultResponse('soap:Client', 'respuesta de prueba'));
    const fecred = new ArcaFecred({ ...base, cuit: '20-12345678-6', wsaa, fetch, retries: 0 });
    const llamar = fecred[metodo] as (...a: unknown[]) => Promise<unknown>;
    await llamar.call(fecred, ...args).catch(() => undefined);

    expect(wsaa.getAccessTicket).toHaveBeenCalledWith('wsfecred', {});
    expect(fetch.calls).toHaveLength(1);
    const { soapAction, body, xml } = sentRequest(fetch);
    expect(soapAction).toBe(`"${FECRED_NAMESPACE}${operacion}"`);
    expect(body[`ser:${operacion}Request`].authRequest).toEqual({
      token: 'T',
      sign: 'S',
      cuitRepresentada: '20123456786',
    });
    if (fragmento) expect(xml).toContain(fragmento);
  });

  it('cubre todos los métodos públicos de operaciones', () => {
    const metodos = Object.getOwnPropertyNames(ArcaFecred.prototype).filter(
      (m) => m !== 'constructor' && m !== 'status' && m !== 'auth',
    );
    expect(casos.map((c) => c[0]).sort()).toEqual(metodos.sort());
  });
});
