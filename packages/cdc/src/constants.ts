import type { ServiceEndpoints } from '@ramiidv/arca-common';

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/**
 * Endpoints de los servicios del SDK, por entorno (las claves coinciden con
 * las de `config.endpoints`).
 *
 * WSCDC (`ENDPOINTS.wscdc`):
 *
 * - Homologación: `soap:address` del WSDL oficial.
 * - Producción: `servicios1.afip.gov.ar` (el manual menciona `servicios1.arca.gob.ar`,
 *   pero ese host presenta un certificado emitido solo para `servicios1.afip.gov.ar`
 *   y la validación TLS falla). El host de producción negocia Diffie-Hellman de
 *   1024 bits: funciona gracias al fallback TLS legacy de `@ramiidv/arca-common`
 *   (opción `legacyTls`, default `auto`).
 */
export const ENDPOINTS = {
  wscdc: {
    testing: 'https://wswhomo.afip.gov.ar/WSCDC/service.asmx',
    production: 'https://servicios1.afip.gov.ar/WSCDC/service.asmx',
  },
} as const satisfies Record<string, ServiceEndpoints>;

// ---------------------------------------------------------------------------
// SOAP Namespace
// ---------------------------------------------------------------------------

/** `targetNamespace` del WSDL del WSCDC (servicio ASMX, `elementFormDefault="qualified"`). */
export const WSCDC_NAMESPACE = 'http://servicios1.afip.gob.ar/wscdc/';

// ---------------------------------------------------------------------------
// WSAA Service ID
// ---------------------------------------------------------------------------

/** Nombre del servicio para autenticación vía WSAA. */
export const WSCDC_SERVICE_ID = 'wscdc';

/** Modalidades de autorización aceptadas en `CbteModo` (ver `ComprobantesModalidadConsultar`). */
export const CBTE_MODOS = ['CAE', 'CAI', 'CAEA'] as const;
