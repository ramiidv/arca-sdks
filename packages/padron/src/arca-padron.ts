import { ArcaSdkBase, statusOf } from '@ramiidv/arca-common';
import type { CallOptions } from '@ramiidv/arca-common';
import { ENDPOINTS } from './constants.js';
import { PadronA4Client } from './padron-a4.js';
import { PadronA5Client } from './padron-a5.js';
import { PadronA10Client } from './padron-a10.js';
import { PadronA13Client } from './padron-a13.js';
import { PadronA100Client } from './padron-a100.js';
import type {
  ArcaPadronConfig,
  ListaPadron,
  PadronServicio,
  PadronStatus,
  ParameterRecord,
  PersonaA4,
  PersonaA5,
  PersonaA10,
  PersonaA13,
  WsAuth,
} from './types.js';

/**
 * Cliente de alto nivel de los web services de Padrón de ARCA.
 *
 * Maneja la autenticación WSAA automáticamente y expone la Constancia de
 * Inscripción (ex A5), A4 (datos completos), A10 y A13 (datos básicos) y A100
 * (tablas de parámetros).
 *
 * @example
 * ```ts
 * import { ArcaPadron, condicionIvaDesdePadron, FileTicketStorage } from '@ramiidv/arca-padron';
 * import { readFileSync } from 'fs';
 *
 * const client = new ArcaPadron({
 *   cert: readFileSync('cert.pem', 'utf-8'),
 *   key: readFileSync('key.pem', 'utf-8'),
 *   cuit: '20123456789',
 *   production: false,
 *   ticketStorage: new FileTicketStorage('./.arca-tickets'),
 * });
 *
 * const persona = await client.getConstanciaInscripcion('30712345674');
 * const { condicionIva, motivo } = condicionIvaDesdePadron(persona);
 * ```
 */
export class ArcaPadron extends ArcaSdkBase<PadronServicio> {
  /** Cliente de bajo nivel de la Constancia de Inscripción (ex Padrón A5). */
  public readonly a5: PadronA5Client;
  /** Cliente de bajo nivel de Padrón A4. */
  public readonly a4: PadronA4Client;
  /** Cliente de bajo nivel de Padrón A10. */
  public readonly a10: PadronA10Client;
  /** Cliente de bajo nivel de Padrón A13. */
  public readonly a13: PadronA13Client;
  /** Cliente de bajo nivel de Padrón A100. */
  public readonly a100: PadronA100Client;

  /** @throws ArcaValidationError si la CUIT representada es inválida. */
  constructor(config: ArcaPadronConfig) {
    super(config, {
      a5: ENDPOINTS.a5.serviceId,
      a4: ENDPOINTS.a4.serviceId,
      a10: ENDPOINTS.a10.serviceId,
      a13: ENDPOINTS.a13.serviceId,
      a100: ENDPOINTS.a100.serviceId,
    });

    const { onEvent, ...soapOptions } = this.transport;
    const clientConfig = (svc: PadronServicio) => ({
      endpoint: this.endpoint(ENDPOINTS[svc], config.endpoints?.[svc]),
      namespace: ENDPOINTS[svc].namespace,
      soapOptions,
      onEvent,
    });

    this.a5 = new PadronA5Client(clientConfig('a5'));
    this.a4 = new PadronA4Client(clientConfig('a4'));
    this.a10 = new PadronA10Client(clientConfig('a10'));
    this.a13 = new PadronA13Client(clientConfig('a13'));
    this.a100 = new PadronA100Client(clientConfig('a100'));
  }

  /**
   * Constancia de inscripción (ws_sr_constancia_inscripcion, ex Padrón A5,
   * `getPersona_v2`): datos generales, domicilio fiscal, impuestos del régimen
   * general y monotributo. Combinar con `condicionIvaDesdePadron` para facturar.
   *
   * Si ARCA no puede emitir la constancia (o una parte), la persona vuelve con
   * `errorConstancia` / `errorRegimenGeneral` / `errorMonotributo` (no se lanza).
   * @param cuit - CUIT a consultar (con o sin guiones)
   * @throws ArcaValidationError si la CUIT es inválida (dígito verificador)
   * @throws ArcaPadronServiceError si la CUIT no existe (`reason: 'inexistente'`, sea por
   *   Fault o por `errorConstancia` "No existe persona con ese Id"), o ante otros errores
   *   de negocio (clave inactiva, token no autorizado...).
   */
  async getConstanciaInscripcion(cuit: string | number, call?: CallOptions): Promise<PersonaA5> {
    const opts = this.callOptions(call);
    const auth = await this.getAuth('a5', call);
    return this.a5.getPersona(auth, cuit, opts);
  }

  /**
   * Constancias de inscripción de hasta 250 CUITs en una llamada
   * (`getPersonaList_v2`), en el orden de `cuits`. Los problemas de una CUIT no
   * hacen fallar la consulta: vuelven en su `errorConstancia` (inexistente: "No
   * existe persona con ese Id"; CUIT inválida: no se envía a ARCA).
   * @throws ArcaValidationError si `cuits` no tiene entre 1 y 250 elementos.
   */
  async getConstanciasInscripcion(cuits: Array<string | number>, call?: CallOptions): Promise<ListaPadron<PersonaA5>> {
    const opts = this.callOptions(call);
    const auth = await this.getAuth('a5', call);
    return this.a5.getPersonaList(auth, cuits, opts);
  }

  /**
   * Datos completos de un contribuyente (Padrón A4).
   * @param cuit - CUIT/CUIL a consultar (con o sin guiones)
   */
  async getPersona(cuit: string | number, call?: CallOptions): Promise<PersonaA4> {
    const opts = this.callOptions(call);
    const auth = await this.getAuth('a4', call);
    return this.a4.getPersona(auth, cuit, opts);
  }

  /**
   * Datos básicos de un contribuyente (Padrón A10).
   * @param cuit - CUIT/CUIL a consultar (con o sin guiones)
   */
  async getPersonaBasic(cuit: string | number, call?: CallOptions): Promise<PersonaA10> {
    const opts = this.callOptions(call);
    const auth = await this.getAuth('a10', call);
    return this.a10.getPersona(auth, cuit, opts);
  }

  /**
   * Datos básicos de un contribuyente (Padrón A13, `getPersona`). Con la clave
   * inactiva ARCA responde con error (`reason: 'inactiva'`): ver `getPersonaA13V2`.
   * @param cuit - CUIT/CUIL a consultar (con o sin guiones)
   */
  async getPersonaA13(cuit: string | number, call?: CallOptions): Promise<PersonaA13> {
    const opts = this.callOptions(call);
    const auth = await this.getAuth('a13', call);
    return this.a13.getPersona(auth, cuit, opts);
  }

  /**
   * Datos básicos de un contribuyente (Padrón A13, `getPersonaV2`): responde
   * también si la clave está INACTIVA (manual A13 v1.4).
   */
  async getPersonaA13V2(cuit: string | number, call?: CallOptions): Promise<PersonaA13> {
    const opts = this.callOptions(call);
    const auth = await this.getAuth('a13', call);
    return this.a13.getPersonaV2(auth, cuit, opts);
  }

  /**
   * CUITs/CUILs asociados a un número de documento (Padrón A13).
   * @param documento - Número de documento (DNI); se aceptan puntos y espacios
   */
  async getIdPersonaListByDocumento(documento: string | number, call?: CallOptions): Promise<ListaPadron<string>> {
    const opts = this.callOptions(call);
    const auth = await this.getAuth('a13', call);
    return this.a13.getIdPersonaListByDocumento(auth, documento, opts);
  }

  /**
   * Tabla de parámetros (Padrón A100) por nombre de colección.
   * @param collection - Nombre de la colección (ej: CollectionName.PROVINCIA)
   */
  async getParametros(collection: string, call?: CallOptions): Promise<ListaPadron<ParameterRecord>> {
    const opts = this.callOptions(call);
    const auth = await this.getAuth('a100', call);
    return this.a100.getParameterCollectionByName(auth, collection, opts);
  }

  /**
   * Estado de los servicios de Padrón (`dummy`, sin autenticación). Consulta
   * todos en paralelo y devuelve el resultado de cada uno por separado: un
   * servicio caído no oculta el estado de los demás. `ok` es `true` solo si el
   * servicio respondió y sus tres servidores (`appserver`, `dbserver`,
   * `authserver`) están en `OK`; si respondió con alguno en otro estado, `ok`
   * es `false` y `status` tiene lo que informó ARCA.
   *
   * @example
   * ```ts
   * const s = await padron.status();
   * if (s.a4.ok) console.log('A4 disponible');
   * else console.error(s.a4.error, s.a4.status);
   * ```
   */
  status(call?: CallOptions): Promise<PadronStatus> {
    const opts = this.callOptions(call);
    return statusOf({
      a5: () => this.a5.dummy(opts),
      a4: () => this.a4.dummy(opts),
      a10: () => this.a10.dummy(opts),
      a13: () => this.a13.dummy(opts),
      a100: () => this.a100.dummy(opts),
    });
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async getAuth(service: PadronServicio, call?: CallOptions): Promise<WsAuth> {
    const ticket = await this.ticket(service, call);
    return {
      token: ticket.token,
      sign: ticket.sign,
      cuitRepresentada: this.cuit,
    };
  }
}
