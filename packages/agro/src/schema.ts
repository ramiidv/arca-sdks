/**
 * Schemas de WSCPE/WSLPG: el DSL de `@ramiidv/arca-common/schema`, con las
 * respuestas inválidas reportadas como `ArcaAgroResponseError`.
 *
 * @internal No se exporta desde `index.ts`.
 */
import { decodeResponse as decode } from '@ramiidv/arca-common/schema';
import type { Schema } from '@ramiidv/arca-common/schema';
import type { SoapOperationKind } from '@ramiidv/arca-common';
import { ArcaAgroResponseError } from './errors.js';

export {
  base64,
  bool,
  custom,
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
  porcentaje,
  str,
  wrapped,
  xml,
} from '@ramiidv/arca-common/schema';
export type { Field, Schema } from '@ramiidv/arca-common/schema';

/**
 * `decodeResponse` de common que lanza `ArcaAgroResponseError` (`uncertain` si
 * `kind` es `'emision'`).
 */
export function decodeResponse<T>(
  node: unknown,
  schema: Schema,
  path: string,
  kind: SoapOperationKind = 'consulta',
): T {
  return decode<T>(node, schema, path, {
    kind,
    error: (message) => new ArcaAgroResponseError(message, kind === 'emision'),
  });
}
