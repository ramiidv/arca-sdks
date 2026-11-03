import type { ServiceEndpoints } from '@ramiidv/arca-common';

// ---------------------------------------------------------------------------
// Endpoints (manual WSMTXCA, "Dirección URL")
// ---------------------------------------------------------------------------

/**
 * Endpoints de los servicios del SDK, por entorno (las claves coinciden con
 * las de `config.endpoints`).
 */
export const ENDPOINTS = {
  wsmtxca: {
    testing: 'https://fwshomo.afip.gov.ar/wsmtxca/services/MTXCAService',
    production: 'https://serviciosjava.afip.gob.ar/wsmtxca/services/MTXCAService',
  },
} as const satisfies Record<string, ServiceEndpoints>;

/** targetNamespace del WSDL de WSMTXCA (`elementFormDefault` unqualified). */
export const MTXCA_NAMESPACE = 'http://impl.service.wsmtxca.afip.gov.ar/service/';

/** WSAA service ID for WSMTXCA */
export const MTXCA_SERVICE_ID = 'wsmtxca';

// ---------------------------------------------------------------------------
// Tipos de Comprobante admitidos por WSMTXCA (validación 100 del manual)
// ---------------------------------------------------------------------------

export enum CbteTipo {
  FACTURA_A = 1,
  NOTA_DEBITO_A = 2,
  NOTA_CREDITO_A = 3,
  FACTURA_B = 6,
  NOTA_DEBITO_B = 7,
  NOTA_CREDITO_B = 8,
  /** Factura A con leyenda "OPERACIÓN SUJETA A RETENCIÓN" */
  FACTURA_A_SUJETA_RETENCION = 51,
  /** Nota de Débito A con leyenda "OPERACIÓN SUJETA A RETENCIÓN" */
  NOTA_DEBITO_A_SUJETA_RETENCION = 52,
  /** Nota de Crédito A con leyenda "OPERACIÓN SUJETA A RETENCIÓN" */
  NOTA_CREDITO_A_SUJETA_RETENCION = 53,
  /** Factura de Crédito Electrónica MiPyMEs (FCE) A */
  FCE_FACTURA_A = 201,
  FCE_NOTA_DEBITO_A = 202,
  FCE_NOTA_CREDITO_A = 203,
  /** Factura de Crédito Electrónica MiPyMEs (FCE) B */
  FCE_FACTURA_B = 206,
  FCE_NOTA_DEBITO_B = 207,
  FCE_NOTA_CREDITO_B = 208,
}

// ---------------------------------------------------------------------------
// Concepto
// ---------------------------------------------------------------------------

export enum Concepto {
  PRODUCTOS = 1,
  SERVICIOS = 2,
  PRODUCTOS_Y_SERVICIOS = 3,
}

// ---------------------------------------------------------------------------
// Condición de IVA de un ítem (consultarCondicionesIVA)
// ---------------------------------------------------------------------------

/**
 * Condiciones de IVA de un ítem según `consultarCondicionesIVA` (los códigos
 * 8 y 9, 5% y 2,5%, no figuran en el manual pero ARCA los devuelve y los
 * acepta). Para la lista vigente usá `getCondicionesIVA()`.
 */
export enum CodigoCondicionIVA {
  NO_GRAVADO = 1,
  EXENTO = 2,
  IVA_0 = 3,
  IVA_10_5 = 4,
  IVA_21 = 5,
  IVA_27 = 6,
  IVA_5 = 8,
  IVA_2_5 = 9,
}

/** Alícuota de cada condición de IVA (para validar y calcular importes). */
export const ALICUOTAS_IVA: Readonly<Record<number, number>> = {
  [CodigoCondicionIVA.NO_GRAVADO]: 0,
  [CodigoCondicionIVA.EXENTO]: 0,
  [CodigoCondicionIVA.IVA_0]: 0,
  [CodigoCondicionIVA.IVA_10_5]: 0.105,
  [CodigoCondicionIVA.IVA_21]: 0.21,
  [CodigoCondicionIVA.IVA_27]: 0.27,
  [CodigoCondicionIVA.IVA_5]: 0.05,
  [CodigoCondicionIVA.IVA_2_5]: 0.025,
};

// ---------------------------------------------------------------------------
// Unidades de medida con reglas especiales (validaciones 500-519)
// ---------------------------------------------------------------------------

/**
 * Unidades de medida con reglas propias en el manual. Las descripciones son
 * las de `consultarUnidadesMedida`; confirmalas con `getUnidadesMedida()`.
 */
export enum UnidadMedidaEspecial {
  /** Anulación / devolución: importeItem < 0 (e importeIVA <= 0 en clase A). */
  ANULACION_DEVOLUCION = 95,
  /** Seña / anticipo: sin cantidad ni precio unitario; importe de cualquier signo. */
  SENA = 97,
  /** Bonificación: sin cantidad ni precio unitario; importeItem < 0. */
  BONIFICACION = 99,
}

// ---------------------------------------------------------------------------
// Monedas
// ---------------------------------------------------------------------------

/** Códigos de moneda frecuentes. La lista completa: `getMonedas()`. */
export enum Moneda {
  PESOS = 'PES',
  DOLARES = 'DOL',
  EUROS = '060',
}
