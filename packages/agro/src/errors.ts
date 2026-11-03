import { ArcaResponseError, ArcaServiceError, ArcaSoapError } from '@ramiidv/arca-common';
import type { ServiceErrorDetail } from '@ramiidv/arca-common';

/**
 * Error de negocio de WSCPE/WSLPG (`errores.error[]`, y en WSLPG también
 * `erroresFormato.error[]`). Extiende `ArcaServiceError`.
 *
 * `response` tiene el nodo de respuesta completo tal cual lo devolvió ARCA
 * (`respuesta` en WSCPE, `*Return` en WSLPG), por si trae datos además de los
 * errores.
 *
 * WSCPE y WSLPG no tienen `resultado: 'R'`: ARCA rechaza una emisión
 * informando `errores`, así que el rechazo llega con esta clase (este SDK no
 * lanza `ArcaRechazoError`). Lo que devuelve una emisión es siempre una
 * operación aceptada.
 *
 * Los errores admitidos (WSCPE 550, WSLPG 1021: no se pudo generar el PDF) no
 * lanzan: van a `advertencias` del resultado.
 *
 * `uncertain: true` en una emisión cuya respuesta trae errores **y** el
 * resultado (ej: `cabecera.nroCTG`, `autorizacion.coe`): no se puede saber si
 * la operación quedó hecha. Consultá el estado antes de reintentar.
 */
export class ArcaAgroServiceError extends ArcaServiceError {
  static override readonly code: string = 'ARCA_AGRO_SERVICE_ERROR';
  constructor(
    message: string,
    errors: ServiceErrorDetail[],
    public readonly service: 'WSCPE' | 'WSLPG',
    public readonly method: string,
    public readonly response: Record<string, unknown>,
    public readonly uncertain = false,
  ) {
    super(message, errors);
    this.name = 'ArcaAgroServiceError';
  }
}

/**
 * La respuesta de ARCA no tiene la forma del XSD o le falta un dato
 * imprescindible (ej: `nroCTG` en una autorización, `coe` en una liquidación).
 */
export class ArcaAgroResponseError extends ArcaResponseError {
  static override readonly code: string = 'ARCA_AGRO_RESPONSE_ERROR';
  constructor(message: string, uncertain = false) {
    super(message, uncertain);
    this.name = 'ArcaAgroResponseError';
  }
}

/** `ExceptionType`: detalle del SOAP Fault `Exception` de WSCPE. */
export interface CpeFaultException {
  uuid?: string;
  timestamp?: string;
  /** Identificador del error de negocio que informó ARCA. */
  businessErrorId?: string;
  exceptionDetails?: string;
  serverName?: string;
}

const EXCEPTION_FIELDS = ['uuid', 'timestamp', 'businessErrorId', 'exceptionDetails', 'serverName'] as const;

/**
 * Datos del `<Exception>` de un SOAP Fault de WSCPE (`ArcaSoapError.faultDetail`).
 * Devuelve `undefined` si el error no es un `ArcaSoapError` o el fault no trae
 * ese detalle.
 *
 * @example
 * ```ts
 * catch (e) {
 *   const ex = cpeFaultException(e);
 *   if (ex) console.error(ex.businessErrorId, ex.exceptionDetails, ex.uuid);
 * }
 * ```
 */
export function cpeFaultException(error: unknown): CpeFaultException | undefined {
  if (!(error instanceof ArcaSoapError)) return undefined;
  const detail = error.faultDetail;
  if (detail === null || typeof detail !== 'object') return undefined;
  const key = Object.keys(detail).find((k) => k === 'Exception' || k.endsWith(':Exception'));
  const node = key === undefined ? undefined : (detail as Record<string, unknown>)[key];
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return undefined;
  const out: CpeFaultException = {};
  for (const f of EXCEPTION_FIELDS) {
    const v = (node as Record<string, unknown>)[f];
    if (v !== undefined && v !== null && typeof v !== 'object') out[f] = String(v);
  }
  return out;
}
