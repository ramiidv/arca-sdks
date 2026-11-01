import { ensureArray } from '@ramiidv/arca-common';
import { ArcaPadronError } from './errors.js';
import type { DependenciaA4, DomicilioA10 } from './types.js';

/** Registro de una respuesta SOAP parseada. */
export type SoapRecord = Record<string, unknown>;

/**
 * `true` si el valor no vino o es un elemento `xsi:nil="true"` (el parser deja
 * el atributo como `@_nil` o `@_xsi:nil`). Los WSDL de Padrón declaran
 * `nillable` los elementos repetidos.
 */
export function isNil(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v !== 'object' || Array.isArray(v)) return false;
  const o = v as SoapRecord;
  return Object.keys(o).some((k) => /^@_(?:[\w-]+:)?nil$/.test(k) && String(o[k]) === 'true');
}

/** Valor de texto de un elemento simple (`undefined` si no vino o es nil). */
function text(v: unknown): unknown {
  if (isNil(v)) return undefined;
  if (typeof v === 'object') {
    const o = v as SoapRecord;
    return Object.hasOwn(o, '#text') ? o['#text'] : undefined;
  }
  return v;
}

/** Convierte a string, o `undefined` si el valor no vino. Para campos `xs:string`/`xs:long`/`xs:dateTime`. */
export const optString = (v: unknown): string | undefined => {
  const t = text(v);
  return t === undefined ? undefined : String(t);
};

/** Convierte a número, o `undefined` si el valor no vino. Para campos `xs:int`/`xs:double`. */
export const optNumber = (v: unknown): number | undefined => {
  const t = text(v);
  return t === undefined || t === '' ? undefined : Number(t);
};

/** Normaliza un elemento complejo que puede venir solo, repetido, ausente o nil. */
export const records = (v: unknown): SoapRecord[] =>
  ensureArray(v as SoapRecord | SoapRecord[] | undefined).filter(
    (x): x is SoapRecord => typeof x === 'object' && x !== null && !isNil(x),
  );

/** Elemento complejo opcional (`undefined` si no vino, vino vacío o es nil). */
export const record = (v: unknown): SoapRecord | undefined =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && !isNil(v) ? (v as SoapRecord) : undefined;

/** Lista de valores simples repetidos (ej: `claveInactivaAsociada`, `error`), sin los nil. */
export const strings = (v: unknown): string[] =>
  ensureArray(v).map(optString).filter((s): s is string => s !== undefined);

function missing(field: string): ArcaPadronError {
  return new ArcaPadronError(`Respuesta inválida de ARCA: falta ${field}`);
}

/** String obligatorio: lanza `ArcaPadronError` si no vino. */
export function reqString(v: unknown, field: string): string {
  const s = optString(v);
  if (s === undefined || s === '') throw missing(field);
  return s;
}

/** Número obligatorio: lanza `ArcaPadronError` si no vino. */
export function reqNumber(v: unknown, field: string): number {
  const n = optNumber(v);
  if (n === undefined || Number.isNaN(n)) throw missing(field);
  return n;
}

/** `tipoPersona` obligatorio (`FISICA` | `JURIDICA`). */
export function tipoPersona(v: unknown, field = 'persona.tipoPersona'): 'FISICA' | 'JURIDICA' {
  return reqString(v, field) as 'FISICA' | 'JURIDICA';
}

/**
 * Elemento `persona` de `personaReturn` (A4, A10, A13). Si falta, lanza
 * `ArcaPadronError`: nunca se inventa una persona vacía.
 */
export function requirePersona(result: SoapRecord, method: string): SoapRecord {
  const persona = record(result['persona']);
  if (!persona) throw new ArcaPadronError(`Respuesta inválida de ARCA (${method}): personaReturn sin persona`);
  return persona;
}

// ---------------------------------------------------------------------------
// Bloques comunes de A4 y A10 (mismos tipos en los dos WSDL)
// ---------------------------------------------------------------------------

/** `dependencia` de A4/A10: `{descripcionDependencia, idDependencia}`. */
export function mapDependencia(v: unknown): DependenciaA4 | undefined {
  const d = record(v);
  if (!d) return undefined;
  return { idDependencia: optNumber(d['idDependencia']), descripcionDependencia: optString(d['descripcionDependencia']) };
}

/** `domicilio` de A4/A10/constancia (todos `xs:string` salvo `idProvincia`). */
export function mapDomicilio(d: SoapRecord): DomicilioA10 {
  return {
    direccion: optString(d['direccion']),
    localidad: optString(d['localidad']),
    codPostal: optString(d['codPostal']),
    idProvincia: optNumber(d['idProvincia']),
    descripcionProvincia: optString(d['descripcionProvincia']),
    tipoDomicilio: optString(d['tipoDomicilio']),
    datoAdicional: optString(d['datoAdicional']),
    tipoDatoAdicional: optString(d['tipoDatoAdicional']),
  };
}

/** Campos comunes de `persona` en A4 y A10. */
export function mapPersonaComun(raw: SoapRecord) {
  return {
    idPersona: reqString(raw['idPersona'], 'persona.idPersona'),
    tipoPersona: tipoPersona(raw['tipoPersona']),
    tipoClave: optString(raw['tipoClave']),
    estadoClave: optString(raw['estadoClave']),
    nombre: optString(raw['nombre']),
    apellido: optString(raw['apellido']),
    razonSocial: optString(raw['razonSocial']),
    numeroDocumento: optString(raw['numeroDocumento']),
    tipoDocumento: optString(raw['tipoDocumento']),
  };
}

/** Asigna `dependencia` y `claveInactivaAsociada` solo si vinieron. */
export function asignarDependenciaYClaves(
  target: { dependencia?: DependenciaA4; claveInactivaAsociada?: string[] },
  raw: SoapRecord,
): void {
  const dependencia = mapDependencia(raw['dependencia']);
  if (dependencia) target.dependencia = dependencia;
  if (raw['claveInactivaAsociada'] !== undefined) target.claveInactivaAsociada = strings(raw['claveInactivaAsociada']);
}
