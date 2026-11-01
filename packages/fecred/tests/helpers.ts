import { parseXml } from '@ramiidv/arca-common';
import { type MockFetch, soapEnvelope } from '@ramiidv/arca-common/testing';
import { FecredClient } from '../src/fecred-client.js';
import { ENDPOINTS } from '../src/constants.js';
import type { WsAuth } from '../src/types.js';

export { childOrder, hangingReply, mockFetch, xmlResponse } from '@ramiidv/arca-common/testing';

export const NS = 'http://ar.gob.afip.wsfecred/FECredService/';
export const URL = ENDPOINTS.wsfecred.testing;
export const AUTH: WsAuth = { token: 'TOKEN', sign: 'SIGN', cuitRepresentada: '20123456786' };

/** Respuesta SOAP como la devuelve FECredService (JAX-WS: prefijo ns2, hijos sin namespace, header `info`). */
export function soapResponse(method: string, inner: string): string {
  return soapEnvelope(
    `<ns2:${method}Response xmlns:ns2="${NS}">${inner}</ns2:${method}Response>`,
    '<info xmlns="https://ar.gob.afip.wsfecred/FECredService/"><ambiente>Testing - FI1</ambiente></info>',
  );
}

export function client(fetch: MockFetch, extra: { retries?: number; timeout?: number } = {}) {
  return new FecredClient({
    endpoint: URL,
    namespace: NS,
    transport: { fetch, retryDelayMs: 1, ...extra },
  });
}

/** Request enviado en la llamada `n`: SOAPAction (tal como se envió, con comillas) y el Body parseado. */
export function sentRequest(fetch: MockFetch, n = 0) {
  const { headers, body: xml } = fetch.calls[n];
  const env = parseXml(xml) as Record<string, any>;
  const envelope =
    env['soapenv:Envelope'] ?? env['soap:Envelope'] ?? Object.values(env).find((v) => typeof v === 'object');
  const bodyKey = Object.keys(envelope).find((k) => k.endsWith('Body'))!;
  return { soapAction: headers['soapaction'], xml, body: envelope[bodyKey] as Record<string, any> };
}

export const ID_FACTURA_XML =
  '<CUITEmisor>30712345671</CUITEmisor><codTipoCmp>201</codTipoCmp><ptoVta>3</ptoVta><nroCmp>125</nroCmp>';
