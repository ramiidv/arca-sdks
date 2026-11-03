// Clientes
export { ArcaFecred } from './arca-fecred.js';
export { FecredClient } from './fecred-client.js';
export type { FecredClientConfig, WsAuthSource } from './fecred-client.js';

// Constantes y enumeraciones del XSD
export {
  ENDPOINTS,
  FECRED_NAMESPACE,
  FECRED_SERVICE_ID,
  RolCtaCte,
  EstadoCtaCte,
  EstadoComprobante,
  TipoFechaFiltro,
  OpcionTransferencia,
  TipoCancelacion,
  TipoAceptacion,
  Resultado,
  WSFECRED_ERRORES_REINTENTABLES,
} from './constants.js';
export type { TipoCodAutorizacion } from './constants.js';

// Tipos
export type * from './types.js';

// Errores y utilidades de common que aparecen en la API pública
export {
  ArcaError,
  ArcaAuthError,
  ArcaSoapError,
  ArcaServiceError,
  ArcaRechazoError,
  ArcaResponseError,
  ArcaValidationError,
  ArcaTicketVigenteError,
  WsaaClient,
  MemoryTicketStorage,
  FileTicketStorage,
} from '@ramiidv/arca-common';
export type {
  ArcaBaseConfig,
  ArcaEvent,
  AccessTicket,
  CallOptions,
  ServerStatus,
  ServiceEndpoints,
  ServiceErrorDetail,
  ServiceTransport,
  TicketStorage,
  ValidationErrorDetail,
} from '@ramiidv/arca-common';
