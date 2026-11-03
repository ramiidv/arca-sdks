/**
 * Lógica compartida por `CpeClient` y `LpgClient`: errores de negocio
 * (fatales y admitidos), decodificación de respuestas y dato imprescindible.
 *
 * @internal No se exporta desde `index.ts`.
 */
import { ArcaResponseError, formatServiceErrors } from '@ramiidv/arca-common';
import type { AccessTicket, CallOptions, ServiceErrorDetail, SoapOperationKind } from '@ramiidv/arca-common';
import type { Field, Schema } from '@ramiidv/arca-common/schema';
import { ArcaAgroResponseError, ArcaAgroServiceError } from './errors.js';
import { decodeResponse } from './schema.js';

export type AgroServiceName = 'WSCPE' | 'WSLPG';

/**
 * Códigos de error que ARCA informa en `errores` sin rechazar la operación
 * (estado "Aceptada" en los manuales): la respuesta trae el resultado y el
 * error va a `advertencias`.
 *
 * - WSCPE 550: "Error al generar el archivo pdf" (manual WSCPE §2.4 y §2.6).
 * - WSLPG 1021: "Error al generar el archivo pdf" (manual WSLPG, tratamiento
 *   de errores de generación de archivos pdf).
 */
export const CODIGOS_ADMITIDOS: Readonly<Record<AgroServiceName, readonly number[]>> = {
  WSCPE: [550],
  WSLPG: [1021],
};

/**
 * Código con el que el servicio informa en `errores` que no hay registros para
 * los parámetros de búsqueda. En una consulta de lista no es un error: la lista
 * vuelve vacía (ver `soloSinRegistros`).
 *
 * - WSCPE 800: "No existen solicitudes para los parámetros indicados" (lo
 *   responde homologación en las consultas de CPE y en las paramétricas sin
 *   resultados, ej: `consultarPlantas` de un CUIT sin plantas).
 * - WSLPG 600: "No existen datos en las bases de la Administración según los
 *   parámetros de búsqueda informados" (manual WSLPG §1.7, para todos los métodos).
 */
export const CODIGO_SIN_REGISTROS: Readonly<Record<AgroServiceName, number>> = { WSCPE: 800, WSLPG: 600 };

/** Un error que cancela la operación: código no numérico o no admitido (ver `CODIGOS_ADMITIDOS`). */
const esFatal = (e: ServiceErrorDetail, service: AgroServiceName): boolean =>
  e.rawCode !== undefined || !CODIGOS_ADMITIDOS[service].includes(e.code);

/**
 * `true` si el único error que cancela la operación es "sin registros" (ver
 * `CODIGO_SIN_REGISTROS`); un error admitido junto a ese código no cambia el
 * resultado. Solo para consultas de lista: en una emisión o en una consulta
 * de un único registro el código sigue siendo un error.
 */
export function soloSinRegistros(node: Record<string, unknown>, service: AgroServiceName): boolean {
  const codigo = CODIGO_SIN_REGISTROS[service];
  const fatales = extractErrors(node).filter((e) => esFatal(e, service));
  return fatales.length > 0 && fatales.every((e) => e.code === codigo);
}

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

const asArray = (v: unknown): unknown[] =>
  v === undefined || v === null || v === '' ? [] : Array.isArray(v) ? v : [v];

/** Texto de un elemento simple (`#text` si tiene atributos). */
function text(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (isObject(v)) return v['#text'] === undefined ? undefined : String(v['#text']);
  return String(v);
}

/**
 * Errores de `errores.error[]` y `erroresFormato.error[]`. Todo ítem cuenta,
 * salvo los de código explícito `0`: un `<error>` sin código (o con código no
 * numérico) es un error.
 */
export function extractErrors(node: Record<string, unknown>): ServiceErrorDetail[] {
  const out: ServiceErrorDetail[] = [];
  for (const container of ['errores', 'erroresFormato']) {
    for (const c of asArray(node[container])) {
      const items = isObject(c) ? asArray(c['error'] ?? c['err']) : [c];
      for (const item of items) {
        if (item === undefined || item === null || item === '') continue;
        const obj = isObject(item) ? item : { descripcion: item };
        const raw = text(obj['codigo'] ?? obj['code'])?.trim();
        const msg = text(obj['descripcion'] ?? obj['msg']) ?? 'Error desconocido';
        if (raw === undefined || raw === '') out.push({ code: 0, msg });
        else if (/^-?\d+$/.test(raw)) {
          if (Number(raw) !== 0) out.push({ code: Number(raw), msg });
        } else out.push({ code: 0, msg, rawCode: raw });
      }
    }
  }
  return out;
}

/**
 * Verifica los errores de negocio de una respuesta y devuelve los admitidos
 * (ver `CODIGOS_ADMITIDOS`), que no cancelan la operación.
 *
 * @param conResultado En emisiones: si la respuesta igual trae el resultado
 *   (ej: `cabecera.nroCTG`, `autorizacion.coe`), el error es `uncertain`.
 * @throws ArcaAgroServiceError si hay algún error no admitido.
 */
export function checkErrors(
  node: Record<string, unknown>,
  service: AgroServiceName,
  method: string,
  kind: SoapOperationKind,
  conResultado?: (node: Record<string, unknown>) => boolean,
): ServiceErrorDetail[] {
  const errors = extractErrors(node);
  if (errors.some((e) => esFatal(e, service))) {
    const uncertain = kind === 'emision' && conResultado !== undefined && conResultado(node);
    throw new ArcaAgroServiceError(
      `${service} ${method}: ${formatServiceErrors(errors)}` +
        (uncertain ? ' (la respuesta trae el resultado: verificá el estado antes de reintentar)' : ''),
      errors,
      service,
      method,
      node,
      uncertain,
    );
  }
  return errors;
}

/** Agrega `advertencias` al resultado si hay. */
export function withAdvertencias<T extends object>(result: T, advertencias: ServiceErrorDetail[]): T {
  if (advertencias.length > 0) (result as { advertencias?: ServiceErrorDetail[] }).advertencias = advertencias;
  return result;
}

/** Valor de una ruta (`a.b.c`) en un nodo parseado. */
export function at(node: unknown, path: string): unknown {
  let v = node;
  for (const k of path.split('.')) v = isObject(v) ? v[k] : undefined;
  return text(v);
}

/**
 * Decodifica una respuesta. En consultas es estricto (`ArcaAgroResponseError`).
 * En emisiones, un campo secundario que no tiene la forma del XSD se omite (la
 * operación ya fue aceptada); sólo un `must()` faltante lanza, con `uncertain`.
 */
export function decodeResult<T>(node: unknown, schema: Schema, path: string, kind: SoapOperationKind): T {
  if (kind !== 'emision') return decodeResponse<T>(node, schema, path, 'consulta');
  try {
    return decodeTolerant(node, schema, path) as T;
  } catch (e) {
    if (e instanceof ArcaResponseError) throw new ArcaAgroResponseError(e.message, true);
    throw e;
  }
}

function decodeTolerant(node: unknown, schema: Schema, path: string): Record<string, unknown> {
  try {
    return decodeResponse<Record<string, unknown>>(node, schema, path, 'consulta');
  } catch (e) {
    if (!(e instanceof ArcaResponseError) || !isObject(node)) throw e;
  }
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(schema)) {
    const p = `${path}.${key}`;
    try {
      Object.assign(out, decodeResponse<Record<string, unknown>>(node, { [key]: field }, path, 'consulta'));
    } catch (e) {
      if (!(e instanceof ArcaResponseError) || field.required) throw e;
      const value = tolerantValue(node[field.xml ?? key], field, p);
      if (value !== undefined) out[key] = value;
    }
  }
  return out;
}

/**
 * Fallback de un campo opcional inválido: un objeto se decodifica campo a
 * campo (si le falta un `must()`, se omite entero), una lista ítem a ítem
 * (los ítems inválidos se descartan) y un escalar se omite.
 */
function tolerantValue(v: unknown, field: Field, path: string): unknown {
  if (field.minItems !== undefined) {
    const raw = field.wrap ? (isObject(v) ? v[field.wrap] : undefined) : v;
    const item: Field = { ...field, minItems: undefined, wrap: undefined, required: undefined };
    const out: unknown[] = [];
    asArray(raw).forEach((x, i) => {
      const decoded = tolerantValue(x, item, `${path}[${i}]`);
      if (decoded !== undefined) out.push(decoded);
    });
    return out;
  }
  try {
    return decodeResponse<{ v?: unknown }>({ v }, { v: field }, path, 'consulta').v;
  } catch (e) {
    if (!(e instanceof ArcaResponseError)) throw e;
  }
  if (!field.schema || !isObject(v)) return undefined;
  try {
    return decodeTolerant(v, field.schema, path);
  } catch (e) {
    if (e instanceof ArcaResponseError) return undefined;
    throw e;
  }
}

/**
 * Exige un dato imprescindible de la respuesta (ej: `nroCTG`, `coe`).
 * @throws ArcaAgroResponseError (`uncertain` en emisiones) si falta.
 */
export function requireValue(
  value: unknown,
  label: string,
  service: AgroServiceName,
  method: string,
  kind: SoapOperationKind,
): void {
  if (value === undefined || value === null || value === '') {
    throw new ArcaAgroResponseError(`${service} ${method}: la respuesta no tiene ${label}`, kind === 'emision');
  }
}

/** Token y sign del ticket de acceso de la llamada. */
export async function ticketAuth(
  getTicket: (opts?: CallOptions) => Promise<AccessTicket>,
  opts?: CallOptions,
): Promise<{ token: string; sign: string }> {
  const ticket = await getTicket(opts);
  return { token: ticket.token, sign: ticket.sign };
}
