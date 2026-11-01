import { decodeResponse } from '@ramiidv/arca-common/schema';
import type { Schema } from '@ramiidv/arca-common/schema';
import { ArcaSoapError } from './errors.js';

/**
 * Decodifica una respuesta de WSFEv1/WSFEX (pedida con `parseNumbers: false`)
 * según su schema. Las listas son siempre arrays; las que no vinieron se
 * omiten. Una respuesta con forma inválida lanza `ArcaSoapError`.
 */
export function decodeArca<T>(node: unknown, schema: Schema, path: string): T {
  return decodeResponse<T>(node, schema, path, {
    error: (message) => new ArcaSoapError(message),
    emptyLists: 'omit',
  });
}
