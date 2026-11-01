import { vi } from 'vitest';
import { parseXml } from '@ramiidv/arca-common';
import { hangingReply, mockFetch as commonMockFetch, soapEnvelope, xmlResponse } from '@ramiidv/arca-common/testing';
import type { MockReply, RecordedRequest } from '@ramiidv/arca-common/testing';
import { MtxcaClient } from '../src/mtxca-client.js';
import type { MtxcaAuth, MtxcaComprobanteCAE } from '../src/types.js';

export { childOrder } from '@ramiidv/arca-common/testing';

export const NS = 'http://impl.service.wsmtxca.afip.gov.ar/service/';
export const ENDPOINT = 'https://fwshomo.afip.gov.ar/wsmtxca/services/MTXCAService';

export const AUTH: MtxcaAuth = { token: 'TOKEN', sign: 'SIGN', cuitRepresentada: '20123456786' };

/** Respuesta SOAP como la devuelve Axis2 (prefijo ns1, hijos sin namespace). */
export function soapResponse(element: string, inner: string): string {
  return soapEnvelope(`<ns1:${element} xmlns:ns1="${NS}">${inner}</ns1:${element}>`);
}

/**
 * `fetch` mockeado (`mockFetch` de common) que responde en orden y registra los
 * requests en `calls`; `fn` es un `vi.fn` para contar llamadas.
 */
export function mockFetch(...responses: Array<string | { status: number; body: string }>) {
  const replies: MockReply[] = responses.map((r) => (typeof r === 'string' ? r : xmlResponse(r.body, r.status)));
  return spied(commonMockFetch(...replies));
}

/** `fetch` que nunca responde (respeta el abort del timeout). */
export function hangingFetch() {
  return spied(commonMockFetch(hangingReply()));
}

function spied(mock: ReturnType<typeof commonMockFetch>) {
  const fn = vi.fn(mock);
  return { fetch: fn as unknown as typeof fetch, calls: mock.calls, fn };
}

export function client(
  fetchImpl: typeof fetch,
  extra: Partial<ConstructorParameters<typeof MtxcaClient>[0]> = {},
): MtxcaClient {
  return new MtxcaClient({ endpoint: ENDPOINT, fetch: fetchImpl, retryDelayMs: 1, ...extra });
}

/** Elemento del request dentro del Body (con su prefijo `ser:`), parseado. */
export function requestBody(captured: RecordedRequest): {
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
