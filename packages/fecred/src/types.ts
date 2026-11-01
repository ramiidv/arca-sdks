import type { ArcaBaseConfig, WsaaClient } from '@ramiidv/arca-common';
import type {
  EstadoComprobante,
  EstadoCtaCte,
  OpcionTransferencia,
  Resultado,
  RolCtaCte,
  TipoAceptacion,
  TipoCancelacion,
  TipoCodAutorizacion,
  TipoFechaFiltro,
} from './constants.js';

// Los nombres de campos siguen el XSD de FECredService (WSDL de homologación).
// Convenciones de las respuestas:
// - CUITs, `codCtaCte` y `codAutorizacion` (xsd:long) se devuelven como string de dígitos.
// - Fechas (`xsd:date`/`xsd:dateTime`) se devuelven como el string que envía ARCA.
// - Importes (`xsd:decimal`) se devuelven como number.
// - `SiNoSimpleType` (`S`/`N`) se convierte a boolean.

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

export interface ArcaFecredConfig extends ArcaBaseConfig {
  /**
   * `WsaaClient` propio (por ejemplo, para compartir tickets con otros SDKs).
   * Si se pasa, se ignoran las opciones de WSAA de esta config.
   */
  wsaa?: WsaaClient;
  /** Sobrescribe los endpoints (por defecto, según `production`). */
  endpoints?: {
    /** URL de FECredService. */
    wsfecred?: string;
    /** URL de WSAA (LoginCms). */
    wsaa?: string;
  };
}

/** `AuthRequestType`. */
export interface WsAuth {
  token: string;
  sign: string;
  /** CUIT representada (11 dígitos). */
  cuitRepresentada: string;
}

// ---------------------------------------------------------------------------
// Tipos comunes
// ---------------------------------------------------------------------------

/** `CodigoDescripcionType`. */
export interface CodigoDescripcion {
  codigo: number;
  descripcion: string;
}

/** `IdComprobanteType` en las respuestas. */
export interface IdComprobante {
  cuitEmisor: string;
  codTipoCmp: number;
  ptoVta: number;
  nroCmp: number;
}

/** `IdComprobanteType` en los requests. */
export interface IdComprobanteInput {
  /** CUIT del emisor del comprobante (con o sin guiones). */
  cuitEmisor: number | string;
  codTipoCmp: number;
  ptoVta: number;
  nroCmp: number;
}

/**
 * `IdCtaCteType` (xsd:choice) en los requests: el código de cuenta corriente
 * o la identificación de la factura.
 */
export type IdCtaCteInput =
  | { codCtaCte: number | string; idFactura?: never }
  | { idFactura: IdComprobanteInput; codCtaCte?: never };

/** `IdCtaCteType` en las respuestas (viene uno de los dos). */
export interface IdCtaCte {
  codCtaCte?: string;
  idFactura?: IdComprobante;
}

/** `FiltroFechaType`. Las fechas se aceptan como `Date`, `YYYY-MM-DD` o `YYYYMMDD`. */
export interface FiltroFecha {
  tipo: TipoFechaFiltro;
  desde: Date | string;
  hasta: Date | string;
}

/** Datos informativos comunes a las respuestas (`evento`, `arrayObservaciones`). */
export interface InfoRespuesta {
  /** `evento`: aviso informativo de ARCA, si lo hay. */
  evento?: CodigoDescripcion;
  /** `arrayObservaciones` / `arrayObservacion`. Vacío si no hay. */
  observaciones: CodigoDescripcion[];
}

/** `EstadoCtaCteType`. */
export interface EstadoCtaCteInfo {
  estado: EstadoCtaCte;
  fechaHoraEstado: string;
}

/** `EstadoCmpType`. */
export interface EstadoComprobanteInfo {
  estado: EstadoComprobante;
  fechaHoraEstado: string;
}

// ---------------------------------------------------------------------------
// Obligación de recepción
// ---------------------------------------------------------------------------

export interface ConsultarMontoObligadoRecepcionParams {
  /** CUIT a consultar (con o sin guiones). */
  cuitConsultada: number | string;
  /** Fecha de emisión del comprobante a emitir. */
  fechaEmision: Date | string;
}

/** `consultarMontoObligadoRecepcionReturn`. */
export interface MontoObligadoRecepcionResult extends InfoRespuesta {
  /** `obligado` (S/N). */
  obligado: boolean;
  /** `montoDesde`: monto a partir del cual es obligatoria la FCE, si ARCA lo informa. */
  montoDesde?: number;
}

/** `consultarObligadoRecepcionReturn`. */
export interface ObligadoRecepcionResult extends InfoRespuesta {
  /** `respuesta` (S/N). */
  obligado: boolean;
  /** `desde`: fecha desde la cual está obligada, si ARCA la informa. */
  desde?: string;
}

// ---------------------------------------------------------------------------
// Cuentas corrientes
// ---------------------------------------------------------------------------

export interface ConsultarCtasCtesParams {
  /** `rolCUITRepresentada`. */
  rol: RolCtaCte;
  /** `CUITContraparte`. */
  cuitContraparte?: number | string;
  fecha?: FiltroFecha;
  estadoCtaCte?: EstadoCtaCte;
  nroPagina?: number;
  opcionTransferencia?: OpcionTransferencia;
}

/** `InfoCtaCteType`. */
export interface InfoCtaCte {
  codCtaCte: string;
  estadoCtaCte: EstadoCtaCteInfo;
  idFacturaCredito: IdComprobante;
  importeTotalFC: number;
  saldo: number;
  saldoAceptado?: number;
  codMoneda: string;
  opcionTransferencia: OpcionTransferencia;
}

/** Resultado paginado de `consultarCtasCtes`. */
export interface ConsultarCtasCtesResult extends InfoRespuesta {
  ctasCtes: InfoCtaCte[];
  nroPagina?: number;
  /** `hayMas` (S/N): hay más páginas. `undefined` si ARCA no lo informa. */
  hayMas?: boolean;
}

/** `RetencionType`. */
export interface Retencion {
  codTipo: number;
  importe: number;
  porcentaje: number;
  descMotivo?: string;
}

/** `AjusteOperacionType`. */
export interface AjusteOperacion {
  codigo: number;
  importe: number;
}

/** `CuentaCorrienteType`. */
export interface CuentaCorriente {
  codCtaCte: string;
  estadoCtaCte: EstadoCtaCteInfo;
  factura: Comprobante;
  notasDCAsociadas: Comprobante[];
  formasCancelacion: CodigoDescripcion[];
  retenciones: Retencion[];
  ajustesOperacion: AjusteOperacion[];
  importeInicial: number;
  importeTotalNotasDC?: number;
  importeCancelado?: number;
  importeTotalRetPesos?: number;
  importeEmbargoPesos?: number;
  saldoAceptado?: number;
  saldo: number;
  codMoneda: string;
  cotizacionMonedaUlt: number;
}

export interface ConsultarCtaCteResult extends InfoRespuesta {
  ctaCte: CuentaCorriente;
}

export interface HistorialEstadosCtaCteResult {
  idCtaCte: IdCtaCte;
  estados: EstadoCtaCteInfo[];
}

// ---------------------------------------------------------------------------
// Comprobantes
// ---------------------------------------------------------------------------

export interface ConsultarComprobantesParams {
  /** `rolCUITRepresentada`. */
  rol: RolCtaCte;
  /** `CUITContraparte`. */
  cuitContraparte?: number | string;
  codTipoCmp?: number;
  estadoCmp?: EstadoComprobante;
  fecha?: FiltroFecha;
  codCtaCte?: number | string;
  estadoCtaCte?: EstadoCtaCte;
  nroPagina?: number;
}

/** `SubtotalIVAType`. */
export interface SubtotalIva {
  codigo: number;
  baseImponible: number;
  importe: number;
}

/** `OtroTributoType`. */
export interface OtroTributo {
  codigo: number;
  detalle?: string;
  baseImponible: number;
  importe: number;
}

/** `ItemType`. */
export interface ItemComprobante {
  orden: number;
  unidadesMtx?: number;
  codigoMtx?: string;
  codigo?: string;
  descripcion: string;
  codNomMercosur?: string;
  cantidad?: number;
  codigoUnidadMedida?: number;
  precioUnitario?: number;
  importeBonificacion?: number;
  codigoCondicionIVA: number;
  importeIVA?: number;
  importeItem: number;
}

/** `MotivoRechazoType`. */
export interface MotivoRechazo {
  /** Código de `consultarTiposMotivosRechazo`. */
  codMotivo: number;
  /** Descripción del motivo (3 a 250 caracteres). */
  descMotivo: string;
  /** Justificación (3 a 250 caracteres). */
  justificacion: string;
}

/** `CuentaEnAgenteType`. */
export interface CuentaEnAgente {
  cuitAgente: string;
  razonSocialAgente?: string;
  idCuenta: string;
  denominacion?: string;
}

/** `CuentaEnAgenteType` en los requests. */
export interface CuentaEnAgenteInput {
  cuitAgente: number | string;
  razonSocialAgente?: string;
  /** 3 a 20 caracteres. */
  idCuenta: string;
  /** 3 a 250 caracteres. */
  denominacion?: string;
}

/** `InfoAgtDptoCltvType`. */
export interface InfoAgtDptoCltv {
  fechaInfo: string;
  ctaAgente: CuentaEnAgente;
  recibida: boolean;
  fechaLectura?: string;
  fechaRecep?: string;
  aceptada?: boolean;
  motivoRechazo?: string;
  idPagoAgtDptoCltv?: string;
  cbuAgtDptoCltv?: string;
}

/** `InfoSCAType`. */
export interface InfoSca {
  fechaAceptacionFactura: string;
  informaCBUReceptor: boolean;
  cbuReceptor?: string;
  cbuValidada?: boolean;
  fechaLecturaSCA?: string;
}

/** `InfoTransferenciaType` (xsd:choice): viene uno de los dos. */
export interface InfoTransferencia {
  infoAgtDptoCltv?: InfoAgtDptoCltv;
  infoSCA?: InfoSca;
}

/** `ComprobanteType`. */
export interface Comprobante {
  cuitEmisor: string;
  razonSocialEmi: string;
  codTipoCmp: number;
  ptoVta: number;
  nroCmp: number;
  cuitReceptor: string;
  razonSocialRecep: string;
  tipoCodAuto: TipoCodAutorizacion;
  /** CAE / CAEA. */
  codAutorizacion: string;
  fechaEmision: string;
  fechaPuestaDispo?: string;
  fechaVenPago?: string;
  fechaVenAcep?: string;
  importeTotal: number;
  codMoneda: string;
  cotizacionMoneda: number;
  cbuEmisor?: string;
  aliasEmisor?: string;
  esAnulacion?: boolean;
  esPostAceptacion?: boolean;
  idComprobanteAsociado?: IdComprobante;
  referenciasComerciales: string[];
  subtotalesIVA: SubtotalIva[];
  otrosTributos: OtroTributo[];
  items: ItemComprobante[];
  datosGenerales?: string;
  datosComerciales?: string;
  leyendaComercial?: string;
  codCtaCte: string;
  estado: EstadoComprobanteInfo;
  tipoAcep?: TipoAceptacion;
  fechaHoraAcep?: string;
  motivosRechazo: MotivoRechazo[];
  opcionTransferencia?: OpcionTransferencia;
  infoTransferencia?: InfoTransferencia;
}

/** Resultado paginado de `consultarComprobantes`. */
export interface ConsultarComprobantesResult extends InfoRespuesta {
  comprobantes: Comprobante[];
  nroPagina?: number;
  hayMas?: boolean;
}

export interface HistorialEstadosComprobanteResult {
  idComprobante: IdComprobante;
  estados: EstadoComprobanteInfo[];
}

// ---------------------------------------------------------------------------
// Operaciones (emisiones)
// ---------------------------------------------------------------------------

/**
 * `OperacionFECredReturnType`. Solo se devuelve con `resultado` `A` u `O`: un
 * resultado `R` o cualquier error de ARCA se lanza como `ArcaServiceError`.
 */
export interface OperacionFecredResult extends InfoRespuesta {
  resultado: Exclude<Resultado, 'R'>;
  idCtaCte: IdCtaCte;
}

/** `rechazarNotaDCReturn` (mismas reglas que `OperacionFecredResult`). */
export interface RechazarNotaDCResult extends InfoRespuesta {
  resultado: Exclude<Resultado, 'R'>;
  idComprobante: IdComprobante;
}

/** Forma de cancelación (`CodigoDescripcionType`) para los requests. */
export interface FormaCancelacionInput {
  /** Código de `consultarTiposFormasCancelacion`. */
  codigo: number;
  descripcion: string;
}

/** `RetencionType` para los requests. */
export interface RetencionInput {
  /** Código de tipo de retención. */
  codTipo: number;
  importe: number;
  /** 0 a 100. */
  porcentaje: number;
  /** 3 a 250 caracteres. */
  descMotivo?: string;
}

/** `ConfirmarNotaDCType`. */
export interface ConfirmarNotaDCInput {
  acepta: boolean;
  idNota: IdComprobanteInput;
}

/** `AceptarFECredRequestType` (sin `authRequest`). */
export interface AceptarFecredParams {
  idCtaCte: IdCtaCteInput;
  /** `arrayConfirmarNotasDC`. */
  confirmarNotasDC?: ConfirmarNotaDCInput[];
  /** `arrayFormasCancelacion`. */
  formasCancelacion?: FormaCancelacionInput[];
  /** `arrayRetenciones`. */
  retenciones?: RetencionInput[];
  /** `arrayAjustesOperacion` (códigos de `consultarTiposAjustesOperacion`). */
  ajustesOperacion?: AjusteOperacion[];
  tipoCancelacion?: TipoCancelacion;
  importeCancelado?: number;
  importeTotalRetPesos?: number;
  importeEmbargoPesos?: number;
  saldoAceptado: number;
  codMoneda: string;
  cotizacionMonedaUlt: number;
  informaCBU?: boolean;
  /** `CBUComprador` (22 dígitos). */
  cbuComprador?: string;
}

/** `RechazarFECredRequestType` (sin `authRequest`). */
export interface RechazarFecredParams {
  idCtaCte: IdCtaCteInput;
  /** `arrayMotivosRechazo` (al menos uno). */
  motivos: MotivoRechazo[];
}

/** `RechazarNotaDCRequestType` (sin `authRequest`). */
export interface RechazarNotaDCParams {
  idComprobante: IdComprobanteInput;
  /** `arrayMotivosRechazo` (al menos uno). */
  motivos: MotivoRechazo[];
}

/** `InformarCancelacionTotalFECredRequestType` (sin `authRequest`). */
export interface InformarCancelacionTotalParams {
  idCtaCte: IdCtaCteInput;
  /** `arrayFormasCancelacion` (al menos una). */
  formasCancelacion: FormaCancelacionInput[];
  importeCancelacion: number;
}

/** `ModificarOpcionTransferenciaRequestType` (sin `authRequest`). */
export interface ModificarOpcionTransferenciaParams {
  idCtaCte: IdCtaCteInput;
  opcionTransferencia: OpcionTransferencia;
}

/** `InformarFacturaAgtDptoCltvRequestType` (sin `authRequest`). */
export interface InformarFacturaAgtDptoCltvParams {
  idCtaCte: IdCtaCteInput;
  ctaAgente: CuentaEnAgenteInput;
}

// ---------------------------------------------------------------------------
// Agente de Depósito Colectivo
// ---------------------------------------------------------------------------

export interface ConsultarFacturasAgtDptoCltvParams {
  idCtaCte?: IdCtaCteInput;
  /** `filtroFecha`. */
  fecha?: FiltroFecha;
}

/** `FacturaInformadaAgtDptoCltvType`. */
export interface FacturaInformadaAgtDptoCltv {
  idFactura: IdComprobante;
  infoAgtDptoCltv: InfoAgtDptoCltv;
}

export interface ConsultarFacturasAgtDptoCltvResult extends InfoRespuesta {
  facturas: FacturaInformadaAgtDptoCltv[];
}

export interface ConsultarCuentasEnAgtDptoCltvResult extends InfoRespuesta {
  cuentas: CuentaEnAgente[];
}

// ---------------------------------------------------------------------------
// Tablas de parámetros
// ---------------------------------------------------------------------------

/** `TipoRetencionType`. */
export interface TipoRetencion {
  codigoJurisdiccion: number;
  descripcionJurisdiccion: string;
  porcentajeRetencion: number;
}
