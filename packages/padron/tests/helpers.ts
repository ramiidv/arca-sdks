import { vi } from 'vitest';
import { parseXml } from '@ramiidv/arca-common';
import {
  type MockReply,
  type RecordedRequest,
  fakeTicketStorage,
  mockFetch as commonMockFetch,
  soapEnvelope,
  xmlResponse,
  testCert,
} from '@ramiidv/arca-common/testing';
import { ArcaPadron } from '../src/arca-padron.js';
import { ENDPOINTS, NAMESPACES } from '../src/constants.js';
import type { ArcaPadronConfig } from '../src/types.js';

/** Namespace del servicio cuyo endpoint de homologación es `url`. */
export function namespaceDe(url: string): string {
  const svc = (Object.keys(ENDPOINTS) as Array<keyof typeof ENDPOINTS>).find((k) => ENDPOINTS[k].testing === url);
  if (!svc) throw new Error(`URL desconocida: ${url}`);
  return NAMESPACES[svc];
}

/** Respuesta con la forma que devuelve JAX-WS en Padrón: tag con prefijo y contenido sin namespace. */
export function soapXml(ns: string, method: string, inner: string): string {
  return soapEnvelope(`<ns2:${method}Response xmlns:ns2="${ns}">${inner}</ns2:${method}Response>`);
}

export function respuesta(ns: string, method: string, inner: string): Response {
  return xmlResponse(soapXml(ns, method, inner));
}

/** SOAP Fault como el que devuelve JAX-WS (HTTP 500, con `<detail>`). */
export function fault(faultstring: string, faultcode = 'soap:Server'): Response {
  return xmlResponse(
    soapEnvelope(
      '<soapenv:Fault xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
        `<faultcode>${faultcode}</faultcode><faultstring>${faultstring}</faultstring>` +
        '<detail><ns2:SRValidationException xmlns:ns2="http://a13.soap.ws.server.puc.sr/"/></detail>' +
        '</soapenv:Fault>',
    ),
    500,
  );
}

export interface Captura {
  fn: ReturnType<typeof vi.fn>;
  /** Requests grabados (ver `RecordedRequest` de `@ramiidv/arca-common/testing`). */
  calls: RecordedRequest[];
  bodies: string[];
  /** Headers de cada request, con los nombres en minúscula. */
  headers: Array<Record<string, string>>;
  urls: string[];
}

/**
 * `fetch` global mockeado (con `mockFetch` de arca-common/testing): cada
 * llamada responde con el siguiente elemento y el último se repite.
 */
export function mockFetch(...responses: MockReply[]): Captura {
  const cap: Captura = { fn: vi.fn(), calls: [], bodies: [], headers: [], urls: [] };
  let i = 0;
  cap.fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const once = commonMockFetch(responses[Math.min(i++, responses.length - 1)]);
    const res = once(input, init);
    const [req] = once.calls;
    cap.calls.push(req);
    cap.bodies.push(req.body);
    cap.headers.push(req.headers);
    cap.urls.push(req.url);
    return res;
  });
  vi.stubGlobal('fetch', cap.fn);
  return cap;
}

/**
 * Body del request parseado: el elemento del método (sin el prefijo `ser:`).
 * Usa `parseXml` de arca-common (valores como string, a diferencia de
 * `requestParams` de arca-common/testing, que convierte números).
 */
export function requestBody(body: string, method: string): Record<string, unknown> {
  const env = parseXml(body)['soapenv:Envelope'] as Record<string, unknown>;
  const b = env['soapenv:Body'] as Record<string, unknown>;
  return b[`ser:${method}`] as Record<string, unknown>;
}

export const CUIT_REPRESENTADA = '20123456786';

/** ArcaPadron con un ticket vigente para todos los servicios (no llama a WSAA). */
export async function padron(extra: Partial<ArcaPadronConfig> = {}): Promise<ArcaPadron> {
  return new ArcaPadron({
    ...testCert(),
    cuit: CUIT_REPRESENTADA,
    ticketStorage: fakeTicketStorage(),
    retryDelayMs: 1,
    ...extra,
  });
}
