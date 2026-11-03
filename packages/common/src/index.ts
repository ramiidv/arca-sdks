// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
export {
  ArcaError,
  ArcaAuthError,
  ArcaSoapError,
  ArcaServiceError,
  ArcaValidationError,
  ArcaTicketVigenteError,
  ArcaResponseError,
} from './errors.js';
export type {
  ValidationErrorDetail,
  ArcaAuthErrorOptions,
  ArcaSoapErrorOptions,
  ServiceErrorDetail,
} from './errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type {
  AccessTicket,
  TicketStorage,
  TicketStorageGetOptions,
  LegacyTlsMode,
  ArcaBaseConfig,
  SoapCallOptions,
  SoapOperationKind,
  CallOptions,
  ServerStatus,
  ArcaEvent,
} from './types.js';

// ---------------------------------------------------------------------------
// WSAA
// ---------------------------------------------------------------------------
export { WsaaClient } from './wsaa.js';
export type { WsaaClientConfig } from './wsaa.js';
export { MemoryTicketStorage, FileTicketStorage, normalizeAccessTicket } from './ticket-storage.js';
export { anySignal } from './signals.js';
export { certificateInfo } from './certificate.js';
export type { CertificateInfo } from './certificate.js';

// ---------------------------------------------------------------------------
// SOAP client
// ---------------------------------------------------------------------------
export {
  parseXml,
  buildXml,
  ensureArray,
  getNestedValue,
  soapCall,
  arcaSoapCall,
  afipSoapCall,
  extractMethodResult,
  safeEmit,
  checkServiceErrors,
  extractServiceErrors,
} from './soap-client.js';
export type {
  ArcaSoapCallOptions,
  AfipSoapCallOptions,
  ExtractMethodResultOptions,
  ParseXmlOptions,
} from './soap-client.js';

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------
export {
  // CUIT/CUIL
  validateCuit,
  normalizeCuit,
  formatCuit,
  isValidCuit,
  // Aliases (backward compat)
  validateCuil,
  normalizeCuil,
  formatCuil,
  // CBU
  validateCBU,
  isValidCBU,
  // Fechas
  formatDate,
  parseArcaDate,
  parseAfipDate,
  validateFecha,
  validateFechaRango,
  diasEntre,
  // Helpers
  collectErrors,
  collectErrorsWithPrefix,
} from './validators.js';

// ---------------------------------------------------------------------------
// Fechas, redondeo y QR
// ---------------------------------------------------------------------------
export { AR_TIMEZONE, formatDateTimeAR } from './dates.js';
export type { FormatDateTimeAROptions } from './dates.js';
export { roundHalfUp, roundHalfEven } from './rounding.js';
export { generarUrlQR, QR_URL } from './qr.js';
export type { QRInput, QROptions } from './qr.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
export {
  WSAA_ENDPOINTS,
  WSAA_NAMESPACE,
  DocTipo,
  Provincia,
  CondicionIva,
} from './constants.js';

// ---------------------------------------------------------------------------
// Base de los SDKs
// ---------------------------------------------------------------------------
export {
  ArcaSdkBase,
  SoapServiceClient,
  createWsaaClient,
  transportOptions,
  parseServerStatus,
  serverStatusOk,
  statusOf,
} from './service.js';
export type {
  ArcaSdkConfig,
  EnvEndpoints,
  ServiceTransport,
  ServiceCallOptions,
  ServiceStatus,
  SoapServiceClientConfig,
} from './service.js';
