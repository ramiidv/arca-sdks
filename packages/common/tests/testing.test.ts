import { describe, expect, it } from 'vitest';
import {
  childOrder,
  hangingReply,
  mockFetch,
  mockFetchByMethod,
  mockFetchWith,
  networkError,
  requestParams,
  soapEnvelope,
  xmlResponse,
} from '../src/testing.js';
import type { RecordedRequest } from '../src/testing.js';

const URL = 'https://example.test/ws';

/** Init de un POST SOAP con `body` (un método en el Body). */
function post(method: string, inner = '', signal?: AbortSignal): RequestInit {
  return {
    method: 'POST',
    headers: { SOAPAction: `"urn:${method}"`, 'Content-Type': 'text/xml' },
    body: soapEnvelope(`<ser:${method} xmlns:ser="http://x/">${inner}</ser:${method}>`),
    signal,
  };
}

/** Request grabado mínimo para llamar a una respuesta-función. */
function recorded(signal?: AbortSignal): RecordedRequest {
  return { url: URL, headers: {}, soapAction: '', body: '', method: undefined, signal };
}

describe('mockFetch', () => {
  it('responde en orden, graba los requests y lanza ante uno de más', async () => {
    const fetch = mockFetch('<a/>', networkError('ECONNREFUSED'));
    const res = await fetch(URL, post('dummy'));
    expect(await res.text()).toBe('<a/>');
    expect(fetch.calls[0]).toMatchObject({ url: URL, soapAction: 'urn:dummy', method: 'dummy' });
    expect(fetch.calls[0].headers['content-type']).toBe('text/xml');
    const err = await fetch(URL, post('dummy')).catch((e) => e);
    expect(err).toBeInstanceOf(TypeError);
    expect(err.cause).toMatchObject({ code: 'ECONNREFUSED' });
    await expect(fetch(URL, post('dummy'))).rejects.toThrow(/request inesperado \(#3\)/);
  });
});

describe('mockFetchByMethod', () => {
  it('cada método tiene su cola y la última respuesta se repite', async () => {
    const fetch = mockFetchByMethod({ a: ['<uno/>', '<dos/>'], b: '<b/>' });
    const texts: string[] = [];
    for (const m of ['a', 'a', 'a', 'b', 'b']) texts.push(await (await fetch(URL, post(m))).text());
    expect(texts).toEqual(['<uno/>', '<dos/>', '<dos/>', '<b/>', '<b/>']);
    expect(fetch.calls.map((c) => c.method)).toEqual(['a', 'a', 'a', 'b', 'b']);
  });

  it('lanza ante un método sin respuestas configuradas o un request sin Body', async () => {
    const fetch = mockFetchByMethod({ a: '<a/>' });
    await expect(fetch(URL, post('otro'))).rejects.toThrow('mockFetchByMethod: método inesperado otro');
    await expect(fetch(URL, { method: 'POST', body: 'no es XML' })).rejects.toThrow(/método inesperado undefined/);
    expect(fetch.calls).toHaveLength(2);
  });
});

describe('mockFetchWith', () => {
  it('responde según el request (string, Response o Error) y graba los requests', async () => {
    const fetch = mockFetchWith(async (req) => {
      if (req.method === 'a') return `<eco>${req.soapAction}</eco>`;
      if (req.method === 'b') return xmlResponse('<b/>', 500);
      return networkError('ENOTFOUND');
    });
    expect(await (await fetch(URL, post('a'))).text()).toBe('<eco>urn:a</eco>');
    expect((await fetch(URL, post('b'))).status).toBe(500);
    await expect(fetch(URL, post('c'))).rejects.toThrow('fetch failed');
    expect(fetch.calls.map((c) => c.method)).toEqual(['a', 'b', 'c']);
  });
});

describe('hangingReply', () => {
  it('no se resuelve hasta que se aborta el signal del request', async () => {
    const controller = new AbortController();
    const pending = hangingReply()(recorded(controller.signal));
    let settled = false;
    pending.catch(() => {}).finally(() => (settled = true));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toBe(false);
    controller.abort(new Error('cancelado'));
    await expect(pending).rejects.toThrow('cancelado');
  });

  it('rechaza enseguida si el signal ya viene abortado', async () => {
    const controller = new AbortController();
    controller.abort(new Error('ya abortado'));
    await expect(hangingReply()(recorded(controller.signal))).rejects.toThrow('ya abortado');
  });
});

describe('requestParams', () => {
  it('devuelve el contenido del método, con o sin conversión de números', () => {
    const xml = post('consultar', '<cuit>20123456786</cuit><n>007</n>').body as string;
    expect(requestParams(xml)).toMatchObject({ cuit: 20123456786, n: 7 });
    expect(requestParams(xml, { parseNumbers: false })).toMatchObject({ cuit: '20123456786', n: '007' });
    expect(requestParams(post('dummy').body as string)).toEqual({});
  });

  it('lanza si el request no tiene Body', () => {
    expect(() => requestParams('<a/>')).toThrow('requestParams: el request no tiene Body');
    expect(() => requestParams(soapEnvelope(''))).toThrow(/sin Body|no tiene Body/);
  });
});

describe('childOrder', () => {
  it('ignora prefijos al buscar el elemento', () => {
    expect(childOrder('<x:a xmlns:x="u"><x:b/><x:c/></x:a>', 'x:a')).toEqual(['b', 'c']);
  });

  it('lanza si no se encuentra el elemento', () => {
    expect(() => childOrder('<a><b/></a>', 'zz')).toThrow('childOrder: no se encontró <zz>');
  });
});
