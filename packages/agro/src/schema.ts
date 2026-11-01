/**
 * Schemas de WSCPE/WSLPG: el DSL de `@ramiidv/arca-common/schema`, con las
 * respuestas inválidas reportadas como `ArcaAgroResponseError`.
 *
 * @internal No se exporta desde `index.ts`.
 */
import { decodeResponse as decode } from '@ramiidv/arca-common/schema';
import type { Schema } from '@ramiidv/arca-common/schema';
import { ArcaAgroResponseError } from './errors.js';

export {
  base64,
  bool,
  cuit,
  date,
  datetime,
  dec,
  encodeRequest,
  formatDateTimeAR,
  id,
  int,
  list,
  must,
  obj,
  opt,
  str,
  wrapped,
} from '@ramiidv/arca-common/schema';
export type { Field, Schema } from '@ramiidv/arca-common/schema';

const responseError = (message: string) => new ArcaAgroResponseError(message);

/** `decodeResponse` de common que lanza `ArcaAgroResponseError`. */
export function decodeResponse<T>(node: unknown, schema: Schema, path: string): T {
  return decode<T>(node, schema, path, { error: responseError });
}
