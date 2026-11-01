import { vi } from 'vitest';
import { parseXml } from '@ramiidv/arca-common';
import { FecredClient } from '../src/fecred-client.js';
import { ENDPOINTS } from '../src/constants.js';
import type { WsAuth } from '../src/types.js';

export const NS = 'http://ar.gob.afip.wsfecred/FECredService/';
export const URL = ENDPOINTS.wsfecred.testing;
export const AUTH: WsAuth = { token: 'TOKEN', sign: 'SIGN', cuitRepresentada: '20123456786' };

/** Respuesta SOAP como la devuelve FECredService (JAX-WS: prefijo ns2, hijos sin namespace). */
export function soapResponse(method: string, inner: string): string {
  return (
    "<?xml version='1.0' encoding='UTF-8'?>" +
    '<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">' +
    '<S:Header><info xmlns="https://ar.gob.afip.wsfecred/FECredService/"><ambiente>Testing - FI1</ambiente></info></S:Header>' +
    `<S:Body><ns2:${method}Response xmlns:ns2="${NS}">${inner}</ns2:${method}Response></S:Body></S:Envelope>`
  );
}

export function xmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/xml; charset=utf-8' } });
}

type Responder = Response | Error | ((init: RequestInit) => Response | Promise<Response>);

/** `fetch` simulado que devuelve las respuestas en orden y guarda los requests. */
export function mockFetch(...responses: Responder[]) {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const next = responses.shift();
    if (!next) throw new Error('fetch llamado más veces de lo esperado');
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next(init ?? {}) : next.clone();
  });
}

export function client(fetch: ReturnType<typeof mockFetch>, extra: { retries?: number; timeout?: number } = {}) {
  return new FecredClient({
    endpoint: URL,
    namespace: NS,
    soapOptions: { fetch: fetch as unknown as typeof globalThis.fetch, retryDelayMs: 1, ...extra },
  });
}

/** Request enviado en la llamada `n`: SOAPAction y el Body parseado. */
export function sentRequest(fetch: ReturnType<typeof mockFetch>, n = 0) {
  const init = fetch.mock.calls[n][1] as RequestInit;
  const headers = init.headers as Record<string, string>;
  const xml = String(init.body);
  const env = parseXml(xml) as Record<string, any>;
  const envelope = env['soapenv:Envelope'] ?? env['soap:Envelope'] ?? Object.values(env).find((v) => typeof v === 'object');
  const bodyKey = Object.keys(envelope).find((k) => k.endsWith('Body'))!;
  return { soapAction: headers['SOAPAction'], xml, body: envelope[bodyKey] as Record<string, any> };
}

/** Orden de los hijos de un elemento en el XML (para verificar el orden del XSD). */
export function childOrder(xml: string, element: string): string[] {
  const m = new RegExp(`<(?:\\w+:)?${element}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${element}>`).exec(xml);
  if (!m) throw new Error(`no está ${element}`);
  const out: string[] = [];
  let depth = 0;
  for (const t of m[1].matchAll(/<(\/?)([\w:]+)[^>]*?(\/?)>/g)) {
    if (t[1]) depth--;
    else {
      if (depth === 0) out.push(t[2]);
      if (!t[3]) depth++;
    }
  }
  return out;
}

export const ID_FACTURA_XML =
  '<CUITEmisor>30712345671</CUITEmisor><codTipoCmp>201</codTipoCmp><ptoVta>3</ptoVta><nroCmp>125</nroCmp>';
