import { SoapServiceClient, parseServerStatus, validateCuit } from '@ramiidv/arca-common';
import type { CallOptions, ServerStatus, ServiceClientConfig } from '@ramiidv/arca-common';
import { toPadronError } from './errors.js';
import type { WsAuth } from './types.js';

/**
 * Configuración de los clientes de bajo nivel de Padrón (`ServiceClientConfig`
 * de arca-common): `{ endpoint, transport? }`. El namespace lo fija cada cliente.
 */
export type PadronClientConfig = ServiceClientConfig;

/**
 * Base de los clientes de Padrón.
 *
 * Los WS de Padrón declaran los parámetros sin namespace
 * (`elementFormDefault="unqualified"`) y `soapAction=""`: `arcaSoapCall` de
 * arca-common prefija el método y deja los parámetros sin namespace. Todas las
 * operaciones son consultas: se reintentan ante errores transitorios (nunca
 * ante un SOAP Fault). Los Faults de negocio conocidos (CUIT inexistente,
 * clave inactiva, token no autorizado...) se lanzan como `ArcaPadronServiceError`.
 *
 * Las respuestas se parsean con `parseNumbers: false`: todos los valores llegan
 * como string tal cual los envía ARCA, y los schemas de cada servicio (DSL de
 * `@ramiidv/arca-common/schema`, ver `mapping.ts`) convierten los campos
 * numéricos del WSDL. Así los `xs:string`
 * con contenido numérico (`datoAdicional`, `codPostal`, `piso`, los campos del
 * A100...) no pierden ceros ni decimales (`"10.50"`, `"1E3"`).
 */
export abstract class BasePadronClient extends SoapServiceClient {
  /**
   * @param config - `endpoint` y `transport` opcional (ver `ENDPOINTS`).
   * @param namespace - Namespace del WSDL del servicio (ver `NAMESPACES`): lo pasa cada subclase.
   */
  protected constructor(config: PadronClientConfig, namespace: string) {
    super({ endpoint: config.endpoint, transport: config.transport, namespace });
  }

  /** Llama a un método del servicio y traduce los Faults de negocio. */
  protected async call(
    method: string,
    params: Record<string, unknown>,
    opts?: CallOptions,
  ): Promise<Record<string, unknown>> {
    try {
      return await this.soapCall(method, params, { parseNumbers: false, signal: opts?.signal });
    } catch (err) {
      throw toPadronError(err, method);
    }
  }

  /** Parámetros de autenticación en el orden del WSDL: token, sign, cuitRepresentada. */
  protected authParams(auth: WsAuth): Record<string, unknown> {
    return {
      token: auth.token,
      sign: auth.sign,
      cuitRepresentada: validateCuit(auth.cuitRepresentada),
    };
  }

  /**
   * Estado del servicio (`dummy`, sin autenticación). Devuelve lo que informa ARCA
   * (`appserver`, `dbserver`, `authserver`): verificá con `serverStatusOk` que estén en `OK`.
   */
  async dummy(opts?: CallOptions): Promise<ServerStatus> {
    return parseServerStatus(await this.call('dummy', {}, opts));
  }
}
