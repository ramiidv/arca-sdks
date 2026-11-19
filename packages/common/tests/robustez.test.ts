import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArcaAuthError, ArcaResponseError, ArcaSoapError, ArcaValidationError } from '../src/errors.js';
import { datetime, encodeRequest } from '../src/schema.js';
import { soapCall } from '../src/soap-client.js';
import { FileTicketStorage, normalizeAccessTicket } from '../src/ticket-storage.js';
import { mockFetch, networkError, soapEnvelope, soapFaultResponse, testCert, xmlResponse } from '../src/testing.js';
import { WsaaClient } from '../src/wsaa.js';

const URL = 'https://example.test/ws';
const HOUR = 3_600_000;
const MAX_TIMER_MS = 2 ** 31 - 1;

function client(extra: Partial<ConstructorParameters<typeof WsaaClient>[0]> = {}) {
  return new WsaaClient({ ...testCert(), retries: 0, ...extra });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('WsaaClient.getAccessTicket con un signal ya abortado', () => {
  it('rechaza sin llamar a WSAA y sin dejar rechazos sin manejar', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const fetch = mockFetch(soapFaultResponse('ns1:wsaa.unavailable', 'caído'));
      const controller = new AbortController();
      controller.abort();
      const err = await client({ fetch })
        .getAccessTicket('wsfe', { signal: controller.signal })
        .catch((e) => e);
      expect(err).toBeInstanceOf(ArcaSoapError);
      expect(err).toMatchObject({ aborted: true, uncertain: false });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(fetch.calls).toHaveLength(0);
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('un login compartido que falla después de que su único caller canceló no queda sin manejar', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      let fail!: () => void;
      const fetch = mockFetch(
        () =>
          new Promise<Response>((resolve) => {
            fail = () => resolve(soapFaultResponse('ns1:wsaa.unavailable', 'caído'));
          }),
      );
      const controller = new AbortController();
      const wsaa = client({ fetch });
      const pending = wsaa.getAccessTicket('wsfe', { signal: controller.signal }).catch((e) => e);
      await vi.waitFor(() => expect(fetch.calls).toHaveLength(1));
      controller.abort();
      expect(await pending).toMatchObject({ aborted: true });
      fail();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});

describe('Validación de timeout, retries y retryDelayMs', () => {
  it.each([
    ['timeout', Infinity],
    ['timeout', 2 ** 31],
    ['timeout', 0],
    ['timeout', 1.5],
    ['timeout', Number.NaN],
    ['retries', -1],
    ['retries', Infinity],
    ['retries', 0.5],
    ['retryDelayMs', Infinity],
    ['retryDelayMs', -1],
    ['retryDelayMs', 2 ** 31],
  ])('soapCall rechaza %s = %s sin enviar el request', async (field, value) => {
    const fetch = mockFetch();
    const err = await soapCall(URL, '<x/>', { fetch, [field]: value }).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaValidationError);
    expect(err.field).toBe(field);
    expect(fetch.calls).toHaveLength(0);
  });

  it('acepta los extremos válidos', async () => {
    const ok = soapEnvelope('<r xmlns="http://x/"><a>1</a></r>');
    const fetch = mockFetch(ok);
    await soapCall(URL, '<x/>', { fetch, timeout: MAX_TIMER_MS, retries: 0, retryDelayMs: 0 });
    expect(fetch.calls).toHaveLength(1);
  });

  it('el backoff exponencial no supera el máximo de setTimeout', async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(globalThis, 'setTimeout');
    const fetch = mockFetch(...Array.from({ length: 4 }, () => networkError('ECONNRESET')));
    const done = soapCall(URL, '<x/>', { fetch, retries: 3, retryDelayMs: 2 ** 30, timeout: 1_000 }).catch((e) => e);
    await vi.runAllTimersAsync();
    expect(await done).toBeInstanceOf(ArcaSoapError);
    expect(fetch.calls).toHaveLength(4);
    const delays = spy.mock.calls.map((c) => c[1] as number).filter((ms) => ms !== 1_000);
    expect(delays).toEqual([2 ** 30, MAX_TIMER_MS, MAX_TIMER_MS]);
  });

  it.each([
    [{ timeout: Infinity }, 'timeout'],
    [{ retries: -1 }, 'retries'],
    [{ maxResponseBytes: 0 }, 'maxResponseBytes'],
    [{ clockOffsetMs: Number.NaN }, 'clockOffsetMs'],
    [{ clockOffsetMs: Infinity }, 'clockOffsetMs'],
    [{ clockOffsetMs: 25 * HOUR }, 'clockOffsetMs'],
    [{ loginErrorCooldownMs: Number.NaN }, 'loginErrorCooldownMs'],
    [{ loginErrorCooldownMs: -1 }, 'loginErrorCooldownMs'],
    [{ loginErrorCooldownMs: Infinity }, 'loginErrorCooldownMs'],
    [{ permanentErrorCooldownMs: Number.NaN }, 'permanentErrorCooldownMs'],
    [{ alreadyAuthenticatedCooldownMs: -5 }, 'alreadyAuthenticatedCooldownMs'],
  ])('new WsaaClient(%o) lanza ArcaValidationError', (extra, field) => {
    const err = (() => {
      try {
        client(extra);
      } catch (e) {
        return e;
      }
    })() as ArcaValidationError;
    expect(err).toBeInstanceOf(ArcaValidationError);
    expect(err.field).toBe(field);
  });

  it('WsaaClient acepta permanentErrorCooldownMs: Infinity, 0 y un offset negativo', () => {
    expect(() => client({ permanentErrorCooldownMs: Infinity, loginErrorCooldownMs: 0 })).not.toThrow();
    expect(client({ clockOffsetMs: -2 * HOUR }).clockOffsetMs).toBe(-2 * HOUR);
  });
});

describe('FileTicketStorage: directorio borrado', () => {
  it('set vuelve a crear el directorio si se borró después de usarlo', async () => {
    const base = await mkdtemp(join(tmpdir(), 'arca-dir-'));
    try {
      const dir = join(base, 'tickets');
      const storage = new FileTicketStorage(dir);
      const ticket = { token: 'T', sign: 'S', expirationTime: new Date(Date.now() + HOUR).toISOString() };
      await storage.set('k', ticket);
      await rm(dir, { recursive: true, force: true });
      await storage.set('k', { ...ticket, token: 'T2' });
      expect(JSON.parse(await readFile(join(dir, 'k.json'), 'utf8')).token).toBe('T2');
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});

describe('schema datetime(): fechas inexistentes', () => {
  it.each(['2026-02-30T00:00:00', '2026-02-29T10:00:00-03:00', '2026-04-31T00:00:00Z'])('rechaza %s', (v) => {
    expect(() => encodeRequest({ d: v }, { d: datetime() }, 't')).toThrow(ArcaValidationError);
  });

  it('acepta un 29 de febrero de un año bisiesto', () => {
    expect(encodeRequest({ d: '2028-02-29T10:00:00-03:00' }, { d: datetime() }, 't')).toEqual({
      d: '2028-02-29T10:00:00-03:00',
    });
  });
});

describe('WsaaClient: huella del certificado en ticketKey', () => {
  const { cert, key } = testCert();

  it('para un PEM simple es la misma que en versiones anteriores (las keys guardadas siguen sirviendo)', () => {
    const body = cert.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
    const legacy = createHash('sha256').update(body).digest('hex').slice(0, 16);
    expect(client().ticketKey('wsfe')).toBe(`homo:${legacy}:wsfe`);
  });

  it('no cambia con Bag Attributes, saltos de línea CRLF ni con la cadena completa', () => {
    const base = client().ticketKey('wsfe');
    const bag = `Bag Attributes\n    localKeyID: 01 02 03\n    friendlyName: arca\nsubject=/CN=test\nissuer=/CN=test\n${cert}`;
    const crlf = cert.replace(/\n/g, '\r\n');
    const chain = `${cert}\n${cert}`;
    for (const pem of [bag, crlf, chain]) {
      expect(new WsaaClient({ cert: pem, key }).ticketKey('wsfe')).toBe(base);
    }
  });
});

describe('normalizeAccessTicket: token y sign vacíos', () => {
  const expirationTime = new Date(Date.now() + HOUR).toISOString();
  it.each([
    { token: '', sign: 'S', expirationTime },
    { token: 'T', sign: '', expirationTime },
  ])('devuelve null para %o', (raw) => {
    expect(normalizeAccessTicket(raw)).toBeNull();
  });
});

describe('Errores con cause', () => {
  it('TA ilegible: ArcaAuthError con el error del parser como cause', async () => {
    const ta = '<?xml version="1.0"?><!DOCTYPE x><loginTicketResponse/>';
    const escaped = ta.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const fetch = mockFetch(
      soapEnvelope(
        `<loginCmsResponse xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov"><loginCmsReturn>${escaped}</loginCmsReturn></loginCmsResponse>`,
      ),
    );
    const err = await client({ fetch })
      .getAccessTicket('wsfe')
      .catch((e) => e);
    expect(err).toBeInstanceOf(ArcaAuthError);
    expect(err.message).toMatch(/XML ilegible/);
    expect(err.cause).toBeInstanceOf(ArcaResponseError);
  });

  it('respuesta que el parser no puede leer: ArcaSoapError "sin SOAP Envelope" con el error del parser como cause', async () => {
    const fetch = mockFetch(xmlResponse('<a b="1>'));
    const err = await soapCall(URL, '<x/>', { fetch, retries: 0 }).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaSoapError);
    expect(err.message).toMatch(/sin SOAP Envelope/);
    expect(err.cause).toBeInstanceOf(Error);
  });

  it('respuesta legible sin Envelope: sin cause', async () => {
    const fetch = mockFetch(xmlResponse('<html>mantenimiento</html>'));
    const err = await soapCall(URL, '<x/>', { fetch, retries: 0 }).catch((e) => e);
    expect(err.message).toMatch(/sin SOAP Envelope/);
    expect(err.cause).toBeUndefined();
  });
});
