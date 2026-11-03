// Base errors re-exported from common
export {
  ArcaError,
  ArcaAuthError,
  ArcaSoapError,
  ArcaServiceError,
  ArcaRechazoError,
  ArcaValidationError,
  ArcaTicketVigenteError,
} from '@ramiidv/arca-common';
import { ArcaAuthError, ArcaError, ArcaServiceError, formatServiceErrors } from '@ramiidv/arca-common';
import type { IntentoComprobante, IntentoExpo, WsfexAuthResult, WsfexInvoice } from './types.js';

/**
 * Error de WSFE/WSFEX con códigos de error de ARCA. Extiende `ArcaServiceError`
 * de `@ramiidv/arca-common` (`instanceof ArcaServiceError` también es `true`).
 *
 * En una emisión, este error significa que ARCA **rechazó** el request: no se
 * emitió. Los errores internos de ARCA (WSFEv1: 500, 501, 502; WSFEX: 500,
 * 501, 502, 505) no llegan como este error sino como resultado incierto,
 * porque no garantizan nada; los de autenticación (WSFEv1: 600, 601;
 * WSFEX: 1000, 1001), como `ArcaAuthError`.
 *
 * Los rechazos de un comprobante puntual (`Resultado` "R", como 10016, "el
 * número no se corresponde con el próximo a autorizar") llegan como
 * `ArcaRechazoError` con los motivos en `observaciones`, no como este error:
 * ver `requiereRecuperacion`.
 */
export class ArcaWSFEError extends ArcaServiceError {
  static override readonly code: string = 'ARCA_WSFE_ERROR';
  declare public readonly errors: { code: number; msg: string }[];

  /**
   * @param errors - Errores tal cual los devolvió ARCA.
   * @param servicio - Servicio que respondió (para el mensaje). Default: `WSFE`.
   */
  constructor(errors: { code: number; msg: string }[], servicio: 'WSFE' | 'WSFEX' = 'WSFE') {
    super(`${servicio} Error: ${formatServiceErrors(errors)}`, errors);
    this.name = 'ArcaWSFEError';
  }

  /** `true` si ARCA devolvió el código de error indicado. */
  tieneCodigo(code: number): boolean {
    return this.errors.some((e) => Number(e.code) === code);
  }
}

/**
 * `ArcaAuthError` para un error de autenticación que ARCA devolvió en el
 * bloque de errores (WSFEv1 600/601, WSFEX 1000/1001): el Ticket de
 * Acceso no sirve para esta CUIT o este servicio. No es reintentable
 * (`retryable: false`, `faultCode` = código de ARCA) y el error original
 * queda en `cause`.
 *
 * El SDK no borra el ticket: WSAA no emite otro mientras el actual siga
 * vigente (`coe.alreadyAuthenticated`), y el 600 también se usa cuando la
 * CUIT no está en las relaciones del certificado (el ticket sigue sirviendo
 * para otras CUITs). Si el ticket está dañado, `arca.clearAuthCache()`.
 */
export function authErrorDe(error: ArcaWSFEError): ArcaAuthError {
  const e = error.errors[0];
  return new ArcaAuthError(
    `${error.message}. Revisar el certificado, la relación con el servicio en ARCA y la CUIT representada.`,
    { cause: error, faultCode: String(e?.code ?? ''), retryable: false },
  );
}

/**
 * WSFEX devolvió la respuesta de **otro** comprobante para este `Id`: el `Id`
 * es único por CUIT (manual WSFEX, "Manejo transaccional"), y si ya se usó,
 * WSFEX responde con la solicitud original (`Reproceso = "S"`) en lugar de
 * autorizar la nueva. Pasa cuando dos emisiones usan el mismo `Id` (ej:
 * `facturarExpo` concurrentes sin `id`, o un `Id` reutilizado).
 *
 * El comprobante del request **no** se autorizó con este `Id`. La respuesta
 * está en `respuesta` (es de la solicitud que ya usaba el `Id`). Volver a
 * emitir con otro `Id` (`ultimoIdExpo() + 1`), serializando por CUIT.
 */
export class ArcaConflictoExpo extends ArcaError {
  static override readonly code: string = 'ARCA_CONFLICTO_EXPO';
  /** `Id` repetido. */
  public readonly id: number;
  /** `Cmp` que se envió. */
  public readonly request: WsfexInvoice;
  /** Respuesta de WSFEX (de la solicitud que ya usaba el `Id`). */
  public readonly respuesta: WsfexAuthResult;

  constructor(request: WsfexInvoice, respuesta: WsfexAuthResult, detalle: string) {
    const r = respuesta.fexResultAuth;
    super(
      `FEXAuthorize: el Id ${request.id} ya fue usado (${detalle}). WSFEX devolvió el comprobante ` +
        `${r?.cbteTipo}-${r?.puntoVta}-${r?.cbteNro}; el ${request.cbteTipo}-${request.puntoVta}-${request.cbteNro} ` +
        'no se autorizó. Reintentar con otro Id (ultimoIdExpo() + 1) y serializar las emisiones por CUIT.',
    );
    this.name = 'ArcaConflictoExpo';
    this.id = request.id;
    this.request = request;
    this.respuesta = respuesta;
  }
}

/** Operaciones de emisión de WSFEv1 que pueden terminar con resultado incierto. */
export type OperacionEmision = 'FECAESolicitar' | 'FECAEARegInformativo';

/**
 * No se sabe si ARCA emitió el comprobante: hubo un timeout, un error de red,
 * un HTTP 5xx, la llamada se abortó después de enviarse, o la respuesta no se
 * pudo leer. El SDK **no reintenta** emisiones.
 *
 * Para resolverlo, llamar a `arca.recuperarComprobante(error.intento)`:
 * devuelve si quedó autorizado, si no se emitió (y se puede reintentar con el
 * mismo número) o si hay un conflicto.
 *
 * Si ARCA respondió con errores de negocio, el error es `ArcaWSFEError` (no se
 * emitió); si rechazó el comprobante (`Resultado` "R"), `ArcaRechazoError`.
 * Para exportación (WSFEX) el error es `ArcaResultadoInciertoExpo`.
 */
export class ArcaResultadoIncierto extends ArcaError {
  static override readonly code: string = 'ARCA_RESULTADO_INCIERTO';
  /** Operación SOAP que quedó incierta */
  public readonly operacion: OperacionEmision;
  /** Datos del (primer) comprobante enviado, para `recuperarComprobante`. */
  public readonly intento: IntentoComprobante;
  /** Todos los comprobantes del request (más de uno solo en llamadas raw por lote). */
  public readonly intentos: IntentoComprobante[];

  constructor(operacion: OperacionEmision, intentos: IntentoComprobante[], options?: { cause?: unknown }) {
    if (intentos.length === 0) {
      throw new TypeError('ArcaResultadoIncierto requiere al menos un intento');
    }
    const i = intentos[0];
    const causa = options?.cause instanceof Error ? `: ${options.cause.message}` : '';
    super(
      `Resultado incierto de ${operacion} para el comprobante ${i.cbteTipo}-${i.ptoVta}-${i.cbteNro}${causa}. ` +
        'No se reintentó. Usar recuperarComprobante(error.intento) para saber si quedó autorizado.',
      options,
    );
    this.name = 'ArcaResultadoIncierto';
    this.operacion = operacion;
    this.intento = i;
    this.intentos = intentos;
  }
}

/**
 * No se sabe si WSFEX autorizó el comprobante de exportación (`FEXAuthorize`):
 * timeout, error de red, HTTP 5xx, error interno de ARCA o respuesta sin
 * `FEXResultAuth`. El SDK no reintenta.
 *
 * WSFEX está diseñado para este caso (manual WSFEX, "Manejo transaccional"):
 * se reenvía **la misma solicitud con el mismo `Id`**. Si ya estaba aprobada,
 * WSFEX devuelve el CAE original con `Reproceso = "S"` sin duplicar nada.
 *
 * - API simplificada: `arca.facturarExpo({ ...mismasOpts, ...error.intento })`
 *   (fija `id`, `cbteNro` y `fecha`).
 * - API raw: `arca.crearFacturaExportacion(error.request)`.
 *
 * No reenvíes con otro `Id` ni otro número: eso sí podría autorizar otro comprobante.
 */
export class ArcaResultadoInciertoExpo extends ArcaError {
  static override readonly code: string = 'ARCA_RESULTADO_INCIERTO_EXPO';
  /** Siempre `FEXAuthorize`. */
  public readonly operacion = 'FEXAuthorize' as const;
  /** `Id` del request enviado: reenviar con el mismo `Id`. */
  public readonly id: number;
  public readonly cbteTipo: number;
  public readonly ptoVta: number;
  public readonly cbteNro: number;
  /** Datos para reenviar con `facturarExpo({ ...opts, ...error.intento })`. */
  public readonly intento: IntentoExpo;
  /** `Cmp` exacto que se envió, para reenviarlo con `crearFacturaExportacion`. */
  public readonly request: WsfexInvoice;

  constructor(request: WsfexInvoice, options?: { cause?: unknown }) {
    const causa = options?.cause instanceof Error ? `: ${options.cause.message}` : '';
    super(
      `Resultado incierto de FEXAuthorize (Id ${request.id}) para el comprobante ` +
        `${request.cbteTipo}-${request.puntoVta}-${request.cbteNro}${causa}. No se reintentó. ` +
        'Reenviar la misma solicitud con el mismo Id (WSFEX responde Reproceso="S" si ya estaba autorizada).',
      options,
    );
    this.name = 'ArcaResultadoInciertoExpo';
    this.id = request.id;
    this.cbteTipo = request.cbteTipo;
    this.ptoVta = request.puntoVta;
    this.cbteNro = request.cbteNro;
    this.intento = { id: request.id, cbteNro: request.cbteNro, fecha: request.fechaCbte };
    this.request = request;
  }
}
