// Main class
export { ArcaCdc } from './arca-cdc.js';

// Low-level client
export { CdcClient } from './cdc-client.js';
export type { CdcClientConfig } from './cdc-client.js';

// Error classes and WSAA (from common)
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

// Types
export type {
  ArcaCdcConfig,
  CdcAuth,
  CbteModo,
  Opcional,
  ConstatarInput,
  ConstatarResult,
  ComprobanteConstatado,
  CdcMensaje,
  ModalidadItem,
  TipoCbteItem,
  DocTipoItem,
  OpcionalTipoItem,
  ListaCdc,
  AccessTicket,
  ArcaEvent,
  CallOptions,
  LegacyTlsMode,
  ServerStatus,
  ServiceClientConfig,
  ServiceEndpoints,
  ServiceErrorDetail,
  ServiceTransport,
  TicketStorage,
  ValidationErrorDetail,
} from './types.js';

// Constants
export { ENDPOINTS, WSCDC_NAMESPACE, WSCDC_SERVICE_ID, CBTE_MODOS } from './constants.js';

// Validation
export { validateConstatarInput } from './validation.js';
