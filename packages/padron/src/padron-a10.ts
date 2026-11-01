import { validateCuit } from '@ramiidv/arca-common';
import type { CallOptions } from '@ramiidv/arca-common';
import {
  asignarDependenciaYClaves,
  mapDomicilio,
  mapPersonaComun,
  optString as str,
  records as list,
  requirePersona,
  type SoapRecord as R,
} from './mapping.js';
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
    return mapPersonaA10(requirePersona(result, 'getPersona'));
  }
}

/** Mapea `persona` de A10 (WSDL personaServiceA10). */
export function mapPersonaA10(raw: R): PersonaA10 {
  const persona: PersonaA10 = {
    ...mapPersonaComun(raw),
    idActividadPrincipal: str(raw['idActividadPrincipal']),
    descripcionActividadPrincipal: str(raw['descripcionActividadPrincipal']),
  };
  asignarDependenciaYClaves(persona, raw);
  if (raw['domicilio'] !== undefined) persona.domicilio = list(raw['domicilio']).map(mapDomicilio);
  return persona;
}
