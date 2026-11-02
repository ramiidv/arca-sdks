import { parseXml } from '@ramiidv/arca-common';
import { soapEnvelope, soapFault, testCert } from '@ramiidv/arca-common/testing';
import { vi } from 'vitest';
import { ArcaSire } from '../src/index.js';
import type { ArcaSireConfig } from '../src/index.js';

export const NS = 'http://www.afip.gob.ar/sire/c2005/';
export const CUIT_AGENTE = '20267565393';

/** Envelope como los de SIRE: declara el prefijo `tns` en el `Envelope`. */
export function envelope(body: string, header = ''): string {
  return soapEnvelope(body, header).replace('<soapenv:Envelope ', `<soapenv:Envelope xmlns:tns="${NS}" `);
}

export const HEADER_INFO =
  '<tns:HeaderInfo><ambiente>homologacion - 207</ambiente><fecha>2026-11-01T14:43:01.733-03:00</fecha>' +
  '<vCore>2020.4</vCore><v2005>2020.7</v2005></tns:HeaderInfo>';

/** SOAP Fault de common con el agregado real de SIRE (`faultactor`, `detail` y `HeaderInfo`). */
export function fault(code: string, message: string): string {
  return soapFault(code, message)
    .replace('</faultstring>', `</faultstring><faultactor></faultactor><detail>${message}</detail>`)
    .replace('<soapenv:Body>', `<soapenv:Header>${HEADER_INFO}</soapenv:Header><soapenv:Body>`)
    .replace('<soapenv:Envelope ', `<soapenv:Envelope xmlns:tns="${NS}" `);
}

export function makeSire(fetchImpl: typeof fetch, extra: Partial<ArcaSireConfig> = {}): ArcaSire {
  const sire = new ArcaSire({
    ...testCert(),
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
