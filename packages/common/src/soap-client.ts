import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import { formatDateTimeAR } from './dates.js';
import { ArcaSoapError, ArcaServiceError } from './errors.js';
import type { ServiceErrorDetail } from './errors.js';
import { legacyTlsRequest, LegacyTlsResponseError } from './legacy-tls.js';
import type { ArcaEvent, SoapCallOptions, SoapOperationKind } from './types.js';

// ---------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------

const PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: true,
  trimValues: true,
  // Referencias numéricas (`&#243;`, `&#xD;`) y entidades HTML, además de las 5 de XML.
  htmlEntities: true,
  numberParseOptions: {
    hex: false,
    leadingZeros: false,
    // CUIT, CAE, fechas YYYYMMDD y similares quedan como string.
    skipLike: /^\d{8,}$/,
  },
};

const xmlParser = new XMLParser(PARSER_OPTIONS);

/**
 * Igual que `PARSER_OPTIONS` pero sin conversión de tipos: todo valor de texto
 * queda como string tal cual llegó (`"10.50"`, `"1E3"`, `"007"`). Para
 * servicios con campos `xs:string` que parecen números (`parseNumbers: false`).
 */
const TEXT_PARSER_OPTIONS = { ...PARSER_OPTIONS, parseTagValue: false };

const xmlTextParser = new XMLParser(TEXT_PARSER_OPTIONS);

/** Opciones de `parseXml`. */
export interface ParseXmlOptions {
  /**
   * `true` (default): los textos numéricos se convierten a `number` (salvo
   * los de 8 o más dígitos, como CUIT, CAE o fechas `YYYYMMDD`).
   * `false`: todos los valores de texto quedan como string, sin conversión.
   */
  parseNumbers?: boolean;
}

const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  format: true,
  suppressEmptyNode: true,
});

/**
 * Parsea un string XML a objeto JS. Con `parseNumbers: false` los valores de
 * texto no se convierten a número.
 */
export function parseXml(xml: string, options?: ParseXmlOptions): Record<string, unknown> {
  const parser = options?.parseNumbers === false ? xmlTextParser : xmlParser;
  return parser.parse(xml) as Record<string, unknown>;
}

/**
 * Construye XML desde un objeto JS. Las propiedades (y elementos de arrays)
 * con valor `null`/`undefined` se omiten, en lugar de enviarse como `<x/>`.
 * Un `Date` (también dentro de arrays u objetos anidados) se envía como
 * `xsd:dateTime` en hora de Argentina (`AAAA-MM-DDTHH:mm:ss-03:00`).
 * @throws ArcaValidationError si algún `Date` es inválido.
 */
export function buildXml(obj: Record<string, unknown>): string {
  return xmlBuilder.build(prepareForXml(obj)) as string;
}

/** Copia de `value` sin propiedades ni elementos `null`/`undefined`, con los `Date` formateados (recursivo). */
function prepareForXml(value: unknown): unknown {
  if (Array.isArray(value)) return value.filter((v) => v !== null && v !== undefined).map(prepareForXml);
  if (value instanceof Date) return formatDateTimeAR(value);
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v !== null && v !== undefined) out[k] = prepareForXml(v);
  }
  return out;
}

/**
 * Normaliza un valor que puede ser un item, un array, o undefined/null a un array.
 * Útil para respuestas SOAP donde un solo elemento no viene wrapeado en array.
 */
export function ensureArray<T>(val: T | T[] | undefined | null): T[] {
  if (val === undefined || val === null) return [];
  return Array.isArray(val) ? val : [val];
}

/**
 * Busca un valor en un objeto probando múltiples keys posibles (solo
 * propiedades propias). Útil para respuestas SOAP donde los prefijos de
 * namespace varían.
 *
 * Si una key existe pero vale `undefined`/`null`, sigue probando las
 * siguientes. Si `obj` no es un objeto, devuelve `undefined`.
 */
export function getNestedValue(obj: Record<string, unknown>, ...keys: string[]): unknown {
  if (obj === null || typeof obj !== 'object') return undefined;
  let nullish: unknown;
  for (const key of keys) {
    if (!Object.hasOwn(obj, key)) continue;
    const value = obj[key];
    if (value !== undefined && value !== null) return value;
    if (value === null) nullish = null;
  }
  return nullish;
}

/**
 * Busca en `obj` la key cuyo nombre local (sin prefijo de namespace) es alguno
 * de `names`: `"Body"` encuentra `Body`, `soap:Body`, `S:Body`, etc.
 */
function findLocalKey(obj: unknown, ...names: string[]): string | undefined {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return undefined;
  const keys = Object.keys(obj);
  for (const name of names) {
    if (Object.hasOwn(obj, name)) return name;
    const prefixed = keys.find((k) => k.endsWith(`:${name}`));
    if (prefixed) return prefixed;
  }
  return undefined;
}

/** Valor de la key con nombre local `name` (ver `findLocalKey`). */
function localValue(obj: unknown, ...names: string[]): unknown {
  const key = findLocalKey(obj, ...names);
  return key === undefined ? undefined : (obj as Record<string, unknown>)[key];
}

// ---------------------------------------------------------------------------
// Transporte: clasificación de errores
// ---------------------------------------------------------------------------

/**
 * Parser para respuestas SOAP: igual que `parseXml` pero sin prefijos de
 * namespace (`ns2:getPersonaResponse` → `getPersonaResponse`), porque cada
 * servidor de ARCA usa prefijos distintos para los mismos elementos.
 */
const soapResponseParser = new XMLParser({ ...PARSER_OPTIONS, removeNSPrefix: true });

/** `soapResponseParser` sin conversión de tipos (`parseNumbers: false`). */
const soapResponseTextParser = new XMLParser({ ...TEXT_PARSER_OPTIONS, removeNSPrefix: true });

/**
 * Emite un evento sin que un error del callback del usuario afecte la
 * operación (una respuesta recibida nunca debe convertirse en error por un
 * logger que falla).
 */
export function safeEmit(onEvent: ((event: ArcaEvent) => void) | undefined, event: ArcaEvent): void {
  try {
    onEvent?.(event);
  } catch {
    // Ignorado a propósito.
  }
}

/**
 * Códigos de error de red que garantizan que el request no llegó al servidor
 * (falla de DNS, conexión rechazada, handshake TLS fallido).
 */
const NOT_SENT_CODES = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'ERR_SSL_DH_KEY_TOO_SMALL',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'CERT_HAS_EXPIRED',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
]);

function networkErrorCode(err: unknown): string | undefined {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

function textOf(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return textOf(value[0]);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (Object.hasOwn(obj, '#text')) return String(obj['#text']);
    // SOAP 1.2: <Reason><Text>...</Text></Reason>, <Code><Value>...</Value></Code>
    return textOf(localValue(obj, 'Text', 'Value'));
  }
  return String(value);
}

/** Body del Envelope SOAP de una respuesta parseada (con o sin prefijos), si existe. */
function soapBody(parsed: unknown): Record<string, unknown> | undefined {
  const envelope = localValue(parsed, 'Envelope');
  const body = localValue(envelope, 'Body');
  return body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : undefined;
}

interface SoapFault {
  faultCode?: string;
  faultString: string;
  /** Contenido de `<detail>` (SOAP 1.1) / `<Detail>` (SOAP 1.2). */
  faultDetail?: unknown;
}

/**
 * Extrae `faultcode`/`faultstring`/`detail` de una respuesta SOAP ya parseada,
 * con o sin prefijos de namespace (`soapCall` o `parseXml`).
 */
function extractFault(parsed: Record<string, unknown>): SoapFault | undefined {
  return faultFromBody(soapBody(parsed));
}

function faultFromBody(body: Record<string, unknown> | undefined): SoapFault | undefined {
  const fault = localValue(body, 'Fault');
  if (fault === undefined || fault === null) return undefined;
  if (typeof fault !== 'object') return { faultString: String(fault) || 'SOAP Fault desconocido' };
  const out: SoapFault = {
    faultCode: textOf(localValue(fault, 'faultcode', 'Code')),
    faultString: textOf(localValue(fault, 'faultstring', 'Reason')) ?? 'SOAP Fault desconocido',
  };
  const detail = localValue(fault, 'detail', 'Detail');
  if (detail !== undefined && detail !== null && detail !== '') out.faultDetail = detail;
  return out;
}

/**
 * Fault de tipo Client (SOAP 1.1 `Client`, SOAP 1.2 `Sender`, con o sin
 * prefijo, ej: `soap:Client`, `S:Client.Authentication`): el servidor rechazó
 * el request sin procesarlo.
 */
function isClientFault(faultCode: string | undefined): boolean {
  if (!faultCode) return false;
  const local = faultCode.slice(faultCode.lastIndexOf(':') + 1);
  return /^(Client|Sender)(\.|$)/.test(local);
}

/**
 * Un SOAP Fault es una respuesta del servidor: un rechazo determinístico. En
 * consultas es cierto que no cambió nada; en emisiones se mantiene `uncertain`
 * por prudencia (algunos servicios devuelven Faults ante errores internos que
 * pudieron ocurrir después de procesar el comprobante), salvo los Faults de
 * tipo Client/Sender: el request se rechazó antes de procesarse.
 */
function faultUncertain(kind: SoapOperationKind | undefined, faultCode: string | undefined): boolean {
  return kind === 'emision' && !isClientFault(faultCode);
}

/** Largo máximo del extracto del body que se guarda en `ArcaSoapError.responseBody`. */
const RESPONSE_EXCERPT_MAX = 500;

/** Extracto de un body de respuesta para diagnóstico: espacios colapsados, hasta 500 caracteres. */
function bodyExcerpt(text: string): string | undefined {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (!collapsed) return undefined;
  return collapsed.length > RESPONSE_EXCERPT_MAX ? `${collapsed.slice(0, RESPONSE_EXCERPT_MAX - 1)}…` : collapsed;
}

function parseResponseDate(header: string | null): Date | undefined {
  if (!header) return undefined;
  const d = new Date(header);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Un error es reintentable (solo en consultas) si es transitorio: red, timeout,
 * respuesta cortada o ilegible, o un 5xx sin SOAP Fault (502/503/504 de un
 * proxy). Un SOAP Fault es una respuesta determinística del servicio y un 4xx
 * un rechazo del request: no se reintentan.
 */
function isRetryable(error: ArcaSoapError): boolean {
  if (error.aborted) return false;
  if (error.faultString !== undefined) return false;
  const status = error.statusCode;
  return status === undefined || status < 400 || status >= 500;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal!.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

// ---------------------------------------------------------------------------
// Transporte TLS legacy
// ---------------------------------------------------------------------------

/** Hosts que necesitaron el transporte legacy (DH de 1024 bits), para no fallar la primera vez cada vez. */
const legacyTlsHosts = new Set<string>();

function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint;
  }
}

/** Respuesta HTTP normalizada (de `fetch` o del transporte legacy). */
interface TransportResponse {
  status: number;
  statusText: string;
  ok: boolean;
  date: string | null;
  /** Lee el body. Puede fallar si la conexión se corta. */
  text(): Promise<string>;
}

function fromFetchResponse(response: Response): TransportResponse {
  return {
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    date: response.headers.get('date'),
    text: () => response.text(),
  };
}

// ---------------------------------------------------------------------------
// soapCall
// ---------------------------------------------------------------------------

/**
 * Llamada SOAP genérica de bajo nivel.
 * Construye el envelope SOAP, envía via fetch con timeout, y parsea la
 * respuesta XML. Los prefijos de namespace se eliminan de la respuesta
 * parseada (`soap:Envelope` → `Envelope`).
 *
 * - `kind: 'consulta'` (default): reintenta errores de red, timeouts, 5xx
 *   sin SOAP Fault y respuestas que no son SOAP, con backoff exponencial.
 * - `kind: 'emision'`: nunca reintenta. Si no hay certeza de que el request no
 *   se procesó, el error tiene `uncertain: true`.
 *
 * Los SOAP Faults (con HTTP 500 o 200) se lanzan como `ArcaSoapError` con
 * `faultCode`/`faultString`; en consultas no son `uncertain`. Todos los errores
 * con respuesta incluyen `responseDate` (header `Date` del servidor).
 *
 * Si el `fetch` por defecto falla con `ERR_SSL_DH_KEY_TOO_SMALL` (hosts con DH
 * de 1024 bits), el mismo request se reintenta una vez con un transporte
 * `node:https` con `SECLEVEL=1` (ver `legacyTls`).
 *
 * Con `parseNumbers: false` los valores de texto de la respuesta quedan como
 * string (por cualquiera de los dos transportes).
 */
export function soapCall(
  endpoint: string,
  bodyContent: string,
  opts?: SoapCallOptions,
): Promise<Record<string, unknown>> {
  return soapCallWith(endpoint, bodyContent, opts, isRetryable);
}

/**
 * `soapCall` con un criterio propio de reintento (en consultas). WSAA lo usa
 * para reintentar solo los errores sin envío (`uncertain: false`).
 * @internal
 */
export async function soapCallWith(
  endpoint: string,
  bodyContent: string,
  opts: SoapCallOptions | undefined,
  retryable: (error: ArcaSoapError) => boolean,
): Promise<Record<string, unknown>> {
  const timeout = opts?.timeout ?? 30_000;
  const kind = opts?.kind ?? 'consulta';
  const maxRetries = kind === 'emision' ? 0 : (opts?.retries ?? 1);
  const baseDelay = opts?.retryDelayMs ?? 1_000;
  const onEvent = opts?.onEvent;
  const methodName = opts?.methodName ?? 'unknown';
  const externalSignal = opts?.signal;
  const injectedFetch = opts?.fetch;
  const legacyTls = opts?.legacyTls ?? 'auto';
  const responseParser = opts?.parseNumbers === false ? soapResponseTextParser : soapResponseParser;
  const host = hostOf(endpoint);

  const envelope =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soapenv:Body>${bodyContent}</soapenv:Body>` +
    `</soapenv:Envelope>`;

  const headers: Record<string, string> = {
    'Content-Type': 'text/xml; charset=utf-8',
    SOAPAction: `"${opts?.soapAction ?? ''}"`,
  };

  let lastError: ArcaSoapError | undefined;

  for (let attempt = 0; ; attempt++) {
    if (lastError) {
      const delay = baseDelay * 2 ** (attempt - 1);
      safeEmit(onEvent, {
        type: 'request:retry',
        endpoint,
        method: methodName,
        attempt,
        error: lastError,
      });
      try {
        await sleep(delay, externalSignal);
      } catch (reason) {
        throw abortedBeforeSend(methodName, reason);
      }
    }

    // Abortado antes de enviar: certeza de que no se procesó.
    if (externalSignal?.aborted) {
      throw abortedBeforeSend(methodName, externalSignal.reason);
    }

    const error = await attemptOnce();
    if (!(error instanceof ArcaSoapError)) return error;

    lastError = error;
    if (attempt < maxRetries && retryable(error)) continue;

    safeEmit(onEvent, { type: 'request:error', endpoint, method: methodName, error });
    throw error;
  }

  /** Envía el request por `fetch` o por el transporte legacy, con fallback ante DH chico. */
  async function send(signal: AbortSignal): Promise<TransportResponse> {
    const useLegacy =
      injectedFetch === undefined && (legacyTls === 'always' || (legacyTls === 'auto' && legacyTlsHosts.has(host)));
    if (useLegacy) return sendLegacy(signal);

    const doFetch = injectedFetch ?? globalThis.fetch;
    try {
      const response = await doFetch(endpoint, { method: 'POST', headers, body: envelope, signal });
      return fromFetchResponse(response);
    } catch (err) {
      // Falla de handshake: el request no se envió, así que es seguro
      // reintentarlo con el transporte legacy (también en emisiones).
      if (
        injectedFetch === undefined &&
        legacyTls === 'auto' &&
        !signal.aborted &&
        networkErrorCode(err) === 'ERR_SSL_DH_KEY_TOO_SMALL'
      ) {
        legacyTlsHosts.add(host);
        return sendLegacy(signal);
      }
      throw err;
    }
  }

  async function sendLegacy(signal: AbortSignal): Promise<TransportResponse> {
    try {
      const res = await legacyTlsRequest(endpoint, { method: 'POST', headers, body: envelope, signal });
      return {
        status: res.status,
        statusText: res.statusText,
        ok: res.status >= 200 && res.status < 300,
        date: res.headers['date'] ?? null,
        text: async () => res.body,
      };
    } catch (err) {
      if (err instanceof LegacyTlsResponseError) {
        // El servidor ya respondió y el body se cortó: se informa como error de lectura.
        const status = err.status;
        const date = err.headers['date'] ?? null;
        return {
          status,
          statusText: '',
          ok: status >= 200 && status < 300,
          date,
          text: async () => {
            throw err.cause ?? err;
          },
        };
      }
      throw err;
    }
  }

  /** Devuelve la respuesta parseada, o el error (sin lanzarlo) para decidir el reintento. */
  async function attemptOnce(): Promise<Record<string, unknown> | ArcaSoapError> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);
    const onExternalAbort = () => controller.abort(externalSignal?.reason);
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

    const startTime = Date.now();
    safeEmit(onEvent, { type: 'request:start', endpoint, method: methodName });

    try {
      let response: TransportResponse;
      try {
        response = await send(controller.signal);
      } catch (err) {
        return fetchError(err, timedOut);
      }

      const responseDate = parseResponseDate(response.date);
      let responseText: string;
      try {
        responseText = await response.text();
      } catch (err) {
        // La respuesta empezó a llegar: el servidor procesó (o está procesando) el request.
        const base = fetchError(err, timedOut);
        return new ArcaSoapError(base.message, {
          cause: err,
          statusCode: response.status,
          responseDate,
          uncertain: true,
          aborted: base.aborted,
        });
      }

      let parsed: Record<string, unknown> | undefined;
      try {
        parsed = responseParser.parse(responseText) as Record<string, unknown>;
      } catch {
        parsed = undefined;
      }

      // Un Fault se lanza igual con HTTP 500 o 200.
      const fault = parsed ? extractFault(parsed) : undefined;
      if (fault) {
        return new ArcaSoapError(`SOAP Fault: ${fault.faultString}`, {
          statusCode: response.status,
          faultCode: fault.faultCode,
          faultString: fault.faultString,
          faultDetail: fault.faultDetail,
          responseDate,
          uncertain: faultUncertain(kind, fault.faultCode),
        });
      }

      if (!response.ok) {
        const excerpt = bodyExcerpt(responseText);
        return new ArcaSoapError(
          `HTTP ${response.status}: ${response.statusText}${excerpt ? ` (respuesta: ${excerpt})` : ''}`,
          {
            statusCode: response.status,
            responseDate,
            // 4xx: el servidor rechazó el request sin procesarlo.
            uncertain: response.status >= 500,
            responseBody: excerpt,
          },
        );
      }

      if (!parsed || !soapBody(parsed)) {
        // 2xx sin Envelope SOAP (ej: página HTML de mantenimiento de un proxy):
        // error de transporte, reintentable en consultas.
        return new ArcaSoapError(`Respuesta inválida de ${methodName}: HTTP ${response.status} sin SOAP Envelope`, {
          statusCode: response.status,
          responseDate,
          uncertain: true,
        });
      }

      safeEmit(onEvent, { type: 'request:end', endpoint, method: methodName, durationMs: Date.now() - startTime });
      return parsed;
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    }
  }

  function fetchError(err: unknown, timedOut: boolean): ArcaSoapError {
    if (timedOut) {
      return new ArcaSoapError(`Timeout después de ${timeout}ms llamando a ${methodName}`, {
        cause: err,
        uncertain: true,
      });
    }
    if (externalSignal?.aborted) {
      return new ArcaSoapError(`Llamada a ${methodName} abortada`, {
        cause: err,
        uncertain: true,
        aborted: true,
      });
    }
    const code = networkErrorCode(err);
    const detail = err instanceof Error ? err.message : String(err);
    return new ArcaSoapError(`Error de red llamando a ${methodName}: ${detail}${code ? ` (${code})` : ''}`, {
      cause: err,
      uncertain: !(code !== undefined && NOT_SENT_CODES.has(code)),
    });
  }
}

/** @internal Solo para tests: olvida los hosts que necesitaron TLS legacy. */
export function resetLegacyTlsHosts(): void {
  legacyTlsHosts.clear();
}

/** Error para una llamada cancelada por el caller antes de enviarse (no se procesó nada). */
export function abortedBeforeSend(methodName: string, reason: unknown): ArcaSoapError {
  return new ArcaSoapError(`Llamada a ${methodName} abortada antes de enviarse`, {
    cause: reason,
    uncertain: false,
    aborted: true,
  });
}

// ---------------------------------------------------------------------------
// arcaSoapCall
// ---------------------------------------------------------------------------

/** Opciones de `arcaSoapCall`: las de `soapCall` más la forma del request/respuesta. */
export interface ArcaSoapCallOptions extends SoapCallOptions {
  /**
   * Nombre del elemento wrapper del request (default: `method`). `null` envía
   * el Body vacío (ej: `dummy` de WSFECRED).
   */
  requestElement?: string | null;
  /** Nombre del elemento de respuesta (default: `${method}Response`). */
  responseElement?: string;
  /**
   * `false` (default): `<ser:metodo xmlns:ser="ns">` con hijos sin namespace
   * (`elementFormDefault="unqualified"`, ej: Padrón, WSAA).
   * `true`: `<metodo xmlns="ns">` y los hijos heredan el namespace
   * (`elementFormDefault="qualified"`, ej: servicios ASMX como WSFEv1).
   */
  qualified?: boolean;
  /**
   * Usa `namespace + method` como SOAPAction (con `/` intermedia si el
   * namespace no termina en `/`). Un `soapAction` explícito tiene prioridad.
   */
  soapActionFromMethod?: boolean;
}

/** Opciones de `extractMethodResult`. */
export interface ExtractMethodResultOptions {
  /** Tipo de operación: define si un SOAP Fault es `uncertain` (default: `consulta`). */
  kind?: SoapOperationKind;
  /** Nombre del elemento de respuesta (default: `${method}Response`). */
  responseElement?: string;
}

/** @deprecated Usar `ArcaSoapCallOptions` (mismo tipo). */
export type AfipSoapCallOptions = ArcaSoapCallOptions;

/**
 * Llamada SOAP de alto nivel para web services de ARCA.
 * Construye el body del método (ver `qualified` y `requestElement`), llama a
 * soapCall, y extrae el resultado del método de la respuesta. Los parámetros
 * con valor `null`/`undefined` no se envían.
 *
 * El resultado se desenvuelve si el método responde con un único elemento
 * `{method}Result`, `{method}Return`, `return` o `*Return` (ej: `personaReturn`).
 *
 * Detecta SOAP Faults y lanza ArcaSoapError.
 */
export async function arcaSoapCall(
  endpoint: string,
  namespace: string,
  method: string,
  params: Record<string, unknown>,
  opts?: ArcaSoapCallOptions,
): Promise<Record<string, unknown>> {
  const element = opts?.requestElement === undefined ? method : opts.requestElement;
  let bodyContent = '';
  if (element !== null) {
    const methodBody: Record<string, unknown> = opts?.qualified
      ? { [element]: { '@_xmlns': namespace, ...params } }
      : { [`ser:${element}`]: { '@_xmlns:ser': namespace, ...params } };
    bodyContent = buildXml(methodBody);
  }

  let soapAction = opts?.soapAction;
  if (soapAction === undefined) {
    soapAction = opts?.soapActionFromMethod
      ? namespace.endsWith('/')
        ? `${namespace}${method}`
        : `${namespace}/${method}`
      : '';
  }

  const parsed = await soapCall(endpoint, bodyContent, {
    ...opts,
    soapAction,
    methodName: opts?.methodName ?? method,
  });

  return extractMethodResult(parsed, method, { kind: opts?.kind, responseElement: opts?.responseElement });
}

/** @deprecated Usar `arcaSoapCall` (mismo comportamiento). */
export const afipSoapCall: typeof arcaSoapCall = arcaSoapCall;

/**
 * Extrae el resultado de un método de una respuesta SOAP parseada por
 * `soapCall` (sin prefijos) o por `parseXml` (con prefijos de namespace).
 * Lanza ArcaSoapError si la respuesta no tiene la forma esperada o es un Fault.
 *
 * Devuelve siempre un objeto: el resultado desenvuelto (`*Result`/`*Return`/
 * `return`) si es un objeto, o el elemento de respuesta completo; `{}` si el
 * elemento de respuesta está vacío.
 */
export function extractMethodResult(
  parsed: Record<string, unknown>,
  method: string,
  options?: ExtractMethodResultOptions,
): Record<string, unknown> {
  const invalid = (msg: string) => new ArcaSoapError(`Respuesta SOAP inválida: ${msg}`, { uncertain: true });

  const envelope = localValue(parsed, 'Envelope');
  if (envelope === undefined || envelope === null || typeof envelope !== 'object') throw invalid('falta Envelope');

  const body = soapBody(parsed);
  if (!body) throw invalid('falta Body');

  const fault = faultFromBody(body);
  if (fault) {
    throw new ArcaSoapError(`SOAP Fault: ${fault.faultString}`, {
      faultCode: fault.faultCode,
      faultString: fault.faultString,
      faultDetail: fault.faultDetail,
      uncertain: faultUncertain(options?.kind, fault.faultCode),
    });
  }

  const responseKey = options?.responseElement ?? `${method}Response`;
  const methodResponse = localValue(body, responseKey);
  if (methodResponse === undefined || methodResponse === null) throw invalid(`falta ${responseKey}`);
  if (typeof methodResponse !== 'object' || Array.isArray(methodResponse)) return {};

  const response = methodResponse as Record<string, unknown>;
  const childKeys = Object.keys(response).filter((k) => !k.startsWith('@_'));
  const resultName =
    findLocalKey(response, `${method}Result`, `${method}Return`, 'return') ??
    (childKeys.length === 1 && /(Return|Result)$/.test(childKeys[0]) ? childKeys[0] : undefined);

  const result = resultName ? response[resultName] : undefined;
  if (result !== undefined && result !== null && typeof result === 'object' && !Array.isArray(result)) {
    return result as Record<string, unknown>;
  }
  return response;
}

// ---------------------------------------------------------------------------
// checkServiceErrors
// ---------------------------------------------------------------------------

/**
 * Contenedores de errores de negocio conocidos y los nombres de sus ítems:
 * - WSFE: `Errors.Err[]{Code,Msg}`
 * - `errors.error[]` / `errors.err[]`
 * - Servicios Java (WSMTXCA, WSFECRED): `arrayErrores` y `arrayErroresFormato`, con ítems
 *   `codigoDescripcion[]{codigo,descripcion}` o `codigoDescripcionString[]{codigo,descripcion}`
 *   (el XSD de WSFECRED usa este último en `arrayErroresFormato`)
 * - WSCPE / WSLPG: `errores.error[]{codigo,descripcion}`
 * - WSLPG: `erroresFormato.error[]{codigo,descripcion}`
 */
const ERROR_CONTAINERS: Array<[container: string, items: string[]]> = [
  ['Errors', ['Err', 'err', 'Error', 'error']],
  ['errors', ['error', 'err', 'Err']],
  ['Err', []],
  ['arrayErrores', ['codigoDescripcion', 'codigoDescripcionString']],
  ['arrayErroresFormato', ['codigoDescripcion', 'codigoDescripcionString']],
  ['errores', ['error', 'err']],
  ['erroresFormato', ['error', 'err']],
];

const CODE_KEYS = ['Code', 'code', 'codigo', 'Codigo'];
const MSG_KEYS = ['Msg', 'msg', 'descripcion', 'Descripcion', 'message', 'mensaje'];

function toServiceError(item: unknown): ServiceErrorDetail | undefined {
  if (item === undefined || item === null || item === '') return undefined;
  if (typeof item !== 'object') return { code: 0, msg: String(item) };

  const obj = item as Record<string, unknown>;
  const rawCodeValue = getNestedValue(obj, ...CODE_KEYS);
  const rawMsg = getNestedValue(obj, ...MSG_KEYS);
  const msg = textOf(rawMsg) ?? 'Error desconocido';

  const raw = textOf(rawCodeValue)?.trim();
  if (raw === undefined || raw === '') return { code: 0, msg };
  if (/^-?\d+$/.test(raw)) return { code: Number(raw), msg };
  return { code: 0, msg, rawCode: raw };
}

/**
 * Extrae los errores de negocio de una respuesta de un WS de ARCA, sin lanzar.
 * Reconoce los formatos de WSFE, servicios Java (WSMTXCA, WSFECRED), WSCPE,
 * WSLPG (`errores` y `erroresFormato`) y `errors.error[]`/`errors.err[]`. Para SDKs que devuelven los errores
 * en lugar de lanzarlos.
 *
 * `code` es numérico; si el servicio devolvió un código no numérico, `code`
 * es 0 y `rawCode` tiene el original.
 */
export function extractServiceErrors(result: Record<string, unknown>): ServiceErrorDetail[] {
  if (result === null || typeof result !== 'object') return [];
  const errors: ServiceErrorDetail[] = [];
  for (const [containerName, itemNames] of ERROR_CONTAINERS) {
    if (!Object.hasOwn(result, containerName)) continue;
    for (const container of ensureArray(result[containerName])) {
      if (container === null || container === undefined || container === '') continue;
      let items: unknown[];
      if (typeof container === 'object') {
        const itemKey = itemNames.find((n) => Object.hasOwn(container as object, n));
        // Sin ítems hijos, el contenedor es el error (ej: `Err: {Code, Msg}`).
        items = itemKey !== undefined ? ensureArray((container as Record<string, unknown>)[itemKey]) : [container];
      } else {
        items = [container];
      }
      for (const item of items) {
        const err = toServiceError(item);
        if (err) errors.push(err);
      }
    }
  }
  return errors;
}

/**
 * Verifica si una respuesta de un WS de ARCA contiene errores de negocio.
 * Lanza ArcaServiceError si algún error tiene un código distinto de 0 (o un
 * código no numérico). Ver `extractServiceErrors` para los formatos soportados.
 */
export function checkServiceErrors(result: Record<string, unknown>, serviceName: string): void {
  const errors = extractServiceErrors(result);
  if (errors.some((e) => e.code !== 0 || e.rawCode !== undefined)) {
    throw new ArcaServiceError(
      `${serviceName}: ${errors.map((e) => `[${e.rawCode ?? e.code}] ${e.msg}`).join(', ')}`,
      errors,
    );
  }
}
