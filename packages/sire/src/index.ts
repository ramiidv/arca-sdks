// API principal
export { ArcaSire } from './arca-sire.js';
export { SireClient } from './sire-client.js';
export type { SireClientConfig } from './sire-client.js';

// Errores
export {
  ArcaError,
  ArcaAuthError,
  ArcaSoapError,
  ArcaServiceError,
  ArcaValidationError,
  ArcaTicketVigenteError,
} from '@ramiidv/arca-common';
export { ArcaSireServiceError } from './errors.js';

// Constantes y tablas
export {
  ENDPOINTS,
  SIRE_NAMESPACE,
  SIRE_SERVICE_ID,
  SIRE_VERSION,
  IMPUESTO_IVA,
  TipoComprobante,
  Condicion,
  MotivoAnulacion,
  REGIMENES_CON_CONDICION,
  TIPOS_CON_CERTIFICADO_ORIGINAL,
} from './constants.js';

// Validación y serialización
export {
  buildCertificadoRequest,
  buildAnulacionRequest,
  formatSireDateTime,
  formatImporte,
} from './validation.js';

// Tipos
export type {
  ArcaSireConfig,
  WsAuth,
  FechaHora,
  EmitirCertificadoParams,
  CertificadoRequest,
  AnularCertificadoParams,
  CertificadoAnulacionRequest,
  CertificadoResult,
  SireHeaderInfo,
  SireServerStatus,
} from './types.js';
export type {
  ArcaEvent,
  CallOptions,
  ServerStatus,
  TicketStorage,
  ValidationErrorDetail,
  ServiceErrorDetail,
} from '@ramiidv/arca-common';
