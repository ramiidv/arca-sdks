import { decodeResponse } from '@ramiidv/arca-common/schema';
import type { Schema } from '@ramiidv/arca-common/schema';
import { ArcaSoapError } from './errors.js';

type Raw = Record<string, unknown>;

function isRecord(v: unknown): v is Raw {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

const isNil = (v: unknown) => isRecord(v) && (v['@_nil'] === 'true' || v['@_xsi:nil'] === 'true');

/**
 * Las listas sin contenedor (`list()`) del schema vuelven a ser un objeto si
 * en el XML había un solo elemento: los tipos públicos de las respuestas
 * crudas son `X | X[]`, como los devolvía el parser antes del DSL.
 */
function restoreSingles(raw: unknown, decoded: unknown, schema: Schema): unknown {
  if (!isRecord(raw) || !isRecord(decoded)) return decoded;
  for (const [key, f] of Object.entries(schema)) {
    const r = raw[f.xml ?? key];
    const d = decoded[key];
    if (d === undefined) continue;
    if (f.minItems !== undefined && Array.isArray(d)) {
      const rawItems = (Array.isArray(r) ? r : [r]).filter((x) => !isNil(x));
      const items = f.schema ? d.map((x, i) => restoreSingles(rawItems[i], x, f.schema!)) : d;
      decoded[key] = !f.wrap && !Array.isArray(r) && items.length === 1 ? items[0] : items;
    } else if (f.schema) {
      decoded[key] = restoreSingles(r, d, f.schema);
    }
  }
  return decoded;
}

/**
 * Decodifica una respuesta de WSFEv1/WSFEX (pedida con `parseNumbers: false`)
 * según su schema. Una respuesta con forma inválida lanza `ArcaSoapError`.
 */
export function decodeArca<T>(node: unknown, schema: Schema, path: string): T {
  const decoded = decodeResponse<unknown>(node, schema, path, {
    error: (message) => new ArcaSoapError(message),
    emptyLists: 'omit',
  });
  return restoreSingles(node, decoded, schema) as T;
}
