import { parseXml } from '@ramiidv/arca-common';
import { fakeTicketStorage, soapEnvelope, testCert } from '@ramiidv/arca-common/testing';
import { ArcaCdc } from '../src/index.js';
import type { ArcaCdcConfig } from '../src/index.js';

export { childOrder, mockFetch } from '@ramiidv/arca-common/testing';

export const NS = 'http://servicios1.afip.gob.ar/wscdc/';
export const CUIT = '20123456786';

/** Respuesta ASMX (con el header FEHeaderInfo que agrega WSCDC). */
export function asmxResponse(method: string, inner: string): string {
  return soapEnvelope(
    `<${method}Response xmlns="${NS}"><${method}Result>${inner}</${method}Result></${method}Response>`,
    `<FEHeaderInfo xmlns="${NS}"><ambiente>Homologacion-Ext - srt</ambiente>` +
      '<fecha>2026-11-01T14:45:53.0690382-03:00</fecha><id>3.1.1.0</id></FEHeaderInfo>',
  );
}

export function makeCdc(fetchFn: typeof fetch, extra: Partial<ArcaCdcConfig> = {}): ArcaCdc {
  return new ArcaCdc({
    ...testCert(),
    cuit: CUIT,
    fetch: fetchFn,
    ticketStorage: fakeTicketStorage(),
    retryDelayMs: 1,
    ...extra,
  });
}

/**
 * Body SOAP del request parseado con el parser del SDK (conserva `@_xmlns` y los
 * números largos como string, a diferencia de `requestParams` de common/testing).
 */
export function requestBody(xml: string): Record<string, unknown> {
  const env = parseXml(xml)['soapenv:Envelope'] as Record<string, unknown>;
  return env['soapenv:Body'] as Record<string, unknown>;
}
