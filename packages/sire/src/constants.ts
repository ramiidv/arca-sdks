import type { ServiceEndpoints } from '@ramiidv/arca-common';

// Fuentes:
// - WSDL/XSD oficiales: https://ws-aplicativos-reca.afip.gob.ar/sire/ws/v1/c2005/2005?wsdl
//   y https://ws-aplicativos-reca.afip.gob.ar/sire/ws/v1/c2005/C2005_schema.xsd
// - "Certificado de retención electrónico - Manual para el desarrollador" v1.0.3
//   (19-10-2020): https://www.afip.gob.ar/sire/documentos/SOAP-SIRE-IVA-Manualparaeldesarrollador_V1_0_0.pdf

// ---------------------------------------------------------------------------
// Servicio
// ---------------------------------------------------------------------------

/** ID del servicio para pedir el Ticket de Acceso a WSAA (manual, 1.3 / 2.2). */
export const SIRE_SERVICE_ID = 'sire-ws';

/** Namespace del WSDL (`targetNamespace`, `elementFormDefault="unqualified"`). */
export const SIRE_NAMESPACE = 'http://www.afip.gob.ar/sire/c2005/';

/**
 * URLs del web service SIRE certificado C2005 por entorno (`soap:address` de
 * los WSDL). Las de WSAA están en `WSAA_ENDPOINTS` de `@ramiidv/arca-common`.
 */
export const ENDPOINTS = {
  sire: {
    testing: 'https://ws-aplicativos-reca.homo.afip.gob.ar/sire/ws/v1/c2005/2005',
    production: 'https://ws-aplicativos-reca.afip.gob.ar/sire/ws/v1/c2005/2005',
  },
} as const satisfies Record<string, ServiceEndpoints>;

/** Valor fijo de `version` en `emitir` y `anular` (manual, 3.2.2 y 3.3.2). */
export const SIRE_VERSION = 100;

/** Código de impuesto: valor fijo 216 (IVA) en `emitir` y `anular` (manual, 3.2.2 y 3.3.2). */
export const IMPUESTO_IVA = 216;

// ---------------------------------------------------------------------------
// Tablas del anexo del manual
// ---------------------------------------------------------------------------

/** Tabla TIPO_COMPROBANTE (manual, 5.3). */
export enum TipoComprobante {
  /** Formato `99999-99999999` */
  FACTURA = 1,
  /** Formato `99999-99999999` */
  RECIBO = 2,
  /** Formato `99999-99999999` */
  NOTA_CREDITO = 3,
  /** Formato `99999-99999999` */
  NOTA_DEBITO = 4,
  /** Hasta 16 caracteres alfanuméricos */
  OTRO_COMPROBANTE = 5,
  /** Hasta 12 caracteres alfanuméricos */
  ORDEN_DE_PAGO = 6,
  /** Hasta 16 caracteres alfanuméricos */
  ESCRITURA_PUBLICA = 9,
  /** Factura de 16 dígitos: hasta 16 caracteres alfanuméricos */
  FACTURA_16_DIGITOS = 11,
  /** Liquidación de servicios públicos clase A. Formato `99999-99999999` */
  LIQUIDACION_SERVICIOS_PUBLICOS_A = 17,
  /** Liquidación de servicios públicos clase B. Formato `99999-99999999` */
  LIQUIDACION_SERVICIOS_PUBLICOS_B = 18,
  /** Liquidación de servicios públicos clase A con valor negativo. Formato `99999-99999999` */
  LIQUIDACION_SERVICIOS_PUBLICOS_A_NEGATIVA = 19,
  /** Liquidación de servicios públicos clase B con valor negativo. Formato `99999-99999999` */
  LIQUIDACION_SERVICIOS_PUBLICOS_B_NEGATIVA = 20,
}

/** Tabla CONDICION (manual, 5.4). */
export enum Condicion {
  INSCRIPTO = 1,
  NO_INSCRIPTO = 2,
}

/** Tabla MOTIVO_DE_ANULACION (manual, 5.6). */
export enum MotivoAnulacion {
  CUIT_ERRONEA_SUJETO_RETENIDO = 1,
  FECHA_RETENCION_ERRONEA = 2,
  REGIMEN_INCORRECTO = 3,
  OTROS = 4,
}

/**
 * Tabla REGIMEN_CONDICION (manual, 5.5): regímenes para los que `condicion` es
 * obligatoria. El manual no publica la tabla REGIMEN completa (los regímenes
 * válidos para el impuesto 216 los valida ARCA).
 */
export const REGIMENES_CON_CONDICION: readonly number[] = [831];

/**
 * Tipos de comprobante que exigen los datos del certificado original
 * (`numeroCertificadoOriginal`, `fechaRetencionCertificadoOriginal`,
 * `importeCertificadoOriginal`) (manual, 3.2.1).
 */
export const TIPOS_CON_CERTIFICADO_ORIGINAL: readonly number[] = [3, 19, 20];
