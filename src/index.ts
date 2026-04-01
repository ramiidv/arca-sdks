// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------
export { ArcaAgro } from './arca-agro.js';

// ---------------------------------------------------------------------------
// Low-level clients
// ---------------------------------------------------------------------------
export { CpeClient } from './cpe-client.js';
export type { CpeClientOptions } from './cpe-client.js';

export { CtgClient } from './ctg-client.js';
export type { CtgClientOptions } from './ctg-client.js';

export { LpgClient } from './lpg-client.js';
export type { LpgClientOptions } from './lpg-client.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type {
  // Config
  ArcaAgroConfig,
  AgroAuth,
  AgroError,
  // Re-exports from common
  AccessTicket,
  ArcaEvent,
  ServerStatus,
  // CPE
  CartaPorteAutomotor,
  CartaPorteResult,
  ConsultaCPEParams,
  ConsultaCPEPorDestinoParams,
  ConfirmadoArriboCPEParams,
  RechazoAnulacionCPEParams,
  EditarCPEParams,
  ContingenciaCPEParams,
  // CTG
  SolicitudCTG,
  CTGResult,
  ConsultaCTGParams,
  ConfirmarArriboCTGParams,
  RechazoCTGParams,
  AnulacionCTGParams,
  CTGActivosResult,
  // LPG
  Liquidacion,
  LiquidacionResult,
  ConsultaLiquidacionParams,
  AjusteUnificadoParams,
  Certificacion,
  CertificacionResult,
  LpgParameterQueryParams,
} from './types.js';

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------
export { validateCPE, validateCTG, validateLiquidacion } from './validation.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
export {
  WSAA_SERVICES,
  CPE_ENDPOINTS,
  CPE_NAMESPACE,
  CTG_ENDPOINTS,
  CTG_NAMESPACE,
  LPG_ENDPOINTS,
  LPG_NAMESPACE,
} from './constants.js';

// ---------------------------------------------------------------------------
// Errors (re-export from common for convenience)
// ---------------------------------------------------------------------------
export {
  ArcaError,
  ArcaAuthError,
  ArcaSoapError,
  ArcaServiceError,
  ArcaValidationError,
} from '@ramiidv/arca-common';
