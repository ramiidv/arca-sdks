// Main class
export { ArcaPadron } from './arca-padron.js';

// Helpers puros
export { condicionIvaDesdePadron } from './condicion-iva.js';

// Persistencia de tickets (desde arca-common)
export { MemoryTicketStorage, FileTicketStorage } from '@ramiidv/arca-common';

// Error classes
export {
  ArcaError,
  ArcaAuthError,
  ArcaTicketVigenteError,
  ArcaSoapError,
  ArcaServiceError,
  ArcaResponseError,
  ArcaValidationError,
} from '@ramiidv/arca-common';
export { ArcaPadronError, ArcaPadronServiceError, type PadronErrorReason } from './errors.js';

// Base class
export { BasePadronClient, type PadronClientConfig } from './base-client.js';

// Low-level clients
export { WsaaClient } from '@ramiidv/arca-common';
export type { WsaaClientConfig } from '@ramiidv/arca-common';
export { PadronA5Client, MAX_PERSONA_LIST, type PadronA5ClientConfig } from './padron-a5.js';
export { PadronA4Client, type PadronA4ClientConfig } from './padron-a4.js';
export { PadronA13Client, type PadronA13ClientConfig } from './padron-a13.js';
export { PadronA10Client, type PadronA10ClientConfig } from './padron-a10.js';
export { PadronA100Client, type PadronA100ClientConfig } from './padron-a100.js';

// Types
export type {
  ArcaPadronConfig,
  PadronServicio,
  PadronStatus,
  AccessTicket,
  TicketStorage,
  CallOptions,
  WsAuth,
  ServerStatus,
  ServiceClientConfig,
  ServiceEndpoints,
  ServiceTransport,
  ArcaEvent,
  PersonaA4,
  DependenciaA4,
  DomicilioA4,
  ImpuestoA4,
  ActividadA4,
  RegimenA4,
  RelacionA4,
  CategoriaA4,
  EmailA4,
  TelefonoA4,
  PersonaA10,
  DependenciaA10,
  DomicilioA10,
  ParameterRecord,
  ParameterAttribute,
  PadronMetadata,
  ListaPadron,
  TipoPersonaPadron,
  PersonaA13,
  DomicilioA13,
  PersonaA5,
  DomicilioA5,
  DependenciaA5,
  CaracterizacionA5,
  ComponenteSociedadA5,
  ImpuestoA5,
  ActividadA5,
  CategoriaA5,
  RegimenA5,
  RegimenGeneralA5,
  MonotributoA5,
  ErrorConstanciaA5,
  ErrorRegimenA5,
  CondicionIvaPadron,
} from './types.js';

// Constants and enums
export {
  ENDPOINTS,
  NAMESPACES,
  SERVICE_IDS,
  Provincia,
  DocTipo,
  CondicionIva,
  TipoDomicilio,
  TipoPersona,
  ImpuestoId,
  EstadoClave,
  CollectionName,
} from './constants.js';
