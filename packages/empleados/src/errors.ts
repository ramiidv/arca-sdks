import { ArcaError } from '@ramiidv/arca-common';

export { ArcaError, ArcaValidationError } from '@ramiidv/arca-common';
export type { ValidationErrorDetail } from '@ramiidv/arca-common';

/** Error base del SDK de empleados. */
export class ArcaEmpleadosError extends ArcaError {
  static override readonly code: string = 'ARCA_EMPLEADOS_ERROR';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ArcaEmpleadosError';
  }
}

/** Datos opcionales de un {@link ArcaSerializationError}. */
export interface ArcaSerializationErrorOptions {
  /** Campo del registro que no se pudo escribir. */
  field?: string;
  /** Posición inicial del campo en el registro (1-based). */
  desde?: number;
  /** Posición final del campo en el registro (1-based, inclusive). */
  hasta?: number;
  /** Valor recibido. */
  value?: unknown;
  /** Índice (0-based) del registro dentro del archivo, si aplica. */
  indice?: number;
  cause?: unknown;
}

/**
 * Un valor no se puede escribir en el formato de ancho fijo: tipo incorrecto,
 * excede el largo del campo, fecha inexistente, caracter no representable, etc.
 * Nunca se trunca en silencio.
 */
export class ArcaSerializationError extends ArcaEmpleadosError {
  static override readonly code: string = 'ARCA_SERIALIZATION_ERROR';
  readonly field?: string;
  readonly desde?: number;
  readonly hasta?: number;
  readonly value?: unknown;
  readonly indice?: number;

  constructor(message: string, options: ArcaSerializationErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ArcaSerializationError';
    this.field = options.field;
    this.desde = options.desde;
    this.hasta = options.hasta;
    this.value = options.value;
    this.indice = options.indice;
  }
}
