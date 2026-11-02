// Shared types from common
export type {
  AccessTicket,
  ArcaEvent,
  CallOptions,
  LegacyTlsMode,
  ServerStatus,
  ServiceErrorDetail,
  TicketStorage,
  ValidationErrorDetail,
} from '@ramiidv/arca-common';
import type { ArcaSdkConfig } from '@ramiidv/arca-common';
import type { CBTE_MODOS } from './constants.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface ArcaCdcConfig extends ArcaSdkConfig {
  /** Endpoints propios (ej: un proxy). Si se indican, tienen prioridad sobre `production`. */
  endpoints?: {
    /** URL del WSCDC (`.../WSCDC/service.asmx`). */
    wscdc?: string;
    /** URL del WSAA (`.../ws/services/LoginCms`). Se ignora si se pasa `wsaa`. */
    wsaa?: string;
  };
}

// ---------------------------------------------------------------------------
// Authentication (bloque Auth del SOAP, tipo CmpAuthRequest)
// ---------------------------------------------------------------------------

export interface CdcAuth {
  token: string;
  sign: string;
  /** CUIT representada (11 dígitos). */
  cuit: number | string;
}

// ---------------------------------------------------------------------------
// ComprobanteConstatar - Input (tipo CmpDatos)
// ---------------------------------------------------------------------------

/** Modalidad de autorización del comprobante. */
export type CbteModo = (typeof CBTE_MODOS)[number];

/** Dato opcional (tipo `Opcional`). Ver `getTiposOpcionales()`. */
export interface Opcional {
  /** Código del opcional (hasta 4 caracteres). */
  id: string;
  /** Valor (hasta 250 caracteres). */
  valor: string;
}

export interface ConstatarInput {
  /** Modalidad por la cual fue autorizado el comprobante: `CAE`, `CAI` o `CAEA`. */
  cbteModo: CbteModo;
  /** CUIT del emisor del comprobante (11 dígitos, con o sin guiones). */
  cuitEmisor: number | string;
  /** Punto de venta (1 a 99998). */
  ptoVta: number;
  /** Tipo de comprobante (ver `getTiposCbte()`). */
  cbteTipo: number;
  /** Número de comprobante (1 a 99999999). */
  cbteNro: number;
  /** Fecha del comprobante: `YYYYMMDD`, `YYYY-MM-DD` o `Date`. Se envía como `YYYYMMDD`. */
  cbteFch: string | Date;
  /** Importe total (>= 0, se redondea a 2 decimales). En comprobantes sin importe total, 0. */
  impTotal: number;
  /** Código de autorización (CAE, CAI o CAEA), 14 dígitos. */
  codAutorizacion: string;
  /**
   * Tipo de documento del receptor (ver `getDocTipos()`). Obligatorio en
   * comprobantes A/M y si el importe supera el tope de identificación; si se
   * informa, también hay que informar `DocNroReceptor`.
   */
  docTipoReceptor?: number | string;
  /** Número de documento del receptor (solo dígitos, hasta 20). */
  docNroReceptor?: number | string;
  /** Datos opcionales (ver `getTiposOpcionales()`). */
  opcionales?: Opcional[];
}

// ---------------------------------------------------------------------------
// ComprobanteConstatar - Result (tipo CmpResponse)
// ---------------------------------------------------------------------------

/** Observación (`Obs`) o evento (`Evt`) de ARCA. */
export interface CdcMensaje {
  code: number;
  msg: string;
}

/** Datos del comprobante tal como los devuelve ARCA en `CmpResp` (tipo CmpDatos). */
export interface ComprobanteConstatado {
  cbteModo: string;
  cuitEmisor: string;
  ptoVta: number;
  cbteTipo: number;
  cbteNro: number;
  cbteFch: string;
  impTotal: number;
  codAutorizacion: string;
  docTipoReceptor?: string;
  docNroReceptor?: string;
  opcionales?: Opcional[];
}

export interface ConstatarResult {
  /**
   * `A` = comprobante constatado (puede traer observaciones no excluyentes, ej: 200
   * para un CAEA aún no rendido). `R` = rechazado por validaciones funcionales: el
   * detalle viene en `Observaciones`.
   */
  resultado: 'A' | 'R';
  /** Fecha/hora de la constatación (`YYYYMMDDHHMMSS`). */
  fchProceso: string;
  /** Datos del comprobante constatado. ARCA los devuelve siempre según el manual (minOccurs=0 en el WSDL). */
  cmpResp?: ComprobanteConstatado;
  /** Observaciones (motivos del rechazo funcional, u observaciones no excluyentes). */
  observaciones: CdcMensaje[];
  /** Eventos informados por ARCA. */
  events: CdcMensaje[];
}

// ---------------------------------------------------------------------------
// Tablas de parámetros
// ---------------------------------------------------------------------------

/** Modalidad de autorización (tipo `FacModTipo`). */
export interface ModalidadItem {
  /** Código de modalidad: `CAE`, `CAI`, `CAEA`. */
  cod: string;
  desc: string;
  fchDesde?: string;
  fchHasta?: string;
}

/** Tipo de comprobante (tipo `CbteTipo`). */
export interface TipoCbteItem {
  id: number;
  desc: string;
}

/** Tipo de documento (tipo `DocTipo`; `Id` es `xs:string` en el WSDL). */
export interface DocTipoItem {
  id: string;
  desc: string;
}

/** Tipo de dato opcional (tipo `OpcionalTipo`). */
export interface OpcionalTipoItem {
  id: string;
  desc: string;
}
