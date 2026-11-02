import { ArcaValidationError, ensureArray, validateCuit } from '@ramiidv/arca-common';
import type { CallOptions } from '@ramiidv/arca-common';
import { ArcaPadronError, ArcaPadronServiceError, padronErrorReason } from './errors.js';
import {
  Actividad,
  Categoria,
  Domicilio,
  Metadata,
  conMetadata,
  decode,
  id,
  int,
  list,
  must,
  obj,
  str,
  type Schema,
} from './mapping.js';
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
  ListaPadron,
  PadronMetadata,
  PersonaA5,
  RegimenA5,
  WsAuth,
} from './types.js';

export type PadronA5ClientConfig = PadronClientConfig;

/** Máximo de claves por `getPersonaList_v2` (manual de constancia v4.1, §3.3). */
export const MAX_PERSONA_LIST = 250;

/**
 * Cliente de ws_sr_constancia_inscripcion (ex ws_sr_padron_a5, deprecado por
 * ARCA): constancia de inscripción con datos generales, domicilio fiscal,
 * impuestos del régimen general y monotributo.
 *
 * Usa `getPersona_v2` y `getPersonaList_v2`, los métodos vigentes según el
 * manual del servicio (v4.1).
 */
export class PadronA5Client extends BasePadronClient {
  /**
   * Constancia de inscripción de un contribuyente (`getPersona_v2`).
   *
   * Si ARCA no puede emitir la constancia (o una parte), devuelve la persona con
   * `errorConstancia` / `errorRegimenGeneral` / `errorMonotributo`.
   * @param cuit - CUIT a consultar (con o sin guiones; se valida el dígito verificador)
   * @throws ArcaPadronServiceError (`reason: 'inexistente'`) si la CUIT no existe, tanto si ARCA
   *   lo informa como Fault como si lo informa en `errorConstancia` ("No existe persona con ese Id").
   *   También ante otros Faults de negocio (clave inactiva, token no autorizado...).
   */
  async getPersona(auth: WsAuth, cuit: string | number, opts?: CallOptions): Promise<PersonaA5> {
    const method = 'getPersona_v2';
    const idPersona = validateCuit(cuit);
    const result = await this.call(method, { ...this.authParams(auth), idPersona }, opts);
    const { metadata, ...raw } = decode<PersonaReturn & { metadata?: PadronMetadata }>(
      result,
      PersonaReturnSchema,
      `${method}.personaReturn`,
    );
    const persona = conMetadata(mapPersonaA5(raw), metadata);
    const inexistente = persona.errorConstancia?.error.find((e) => padronErrorReason(e) === 'inexistente');
    if (inexistente !== undefined && !raw.datosGenerales) {
      throw new ArcaPadronServiceError(`${method}: ${inexistente}`, [{ code: 0, msg: inexistente }], {
        reason: 'inexistente',
      });
    }
    return persona;
  }

  /**
   * Constancias de hasta 250 contribuyentes en una llamada (`getPersonaList_v2`).
   *
   * Los problemas de una CUIT no hacen fallar la consulta: se informan en el
   * `errorConstancia` de su persona.
   * - Las claves inexistentes vuelven como ARCA las informa ("No existe persona con ese Id").
   * - Las CUITs inválidas (dígito verificador, formato) no se envían a ARCA: vuelven
   *   con `idPersona` igual al valor recibido y el motivo en `errorConstancia.error`
   *   (`'CUIT inválido: "...". ... No se consultó a ARCA.'`).
   * - Una persona que ARCA devuelve con datos inválidos vuelve con el detalle en
   *   `errorConstancia` (si se la puede identificar; si no trae ninguna CUIT, se omite).
   *
   * El resultado sigue el orden de `cuits`. El `metadata` de la respuesta, si vino,
   * queda en la propiedad `metadata` del array.
   * @throws ArcaValidationError si `cuits` no tiene entre 1 y 250 elementos.
   */
  async getPersonaList(
    auth: WsAuth,
    cuits: Array<string | number>,
    opts?: CallOptions,
  ): Promise<ListaPadron<PersonaA5>> {
    const method = 'getPersonaList_v2';
    if (!Array.isArray(cuits) || cuits.length === 0 || cuits.length > MAX_PERSONA_LIST) {
      throw new ArcaValidationError(
        `${method} acepta entre 1 y ${MAX_PERSONA_LIST} CUITs (recibió ${Array.isArray(cuits) ? cuits.length : 0})`,
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

    // Cada CUIT: normalizada (se consulta) o la persona con el error de validación (no se consulta).
    const claves = cuits.map((c): string | PersonaA5 => {
      try {
        return validateCuit(c);
      } catch (err) {
        if (!(err instanceof ArcaValidationError)) throw err;
        return personaConError(String(c ?? ''), `${err.message} No se consultó a ARCA.`);
      }
    });
    const idPersona = claves.filter((c): c is string => typeof c === 'string');
    if (idPersona.length === 0) return claves as PersonaA5[];

    const result = await this.call(method, { ...this.authParams(auth), idPersona }, opts);
    const path = `${method}.personaListReturn`;
    const { metadata } = decode<{ metadata?: PadronMetadata }>(result, { metadata: obj(Metadata) }, path);
    const deArca = ensureArray(result['persona'])
      .map((raw, i) => personaDeLista(raw, `${path}.persona[${i}]`))
      .filter((p): p is PersonaA5 => p !== undefined);

    // Orden de `cuits`; lo que ARCA devuelva de más (no debería) va al final.
    const porId = new Map<string, PersonaA5[]>();
    for (const p of deArca) porId.set(p.idPersona, [...(porId.get(p.idPersona) ?? []), p]);
    const out: PersonaA5[] = [];
    for (const c of claves) {
      const p = typeof c === 'string' ? porId.get(c)?.shift() : c;
      if (p) out.push(p);
    }
    for (const resto of porId.values()) out.push(...resto);
    return conMetadata(out, metadata);
  }
}

/** Persona sin datos, con un error en `errorConstancia` (para `getPersonaList_v2`). */
function personaConError(idPersona: string, error: string): PersonaA5 {
  return { idPersona, impuestos: [], errorConstancia: { error: [error], idPersona } };
}

/**
 * Decodifica un `persona` de `getPersonaList_v2`. Si es inválido, devuelve la
 * persona con el error (si trae alguna CUIT) o `undefined` (ej: un `persona` nil).
 */
function personaDeLista(raw: unknown, path: string): PersonaA5 | undefined {
  try {
    return mapPersonaA5(decode<PersonaReturn>(raw, PersonaSchema, path));
  } catch (err) {
    if (!(err instanceof ArcaPadronError)) throw err;
    const id = idPersonaCrudo(raw);
    return id === undefined ? undefined : personaConError(id, err.message);
  }
}

/** `idPersona` de un `persona` sin decodificar (de `datosGenerales` o de `errorConstancia`). */
function idPersonaCrudo(raw: unknown): string | undefined {
  const campo = (node: unknown, key: string): unknown =>
    node !== null && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined;
  for (const bloque of ['datosGenerales', 'errorConstancia']) {
    const v = campo(campo(raw, bloque), 'idPersona');
    if ((typeof v === 'string' || typeof v === 'number') && String(v).trim() !== '') return String(v).trim();
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Schemas de la respuesta (WSDL personaServiceA5, orden del WSDL). Todos los
// elementos son `minOccurs="0"`; los `must()` son los que el SDK exige.
// ---------------------------------------------------------------------------

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

/** @internal `persona` de `personaListReturn` (contenido de `personaReturn` sin `metadata`). */
export const PersonaSchema: Schema = {
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

/** @internal `personaReturn` de `getPersona_v2`; exportado para los tests de contrato. */
export const PersonaReturnSchema: Schema = { ...PersonaSchema, metadata: obj(Metadata) };

/**
 * @internal `personaListReturn` de `getPersonaList_v2` (tests de contrato). El
 * cliente decodifica cada `persona` por separado: una inválida no hace fallar al resto.
 */
export const PersonaListReturnSchema: Schema = { metadata: obj(Metadata), persona: list(obj(PersonaSchema)) };

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
