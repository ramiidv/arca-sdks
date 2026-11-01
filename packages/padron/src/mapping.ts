/**
 * Decodificación de respuestas de Padrón con el DSL de schemas de
 * `@ramiidv/arca-common/schema`, con lo propio de estos WSDL:
 *
 * - Los elementos repetidos son `nillable`: el DSL descarta los `xsi:nil="true"`
 *   (un nil suelto queda como lista vacía).
 * - Una lista ausente no aparece en el resultado (`emptyLists: 'omit'`): los
 *   tipos públicos la declaran opcional (`domicilio?`, `impuesto?`...).
 * - Las respuestas inválidas se lanzan como `ArcaPadronError`.
 *
 * @internal No se exporta desde `index.ts`.
 */
import { decodeResponse, int, must, obj, str } from '@ramiidv/arca-common/schema';
import type { Schema } from '@ramiidv/arca-common/schema';
import { ArcaPadronError } from './errors.js';

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
  return decodeResponse<T>(node, schema, path, { error: responseError, emptyLists: 'omit' });
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
