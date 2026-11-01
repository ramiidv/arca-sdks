import type { AccessTicket, CallOptions, SoapCallOptions } from '@ramiidv/arca-common';

/**
 * Contexto que `ArcaAgro` le pasa a cada sub-cliente.
 * @internal
 */
export interface ServiceContext {
  readonly endpoint: string;
  /** CUIT representada, normalizada a 11 dígitos. */
  readonly cuit: string;
  readonly getTicket: (opts?: CallOptions) => Promise<AccessTicket>;
  readonly soap: Pick<SoapCallOptions, 'timeout' | 'retries' | 'retryDelayMs' | 'onEvent' | 'fetch' | 'legacyTls'>;
}
