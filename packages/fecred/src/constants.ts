// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/**
 * Endpoints y datos del servicio WSFECRED (FECredService).
 * Fuente: WSDL de homologación (`soap:address`) y namespace `targetNamespace`.
 * Los endpoints de WSAA están en `WSAA_ENDPOINTS` de `@ramiidv/arca-common`.
 */
export const ENDPOINTS = {
  wsfecred: {
    testing: 'https://fwshomo.afip.gob.ar/wsfecred/FECredService',
    production: 'https://serviciosjava.afip.gob.ar/wsfecred/FECredService',
    namespace: 'http://ar.gob.afip.wsfecred/FECredService/',
    serviceId: 'wsfecred',
  },
} as const;

// ---------------------------------------------------------------------------
// Enumeraciones del XSD (xsd:simpleType con xsd:enumeration)
// ---------------------------------------------------------------------------
// Se exportan como objeto + tipo: se puede usar `RolCtaCte.EMISOR` o el literal `'Emisor'`.

/** `RolSimpleType`: rol de la CUIT representada en la operación. */
export const RolCtaCte = {
  EMISOR: 'Emisor',
  RECEPTOR: 'Receptor',
} as const;
export type RolCtaCte = (typeof RolCtaCte)[keyof typeof RolCtaCte];

/** `EstadoCtaCteSimpleType`: estado de la cuenta corriente de una FCE. */
export const EstadoCtaCte = {
  MODIFICABLE: 'Modificable',
  ACEPTADA: 'Aceptada',
  RECHAZADA: 'Rechazada',
  CANCELADA_TOTAL: 'CanceladaTotal',
  INFORMADA_AG_DPTO: 'InformadaAgDpto',
} as const;
export type EstadoCtaCte = (typeof EstadoCtaCte)[keyof typeof EstadoCtaCte];

/** `EstadoCmpSimpleType`: estado de un comprobante (factura o nota). */
export const EstadoComprobante = {
  PENDIENTE_RECEPCION: 'PendienteRecepcion',
  RECEPCIONADO: 'Recepcionado',
  ACEPTADO: 'Aceptado',
  RECHAZADO: 'Rechazado',
  INFORMADA_AG_DPTO: 'InformadaAgDpto',
} as const;
export type EstadoComprobante = (typeof EstadoComprobante)[keyof typeof EstadoComprobante];

/** `TipoFechaSimpleType`: fecha por la que se filtra en `fecha{tipo,desde,hasta}`. */
export const TipoFechaFiltro = {
  EMISION: 'Emision',
  PUESTA_DISPO: 'PuestaDispo',
  VEN_PAGO: 'VenPago',
  VEN_ACEP: 'VenAcep',
  ACEP: 'Acep',
  INFO_AG_DPTO_CLTV: 'InfoAgDptoCltv',
} as const;
export type TipoFechaFiltro = (typeof TipoFechaFiltro)[keyof typeof TipoFechaFiltro];

/**
 * `OpcionTransferenciaSimpleType`: `SCA` (Sistema de Circulación Abierta) o
 * `ADC` (Agente de Depósito Colectivo).
 */
export const OpcionTransferencia = {
  SCA: 'SCA',
  ADC: 'ADC',
} as const;
export type OpcionTransferencia = (typeof OpcionTransferencia)[keyof typeof OpcionTransferencia];

/** `TipoCancelacionSimpleType`: cancelación parcial o total al aceptar. */
export const TipoCancelacion = {
  PARCIAL: 'PAR',
  TOTAL: 'TOT',
} as const;
export type TipoCancelacion = (typeof TipoCancelacion)[keyof typeof TipoCancelacion];

/** `TipoAceptacionSimpleType`. */
export const TipoAceptacion = {
  TACITA: 'Tacita',
  EXPRESA: 'Expresa',
} as const;
export type TipoAceptacion = (typeof TipoAceptacion)[keyof typeof TipoAceptacion];

/**
 * `ResultadoSimpleType`: `A`, `O` o `R`. Por convención de ARCA: aprobado,
 * observado (aprobado con observaciones) y rechazado.
 */
export const Resultado = {
  APROBADO: 'A',
  OBSERVADO: 'O',
  RECHAZADO: 'R',
} as const;
export type Resultado = (typeof Resultado)[keyof typeof Resultado];

/** `TipoCodAutorizacionType` (enumeración del XSD: `A` o `E`). */
export type TipoCodAutorizacion = 'A' | 'E';
