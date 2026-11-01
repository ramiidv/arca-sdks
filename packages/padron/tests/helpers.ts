import { vi } from 'vitest';
import { MemoryTicketStorage, parseXml } from '@ramiidv/arca-common';
import { ArcaPadron } from '../src/arca-padron.js';
import { ENDPOINTS } from '../src/constants.js';
import type { ArcaPadronConfig } from '../src/types.js';

/** Respuesta con la forma que devuelve JAX-WS en Padrón: tag con prefijo y contenido sin namespace. */
export function soapXml(ns: string, method: string, inner: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>' +
    `<ns2:${method}Response xmlns:ns2="${ns}">${inner}</ns2:${method}Response>` +
    '</soap:Body></soap:Envelope>'
  );
}

export function respuesta(ns: string, method: string, inner: string): Response {
  return new Response(soapXml(ns, method, inner), { headers: { 'content-type': 'text/xml' } });
}

/** SOAP Fault como el que devuelve JAX-WS (HTTP 500). */
export function fault(faultstring: string, faultcode = 'soap:Server'): Response {
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault>' +
    `<faultcode>${faultcode}</faultcode><faultstring>${faultstring}</faultstring>` +
    '<detail><ns2:SRValidationException xmlns:ns2="http://a13.soap.ws.server.puc.sr/"/></detail>' +
    '</soap:Fault></soap:Body></soap:Envelope>';
  return new Response(xml, { status: 500, headers: { 'content-type': 'text/xml' } });
}

export interface Captura {
  fn: ReturnType<typeof vi.fn>;
  bodies: string[];
  headers: Array<Record<string, string>>;
  urls: string[];
}

/** `fetch` mockeado: cada llamada responde con el siguiente elemento (el último se repite). */
export function mockFetch(...responses: Array<Response | (() => Response | Promise<Response>)>): Captura {
  const bodies: string[] = [];
  const headers: Array<Record<string, string>> = [];
  const urls: string[] = [];
  let i = 0;
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    urls.push(String(url));
    bodies.push(String(init.body));
    headers.push(init.headers as Record<string, string>);
    const r = responses[Math.min(i++, responses.length - 1)];
    return typeof r === 'function' ? r() : r.clone();
  });
  vi.stubGlobal('fetch', fn);
  return { fn, bodies, headers, urls };
}

/** Body del request parseado: el elemento del método (sin el prefijo `ser:`). */
export function requestBody(body: string, method: string): Record<string, unknown> {
  const env = parseXml(body)['soapenv:Envelope'] as Record<string, unknown>;
  const b = env['soapenv:Body'] as Record<string, unknown>;
  return b[`ser:${method}`] as Record<string, unknown>;
}

export const CUIT_REPRESENTADA = '20123456786';

/** ArcaPadron con tickets ya cargados para todos los servicios (no llama a WSAA). */
export async function padron(extra: Partial<ArcaPadronConfig> = {}): Promise<ArcaPadron> {
  const storage = new MemoryTicketStorage();
  const client = new ArcaPadron({
    cert: '-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----',
    key: 'KEY',
    cuit: CUIT_REPRESENTADA,
    ticketStorage: storage,
    retryDelayMs: 1,
    ...extra,
  });
  const expirationTime = new Date(Date.now() + 12 * 3_600_000).toISOString();
  for (const svc of Object.values(ENDPOINTS)) {
    if ('serviceId' in svc) {
      await storage.set(client.wsaa.ticketKey(svc.serviceId), { token: 'TOKEN', sign: 'SIGN', expirationTime });
    }
  }
  return client;
}
