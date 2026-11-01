import { validateCuit } from '@ramiidv/arca-common';
import type { CallOptions } from '@ramiidv/arca-common';
import {
  asignarDependenciaYClaves,
  mapDomicilio,
  mapPersonaComun,
  optNumber as num,
  optString as str,
  records as list,
  reqNumber,
  reqString,
  requirePersona,
  type SoapRecord as R,
} from './mapping.js';
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
    return mapPersonaA4(requirePersona(result, 'getPersona'));
  }
}

/** Mapea `persona` de A4 (WSDL personaServiceA4: estructura plana). */
export function mapPersonaA4(raw: R): PersonaA4 {
  const persona: PersonaA4 = {
    ...mapPersonaComun(raw),
    fechaNacimiento: str(raw['fechaNacimiento']),
    sexo: str(raw['sexo']),
    numeroInscripcion: str(raw['numeroInscripcion']),
    formaJuridica: str(raw['formaJuridica']),
    mesCierre: num(raw['mesCierre']),
    fechaInscripcion: str(raw['fechaInscripcion']),
    fechaContratoSocial: str(raw['fechaContratoSocial']),
    fechaFallecimiento: str(raw['fechaFallecimiento']),
    fechaJubilado: str(raw['fechaJubilado']),
    fechaVencimientoMigracion: str(raw['fechaVencimientoMigracion']),
    localidadInscripcion: str(raw['localidadInscripcion']),
    provinciaInscripcion: str(raw['provinciaInscripcion']),
    organismoInscripcion: str(raw['organismoInscripcion']),
    organismoOriginante: str(raw['organismoOriginante']),
    tipoOrganismoOriginante: str(raw['tipoOrganismoOriginante']),
    tipoResidencia: str(raw['tipoResidencia']),
    porcentajeCapitalNacional: num(raw['porcentajeCapitalNacional']),
    cantidadSociosEmpresaMono: num(raw['cantidadSociosEmpresaMono']),
    leyJubilacion: num(raw['leyJubilacion']),
  };

  asignarDependenciaYClaves(persona, raw);

  if (raw['domicilio'] !== undefined) {
    persona.domicilio = list(raw['domicilio']).map((d) => ({ ...mapDomicilio(d), orden: num(d['orden']) }));
  }
  if (raw['impuesto'] !== undefined) {
    persona.impuesto = list(raw['impuesto']).map((i) => ({
      idImpuesto: reqNumber(i['idImpuesto'], 'impuesto.idImpuesto'),
      descripcionImpuesto: str(i['descripcionImpuesto']),
      estado: str(i['estado']),
      periodo: num(i['periodo']),
      diaPeriodo: num(i['diaPeriodo']),
      ffInscripcion: str(i['ffInscripcion']),
    }));
  }
  if (raw['actividad'] !== undefined) {
    persona.actividad = list(raw['actividad']).map((a) => ({
      idActividad: reqString(a['idActividad'], 'actividad.idActividad'),
      descripcionActividad: str(a['descripcionActividad']),
      nomenclador: num(a['nomenclador']),
      orden: num(a['orden']),
      periodo: num(a['periodo']),
    }));
  }
  if (raw['regimen'] !== undefined) {
    persona.regimen = list(raw['regimen']).map((r) => ({
      idRegimen: reqNumber(r['idRegimen'], 'regimen.idRegimen'),
      descripcionRegimen: str(r['descripcionRegimen']),
      estado: str(r['estado']),
      periodo: num(r['periodo']),
      diaPeriodo: num(r['diaPeriodo']),
      tipoRegimen: str(r['tipoRegimen']),
      idImpuesto: num(r['idImpuesto']),
    }));
  }
  if (raw['relacion'] !== undefined) {
    persona.relacion = list(raw['relacion']).map((r) => ({
      idPersona: reqString(r['idPersona'], 'relacion.idPersona'),
      idPersonaAsociada: str(r['idPersonaAsociada']),
      tipoRelacion: str(r['tipoRelacion']),
      subtipoRelacion: str(r['subtipoRelacion']),
      ffRelacion: str(r['ffRelacion']),
      ffVencimiento: str(r['ffVencimiento']),
    }));
  }
  if (raw['categoria'] !== undefined) {
    persona.categoria = list(raw['categoria']).map((c) => ({
      idCategoria: reqNumber(c['idCategoria'], 'categoria.idCategoria'),
      descripcionCategoria: str(c['descripcionCategoria']),
      idImpuesto: num(c['idImpuesto']),
      estado: str(c['estado']),
      periodo: num(c['periodo']),
    }));
  }
  if (raw['email'] !== undefined) {
    persona.email = list(raw['email']).map((e) => ({
      direccion: reqString(e['direccion'], 'email.direccion'),
      tipoEmail: str(e['tipoEmail']),
      estado: str(e['estado']),
    }));
  }
  if (raw['telefono'] !== undefined) {
    persona.telefono = list(raw['telefono']).map((t) => ({
      numero: reqString(t['numero'], 'telefono.numero'),
      tipoTelefono: str(t['tipoTelefono']),
      tipoLinea: str(t['tipoLinea']),
    }));
  }

  return persona;
}
