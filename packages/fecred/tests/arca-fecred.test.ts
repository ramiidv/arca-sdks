import { describe, it, expect, vi } from 'vitest';
import { ArcaValidationError, WsaaClient } from '@ramiidv/arca-common';
import { ArcaFecred, ENDPOINTS } from '../src/index.js';
import { mockFetch, sentRequest, soapResponse, xmlResponse } from './helpers.js';

function fakeWsaa() {
  return {
    getAccessTicket: vi.fn(async () => ({ token: 'T', sign: 'S', expirationTime: '2099-01-01T00:00:00Z' })),
    clearTicket: vi.fn(async () => {}),
  } as unknown as WsaaClient & { getAccessTicket: ReturnType<typeof vi.fn>; clearTicket: ReturnType<typeof vi.fn> };
}

const base = { cert: 'CERT', key: 'KEY' };

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
    const fecred = new ArcaFecred({ ...base, cuit: '20-12345678-6', wsaa, fetch: fetch as unknown as typeof globalThis.fetch });
    const r = await fecred.consultarObligadoRecepcion(30712345671);
    expect(r.obligado).toBe(true);
    expect(wsaa.getAccessTicket).toHaveBeenCalledWith('wsfecred', undefined);
    const { body } = sentRequest(fetch);
    expect(body['ser:consultarObligadoRecepcionRequest'].authRequest).toEqual({
      token: 'T',
      sign: 'S',
      cuitRepresentada: '20123456786',
    });
    expect(fetch.mock.calls[0][0]).toBe(ENDPOINTS.wsfecred.testing);
  });

  it('valida los parámetros antes de pedir el ticket a WSAA', async () => {
    const wsaa = fakeWsaa();
    const fetch = mockFetch();
    const fecred = new ArcaFecred({ ...base, cuit: 20123456786, wsaa, fetch: fetch as unknown as typeof globalThis.fetch });
    await expect(fecred.consultarCtasCtes({ rol: 'Emisor', cuitContraparte: '123' })).rejects.toThrow(ArcaValidationError);
    expect(wsaa.getAccessTicket).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('producción y endpoints sobrescritos', async () => {
    const dummy = () =>
      xmlResponse(soapResponse('dummy', '<dummyReturn><appserver>OK</appserver><authserver>OK</authserver><dbserver>OK</dbserver></dummyReturn>'));
    const fetch = mockFetch(dummy(), dummy());
    const f = fetch as unknown as typeof globalThis.fetch;
    await new ArcaFecred({ ...base, cuit: 20123456786, production: true, fetch: f }).status();
    await new ArcaFecred({ ...base, cuit: 20123456786, fetch: f, endpoints: { wsfecred: 'https://proxy.local/fecred' } }).status();
    expect(fetch.mock.calls[0][0]).toBe(ENDPOINTS.wsfecred.production);
    expect(fetch.mock.calls[1][0]).toBe('https://proxy.local/fecred');
  });

  it('pasa el signal de CallOptions', async () => {
    const fetch = mockFetch(
      xmlResponse(soapResponse('dummy', '<dummyReturn><appserver>OK</appserver><authserver>OK</authserver><dbserver>OK</dbserver></dummyReturn>')),
    );
    const ctrl = new AbortController();
    ctrl.abort();
    const fecred = new ArcaFecred({ ...base, cuit: 20123456786, fetch: fetch as unknown as typeof globalThis.fetch });
    await expect(fecred.status({ signal: ctrl.signal })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('clearAuthCache descarta el ticket de wsfecred', async () => {
    const wsaa = fakeWsaa();
    await new ArcaFecred({ ...base, cuit: 20123456786, wsaa }).clearAuthCache();
    expect(wsaa.clearTicket).toHaveBeenCalledWith('wsfecred');
  });
});
