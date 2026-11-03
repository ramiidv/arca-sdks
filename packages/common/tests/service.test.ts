import { describe, expect, it } from 'vitest';
import {
  ArcaSdkBase,
  ArcaResponseError,
  ArcaSoapError,
  ArcaValidationError,
  type ArcaEvent,
  type ArcaSdkConfig,
  type CallOptions,
  type ServerStatus,
  SoapServiceClient,
  parseServerStatus,
  serverStatusOk,
  statusOf,
  WsaaClient,
  WSAA_ENDPOINTS,
} from '../src/index.js';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileTicketStorage } from '../src/ticket-storage.js';
import {
  childOrder,
  fakeTicketStorage,
  mockFetch,
  mockFetchByMethod,
  requestParams,
  soapFaultResponse,
  soapResponse,
  testCert,
} from '../src/testing.js';

const NS = 'http://example.afip.gob.ar/ws/';
const ENDPOINTS = { production: 'https://prod.example/ws', testing: 'https://homo.example/ws' };

class DemoClient extends SoapServiceClient {
  async dummy(opts?: CallOptions): Promise<ServerStatus> {
    return parseServerStatus(await this.soapCall('dummy', {}, { signal: opts?.signal }));
  }
  async consultar(auth: { token: string }, opts?: CallOptions): Promise<Record<string, unknown>> {
    return this.soapCall('consultar', { auth: { token: auth.token } }, { signal: opts?.signal });
  }
}

class Demo extends ArcaSdkBase<'demo'> {
  readonly client: DemoClient;
  constructor(config: ArcaSdkConfig & { endpoints?: { wsaa?: string; demo?: string } }) {
    super(config, { demo: 'ws_demo' });
    this.client = new DemoClient({
      endpoint: this.endpoint(ENDPOINTS, config.endpoints?.demo),
      namespace: NS,
      transport: this.transport,
    });
  }
  async consultar(opts?: CallOptions) {
    const t = await this.ticket('demo', opts);
    return this.client.consultar(t, this.callOptions(opts));
  }
}

function demo(extra: Partial<ArcaSdkConfig> & { endpoints?: { demo?: string } } = {}) {
  return new Demo({ ...testCert(), cuit: '20-12345678-6', ticketStorage: fakeTicketStorage(), ...extra });
}

const DUMMY = soapResponse(
  'dummyResponse',
  '<return><appserver>OK</appserver><dbserver>OK</dbserver><authserver>OK</authserver></return>',
  NS,
);

describe('ArcaSdkBase', () => {
  it('normaliza la CUIT y valida el dígito verificador', () => {
    expect(demo().cuit).toBe('20123456786');
    expect(() => demo({ cuit: '20123456789' })).toThrow(ArcaValidationError);
  });

  it('elige el endpoint según el entorno o el indicado', () => {
    expect(demo().client.endpoint).toBe(ENDPOINTS.testing);
    expect(demo({ production: true }).client.endpoint).toBe(ENDPOINTS.production);
    expect(demo({ endpoints: { demo: 'https://proxy.test/ws' } }).client.endpoint).toBe('https://proxy.test/ws');
  });

  it('reutiliza un WsaaClient compartido', () => {
    const wsaa = new WsaaClient({ ...testCert() });
    expect(demo({ wsaa }).wsaa).toBe(wsaa);
  });

  it('usa el ticket del servicio y el transporte de la config', async () => {
    const fetch = mockFetch(soapResponse('consultarResponse', '<return><ok>1</ok></return>', NS));
    const result = await demo({ fetch }).consultar();
    expect(result).toEqual({ ok: 1 });
    expect(fetch.calls[0].url).toBe(ENDPOINTS.testing);
    expect(requestParams(fetch.calls[0].body)).toEqual({ auth: { token: 'TOKEN' } });
  });

  it('emite los eventos a onEvent y a los suscriptos con on()', async () => {
    const fromConfig: string[] = [];
    const fromOn: string[] = [];
    const sdk = demo({ fetch: mockFetch(DUMMY), onEvent: (e) => fromConfig.push(e.type) });
    const handler = (e: ArcaEvent) => fromOn.push(e.type);
    sdk.on('request:end', handler);
    await sdk.client.dummy();
    sdk.off('request:end', handler);
    expect(fromConfig).toContain('request:end');
    expect(fromOn).toEqual(['request:end']);
  });

  it('combina el signal global con el de la llamada', async () => {
    const global = new AbortController();
    const sdk = demo({ signal: global.signal, fetch: mockFetch() });
    global.abort();
    await expect(sdk.consultar()).rejects.toThrow();
  });

  it('clearAuthCache borra los tickets de sus servicios', async () => {
    const cleared: string[] = [];
    const sdk = demo();
    sdk.wsaa.clearTicket = async (service: string) => {
      cleared.push(service);
    };
    await sdk.clearAuthCache();
    expect(cleared).toEqual(['ws_demo']);
  });
});

describe('parseServerStatus', () => {
  it('acepta cualquier capitalización', () => {
    expect(parseServerStatus({ AppServer: 'OK', DbServer: 'OK', AuthServer: 'OK' })).toEqual({
      appserver: 'OK',
      dbserver: 'OK',
      authserver: 'OK',
    });
  });

  it('lanza ArcaResponseError si falta un campo o la respuesta no es un objeto', () => {
    expect(() => parseServerStatus({ appserver: 'OK', dbserver: 'OK' }, 'FEDummy')).toThrow(ArcaResponseError);
    expect(() => parseServerStatus({ appserver: 'OK', dbserver: {}, authserver: 'OK' })).toThrow(/falta dbserver/);
    expect(() => parseServerStatus(null as never)).toThrow(ArcaResponseError);
  });
});

describe('testing', () => {
  it('mockFetchByMethod despacha por método y repite la última respuesta', async () => {
    const fetch = mockFetchByMethod({ dummy: DUMMY, consultar: [soapFaultResponse('soap:Server', 'boom')] });
    const sdk = demo({ fetch, retries: 0 });
    await sdk.client.dummy();
    await sdk.client.dummy();
    await expect(sdk.consultar()).rejects.toThrow(ArcaSoapError);
    expect(fetch.calls.map((c) => c.method)).toEqual(['dummy', 'dummy', 'consultar']);
  });

  it('childOrder devuelve los hijos en orden de documento', () => {
    const xml = '<a><ns:b/><c><d/></c><e>1</e></a>';
    expect(childOrder(xml, 'a')).toEqual(['b', 'c', 'e']);
    expect(childOrder(xml, 'c')).toEqual(['d']);
  });
});

describe('ArcaSdkBase: WsaaClient compartido de otro entorno', () => {
  it('lanza ArcaValidationError si config.wsaa es de otro entorno', () => {
    const prod = new WsaaClient({ ...testCert(), production: true });
    expect(() => demo({ wsaa: prod })).toThrow(ArcaValidationError);
    expect(() => demo({ wsaa: prod })).toThrow(/producción.*homologación/);
    expect(demo({ wsaa: prod, production: true }).wsaa).toBe(prod);
    const homo = new WsaaClient({ ...testCert() });
    expect(() => demo({ wsaa: homo, production: true })).toThrow(ArcaValidationError);
  });

  it('con un endpoint WSAA propio no se valida', () => {
    const proxy = new WsaaClient({ ...testCert(), endpoint: 'https://proxy.test/wsaa', production: true });
    expect(demo({ wsaa: proxy }).wsaa).toBe(proxy);
    const official = new WsaaClient({ ...testCert(), endpoint: WSAA_ENDPOINTS.production });
    expect(() => demo({ wsaa: official })).toThrow(ArcaValidationError);
  });
});

describe('statusOf / serverStatusOk', () => {
  const OK = { appserver: 'OK', dbserver: 'OK', authserver: 'OK' };

  it('ok solo si respondió y todos los servidores están en OK (sin distinguir mayúsculas)', async () => {
    const r = await statusOf({
      a: async () => OK,
      b: async () => ({ appserver: 'ok', dbserver: 'Ok', authserver: 'OK' }),
      c: async () => ({ ...OK, dbserver: 'DOWN' }),
      d: async () => {
        throw new ArcaSoapError('caído');
      },
      e: () => Promise.reject('texto'),
    });
    expect(r.a).toEqual({ ok: true, status: OK });
    expect(r.b.ok).toBe(true);
    expect(r.c).toMatchObject({ ok: false, status: { ...OK, dbserver: 'DOWN' } });
    expect(!r.c.ok && r.c.error).toBeInstanceOf(ArcaResponseError);
    expect(!r.c.ok && r.c.error.message).toMatch(/dbserver=DOWN/);
    expect(r.d).toMatchObject({ ok: false, error: expect.any(ArcaSoapError) });
    expect(r.d).not.toHaveProperty('status');
    expect(!r.e.ok && r.e.error.message).toBe('texto');
  });

  it('serverStatusOk', () => {
    expect(serverStatusOk(OK)).toBe(true);
    expect(serverStatusOk({ ...OK, authserver: ' ok ' })).toBe(true);
    expect(serverStatusOk({ ...OK, appserver: 'NO' })).toBe(false);
    expect(serverStatusOk({} as ServerStatus)).toBe(false);
  });
});

describe('FileTicketStorage: nombres de archivo', () => {
  it('sanitiza la key: sin separadores de ruta ni caracteres especiales', async () => {
    const base = await mkdtemp(join(tmpdir(), 'arca-tickets-'));
    const dir = join(base, 'tickets');
    try {
      const storage = new FileTicketStorage(dir);
      const ticket = { token: 't', sign: 's', expirationTime: new Date(Date.now() + 3_600_000).toISOString() };
      await storage.set('homo:abc/../../x\\y:ws fe*?', ticket);
      expect(await readdir(dir)).toEqual(['homo_abc_.._.._x_y_ws_fe__.json']);
      expect(await readdir(base)).toEqual(['tickets']);
      expect(await storage.get('homo:abc/../../x\\y:ws fe*?')).toEqual(ticket);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
