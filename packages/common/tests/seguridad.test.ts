import { execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspect } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateEndpoint } from '../src/endpoint.js';
import { ArcaAuthError, ArcaResponseError, ArcaSoapError, ArcaValidationError } from '../src/errors.js';
import { ResponseTooLargeError } from '../src/legacy-tls.js';
import { ArcaSdkBase, SoapServiceClient, transportOptions } from '../src/service.js';
import type { ArcaSdkConfig } from '../src/service.js';
import { buildXml, parseXml, soapCall } from '../src/soap-client.js';
import { FileTicketStorage, MemoryTicketStorage } from '../src/ticket-storage.js';
import { fakeTicketStorage, mockFetch as recordingFetch } from '../src/testing.js';
import type { ArcaEvent } from '../src/types.js';
import { WsaaClient } from '../src/wsaa.js';
import { loginResponse, mockFetch, soapEnvelope, soapFault, testCert, xmlResponse } from './helpers.js';

const URL = 'https://example.test/ws';
const HOUR = 3_600_000;
const OK = soapEnvelope('<dummyResponse><return><appserver>OK</appserver></return></dummyResponse>');
const posix = process.platform !== 'win32';

function wsaaClient(extra: Partial<ConstructorParameters<typeof WsaaClient>[0]> = {}) {
  return new WsaaClient({ ...testCert(), retries: 0, ...extra });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('redirecciones', () => {
  for (const status of [301, 302, 307, 308]) {
    it(`HTTP ${status}: no se sigue, error no incierto con el host de destino (sin la query)`, async () => {
      const fetch = mockFetch(
        new Response(null, { status, headers: { location: 'http://evil.test:8080/robar?token=SECRETO' } }),
      );
      const err = await soapCall(URL, '<x/>', { kind: 'emision', retries: 3, retryDelayMs: 1 }).catch((e) => e);
      expect(err).toBeInstanceOf(ArcaSoapError);
      expect(err).toMatchObject({ statusCode: status, uncertain: false });
      expect(err.message).toMatch(/redirección/);
      expect(err.message).toContain('http://evil.test:8080');
      expect(err.message).not.toContain('SECRETO');
      expect(fetch).toHaveBeenCalledTimes(1);
      const init = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1];
      expect(init.redirect).toBe('manual');
    });
  }

  it('en consultas no se reintenta', async () => {
    const fetch = mockFetch(new Response(null, { status: 302, headers: { location: '/otro' } }), xmlResponse(OK));
    const err = await soapCall(URL, '<x/>', { retries: 2, retryDelayMs: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaSoapError);
    expect(err.message).toContain('https://example.test');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('con un fetch inyectado también se pide redirect: manual y un 3xx es error', async () => {
    const own = recordingFetch(new Response(null, { status: 307, headers: { location: 'https://otro.test/ws' } }));
    const spy = vi.fn(own);
    const err = await soapCall(URL, '<x/>', { fetch: spy as unknown as typeof fetch }).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaSoapError);
    expect(err.statusCode).toBe(307);
    expect((spy.mock.calls[0] as unknown as [string, RequestInit])[1].redirect).toBe('manual');
  });
});

describe('validación de endpoints', () => {
  it('acepta https y http solo en loopback', () => {
    for (const url of [
      'https://wsaa.afip.gov.ar/ws/services/LoginCms',
      'https://proxy.interno:8443/ws',
      'http://localhost:8080/ws',
      'http://127.0.0.1/ws',
      'http://127.10.0.3:9000/ws',
      'http://[::1]:3000/ws',
    ]) {
      expect(() => validateEndpoint(url, 'endpoint')).not.toThrow();
    }
  });

  it('acepta todas las URLs oficiales (ENDPOINTS de cada SDK y WSAA)', async () => {
    const urls: string[] = [];
    const collect = (value: unknown): void => {
      if (typeof value === 'string') urls.push(value);
      else if (value && typeof value === 'object') Object.values(value).forEach(collect);
    };
    collect((await import('../src/constants.js')).WSAA_ENDPOINTS);
    for (const pkg of ['agro', 'cdc', 'facturacion', 'fecred', 'mtxca', 'padron', 'sire']) {
      const constants: { ENDPOINTS: unknown } = await import(`../../${pkg}/src/constants.ts`);
      collect(constants.ENDPOINTS);
    }
    expect(urls.length).toBeGreaterThan(20);
    for (const url of urls) {
      expect(url).toMatch(/^https:\/\//);
      expect(() => validateEndpoint(url, 'endpoint'), url).not.toThrow();
    }
  });

  it('rechaza http a otros hosts, otros protocolos, URLs inválidas y credenciales', () => {
    for (const url of [
      'http://wsaa.afip.gov.ar/ws',
      'http://localhost.evil.test/ws',
      'http://127.0.0.1.evil.test/ws',
      'ftp://example.test/ws',
      'file:///etc/passwd',
      'no es una url',
      '',
      'https://user:clave@example.test/ws',
    ]) {
      expect(() => validateEndpoint(url, 'endpoint'), url).toThrow(ArcaValidationError);
    }
  });

  it('el error no incluye la contraseña, la ruta ni la query', () => {
    const err = (() => {
      try {
        validateEndpoint('https://user:clave@example.test/ruta?token=x', 'endpoints.wsfe');
      } catch (e) {
        return e as ArcaValidationError;
      }
    })();
    expect(err).toBeInstanceOf(ArcaValidationError);
    expect(err?.field).toBe('endpoints.wsfe');
    expect(JSON.stringify([err?.message, err?.details])).not.toMatch(/clave|ruta|token/);
  });

  it('soapCall rechaza un endpoint http sin enviar nada', async () => {
    const fetch = mockFetch(xmlResponse(OK));
    await expect(soapCall('http://example.test/ws', '<x/>')).rejects.toBeInstanceOf(ArcaValidationError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('soapCall acepta http en localhost (servidores de prueba locales)', async () => {
    mockFetch(xmlResponse(OK));
    await expect(soapCall('http://localhost:8080/ws', '<x/>')).resolves.toHaveProperty('Envelope');
  });

  it('WsaaClient, SoapServiceClient y ArcaSdkBase validan los endpoints en el constructor', () => {
    expect(() => wsaaClient({ endpoint: 'http://proxy.test/wsaa' })).toThrow(ArcaValidationError);

    class Demo extends SoapServiceClient {}
    expect(() => new Demo({ endpoint: 'http://example.test/ws', namespace: 'urn:x' })).toThrow(ArcaValidationError);
    expect(() => new Demo({ endpoint: 'https://example.test/ws', namespace: 'urn:x' })).not.toThrow();

    class Sdk extends ArcaSdkBase<'demo'> {
      constructor(config: ArcaSdkConfig & { endpoints?: { wsaa?: string; demo?: string } }) {
        super(config, { demo: 'ws_demo' });
      }
    }
    const base = { ...testCert(), cuit: '20123456786', ticketStorage: fakeTicketStorage() };
    const err = (() => {
      try {
        new Sdk({ ...base, endpoints: { demo: 'http://example.test/ws' } });
      } catch (e) {
        return e as ArcaValidationError;
      }
    })();
    expect(err).toBeInstanceOf(ArcaValidationError);
    expect(err?.field).toBe('endpoints.demo');
    expect(() => new Sdk({ ...base, endpoints: { wsaa: 'https://user:x@example.test/wsaa' } })).toThrow(
      ArcaValidationError,
    );
    expect(() => new Sdk({ ...base, endpoints: { demo: 'http://127.0.0.1:9000/ws' } })).not.toThrow();
  });
});

describe('maxResponseBytes', () => {
  const big = soapEnvelope(`<r>${'x'.repeat(500)}</r>`);

  function streamed(text: string, chunk = 64): Response {
    const bytes = new TextEncoder().encode(text);
    let offset = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= bytes.length) {
          controller.close();
          return;
        }
        controller.enqueue(bytes.slice(offset, offset + chunk));
        offset += chunk;
      },
    });
    return new Response(body, { status: 200 });
  }

  it('corta una respuesta sin content-length que supera el límite (no se reintenta)', async () => {
    const fetch = mockFetch(streamed(big), xmlResponse(OK));
    const err = await soapCall(URL, '<x/>', { maxResponseBytes: 200, retries: 2, retryDelayMs: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaSoapError);
    expect(err.cause).toBeInstanceOf(ResponseTooLargeError);
    expect(err.message).toMatch(/200 bytes/);
    expect(err.uncertain).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rechaza por content-length sin leer el body; en emisiones es incierto', async () => {
    mockFetch(xmlResponse(big, 200, { 'content-length': String(big.length) }));
    const err = await soapCall(URL, '<x/>', { kind: 'emision', maxResponseBytes: 100 }).catch((e) => e);
    expect(err.cause).toBeInstanceOf(ResponseTooLargeError);
    expect(err.uncertain).toBe(true);
  });

  it('una respuesta dentro del límite se lee completa (UTF-8)', async () => {
    const text = soapEnvelope('<r>año ñandú</r>');
    mockFetch(streamed(text, 3));
    const parsed = await soapCall(URL, '<x/>', { maxResponseBytes: 10_000 });
    expect(JSON.stringify(parsed)).toContain('año ñandú');
  });

  it('valida el valor', async () => {
    await expect(soapCall(URL, '<x/>', { maxResponseBytes: 0 })).rejects.toBeInstanceOf(ArcaValidationError);
  });

  it('transportOptions lo pasa a cada llamada', () => {
    expect(transportOptions({ maxResponseBytes: 1234 }).maxResponseBytes).toBe(1234);
  });

  it('WsaaClient lo aplica al login', async () => {
    mockFetch(xmlResponse(loginResponse('T', new Date(Date.now() + 12 * HOUR))));
    const err = await wsaaClient({ maxResponseBytes: 100 })
      .getAccessTicket('wsfe')
      .catch((e) => e);
    expect(err).toBeInstanceOf(ArcaAuthError);
    expect(err.cause.cause).toBeInstanceOf(ResponseTooLargeError);
  });
});

describe('DOCTYPE en la respuesta', () => {
  const withDoctype = (decl: string) =>
    `<?xml version="1.0"?>${decl}<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><r>&x;</r></soapenv:Body></soapenv:Envelope>`;

  it('se rechaza sin parsear (ni expandir entidades)', async () => {
    mockFetch(xmlResponse(withDoctype('<!DOCTYPE r [<!ENTITY x "EXPANDIDA">]>')));
    const err = await soapCall(URL, '<x/>', { retries: 0 }).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaSoapError);
    expect(err.message).toMatch(/sin SOAP Envelope, con declaración <!DOCTYPE/);
  });

  it('sin distinguir mayúsculas', async () => {
    mockFetch(xmlResponse(withDoctype('<!doctype r [<!ENTITY x "EXPANDIDA">]>')));
    const err = await soapCall(URL, '<x/>', { kind: 'emision' }).catch((e) => e);
    expect(err.message).toMatch(/DOCTYPE/);
    expect(err.uncertain).toBe(true);
  });

  it('un 2xx con una página HTML (mantenimiento) es una respuesta sin Envelope', async () => {
    mockFetch(xmlResponse('<!DOCTYPE html><html><body>Mantenimiento</body></html>'));
    const err = await soapCall(URL, '<x/>', { retries: 0 }).catch((e) => e);
    expect(err.message).toMatch(/sin SOAP Envelope/);
    expect(err.responseBody).toContain('Mantenimiento');
  });

  it('un 5xx con una página HTML sigue siendo un error HTTP', async () => {
    mockFetch(xmlResponse('<!DOCTYPE html><html><body>Mantenimiento</body></html>', 503));
    const err = await soapCall(URL, '<x/>', { retries: 0 }).catch((e) => e);
    expect(err.message).toMatch(/^HTTP 503/);
    expect(err.responseBody).toContain('Mantenimiento');
  });

  it('parseXml lanza ArcaResponseError', () => {
    expect(() => parseXml('<!DOCTYPE a [<!ENTITY x "y">]><a>&x;</a>')).toThrow(ArcaResponseError);
  });
});

describe('buildXml: nombres de elementos', () => {
  it('rechaza keys que no son nombres XML', () => {
    for (const key of ['a><evil/><a', 'a b', '1a', 'a:b:c', '?xml', '', '@_x y', '@_', '<a>', 'a/']) {
      expect(() => buildXml({ [key]: 'v' }), key).toThrow(ArcaValidationError);
    }
    expect(() => buildXml({ ok: { 'mal nombre': 'v' } })).toThrow(ArcaValidationError);
    expect(() => buildXml({ ok: [{ bien: 1 }, { 'a"b': 2 }] })).toThrow(ArcaValidationError);
  });

  it('acepta nombres con prefijo, atributos @_, #text y letras no ASCII; escapa los valores', () => {
    const xml = buildXml({
      'ser:dummy': { '@_xmlns:ser': 'urn:x', año: 'a<b&c', 'x-y.z_1': { '@_id': '1', '#text': 't' } },
    });
    expect(xml).toContain('<ser:dummy xmlns:ser="urn:x">');
    expect(xml).toContain('<año>a&lt;b&amp;c</año>');
    expect(xml).toContain('<x-y.z_1 id="1">t</x-y.z_1>');
  });
});

describe('secretos fuera de util.inspect', () => {
  it('WsaaClient y MemoryTicketStorage no muestran token ni sign', async () => {
    mockFetch(xmlResponse(loginResponse('TOKEN_SECRETO', new Date(Date.now() + 12 * HOUR))));
    const storage = new MemoryTicketStorage();
    const wsaa = wsaaClient({ ticketStorage: storage });
    await wsaa.getAccessTicket('wsfe');
    expect((await storage.get(wsaa.ticketKey('wsfe')))?.token).toBe('TOKEN_SECRETO');

    for (const value of [wsaa, storage]) {
      const text = inspect(value, { depth: 10, showHidden: true });
      expect(text).not.toContain('TOKEN_SECRETO');
      expect(JSON.stringify(value) ?? '').not.toContain('TOKEN_SECRETO');
    }
  });
});

describe('WsaaClient: offsets y vencimientos absurdos', () => {
  it('no aplica un desfase de reloj de más de 24 horas', async () => {
    const events: ArcaEvent[] = [];
    const fetch = mockFetch(
      xmlResponse(soapFault('ns1:xml.generationTime.invalid', 'generationTime inválido'), 500, {
        date: new Date(Date.now() + 3 * 24 * HOUR).toUTCString(),
      }),
    );
    const wsaa = wsaaClient({ onEvent: (e) => events.push(e) });
    await expect(wsaa.getAccessTicket('wsfe')).rejects.toBeInstanceOf(ArcaAuthError);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(wsaa.clockOffsetMs).toBe(0);
    expect(events.some((e) => e.type === 'auth:clock-skew')).toBe(false);
  });

  it('rechaza un TA de WSAA que vence a más de 24 horas', async () => {
    mockFetch(xmlResponse(loginResponse('T', new Date(Date.now() + 48 * HOUR))));
    const err = await wsaaClient()
      .getAccessTicket('wsfe')
      .catch((e) => e);
    expect(err).toBeInstanceOf(ArcaAuthError);
    expect(err.message).toMatch(/más de 24 horas/);
  });

  it('un ticket del storage que vence a más de 24 horas se descarta y se hace login', async () => {
    const storage = new MemoryTicketStorage();
    const wsaa = wsaaClient({ ticketStorage: storage });
    await storage.set(wsaa.ticketKey('wsfe'), {
      token: 'PLANTADO',
      sign: 's',
      expirationTime: new Date(Date.now() + 30 * 24 * HOUR).toISOString(),
    });
    const fetch = mockFetch(xmlResponse(loginResponse('NUEVO', new Date(Date.now() + 12 * HOUR))));
    expect((await wsaa.getAccessTicket('wsfe')).token).toBe('NUEVO');
    expect(fetch).toHaveBeenCalledTimes(1);

    // Uno de 23 horas sí se usa.
    await storage.set(wsaa.ticketKey('wsfex'), {
      token: 'VIGENTE',
      sign: 's',
      expirationTime: new Date(Date.now() + 23 * HOUR).toISOString(),
    });
    expect((await wsaa.getAccessTicket('wsfex')).token).toBe('VIGENTE');
  });
});

describe('testing: loginResponse', () => {
  it('escapa el token', async () => {
    mockFetch(xmlResponse(loginResponse('a&b<c>"', new Date(Date.now() + 12 * HOUR))));
    const ticket = await wsaaClient().getAccessTicket('wsfe');
    expect(ticket.token).toBe('a&b<c>"');
    expect(ticket.sign).toBe('sign-a&b<c>"');
  });
});

describe.skipIf(!posix)('FileTicketStorage: directorio y archivos', () => {
  const ticket = { token: 'T', sign: 'S', expirationTime: new Date(Date.now() + HOUR).toISOString() };

  async function withTmp(fn: (base: string) => Promise<void>): Promise<void> {
    const base = await mkdtemp(join(tmpdir(), 'arca-seg-'));
    try {
      await fn(base);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  }

  it('rechaza un directorio que es un symlink', async () => {
    await withTmp(async (base) => {
      await mkdir(join(base, 'real'), { mode: 0o700 });
      await symlink(join(base, 'real'), join(base, 'link'));
      const storage = new FileTicketStorage(join(base, 'link'));
      await expect(storage.set('k', ticket)).rejects.toThrow(/symlink/);
      await expect(storage.get('k')).rejects.toThrow(/symlink/);
      expect(await readdir(join(base, 'real'))).toEqual([]);

      // WsaaClient lo informa como auth:storage-error y se loguea igual.
      const events: ArcaEvent[] = [];
      mockFetch(xmlResponse(loginResponse('T1', new Date(Date.now() + 12 * HOUR))));
      const wsaa = wsaaClient({ ticketStorage: storage, onEvent: (e) => events.push(e) });
      expect((await wsaa.getAccessTicket('wsfe')).token).toBe('T1');
      expect(
        events.filter((e) => e.type === 'auth:storage-error').map((e) => (e as { operation: string }).operation),
      ).toEqual(['get', 'set']);
    });
  });

  it('rechaza un directorio de otro usuario', async () => {
    await withTmp(async (base) => {
      const uid = process.getuid!();
      vi.spyOn(process, 'getuid').mockReturnValue(uid + 1);
      const storage = new FileTicketStorage(base);
      await expect(storage.set('k', ticket)).rejects.toThrow(/otro usuario/);
    });
  });

  it('ajusta a 0700 un directorio propio con permisos para el grupo u otros', async () => {
    await withTmp(async (base) => {
      const dir = join(base, 'tickets');
      await mkdir(dir);
      await chmod(dir, 0o777);
      const storage = new FileTicketStorage(dir);
      await storage.set('k', ticket);
      expect((await stat(dir)).mode & 0o777).toBe(0o700);
      expect(await storage.get('k')).toEqual(ticket);
    });
  });

  it('get sin directorio devuelve null sin crearlo', async () => {
    await withTmp(async (base) => {
      expect(await new FileTicketStorage(join(base, 'no-existe')).get('k')).toBeNull();
      expect(await readdir(base)).toEqual([]);
    });
  });

  it('no sigue un symlink a otro archivo', async () => {
    await withTmp(async (base) => {
      const dir = join(base, 'tickets');
      const storage = new FileTicketStorage(dir);
      await storage.set('otro', ticket);
      await symlink(join(dir, 'otro.json'), join(dir, 'k.json'));
      const onError = vi.fn();
      expect(await storage.get('k', { onError })).toBeNull();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0].message).toMatch(/ignorado/);
    });
  });

  it('no se bloquea con un FIFO', async () => {
    await withTmp(async (base) => {
      const dir = join(base, 'tickets');
      const storage = new FileTicketStorage(dir);
      await storage.set('otro', ticket);
      try {
        execFileSync('mkfifo', [join(dir, 'k.json')]);
      } catch {
        return; // sin mkfifo en este sistema
      }
      const onError = vi.fn();
      expect(await storage.get('k', { onError })).toBeNull();
      expect(onError).toHaveBeenCalledTimes(1);
    });
  });

  it('el error de un JSON corrupto no cita el contenido del archivo', async () => {
    await withTmp(async (base) => {
      const dir = join(base, 'tickets');
      const storage = new FileTicketStorage(dir);
      await storage.set('k', ticket);
      await writeFile(join(dir, 'k.json'), 'CONTENIDO_SECRETO{');
      const onError = vi.fn();
      expect(await storage.get('k', { onError })).toBeNull();
      const error = onError.mock.calls[0][0] as Error;
      expect(error.message).toMatch(/corrupto/);
      expect(error.message).not.toContain('CONTENIDO');
      expect(error.cause).toBeUndefined();
    });
  });
});
