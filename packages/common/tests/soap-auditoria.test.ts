import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  afipSoapCall,
  arcaSoapCall,
  buildXml,
  extractMethodResult,
  parseAfipDate,
  parseArcaDate,
  parseXml,
  soapCall,
} from '../src/index.js';
import { ArcaSoapError } from '../src/errors.js';
import type { ArcaEvent } from '../src/types.js';
import { mockFetch, soapEnvelope, soapFault, xmlResponse } from './helpers.js';

const URL = 'https://example.test/ws';
const OK = soapEnvelope('<dummyResponse xmlns="http://x/"><return><appserver>OK</appserver></return></dummyResponse>');

const SOAP12_FAULT = (code: string) =>
  '<?xml version="1.0"?><env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope"><env:Body>' +
  `<env:Fault><env:Code><env:Value>${code}</env:Value></env:Code>` +
  '<env:Reason><env:Text xml:lang="es">Request inválido</env:Text></env:Reason>' +
  '<env:Detail><error><codigo>12</codigo></error></env:Detail></env:Fault></env:Body></env:Envelope>';

function networkError(code: string): TypeError {
  return new TypeError('fetch failed', { cause: Object.assign(new Error(code), { code }) });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('soapCall: respuestas de error', () => {
  it('HTTP no-2xx sin Fault: extracto del body (espacios colapsados, hasta 500 caracteres)', async () => {
    const html = `<html>\n  <body>\n    <h1>Bad   Gateway</h1>\n${'x'.repeat(1000)}</body></html>`;
    mockFetch(xmlResponse(html, 502));
    const err = await soapCall(URL, '<x/>', { retries: 0 }).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaSoapError);
    expect(err.responseBody.startsWith('<html> <body> <h1>Bad Gateway</h1>')).toBe(true);
    expect(err.responseBody.length).toBeLessThanOrEqual(500);
    expect(err.message).toContain('HTTP 502');
    expect(err.message).toContain('<h1>Bad Gateway</h1>');
  });

  it('XML ilegible con HTTP 500: incierto, con extracto', async () => {
    mockFetch(xmlResponse('<soap:Envelope><soap:Body><roto', 500));
    const err = await soapCall(URL, '<x/>', { retries: 0 }).catch((e) => e);
    expect(err).toMatchObject({ statusCode: 500, uncertain: true, responseBody: '<soap:Envelope><soap:Body><roto' });
    expect(err.faultString).toBeUndefined();
  });

  it('SOAP 1.1: guarda el <detail> del Fault', async () => {
    const xml = soapEnvelope(
      '<soapenv:Fault><faultcode>soapenv:Server</faultcode><faultstring>Error</faultstring>' +
        '<detail><ns1:exceptionName xmlns:ns1="http://x">ValidacionException</ns1:exceptionName></detail></soapenv:Fault>',
    );
    mockFetch(xmlResponse(xml, 500));
    const err = await soapCall(URL, '<x/>', { retries: 0 }).catch((e) => e);
    expect(err.faultDetail).toEqual({ exceptionName: 'ValidacionException' });
  });

  it('SOAP 1.2: Code/Value, Reason/Text y Detail', async () => {
    mockFetch(xmlResponse(SOAP12_FAULT('env:Sender'), 500));
    const err = await soapCall(URL, '<x/>', { retries: 0 }).catch((e) => e);
    expect(err).toMatchObject({ faultCode: 'env:Sender', faultString: 'Request inválido', uncertain: false });
    expect(err.faultDetail).toEqual({ error: { codigo: 12 } });
  });

  it('emisión: un Fault Client/Sender no es incierto; uno Server sí', async () => {
    for (const code of ['soap:Client', 'soapenv:Client', 'S:Client', 'Client.Authentication']) {
      mockFetch(xmlResponse(soapFault(code, 'rechazado'), 500));
      const err = await soapCall(URL, '<x/>', { kind: 'emision' }).catch((e) => e);
      expect(err).toMatchObject({ faultCode: code, uncertain: false });
    }
    mockFetch(xmlResponse(SOAP12_FAULT('env:Sender'), 500));
    expect(await soapCall(URL, '<x/>', { kind: 'emision' }).catch((e) => e)).toMatchObject({ uncertain: false });

    mockFetch(xmlResponse(soapFault('soapenv:Server', 'error interno'), 500));
    expect(await soapCall(URL, '<x/>', { kind: 'emision' }).catch((e) => e)).toMatchObject({ uncertain: true });
    mockFetch(xmlResponse(SOAP12_FAULT('env:Receiver'), 500));
    expect(await soapCall(URL, '<x/>', { kind: 'emision' }).catch((e) => e)).toMatchObject({ uncertain: true });
    // "ClientX" no es un Fault Client.
    mockFetch(xmlResponse(soapFault('ns1:ClientX', 'x'), 500));
    expect(await soapCall(URL, '<x/>', { kind: 'emision' }).catch((e) => e)).toMatchObject({ uncertain: true });
  });
});

describe('soapCall: reintentos', () => {
  it('emite request:retry con backoff exponencial', async () => {
    const fetch = mockFetch(networkError('ECONNRESET'), networkError('ECONNRESET'), xmlResponse(OK));
    const events: ArcaEvent[] = [];
    const start = Date.now();
    await soapCall(URL, '<x/>', { retries: 2, retryDelayMs: 20, onEvent: (e) => events.push(e), methodName: 'm' });
    expect(Date.now() - start).toBeGreaterThanOrEqual(55); // 20 + 40
    expect(fetch).toHaveBeenCalledTimes(3);
    const retries = events.filter((e) => e.type === 'request:retry');
    expect(retries).toEqual([
      expect.objectContaining({ method: 'm', endpoint: URL, attempt: 1, error: expect.any(ArcaSoapError) }),
      expect.objectContaining({ attempt: 2 }),
    ]);
  });

  it('abortar durante la espera del backoff: ArcaSoapError aborted, sin enviar de nuevo', async () => {
    const fetch = mockFetch(networkError('ECONNRESET'), xmlResponse(OK));
    const controller = new AbortController();
    const pending = soapCall(URL, '<x/>', {
      retries: 1,
      retryDelayMs: 5_000,
      signal: controller.signal,
      onEvent: (e) => {
        if (e.type === 'request:retry') setTimeout(() => controller.abort(), 5);
      },
    }).catch((e) => e);
    const err = await pending;
    expect(err).toBeInstanceOf(ArcaSoapError);
    expect(err).toMatchObject({ aborted: true, uncertain: false });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('parser: referencias numéricas', () => {
  it('decodifica &#243; y &#xD; (parseXml y soapCall)', async () => {
    expect(parseXml('<a><b>Informaci&#243;n&#xD;</b><c>&amp;&lt;</c></a>')).toEqual({
      a: { b: 'Información\r', c: '&<' },
    });
    mockFetch(
      xmlResponse(
        soapEnvelope(
          '<mResponse xmlns="http://x/"><return><msg>Descripci&#xF3;n inv&#225;lida</msg></return></mResponse>',
        ),
      ),
    );
    const result = await arcaSoapCall(URL, 'http://x/', 'm', {});
    expect(result).toEqual({ msg: 'Descripción inválida' });
  });
});

describe('buildXml / arcaSoapCall: valores null/undefined', () => {
  it('buildXml omite propiedades y elementos de arrays nulos', () => {
    const xml = buildXml({ a: { x: null, y: undefined, z: 0, w: [1, null, 2], o: { p: null, q: 'v' } } });
    expect(xml).not.toContain('<x');
    expect(xml).not.toContain('<y');
    expect(xml).toContain('<z>0</z>');
    expect(xml.match(/<w>/g)).toHaveLength(2);
    expect(xml).not.toContain('<p');
    expect(xml).toContain('<q>v</q>');
  });

  it('arcaSoapCall no envía los parámetros null/undefined', async () => {
    const fetch = mockFetch(
      xmlResponse(soapEnvelope('<mResponse xmlns="http://x/"><return><ok>1</ok></return></mResponse>')),
    );
    await arcaSoapCall(URL, 'http://x/', 'm', { a: 1, b: null, c: undefined, d: { e: null, f: 'x' } });
    const body = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string;
    expect(body).toContain('<a>1</a>');
    expect(body).not.toMatch(/<b\b|<c\b|<e\b/);
    expect(body).toContain('<f>x</f>');
  });
});

describe('extractMethodResult', () => {
  it('desenvuelve un único hijo *Result con otro nombre', () => {
    const parsed = parseXml(soapEnvelope('<mResponse xmlns="http://x/"><OtroResult><v>1</v></OtroResult></mResponse>'));
    expect(extractMethodResult(parsed, 'm')).toEqual({ v: 1 });
  });

  it('un *Result primitivo devuelve el elemento de respuesta completo', () => {
    const parsed = parseXml(soapEnvelope('<mResponse xmlns="http://x/"><mResult>42</mResult></mResponse>'));
    expect(extractMethodResult(parsed, 'm')).toEqual({ '@_xmlns': 'http://x/', mResult: 42 });
  });
});

describe('aliases deprecados', () => {
  it('afipSoapCall y parseAfipDate son los mismos que arcaSoapCall y parseArcaDate', () => {
    expect(afipSoapCall).toBe(arcaSoapCall);
    expect(parseAfipDate).toBe(parseArcaDate);
  });
});
