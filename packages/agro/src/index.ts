// ---------------------------------------------------------------------------
// Cliente principal y sub-clientes (los sub-clientes se obtienen como agro.cpe / agro.lpg)
// ---------------------------------------------------------------------------
export { ArcaAgro } from './arca-agro.js';
export type { CpeClient } from './cpe-client.js';
export type { LpgClient } from './lpg-client.js';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
export type {
  ArcaAgroConfig,
  AgroServiceStatus,
  CuitInput,
  FechaInput,
  FechaHoraInput,
  CodigoDescripcion,
  ConAdvertencias,
  AccessTicket,
  ArcaEvent,
  CallOptions,
  ServerStatus,
  TicketStorage,
} from './types.js';

export type {
  // Requests
  CartaPorteId,
  DestinoCPE,
  DestinatarioCPE,
  RetiroProductorCPE,
  IntervinientesCPE,
  CoordenadaGMS,
  CoordenadasGPSCPE,
  OrigenCPEAutomotor,
  SemillaCPE,
  TransporteAutomotorModificaCPE,
  RamalCPE,
  TransporteFerroviariaModificaCPE,
  AutorizarCPEAutomotorParams,
  AutorizarCPEFerroviariaParams,
  ConsultarCPEParams,
  EditarCPEAutomotorParams,
  EditarCPEFerroviariaParams,
  EditarCPEConfirmadaParams,
  AnularCPEParams,
  RechazoCPEParams,
  SolicitanteCartaPorteParams,
  ConfirmacionDefinitivaCPEAutomotorParams,
  ConfirmacionDefinitivaCPEFerroviariaParams,
  NuevoDestinoDestinatarioCPEAutomotorParams,
  NuevoDestinoDestinatarioCPEFerroviariaParams,
  RegresoOrigenCPEAutomotorParams,
  RegresoOrigenCPEFerroviariaParams,
  DesvioCPEAutomotorParams,
  DesvioCPEFerroviariaParams,
  InformarContingenciaParams,
  CerrarContingenciaCPEParams,
  ConsultarCPEPorDestinoParams,
  ConsultarCPEPendientesParams,
  // Respuestas
  CabeceraCPE,
  MetadataCPE,
  CPEResultado,
  DestinoCPERespuesta,
  CPEAutomotorDetalle,
  CPEFerroviariaDetalle,
  CPEResumen,
  OperativoFerroviarioCPE,
  PlantaCPE,
  CoordenadaCPE,
  LocalidadProductorCPE,
  VariedadSemillaCPE,
  RenspaCPE,
  DomicilioCPE,
  TipoEmbalajeCPE,
} from './cpe-types.js';

export type {
  SiNo,
  // Requests
  CertificadoDepositoLpg,
  LiquidacionLpg,
  DeduccionLpg,
  RetencionLpg,
  PercepcionLpg,
  LiquidacionAutorizarParams,
  AjusteCreditoDebitoLpg,
  AjusteUnificadoParams,
  MermasCg,
  CgAutorizarParams,
  LiquidacionPorContratoParams,
  CgBuscarCtgParams,
  CgBuscarCertConSaldoDisponibleParams,
  // Respuestas
  DeduccionLiquidadaLpg,
  RetencionLiquidadaLpg,
  LiquidacionAutorizadaLpg,
  LiquidacionResultado,
  LiquidacionConsultadaLpg,
  LiquidacionConsultaResultado,
  AnulacionLiquidacionResultado,
  AjusteCreditoDebitoResultadoLpg,
  AjusteUnificadoLpg,
  AjusteUnificadoResultado,
  GradoEntregadoLpg,
  CertificacionAutorizadaLpg,
  CertificacionResultado,
  AnulacionCertificacionResultado,
  AjusteConsultaResultado,
  MermasCgRespuesta,
  CertificacionConsultaResultado,
  CtgCertificableLpg,
  CertificadoConSaldoLpg,
} from './lpg-types.js';

// ---------------------------------------------------------------------------
// Validadores
// ---------------------------------------------------------------------------
export {
  validateAutorizarCPEAutomotor,
  validateAutorizarCPEFerroviaria,
  validateEditarCPEAutomotor,
  validateEditarCPEFerroviaria,
  validateEditarCPEConfirmada,
  validateConfirmacionDefinitivaCPEAutomotor,
  validateConfirmacionDefinitivaCPEFerroviaria,
  validateLiquidacion,
  validateAjusteUnificado,
  validateCgAutorizar,
} from './validation.js';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------
export {
  WSAA_SERVICES,
  CPE_ENDPOINTS,
  CPE_NAMESPACE,
  TIPO_CPE,
  ESTADOS_CPE,
  LPG_ENDPOINTS,
  LPG_NAMESPACE,
} from './constants.js';

// ---------------------------------------------------------------------------
// Errores
// ---------------------------------------------------------------------------
export { ArcaAgroServiceError, ArcaAgroResponseError, cpeFaultException } from './errors.js';
export type { CpeFaultException } from './errors.js';
export {
  ArcaError,
  ArcaAuthError,
  ArcaSoapError,
  ArcaServiceError,
  ArcaValidationError,
  ArcaTicketVigenteError,
  WsaaClient,
  MemoryTicketStorage,
  FileTicketStorage,
} from '@ramiidv/arca-common';
export type { ServiceErrorDetail, ValidationErrorDetail } from '@ramiidv/arca-common';
