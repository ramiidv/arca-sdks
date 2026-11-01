import { parseXml } from '@ramiidv/arca-common';
import { vi } from 'vitest';
import { ArcaSire } from '../src/index.js';
import type { ArcaSireConfig } from '../src/index.js';

export const NS = 'http://www.afip.gob.ar/sire/c2005/';
export const CUIT_AGENTE = '20267565393';

export interface Captured {
  url: string;
  body: string;
  headers: Record<string, string>;
}

export function envelope(body: string, header = ''): string {
  return (
    `<soapenv:Envelope xmlns:tns="${NS}" xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soapenv:Header>${header}</soapenv:Header><soapenv:Body>${body}</soapenv:Body></soapenv:Envelope>`
  );
}

export const HEADER_INFO =
  '<tns:HeaderInfo><ambiente>homologacion - 207</ambiente><fecha>2026-11-01T14:43:01.733-03:00</fecha>' +
  '<vCore>2020.4</vCore><v2005>2020.7</v2005></tns:HeaderInfo>';

export function fault(code: string, message: string): string {
  return envelope(
    `<soapenv:Fault><faultcode>${code}</faultcode><faultstring>${message}</faultstring>` +
      `<faultactor></faultactor><detail>${message}</detail></soapenv:Fault>`,
    HEADER_INFO,
  );
}

/** `fetch` mockeado que responde en orden y guarda los requests. */
export function mockFetch(...responses: Array<{ status?: number; body: string } | (() => Promise<Response>)>) {
  const calls: Captured[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: String(init?.body ?? ''),
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (typeof next === 'function') return next();
    return new Response(next.body, { status: next.status ?? 200, headers: { 'Content-Type': 'text/xml' } });
  });
  return { fetch: fn as unknown as typeof fetch, calls, fn };
}

export function makeSire(fetchImpl: typeof fetch, extra: Partial<ArcaSireConfig> = {}): ArcaSire {
  const sire = new ArcaSire({
    cert: 'CERT',
    key: 'KEY',
    cuit: CUIT_AGENTE,
    fetch: fetchImpl,
    retryDelayMs: 1,
    ...extra,
  });
  vi.spyOn(sire.wsaa, 'getAccessTicket').mockResolvedValue({
    token: 'TOKEN',
    sign: 'SIGN',
    expirationTime: new Date(Date.now() + 3_600_000).toISOString(),
  });
  return sire;
}

/** Elemento del Body del request enviado (con prefijos de namespace). */
export function sentBody(xml: string): Record<string, unknown> {
  const parsed = parseXml(xml) as Record<string, Record<string, Record<string, unknown>>>;
  return parsed['soapenv:Envelope']['soapenv:Body'];
}
