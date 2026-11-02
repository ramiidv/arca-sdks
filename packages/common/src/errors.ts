/**
 * Marca que llevan todas las instancias de errores de los SDKs de ARCA: la
 * lista de `code` de su cadena de clases. Se usa `Symbol.for` para que la marca
 * sea la misma aunque haya más de una copia del paquete cargada (ej: dos
 * versiones en node_modules, o una copia empaquetada por un bundler), y se basa en los
 * `code` (no en el nombre de la clase) para sobrevivir a la minificación.
 */
const ERROR_KINDS = Symbol.for('@ramiidv/arca-common:error-kinds');

/** `code` propio de una clase de error (no heredado), si lo declara. */
function ownCode(ctor: unknown): string | undefined {
  return typeof ctor === 'function' && Object.hasOwn(ctor, 'code')
    ? (ctor as unknown as { code: string }).code
    : undefined;
}

/**
 * Error base para todos los errores de los SDKs de ARCA.
 *
 * Cada clase declara un `code` estático y estable (ej: `"ARCA_AUTH_ERROR"`),
 * disponible también en la instancia, que se puede persistir o comparar sin
 * depender de `instanceof`. Las subclases propias deben declarar su
 * `static readonly code` para participar del `instanceof` entre copias.
 */
export class ArcaError extends Error {
  static readonly code: string = 'ARCA_ERROR';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ArcaError';

    const kinds: string[] = [];
    for (
      let ctor: unknown = new.target;
      typeof ctor === 'function' && ctor !== Error;
      ctor = Object.getPrototypeOf(ctor)
    ) {
      const code = ownCode(ctor);
      if (code) kinds.push(code);
    }
    Object.defineProperty(this, ERROR_KINDS, { value: kinds, enumerable: false });
  }

  /** Código estable del error (el de su clase). */
  get code(): string {
    return (this.constructor as typeof ArcaError).code;
  }

  static [Symbol.hasInstance](value: unknown): boolean {
    if (Function.prototype[Symbol.hasInstance].call(this, value)) return true;
    const code = ownCode(this);
    if (!code || typeof value !== 'object' || value === null) return false;
    const kinds = (value as Record<symbol, unknown>)[ERROR_KINDS];
    return Array.isArray(kinds) && kinds.includes(code);
  }
}

/** Opciones de `ArcaAuthError`. */
export interface ArcaAuthErrorOptions {
  cause?: unknown;
  /**
   * `faultcode` del SOAP Fault de WSAA (ej: `ns1:cms.cert.expired`). Si no se
   * indica y `cause` es un `ArcaSoapError`, se toma de ahí.
   */
  faultCode?: string;
  /** Código HTTP de la respuesta de WSAA. Si no se indica, se toma de `cause` (`ArcaSoapError`). */
  statusCode?: number;
  /**
   * `true` si el error es transitorio y un login posterior puede funcionar sin
   * cambiar nada (WSAA no disponible, red, timeout). Default: `false`.
   */
  retryable?: boolean;
}

/**
 * Error de autenticación WSAA.
 * Se lanza cuando falla el login, el certificado es inválido, o la respuesta de WSAA es inesperada.
 *
 * `faultCode`/`statusCode` vienen del error de WSAA (si lo hubo) y `retryable`
 * indica si tiene sentido volver a intentar más tarde sin cambiar nada. El
 * error original queda en `cause`.
 */
export class ArcaAuthError extends ArcaError {
  static override readonly code: string = 'ARCA_AUTH_ERROR';
  /** `faultcode` del SOAP Fault de WSAA (ej: `ns1:coe.notAuthorized`), si lo hubo. */
  public readonly faultCode?: string;
  /** Código HTTP de la respuesta de WSAA, si hubo respuesta. */
  public readonly statusCode?: number;
  /**
   * `true`: error transitorio (WSAA no disponible, red, timeout), se puede
   * volver a intentar después de la espera de `loginErrorCooldownMs`.
   * `false`: hay que corregir algo (certificado, relación con el servicio,
   * configuración) antes de volver a pedir un TA.
   */
  public readonly retryable: boolean;

  constructor(message: string, options?: ArcaAuthErrorOptions) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ArcaAuthError';
    const cause = options?.cause instanceof ArcaSoapError ? options.cause : undefined;
    this.faultCode = options?.faultCode ?? cause?.faultCode;
    this.statusCode = options?.statusCode ?? cause?.statusCode;
    this.retryable = options?.retryable ?? false;
  }
}

/**
 * WSAA rechazó el login porque ya existe un Ticket de Acceso vigente para este
 * certificado y servicio, y no se encontró ese ticket en memoria ni en el
 * `ticketStorage`.
 *
 * Pasa cuando el proceso se reinicia sin `ticketStorage`, cuando el storage se
 * borró, o cuando un login anterior llegó a ARCA pero la respuesta se perdió.
 * El TA anterior no se puede recuperar: hay que esperar a que venza (WSAA los
 * emite con vigencia de hasta 12 horas) o usar otro certificado.
 */
export class ArcaTicketVigenteError extends ArcaAuthError {
  static override readonly code: string = 'ARCA_TICKET_VIGENTE';
  public readonly service: string;

  constructor(service: string, options?: { cause?: unknown }) {
    super(
      `WSAA indica que ya existe un Ticket de Acceso vigente para el servicio "${service}", ` +
        'pero no está disponible en memoria ni en el ticketStorage. ' +
        'No se puede recuperar: hay que esperar a que venza (hasta 12 horas desde que se emitió) ' +
        'o usar otro certificado. Para evitarlo, configurá un ticketStorage persistente.',
      options,
    );
    this.name = 'ArcaTicketVigenteError';
    this.service = service;
  }
}

export interface ArcaSoapErrorOptions {
  cause?: unknown;
  /** Código HTTP de la respuesta, si hubo respuesta. */
  statusCode?: number;
  /** `faultcode` del SOAP Fault, si la respuesta fue un Fault. */
  faultCode?: string;
  /** `faultstring` del SOAP Fault, si la respuesta fue un Fault. */
  faultString?: string;
  /** Fecha del header `Date` de la respuesta (reloj del servidor), si hubo respuesta. */
  responseDate?: Date;
  /**
   * `true` si el servidor pudo haber procesado el request (timeout, conexión
   * cortada después de enviar, HTTP 5xx, respuesta ilegible). `false` si hay
   * certeza de que el request no llegó a procesarse (falla de DNS, conexión
   * rechazada, HTTP 4xx, abortado antes de enviar).
   */
  uncertain?: boolean;
  /** `true` si el request se abortó por el `signal` del caller (no por timeout). */
  aborted?: boolean;
  /**
   * Extracto del body de una respuesta HTTP no-2xx sin SOAP Fault (hasta 500
   * caracteres, espacios colapsados), para diagnosticar (ej: página de error de un proxy).
   */
  responseBody?: string;
  /** Contenido del `<detail>` (SOAP 1.1) o `<Detail>` (SOAP 1.2) del Fault, parseado. */
  faultDetail?: unknown;
}

/**
 * Error a nivel SOAP/HTTP.
 * Se lanza cuando el request HTTP falla, hay un timeout, o se recibe un SOAP Fault.
 */
export class ArcaSoapError extends ArcaError {
  static override readonly code: string = 'ARCA_SOAP_ERROR';
  public readonly statusCode?: number;
  public readonly faultCode?: string;
  public readonly faultString?: string;
  public readonly responseDate?: Date;
  public readonly uncertain: boolean;
  public readonly aborted: boolean;
  /** Extracto del body de una respuesta HTTP no-2xx sin SOAP Fault (ver `ArcaSoapErrorOptions.responseBody`). */
  public readonly responseBody?: string;
  /** Contenido del `<detail>`/`<Detail>` del SOAP Fault, si vino. */
  public readonly faultDetail?: unknown;

  constructor(message: string, statusCodeOrOptions?: number | ArcaSoapErrorOptions) {
    const opts: ArcaSoapErrorOptions =
      typeof statusCodeOrOptions === 'number' ? { statusCode: statusCodeOrOptions } : (statusCodeOrOptions ?? {});
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'ArcaSoapError';
    this.statusCode = opts.statusCode;
    this.faultCode = opts.faultCode;
    this.faultString = opts.faultString;
    this.responseDate = opts.responseDate;
    this.uncertain = opts.uncertain ?? false;
    this.aborted = opts.aborted ?? false;
    if (opts.responseBody !== undefined) this.responseBody = opts.responseBody;
    if (opts.faultDetail !== undefined) this.faultDetail = opts.faultDetail;
  }
}

/**
 * Un error de negocio tal cual lo devuelve un web service de ARCA.
 *
 * `code` es el código numérico (0 si el servicio devolvió un código no
 * numérico); en ese caso `rawCode` tiene el código original (ej: `"ERR-01"`).
 */
export interface ServiceErrorDetail {
  code: number;
  msg: string;
  rawCode?: string;
}

/**
 * Error de servicio de ARCA (errores de negocio).
 * Se lanza cuando un web service responde con errores funcionales (ej: CUIT inválido, comprobante rechazado).
 * Contiene el array de errores con código y mensaje tal cual los devuelve ARCA.
 */
export class ArcaServiceError extends ArcaError {
  static override readonly code: string = 'ARCA_SERVICE_ERROR';
  public readonly errors: ServiceErrorDetail[];

  constructor(message: string, errors: ServiceErrorDetail[], options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ArcaServiceError';
    this.errors = errors;
  }
}

/**
 * Error de validación de datos de entrada.
 * Se lanza cuando los datos proporcionados no cumplen con el formato esperado.
 */
export class ArcaValidationError extends ArcaError {
  static override readonly code: string = 'ARCA_VALIDATION_ERROR';
  public readonly field?: string;
  public readonly details: ValidationErrorDetail[];

  constructor(message: string, details: ValidationErrorDetail[], field?: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ArcaValidationError';
    this.details = details;
    this.field = field;
  }
}

export interface ValidationErrorDetail {
  field: string;
  message: string;
  value?: unknown;
}

/**
 * Respuesta de ARCA con una forma inesperada (falta un elemento obligatorio,
 * un valor no es numérico, etc.). En una emisión, `uncertain: true` indica que
 * ARCA respondió pero no se puede confirmar el resultado: consultá el estado
 * antes de reintentar.
 */
export class ArcaResponseError extends ArcaError {
  static override readonly code: string = 'ARCA_RESPONSE_ERROR';
  public readonly uncertain: boolean;

  constructor(message: string, uncertain = false, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ArcaResponseError';
    this.uncertain = uncertain;
  }
}
