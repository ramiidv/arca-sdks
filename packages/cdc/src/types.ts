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
  Token: string;
  Sign: string;
  /** CUIT representada (11 dígitos). */
  Cuit: number | string;
}

// ---------------------------------------------------------------------------
// ComprobanteConstatar - Input (tipo CmpDatos)
// ---------------------------------------------------------------------------

/** Modalidad de autorización del comprobante. */
export type CbteModo = (typeof CBTE_MODOS)[number];

/** Dato opcional (tipo `Opcional`). Ver `getTiposOpcionales()`. */
export interface Opcional {
  /** Código del opcional (hasta 4 caracteres). */
  Id: string;
  /** Valor (hasta 250 caracteres). */
  Valor: string;
}

export interface ConstatarInput {
  /** Modalidad por la cual fue autorizado el comprobante: `CAE`, `CAI` o `CAEA`. */
  CbteModo: CbteModo;
  /** CUIT del emisor del comprobante (11 dígitos, con o sin guiones). */
  CuitEmisor: number | string;
  /** Punto de venta (1 a 99998). */
  PtoVta: number;
  /** Tipo de comprobante (ver `getTiposCbte()`). */
  CbteTipo: number;
  /** Número de comprobante (1 a 99999999). */
  CbteNro: number;
  /** Fecha del comprobante: `YYYYMMDD`, `YYYY-MM-DD` o `Date`. Se envía como `YYYYMMDD`. */
  CbteFch: string | Date;
  /** Importe total (>= 0, se redondea a 2 decimales). En comprobantes sin importe total, 0. */
  ImpTotal: number;
  /** Código de autorización (CAE, CAI o CAEA), 14 dígitos. */
  CodAutorizacion: string;
  /**
   * Tipo de documento del receptor (ver `getDocTipos()`). Obligatorio en
   * comprobantes A/M y si el importe supera el tope de identificación; si se
   * informa, también hay que informar `DocNroReceptor`.
   */
  DocTipoReceptor?: number | string;
  /** Número de documento del receptor (solo dígitos, hasta 20). */
  DocNroReceptor?: number | string;
  /** Datos opcionales (ver `getTiposOpcionales()`). */
  Opcionales?: Opcional[];
}

// ---------------------------------------------------------------------------
// ComprobanteConstatar - Result (tipo CmpResponse)
// ---------------------------------------------------------------------------

/** Observación (`Obs`) o evento (`Evt`) de ARCA. */
export interface CdcMensaje {
  Code: number;
  Msg: string;
}

/** Datos del comprobante tal como los devuelve ARCA en `CmpResp` (tipo CmpDatos). */
export interface ComprobanteConstatado {
  CbteModo: string;
  CuitEmisor: string;
  PtoVta: number;
  CbteTipo: number;
  CbteNro: number;
  CbteFch: string;
  ImpTotal: number;
  CodAutorizacion: string;
  DocTipoReceptor?: string;
  DocNroReceptor?: string;
  Opcionales?: Opcional[];
}

export interface ConstatarResult {
  /**
   * `A` = comprobante constatado (puede traer observaciones no excluyentes, ej: 200
   * para un CAEA aún no rendido). `R` = rechazado por validaciones funcionales: el
   * detalle viene en `Observaciones`.
   */
  Resultado: 'A' | 'R';
  /** Fecha/hora de la constatación (`YYYYMMDDHHMMSS`). */
  FchProceso: string;
  /** Datos del comprobante constatado. ARCA los devuelve siempre según el manual (minOccurs=0 en el WSDL). */
  CmpResp?: ComprobanteConstatado;
  /** Observaciones (motivos del rechazo funcional, u observaciones no excluyentes). */
  Observaciones: CdcMensaje[];
  /** Eventos informados por ARCA. */
  Events: CdcMensaje[];
}

// ---------------------------------------------------------------------------
// Tablas de parámetros
// ---------------------------------------------------------------------------

/** Modalidad de autorización (tipo `FacModTipo`). */
export interface ModalidadItem {
  /** Código de modalidad: `CAE`, `CAI`, `CAEA`. */
  Cod: string;
  Desc: string;
  FchDesde?: string;
  FchHasta?: string;
}

/** Tipo de comprobante (tipo `CbteTipo`). */
export interface TipoCbteItem {
  Id: number;
  Desc: string;
}

/** Tipo de documento (tipo `DocTipo`; `Id` es `xs:string` en el WSDL). */
export interface DocTipoItem {
  Id: string;
  Desc: string;
}

/** Tipo de dato opcional (tipo `OpcionalTipo`). */
export interface OpcionalTipoItem {
  Id: string;
  Desc: string;
}
