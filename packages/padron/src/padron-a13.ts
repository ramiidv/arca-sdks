import { ArcaValidationError, validateCuit } from '@ramiidv/arca-common';
import type { CallOptions } from '@ramiidv/arca-common';
import {
  optNumber as num,
  optString as str,
  records as list,
  reqString,
  requirePersona,
  strings,
  tipoPersona,
  type SoapRecord as R,
} from './mapping.js';
import { BasePadronClient, type PadronClientConfig } from './base-client.js';
import type { DomicilioA13, PersonaA13, WsAuth } from './types.js';

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
    return mapPersonaA13(requirePersona(result, 'getPersona'));
  }

  /**
   * Datos de un contribuyente por CUIT, aunque la clave esté INACTIVA
   * (`getPersonaV2`, agregado en el manual v1.4).
   */
  async getPersonaV2(auth: WsAuth, cuit: string | number, opts?: CallOptions): Promise<PersonaA13> {
    const idPersona = validateCuit(cuit);
    const result = await this.call('getPersonaV2', { ...this.authParams(auth), idPersona }, opts);
    return mapPersonaA13(requirePersona(result, 'getPersonaV2'));
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
    return strings(result['idPersona']);
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

function mapDomicilio(d: R): DomicilioA13 {
  return {
    direccion: str(d['direccion']),
    calle: str(d['calle']),
    numero: num(d['numero']),
    piso: str(d['piso']),
    oficinaDptoLocal: str(d['oficinaDptoLocal']),
    sector: str(d['sector']),
    torre: str(d['torre']),
    manzana: str(d['manzana']),
    codigoPostal: str(d['codigoPostal']),
    localidad: str(d['localidad']),
    idProvincia: num(d['idProvincia']),
    descripcionProvincia: str(d['descripcionProvincia']),
    tipoDomicilio: str(d['tipoDomicilio']),
    estadoDomicilio: str(d['estadoDomicilio']),
    datoAdicional: str(d['datoAdicional']),
    tipoDatoAdicional: str(d['tipoDatoAdicional']),
  };
}

/** Mapea `persona` de A13 (`getPersona` y `getPersonaV2`). */
export function mapPersonaA13(raw: R): PersonaA13 {
  const persona: PersonaA13 = {
    idPersona: reqString(raw['idPersona'], 'persona.idPersona'),
    tipoPersona: tipoPersona(raw['tipoPersona']),
    tipoClave: str(raw['tipoClave']),
    estadoClave: str(raw['estadoClave']),
    nombre: str(raw['nombre']),
    apellido: str(raw['apellido']),
    razonSocial: str(raw['razonSocial']),
    numeroDocumento: str(raw['numeroDocumento']),
    tipoDocumento: str(raw['tipoDocumento']),
    formaJuridica: str(raw['formaJuridica']),
    mesCierre: num(raw['mesCierre']),
    fechaNacimiento: str(raw['fechaNacimiento']),
    fechaFallecimiento: str(raw['fechaFallecimiento']),
    fechaContratoSocial: str(raw['fechaContratoSocial']),
    idActividadPrincipal: str(raw['idActividadPrincipal']),
    descripcionActividadPrincipal: str(raw['descripcionActividadPrincipal']),
    periodoActividadPrincipal: num(raw['periodoActividadPrincipal']),
  };
  if (raw['claveInactivaAsociada'] !== undefined) persona.claveInactivaAsociada = strings(raw['claveInactivaAsociada']);
  if (raw['domicilio'] !== undefined) persona.domicilio = list(raw['domicilio']).map(mapDomicilio);
  return persona;
}
