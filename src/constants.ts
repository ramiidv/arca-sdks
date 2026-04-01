// ---------------------------------------------------------------------------
// WSAA service identifiers
// ---------------------------------------------------------------------------

export const WSAA_SERVICES = {
  cpe: 'wscpe',
  ctg: 'wsctg',
  lpg: 'wslpg',
} as const;

// ---------------------------------------------------------------------------
// WSCPE - Carta de Porte Electrónica
// ---------------------------------------------------------------------------

export const CPE_ENDPOINTS = {
  testing: 'https://fwshomo.afip.gov.ar/wscpe/services/soap',
  production: 'https://serviciosjava.afip.gob.ar/wscpe/services/soap',
} as const;

export const CPE_NAMESPACE = 'https://serviciosjava.afip.gob.ar/wscpe/';

// ---------------------------------------------------------------------------
// WSCTG - Código de Trazabilidad de Granos
// ---------------------------------------------------------------------------

export const CTG_ENDPOINTS = {
  testing: 'https://fwshomo.afip.gov.ar/wsctg/services/CTGService_v4.0',
  production: 'https://serviciosjava.afip.gob.ar/wsctg/services/CTGService_v4.0',
} as const;

export const CTG_NAMESPACE = 'https://serviciosjava.afip.gob.ar/wsctg/';

// ---------------------------------------------------------------------------
// WSLPG - Liquidación Primaria de Granos
// ---------------------------------------------------------------------------

export const LPG_ENDPOINTS = {
  testing: 'https://fwshomo.afip.gov.ar/wslpg/LpgService',
  production: 'https://serviciosjava.afip.gob.ar/wslpg/LpgService',
} as const;

export const LPG_NAMESPACE = 'https://serviciosjava.afip.gob.ar/wslpg/';
