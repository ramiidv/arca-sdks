/**
 * Utilidades para testear los SDKs de ARCA (y el código que los usa) sin red:
 * un `fetch` simulado que graba los requests, constructores de envelopes SOAP y
 * de Faults, un `TicketStorage` con un ticket vigente y helpers para inspeccionar
 * el XML enviado. No dependen de ningún framework de tests.
 *
 * @example
 * ```ts
 * import { mockFetch, soapResponse, fakeTicketStorage } from '@ramiidv/arca-common/testing';
 *
 * const fetch = mockFetch(soapResponse('dummyResponse', '<appserver>OK</appserver>...', NS));
 * const sdk = new ArcaCdc({ cert, key, cuit, fetch, ticketStorage: fakeTicketStorage() });
 * await sdk.status();
 * fetch.calls[0].soapAction; // "..."
 * ```
 *
 * @module
 */
import { XMLParser } from 'fast-xml-parser';
import forge from 'node-forge';
import type { AccessTicket, TicketStorage } from './types.js';

// ---------------------------------------------------------------------------
// fetch simulado
// ---------------------------------------------------------------------------

/** Request grabado por `mockFetch`. */
export interface RecordedRequest {
  url: string;
  headers: Record<string, string>;
  /** Header SOAPAction sin comillas (`""` si no se envió). */
  soapAction: string;
  /** XML enviado. */
  body: string;
  /** Nombre local del primer elemento del Body (el método, ej: `FECAESolicitar`). */
  method: string | undefined;
  signal: AbortSignal | undefined;
}

/**
 * Respuesta de un `mockFetch`: un `Response`, un XML (HTTP 200), un `Error`
 * (se lanza, como una falla de red) o una función que recibe el request.
 */
export type MockReply =
  | Response
  | string
  | Error
  | ((request: RecordedRequest) => Response | string | Promise<Response | string>);

/** `fetch` simulado con los requests recibidos. */
export type MockFetch = typeof fetch & {
  /** Requests recibidos, en orden. */
  readonly calls: RecordedRequest[];
};

const xmlParser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });
const xmlTextParser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false });
const orderedParser = new XMLParser({ ignoreAttributes: true, preserveOrder: true });

function headersOf(init: RequestInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(init?.headers).forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

function bodyMethod(xml: string): string | undefined {
  try {
    const body = xmlParser.parse(xml)?.Envelope?.Body;
    if (!body || typeof body !== 'object') return undefined;
    return Object.keys(body).find((k) => !k.startsWith('@_'));
  } catch {
    return undefined;
  }
}

function record(input: string | URL | Request, init?: RequestInit): RecordedRequest {
  const headers = headersOf(init);
  const body = typeof init?.body === 'string' ? init.body : String(init?.body ?? '');
  return {
    url: input instanceof Request ? input.url : String(input),
    headers,
    soapAction: (headers['soapaction'] ?? '').replace(/^"|"$/g, ''),
    body,
    method: bodyMethod(body),
    signal: init?.signal ?? undefined,
  };
}

async function toResponse(reply: MockReply, request: RecordedRequest): Promise<Response> {
  if (reply instanceof Error) throw reply;
  const value = typeof reply === 'function' ? await reply(request) : reply;
  return typeof value === 'string' ? xmlResponse(value) : value.clone();
}

/**
 * `fetch` simulado que responde con `replies` en orden y graba cada request en
 * `.calls`. Lanza si recibe más requests que respuestas.
 */
export function mockFetch(...replies: MockReply[]): MockFetch {
  const calls: RecordedRequest[] = [];
  const queue = [...replies];
  const fn = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = record(input, init);
    calls.push(request);
    const next = queue.shift();
    if (next === undefined) throw new Error(`mockFetch: request inesperado (#${calls.length}) a ${request.url}`);
    return toResponse(next, request);
  };
  return Object.assign(fn, { calls }) as MockFetch;
}

/**
 * `fetch` simulado que responde según el método SOAP del request (primer
 * elemento del Body). Cada método tiene una cola de respuestas; la última se
 * repite. Lanza ante un método sin respuestas configuradas.
 */
export function mockFetchByMethod(handlers: Record<string, MockReply | MockReply[]>): MockFetch {
  const calls: RecordedRequest[] = [];
  const queues = new Map(Object.entries(handlers).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]));
  const fn = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = record(input, init);
    calls.push(request);
    const queue = request.method === undefined ? undefined : queues.get(request.method);
    if (!queue || queue.length === 0) throw new Error(`mockFetchByMethod: método inesperado ${request.method}`);
    const next = queue.length > 1 ? (queue.shift() as MockReply) : queue[0];
    return toResponse(next, request);
  };
  return Object.assign(fn, { calls }) as MockFetch;
}

/**
 * `fetch` simulado que responde llamando a `responder` con cada request (para
 * respuestas que dependen del request). Graba los requests en `.calls`.
 */
export function mockFetchWith(responder: (request: RecordedRequest) => MockReply | Promise<MockReply>): MockFetch {
  const calls: RecordedRequest[] = [];
  const fn = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = record(input, init);
    calls.push(request);
    return toResponse(await responder(request), request);
  };
  return Object.assign(fn, { calls }) as MockFetch;
}

/** Promesa que no se resuelve hasta que se aborta el `signal` del request (para probar timeouts). */
export function hangingReply(): (request: RecordedRequest) => Promise<Response> {
  return (request) =>
    new Promise((_, reject) => {
      request.signal?.addEventListener('abort', () => reject(request.signal?.reason), { once: true });
    });
}

/** Error de red como el que lanza `fetch` (ej: `ECONNREFUSED`, `ETIMEDOUT`). */
export function networkError(code: string): TypeError {
  return Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error(code), { code }) });
}

// ---------------------------------------------------------------------------
// Respuestas SOAP
// ---------------------------------------------------------------------------

/** Respuesta HTTP con XML. */
export function xmlResponse(body: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { 'content-type': 'text/xml; charset=utf-8', ...headers },
  });
}

/** Envelope SOAP 1.1 con el contenido dado en el Body (y opcionalmente en el Header). */
export function soapEnvelope(body: string, header = ''): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">' +
    (header ? `<soapenv:Header>${header}</soapenv:Header>` : '') +
    `<soapenv:Body>${body}</soapenv:Body></soapenv:Envelope>`
  );
}

/**
 * Envelope con la respuesta de un método: `<{element} xmlns="{ns}">{inner}</{element}>`.
 * Para servicios ASMX el resultado suele ir envuelto: `soapResponse('FEDummyResponse',
 * '<FEDummyResult>...</FEDummyResult>', ns)`.
 */
export function soapResponse(element: string, inner: string, namespace: string): string {
  return soapEnvelope(`<${element} xmlns="${namespace}">${inner}</${element}>`);
}

/** Envelope con un SOAP Fault. */
export function soapFault(faultCode: string, faultString: string): string {
  return soapEnvelope(
    `<soapenv:Fault><faultcode>${faultCode}</faultcode><faultstring>${faultString}</faultstring></soapenv:Fault>`,
  );
}

/** Respuesta HTTP 500 con un SOAP Fault (como la envían los servicios de ARCA). */
export function soapFaultResponse(faultCode: string, faultString: string): Response {
  return xmlResponse(soapFault(faultCode, faultString), 500);
}

/** Respuesta de `loginCms` de WSAA con un TA para `token` que vence en `expiration`. */
export function loginResponse(token: string, expiration: Date, generation = new Date()): string {
  const ta =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<loginTicketResponse version="1.0"><header>' +
    '<source>CN=wsaahomo, O=AFIP, C=AR, SERIALNUMBER=CUIT 33693450239</source>' +
    '<destination>SERIALNUMBER=CUIT 20123456789, CN=test</destination>' +
    '<uniqueId>123456</uniqueId>' +
    `<generationTime>${generation.toISOString()}</generationTime>` +
    `<expirationTime>${expiration.toISOString()}</expirationTime>` +
    '</header><credentials>' +
    `<token>${token}</token><sign>sign-${token}</sign>` +
    '</credentials></loginTicketResponse>';
  const escaped = ta.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return soapEnvelope(
    `<loginCmsResponse xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov"><loginCmsReturn>${escaped}</loginCmsReturn></loginCmsResponse>`,
  );
}

// ---------------------------------------------------------------------------
// Autenticación
// ---------------------------------------------------------------------------

/**
 * `TicketStorage` que siempre devuelve un ticket vigente (token `TOKEN`, sign
 * `SIGN`): los SDKs no llaman a WSAA.
 */
export function fakeTicketStorage(ticket: Partial<AccessTicket> = {}): TicketStorage {
  return {
    async get() {
      return {
        token: 'TOKEN',
        sign: 'SIGN',
        expirationTime: new Date(Date.now() + 3_600_000).toISOString(),
        ...ticket,
      };
    },
    async set() {},
  };
}

let cachedCert: { cert: string; key: string } | undefined;

/** Certificado autofirmado y su clave (PEM), para firmar TRAs en tests. Se genera una vez. */
export function testCert(): { cert: string; key: string } {
  if (cachedCert) return cachedCert;
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 86_400_000);
  const attrs = [{ name: 'commonName', value: 'test' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  cachedCert = { cert: forge.pki.certificateToPem(cert), key: forge.pki.privateKeyToPem(keys.privateKey) };
  return cachedCert;
}

// ---------------------------------------------------------------------------
// Inspección del XML enviado
// ---------------------------------------------------------------------------

/** Opciones de `requestParams`. */
export interface RequestParamsOptions {
  /** `false`: los valores quedan como string tal cual se enviaron (ej: CUIT `"20123456786"`). Default: `true`. */
  parseNumbers?: boolean;
}

/**
 * Contenido del elemento del método en el Body de un request, sin prefijos de
 * namespace (`<ser:dummy>` → contenido de `dummy`). Los atributos quedan como
 * `@_nombre` (ej: `@_xmlns`). `{}` si está vacío.
 */
export function requestParams(xml: string, options: RequestParamsOptions = {}): Record<string, unknown> {
  const parser = options.parseNumbers === false ? xmlTextParser : xmlParser;
  const body = parser.parse(xml)?.Envelope?.Body;
  const method = body && typeof body === 'object' ? Object.keys(body).find((k) => !k.startsWith('@_')) : undefined;
  if (!method) throw new Error('requestParams: el request no tiene Body');
  const value = body[method];
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

type OrderedNode = Record<string, OrderedNode[] | string> & { '#text'?: string };

function localName(name: string): string {
  const i = name.indexOf(':');
  return i < 0 ? name : name.slice(i + 1);
}

function elementName(node: OrderedNode): string | undefined {
  return Object.keys(node).find((k) => k !== '#text' && k !== ':@');
}

function findElement(nodes: OrderedNode[], tag: string): OrderedNode[] | undefined {
  for (const node of nodes) {
    const name = elementName(node);
    if (!name) continue;
    const children = node[name] as OrderedNode[];
    if (localName(name) === tag) return children;
    const found = findElement(children, tag);
    if (found) return found;
  }
  return undefined;
}

/**
 * Nombres locales de los hijos directos del primer elemento `tag` del XML, en
 * el orden del documento (para verificar el orden de una `xsd:sequence`).
 */
export function childOrder(xml: string, tag: string): string[] {
  const children = findElement(orderedParser.parse(xml) as OrderedNode[], localName(tag));
  if (!children) throw new Error(`childOrder: no se encontró <${tag}>`);
  return children
    .map(elementName)
    .filter((n): n is string => n !== undefined)
    .map(localName);
}

// ---------------------------------------------------------------------------
// Contratos contra el XSD
// ---------------------------------------------------------------------------

export { checkSchemaAgainstXsd, loadXsdTypes } from './xsd-contract.js';
export type { ContractOptions, XsdComplexType, XsdElement, XsdTypes } from './xsd-contract.js';
