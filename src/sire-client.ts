import { afipSoapCall, ArcaSoapError } from '@ramiidv/arca-common';
import type { ArcaEvent, CallOptions, LegacyTlsMode, ServerStatus, SoapOperationKind } from '@ramiidv/arca-common';
import { SIRE_NAMESPACE } from './constants.js';
import { ArcaSireServiceError } from './errors.js';
import type { CertificadoAnulacionRequest, CertificadoRequest, CertificadoResult, WsAuth } from './types.js';

/** Configuración del cliente SOAP de bajo nivel. */
export interface SireClientConfig {
  /** URL del servicio (ver `ENDPOINTS.sire`). */
  endpoint: string;
  /** Timeout en ms (default: 30000). */
  timeout?: number;
  /** Reintentos de `dummy` (default: 1). `emitir`/`anular` nunca se reintentan. */
  retries?: number;
  /** Delay base entre reintentos en ms (default: 1000). */
  retryDelayMs?: number;
  onEvent?: (event: ArcaEvent) => void;
  fetch?: typeof fetch;
  legacyTls?: LegacyTlsMode;
}

/** Orden de los hijos de `certificado` en el XSD (`xs:sequence`). */
const CERTIFICADO_ORDER = [
  'version', 'codigoTrazabilidad', 'impuesto', 'regimen', 'fechaRetencion', 'condicion',
  'imposibilidadRetencion', 'motivoNoRetencion', 'importeRetencion', 'importeBaseCalculo',
  'regimenExclusion', 'porcentajeExclusion', 'fechaPublicacion', 'tipoComprobante', 'fechaComprobante',
  'numeroComprobante', 'coe', 'coeOriginal', 'cae', 'importeComprobante', 'motivoEmisionNotaCredito',
  'cuitRetenido', 'numeroCertificadoOriginal', 'fechaRetencionCertificadoOriginal',
  'importeCertificadoOriginal', 'motivoAnulacion',
] as const satisfies readonly (keyof CertificadoRequest)[];

/** Orden de los hijos de `certificadoAnulacion` en el XSD. */
const ANULACION_ORDER = [
  'version', 'codigoTrazabilidad', 'impuesto', 'numeroCertificado', 'motivoAnulacion',
] as const satisfies readonly (keyof CertificadoAnulacionRequest)[];

/**
 * Faults con `faultcode` `soapenv:Server` que, según lo observado en
 * homologación, son rechazos previos a procesar el request: XML que no cumple
 * el schema, operación inexistente y token/sign faltante o inválido.
 */
const REJECTION_FAULT_PATTERNS = [
  /^XML invalido/i,
  /no cumple el schema/i,
  /^Request mal formado/i,
  /^[A-Z_]*(TOKEN|SIGN)[A-Z_]*$/,
];

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

function pick(source: object, order: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of order) {
    const value = (source as Record<string, unknown>)[key];
    if (value !== undefined && value !== null) out[key] = value;
  }
  return out;
}

/** Campo string obligatorio de una respuesta: si falta, la respuesta es inválida. */
function requiredString(result: Record<string, unknown>, field: string, method: string, kind: SoapOperationKind): string {
  const value = result[field];
  if (value === undefined || value === null || value === '' || typeof value === 'object') {
    throw new ArcaSoapError(`Respuesta inválida de ${method}: falta ${field}`, {
      // En una emisión la operación pudo haberse realizado igual.
      uncertain: kind === 'emision',
    });
  }
  return String(value);
}

/**
 * Cliente SOAP de bajo nivel del servicio SIRE certificado C2005.
 * No autentica ni valida: recibe el token/sign y los datos ya serializados.
 * Usar `ArcaSire` salvo que necesites controlar esos pasos.
 */
export class SireClient {
  private readonly config: SireClientConfig;

  constructor(config: SireClientConfig) {
    this.config = config;
  }

  /** Estado de los servidores de SIRE (no requiere autenticación). */
  async dummy(opts?: CallOptions): Promise<ServerStatus> {
    const result = await this.call('dummy', {}, 'consulta', opts);
    return {
      appserver: requiredString(result, 'appserver', 'dummy', 'consulta'),
      dbserver: requiredString(result, 'dbserver', 'dummy', 'consulta'),
      authserver: requiredString(result, 'authserver', 'dummy', 'consulta'),
    };
  }

  /**
   * Emite un certificado C2005 (`emitir`). Operación no idempotente: nunca se
   * reintenta y un error de transporte tiene `uncertain: true`.
   */
  async emitir(
    auth: WsAuth,
    cuitAgente: number,
    certificado: CertificadoRequest,
    opts?: CallOptions,
  ): Promise<CertificadoResult> {
    const result = await this.call(
      'emitir',
      { token: auth.token, sign: auth.sign, cuitAgente, certificado: pick(certificado, CERTIFICADO_ORDER) },
      'emision',
      opts,
    );
    return this.parseCertificado(result, 'emitir');
  }

  /**
   * Anula un certificado C2005 ya emitido (`anular`). Devuelve el número y el
   * código de seguridad del certificado que anula al informado. No se reintenta.
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
        certificadoAnulacion: pick(certificadoAnulacion, ANULACION_ORDER),
      },
      'emision',
      opts,
    );
    return this.parseCertificado(result, 'anular');
  }

  private parseCertificado(result: Record<string, unknown>, method: string): CertificadoResult {
    return {
      certificadoNro: requiredString(result, 'certificadoNro', method, 'emision'),
      codigoSeguridad: requiredString(result, 'codigoSeguridad', method, 'emision'),
    };
  }

  /**
   * Llamada SOAP. Los SOAP Faults que son rechazos (ver `toRejection`) se
   * convierten en `ArcaSireServiceError`; el resto se propaga como `ArcaSoapError`.
   */
  private async call(
    method: string,
    params: Record<string, unknown>,
    kind: SoapOperationKind,
    opts?: CallOptions,
  ): Promise<Record<string, unknown>> {
    try {
      return await afipSoapCall(this.config.endpoint, SIRE_NAMESPACE, method, params, {
        kind,
        timeout: this.config.timeout,
        retries: this.config.retries,
        retryDelayMs: this.config.retryDelayMs,
        onEvent: this.config.onEvent,
        fetch: this.config.fetch,
        legacyTls: this.config.legacyTls,
        signal: opts?.signal,
      });
    } catch (err) {
      throw toRejection(err, method) ?? err;
    }
  }
}

/**
 * Clasifica un SOAP Fault de SIRE. Según el manual (4.1), `soapenv:Client` es
 * un error de negocio provocado por los datos enviados y `soapenv:Server` un
 * error de sistema. En la práctica el servidor también usa `soapenv:Server`
 * para rechazos previos al procesamiento (`REJECTION_FAULT_PATTERNS`).
 *
 * - Rechazo → `ArcaSireServiceError` (determinístico: no se emitió/anuló nada).
 * - Otro `soapenv:Server` → `undefined`: se propaga el `ArcaSoapError`, que en
 *   `emitir`/`anular` tiene `uncertain: true` (un error interno pudo ocurrir
 *   después de registrar el certificado).
 */
function toRejection(err: unknown, method: string): ArcaSireServiceError | undefined {
  if (!(err instanceof ArcaSoapError) || err.faultString === undefined) return undefined;
  const message = decodeEntities(err.faultString).trim();
  const isClient = faultCodeName(err.faultCode) === 'Client';
  if (!isClient && !REJECTION_FAULT_PATTERNS.some((re) => re.test(message))) return undefined;
  return new ArcaSireServiceError(`SIRE ${method}: ${message}`, [{ code: 0, msg: message }], {
    cause: err,
    faultCode: err.faultCode?.trim(),
  });
}
