/**
 * Decodificación de respuestas de Padrón con el DSL de schemas de
 * `@ramiidv/arca-common/schema`, con lo propio de estos WSDL:
 *
 * - Los elementos repetidos son `nillable`: los `xsi:nil="true"` se descartan
 *   antes de decodificar (un nil suelto queda como lista vacía).
 * - Una lista ausente no aparece en el resultado (en lugar de `[]`): los tipos
 *   públicos la declaran opcional (`domicilio?`, `impuesto?`...).
 * - `must(id())` y `must(str({ minLen: 1 }))` además rechazan el valor vacío.
 * - Las respuestas inválidas se lanzan como `ArcaPadronError`.
 *
 * @internal No se exporta desde `index.ts`.
 */
import { ensureArray } from '@ramiidv/arca-common';
import { decodeResponse, int, must, obj, str } from '@ramiidv/arca-common/schema';
import type { Field, Schema } from '@ramiidv/arca-common/schema';
import { ArcaPadronError } from './errors.js';

export { dec, id, int, list, must, obj, str } from '@ramiidv/arca-common/schema';
export type { Schema } from '@ramiidv/arca-common/schema';

/** Registro de una respuesta SOAP parseada. */
export type SoapRecord = Record<string, unknown>;

const isRecord = (v: unknown): v is SoapRecord => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * `true` si el valor no vino o es un elemento `xsi:nil="true"` (el parser deja
 * el atributo como `@_nil` o `@_xsi:nil`). Los WSDL de Padrón declaran
 * `nillable` los elementos repetidos.
 */
function isNil(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (!isRecord(v)) return false;
  return Object.keys(v).some((k) => /^@_(?:[\w-]+:)?nil$/.test(k) && String(v[k]) === 'true');
}

/** Descarta los elementos nil (en un array se quitan; uno suelto queda como lista vacía). */
function sinNil(v: unknown): unknown {
  if (Array.isArray(v)) return v.filter((x) => !isNil(x)).map(sinNil);
  if (!isRecord(v)) return v;
  const out: SoapRecord = {};
  for (const [k, x] of Object.entries(v)) out[k] = isNil(x) ? [] : sinNil(x);
  return out;
}

const responseError = (message: string) =>
  new ArcaPadronError(message.replace(/^Respuesta inválida:/, 'Respuesta inválida de ARCA:'));

/** `must()` que además rechaza el valor vacío: `id()` (`xs:long`) o `str({ minLen })`. */
const noVacio = (f: Field) => f.scalar?.kind === 'id' || (f.scalar?.kind === 'str' && (f.scalar.minLen ?? 0) > 0);

/** Quita las listas que no vinieron y valida los obligatorios no vacíos. */
function postproceso(out: SoapRecord, raw: unknown, schema: Schema, path: string): void {
  const r = isRecord(raw) ? raw : {};
  for (const [key, f] of Object.entries(schema)) {
    const p = `${path}.${key}`;
    if (f.minItems !== undefined && r[key] === undefined) {
      delete out[key];
      continue;
    }
    const v = out[key];
    if (v === undefined) continue;
    if (f.schema) {
      const sub = f.schema;
      if (Array.isArray(v)) {
        const raws = ensureArray(r[key]);
        v.forEach((x, i) => postproceso(x as SoapRecord, raws[i], sub, `${p}[${i}]`));
      } else {
        postproceso(v as SoapRecord, r[key], sub, p);
      }
    } else if (f.required && v === '' && noVacio(f)) {
      throw responseError(`Respuesta inválida: ${p} vacío`);
    }
  }
}

/**
 * Decodifica un nodo de respuesta de Padrón según el schema.
 * @throws ArcaPadronError si falta un dato obligatorio o un valor no tiene el tipo del WSDL.
 */
export function decode<T>(node: unknown, schema: Schema, path: string): T {
  const limpio = sinNil(node);
  const out = decodeResponse<SoapRecord>(limpio, schema, path, { error: responseError });
  postproceso(out, limpio, schema, path);
  return out as T;
}

/**
 * Decodifica el `persona` de un `personaReturn` (A4, A10, A13). Si falta,
 * lanza `ArcaPadronError`: nunca se inventa una persona vacía.
 */
export function decodePersona<T>(result: unknown, persona: Schema, method: string): T {
  return decode<{ persona: T }>(result, { persona: must(obj(persona)) }, `${method}.personaReturn`).persona;
}

// ---------------------------------------------------------------------------
// Tipos comunes de los WSDL de A4, A10 y constancia (orden del WSDL)
// ---------------------------------------------------------------------------

/** `dependencia` de A4/A10. */
export const Dependencia: Schema = {
  descripcionDependencia: str(),
  idDependencia: int(),
};

/** `domicilio` de A10 y `domicilioFiscal` de la constancia (todos `xs:string` salvo `idProvincia`). */
export const Domicilio: Schema = {
  codPostal: str(),
  datoAdicional: str(),
  descripcionProvincia: str(),
  direccion: str(),
  idProvincia: int(),
  localidad: str(),
  tipoDatoAdicional: str(),
  tipoDomicilio: str(),
};
