import { CondicionIva } from '@ramiidv/arca-common';

// ============================================================
// Endpoints
// ============================================================

export const ENDPOINTS = {
  wsfe: {
    testing: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
    production: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
  },
  wsfex: {
    testing: 'https://wswhomo.afip.gov.ar/wsfexv1/service.asmx',
    production: 'https://servicios1.afip.gov.ar/wsfexv1/service.asmx',
  },
} as const;

/** Tipos de exportación (WSFEX). */
export enum TipoExpo {
  BIENES = 1,
  SERVICIOS = 2,
  OTROS = 4,
}

/**
 * Códigos de error internos de WSFEv1 (manual, "Errores generales"): 500 error
 * interno de aplicación, 501 de base de datos, 502 transacción activa. No
 * garantizan que el comprobante no se haya procesado.
 */
export const WSFE_ERRORES_INTERNOS: readonly number[] = [500, 501, 502];

/**
 * Unidades de medida de WSFEX que van sin cantidad ni precio unitario, con el
 * total explícito (validaciones 1775 y 1810): 0, 97 (anticipos/señas, total
 * de cualquier signo) y 99 (bonificaciones, total menor a 0).
 */
export function isUmedSinCantidad(unidad: number): boolean {
  return unidad === 0 || unidad === 97 || unidad === 99;
}

/**
 * Código de error interno de infraestructura de WSFEX (manual WSFEX 3.1.1,
 * "Errores de infraestructura"): 500 aplicación, 501 base de datos, 502/505
 * autorizador - transacción activa. No garantizan que el comprobante no se
 * haya procesado.
 */
export const WSFEX_ERRORES_INTERNOS: readonly number[] = [500, 501, 502, 505];

/**
 * Validación 10016 de WSFEv1. El manual la usa para dos rechazos distintos:
 * - `<CbteDesde>` no es el próximo a autorizar (último + 1). Después de un
 *   resultado incierto suele indicar que el intento original sí se autorizó.
 * - `<CbteFch>` fuera de rango (N±5 / N±10 días, anterior al último emitido).
 *   No tiene nada que recuperar: hay que corregir la fecha.
 *
 * `requiereRecuperacion` distingue los dos casos por el mensaje.
 */
export const WSFE_NUMERO_NO_CORRESPONDE = 10016;

/**
 * Validación 703 de FECAEARegInformativo: el número de comprobante debe ser
 * mayor en 1 al último informado. Igual que el 10016 de FECAESolicitar,
 * después de un resultado incierto suele indicar que el intento original sí
 * quedó informado (ver `requiereRecuperacion`).
 */
export const WSFE_CAEA_NUMERO_NO_CORRESPONDE = 703;

/**
 * Errores de autenticación de WSFEv1 (manual, "Errores generales"): 600 token
 * y firma no se corresponden / usuario no autorizado (también "No apareció
 * CUIT en lista de relaciones"), 601 CUIT representada no incluida en el
 * token. Llegan como `ArcaAuthError` (no reintentable). El 602 ("No existen
 * datos en nuestros registros") no es de autenticación: lo devuelven las
 * consultas sin resultado, y sigue siendo `ArcaWSFEError`.
 */
export const WSFE_ERRORES_AUTH: readonly number[] = [600, 601];

/**
 * Errores de autenticación de WSFEX (manual WSFEX, "Errores generales"): 1000
 * usuario no autorizado (token y firma), 1001 CUIT solicitante no está entre
 * las relaciones del token. Llegan como `ArcaAuthError` (no reintentable).
 */
export const WSFEX_ERRORES_AUTH: readonly number[] = [1000, 1001];

/** Servicios WSAA que usa este SDK. */
export const WSAA_SERVICES = {
  wsfe: 'wsfe',
  wsfex: 'wsfex',
} as const;

export const WSFE_NAMESPACE = 'http://ar.gov.afip.dif.FEV1/';
export const WSFEX_NAMESPACE = 'http://ar.gov.afip.dif.fexv1/';

/**
 * URL base del QR de los comprobantes, según la especificación vigente de ARCA
 * ("Especificaciones del QR incluido en las facturas electrónicas"). Definida
 * en @ramiidv/arca-common.
 */
export { QR_URL } from '@ramiidv/arca-common';

// ============================================================
// Tipos de Comprobante
// ============================================================

export enum CbteTipo {
  // Tipo A - Responsable Inscripto a Responsable Inscripto
  FACTURA_A = 1,
  NOTA_DEBITO_A = 2,
  NOTA_CREDITO_A = 3,
  RECIBO_A = 4,
  NOTA_VENTA_CONTADO_A = 5,

  // Tipo B - Responsable Inscripto a Consumidor Final / Monotributista / Exento
  FACTURA_B = 6,
  NOTA_DEBITO_B = 7,
  NOTA_CREDITO_B = 8,
  RECIBO_B = 9,
  NOTA_VENTA_CONTADO_B = 10,

  // Tipo C - Monotributista a cualquier receptor
  FACTURA_C = 11,
  NOTA_DEBITO_C = 12,
  NOTA_CREDITO_C = 13,
  RECIBO_C = 15,

  // Tipo E - Exportación
  FACTURA_E = 19,
  NOTA_DEBITO_E = 20,
  NOTA_CREDITO_E = 21,

  // RG 1415 - Comprobantes especiales
  CBTE_A_ANEXO_I_RG1415 = 34,
  CBTE_B_ANEXO_I_RG1415 = 35,
  OTROS_CBTE_A_RG1415 = 39,
  OTROS_CBTE_B_RG1415 = 40,

  // Bienes usados
  COMPRA_BIENES_USADOS = 49,

  // Tipo M - Operaciones habituales con restricciones fiscales
  FACTURA_M = 51,
  NOTA_DEBITO_M = 52,
  NOTA_CREDITO_M = 53,
  RECIBO_M = 54,

  // Cuenta de Venta y Líquido Producto
  CTA_VTA_LIQ_PROD_A = 60,
  CTA_VTA_LIQ_PROD_B = 61,

  // Liquidaciones
  LIQUIDACION_A = 63,
  LIQUIDACION_B = 64,

  // Factura de Crédito Electrónica MiPyME (FCE) - Tipo A
  FCE_FACTURA_A = 201,
  FCE_NOTA_DEBITO_A = 202,
  FCE_NOTA_CREDITO_A = 203,

  // Factura de Crédito Electrónica MiPyME (FCE) - Tipo B
  FCE_FACTURA_B = 206,
  FCE_NOTA_DEBITO_B = 207,
  FCE_NOTA_CREDITO_B = 208,

  // Factura de Crédito Electrónica MiPyME (FCE) - Tipo C
  FCE_FACTURA_C = 211,
  FCE_NOTA_DEBITO_C = 212,
  FCE_NOTA_CREDITO_C = 213,
}

// ============================================================
// Tipos de Concepto
// ============================================================

export enum Concepto {
  PRODUCTOS = 1,
  SERVICIOS = 2,
  PRODUCTOS_Y_SERVICIOS = 3,
}

// ============================================================
// Tipos de Documento
// ============================================================

// Definido en @ramiidv/arca-common (tabla oficial completa, incluye las cédulas
// provinciales y el código 99 como CONSUMIDOR_FINAL / SIN_IDENTIFICAR).
export { DocTipo } from '@ramiidv/arca-common';

// ============================================================
// Condición de IVA del receptor
// ============================================================

// Definido en @ramiidv/arca-common para compartirlo con arca-padron.
export { CondicionIva };

// ============================================================
// Tipos de IVA (alícuotas)
// ============================================================

export enum IvaTipo {
  IVA_0 = 3,
  IVA_10_5 = 4,
  IVA_21 = 5,
  IVA_27 = 6,
  IVA_5 = 8,
  IVA_2_5 = 9,
}

export const IVA_RATES: Record<IvaTipo, number> = {
  [IvaTipo.IVA_0]: 0,
  [IvaTipo.IVA_2_5]: 2.5,
  [IvaTipo.IVA_5]: 5,
  [IvaTipo.IVA_10_5]: 10.5,
  [IvaTipo.IVA_21]: 21,
  [IvaTipo.IVA_27]: 27,
};

// ============================================================
// Tipos de Moneda
// ============================================================

/**
 * Códigos de moneda más usados (tabla de ARCA, `FEParamGetTiposMonedas`). La
 * lista completa se consulta con `getMonedas()`.
 */
export enum Moneda {
  PESOS = 'PES',
  DOLARES = 'DOL',
  EUROS = '060',
  REALES = '012',
  PESOS_URUGUAYOS = '011',
  PESOS_CHILENOS = '033',
  GUARANIES = '029',
  BOLIVIANOS = '031',
  PESOS_COLOMBIANOS = '032',
  PESOS_MEXICANOS = '010',
  LIBRAS_ESTERLINAS = '021',
  YENES = '019',
  FRANCOS_SUIZOS = '009',
  DOLARES_CANADIENSES = '018',
  YUANES = '064',
}

// ============================================================
// Mapeos de CbteTipo: Factura → Nota Crédito / Nota Débito
// ============================================================

/**
 * Factura → Nota de Crédito del mismo tipo. Incluye la clase E (exportación)
 * como referencia, pero esas notas se emiten por WSFEX (`facturarExpo`), no
 * con `notaCredito`.
 */
export const NOTA_CREDITO_MAP: Record<number, number> = {
  [CbteTipo.FACTURA_A]: CbteTipo.NOTA_CREDITO_A,
  [CbteTipo.FACTURA_B]: CbteTipo.NOTA_CREDITO_B,
  [CbteTipo.FACTURA_C]: CbteTipo.NOTA_CREDITO_C,
  [CbteTipo.FACTURA_E]: CbteTipo.NOTA_CREDITO_E,
  [CbteTipo.FACTURA_M]: CbteTipo.NOTA_CREDITO_M,
  [CbteTipo.FCE_FACTURA_A]: CbteTipo.FCE_NOTA_CREDITO_A,
  [CbteTipo.FCE_FACTURA_B]: CbteTipo.FCE_NOTA_CREDITO_B,
  [CbteTipo.FCE_FACTURA_C]: CbteTipo.FCE_NOTA_CREDITO_C,
};

/** Factura → Nota de Débito del mismo tipo (la clase E se emite por WSFEX, ver `NOTA_CREDITO_MAP`). */
export const NOTA_DEBITO_MAP: Record<number, number> = {
  [CbteTipo.FACTURA_A]: CbteTipo.NOTA_DEBITO_A,
  [CbteTipo.FACTURA_B]: CbteTipo.NOTA_DEBITO_B,
  [CbteTipo.FACTURA_C]: CbteTipo.NOTA_DEBITO_C,
  [CbteTipo.FACTURA_E]: CbteTipo.NOTA_DEBITO_E,
  [CbteTipo.FACTURA_M]: CbteTipo.NOTA_DEBITO_M,
  [CbteTipo.FCE_FACTURA_A]: CbteTipo.FCE_NOTA_DEBITO_A,
  [CbteTipo.FCE_FACTURA_B]: CbteTipo.FCE_NOTA_DEBITO_B,
  [CbteTipo.FCE_FACTURA_C]: CbteTipo.FCE_NOTA_DEBITO_C,
};

/** CbteTipo que NO discriminan IVA (Monotributista - tipo C) */
const TIPOS_C = new Set([
  CbteTipo.FACTURA_C,
  CbteTipo.NOTA_DEBITO_C,
  CbteTipo.NOTA_CREDITO_C,
  CbteTipo.RECIBO_C,
  CbteTipo.FCE_FACTURA_C,
  CbteTipo.FCE_NOTA_DEBITO_C,
  CbteTipo.FCE_NOTA_CREDITO_C,
]);

export function isTipoC(cbteTipo: number): boolean {
  return TIPOS_C.has(cbteTipo);
}

/** Comprobantes de exportación (clase E): se emiten por WSFEX, no por WSFEv1. */
const TIPOS_E = new Set<number>([CbteTipo.FACTURA_E, CbteTipo.NOTA_DEBITO_E, CbteTipo.NOTA_CREDITO_E]);

export function isTipoE(cbteTipo: number): boolean {
  return TIPOS_E.has(cbteTipo);
}

/**
 * Comprobantes clase A y "A con leyenda operación sujeta a retención" (M):
 * receptor identificado con CUIT (validación 10013) y RI o monotributista
 * (tabla "Condición frente al IVA del receptor", columna A/ALEY). Lista de la
 * validación 10007 del manual de WSFEv1 (v4.7): 01-05, 34, 39, 60, 63 y
 * 201-203 (clase A); 51-54 (ALEY).
 */
const TIPOS_A = new Set<number>([
  CbteTipo.FACTURA_A,
  CbteTipo.NOTA_DEBITO_A,
  CbteTipo.NOTA_CREDITO_A,
  CbteTipo.RECIBO_A,
  CbteTipo.NOTA_VENTA_CONTADO_A,
  CbteTipo.CBTE_A_ANEXO_I_RG1415,
  CbteTipo.OTROS_CBTE_A_RG1415,
  CbteTipo.CTA_VTA_LIQ_PROD_A,
  CbteTipo.LIQUIDACION_A,
  CbteTipo.FACTURA_M,
  CbteTipo.NOTA_DEBITO_M,
  CbteTipo.NOTA_CREDITO_M,
  CbteTipo.RECIBO_M,
  CbteTipo.FCE_FACTURA_A,
  CbteTipo.FCE_NOTA_DEBITO_A,
  CbteTipo.FCE_NOTA_CREDITO_A,
]);

export function isTipoA(cbteTipo: number): boolean {
  return TIPOS_A.has(cbteTipo);
}

/** Facturas de Crédito Electrónica MiPyME (FCE), cualquier clase. */
export function isFCE(cbteTipo: number): boolean {
  return cbteTipo >= 201 && cbteTipo <= 213;
}

/** Facturas FCE (201, 206, 211): llevan `FchVtoPago` siempre (validación 10163). */
export function isFacturaFCE(cbteTipo: number): boolean {
  return (
    cbteTipo === CbteTipo.FCE_FACTURA_A || cbteTipo === CbteTipo.FCE_FACTURA_B || cbteTipo === CbteTipo.FCE_FACTURA_C
  );
}

/**
 * Receptores válidos para comprobantes clase A y ALEY (manual WSFEv1, tabla
 * "Condición frente al IVA del receptor"): 1 (RI), 6 (Monotributo), 13
 * (Monotributista Social), 16 (Monotributo Trabajador Independiente Promovido).
 */
export const RECEPTORES_CLASE_A: ReadonlySet<number> = new Set<number>([
  CondicionIva.RESPONSABLE_INSCRIPTO,
  CondicionIva.MONOTRIBUTISTA,
  CondicionIva.MONOTRIBUTO_SOCIAL,
  CondicionIva.MONOTRIBUTO_INDEPENDIENTE_PROMOVIDO,
]);

/** Notas de crédito y débito (WSFEv1, incluidas FCE). */
const NOTAS = new Set<number>(
  [...Object.values(NOTA_CREDITO_MAP), ...Object.values(NOTA_DEBITO_MAP)].filter((t) => !TIPOS_E.has(t)),
);

export function isNotaCreditoODebito(cbteTipo: number): boolean {
  return NOTAS.has(cbteTipo);
}

// ============================================================
// Tipos de Tributo
// ============================================================

export enum TributoTipo {
  IMPUESTOS_NACIONALES = 1,
  IMPUESTOS_PROVINCIALES = 2,
  IMPUESTOS_MUNICIPALES = 3,
  IMPUESTOS_INTERNOS = 4,
  IIBB = 5,
  PERCEP_IVA = 6,
  PERCEP_IIBB = 7,
  PERCEP_MUNICIPALES = 8,
  OTRAS_PERCEPCIONES = 9,
  /**
   * Percepción de IVA a No Categorizado: obligatoria cuando el receptor es
   * 23000000000 (No Categorizado) con neto + IVA > 0 (validaciones 10067 y 10283).
   */
  PERCEP_IVA_NO_CATEGORIZADO = 13,
  OTRO = 99,
}
