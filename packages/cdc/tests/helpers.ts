import { vi } from 'vitest';
import { parseXml } from '@ramiidv/arca-common';
import type { AccessTicket, TicketStorage } from '@ramiidv/arca-common';
import { ArcaCdc } from '../src/index.js';
import type { ArcaCdcConfig } from '../src/index.js';

export const NS = 'http://servicios1.afip.gob.ar/wscdc/';
export const CUIT = '20123456786';

/** Respuesta ASMX real (con el header FEHeaderInfo que agrega WSCDC). */
export function asmxResponse(method: string, inner: string): string {
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">' +
    `<soap:Header><FEHeaderInfo xmlns="${NS}"><ambiente>Homologacion-Ext - srt</ambiente>` +
    '<fecha>2026-11-01T14:45:53.0690382-03:00</fecha><id>3.1.1.0</id></FEHeaderInfo></soap:Header>' +
    `<soap:Body><${method}Response xmlns="${NS}"><${method}Result>${inner}</${method}Result></${method}Response>` +
    '</soap:Body></soap:Envelope>'
  );
}

export interface Captured {
  url: string;
  soapAction: string;
  body: string;
}

/** `fetch` mockeado: devuelve las respuestas en orden y guarda cada request. */
export function mockFetch(...responses: Array<string | Response | Error>) {
  const requests: Captured[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    requests.push({ url: String(url), soapAction: headers.get('SOAPAction') ?? '', body: String(init?.body ?? '') });
    const next = responses.shift();
    if (next === undefined) throw new Error('fetch llamado más veces de lo esperado');
    if (next instanceof Error) throw next;
    if (next instanceof Response) return next;
    return new Response(next, { status: 200, headers: { 'content-type': 'text/xml; charset=utf-8' } });
  });
  return { fetch: fn as unknown as typeof fetch, requests, fn };
}

/** Storage que siempre devuelve un ticket vigente (evita el login WSAA en los tests). */
export const ticketStorage: TicketStorage = {
  async get(): Promise<AccessTicket> {
    return { token: 'TOKEN', sign: 'SIGN', expirationTime: new Date(Date.now() + 3_600_000).toISOString() };
  },
  async set() {},
};

export function makeCdc(fetchFn: typeof fetch, extra: Partial<ArcaCdcConfig> = {}): ArcaCdc {
  return new ArcaCdc({
    cert: '-----BEGIN CERTIFICATE-----\nMIIBtest\n-----END CERTIFICATE-----',
    key: 'key',
    cuit: CUIT,
    fetch: fetchFn,
    ticketStorage,
    retryDelayMs: 1,
    ...extra,
  });
}

/** Body SOAP del request parseado. */
export function requestBody(xml: string): Record<string, unknown> {
  const env = parseXml(xml)['soapenv:Envelope'] as Record<string, unknown>;
  return env['soapenv:Body'] as Record<string, unknown>;
}

/** Nombres de los hijos directos de `<tag>...</tag>` en el XML, en orden. */
export function childOrder(xml: string, tag: string): string[] {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(xml);
  if (!m) throw new Error(`no se encontró <${tag}>`);
  const names: string[] = [];
  let depth = 0;
  for (const t of m[1].matchAll(/<(\/?)([A-Za-z][\w:]*)[^>]*?(\/?)>/g)) {
    const [, closing, name, selfClosing] = t;
    if (closing) depth--;
    else {
      if (depth === 0) names.push(name);
      if (!selfClosing) depth++;
    }
  }
  return names;
}
