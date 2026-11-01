import { vi } from 'vitest';

export { loginResponse, soapEnvelope, soapFault, testCert, xmlResponse } from '../src/testing.js';

/** Reemplaza `fetch` global por un mock que devuelve las respuestas en orden. */
export function mockFetch(...responses: Array<Response | Error | (() => Response | Promise<Response>)>) {
  const fn = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error('fetch llamado más veces de lo esperado');
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next() : next;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}
