// Shared types from common
export type {
  AccessTicket,
  ArcaEvent,
  ServerStatus,
  ServiceClientConfig,
  ServiceEndpoints,
  ServiceTransport,
  TicketStorage,
  CallOptions,
} from '@ramiidv/arca-common';
import type { ArcaSdkConfig, CondicionIva, ServiceStatus } from '@ramiidv/arca-common';
import type { ENDPOINTS } from './constants.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Servicios de Padrón con endpoint propio (las claves de `ENDPOINTS`). */
export type PadronServicio = keyof typeof ENDPOINTS;

/**
 * Configuración de `ArcaPadron`. Extiende la configuración común de los SDKs
 * de ARCA (`ArcaSdkConfig`: cert, key, cuit, production, timeout, retries,
 * ticketStorage, clockOffsetMs, autoClockSkew, loginErrorCooldownMs, fetch,
 * legacyTls, `wsaa` compartido, `signal` global, etc.).
 */
export interface ArcaPadronConfig extends ArcaSdkConfig {
  /**
   * Endpoints propios (proxy, mock, etc.), con las mismas claves que
   * `ENDPOINTS`. Los que no se indiquen usan los oficiales según `production`.
   */
  endpoints?: {
    /** Constancia de inscripción (ex A5). */
    a5?: string;
    a4?: string;
    a10?: string;
    a13?: string;
    a100?: string;
    /** URL del WSAA (`.../ws/services/LoginCms`, ver `WSAA_ENDPOINTS` de arca-common). Se ignora si se pasa `wsaa`. */
    wsaa?: string;
  };
}

/** Resultado de `status()`: el de cada servicio por separado (uno caído no oculta a los demás). */
export type PadronStatus = Record<PadronServicio, ServiceStatus>;

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export interface WsAuth {
  token: string;
  sign: string;
  cuitRepresentada: string;
}

// ---------------------------------------------------------------------------
// Datos comunes de las respuestas
// ---------------------------------------------------------------------------

/**
 * `metadata` de las respuestas de Padrón: cuándo y en qué servidor procesó ARCA
 * la consulta. Útil para auditoría y para reportar incidentes a ARCA.
 */
export interface PadronMetadata {
  /** Fecha y hora de proceso (`xs:dateTime`, tal cual lo envía ARCA: "2026-02-26T15:52:37.653-03:00"). */
  fechaHora?: string;
  /** Nombre del equipo que procesó el requerimiento. */
  servidor?: string;
}

/**
 * Lista devuelta por un método de Padrón. Es un array común; si ARCA informó
 * `metadata`, se lee en `lista.metadata` (propiedad no enumerable: no aparece al
 * iterar, serializar con `JSON.stringify` ni copiar el array).
 */
export type ListaPadron<T> = T[] & { metadata?: PadronMetadata };

/**
 * Tipo de persona. ARCA informa `FISICA` o `JURIDICA`; el SDK no rechaza otro
 * valor (lo devuelve tal cual), por eso el tipo admite cualquier string.
 */
export type TipoPersonaPadron = 'FISICA' | 'JURIDICA' | (string & {});

// ---------------------------------------------------------------------------
// Padron A4 - Full persona
// ---------------------------------------------------------------------------

export interface DependenciaA4 {
  idDependencia?: number;
  descripcionDependencia?: string;
}

export interface DomicilioA4 extends DomicilioA10 {
  orden?: number;
}

export interface ImpuestoA4 {
  idImpuesto: number;
  descripcionImpuesto?: string;
  /** Estado (manual A4 §5.3): ACTIVO, ACTIVO EN TRAMITE, BAJA PROVISORIA, BAJA DEFINITIVA, EXENTO, EXENTO EN TRAMITE, NO APORTANTE. */
  estado?: string;
  periodo?: number;
  diaPeriodo?: number;
  /** `xs:dateTime`: string tal cual lo envía ARCA (no se convierte a `Date`). */
  ffInscripcion?: string;
}

export interface ActividadA4 {
  idActividad: string;
  descripcionActividad?: string;
  nomenclador?: number;
  orden?: number;
  periodo?: number;
}

export interface RegimenA4 {
  idRegimen: number;
  descripcionRegimen?: string;
  estado?: string;
  periodo?: number;
  diaPeriodo?: number;
  tipoRegimen?: string;
  idImpuesto?: number;
}

export interface RelacionA4 {
  idPersona: string;
  idPersonaAsociada?: string;
  tipoRelacion?: string;
  subtipoRelacion?: string;
  /** `xs:dateTime`: string tal cual lo envía ARCA (no se convierte a `Date`). */
  ffRelacion?: string;
  /** `xs:dateTime`: string tal cual lo envía ARCA (no se convierte a `Date`). */
  ffVencimiento?: string;
}

export interface CategoriaA4 {
  idCategoria: number;
  descripcionCategoria?: string;
  idImpuesto?: number;
  estado?: string;
  periodo?: number;
}

export interface EmailA4 {
  direccion: string;
  tipoEmail?: string;
  estado?: string;
}

export interface TelefonoA4 {
  numero: string;
  tipoTelefono?: string;
  tipoLinea?: string;
}

export interface PersonaA4 {
  idPersona: string;
  /** `metadata` de la respuesta (fecha/hora y servidor de ARCA), si vino. */
  metadata?: PadronMetadata;
  tipoPersona: TipoPersonaPadron;
  tipoClave?: string;
  estadoClave?: string;
  apellido?: string;
  nombre?: string;
  razonSocial?: string;
  numeroDocumento?: string;
  tipoDocumento?: string;
  /** `xs:dateTime`: string tal cual lo envía ARCA (no se convierte a `Date`). */
  fechaNacimiento?: string;
  sexo?: string;
  numeroInscripcion?: string;
  formaJuridica?: string;
  mesCierre?: number;
  /** `xs:dateTime`: string tal cual lo envía ARCA (no se convierte a `Date`). */
  fechaInscripcion?: string;
  /** `xs:dateTime`: string tal cual lo envía ARCA (no se convierte a `Date`). */
  fechaContratoSocial?: string;
  /** `xs:dateTime`: string tal cual lo envía ARCA (no se convierte a `Date`). */
  fechaFallecimiento?: string;
  /** `xs:dateTime`: string tal cual lo envía ARCA (no se convierte a `Date`). */
  fechaJubilado?: string;
  /** `xs:dateTime`: string tal cual lo envía ARCA (no se convierte a `Date`). */
  fechaVencimientoMigracion?: string;
  localidadInscripcion?: string;
  provinciaInscripcion?: string;
  organismoInscripcion?: string;
  organismoOriginante?: string;
  tipoOrganismoOriginante?: string;
  tipoResidencia?: string;
  porcentajeCapitalNacional?: number;
  cantidadSociosEmpresaMono?: number;
  leyJubilacion?: number;
  dependencia?: DependenciaA4;
  claveInactivaAsociada?: string[];
  domicilio?: DomicilioA4[];
  impuesto?: ImpuestoA4[];
  actividad?: ActividadA4[];
  regimen?: RegimenA4[];
  relacion?: RelacionA4[];
  categoria?: CategoriaA4[];
  email?: EmailA4[];
  telefono?: TelefonoA4[];
}

// ---------------------------------------------------------------------------
// Padron A10 - Minimal persona
// ---------------------------------------------------------------------------

export type DependenciaA10 = DependenciaA4;

export interface DomicilioA10 {
  direccion?: string;
  localidad?: string;
  codPostal?: string;
  idProvincia?: number;
  descripcionProvincia?: string;
  tipoDomicilio?: string;
  datoAdicional?: string;
  tipoDatoAdicional?: string;
}

export interface PersonaA10 {
  idPersona: string;
  /** `metadata` de la respuesta (fecha/hora y servidor de ARCA), si vino. */
  metadata?: PadronMetadata;
  tipoPersona: TipoPersonaPadron;
  tipoClave?: string;
  estadoClave?: string;
  nombre?: string;
  apellido?: string;
  razonSocial?: string;
  numeroDocumento?: string;
  tipoDocumento?: string;
  idActividadPrincipal?: string;
  descripcionActividadPrincipal?: string;
  dependencia?: DependenciaA10;
  claveInactivaAsociada?: string[];
  domicilio?: DomicilioA10[];
}

// ---------------------------------------------------------------------------
// Padron A100 - Parameter tables
// ---------------------------------------------------------------------------

export interface ParameterAttribute {
  name: string;
  /** Valor tal cual lo envía ARCA (`xs:string`: "10.50" no se convierte a número). */
  value?: string;
}

export interface ParameterRecord {
  id: string;
  descripcion: string;
  atributos?: ParameterAttribute[];
}

// ---------------------------------------------------------------------------
// Padrón A13
// ---------------------------------------------------------------------------

export interface DomicilioA13 {
  direccion?: string;
  calle?: string;
  numero?: number;
  piso?: string;
  oficinaDptoLocal?: string;
  sector?: string;
  torre?: string;
  manzana?: string;
  codigoPostal?: string;
  localidad?: string;
  idProvincia?: number;
  descripcionProvincia?: string;
  tipoDomicilio?: string;
  estadoDomicilio?: string;
  datoAdicional?: string;
  tipoDatoAdicional?: string;
}

export interface PersonaA13 {
  idPersona: string;
  /** `metadata` de la respuesta (fecha/hora y servidor de ARCA), si vino. */
  metadata?: PadronMetadata;
  tipoPersona: TipoPersonaPadron;
  tipoClave?: string;
  estadoClave?: string;
  nombre?: string;
  apellido?: string;
  razonSocial?: string;
  numeroDocumento?: string;
  tipoDocumento?: string;
  formaJuridica?: string;
  mesCierre?: number;
  /** `xs:dateTime`: string tal cual lo envía ARCA (no se convierte a `Date`). */
  fechaNacimiento?: string;
  /** `xs:dateTime`: string tal cual lo envía ARCA (no se convierte a `Date`). */
  fechaFallecimiento?: string;
  /** `xs:dateTime`: string tal cual lo envía ARCA (no se convierte a `Date`). */
  fechaContratoSocial?: string;
  idActividadPrincipal?: string;
  descripcionActividadPrincipal?: string;
  periodoActividadPrincipal?: number;
  claveInactivaAsociada?: string[];
  domicilio?: DomicilioA13[];
}

// ---------------------------------------------------------------------------
// Constancia de inscripción (ws_sr_constancia_inscripcion, ex Padrón A5)
// ---------------------------------------------------------------------------

export interface DomicilioA5 {
  direccion?: string;
  localidad?: string;
  codPostal?: string;
  idProvincia?: number;
  descripcionProvincia?: string;
  tipoDomicilio?: string;
  datoAdicional?: string;
  tipoDatoAdicional?: string;
}

export interface DependenciaA5 {
  idDependencia?: number;
  descripcionDependencia?: string;
  direccion?: string;
  localidad?: string;
  codPostal?: string;
  idProvincia?: number;
  descripcionProvincia?: string;
}

export interface CaracterizacionA5 {
  idCaracterizacion: number;
  descripcionCaracterizacion?: string;
  periodo?: number;
  /** Desde 11/02/2026 (opcional) */
  fechaSolicitud?: number;
}

export interface ImpuestoA5 {
  idImpuesto: number;
  descripcionImpuesto?: string;
  /** Id del estado en SUPA (`tipo_estado_impuesto`, ej: "AC" = activo) */
  estadoImpuesto?: string;
  motivo?: string;
  periodo?: number;
}

export interface ActividadA5 {
  idActividad: string;
  descripcionActividad?: string;
  nomenclador?: number;
  orden?: number;
  periodo?: number;
}

export interface CategoriaA5 {
  idCategoria: number;
  descripcionCategoria?: string;
  idImpuesto?: number;
  periodo?: number;
}

export interface RegimenA5 {
  idRegimen: number;
  descripcionRegimen?: string;
  idImpuesto?: number;
  periodo?: number;
  tipoRegimen?: string;
}

export interface RegimenGeneralA5 {
  impuestos: ImpuestoA5[];
  actividades: ActividadA5[];
  regimenes: RegimenA5[];
  categoriaAutonomo?: CategoriaA5;
}

/** `componenteDeSociedad` (tipo `relacion` del WSDL): integrante de una sociedad monotributista. */
export interface ComponenteSociedadA5 {
  idPersonaAsociada?: string;
  apellidoPersonaAsociada?: string;
  nombrePersonaAsociada?: string;
  razonSocialPersonaAsociada?: string;
  tipoComponente?: string;
  /** `xs:dateTime`: string tal cual lo envía ARCA (no se convierte a `Date`). */
  ffRelacion?: string;
  /** `xs:dateTime`: string tal cual lo envía ARCA (no se convierte a `Date`). */
  ffVencimiento?: string;
}

export interface MonotributoA5 {
  impuestos: ImpuestoA5[];
  actividades: ActividadA5[];
  actividadMonotributista?: ActividadA5;
  categoria?: CategoriaA5;
  /** Componentes de la sociedad monotributista (presente en el WSDL; el manual v3.5 lo da por no vigente). */
  componenteDeSociedad?: ComponenteSociedadA5[];
}

export interface ErrorConstanciaA5 {
  /**
   * Mensajes de error (ej: "No existe persona con ese Id", CUIT limitada, constancia
   * bloqueada). En `getPersonaList_v2` también se informan acá, sin hacer fallar la
   * consulta, las CUITs inválidas (no se envían a ARCA) y las personas que ARCA
   * devolvió con datos inválidos.
   */
  error: string[];
  idPersona?: string;
  nombre?: string;
  apellido?: string;
}

export interface ErrorRegimenA5 {
  error: string[];
  mensaje?: string;
}

/**
 * Constancia de inscripción de un contribuyente (`getPersona_v2`).
 *
 * Si ARCA no puede emitir la constancia, los datos pueden venir incompletos y
 * `errorConstancia` / `errorRegimenGeneral` / `errorMonotributo` indican por qué.
 */
export interface PersonaA5 {
  idPersona: string;
  tipoPersona?: TipoPersonaPadron;
  tipoClave?: string;
  estadoClave?: string;
  nombre?: string;
  apellido?: string;
  razonSocial?: string;
  mesCierre?: number;
  /** `xs:dateTime`: string tal cual lo envía ARCA (no se convierte a `Date`). */
  fechaContratoSocial?: string;
  /** `xs:dateTime`: string tal cual lo envía ARCA (no se convierte a `Date`). */
  fechaFallecimiento?: string;
  esSucesion?: string;
  domicilioFiscal?: DomicilioA5;
  dependencia?: DependenciaA5;
  caracterizacion?: CaracterizacionA5[];
  /** Régimen general (IVA, ganancias, autónomos, etc.). Ausente si no está inscripto. */
  regimenGeneral?: RegimenGeneralA5;
  /** Monotributo (categoría e impuestos). Ausente si no es monotributista. */
  monotributo?: MonotributoA5;
  /** Impuestos de ambos regímenes, juntos. */
  impuestos: ImpuestoA5[];
  errorConstancia?: ErrorConstanciaA5;
  errorRegimenGeneral?: ErrorRegimenA5;
  errorMonotributo?: ErrorRegimenA5;
  /**
   * `metadata` de la respuesta (fecha/hora y servidor de ARCA), si vino. En
   * `getPersonaList_v2` está en el array (ver `ListaPadron`), no en cada persona.
   */
  metadata?: PadronMetadata;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export interface CondicionIvaPadron {
  /**
   * Condición frente al IVA (`CondicionIVAReceptorId` de WSFEv1), o `null` si
   * el padrón no alcanza para determinarla (ver `motivo`).
   */
  condicionIva: CondicionIva | null;
  /** Explicación legible de cómo se determinó (o por qué no se pudo). */
  motivo: string;
}
