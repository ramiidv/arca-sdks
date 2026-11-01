import { ArcaValidationError, validateCuit } from '@ramiidv/arca-common';
import type { CallOptions } from '@ramiidv/arca-common';
import { ArcaPadronError } from './errors.js';
import { Domicilio, decode, id, int, list, must, obj, str, type Schema } from './mapping.js';
import { BasePadronClient, type PadronClientConfig } from './base-client.js';
import type {
  ActividadA5,
  CaracterizacionA5,
  CategoriaA5,
  ComponenteSociedadA5,
  DependenciaA5,
  DomicilioA5,
  ErrorRegimenA5,
  ImpuestoA5,
  PersonaA5,
  RegimenA5,
  WsAuth,
} from './types.js';

export type PadronA5ClientConfig = PadronClientConfig;

/** Máximo de claves por `getPersonaList_v2` (manual de constancia v4.1, §3.3). */
export const MAX_PERSONA_LIST = 250;

/**
 * Client for ws_sr_constancia_inscripcion (ex ws_sr_padron_a5, deprecado por
 * ARCA) - Constancia de inscripción: datos generales, domicilio fiscal,
 * impuestos del régimen general y monotributo.
 *
 * Usa `getPersona_v2` y `getPersonaList_v2`, los métodos vigentes según el
 * manual del servicio (v4.1).
 */
export class PadronA5Client extends BasePadronClient {
  /**
   * Constancia de inscripción de un contribuyente (`getPersona_v2`).
   *
   * Si ARCA no puede emitir la constancia, devuelve la persona con
   * `errorConstancia` / `errorRegimenGeneral` / `errorMonotributo`.
   * @param cuit - CUIT a consultar (con o sin guiones; se valida el dígito verificador)
   * @throws ArcaPadronServiceError si ARCA responde con un Fault de negocio (ej: CUIT inexistente)
   */
  async getPersona(auth: WsAuth, cuit: string | number, opts?: CallOptions): Promise<PersonaA5> {
    const idPersona = validateCuit(cuit);
    const result = await this.call('getPersona_v2', { ...this.authParams(auth), idPersona }, opts);
    return mapPersonaA5(decode<PersonaReturn>(result, PersonaReturnSchema, 'getPersona_v2.personaReturn'));
  }

  /**
   * Constancias de hasta 250 contribuyentes en una llamada (`getPersonaList_v2`).
   *
   * Devuelve una persona por cada clave que informa ARCA. Las claves
   * inexistentes vuelven con `errorConstancia` (ej: "No existe persona con ese
   * Id") en lugar de hacer fallar toda la consulta.
   */
  async getPersonaList(auth: WsAuth, cuits: Array<string | number>, opts?: CallOptions): Promise<PersonaA5[]> {
    if (!Array.isArray(cuits) || cuits.length === 0 || cuits.length > MAX_PERSONA_LIST) {
      throw new ArcaValidationError(
        `getPersonaList_v2 acepta entre 1 y ${MAX_PERSONA_LIST} CUITs (recibió ${Array.isArray(cuits) ? cuits.length : 0})`,
        [
          {
            field: 'cuits',
            message: `Entre 1 y ${MAX_PERSONA_LIST} CUITs`,
            value: Array.isArray(cuits) ? cuits.length : cuits,
          },
        ],
        'cuits',
      );
    }
    const idPersona = cuits.map((c) => validateCuit(c));
    const result = await this.call('getPersonaList_v2', { ...this.authParams(auth), idPersona }, opts);
    const { persona } = decode<{ persona?: PersonaReturn[] }>(
      result,
      { persona: list(obj(PersonaReturnSchema)) },
      'getPersonaList_v2.personaListReturn',
    );
    return (persona ?? []).map(mapPersonaA5);
  }
}

// ---------------------------------------------------------------------------
// Schemas de la respuesta (WSDL personaServiceA5, orden del WSDL). Todos los
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
  idCategoria: must(int()),
  idImpuesto: int(),
  periodo: int(),
};

const Impuesto: Schema = {
  descripcionImpuesto: str(),
  estadoImpuesto: str(),
  idImpuesto: must(int()),
  motivo: str(),
  periodo: int(),
};

const ErrorRegimen: Schema = {
  error: list(str()),
  mensaje: str(),
};

const PersonaReturnSchema: Schema = {
  datosGenerales: obj({
    apellido: str(),
    caracterizacion: list(
      obj({
        descripcionCaracterizacion: str(),
        fechaSolicitud: int(),
        idCaracterizacion: must(int()),
        periodo: int(),
      }),
    ),
    dependencia: obj({
      codPostal: str(),
      descripcionDependencia: str(),
      descripcionProvincia: str(),
      direccion: str(),
      idDependencia: int(),
      idProvincia: int(),
      localidad: str(),
    }),
    domicilioFiscal: obj(Domicilio),
    esSucesion: str(),
    estadoClave: str(),
    fechaContratoSocial: str(),
    fechaFallecimiento: str(),
    idPersona: id(),
    mesCierre: int(),
    nombre: str(),
    razonSocial: str(),
    tipoClave: str(),
    tipoPersona: str(),
  }),
  datosMonotributo: obj({
    actividad: list(obj(Actividad)),
    actividadMonotributista: obj(Actividad),
    categoriaMonotributo: obj(Categoria),
    componenteDeSociedad: list(
      obj({
        apellidoPersonaAsociada: str(),
        ffRelacion: str(),
        ffVencimiento: str(),
        idPersonaAsociada: id(),
        nombrePersonaAsociada: str(),
        razonSocialPersonaAsociada: str(),
        tipoComponente: str(),
      }),
    ),
    impuesto: list(obj(Impuesto)),
  }),
  datosRegimenGeneral: obj({
    actividad: list(obj(Actividad)),
    categoriaAutonomo: obj(Categoria),
    impuesto: list(obj(Impuesto)),
    regimen: list(
      obj({
        descripcionRegimen: str(),
        idImpuesto: int(),
        idRegimen: must(int()),
        periodo: int(),
        tipoRegimen: str(),
      }),
    ),
  }),
  errorConstancia: obj({
    apellido: str(),
    error: list(str()),
    idPersona: id(),
    nombre: str(),
  }),
  errorMonotributo: obj(ErrorRegimen),
  errorRegimenGeneral: obj(ErrorRegimen),
};

/** `personaReturn` decodificado (las listas ausentes no aparecen). */
interface PersonaReturn {
  datosGenerales?: {
    apellido?: string;
    caracterizacion?: CaracterizacionA5[];
    dependencia?: DependenciaA5;
    domicilioFiscal?: DomicilioA5;
    esSucesion?: string;
    estadoClave?: string;
    fechaContratoSocial?: string;
    fechaFallecimiento?: string;
    idPersona?: string;
    mesCierre?: number;
    nombre?: string;
    razonSocial?: string;
    tipoClave?: string;
    tipoPersona?: PersonaA5['tipoPersona'];
  };
  datosMonotributo?: {
    actividad?: ActividadA5[];
    actividadMonotributista?: ActividadA5;
    categoriaMonotributo?: CategoriaA5;
    componenteDeSociedad?: ComponenteSociedadA5[];
    impuesto?: ImpuestoA5[];
  };
  datosRegimenGeneral?: {
    actividad?: ActividadA5[];
    categoriaAutonomo?: CategoriaA5;
    impuesto?: ImpuestoA5[];
    regimen?: RegimenA5[];
  };
  errorConstancia?: { apellido?: string; error?: string[]; idPersona?: string; nombre?: string };
  errorMonotributo?: { error?: string[]; mensaje?: string };
  errorRegimenGeneral?: { error?: string[]; mensaje?: string };
}

const errorRegimen = (e: { error?: string[]; mensaje?: string }): ErrorRegimenA5 => ({
  error: e.error ?? [],
  mensaje: e.mensaje,
});

/** Arma la `PersonaA5` a partir de un `personaReturn` (o un `persona` de la lista) decodificado. */
function mapPersonaA5(raw: PersonaReturn): PersonaA5 {
  const { datosGenerales: g, datosRegimenGeneral: rg, datosMonotributo: mt, errorConstancia: ec } = raw;

  if (!g && !ec) {
    throw new ArcaPadronError('Respuesta inválida de ARCA: la constancia no tiene datosGenerales ni errorConstancia');
  }
  const idPersona = g?.idPersona ?? ec?.idPersona;
  if (!idPersona) throw new ArcaPadronError('Respuesta inválida de ARCA: falta datosGenerales.idPersona');

  const persona: PersonaA5 = {
    idPersona,
    tipoPersona: g?.tipoPersona,
    tipoClave: g?.tipoClave,
    estadoClave: g?.estadoClave,
    nombre: g?.nombre ?? ec?.nombre,
    apellido: g?.apellido ?? ec?.apellido,
    razonSocial: g?.razonSocial,
    mesCierre: g?.mesCierre,
    fechaContratoSocial: g?.fechaContratoSocial,
    fechaFallecimiento: g?.fechaFallecimiento,
    esSucesion: g?.esSucesion,
    domicilioFiscal: g?.domicilioFiscal,
    impuestos: [],
  };
  if (g?.dependencia) persona.dependencia = g.dependencia;
  if (g?.caracterizacion) persona.caracterizacion = g.caracterizacion;

  if (rg) {
    persona.regimenGeneral = {
      impuestos: rg.impuesto ?? [],
      actividades: rg.actividad ?? [],
      regimenes: rg.regimen ?? [],
      categoriaAutonomo: rg.categoriaAutonomo,
    };
  }
  if (mt) {
    persona.monotributo = {
      impuestos: mt.impuesto ?? [],
      actividades: mt.actividad ?? [],
      actividadMonotributista: mt.actividadMonotributista,
      categoria: mt.categoriaMonotributo,
    };
    if (mt.componenteDeSociedad) persona.monotributo.componenteDeSociedad = mt.componenteDeSociedad;
  }
  persona.impuestos = [...(persona.regimenGeneral?.impuestos ?? []), ...(persona.monotributo?.impuestos ?? [])];

  if (ec) {
    persona.errorConstancia = {
      error: ec.error ?? [],
      idPersona: ec.idPersona,
      nombre: ec.nombre,
      apellido: ec.apellido,
    };
  }
  if (raw.errorRegimenGeneral) persona.errorRegimenGeneral = errorRegimen(raw.errorRegimenGeneral);
  if (raw.errorMonotributo) persona.errorMonotributo = errorRegimen(raw.errorMonotributo);

  return persona;
}
