import { ArcaServiceError } from '@ramiidv/arca-common';
import type { ServiceErrorDetail } from '@ramiidv/arca-common';

/**
 * Rechazo de SIRE: el servicio respondió con un SOAP Fault que indica que el
 * request no se procesó (error de negocio `soapenv:Client`, XML que no cumple
 * el schema, request mal formado o token/sign inválido).
 *
 * Es determinístico: el certificado **no** se emitió/anuló. `message` y
 * `errors[0].msg` tienen el texto de ARCA; `cause` es el `ArcaSoapError` original.
 */
export class ArcaSireServiceError extends ArcaServiceError {
  static override readonly code: string = 'ARCA_SIRE_SERVICE_ERROR';
  /** `faultcode` del SOAP Fault (ej: `soapenv:Client`). */
  public readonly faultCode?: string;

  constructor(message: string, errors: ServiceErrorDetail[], options?: { cause?: unknown; faultCode?: string }) {
    super(message, errors, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ArcaSireServiceError';
    this.faultCode = options?.faultCode;
  }
}
