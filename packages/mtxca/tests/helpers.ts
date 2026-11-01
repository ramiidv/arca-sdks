import { vi } from 'vitest';
import { parseXml } from '@ramiidv/arca-common';
import { MtxcaClient } from '../src/mtxca-client.js';
import type { MtxcaAuth, MtxcaComprobanteCAE } from '../src/types.js';

export const NS = 'http://impl.service.wsmtxca.afip.gov.ar/service/';
export const ENDPOINT = 'https://fwshomo.afip.gov.ar/wsmtxca/services/MTXCAService';

export const AUTH: MtxcaAuth = { token: 'TOKEN', sign: 'SIGN', cuitRepresentada: '20123456786' };

/** Respuesta SOAP como la devuelve Axis2 (prefijo ns1, hijos sin namespace). */
export function soapResponse(element: string, inner: string): string {
  return (
    `<?xml version='1.0' encoding='utf-8'?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soapenv:Body><ns1:${element} xmlns:ns1="${NS}">${inner}</ns1:${element}></soapenv:Body></soapenv:Envelope>`
  );
}

export interface Captured {
  url: string;
  soapAction: string | null;
  body: string;
}

/** `fetch` mockeado que responde en orden con los bodies dados y registra los requests. */
export function mockFetch(...responses: Array<string | { status: number; body: string }>) {
  const calls: Captured[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({ url: String(url), soapAction: headers.get('SOAPAction'), body: String(init?.body) });
    const next = responses.shift();
    if (next === undefined) throw new Error('mockFetch: no hay más respuestas');
    const { status, body } = typeof next === 'string' ? { status: 200, body: next } : next;
    return new Response(body, { status, headers: { 'Content-Type': 'text/xml' } });
  });
  return { fetch: fn as unknown as typeof fetch, calls, fn };
}

/** `fetch` que nunca responde (respeta el abort del timeout). */
export function hangingFetch() {
  const fn = vi.fn(
    (_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      }),
  );
  return { fetch: fn as unknown as typeof fetch, fn };
}

export function client(
  fetchImpl: typeof fetch,
  extra: Partial<ConstructorParameters<typeof MtxcaClient>[0]> = {},
): MtxcaClient {
  return new MtxcaClient({ endpoint: ENDPOINT, fetch: fetchImpl, retryDelayMs: 1, ...extra });
}

/** Elemento del request dentro del Body (con su prefijo `ser:`), parseado. */
export function requestBody(captured: Captured): {
  name: string;
  ns: unknown;
  content: Record<string, unknown>;
  raw: string;
} {
  const parsed = parseXml(captured.body) as Record<string, any>;
  const body = parsed['soapenv:Envelope']['soapenv:Body'] as Record<string, any>;
  const name = Object.keys(body)[0];
  return { name, ns: body[name]['@_xmlns:ser'], content: body[name], raw: captured.body };
}

/** Nombres de los hijos directos de `<tag>` en el XML crudo, en orden. */
export function childOrder(xml: string, tag: string): string[] {
  const open = new RegExp(`<${tag}(\\s[^>]*)?>`).exec(xml);
  const end = open ? xml.indexOf(`</${tag}>`, open.index) : -1;
  if (!open || end < 0) throw new Error(`no se encontró <${tag}>`);
  const inner = xml.slice(open.index + open[0].length, end);
  const names: string[] = [];
  let depth = 0;
  for (const m of inner.matchAll(/<(\/?)([A-Za-z0-9_]+)[^>]*?(\/?)>/g)) {
    const [, closing, name, selfClosing] = m;
    if (closing) depth--;
    else {
      if (depth === 0) names.push(name);
      if (!selfClosing) depth++;
    }
  }
  return names;
}

/** Factura A válida (manual, "Ejemplo Factura A" con un ítem 21%). */
export function facturaA(overrides: Partial<MtxcaComprobanteCAE> = {}): MtxcaComprobanteCAE {
  return {
    codigoTipoComprobante: 1,
    numeroPuntoVenta: 4000,
    numeroComprobante: 1,
    fechaEmision: '2026-11-01',
    codigoTipoDocumento: 80,
    numeroDocumento: '30000000007',
    condicionIVAReceptor: 1,
    importeGravado: 100,
    importeNoGravado: 0,
    importeExento: 0,
    importeSubtotal: 100,
    importeOtrosTributos: 1,
    importeTotal: 122,
    codigoMoneda: 'PES',
    cotizacionMoneda: 1,
    observaciones: 'Observaciones comerciales',
    codigoConcepto: 1,
    otrosTributos: [{ codigo: 99, descripcion: 'Otro tributo', baseImponible: 100, importe: 1 }],
    items: [
      {
        unidadesMtx: 123456,
        codigoMtx: '0123456789913',
        codigo: 'P0001',
        descripcion: 'Producto P0001',
        cantidad: 1,
        codigoUnidadMedida: 7,
        precioUnitario: 100,
        importeBonificacion: 0,
        codigoCondicionIVA: 5,
        importeIVA: 21,
        importeItem: 121,
      },
    ],
    subtotalesIVA: [{ codigo: 5, importe: 21 }],
    ...overrides,
  };
}
