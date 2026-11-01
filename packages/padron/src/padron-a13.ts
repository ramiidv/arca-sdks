import { ArcaValidationError, validateCuit } from '@ramiidv/arca-common';
import type { CallOptions } from '@ramiidv/arca-common';
import { decode, decodePersona, id, int, list, must, obj, str, type Schema } from './mapping.js';
import { BasePadronClient, type PadronClientConfig } from './base-client.js';
import type { PersonaA13, WsAuth } from './types.js';

export type PadronA13ClientConfig = PadronClientConfig;

/**
 * Client for ws_sr_padron_a13 - Datos básicos de un contribuyente (manual v1.4).
 */
export class PadronA13Client extends BasePadronClient {
  /**
   * Datos de un contribuyente por CUIT (`getPersona`). Si la clave está
   * inactiva, ARCA responde con error (`reason: 'inactiva'`): usá `getPersonaV2`.
   * @param auth - Authentication object with Token, Sign, and CuitRepresentada
   * @param cuit - CUIT/CUIL a consultar (con o sin guiones)
   * @param opts - Opciones por llamada (signal)
   */
  async getPersona(auth: WsAuth, cuit: string | number, opts?: CallOptions): Promise<PersonaA13> {
    const idPersona = validateCuit(cuit);
    const result = await this.call('getPersona', { ...this.authParams(auth), idPersona }, opts);
    return decodePersona<PersonaA13>(result, PersonaA13Schema, 'getPersona');
  }

  /**
   * Datos de un contribuyente por CUIT, aunque la clave esté INACTIVA
   * (`getPersonaV2`, agregado en el manual v1.4).
   */
  async getPersonaV2(auth: WsAuth, cuit: string | number, opts?: CallOptions): Promise<PersonaA13> {
    const idPersona = validateCuit(cuit);
    const result = await this.call('getPersonaV2', { ...this.authParams(auth), idPersona }, opts);
    return decodePersona<PersonaA13>(result, PersonaA13Schema, 'getPersonaV2');
  }

  /**
   * CUITs/CUILs asociados a un número de documento. Devuelve `[]` si ARCA
   * responde sin claves.
   * @param documento - Número de documento (se aceptan puntos y espacios: "11.709.676")
   */
  async getIdPersonaListByDocumento(auth: WsAuth, documento: string | number, opts?: CallOptions): Promise<string[]> {
    const result = await this.call(
      'getIdPersonaListByDocumento',
      { ...this.authParams(auth), documento: normalizarDocumento(documento) },
      opts,
    );
    return (
      decode<{ idPersona?: string[] }>(result, IdPersonaListReturn, 'getIdPersonaListByDocumento.idPersonaListReturn')
        .idPersona ?? []
    );
  }
}

/** Normaliza un número de documento: sin puntos, espacios ni guiones; solo dígitos (1 a 11). */
export function normalizarDocumento(documento: string | number): string {
  const normalized = String(documento).replace(/[.\s-]/g, '');
  if (!/^\d{1,11}$/.test(normalized)) {
    throw new ArcaValidationError(
      `Documento inválido: "${documento}". Debe ser numérico.`,
      [{ field: 'documento', message: 'El documento debe tener entre 1 y 11 dígitos', value: documento }],
      'documento',
    );
  }
  return normalized;
}

// ---------------------------------------------------------------------------
// Schemas de la respuesta (WSDL personaServiceA13, orden del WSDL). Todos los
// elementos son `minOccurs="0"`; los `must()` son los que el SDK exige.
// ---------------------------------------------------------------------------

const Domicilio: Schema = {
  calle: str(),
  codigoPostal: str(),
  datoAdicional: str(),
  descripcionProvincia: str(),
  direccion: str(),
  estadoDomicilio: str(),
  idProvincia: int(),
  localidad: str(),
  manzana: str(),
  numero: int(),
  oficinaDptoLocal: str(),
  piso: str(),
  sector: str(),
  tipoDatoAdicional: str(),
  tipoDomicilio: str(),
  torre: str(),
};

/** `persona` de A13 (`getPersona` y `getPersonaV2`). */
export const PersonaA13Schema: Schema = {
  apellido: str(),
  claveInactivaAsociada: list(id()),
  descripcionActividadPrincipal: str(),
  domicilio: list(obj(Domicilio)),
  estadoClave: str(),
  fechaContratoSocial: str(),
  fechaFallecimiento: str(),
  fechaNacimiento: str(),
  formaJuridica: str(),
  idActividadPrincipal: id(),
  idPersona: must(id()),
  mesCierre: int(),
  nombre: str(),
  numeroDocumento: str(),
  periodoActividadPrincipal: int(),
  razonSocial: str(),
  tipoClave: str(),
  tipoDocumento: str(),
  tipoPersona: must(str({ minLen: 1 })),
};

const IdPersonaListReturn: Schema = {
  idPersona: list(id()),
};
