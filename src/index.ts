// Cliente de alto nivel
export { ArcaMtxca } from './arca-mtxca.js';

// Cliente de bajo nivel
export { MtxcaClient } from './mtxca-client.js';
export type { MtxcaClientConfig } from './mtxca-client.js';

// Errores (de common)
export {
  ArcaError,
  ArcaAuthError,
  ArcaSoapError,
  ArcaServiceError,
  ArcaValidationError,
  ArcaTicketVigenteError,
} from '@ramiidv/arca-common';
export type { ServiceErrorDetail, ValidationErrorDetail } from '@ramiidv/arca-common';

// WSAA y storage de tickets (de common)
export { WsaaClient, MemoryTicketStorage, FileTicketStorage } from '@ramiidv/arca-common';
export type { WsaaClientConfig } from '@ramiidv/arca-common';

// Tipos
export type {
  ArcaMtxcaConfig,
  MtxcaAuth,
  FechaInput,
  MtxcaItem,
  MtxcaSubtotalIVA,
  MtxcaOtroTributo,
  MtxcaComprobanteAsociado,
  MtxcaPeriodo,
  MtxcaDatoAdicional,
  MtxcaComprador,
  MtxcaComprobanteBase,
  MtxcaComprobanteCAE,
  MtxcaComprobanteCAEA,
  AutorizarRequest,
  AutorizarOptions,
  CodigoDescripcion,
  CodigoDescripcionString,
  MtxcaResultado,
  MtxcaComprobanteCAEResponse,
  MtxcaAutorizarResult,
  MtxcaComprobanteCAEAResponse,
  MtxcaInformarCAEAResult,
  MtxcaCAEA,
  MtxcaCAEANoUtilizadoResult,
  MtxcaItemConsultado,
  MtxcaComprobanteConsultado,
  MtxcaConsultaComprobanteResult,
  PuntoVenta,
  ActividadVigente,
  CotizacionResult,
  AccessTicket,
  ArcaEvent,
  CallOptions,
  LegacyTlsMode,
  ServerStatus,
  TicketStorage,
} from './types.js';

// Constantes
export {
  MTXCA_ENDPOINTS,
  MTXCA_NAMESPACE,
  MTXCA_SERVICE_ID,
  ALICUOTAS_IVA,
  CbteTipo,
  Concepto,
  CodigoCondicionIVA,
  UnidadMedidaEspecial,
  Moneda,
} from './constants.js';

// Validación y redondeo
export { validateComprobanteCAE, validateComprobanteCAEA } from './validation.js';
export { roundImporte, roundDecimal } from './format.js';
