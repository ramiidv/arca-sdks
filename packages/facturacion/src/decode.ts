import { ArcaResponseError } from '@ramiidv/arca-common';
import type { SoapOperationKind } from '@ramiidv/arca-common';
import { decodeResponse } from '@ramiidv/arca-common/schema';
import type { Schema } from '@ramiidv/arca-common/schema';

/**
 * Decodifica una respuesta de WSFEv1/WSFEX (pedida con `parseNumbers: false`)
 * según su schema. Las listas son siempre arrays; las que no vinieron se
 * omiten. Una respuesta con forma inválida lanza `ArcaResponseError`
 * (`uncertain: true` si `kind` es `emision`).
 */
export function decodeArca<T>(node: unknown, schema: Schema, path: string, kind: SoapOperationKind = 'consulta'): T {
  return decodeResponse<T>(node, schema, path, { kind, emptyLists: 'omit' });
}

/** Falta un campo obligatorio en la respuesta de una consulta. */
export function sinCampo(method: string, campo: string): ArcaResponseError {
  return new ArcaResponseError(`Respuesta de ${method} sin ${campo}`);
}
