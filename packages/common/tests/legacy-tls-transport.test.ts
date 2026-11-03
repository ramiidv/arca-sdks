import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

/** Respuesta simulada de `node:https`: emite los chunks indicados. */
class FakeResponse extends EventEmitter {
  destroyed = false;
  constructor(
    public statusCode: number,
    public headers: Record<string, string>,
    public statusMessage = 'OK',
  ) {
    super();
  }
  destroy() {
    this.destroyed = true;
  }
}

let nextResponse: { status: number; headers: Record<string, string>; chunks: string[] };
let lastResponse: FakeResponse | undefined;

vi.mock('node:https', () => ({
  request: (_url: string, _opts: unknown, cb: (res: FakeResponse) => void) => {
    const req = new EventEmitter() as EventEmitter & { end: () => void };
    req.end = () => {
      const res = new FakeResponse(nextResponse.status, nextResponse.headers);
      lastResponse = res;
      cb(res);
      for (const chunk of nextResponse.chunks) {
        if (res.destroyed) return;
        res.emit('data', Buffer.from(chunk));
      }
      if (!res.destroyed) res.emit('end');
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
