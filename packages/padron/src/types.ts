// Shared types from common
export type {
  AccessTicket,
  ArcaEvent,
  ServerStatus,
  SoapCallOptions,
  TicketStorage,
  CallOptions,
} from '@ramiidv/arca-common';
import type { ArcaBaseConfig, ArcaEvent, CondicionIva, ServerStatus, WsaaClient } from '@ramiidv/arca-common';

// ---------------------------------------------------------------------------
// Backward-compatible alias
// ---------------------------------------------------------------------------

/** @deprecated Use ArcaEvent from @ramiidv/arca-common instead. */
export type ArcaPadronEvent = ArcaEvent;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Servicios de Padrón con endpoint propio. */
export type PadronServicio = 'a5' | 'a4' | 'a10' | 'a13' | 'a100';

/**
 * Configuración de `ArcaPadron`. Extiende la configuración común de los SDKs
 * de ARCA (`ArcaBaseConfig`: cert, key, cuit, production, timeout, retries,
 * ticketStorage, clockOffsetMs, autoClockSkew, loginErrorCooldownMs, fetch,
 * legacyTls, etc.).
 */
export interface ArcaPadronConfig extends ArcaBaseConfig {
  /** Signal global: cancela todas las llamadas de esta instancia. */
  signal?: AbortSignal;
  /**
   * WsaaClient compartido (ej: `arca.wsaa` de arca-facturacion, mismo
   * certificado). Si se provee, se ignoran `cert`, `key`, `ticketStorage`,
   * `clockOffsetMs`, `autoClockSkew`, `loginErrorCooldownMs` y `tokenTTLMinutes`.
   */
  wsaa?: WsaaClient;
  /**
   * Endpoints propios (proxy, mock, etc.). Los que no se indiquen usan los
   * oficiales según `production` (ver `ENDPOINTS`).
   */
  endpoints?: Partial<Record<PadronServicio | 'wsaa', string>>;
}

/** Resultado de `status()`: el de cada servicio por separado (uno caído no oculta a los demás). */
export type PadronStatus = Record<PadronServicio, PromiseSettledResult<ServerStatus>>;

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export interface WsAuth {
  Token: string;
  Sign: string;
  CuitRepresentada: string;
}

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
  ffRelacion?: string;
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
  tipoPersona: 'FISICA' | 'JURIDICA';
  tipoClave?: string;
  estadoClave?: string;
  apellido?: string;
  nombre?: string;
  razonSocial?: string;
  numeroDocumento?: string;
  tipoDocumento?: string;
  fechaNacimiento?: string;
  sexo?: string;
  numeroInscripcion?: string;
  formaJuridica?: string;
  mesCierre?: number;
  fechaInscripcion?: string;
  fechaContratoSocial?: string;
  fechaFallecimiento?: string;
  fechaJubilado?: string;
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
  tipoPersona: 'FISICA' | 'JURIDICA';
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
  tipoPersona: 'FISICA' | 'JURIDICA';
  tipoClave?: string;
  estadoClave?: string;
  nombre?: string;
  apellido?: string;
  razonSocial?: string;
  numeroDocumento?: string;
  tipoDocumento?: string;
  formaJuridica?: string;
  mesCierre?: number;
  fechaNacimiento?: string;
  fechaFallecimiento?: string;
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
  ffRelacion?: string;
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
  /** Mensajes de error (ej: "La CUIT no está activa", constancia bloqueada, etc.) */
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
  tipoPersona?: 'FISICA' | 'JURIDICA';
  tipoClave?: string;
  estadoClave?: string;
  nombre?: string;
  apellido?: string;
  razonSocial?: string;
  mesCierre?: number;
  fechaContratoSocial?: string;
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
