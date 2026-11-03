/**
 * Tipos de WSCPE (Carta de Porte Electrónica), fieles al XSD del WSDL oficial.
 * Los nombres de los campos son los del XSD.
 */
import type { CodigoDescripcion, ConAdvertencias, CuitInput, FechaHoraInput, FechaInput } from './types.js';

// ============================================================
// Tipos comunes de requests
// ============================================================

/** Identificación de una carta de porte (`CartaPorte`). */
export interface CartaPorteId {
  /** Tipo de carta de porte: 74 automotor, 75 ferroviaria, 274 automotor flete corto (ver `TIPO_CPE`). */
  tipoCPE: number;
  /** Sucursal (0-99999). */
  sucursal: number;
  /** Número de orden (1-99999999). */
  nroOrden: number;
}

/** `DestinoSolicitud` */
export interface DestinoCPE {
  cuit: CuitInput;
  esDestinoCampo: boolean;
  codProvincia: number;
  codLocalidad: number;
  /** Número de planta (1-999999). */
  planta?: number;
}

/** `DestinatarioSolicitud` */
export interface DestinatarioCPE {
  cuit: CuitInput;
}

/** `RetiroProductorSolicitud` */
export interface RetiroProductorCPE {
  cuitRemitenteComercialProductor: CuitInput;
}

/** `IntervinientesSolicitud` */
export interface IntervinientesCPE {
  cuitRemitenteComercialVentaPrimaria?: CuitInput;
  cuitRemitenteComercialVentaSecundaria?: CuitInput;
  cuitRemitenteComercialVentaSecundaria2?: CuitInput;
  cuitMercadoATermino?: CuitInput;
  cuitCorredorVentaPrimaria?: CuitInput;
  cuitCorredorVentaSecundaria?: CuitInput;
  cuitRepresentanteEntregador?: CuitInput;
  cuitRepresentanteRecibidor?: CuitInput;
}

/** `GMS` (grados, minutos, segundos) */
export interface CoordenadaGMS {
  grados: string;
  minutos: string;
  segundos: string;
}

/** `CoordenadasGPSSolicitud` */
export interface CoordenadasGPSCPE {
  latitud: CoordenadaGMS;
  longitud: CoordenadaGMS;
  ubicacionGeoreferencial?: string;
}

/** `OrigenAutomotorSolicitud`: se informa `operador` (planta) o `productor` (campo). */
export interface OrigenCPEAutomotor {
  operador?: { codProvincia: number; codLocalidad: number; planta: number };
  productor?: {
    codProvincia: number;
    codLocalidad: number;
    nroRenspa?: string;
    coordenadasGPS?: CoordenadasGPSCPE;
  };
}

/** `Semilla` */
export interface SemillaCPE {
  /** Presentación INASE (200000-999999). */
  presentacionInase: number;
  categoriaSemilla: number;
  variedadSemilla?: number;
}

/** `TransporteAutomotorModificaSolicitud` */
export interface TransporteAutomotorModificaCPE {
  fechaHoraPartida: FechaHoraInput;
  /** Kilómetros a recorrer (1-99999). */
  kmRecorrer: number;
  codigoTurno?: string;
}

/** `Ramal`. Códigos: 1 Roca, 2 Sarmiento, 3 Mitre, 4 Urquiza, 5 Belgrano, 6 San Martín, 99 Otro. */
export interface RamalCPE {
  codigo: number;
  descripcion?: string;
}

/** `TransporteFerroviariaModificaSolicitud` */
export interface TransporteFerroviariaModificaCPE {
  ramal: RamalCPE;
  fechaHoraPartidaTren: FechaHoraInput;
  kmRecorrer: number;
}

// ============================================================
// Requests por operación
// ============================================================

/** `AutorizarAutomotorSolicitud` (autorizarCPEAutomotor). */
export interface AutorizarCPEAutomotorParams {
  cabecera: {
    /** 74 (automotor) o 274 (automotor flete corto). */
    tipoCP: number;
    cuitSolicitante: CuitInput;
    sucursal: number;
    nroOrden: number;
  };
  origen: OrigenCPEAutomotor;
  correspondeRetiroProductor: boolean;
  esSolicitanteCampo: boolean;
  retiroProductor?: RetiroProductorCPE;
  intervinientes?: IntervinientesCPE;
  datosCarga: {
    codGrano: number;
    /** Cosecha (ej: 2526 para 2025/2026). */
    cosecha: number;
    semilla?: SemillaCPE;
    /** Kilogramos (1-88000). */
    pesoBruto: number;
    /** Kilogramos (1-88000). */
    pesoTara: number;
  };
  destino: DestinoCPE;
  destinatario: DestinatarioCPE;
  transporte: {
    cuitTransportista: CuitInput;
    /** Dominios (patentes, 6-7 caracteres). Al menos uno. */
    dominio: string[];
    fechaHoraPartida: FechaHoraInput;
    kmRecorrer: number;
    codigoTurno?: string;
    cuitChofer: CuitInput;
    /** Tarifa (hasta 99999.99, se redondea a 2 decimales). */
    tarifa?: number;
    cuitPagadorFlete: CuitInput;
    cuitIntermediarioFlete?: CuitInput;
    mercaderiaFumigada: boolean;
  };
  observaciones?: string;
}

/** `AutorizarFerroviariaSolicitud` (autorizarCPEFerroviaria). */
export interface AutorizarCPEFerroviariaParams {
  cabecera: { sucursal: number; nroOrden: number; planta: number };
  correspondeRetiroProductor: boolean;
  retiroProductor?: RetiroProductorCPE;
  intervinientes?: IntervinientesCPE;
  datosCarga: { codGrano: number; cosecha: number; pesoBruto: number; pesoTara: number };
  destino: DestinoCPE;
  destinatario: DestinatarioCPE;
  transporte: {
    cuitTransportista: CuitInput;
    cuitTransportistaTramo2?: CuitInput;
    nroVagon: number;
    /** Números de precinto. Al menos uno. */
    nroPrecinto: string[];
    nroOperativo: number;
    ramal: RamalCPE;
    fechaHoraPartidaTren: FechaHoraInput;
    kmRecorrer: number;
    cuitPagadorFlete?: CuitInput;
    mercaderiaFumigada: boolean;
  };
  observaciones?: string;
}

/** `ConsultarAutomotorSolicitud` / `ConsultarFerroviariaSolicitud`: `cartaPorte` o `nroCTG`. */
export interface ConsultarCPEParams {
  cuitSolicitante?: CuitInput;
  cartaPorte?: CartaPorteId;
  nroCTG?: string | number;
}

/** `EditarActivaAutomotorSolicitud` (editarCPEAutomotor). */
export interface EditarCPEAutomotorParams {
  nroCTG: string | number;
  cuitRemitenteComercialVentaPrimaria?: CuitInput;
  cuitRemitenteComercialVentaSecundaria?: CuitInput;
  cuitRemitenteComercialVentaSecundaria2?: CuitInput;
  cuitCorredorVentaPrimaria?: CuitInput;
  cuitCorredorVentaSecundaria?: CuitInput;
  cuitDestinatario: CuitInput;
  cuitChofer: CuitInput;
  cuitTransportista: CuitInput;
  destino: DestinoCPE;
  cosecha?: number;
  pesoBruto: number;
  codGrano: number;
  dominio?: string[];
  kmRecorrer?: number;
  tarifa?: number;
  /** Hasta 140 caracteres. */
  observaciones?: string;
}

/** `EditarActivaFerroviariaSolicitud` (editarCPEFerroviaria). */
export interface EditarCPEFerroviariaParams {
  nroCTG: string | number;
  cuitDestinatario?: CuitInput;
  cuitRemitenteComercialVentaPrimaria?: CuitInput;
  cuitRemitenteComercialVentaSecundaria?: CuitInput;
  cuitRemitenteComercialVentaSecundaria2?: CuitInput;
  cuitCorredorVentaPrimaria?: CuitInput;
  cuitCorredorVentaSecundaria?: CuitInput;
  cuitTransportista?: CuitInput;
  destino?: DestinoCPE;
  nroVagon?: number;
  pesoBruto: number;
  codGrano: number;
}

/** `EditarCPEConfirmadaAutomotorSolicitud` / `EditarCPEConfirmadaFerroviariaSolicitud`. */
export interface EditarCPEConfirmadaParams {
  nroCTG: string | number;
  intervinientes: {
    cuitCorredorVentaPrimaria?: CuitInput;
    cuitCorredorVentaSecundaria?: CuitInput;
    cuitRemitenteComercialVentaPrimaria?: CuitInput;
    cuitRemitenteComercialVentaSecundaria?: CuitInput;
    cuitRemitenteComercialProductor?: CuitInput;
  };
}

/** `AnularCPESolicitud`. Motivos: 1 Siniestro, 2 Pérdida de la carga, 3 Otro. */
export interface AnularCPEParams {
  cartaPorte: CartaPorteId;
  anulacionMotivo?: number;
  /** Hasta 100 caracteres. */
  anulacionObservaciones?: string;
}

/** `RechazoCPESolicitud`. Motivos: 1 No es el producto solicitado, 2 Problema de calidad, 3 Otro. */
export interface RechazoCPEParams {
  cuitSolicitante: CuitInput;
  cartaPorte: CartaPorteId;
  rechazoMotivo?: number;
  rechazoObservaciones?: string;
}

/** `ConfirmarArriboSolicitud` / `DescargadoDestinoCPESolicitud`. */
export interface SolicitanteCartaPorteParams {
  cuitSolicitante: CuitInput;
  cartaPorte: CartaPorteId;
}

/** `ConfirmacionAutomotorSolicitud` (confirmacionDefinitivaCPEAutomotor). */
export interface ConfirmacionDefinitivaCPEAutomotorParams {
  cuitSolicitante: CuitInput;
  cartaPorte: CartaPorteId;
  intervinientes?: { cuitRepresentanteRecibidor?: CuitInput };
  pesoBrutoDescarga: number;
  pesoTaraDescarga: number;
}

/** `ConfirmacionFerroviariaSolicitud` (confirmacionDefinitivaCPEFerroviaria). */
export interface ConfirmacionDefinitivaCPEFerroviariaParams {
  cuitSolicitante: CuitInput;
  cartaPorte: CartaPorteId;
  intervinientes?: {
    cuitRemitenteComercialVentaPrimaria?: CuitInput;
    cuitRemitenteComercialVentaSecundaria?: CuitInput;
    cuitRemitenteComercialVentaSecundaria2?: CuitInput;
    cuitCorredorVentaPrimaria?: CuitInput;
    cuitCorredorVentaSecundaria?: CuitInput;
    cuitRepresentanteRecibidor?: CuitInput;
  };
  destinatario?: DestinatarioCPE;
  pesoBrutoDescarga: number;
  pesoTaraDescarga: number;
  ramalDescarga: RamalCPE;
}

/** `NuevoDestinoDestinatarioAutomotorSolicitud`. */
export interface NuevoDestinoDestinatarioCPEAutomotorParams {
  cartaPorte: CartaPorteId;
  destino: DestinoCPE;
  destinatario?: DestinatarioCPE;
  transporte: TransporteAutomotorModificaCPE;
}

/** `NuevoDestinoDestinatarioFerroviariaSolicitud`. */
export interface NuevoDestinoDestinatarioCPEFerroviariaParams {
  cartaPorte: CartaPorteId;
  destino: DestinoCPE;
  destinatario?: DestinatarioCPE;
  transporte: TransporteFerroviariaModificaCPE;
}

/** `RegresoOrigenAutomotorSolicitud`. */
export interface RegresoOrigenCPEAutomotorParams {
  cartaPorte: CartaPorteId;
  transporte: TransporteAutomotorModificaCPE;
}

/** `RegresoOrigenFerroviariaSolicitud`. */
export interface RegresoOrigenCPEFerroviariaParams {
  cartaPorte: CartaPorteId;
  transporte: TransporteFerroviariaModificaCPE;
}

/** `DesvioAutomotorSolicitud`. */
export interface DesvioCPEAutomotorParams {
  cuitSolicitante: CuitInput;
  cartaPorte: CartaPorteId;
  destino: { cuit: CuitInput; codProvincia: number; codLocalidad: number; planta: number; esDestinoCampo: boolean };
  transporte: TransporteAutomotorModificaCPE;
}

/** `DesvioFerroviariaSolicitud`. */
export interface DesvioCPEFerroviariaParams {
  cuitSolicitante?: CuitInput;
  cartaPorte: CartaPorteId;
  destino: { cuit: CuitInput; codProvincia: number; codLocalidad: number; planta: number };
  transporte: TransporteFerroviariaModificaCPE;
}

/**
 * `InformarContingenciaSolicitud`.
 * Conceptos automotor: A Siniestro, B Imposibilidad de tránsito por zona desfavorable,
 * C Desperfecto mecánico, D Accidente, E Demora descarga, F Otro.
 * Ferroviaria: A Siniestro vagón, B Descarrilamiento, C Imposibilidad de tránsito,
 * D Desperfecto mecánico, E Accidente ferroviario, F Demora de descarga, G Otro.
 */
export interface InformarContingenciaParams {
  cartaPorte: CartaPorteId;
  contingencia: { concepto: string; descripcion?: string };
}

/**
 * `CerrarContingenciaFerroviariaSolicitud` (cerrarContingenciaCPE). Pese al nombre del
 * tipo en el XSD, el método es común a automotor y ferroviaria (manual WSCPE §2.8).
 * Conceptos: A Reactivación para descarga en destino, B Extensión cierre contingencia,
 * C Desactivar definitivamente la CP. Motivos de desactivación: A Destrucción
 * vagón/vehículo, B Destrucción carga, C Otro.
 */
export interface CerrarContingenciaCPEParams {
  cartaPorte: CartaPorteId;
  concepto: string;
  reactivacionDestino?: { cuitTransportista?: CuitInput; nroOperativo?: number };
  motivoDesactivacionCP?: { concepto: string; descripcion?: string };
}

/** `ConsultarCPEPorDestinoSolicitud`. */
export interface ConsultarCPEPorDestinoParams {
  planta: number;
  fechaPartidaDesde: FechaInput;
  fechaPartidaHasta: FechaInput;
  tipoCartaPorte?: number;
}

/** `ConsultarCPEPPendientesDeResolucionSolicitud`. */
export interface ConsultarCPEPendientesParams {
  /** `S` solicitante, `D` destino. */
  perfil: 'S' | 'D';
  planta?: number;
}

// ============================================================
// Respuestas
// ============================================================

/** `CabeceraRespuesta`. */
export interface CabeceraCPE {
  tipoCartaPorte?: number;
  sucursal?: number;
  nroOrden?: number;
  /** Número de CTG (12 dígitos, como string). */
  nroCTG?: string;
  fechaEmision?: string;
  /** Estado (ver `ESTADOS_CPE`): AC, AN, CF, CN, CO, DE, RE, DD, ... */
  estado?: string;
  fechaInicioEstado?: string;
  fechaVencimiento?: string;
  observaciones?: string;
  anulacionMotivo?: number;
  anulacionObservaciones?: string;
}

/** `Metadata`. */
export interface MetadataCPE {
  servidor?: string;
  fechaHora?: string;
}

/**
 * `CartaPorteRespuesta`: respuesta de las operaciones que modifican una CPE.
 * Sin `pdf` y con `advertencias` si ARCA no pudo generar la constancia (550).
 */
export interface CPEResultado extends ConAdvertencias {
  cabecera?: CabeceraCPE;
  /** Constancia PDF en base64. */
  pdf?: string;
  metadata?: MetadataCPE;
}

/** `DestinoRespuesta`. */
export interface DestinoCPERespuesta {
  cuit?: number;
  codProvincia?: number;
  codLocalidad?: number;
  planta?: number;
  plantaObservaciones?: string;
  domicilioDestino?: string;
}

/** `DetalleAutomotorRespuesta`. `cabecera.nroCTG` siempre está presente. */
export interface CPEAutomotorDetalle extends ConAdvertencias {
  cabecera: CabeceraCPE & { nroCTG: string };
  origen?: {
    cuit?: number;
    codProvincia?: number;
    codLocalidad?: number;
    nroRenspa?: string;
    domicilio?: string;
    planta?: number;
    plantaAFIP?: string;
    coordenadasGPS?: { latitud?: string; longitud?: string; ubicacionGeoreferencial?: string };
  };
  correspondeRetiroProductor?: boolean;
  retiroProductor?: { cuitRemitenteComercialProductor?: number };
  intervinientes?: {
    cuitRemitenteComercialVentaPrimaria?: number;
    cuitRemitenteComercialVentaSecundaria?: number;
    cuitRemitenteComercialVentaSecundaria2?: number;
    cuitMercadoATermino?: number;
    cuitCorredorVentaPrimaria?: number;
    cuitCorredorVentaSecundaria?: number;
    cuitRepresentanteEntregador?: number;
    cuitRepresentanteRecibidor?: number;
  };
  datosCarga?: {
    codGrano?: number;
    semilla?: { presentacionInase?: number; categoriaSemilla?: number; variedadSemilla?: number };
    pesoBruto?: number;
    pesoTara?: number;
    cosecha?: number;
    pesoBrutoDescarga?: number;
    pesoTaraDescarga?: number;
    tipoEmbalaje?: number;
    otroEmbalaje?: string;
    unidadMedida?: number;
    cantidadUnidades?: number;
    kgLitroM3?: number;
    lote?: string;
  };
  destino?: DestinoCPERespuesta;
  destinatario?: { cuit?: number };
  transporte?: {
    cuitTransportista?: number;
    dominio: string[];
    fechaHoraPartida?: string;
    kmRecorrer?: number;
    codigoTurno?: string;
    cuitChofer?: number;
    tarifaReferencia?: number;
    tarifa?: number;
    cuitPagadorFlete?: number;
    cuitIntermediarioFlete?: number;
    mercaderiaFumigada?: boolean;
  };
  pdf?: string;
  metadata?: MetadataCPE;
}

/** `DetalleFerroviariaRespuesta`. `cabecera.nroCTG` siempre está presente. */
export interface CPEFerroviariaDetalle extends ConAdvertencias {
  cabecera: CabeceraCPE & { nroCTG: string };
  origen?: {
    cuit?: number;
    esUsuarioIndustria?: boolean;
    codProvincia?: number;
    codLocalidad?: number;
    domicilio?: string;
    planta?: number;
    cuitTitularPlanta?: number;
  };
  correspondeRetiroProductor?: boolean;
  retiroProductor?: { cuitRemitenteComercialProductor?: number };
  intervinientes?: {
    cuitRemitenteComercial?: number;
    cuitRemitenteComercialVentaPrimaria?: number;
    cuitRemitenteComercialVentaSecundaria?: number;
    cuitRemitenteComercialVentaSecundaria2?: number;
    cuitMercadoATermino?: number;
    cuitCorredorVentaPrimaria?: number;
    cuitCorredorVentaSecundaria?: number;
    cuitRepresentanteEntregador?: number;
    cuitRepresentanteRecibidor?: number;
    cuitComisionista?: number;
    cuitCorredor?: number;
  };
  datosCarga?: {
    codGrano?: number;
    codDerivadoGranario?: number;
    cosecha?: number;
    pesoBruto?: number;
    pesoTara?: number;
    pesoBrutoDescarga?: number;
    pesoTaraDescarga?: number;
    tipoEmbalaje?: number;
    otroEmbalaje?: string;
    unidadMedida?: number;
    cantidadUnidades?: number;
    kgLitroM3?: number;
    lote?: string;
    fechaLote?: string;
  };
  destino?: DestinoCPERespuesta;
  destinatario?: { cuit?: number };
  transporte?: {
    cuitTransportista?: number;
    cuitTransportistaTramo2?: number;
    nroVagon?: number;
    nroPrecinto: string[];
    nroOperativo?: number;
    ramal?: { codigo?: number; descripcion?: string };
    fechaHoraPartidaTren?: string;
    kmRecorrer?: number;
    cuitPagadorFlete?: number;
    cuitConductor?: number;
    cuitConductorTramo2?: number;
    tarifa?: number;
    cuitIntermediarioFlete?: number;
    mercaderiaFumigada?: boolean;
  };
  pdf?: string;
  metadata?: MetadataCPE;
}

/** `CPEResumenRespuesta` (consultarCPEPorDestino, consultarCPEPPendientesDeResolucion). */
export interface CPEResumen {
  tipoCartaPorte?: number;
  nroCTG?: string;
  fechaPartida?: string;
  estado?: string;
  fechaUltimaModificacion?: string;
}

/** `CartaPorteFerroviariaResumenRespuesta` (consultaCPEFerroviariaPorNroOperativo). */
export interface OperativoFerroviarioCPE extends ConAdvertencias {
  fecha?: string;
  cuitTransportista?: number;
  cuitTransportistaTramo2?: number;
  nroOperativo?: number;
  cartaPorte: Array<{
    nroCTG?: string;
    nroVagon?: string;
    grano?: number;
    nroPrecinto: string[];
    pesoBruto?: number;
    pesoTara?: number;
  }>;
  pdf?: string;
  metadata?: MetadataCPE;
}

/** `PlantaResponse` (consultarPlantas). */
export interface PlantaCPE {
  nroPlanta?: number;
  codProvincia?: number;
  codLocalidad?: number;
  latitud?: string;
  longitud?: string;
  ubicacionGeoreferencial?: string;
}

/** `Coordenada`. */
export interface CoordenadaCPE {
  grados?: string;
  minutos?: string;
  segundos?: string;
  coordenada?: string;
}

/** `LocalidadProductor` (consultarLocalidadesProductor). */
export interface LocalidadProductorCPE {
  codigo?: string;
  descripcion?: string;
  coordenadas: Array<{ latitud?: CoordenadaCPE; longitud?: CoordenadaCPE; ubicacionGeoreferencial?: string }>;
}

/** `CodigoDescripcionGrano` (consultarVariedadesSemillas). */
export interface VariedadSemillaCPE extends CodigoDescripcion {
  grano: number;
}

/** `Renspa` (consultarRenspa). */
export interface RenspaCPE {
  nroRenspa?: string;
  descripcion?: string;
}

/** `DomicilioPUCRespuesta` (consultarDomiciliosPorCUIT). */
export interface DomicilioCPE {
  tipo?: number;
  orden?: number;
  descripcion?: string;
}

/** `TipoEmbalajeUnidadMedida` (consultarTiposEmbalaje). */
export interface TipoEmbalajeCPE extends CodigoDescripcion {
  /** Unidades de medida admitidas para el embalaje. */
  unidadMedida: CodigoDescripcion[];
}
