import type { ArcaSdkConfig } from '@ramiidv/arca-common';
import type { Condicion, MotivoAnulacion, TipoComprobante } from './constants.js';

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

/** Configuración de `ArcaSire`. `cuit` es el CUIT del agente de retención (`cuitAgente`). */
export interface ArcaSireConfig extends ArcaSdkConfig {
  /** Endpoints propios (ej: proxy). Si se omiten se usan los de `ENDPOINTS` según `production`. */
  endpoints?: {
    /** URL del servicio SIRE C2005. */
    sire?: string;
    /** URL de WSAA. */
    wsaa?: string;
  };
}

/** Credenciales del Ticket de Acceso de WSAA. */
export interface WsAuth {
  token: string;
  sign: string;
}

/**
 * Fecha y hora (`xs:dateTime`). Acepta:
 * - `Date`: se envía en hora de Argentina (`-03:00`).
 * - `"YYYY-MM-DD"` o `"YYYYMMDD"`: se envía como las 00:00 de Argentina.
 * - `"YYYY-MM-DDThh:mm[:ss[.SSS]]"` (hora de Argentina) o con zona (`Z`, `±hh:mm`).
 *
 * Siempre se serializa como `AAAA-MM-DDThh:mm:ss.SSS-03:00` (manual, 5.1).
 */
export type FechaHora = Date | string;

// ---------------------------------------------------------------------------
// emitir
// ---------------------------------------------------------------------------

/**
 * Datos del certificado C2005 a emitir (`certificado` del XSD, manual 3.2.1).
 * `version` (100) e `impuesto` (216) se completan automáticamente.
 * `motivoAnulacion` no se envía en `emitir` (manual 3.2.1).
 */
export interface EmitirCertificadoParams {
  /** Texto libre de hasta 36 caracteres para identificar el certificado en el sistema del agente. */
  codigoTrazabilidad?: string;
  /** Código de régimen (hasta 3 dígitos), existente en la tabla REGIMEN para el impuesto 216. */
  regimen: number;
  /** Fecha de la retención (a partir del 01/12/2019). */
  fechaRetencion: FechaHora;
  /** Condición del sujeto retenido. Obligatoria para los regímenes de `REGIMENES_CON_CONDICION` (831). */
  condicion?: Condicion | number;
  /** `false`: retención efectuada. `true`: retención no efectuada. */
  imposibilidadRetencion: boolean;
  /** Motivo (hasta 30 caracteres). Obligatorio si `imposibilidadRetencion` es `true`. */
  motivoNoRetencion?: string;
  /** Importe de la retención (11 enteros, 2 decimales). */
  importeRetencion: number;
  /** Importe sobre el cual se calcula la retención (11 enteros, 2 decimales). */
  importeBaseCalculo: number;
  /** `true` si el régimen está excluido (certificado de exclusión). */
  regimenExclusion: boolean;
  /** Porcentaje de exclusión: 50 o 100. Obligatorio si `regimenExclusion` es `true`. */
  porcentajeExclusion?: number;
  /** Fecha de publicación del certificado de exclusión. Obligatoria si `regimenExclusion` es `true`. */
  fechaPublicacion?: FechaHora;
  /** Tipo de comprobante (tabla TIPO_COMPROBANTE). */
  tipoComprobante: TipoComprobante | number;
  /** Fecha del comprobante: menor o igual a `fechaRetencion` (igual para tipos 3, 19 y 20). */
  fechaComprobante: FechaHora;
  /**
   * Número del comprobante, con el formato del tipo (ej: `"00003-00008497"`).
   * Obligatorio para todos los tipos de la tabla TIPO_COMPROBANTE.
   */
  numeroComprobante?: string;
  /** COE (hasta 12 caracteres). */
  coe?: string;
  /** COE original (hasta 12 caracteres). */
  coeOriginal?: string;
  /** CAE (hasta 14 caracteres). */
  cae?: string;
  /** Importe del comprobante (11 enteros, 2 decimales). */
  importeComprobante: number;
  /** Motivo de la nota de crédito (hasta 30 caracteres). Obligatorio solo para `tipoComprobante` 3. */
  motivoEmisionNotaCredito?: string;
  /** CUIT/CUIL del sujeto retenido. */
  cuitRetenido: string | number;
  /** Número del certificado que origina la nota de crédito (hasta 25). Obligatorio solo para tipos 3, 19 y 20. */
  numeroCertificadoOriginal?: string;
  /** Fecha de retención del certificado original. Obligatoria solo para tipos 3, 19 y 20. */
  fechaRetencionCertificadoOriginal?: FechaHora;
  /** Importe del certificado original. Obligatorio solo para tipos 3, 19 y 20. */
  importeCertificadoOriginal?: number;
}

/**
 * Hijos de `certificado` tal como se envían (ya validados y serializados),
 * en el orden del XSD. Los opcionales ausentes no se envían.
 */
export interface CertificadoRequest {
  version: number;
  codigoTrazabilidad?: string;
  impuesto: number;
  regimen: number;
  /** `AAAA-MM-DDThh:mm:ss.SSS-03:00` */
  fechaRetencion: string;
  condicion?: number;
  imposibilidadRetencion: boolean;
  motivoNoRetencion?: string;
  /** Importe con 2 decimales (ej: `"2100.00"`). */
  importeRetencion: string;
  importeBaseCalculo: string;
  regimenExclusion: boolean;
  porcentajeExclusion?: string;
  fechaPublicacion?: string;
  tipoComprobante: number;
  fechaComprobante: string;
  numeroComprobante?: string;
  coe?: string;
  coeOriginal?: string;
  cae?: string;
  importeComprobante: string;
  motivoEmisionNotaCredito?: string;
  cuitRetenido: number;
  numeroCertificadoOriginal?: string;
  fechaRetencionCertificadoOriginal?: string;
  importeCertificadoOriginal?: string;
  motivoAnulacion?: number;
}

// ---------------------------------------------------------------------------
// anular
// ---------------------------------------------------------------------------

/** Datos del certificado a anular (`certificadoAnulacion`, manual 3.3.1). */
export interface AnularCertificadoParams {
  /** Número del certificado a anular (hasta 25 caracteres), el `certificadoNro` devuelto por `emitir`. */
  numeroCertificado: string;
  /** Motivo de la anulación (tabla MOTIVO_DE_ANULACION). */
  motivoAnulacion: MotivoAnulacion | number;
  /** Texto libre de hasta 36 caracteres. */
  codigoTrazabilidad?: string;
}

/** Hijos de `certificadoAnulacion` tal como se envían, en el orden del XSD. */
export interface CertificadoAnulacionRequest {
  version: number;
  codigoTrazabilidad?: string;
  impuesto: number;
  numeroCertificado: string;
  motivoAnulacion: number;
}

// ---------------------------------------------------------------------------
// Respuestas
// ---------------------------------------------------------------------------

/**
 * Respuesta de `emitir` y `anular` (`emitirResponse` / `anularResponse`).
 * En `anular` son los datos del certificado que anula al informado.
 */
export interface CertificadoResult {
  /** Número del certificado SIRE. */
  certificadoNro: string;
  /** Código que se pide junto con el número en el micrositio SIRE para imprimir el certificado. */
  codigoSeguridad: string;
}
