import { ArcaRechazoError } from '@ramiidv/arca-common';
import type { ServiceErrorDetail } from '@ramiidv/arca-common';

/** Operaciones de SIRE que emiten (y cuyos rechazos se lanzan como `ArcaSireServiceError`). */
export type SireOperacion = 'emitir' | 'anular';

/**
 * Rechazo de SIRE: `emitir` o `anular` respondió con un SOAP Fault que indica
 * que el request no se procesó (error de negocio `soapenv:Client`, XML que no
 * cumple el schema o request mal formado). Los Faults de token/sign faltante o
 * inválido se lanzan como `ArcaAuthError`.
 *
 * Es un `ArcaRechazoError` (y por lo tanto un `ArcaServiceError`): un `catch`
 * de esas clases lo cubre igual que a los rechazos de los demás SDKs.
 * `operacion` es `'emitir'` o `'anular'`.
 *
 * Es determinístico: el certificado **no** se emitió/anuló. `message` y
 * `errors[0].msg` tienen el texto de ARCA; `cause` es el `ArcaSoapError` original.
 */
export class ArcaSireServiceError extends ArcaRechazoError {
  static override readonly code: string = 'ARCA_SIRE_SERVICE_ERROR';
  /** Operación de SIRE rechazada. */
  declare public readonly operacion: SireOperacion;
  /** `faultcode` del SOAP Fault (ej: `soapenv:Client`). */
  public readonly faultCode?: string;

  constructor(
    message: string,
    detalle: { operacion: SireOperacion; errors?: ServiceErrorDetail[]; observaciones?: ServiceErrorDetail[] },
    options?: { cause?: unknown; faultCode?: string },
  ) {
    super(message, detalle, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ArcaSireServiceError';
    this.faultCode = options?.faultCode;
  }
}
