import { ArcaValidationError, validateCuit } from '@ramiidv/arca-common';
import type { CallOptions } from '@ramiidv/arca-common';
import { ArcaPadronError } from './errors.js';
import {
  mapDomicilio,
  optNumber as num,
  optString as str,
  record,
  records as list,
  reqNumber,
  reqString,
  strings,
  type SoapRecord as R,
} from './mapping.js';
import { BasePadronClient, type PadronClientConfig } from './base-client.js';
import type { ActividadA5, CategoriaA5, ErrorRegimenA5, ImpuestoA5, PersonaA5, WsAuth } from './types.js';

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
    return mapPersonaA5(result);
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
        [{ field: 'cuits', message: `Entre 1 y ${MAX_PERSONA_LIST} CUITs`, value: Array.isArray(cuits) ? cuits.length : cuits }],
        'cuits',
      );
    }
    const idPersona = cuits.map((c) => validateCuit(c));
    const result = await this.call('getPersonaList_v2', { ...this.authParams(auth), idPersona }, opts);
    return list(result['persona']).map(mapPersonaA5);
  }
}

function mapImpuesto(i: R): ImpuestoA5 {
  return {
    idImpuesto: reqNumber(i['idImpuesto'], 'impuesto.idImpuesto'),
    descripcionImpuesto: str(i['descripcionImpuesto']),
    estadoImpuesto: str(i['estadoImpuesto']),
    motivo: str(i['motivo']),
    periodo: num(i['periodo']),
  };
}

function mapActividad(a: R): ActividadA5 {
  return {
    idActividad: reqString(a['idActividad'], 'actividad.idActividad'),
    descripcionActividad: str(a['descripcionActividad']),
    nomenclador: num(a['nomenclador']),
    orden: num(a['orden']),
    periodo: num(a['periodo']),
  };
}

function mapCategoria(v: unknown): CategoriaA5 | undefined {
  const c = record(v);
  if (!c) return undefined;
  return {
    idCategoria: reqNumber(c['idCategoria'], 'categoria.idCategoria'),
    descripcionCategoria: str(c['descripcionCategoria']),
    idImpuesto: num(c['idImpuesto']),
    periodo: num(c['periodo']),
  };
}

function mapErrorRegimen(v: unknown): ErrorRegimenA5 | undefined {
  const e = record(v);
  if (!e) return undefined;
  return { error: strings(e['error']), mensaje: str(e['mensaje']) };
}

/** Mapea `personaReturn` de `getPersona_v2` o un `persona` de `getPersonaList_v2`. */
export function mapPersonaA5(raw: R): PersonaA5 {
  const g = record(raw['datosGenerales']);
  const rg = record(raw['datosRegimenGeneral']);
  const mt = record(raw['datosMonotributo']);
  const ec = record(raw['errorConstancia']);
  const domicilioFiscal = record(g?.['domicilioFiscal']);

  if (!g && !ec) {
    throw new ArcaPadronError('Respuesta inválida de ARCA: la constancia no tiene datosGenerales ni errorConstancia');
  }

  const persona: PersonaA5 = {
    idPersona: reqString(g?.['idPersona'] ?? ec?.['idPersona'], 'datosGenerales.idPersona'),
    tipoPersona: str(g?.['tipoPersona']) as PersonaA5['tipoPersona'],
    tipoClave: str(g?.['tipoClave']),
    estadoClave: str(g?.['estadoClave']),
    nombre: str(g?.['nombre'] ?? ec?.['nombre']),
    apellido: str(g?.['apellido'] ?? ec?.['apellido']),
    razonSocial: str(g?.['razonSocial']),
    mesCierre: num(g?.['mesCierre']),
    fechaContratoSocial: str(g?.['fechaContratoSocial']),
    fechaFallecimiento: str(g?.['fechaFallecimiento']),
    esSucesion: str(g?.['esSucesion']),
    domicilioFiscal: domicilioFiscal ? mapDomicilio(domicilioFiscal) : undefined,
    impuestos: [],
  };

  const dep = record(g?.['dependencia']);
  if (dep) {
    persona.dependencia = {
      idDependencia: num(dep['idDependencia']),
      descripcionDependencia: str(dep['descripcionDependencia']),
      direccion: str(dep['direccion']),
      localidad: str(dep['localidad']),
      codPostal: str(dep['codPostal']),
      idProvincia: num(dep['idProvincia']),
      descripcionProvincia: str(dep['descripcionProvincia']),
    };
  }

  if (g?.['caracterizacion'] !== undefined) {
    persona.caracterizacion = list(g['caracterizacion']).map((c) => ({
      idCaracterizacion: reqNumber(c['idCaracterizacion'], 'caracterizacion.idCaracterizacion'),
      descripcionCaracterizacion: str(c['descripcionCaracterizacion']),
      periodo: num(c['periodo']),
      fechaSolicitud: num(c['fechaSolicitud']),
    }));
  }

  if (rg) {
    persona.regimenGeneral = {
      impuestos: list(rg['impuesto']).map(mapImpuesto),
      actividades: list(rg['actividad']).map(mapActividad),
      regimenes: list(rg['regimen']).map((r) => ({
        idRegimen: reqNumber(r['idRegimen'], 'regimen.idRegimen'),
        descripcionRegimen: str(r['descripcionRegimen']),
        idImpuesto: num(r['idImpuesto']),
        periodo: num(r['periodo']),
        tipoRegimen: str(r['tipoRegimen']),
      })),
      categoriaAutonomo: mapCategoria(rg['categoriaAutonomo']),
    };
  }

  if (mt) {
    const actividadMonotributista = record(mt['actividadMonotributista']);
    persona.monotributo = {
      impuestos: list(mt['impuesto']).map(mapImpuesto),
      actividades: list(mt['actividad']).map(mapActividad),
      actividadMonotributista: actividadMonotributista ? mapActividad(actividadMonotributista) : undefined,
      categoria: mapCategoria(mt['categoriaMonotributo']),
    };
    if (mt['componenteDeSociedad'] !== undefined) {
      persona.monotributo.componenteDeSociedad = list(mt['componenteDeSociedad']).map((c) => ({
        idPersonaAsociada: str(c['idPersonaAsociada']),
        apellidoPersonaAsociada: str(c['apellidoPersonaAsociada']),
        nombrePersonaAsociada: str(c['nombrePersonaAsociada']),
        razonSocialPersonaAsociada: str(c['razonSocialPersonaAsociada']),
        tipoComponente: str(c['tipoComponente']),
        ffRelacion: str(c['ffRelacion']),
        ffVencimiento: str(c['ffVencimiento']),
      }));
    }
  }

  persona.impuestos = [...(persona.regimenGeneral?.impuestos ?? []), ...(persona.monotributo?.impuestos ?? [])];

  if (ec) {
    persona.errorConstancia = {
      error: strings(ec['error']),
      idPersona: str(ec['idPersona']),
      nombre: str(ec['nombre']),
      apellido: str(ec['apellido']),
    };
  }
  const errorRegimenGeneral = mapErrorRegimen(raw['errorRegimenGeneral']);
  if (errorRegimenGeneral) persona.errorRegimenGeneral = errorRegimenGeneral;
  const errorMonotributo = mapErrorRegimen(raw['errorMonotributo']);
  if (errorMonotributo) persona.errorMonotributo = errorMonotributo;

  return persona;
}
