import type { ServiceEndpoints } from '@ramiidv/arca-common';

// ---------------------------------------------------------------------------
// WSAA service identifiers
// ---------------------------------------------------------------------------

export const WSAA_SERVICES = {
  cpe: 'wscpe',
  lpg: 'wslpg',
} as const;

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/**
 * Endpoints oficiales de cada servicio por entorno:
 * - `cpe`: WSCPE (`soap:address` de los WSDL oficiales y manual WSCPE §2.2).
 * - `lpg`: WSLPG (`soap:address` de los WSDL oficiales).
 *
 * Para usar otros (ej: un proxy), pasá `endpoints: { cpe, lpg }` en la config.
 */
export const ENDPOINTS = {
  cpe: {
    testing: 'https://cpea-ws-qaext.afip.gob.ar/wscpe/services/soap',
    production: 'https://cpea-ws.afip.gob.ar/wscpe/services/soap',
  },
  lpg: {
    testing: 'https://fwshomo.afip.gov.ar/wslpg/LpgService',
    production: 'https://serviciosjava.afip.gob.ar/wslpg/LpgService',
  },
} as const satisfies Record<string, ServiceEndpoints>;

// ---------------------------------------------------------------------------
// WSCPE - Carta de Porte Electrónica
// ---------------------------------------------------------------------------

/** Namespace (targetNamespace) de WSCPE. */
export const CPE_NAMESPACE = 'https://serviciosjava.afip.gob.ar/wscpe/';

/**
 * Tipos de carta de porte (`TipoCPE`, manual WSCPE "Tipos de Datos Simples").
 * Los terminados en `_DG` son de derivados granarios.
 */
export const TIPO_CPE = {
  AUTOMOTOR: 74,
  FERROVIARIA: 75,
  AUTOMOTOR_FLETE_CORTO: 274,
  /** CPEDG - Automotor. */
  AUTOMOTOR_DG: 284,
  /** CPEDG - Ferroviaria. */
  FERROVIARIA_DG: 285,
  /** CPEDG - Emisión Destino. */
  EMISION_DESTINO_DG: 286,
  /** CPEDG - Otros Medios Terrestres (ductos). */
  DUCTOS_DG: 287,
} as const;

/** Estados de una carta de porte (manual WSCPE §2.7.1). */
export const ESTADOS_CPE = {
  AC: 'Activa',
  AN: 'Anulada',
  BR: 'Borrador',
  CF: 'Activa con confirmación de arribo',
  CN: 'Confirmada',
  CO: 'Activa con contingencia',
  DE: 'Desactivada',
  RE: 'Rechazada',
  PA: 'Pendiente de aceptación por el productor',
  AP: 'Anulación por el productor',
  DD: 'Descargado en destino',
  PE: 'Pendiente de emisión',
  IN: 'Inactiva',
  PO: 'Pendiente de aceptación por el origen',
} as const;

// ---------------------------------------------------------------------------
// WSLPG - Liquidación Primaria de Granos
// ---------------------------------------------------------------------------

/** Namespace (targetNamespace) de WSLPG. Ojo: es `http`, no `https`. */
export const LPG_NAMESPACE = 'http://serviciosjava.afip.gob.ar/wslpg/';
