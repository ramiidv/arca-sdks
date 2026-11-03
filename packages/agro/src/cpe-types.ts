/**
 * Tipos de WSCPE (Carta de Porte Electrónica), fieles al XSD del WSDL oficial.
 * Los nombres de los campos son los del XSD.
 */
import type {
  CallOptions,
  CodigoDescripcion,
  ConAdvertencias,
  CuitInput,
  FechaHoraInput,
  FechaInput,
} from './types.js';

// ============================================================
// Tipos comunes de requests
// ============================================================

/** Identificación de una carta de porte (`CartaPorte`). */
export interface CartaPorteId {
  /**
   * Tipo de carta de porte: 74 automotor, 75 ferroviaria, 274 automotor flete corto, 284 a 287
   * derivados granarios (ver `TIPO_CPE`).
   */
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

/**
 * Opciones de las ediciones de CPE (`editarCPEAutomotor`, `editarCPEFerroviaria`,
 * `editarCPEConfirmada*`).
 */
export interface EditarCPEOptions extends CallOptions {
  /**
   * ARCA anula los CUIT opcionales que no se informan en una edición ("Si no
   * informa el campo, se anula la CUIT existente", manual WSCPE §3.2). Con
   * `true`, el SDK consulta la CPE y completa con el valor vigente los CUIT
   * opcionales que no se pasaron (`undefined`); para quitar uno, pasalo como
   * `null`. Hace una consulta más antes de la edición (`consultarCPEAutomotor` o
   * `consultarCPEFerroviaria`, después de validar los `params`): si falla, la
   * edición no se envía. Default: `false`.
   */
  preservarIntervinientes?: boolean;
}

/**
 * `EditarActivaAutomotorSolicitud` (editarCPEAutomotor).
 *
 * Los CUIT opcionales que no se informan se anulan en la CPE (ver
 * `EditarCPEOptions.preservarIntervinientes`); `null` también los anula.
 */
export interface EditarCPEAutomotorParams {
  nroCTG: string | number;
  cuitRemitenteComercialVentaPrimaria?: CuitInput | null;
  cuitRemitenteComercialVentaSecundaria?: CuitInput | null;
  cuitRemitenteComercialVentaSecundaria2?: CuitInput | null;
  cuitCorredorVentaPrimaria?: CuitInput | null;
  cuitCorredorVentaSecundaria?: CuitInput | null;
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

/**
 * `EditarActivaFerroviariaSolicitud` (editarCPEFerroviaria).
 *
 * Los CUIT opcionales que no se informan se anulan en la CPE (ver
 * `EditarCPEOptions.preservarIntervinientes`); `null` también los anula.
 */
export interface EditarCPEFerroviariaParams {
  nroCTG: string | number;
  cuitDestinatario?: CuitInput | null;
  cuitRemitenteComercialVentaPrimaria?: CuitInput | null;
  cuitRemitenteComercialVentaSecundaria?: CuitInput | null;
  cuitRemitenteComercialVentaSecundaria2?: CuitInput | null;
  cuitCorredorVentaPrimaria?: CuitInput | null;
  cuitCorredorVentaSecundaria?: CuitInput | null;
  cuitTransportista?: CuitInput | null;
  destino?: DestinoCPE;
  nroVagon?: number;
  pesoBruto: number;
  codGrano: number;
}

/**
 * `EditarCPEConfirmadaAutomotorSolicitud` / `EditarCPEConfirmadaFerroviariaSolicitud`.
 *
 * Los intervinientes que no se informan se anulan en la CPE (ver
 * `EditarCPEOptions.preservarIntervinientes`); `null` también los anula.
 */
export interface EditarCPEConfirmadaParams {
  nroCTG: string | number;
  intervinientes: {
    cuitCorredorVentaPrimaria?: CuitInput | null;
    cuitCorredorVentaSecundaria?: CuitInput | null;
    cuitRemitenteComercialVentaPrimaria?: CuitInput | null;
    cuitRemitenteComercialVentaSecundaria?: CuitInput | null;
    cuitRemitenteComercialProductor?: CuitInput | null;
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
 * `InformarContingenciaSolicitud`. Los conceptos admitidos dependen de
 * `cartaPorte.tipoCPE` (manual WSCPE §4.2; se validan localmente):
 * - Automotor, automotor DG y emitida en destino: A Siniestro, B Imposibilidad
 *   de tránsito por zona desfavorable, C Desperfecto mecánico, D Accidente,
 *   E Demora descarga, F Otro.
 * - Ferroviaria y ferroviaria DG: A Siniestro vagón, B Descarrilamiento,
 *   C Imposibilidad de tránsito, D Desperfecto mecánico, E Accidente
 *   ferroviario, F Demora de descarga, G Otro.
 * - Ductos DG: A Siniestro, C Desperfecto mecánico, D Accidente, E Demora de
 *   descarga, F Otro.
 */
export interface InformarContingenciaParams {
  cartaPorte: CartaPorteId;
  contingencia: { concepto: string; descripcion?: string };
}

/**
 * `CerrarContingenciaFerroviariaSolicitud` (cerrarContingenciaCPE). Pese al nombre del
 * tipo en el XSD, el método es común a automotor, ferroviaria, automotor DG,
 * ferroviaria DG y ductos (manual WSCPE §2.9).
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

// ============================================================
// Derivados granarios (DG): requests
// ============================================================

/** `DomicilioPUC`: domicilio de `consultarDomiciliosPorCUIT`. */
export interface DomicilioPUCCPE {
  /** 1 fiscal, 3 locales y establecimientos. */
  tipo: number;
  orden: number;
}

/** `OrigenAutomotorDGSolicitud` / `OrigenFerroviariaDGSolicitud` (en ferroviaria `planta` es obligatoria). */
export interface OrigenCPEDG {
  esUsuarioIndustria: boolean;
  planta?: number;
  /** Solo con `esUsuarioIndustria: true`. */
  cuitTitularPlanta?: CuitInput;
  domicilioOrigen: DomicilioPUCCPE;
}

/** `DestinoAutomotorDGSolicitud` (en ferroviaria y emitida en destino `planta` es obligatoria). */
export interface DestinoCPEDG {
  cuit: CuitInput;
  planta?: number;
  domicilioDestino: DomicilioPUCCPE;
}

/** Destino DG con planta (`DestinoFerroviariaDGSolicitud`, `DestinoEmisionDestinoDGSolicitud`). */
export interface DestinoPlantaCPEDG extends DestinoCPEDG {
  planta: number;
}

/** `IntervinientesAutomotorDGSolicitud` / `IntervinientesFerroviariaDGSolicitud`. */
export interface IntervinientesCPEDG {
  cuitRemitenteComercial?: CuitInput;
  cuitMercadoATermino?: CuitInput;
  cuitComisionista?: CuitInput;
  cuitCorredor?: CuitInput;
}

/** `DatosCargaAutomotorDGSolicitud` / `DatosCargaFerroviariaDGSolicitud`. */
export interface DatosCargaCPEDG {
  codGrano: number;
  /** Código de derivado granario (`consultarDerivadosGranarios`). */
  codDerivadoGranario: number;
  /** Kilogramos (1-88000). */
  pesoBruto: number;
  /** Kilogramos (1-88000). */
  pesoTara: number;
  /** Tipo de embalaje (`consultarTiposEmbalaje`); 1 es a granel. */
  tipoEmbalaje: number;
  /** Solo si el tipo de embalaje es "otro" (en ferroviaria, hasta 140 caracteres). */
  otroEmbalaje?: string;
  /** Unidad de medida (`consultarTiposEmbalaje`, 1-9). */
  unidadMedida: number;
  /** 1-99999. Solo si `tipoEmbalaje` no es 1 (a granel). */
  cantidadUnidades?: number;
  /** 1-99999. Solo si `tipoEmbalaje` no es 1 (a granel). */
  kgLitroM3?: number;
  /** Hasta 15 caracteres. */
  lote?: string;
  /** Solo si se informa `lote`. */
  fechaLote?: FechaHoraInput;
}

/** `TransporteAutomotorDGSolicitud`. */
export interface TransporteAutomotorCPEDG {
  cuitTransportista: CuitInput;
  /** Dominios (patentes, 6-7 caracteres): de 1 a 3. */
  dominio: string[];
  fechaHoraPartida: FechaHoraInput;
  kmRecorrer: number;
  cuitChofer: CuitInput;
  tarifa?: number;
  cuitPagadorFlete: CuitInput;
  cuitIntermediarioFlete?: CuitInput;
}

/** `TransporteFerroviariaDGSolicitud`. */
export interface TransporteFerroviariaCPEDG {
  cuitTransportista: CuitInput;
  cuitTransportistaTramo2?: CuitInput;
  nroVagon: number;
  /** Números de precinto: de 1 a 10. */
  nroPrecinto: string[];
  nroOperativo: number;
  ramal: RamalCPE;
  fechaHoraPartidaTren: FechaHoraInput;
  kmRecorrer: number;
  cuitConductor?: CuitInput;
  cuitConductorTramo2?: CuitInput;
  tarifa?: number;
  cuitPagadorFlete: CuitInput;
  cuitIntermediarioFlete?: CuitInput;
}

/** `TransporteAutomotorModificaDGSolicitud`: como la de granos, sin `codigoTurno`. */
export type TransporteAutomotorModificaCPEDG = Omit<TransporteAutomotorModificaCPE, 'codigoTurno'>;

/** `AutorizarAutomotorDGSolicitud` (autorizarCPEAutomotorDG). */
export interface AutorizarCPEAutomotorDGParams {
  /** `tipoCP`: 284 (`TIPO_CPE.AUTOMOTOR_DG`). */
  cabecera: { tipoCP: number; sucursal: number; nroOrden: number };
  origen: OrigenCPEDG;
  intervinientes?: IntervinientesCPEDG;
  datosCarga: DatosCargaCPEDG;
  destino: DestinoCPEDG;
  destinatario: DestinatarioCPE;
  transporte: TransporteAutomotorCPEDG;
  observaciones?: string;
}

/**
 * `AutorizarEmisionDestinoDGSolicitud` (autorizarCPEEmisionDestinoDG): la emite el destino;
 * `cabecera.tipoCP` es 286 (`TIPO_CPE.EMISION_DESTINO_DG`).
 */
export interface AutorizarCPEEmisionDestinoDGParams extends Omit<AutorizarCPEAutomotorDGParams, 'origen' | 'destino'> {
  origen: { cuitOrigen: CuitInput; planta: number; domicilioOrigen: DomicilioPUCCPE };
  destino: DestinoPlantaCPEDG;
}

/** `AutorizarFerroviariaDGSolicitud` (autorizarCPEFerroviariaDG, tipo 285). */
export interface AutorizarCPEFerroviariaDGParams {
  cabecera: { sucursal: number; nroOrden: number };
  origen: OrigenCPEDG & { planta: number };
  intervinientes?: IntervinientesCPEDG;
  datosCarga: DatosCargaCPEDG;
  destino: DestinoPlantaCPEDG;
  destinatario: DestinatarioCPE;
  transporte: TransporteFerroviariaCPEDG;
  observaciones?: string;
}

/**
 * `ConsultarAutomotorDGSolicitud` / `ConsultarFerroviariaDGSolicitud` /
 * `ConsultarEmisionDestinoDGSolicitud`: `cartaPorte` o `nroCTG`.
 */
export interface ConsultarCPEDGParams extends ConsultarCPEParams {
  cuitTitularPlanta?: CuitInput;
}

/** Campos de carga editables de una CPE DG activa (en ductos, solo los cuatro primeros). */
export interface EditarCargaCPEDG {
  codGrano?: number;
  codDerivadoGranario?: number;
  unidadMedida?: number;
  tipoEmbalaje?: number;
  otroEmbalaje?: string;
  cantidadUnidades?: number;
  kgLitroM3?: number;
}

/** Flete y peso editables de una CPE DG activa (automotor y ferroviaria). */
export interface EditarFleteCPEDG {
  tarifa?: number;
  cuitPagadorFlete: CuitInput;
  cuitIntermediarioFlete?: CuitInput;
  kmRecorrer: number;
  pesoBruto?: number;
}

/** `EditarActivaDGAutomotorSolicitud` (editarCPEDGAutomotor). */
export interface EditarCPEDGAutomotorParams extends EditarCargaCPEDG, EditarFleteCPEDG {
  nroCTG: string | number;
  cuitTransportista?: CuitInput;
  cuitChofer?: CuitInput;
  intervinientes?: IntervinientesCPEDG;
  destino?: DestinoCPEDG;
  cuitDestinatario?: CuitInput;
  /** Hasta 3 dominios. */
  dominio?: string[];
  observaciones?: string;
}

/** `EditarActivaDGFerroviariaSolicitud` (editarCPEDGFerroviaria). */
export interface EditarCPEDGFerroviariaParams extends EditarCargaCPEDG, EditarFleteCPEDG {
  nroCTG: string | number;
  cuitTransportista?: CuitInput;
  cuitConductor?: CuitInput;
  cuitTransportistaTramo2?: CuitInput;
  cuitConductorTramo2?: CuitInput;
  nroVagon?: number;
  /** Números de precinto: de 1 a 10. */
  nroPrecinto: string[];
  nroOperativo: number;
  ramal: RamalCPE;
  intervinientes?: IntervinientesCPEDG;
  cuitDestinatario?: CuitInput;
  destino?: DestinoPlantaCPEDG;
  observaciones?: string;
}

/** `EditarActivaDGDuctosSolicitud` (editarCPEDGDuctos). */
export interface EditarCPEDGDuctosParams
  extends Pick<EditarCargaCPEDG, 'codGrano' | 'codDerivadoGranario' | 'unidadMedida' | 'tipoEmbalaje'> {
  nroCTG: string | number;
  intervinientes?: IntervinientesCPEDG;
  cuitDestinatario?: CuitInput;
  observaciones?: string;
}

/**
 * `EditarCPEConfirmadaAutomotorDgSolicitud` / `EditarCPEConfirmadaFerroviariaDgSolicitud` /
 * `EditarCPEConfirmadaDuctosSolicitud` (editarCPEDGConfirmadaAutomotor,
 * editarCPEDGConfirmadaFerroviaria, editarCPEConfirmadaDuctos).
 */
export interface EditarCPEDGConfirmadaParams {
  nroCTG: string | number;
  intervinientes?: Omit<IntervinientesCPEDG, 'cuitMercadoATermino'>;
  observaciones?: string;
}

/** `ConfirmacionAutomotorDGSolicitud` (confirmacionDefinitivaCPEAutomotorDG). */
export interface ConfirmacionDefinitivaCPEAutomotorDGParams extends SolicitanteCartaPorteParams {
  pesoBrutoDescarga: number;
  pesoTaraDescarga: number;
}

/** `ConfirmacionFerroviariaDGSolicitud` (confirmacionDefinitivaCPEFerroviariaDG). */
export interface ConfirmacionDefinitivaCPEFerroviariaDGParams extends ConfirmacionDefinitivaCPEAutomotorDGParams {
  ramalDescarga: RamalCPE;
}

/** `ConfirmacionDuctosDGSolicitud` (confirmacionDefinitivaCPEDuctosDG). */
export interface ConfirmacionDefinitivaCPEDuctosDGParams extends SolicitanteCartaPorteParams {
  /** Kilogramos (1-9999999). */
  pesoBrutoDescarga: number;
}

/** `DesvioAutomotorDGSolicitud` (desvioCPEAutomotorDG). */
export interface DesvioCPEAutomotorDGParams extends SolicitanteCartaPorteParams {
  destino: DestinoCPEDG;
  transporte: TransporteAutomotorModificaCPEDG;
}

/** `DesvioFerroviariaDGSolicitud` (desvioCPEFerroviariaDG). */
export interface DesvioCPEFerroviariaDGParams extends SolicitanteCartaPorteParams {
  destino: DestinoPlantaCPEDG;
  transporte: TransporteFerroviariaModificaCPE;
}

/** `NuevoDestinoDestinatarioAutomotorDGSolicitud` (nuevoDestinoDestinatarioCPEAutomotorDG). */
export interface NuevoDestinoDestinatarioCPEAutomotorDGParams {
  cartaPorte: CartaPorteId;
  destino: DestinoCPEDG;
  destinatario?: DestinatarioCPE;
  transporte: TransporteAutomotorModificaCPEDG;
}

/** `NuevoDestinoDestinatarioFerroviariaDGSolicitud` (nuevoDestinoDestinatarioCPEFerroviariaDG). */
export interface NuevoDestinoDestinatarioCPEFerroviariaDGParams {
  cartaPorte: CartaPorteId;
  destino: DestinoPlantaCPEDG;
  destinatario?: DestinatarioCPE;
  transporte: TransporteFerroviariaModificaCPE;
}

/** `RegresoOrigenAutomotorDGSolicitud` (regresoOrigenCPEAutomotorDG). */
export interface RegresoOrigenCPEAutomotorDGParams {
  cartaPorte: CartaPorteId;
  transporte: TransporteAutomotorModificaCPEDG;
  planta?: number;
  domicilioDestino?: DomicilioPUCCPE;
  cuitDestinatario?: CuitInput;
}

/** `RegresoOrigenFerroviariaDGSolicitud` (regresoOrigenCPEFerroviariaDG). */
export interface RegresoOrigenCPEFerroviariaDGParams {
  cartaPorte: CartaPorteId;
  transporte: TransporteFerroviariaModificaCPE;
  planta?: number;
  domicilioDestino?: DomicilioPUCCPE;
  cuitDestinatario: CuitInput;
}

/** CUIT del destino que opera una CPE emitida en destino (`*EmisionDestinoDG`). */
export interface ConCuitDestino {
  cuitDestino: CuitInput;
}

/**
 * `AceptarEmisionDestinoDGSolicitud` / `RechazarEmisionDestinoDGSolicitud` /
 * `DescargadoDestinoCPEEmisionDestinoDGSolicitud`.
 */
export interface SolicitanteDestinoCartaPorteParams extends SolicitanteCartaPorteParams, ConCuitDestino {}

/** `AnularCPEEmisionDestinoDGSolicitud` (anularCPEEmisionDestinoDG). */
export interface AnularCPEEmisionDestinoDGParams extends AnularCPEParams, ConCuitDestino {}

/** `InformarContingenciaEmisionDestinoDGSolicitud`. Conceptos A a F (los de automotor). */
export interface InformarContingenciaEmisionDestinoDGParams extends InformarContingenciaParams, ConCuitDestino {}

/** `CerrarContingenciaEmisionDestinoDGSolicitud` (cerrarContingenciaCPEEmisionDestinoDG). */
export interface CerrarContingenciaCPEEmisionDestinoDGParams extends CerrarContingenciaCPEParams, ConCuitDestino {}

/** `NuevoDestinoDestinatarioEmisionDestinoDGSolicitud`. */
export interface NuevoDestinoDestinatarioCPEEmisionDestinoDGParams
  extends NuevoDestinoDestinatarioCPEAutomotorDGParams,
    ConCuitDestino {}

/** `RegresoOrigenEmisionDestinoDGSolicitud` (regresoOrigenCPEEmisionDestinoDG). */
export interface RegresoOrigenCPEEmisionDestinoDGParams extends ConCuitDestino {
  cartaPorte: CartaPorteId;
  transporte: TransporteAutomotorModificaCPEDG;
  planta?: number;
}

// ============================================================
// Derivados granarios (DG): respuestas
// ============================================================

/** `DetalleFerroviariaDGRespuesta`: la ferroviaria sin retiro del productor. */
export type CPEFerroviariaDGDetalle = Omit<CPEFerroviariaDetalle, 'correspondeRetiroProductor' | 'retiroProductor'>;

/** `IntervinientesAutomotorDGRespuesta` / `IntervinientesDuctosDGRespuesta`. */
export interface IntervinientesCPEDGRespuesta {
  cuitRemitenteComercial?: number;
  cuitMercadoATermino?: number;
  cuitComisionista?: number;
  cuitCorredor?: number;
}

/** `DetalleAutomotorDGRespuesta`. `cabecera.nroCTG` siempre está presente. */
export interface CPEAutomotorDGDetalle extends ConAdvertencias {
  cabecera: CabeceraCPE & { nroCTG: string };
  origen?: {
    esUsuarioIndustria?: boolean;
    planta?: number;
    plantaObservaciones?: string;
    cuitTitularPlanta?: number;
    domicilioOrigen?: string;
    cuitOrigen?: number;
  };
  intervinientes?: IntervinientesCPEDGRespuesta;
  datosCarga?: {
    codGrano?: number;
    codDerivadoGranario?: number;
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
    dominio: string[];
    fechaHoraPartida?: string;
    kmRecorrer?: number;
    cuitChofer?: number;
    tarifa?: number;
    tarifaReferencia?: number;
    cuitPagadorFlete?: number;
    cuitIntermediarioFlete?: number;
  };
  pdf?: string;
  metadata?: MetadataCPE;
}

/** `DetalleEmisionDestinoDGRespuesta`: como la automotor DG, con otro origen y destino. */
export interface CPEEmisionDestinoDGDetalle extends Omit<CPEAutomotorDGDetalle, 'origen' | 'destino'> {
  origen?: { planta?: number; domicilioOrigen?: string; cuitOrigen?: number };
  destino?: { cuit?: number; planta?: number; domicilioDestino?: string; cuitTitularPlanta?: number };
}

/** `DetalleDuctosDGRespuesta`. `cabecera.nroCTG` siempre está presente. */
export interface CPEDuctosDetalle extends ConAdvertencias {
  cabecera: CabeceraCPE & { nroCTG: string };
  origen?: {
    esUsuarioIndustria?: boolean;
    planta?: number;
    cuitTitularPlanta?: number;
    domicilioOrigen?: string;
    cuitOrigen?: number;
  };
  intervinientes?: IntervinientesCPEDGRespuesta;
  datosCarga?: {
    codGrano?: number;
    codDerivadoGranario?: number;
    cosecha?: number;
    pesoBrutoDescarga?: number;
    pesoTaraDescarga?: number;
    tipoEmbalaje?: number;
    otroEmbalaje?: string;
    unidadMedida?: number;
    pesoBruto?: number;
    lote?: string;
    fechaLote?: string;
  };
  destino?: {
    cuit?: number;
    codProvincia?: number;
    codLocalidad?: number;
    planta?: number;
    domicilioDestino?: string;
    fechaHoraInicioEnvio?: string;
    fechaHoraFinEnvio?: string;
  };
  destinatario?: { cuit?: number };
  pdf?: string;
  metadata?: MetadataCPE;
}

/**
 * `CPEDGPendienteActivacionRespuesta` / `CPEEmitidasDestinoDGRespuesta`
 * (consultarCPEDGPendienteActivacion, consultarCPEEmitidasDestinoDGPendientesActivacion).
 */
export interface CPEDGPendiente {
  tipoCartaPorte?: number;
  sucursal?: number;
  nroOrden?: number;
  cuitSolicitante?: number;
  fechaPartida?: string;
}

/** `DerivadoGranario` (consultarDerivadosGranarios). */
export interface DerivadoGranarioCPE {
  /** Código del grano del que deriva. */
  granoPadre?: number;
  granoPadreDescripcion?: string;
  codigo: number;
  descripcion: string;
}

/** `PlantaDGResponse` (consultarPlantasDG). */
export interface PlantaDGCPE {
  nroPlanta?: number;
  actividad?: number;
  conPlantaDG?: string;
  sinPlantaDG?: string;
}
