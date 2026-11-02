import { testCert } from '@ramiidv/arca-common/testing';
import { describe, it, expect, vi } from 'vitest';
import { ArcaValidationError, type WsaaClient } from '@ramiidv/arca-common';
import { ArcaFecred, ENDPOINTS } from '../src/index.js';
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
          'consultarObligadoRecepcion',
          '<consultarObligadoRecepcionReturn><respuesta>S</respuesta></consultarObligadoRecepcionReturn>',
        ),
      ),
    );
    const fecred = new ArcaFecred({
      ...base,
      cuit: '20-12345678-6',
      wsaa,
      fetch: fetch,
    });
    const r = await fecred.consultarObligadoRecepcion(30712345671);
    expect(r.obligado).toBe(true);
    expect(wsaa.getAccessTicket).toHaveBeenCalledWith('wsfecred', {});
    const { body } = sentRequest(fetch);
    expect(body['ser:consultarObligadoRecepcionRequest'].authRequest).toEqual({
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

  it('clearAuthCache descarta el ticket de wsfecred', async () => {
    const wsaa = fakeWsaa();
    await new ArcaFecred({ ...base, cuit: 20123456786, wsaa }).clearAuthCache();
    expect(wsaa.clearTicket).toHaveBeenCalledWith('wsfecred');
  });
});
