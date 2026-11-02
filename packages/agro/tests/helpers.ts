import { vi } from 'vitest';
import { parseXml } from '@ramiidv/arca-common';
import { fakeTicketStorage, testCert } from '@ramiidv/arca-common/testing';
import { ArcaAgro } from '../src/index.js';
import type { ArcaAgroConfig } from '../src/index.js';

export const CUIT = '20123456786';
export const CUIT2 = '30712345671';
export const CUIT3 = '20999888772';
export const CUIT4 = '30500011129';
export const CUIT5 = '27300000008';

export const CPE_NS = 'https://serviciosjava.afip.gob.ar/wscpe/';
export const LPG_NS = 'http://serviciosjava.afip.gob.ar/wslpg/';

/** Storage que siempre devuelve un ticket vigente: los tests no pasan por WSAA. */
export const ticketStorage = fakeTicketStorage();

export interface SentCall {
  url: string;
  soapAction: string;
  body: string;
  /** Hijo del Body (el wrapper del request), con su prefijo. '' si el Body está vacío. */
  element: string;
  /** Contenido del wrapper (parseado con `parseXml`: conserva el orden del documento). */
  req: Record<string, any>;
  /** Namespace declarado en el wrapper. */
  ns: string | undefined;
}

type Responder = (call: SentCall, signal?: AbortSignal) => string | Response | Promise<string | Response>;

export function setup(responder: Responder, config: Partial<ArcaAgroConfig> = {}) {
  const calls: SentCall[] = [];
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = String(init?.body ?? '');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const parsed = parseXml(body) as Record<string, any>;
    const bodyNode = parsed['soapenv:Envelope']?.['soapenv:Body'];
    const element = bodyNode && typeof bodyNode === 'object' ? (Object.keys(bodyNode)[0] ?? '') : '';
    const req = element ? bodyNode[element] : {};
    const call: SentCall = {
      url: String(url),
      soapAction: headers['SOAPAction'],
      body,
      element,
      req: req && typeof req === 'object' ? req : {},
      ns: req && typeof req === 'object' ? req['@_xmlns:ser'] : undefined,
    };
    calls.push(call);
    const r = await responder(call, init?.signal ?? undefined);
    return typeof r === 'string' ? new Response(r, { status: 200, headers: { 'content-type': 'text/xml' } }) : r;
  });
  const agro = new ArcaAgro({
    cuit: CUIT,
    ...testCert(),
    fetch: fetchMock as unknown as typeof fetch,
    ticketStorage,
    retries: 2,
    retryDelayMs: 1,
    ...config,
  });
  return { agro, calls, fetchMock };
}

/** Envelope SOAP de respuesta como lo arma ARCA (prefijo ns2 en el elemento de respuesta). */
export function envelope(element: string, ns: string, inner: string): string {
  return (
    `<?xml version='1.0' encoding='UTF-8'?><S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Body>` +
    `<ns2:${element} xmlns:ns2="${ns}">${inner}</ns2:${element}></S:Body></S:Envelope>`
  );
}

export const cpeResp = (element: string, respuesta: string) =>
  envelope(element, CPE_NS, `<respuesta>${respuesta}</respuesta>`);

export const lpgResp = (element: string, ret: string, inner: string) =>
  envelope(element, LPG_NS, `<${ret}>${inner}</${ret}>`);

/** Claves de un nodo parseado sin atributos, en orden de documento. */
export const keys = (o: unknown) => Object.keys(o as object).filter((k) => !k.startsWith('@_'));

/** Respuesta que nunca llega (hasta que el request se aborte por timeout). */
export function hang(_call: SentCall, signal?: AbortSignal): Promise<Response> {
  return new Promise((_, reject) => {
    signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
}

export const http503 = () => new Response('Service Unavailable', { status: 503, statusText: 'Service Unavailable' });
