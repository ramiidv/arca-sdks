import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

/** Respuesta simulada de `node:https`: emite los chunks indicados. */
class FakeResponse extends EventEmitter {
  destroyed = false;
  constructor(
    public statusCode: number | undefined,
    public headers: Record<string, string | string[] | undefined>,
    public statusMessage: string | undefined,
  ) {
    super();
  }
  destroy() {
    this.destroyed = true;
  }
}

let nextResponse: {
  status: number | undefined;
  statusMessage?: string;
  headers: Record<string, string | string[] | undefined>;
  chunks: string[];
  /** Cómo termina la respuesta (default: `end`). */
  finish?: { event: 'end' } | { event: 'error'; error: Error } | { event: 'aborted' };
  /** Error del request antes de recibir respuesta (DNS, conexión, TLS). */
  requestError?: Error;
};
let lastResponse: FakeResponse | undefined;

vi.mock('node:https', () => ({
  request: (_url: string, _opts: unknown, cb: (res: FakeResponse) => void) => {
    const req = new EventEmitter() as EventEmitter & { end: () => void };
    req.end = () => {
      if (nextResponse.requestError) {
        req.emit('error', nextResponse.requestError);
        return;
      }
      const statusMessage = 'statusMessage' in nextResponse ? nextResponse.statusMessage : 'OK';
      const res = new FakeResponse(nextResponse.status, nextResponse.headers, statusMessage);
      lastResponse = res;
      cb(res);
      for (const chunk of nextResponse.chunks) {
        if (res.destroyed) return;
        res.emit('data', Buffer.from(chunk));
      }
      if (res.destroyed) return;
      const finish = nextResponse.finish ?? { event: 'end' };
      if (finish.event === 'error') res.emit('error', finish.error);
      else res.emit(finish.event);
    };
    return req;
  },
}));

const { legacyTlsRequest, LegacyTlsResponseError, ResponseTooLargeError } = await import('../src/legacy-tls.js');

const init = (maxResponseBytes: number) => ({ method: 'POST', headers: {}, body: '<x/>', maxResponseBytes });

describe('legacyTlsRequest: maxResponseBytes', () => {
  it('lee una respuesta dentro del límite', async () => {
    nextResponse = { status: 200, headers: { date: 'x' }, chunks: ['<a>', 'ñ</a>'] };
    const res = await legacyTlsRequest('https://servicios1.afip.gov.ar/x', init(100));
    expect(res.body).toBe('<a>ñ</a>');
  });

  it('corta la lectura al superar el límite', async () => {
    nextResponse = { status: 200, headers: {}, chunks: ['x'.repeat(60), 'x'.repeat(60), 'x'.repeat(60)] };
    const err = await legacyTlsRequest('https://servicios1.afip.gov.ar/x', init(100)).catch((e) => e);
    expect(err).toBeInstanceOf(LegacyTlsResponseError);
    expect(err.cause).toBeInstanceOf(ResponseTooLargeError);
    expect(lastResponse?.destroyed).toBe(true);
  });

  it('rechaza por content-length sin leer el body', async () => {
    nextResponse = { status: 200, headers: { 'content-length': '1000' }, chunks: ['x'] };
    const err = await legacyTlsRequest('https://servicios1.afip.gov.ar/x', init(100)).catch((e) => e);
    expect(err.cause).toBeInstanceOf(ResponseTooLargeError);
    expect(lastResponse?.destroyed).toBe(true);
  });
});

describe('legacyTlsRequest: errores y headers', () => {
  const url = 'https://servicios1.afip.gov.ar/x';

  it('une los headers multivalor con ", " y pasa los nombres a minúscula', async () => {
    nextResponse = {
      status: 200,
      headers: { 'Set-Cookie': ['a=1', 'b=2'], Date: 'Thu, 19 Nov 2026 10:00:00 GMT', 'X-Vacio': undefined },
      chunks: ['ok'],
    };
    const res = await legacyTlsRequest(url, init(100));
    expect(res.headers).toEqual({ 'set-cookie': 'a=1, b=2', date: 'Thu, 19 Nov 2026 10:00:00 GMT' });
    expect(res.statusText).toBe('OK');
  });

  it('sin statusCode ni statusMessage: status 0 y statusText vacío', async () => {
    nextResponse = { status: undefined, statusMessage: undefined, headers: {}, chunks: [] };
    const res = await legacyTlsRequest(url, init(100));
    expect(res).toMatchObject({ status: 0, statusText: '', body: '' });
  });

  it('un error de la respuesta (body cortado) es LegacyTlsResponseError con status, headers y cause', async () => {
    const cause = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    nextResponse = { status: 200, headers: { date: 'x' }, chunks: ['<a>'], finish: { event: 'error', error: cause } };
    const err = await legacyTlsRequest(url, init(100)).catch((e) => e);
    expect(err).toBeInstanceOf(LegacyTlsResponseError);
    expect(err).toMatchObject({ message: 'socket hang up', status: 200, headers: { date: 'x' } });
    expect(err.cause).toBe(cause);
  });

  it('una respuesta abortada es LegacyTlsResponseError "Respuesta cortada"', async () => {
    nextResponse = { status: 500, headers: {}, chunks: ['<a>'], finish: { event: 'aborted' } };
    const err = await legacyTlsRequest(url, init(100)).catch((e) => e);
    expect(err).toBeInstanceOf(LegacyTlsResponseError);
    expect(err).toMatchObject({ message: 'Respuesta cortada', status: 500 });
  });

  it('un error del request (sin respuesta) se propaga tal cual', async () => {
    const error = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
    nextResponse = { status: 200, headers: {}, chunks: [], requestError: error };
    const err = await legacyTlsRequest(url, init(100)).catch((e) => e);
    expect(err).toBe(error);
  });
});
