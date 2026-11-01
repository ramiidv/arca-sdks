import { validateCuit } from '@ramiidv/arca-common';
import type { CallOptions } from '@ramiidv/arca-common';
import { Dependencia, Domicilio, decodePersona, id, list, must, obj, str, type Schema } from './mapping.js';
import { BasePadronClient, type PadronClientConfig } from './base-client.js';
import type { PersonaA10, WsAuth } from './types.js';

export type PadronA10ClientConfig = PadronClientConfig;

/**
 * Client for ws_sr_padron_a10 - Datos básicos de un contribuyente.
 */
export class PadronA10Client extends BasePadronClient {
  /**
   * Datos básicos de un contribuyente.
   * @param auth - Authentication object with Token, Sign, and CuitRepresentada
   * @param cuit - CUIT/CUIL a consultar (con o sin guiones; se valida el dígito verificador)
   * @param opts - Opciones por llamada (signal)
   * @throws ArcaPadronServiceError si ARCA informa la CUIT inexistente, inactiva, etc.
   */
  async getPersona(auth: WsAuth, cuit: string | number, opts?: CallOptions): Promise<PersonaA10> {
    const idPersona = validateCuit(cuit);
    const result = await this.call('getPersona', { ...this.authParams(auth), idPersona }, opts);
    return decodePersona<PersonaA10>(result, PersonaA10Schema, 'getPersona');
  }
}

/**
 * `persona` de A10 (WSDL personaServiceA10, orden del WSDL). Todos los
 * elementos son `minOccurs="0"`; los `must()` son los que el SDK exige.
 */
export const PersonaA10Schema: Schema = {
  apellido: str(),
  claveInactivaAsociada: list(id()),
  dependencia: obj(Dependencia),
  descripcionActividadPrincipal: str(),
  domicilio: list(obj(Domicilio)),
  estadoClave: str(),
  idActividadPrincipal: id(),
  idPersona: must(id()),
  nombre: str(),
  numeroDocumento: str(),
  razonSocial: str(),
  tipoClave: str(),
  tipoDocumento: str(),
  tipoPersona: must(str({ minLen: 1 })),
};
