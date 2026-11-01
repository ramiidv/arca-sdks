import { validateCuit } from '@ramiidv/arca-common';
import type { CallOptions } from '@ramiidv/arca-common';
import { Dependencia, dec, decodePersona, id, int, list, must, obj, str, type Schema } from './mapping.js';
import { BasePadronClient, type PadronClientConfig } from './base-client.js';
import type { PersonaA4, WsAuth } from './types.js';

export type PadronA4ClientConfig = PadronClientConfig;

/**
 * Client for ws_sr_padron_a4 - Datos completos de un contribuyente.
 */
export class PadronA4Client extends BasePadronClient {
  /**
   * Datos completos de un contribuyente.
   * @param auth - Authentication object with Token, Sign, and CuitRepresentada
   * @param cuit - CUIT/CUIL a consultar (con o sin guiones; se valida el dígito verificador)
   * @param opts - Opciones por llamada (signal)
   * @throws ArcaPadronServiceError si ARCA informa la CUIT inexistente, inactiva, etc.
   */
  async getPersona(auth: WsAuth, cuit: string | number, opts?: CallOptions): Promise<PersonaA4> {
    const idPersona = validateCuit(cuit);
    const result = await this.call('getPersona', { ...this.authParams(auth), idPersona }, opts);
    return decodePersona<PersonaA4>(result, PersonaA4Schema, 'getPersona');
  }
}

// ---------------------------------------------------------------------------
// Schemas de la respuesta (WSDL personaServiceA4, orden del WSDL). Todos los
// elementos son `minOccurs="0"`; los `must()` son los que el SDK exige.
// ---------------------------------------------------------------------------

const Actividad: Schema = {
  descripcionActividad: str(),
  idActividad: must(id()),
  nomenclador: int(),
  orden: int(),
  periodo: int(),
};

const Categoria: Schema = {
  descripcionCategoria: str(),
  estado: str(),
  idCategoria: must(int()),
  idImpuesto: int(),
  periodo: int(),
};

const Domicilio: Schema = {
  codPostal: str(),
  datoAdicional: str(),
  descripcionProvincia: str(),
  direccion: str(),
  idProvincia: int(),
  localidad: str(),
  orden: int(),
  tipoDatoAdicional: str(),
  tipoDomicilio: str(),
};

const Email: Schema = {
  direccion: must(str({ minLen: 1 })),
  estado: str(),
  tipoEmail: str(),
};

const Impuesto: Schema = {
  descripcionImpuesto: str(),
  diaPeriodo: int(),
  /** Manual A4 §5.3: ACTIVO, ACTIVO EN TRAMITE, BAJA PROVISORIA, BAJA DEFINITIVA, EXENTO, EXENTO EN TRAMITE, NO APORTANTE. */
  estado: str(),
  ffInscripcion: str(),
  idImpuesto: must(int()),
  periodo: int(),
};

const Regimen: Schema = {
  descripcionRegimen: str(),
  diaPeriodo: int(),
  estado: str(),
  idImpuesto: int(),
  idRegimen: must(int()),
  periodo: int(),
  tipoRegimen: str(),
};

const Relacion: Schema = {
  ffRelacion: str(),
  ffVencimiento: str(),
  idPersona: must(id()),
  idPersonaAsociada: id(),
  subtipoRelacion: str(),
  tipoRelacion: str(),
};

const Telefono: Schema = {
  numero: must(id()),
  tipoLinea: str(),
  tipoTelefono: str(),
};

/** `persona` de A4 (estructura plana). */
export const PersonaA4Schema: Schema = {
  actividad: list(obj(Actividad)),
  apellido: str(),
  cantidadSociosEmpresaMono: int(),
  categoria: list(obj(Categoria)),
  claveInactivaAsociada: list(id()),
  dependencia: obj(Dependencia),
  domicilio: list(obj(Domicilio)),
  email: list(obj(Email)),
  estadoClave: str(),
  fechaContratoSocial: str(),
  fechaFallecimiento: str(),
  fechaInscripcion: str(),
  fechaJubilado: str(),
  fechaNacimiento: str(),
  fechaVencimientoMigracion: str(),
  formaJuridica: str(),
  idPersona: must(id()),
  impuesto: list(obj(Impuesto)),
  leyJubilacion: int(),
  localidadInscripcion: str(),
  mesCierre: int(),
  nombre: str(),
  numeroDocumento: str(),
  numeroInscripcion: str(),
  organismoInscripcion: str(),
  organismoOriginante: str(),
  /** `xs:double` */
  porcentajeCapitalNacional: dec(2),
  provinciaInscripcion: str(),
  razonSocial: str(),
  regimen: list(obj(Regimen)),
  relacion: list(obj(Relacion)),
  sexo: str(),
  telefono: list(obj(Telefono)),
  tipoClave: str(),
  tipoDocumento: str(),
  tipoOrganismoOriginante: str(),
  tipoPersona: must(str({ minLen: 1 })),
  tipoResidencia: str(),
};
