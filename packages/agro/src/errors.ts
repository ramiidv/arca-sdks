import { ArcaResponseError, ArcaServiceError, extractServiceErrors } from '@ramiidv/arca-common';
import type { ServiceErrorDetail } from '@ramiidv/arca-common';

/**
 * Error de negocio de WSCPE/WSLPG (`errores.error[]`, y en WSLPG también
 * `erroresFormato.error[]`). Extiende `ArcaServiceError`.
 *
 * `response` tiene el nodo de respuesta completo tal cual lo devolvió ARCA
 * (`respuesta` en WSCPE, `*Return` en WSLPG), por si trae datos además de los
 * errores.
 */
export class ArcaAgroServiceError extends ArcaServiceError {
  static override readonly code: string = 'ARCA_AGRO_SERVICE_ERROR';
  constructor(
    message: string,
    errors: ServiceErrorDetail[],
    public readonly service: 'WSCPE' | 'WSLPG',
    public readonly method: string,
    public readonly response: Record<string, unknown>,
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

/**
 * Lanza `ArcaAgroServiceError` si el nodo tiene errores de negocio (con código
 * distinto de 0 o no numérico). `extractServiceErrors` de common reconoce
 * `errores.error[]` (WSCPE, WSLPG) y `erroresFormato.error[]` (WSLPG).
 * @internal
 */
export function throwOnServiceErrors(node: Record<string, unknown>, service: 'WSCPE' | 'WSLPG', method: string): void {
  const errors = extractServiceErrors(node);
  const relevant = errors.filter((e) => e.code !== 0 || e.rawCode !== undefined);
  if (relevant.length > 0) {
    throw new ArcaAgroServiceError(
      `${service} ${method}: ${relevant.map((e) => `[${e.rawCode ?? e.code}] ${e.msg}`).join(', ')}`,
      relevant,
      service,
      method,
      node,
    );
  }
}
