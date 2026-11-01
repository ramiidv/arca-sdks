import type { AccessTicket, CallOptions, ServiceTransport } from '@ramiidv/arca-common';

/**
 * Contexto que `ArcaAgro` le pasa a cada sub-cliente.
 * @internal
 */
export interface ServiceContext {
  readonly endpoint: string;
  /** CUIT representada, normalizada a 11 dígitos. */
  readonly cuit: string;
  readonly transport: ServiceTransport;
  /** Ticket de acceso del servicio (ya combina el `signal` global). */
  readonly getTicket: (opts?: CallOptions) => Promise<AccessTicket>;
  /** Combina el `signal` global de `ArcaAgro` con el de la llamada. */
  readonly callOptions: (opts?: CallOptions) => CallOptions;
}
