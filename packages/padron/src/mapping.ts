/**
 * Decodificación de respuestas de Padrón con el DSL de schemas de
 * `@ramiidv/arca-common/schema`, con lo propio de estos WSDL:
 *
 * - Los elementos repetidos son `nillable`: el DSL descarta los `xsi:nil="true"`
 *   (un nil suelto queda como lista vacía).
 * - Una lista ausente no aparece en el resultado (`emptyLists: 'omit'`): los
 *   tipos públicos la declaran opcional (`domicilio?`, `impuesto?`...).
 * - Las respuestas inválidas se lanzan como `ArcaPadronError` (el `error` de
 *   `decodeResponse`; todas las operaciones son consultas).
 *
 * @internal No se exporta desde `index.ts`.
 */
import { decodeResponse, id, int, must, obj, str } from '@ramiidv/arca-common/schema';
import type { Schema } from '@ramiidv/arca-common/schema';
import { ArcaPadronError } from './errors.js';
import type { PadronMetadata } from './types.js';

export { dec, id, int, list, must, obj, str } from '@ramiidv/arca-common/schema';
export type { Schema } from '@ramiidv/arca-common/schema';

/** Registro de una respuesta SOAP parseada. */
export type SoapRecord = Record<string, unknown>;

const responseError = (message: string) =>
  new ArcaPadronError(message.replace(/^Respuesta inválida:/, 'Respuesta inválida de ARCA:'));

/**
 * Decodifica un nodo de respuesta de Padrón según el schema.
 * @throws ArcaPadronError si falta un dato obligatorio o un valor no tiene el tipo del WSDL.
 */
export function decode<T>(node: unknown, schema: Schema, path: string): T {
  return decodeResponse<T>(node, schema, path, { kind: 'consulta', error: responseError, emptyLists: 'omit' });
}

/**
 * Decodifica el `persona` de un `personaReturn` (A4, A10, A13), con el
 * `metadata` de la respuesta si vino. Si falta `persona`, lanza
 * `ArcaPadronError`: nunca se inventa una persona vacía.
 */
export function decodePersona<T extends { metadata?: PadronMetadata }>(
  result: unknown,
  persona: Schema,
  method: string,
): T {
  const r = decode<{ metadata?: PadronMetadata; persona: T }>(
    result,
    personaReturnSchema(persona),
    `${method}.personaReturn`,
  );
  return conMetadata(r.persona, r.metadata);
}

/**
 * Agrega el `metadata` de la respuesta al resultado (si vino y no está vacío).
 * En un array es una propiedad no enumerable: no aparece al iterar, serializar
 * ni comparar el array, pero se lee con `lista.metadata`.
 */
export function conMetadata<T extends object>(value: T, metadata: PadronMetadata | undefined): T {
  if (!metadata || Object.keys(metadata).length === 0) return value;
  if (Array.isArray(value)) {
    Object.defineProperty(value, 'metadata', {
      value: metadata,
      enumerable: false,
      writable: true,
      configurable: true,
    });
  } else {
    Object.assign(value, { metadata });
  }
  return value;
}

/** `metadata` de las respuestas (`fechaHora` es `xs:dateTime`: queda como string). */
export const Metadata: Schema = {
  fechaHora: str(),
  servidor: str(),
};

/** Schema del `personaReturn` (A4, A10, A13) que envuelve a un `persona`. */
export const personaReturnSchema = (persona: Schema): Schema => ({
  metadata: obj(Metadata),
  persona: must(obj(persona)),
});

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

/**
 * Schema con campos agregados, en orden alfabético: el de los tipos de estos
 * WSDL (JAX-WS), que verifican los tests de contrato.
 */
const extender = (base: Schema, extra: Schema): Schema =>
  Object.fromEntries(Object.entries({ ...base, ...extra }).sort(([a], [b]) => (a < b ? -1 : 1)));

/** `domicilio` de A4: el de A10 más `orden`. */
export const DomicilioA4: Schema = extender(Domicilio, { orden: int() });

/** `actividad` de A4 y de la constancia. */
export const Actividad: Schema = {
  descripcionActividad: str(),
  idActividad: must(id()),
  nomenclador: int(),
  orden: int(),
  periodo: int(),
};

/** `categoria` de la constancia (`categoriaMonotributo`, `categoriaAutonomo`). */
export const Categoria: Schema = {
  descripcionCategoria: str(),
  idCategoria: must(int()),
  idImpuesto: int(),
  periodo: int(),
};

/** `categoria` de A4: la de la constancia más `estado`. */
export const CategoriaA4: Schema = extender(Categoria, { estado: str() });
