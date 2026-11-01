import { ArcaError, ArcaServiceError, ArcaSoapError } from '@ramiidv/arca-common';
import type { ServiceErrorDetail } from '@ramiidv/arca-common';

/**
 * Error propio del SDK de Padrón que no es de negocio ni de transporte: la
 * respuesta de ARCA no tiene un dato obligatorio (ej: `personaReturn` sin
 * `persona`) o tiene una forma inesperada.
 */
export class ArcaPadronError extends ArcaError {
  static override readonly code: string = 'ARCA_PADRON_ERROR';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ArcaPadronError';
  }
}

/**
 * Motivo de un error de negocio de Padrón. Textos de los manuales de ARCA
 * (A13 v1.4 §5.3 y constancia de inscripción v4.1):
 *
 * - `inexistente`: "La Clave (CUIT/CUIL) consultada es inexistente",
 *   "No existe persona con ese Id".
 * - `inactiva`: "La clave (CUIT/CUIL) consultada se encuentra INACTIVA".
 * - `id_invalido`: "El Id de la persona no es valido".
 * - `no_autorizado`: "No autorizado, par token/sign invalido.", "Falta token
 *   y/o sign.", "Debe enviar la CUIT representada", "Este token no le permite
 *   actuar en representacion de la CUIT ...".
 * - `otro`: cualquier otro error de negocio.
 */
export type PadronErrorReason = 'inexistente' | 'inactiva' | 'id_invalido' | 'no_autorizado' | 'otro';

/**
 * Error de negocio de Padrón (CUIT inexistente, clave inactiva, token no
 * autorizado, etc.). ARCA los informa como SOAP Fault: el SDK los convierte en
 * este error con un `reason` tipado. El `ArcaSoapError` original queda en
 * `cause` y el texto de ARCA en `errors[0].msg`. No se reintentan.
 */
export class ArcaPadronServiceError extends ArcaServiceError {
  static override readonly code: string = 'ARCA_PADRON_SERVICE_ERROR';
  public readonly reason: PadronErrorReason;

  constructor(
    message: string,
    errors: ServiceErrorDetail[],
    options?: { reason?: PadronErrorReason; cause?: unknown },
  ) {
    super(message, errors, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ArcaPadronServiceError';
    this.reason = options?.reason ?? 'otro';
  }
}

const FAULT_REASONS: Array<[RegExp, PadronErrorReason]> = [
  [/es inexistente|no existe persona/i, 'inexistente'],
  [/se encuentra inactiva/i, 'inactiva'],
  [/id de la persona no es v[aá]lido/i, 'id_invalido'],
  [/no autorizado|falta token|debe enviar la cuit representada|no le permite actuar en representaci[oó]n/i, 'no_autorizado'],
];

/** Motivo de un mensaje de error de negocio de Padrón, o `undefined` si no es uno conocido. */
export function padronErrorReason(message: string): PadronErrorReason | undefined {
  return FAULT_REASONS.find(([re]) => re.test(message))?.[1];
}

/**
 * Convierte un SOAP Fault de negocio conocido en `ArcaPadronServiceError`.
 * Cualquier otro error (transporte, timeout, Fault desconocido) se devuelve
 * sin cambios.
 */
export function toPadronError(err: unknown, method: string): unknown {
  if (!(err instanceof ArcaSoapError) || err.faultString === undefined) return err;
  const reason = padronErrorReason(err.faultString);
  if (!reason) return err;
  const detail: ServiceErrorDetail = { code: 0, msg: err.faultString };
  if (err.faultCode) detail.rawCode = err.faultCode;
  return new ArcaPadronServiceError(`${method}: ${err.faultString}`, [detail], { reason, cause: err });
}
