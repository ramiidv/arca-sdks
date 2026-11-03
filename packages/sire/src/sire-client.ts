import {
  ArcaAuthError,
  ArcaResponseError,
  ArcaSoapError,
  buildXml,
  extractMethodResult,
  parseServerStatus,
  SoapServiceClient,
  soapCall,
} from '@ramiidv/arca-common';
import type { CallOptions, ServiceClientConfig } from '@ramiidv/arca-common';
import { decodeResponse } from '@ramiidv/arca-common/schema';
import type { Schema } from '@ramiidv/arca-common/schema';
import { SIRE_NAMESPACE } from './constants.js';
import { ArcaSireServiceError } from './errors.js';
import type { SireOperacion } from './errors.js';
import { CERTIFICADO, CERTIFICADO_ANULACION, CERTIFICADO_RESULT } from './schemas.js';
import type {
  CertificadoAnulacionRequest,
  CertificadoRequest,
  CertificadoResult,
  SireHeaderInfo,
  SireServerStatus,
  WsAuth,
} from './types.js';

/**
 * Configuración del cliente SOAP de bajo nivel: `endpoint` (ver `ENDPOINTS.sire`)
 * y `transport` opcional (timeout, reintentos de `dummy`, eventos, fetch, TLS
 * legacy; `emitir`/`anular` nunca se reintentan). El namespace lo fija el
 * cliente (`SIRE_NAMESPACE`).
 */
export type SireClientConfig = ServiceClientConfig;

/**
 * Faults con `faultcode` `soapenv:Server` que, según lo observado en
 * homologación, son rechazos previos a procesar el request: XML que no cumple
 * el schema y operación inexistente.
 */
const REJECTION_FAULT_PATTERNS = [/^XML invalido/i, /no cumple el schema/i, /^Request mal formado/i];

/**
 * Faults de token/sign faltante o inválido. El manual no publica la lista; en
 * homologación se observaron `MISSING_AUTHENTICATION_TOKEN`, `CANT_PARSE_TOKEN`,
 * `CANT_VERIFY_SIGN` (cubiertos por el patrón `XXX_TOKEN`/`XXX_SIGN`),
 * `BAD_SERVICE` (ticket de otro servicio) y `CANT_VERIFY_DATA` (token y sign que
 * no se corresponden). Todos con `soapenv:Server` y `faultstring` igual al
 * código. Se lanzan como `ArcaAuthError` (el ticket cacheado no se borra: ver
 * `ArcaSire.emitirCertificado`).
 */
const AUTH_FAULT_PATTERN = /^[A-Z_]*(TOKEN|SIGN)[A-Z_]*$/;
const AUTH_FAULT_CODES: ReadonlySet<string> = new Set(['BAD_SERVICE', 'CANT_VERIFY_DATA']);

function isAuthFault(message: string): boolean {
  return AUTH_FAULT_PATTERN.test(message) || AUTH_FAULT_CODES.has(message);
}

/** El servidor de SIRE escapa dos veces las entidades del faultstring (`&amp;apos;`). */
function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** Nombre local del faultcode (`soapenv:Client` → `Client`). */
function faultCodeName(faultCode: string | undefined): string | undefined {
  return faultCode?.trim().split(':').pop();
}

/** Copia los campos definidos de `source` en el orden del schema (`xs:sequence`). */
function pick(source: object, schema: Schema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(schema)) {
    const value = (source as Record<string, unknown>)[key];
    if (value !== undefined && value !== null) out[key] = value;
  }
  return out;
}

/**
 * Cliente SOAP de bajo nivel del servicio SIRE certificado C2005.
 * No autentica ni valida: recibe el token/sign y los datos ya serializados.
 * Usar `ArcaSire` salvo que necesites controlar esos pasos.
 *
 * @example
 * ```ts
 * const client = new SireClient({ endpoint: ENDPOINTS.sire.testing, transport: { timeout: 30_000 } });
 * ```
 */
export class SireClient extends SoapServiceClient {
  constructor(config: SireClientConfig) {
    super({ endpoint: config.endpoint, namespace: SIRE_NAMESPACE, transport: config.transport });
  }

  /**
   * Estado de los servidores de SIRE (no requiere autenticación), con el
   * `HeaderInfo` de la respuesta (ambiente y versiones) si vino. No es una
   * emisión: un SOAP Fault se propaga como `ArcaSoapError` (nunca como
   * `ArcaSireServiceError`) y una respuesta incompleta lanza `ArcaResponseError`.
   */
  async dummy(opts?: CallOptions): Promise<SireServerStatus> {
    // soapCall directo (no `this.call`) para leer el header de la respuesta.
    const parsed = await soapCall(this.endpoint, buildXml({ 'ser:dummy': { '@_xmlns:ser': this.namespace } }), {
      ...this.transport,
      kind: 'consulta',
      soapAction: '',
      methodName: 'dummy',
      signal: opts?.signal,
      parseNumbers: false,
    });
    const status: SireServerStatus = parseServerStatus(extractMethodResult(parsed, 'dummy', { kind: 'consulta' }));
    const headerInfo = parseHeaderInfo(parsed);
    if (headerInfo) status.headerInfo = headerInfo;
    return status;
  }

  /**
   * Emite un certificado C2005 (`emitir`). Operación no idempotente: nunca se
   * reintenta y un error de transporte tiene `uncertain: true`. Un rechazo de
   * ARCA se lanza como `ArcaSireServiceError` (`operacion: 'emitir'`); una
   * respuesta inválida, como `ArcaResponseError` con `uncertain: true`.
   */
  async emitir(
    auth: WsAuth,
    cuitAgente: number,
    certificado: CertificadoRequest,
    opts?: CallOptions,
  ): Promise<CertificadoResult> {
    const result = await this.call(
      'emitir',
      { token: auth.token, sign: auth.sign, cuitAgente, certificado: pick(certificado, CERTIFICADO) },
      opts,
    );
    return this.parseCertificado(result, 'emitir');
  }

  /**
   * Anula un certificado C2005 ya emitido (`anular`). Devuelve el número y el
   * código de seguridad del certificado que anula al informado. No se reintenta.
   * Mismos errores que `emitir` (`operacion: 'anular'`).
   */
  async anular(
    auth: WsAuth,
    cuitAgente: number,
    certificadoAnulacion: CertificadoAnulacionRequest,
    opts?: CallOptions,
  ): Promise<CertificadoResult> {
    const result = await this.call(
      'anular',
      {
        token: auth.token,
        sign: auth.sign,
        cuitAgente,
        certificadoAnulacion: pick(certificadoAnulacion, CERTIFICADO_ANULACION),
      },
      opts,
    );
    return this.parseCertificado(result, 'anular');
  }

  private parseCertificado(result: Record<string, unknown>, method: SireOperacion): CertificadoResult {
    // En una emisión/anulación la operación pudo haberse realizado igual.
    // `must(str())`: un campo ausente o vacío también lanza.
    return decodeResponse<CertificadoResult>(result, CERTIFICADO_RESULT, `${method}Response`, {
      error: (message) => new ArcaResponseError(`SIRE ${method}: ${message}`, true),
    });
  }

  /**
   * Llamada SOAP de una emisión (`emitir`/`anular`: nunca se reintenta). Los
   * SOAP Faults que son rechazos (ver `toRejection`) se convierten en
   * `ArcaSireServiceError` (o `ArcaAuthError` si es de token/sign); el resto se
   * propaga como `ArcaSoapError`.
   */
  private async call(
    method: SireOperacion,
    params: Record<string, unknown>,
    opts?: CallOptions,
  ): Promise<Record<string, unknown>> {
    try {
      // Texto sin convertir: `certificadoNro`/`codigoSeguridad` son `xs:string`.
      return await this.soapCall(method, params, { kind: 'emision', signal: opts?.signal, parseNumbers: false });
    } catch (err) {
      throw toRejection(err, method) ?? err;
    }
  }
}

/** Texto de un nodo parseado (`#text` o el valor), o `undefined`. */
function text(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'object') return text((value as Record<string, unknown>)['#text']);
  const s = String(value).trim();
  return s === '' ? undefined : s;
}

/** `Envelope.Header.HeaderInfo` de una respuesta de `soapCall` (sin prefijos). */
function parseHeaderInfo(parsed: Record<string, unknown>): SireHeaderInfo | undefined {
  const envelope = parsed.Envelope as Record<string, unknown> | undefined;
  const header = envelope?.Header as Record<string, unknown> | undefined;
  const info = header?.HeaderInfo;
  if (info === null || typeof info !== 'object') return undefined;
  const out: SireHeaderInfo = {};
  for (const key of ['ambiente', 'fecha', 'vCore', 'v2005'] as const) {
    const value = text((info as Record<string, unknown>)[key]);
    if (value !== undefined) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Texto del Fault: `faultstring` o, si vino vacío, `detail`. */
function faultMessage(err: ArcaSoapError): string {
  const message = err.faultString === undefined ? '' : decodeEntities(err.faultString).trim();
  if (message !== '' && message !== 'SOAP Fault desconocido') return message;
  const detail = text(err.faultDetail);
  return detail === undefined ? message || 'SOAP Fault sin descripción' : decodeEntities(detail);
}

/**
 * Clasifica un SOAP Fault de SIRE. Según el manual (4.1), `soapenv:Client` es
 * un error de negocio provocado por los datos enviados y `soapenv:Server` un
 * error de sistema. En la práctica el servidor también usa `soapenv:Server`
 * para rechazos previos al procesamiento (`REJECTION_FAULT_PATTERNS`).
 *
 * - Token/sign faltante, inválido o de otro servicio → `ArcaAuthError` (no se
 *   emitió/anuló nada).
 * - Rechazo (cualquier `soapenv:Client`, aunque no traiga `faultstring`) →
 *   `ArcaSireServiceError` con `operacion` = `method` (determinístico: no se
 *   emitió/anuló nada).
 * - Otro `soapenv:Server` → `undefined`: se propaga el `ArcaSoapError`, que en
 *   `emitir`/`anular` tiene `uncertain: true` (un error interno pudo ocurrir
 *   después de registrar el certificado).
 *
 * Solo se usa en `emitir`/`anular`: los Faults de `dummy` quedan como `ArcaSoapError`.
 */
function toRejection(err: unknown, method: SireOperacion): ArcaSireServiceError | ArcaAuthError | undefined {
  if (!(err instanceof ArcaSoapError)) return undefined;
  if (err.faultCode === undefined && err.faultString === undefined) return undefined; // no es un Fault
  const message = faultMessage(err);
  if (isAuthFault(message)) {
    // El `detail` explica el código (ej: BAD_SERVICE → "El service (wsfecred) no es igual ...").
    const detail = text(err.faultDetail);
    const extra = detail === undefined ? '' : decodeEntities(detail);
    const full = extra === '' || extra === message ? message : `${message} (${extra})`;
    return new ArcaAuthError(`SIRE ${method}: ${full}`, { cause: err, faultCode: err.faultCode?.trim() });
  }
  const isClient = faultCodeName(err.faultCode) === 'Client';
  if (!isClient && !REJECTION_FAULT_PATTERNS.some((re) => re.test(message))) return undefined;
  return new ArcaSireServiceError(
    `SIRE ${method}: ${message}`,
    { operacion: method, errors: [{ code: 0, msg: message }] },
    { cause: err, faultCode: err.faultCode?.trim() },
  );
}
