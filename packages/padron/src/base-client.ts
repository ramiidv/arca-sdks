import { afipSoapCall, validateCuit } from '@ramiidv/arca-common';
import type {
  ArcaEvent,
  CallOptions,
  ServerStatus,
  SoapCallOptions,
} from '@ramiidv/arca-common';
import { toPadronError } from './errors.js';
import { reqString } from './mapping.js';
import type { WsAuth } from './types.js';

/** Opciones de transporte que se pasan a cada llamada SOAP. */
export type PadronSoapOptions = Pick<SoapCallOptions, 'timeout' | 'retries' | 'retryDelayMs' | 'fetch' | 'legacyTls'>;

/** Shared configuration for all Padrón service clients. */
export interface PadronClientConfig {
  /** SOAP endpoint URL */
  endpoint: string;
  /** SOAP namespace */
  namespace: string;
  /** Opciones de transporte (timeout, reintentos, fetch, TLS legacy) */
  soapOptions?: PadronSoapOptions;
  /** Optional event callback */
  onEvent?: (event: ArcaEvent) => void;
}

/**
 * Base de los clientes de Padrón.
 *
 * Los WS de Padrón declaran los parámetros sin namespace
 * (`elementFormDefault="unqualified"`) y `soapAction=""`: `afipSoapCall` de
 * arca-common prefija el método y deja los parámetros sin namespace. Todas las
 * operaciones son consultas: se reintentan ante errores transitorios (nunca
 * ante un SOAP Fault). Los Faults de negocio conocidos (CUIT inexistente,
 * clave inactiva, token no autorizado...) se lanzan como `ArcaPadronServiceError`.
 *
 * Las respuestas se parsean con `parseNumbers: false`: todos los valores llegan
 * como string tal cual los envía ARCA, y `mapping.ts` convierte explícitamente
 * los campos numéricos del WSDL (`optNumber`/`reqNumber`). Así los `xs:string`
 * con contenido numérico (`datoAdicional`, `codPostal`, `piso`, los campos del
 * A100...) no pierden ceros ni decimales (`"10.50"`, `"1E3"`).
 */
export abstract class BasePadronClient {
  protected readonly endpoint: string;
  protected readonly namespace: string;
  protected readonly soapOptions?: PadronSoapOptions;
  protected readonly onEvent?: (event: ArcaEvent) => void;

  constructor(config: PadronClientConfig) {
    this.endpoint = config.endpoint;
    this.namespace = config.namespace;
    this.soapOptions = config.soapOptions;
    this.onEvent = config.onEvent;
  }

  /** Llama a un método del servicio y traduce los Faults de negocio. */
  protected async call(
    method: string,
    params: Record<string, unknown>,
    opts?: CallOptions,
  ): Promise<Record<string, unknown>> {
    try {
      return await afipSoapCall(this.endpoint, this.namespace, method, params, {
        ...this.soapOptions,
        parseNumbers: false,
        kind: 'consulta',
        onEvent: this.onEvent,
        signal: opts?.signal,
      });
    } catch (err) {
      throw toPadronError(err, method);
    }
  }

  /** Parámetros de autenticación en el orden del WSDL: token, sign, cuitRepresentada. */
  protected authParams(auth: WsAuth): Record<string, unknown> {
    return {
      token: auth.Token,
      sign: auth.Sign,
      cuitRepresentada: validateCuit(auth.CuitRepresentada),
    };
  }

  /** Health check for this service. */
  async dummy(opts?: CallOptions): Promise<ServerStatus> {
    const result = await this.call('dummy', {}, opts);
    return {
      appserver: reqString(result['appserver'], 'dummy.appserver'),
      dbserver: reqString(result['dbserver'], 'dummy.dbserver'),
      authserver: reqString(result['authserver'], 'dummy.authserver'),
    };
  }
}
