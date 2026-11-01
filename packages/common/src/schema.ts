/**
 * Mini-DSL para describir los tipos complejos del XSD de un web service de ARCA.
 *
 * Un `Schema` lista los elementos de una `xsd:sequence` en el orden del XSD.
 * Con el mismo schema se:
 * - codifica un request (`encodeRequest`): orden XSD, campos obligatorios,
 *   rangos, largos, CUIT con dígito verificador, decimales redondeados según
 *   `fractionDigits`, fechas `xsd:date`/`xsd:dateTime`;
 * - decodifica una respuesta (`decodeResponse`): `xs:string` → `string`, IDs
 *   largos (CTG/COE) → `string`, números → `number`, arrays de un solo
 *   elemento → array.
 *
 * Las respuestas deben parsearse con `parseNumbers: false` (todo como texto):
 * el schema convierte cada campo según su tipo, sin perder ceros a la
 * izquierda ni decimales de los `xs:string` que parecen números.
 *
 * Se exporta como `@ramiidv/arca-common/schema`.
 *
 * @example
 * ```ts
 * import { encodeRequest, decodeResponse, obj, str, int, dec, opt, must, cuit } from '@ramiidv/arca-common/schema';
 *
 * const Item = { codigo: str({ maxLen: 10 }), cantidad: dec(2, 0), cuit: opt(cuit()) };
 * const body = encodeRequest(input, Item, 'autorizar'); // valida y ordena según el XSD
 * const resp = decodeResponse<Resp>(result, { numero: must(int()) }, 'autorizarResponse');
 * ```
 */
import { ArcaResponseError, ArcaValidationError } from './errors.js';
import type { ValidationErrorDetail } from './errors.js';
import { ensureArray } from './soap-client.js';
import { formatDate, validateCuit } from './validators.js';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type Scalar =
  | { kind: 'str'; minLen?: number; maxLen?: number; values?: readonly string[]; pattern?: RegExp }
  | { kind: 'int'; min?: number; max?: number; minExclusive?: boolean }
  | { kind: 'id' }
  | { kind: 'dec'; digits: number; min?: number; max?: number; minExclusive?: boolean }
  | { kind: 'bool' }
  | { kind: 'cuit'; decodeAs: 'number' | 'string' }
  | { kind: 'date' }
  | { kind: 'date8' }
  | { kind: 'datetime' }
  | { kind: 'base64' };

export interface Field {
  readonly scalar?: Scalar;
  readonly schema?: Schema;
  readonly optional?: boolean;
  /** Si está definido, el campo es una lista con este mínimo de elementos. */
  readonly minItems?: number;
  /**
   * Nombre del elemento ítem dentro de un contenedor (ej: `deducciones` →
   * `deduccion[]`). El usuario pasa/recibe directamente el array.
   */
  readonly wrap?: string;
  /** Solo en respuestas: el elemento es obligatorio (si falta, la respuesta es inválida). */
  readonly required?: boolean;
}

export type Schema = { readonly [element: string]: Field };

// ---------------------------------------------------------------------------
// Constructores
// ---------------------------------------------------------------------------

export const str = (
  o: { minLen?: number; maxLen?: number; values?: readonly string[]; pattern?: RegExp } = {},
): Field => ({
  scalar: { kind: 'str', ...o },
});
/** Entero (`xsd:int`/`short`/`long` que entra en un `number`). */
export const int = (min?: number, max?: number, minExclusive = false): Field => ({
  scalar: { kind: 'int', min, max, minExclusive },
});
/** ID numérico largo (nroCTG, COE): se envía y se devuelve como string de dígitos. */
export const id = (): Field => ({ scalar: { kind: 'id' } });
/** `xsd:decimal` con `fractionDigits`: se redondea a `digits` decimales. */
export const dec = (digits: number, min?: number, max?: number, minExclusive = false): Field => ({
  scalar: { kind: 'dec', digits, min, max, minExclusive },
});
export const bool = (): Field => ({ scalar: { kind: 'bool' } });
/**
 * CUIT (11 dígitos con dígito verificador). Se envía normalizado; en respuestas
 * se devuelve como `number` (default) o como string (`cuit({ decodeAs: 'string' })`).
 */
export const cuit = (o: { decodeAs?: 'number' | 'string' } = {}): Field => ({
  scalar: { kind: 'cuit', decodeAs: o.decodeAs ?? 'number' },
});
/** `xsd:date` (`AAAA-MM-DD`). Acepta `Date` o string `AAAAMMDD`/`AAAA-MM-DD`. */
export const date = (): Field => ({ scalar: { kind: 'date' } });
/** Fecha `AAAAMMDD` (servicios ASMX como WSFE/WSCDC). Acepta `Date` o string `AAAAMMDD`/`AAAA-MM-DD`. */
export const date8 = (): Field => ({ scalar: { kind: 'date8' } });
/** `xsd:dateTime`. Acepta `Date` (hora de Argentina, -03:00) o string ISO-8601. */
export const datetime = (): Field => ({ scalar: { kind: 'datetime' } });
export const base64 = (): Field => ({ scalar: { kind: 'base64' } });
export const obj = (schema: Schema): Field => ({ schema });
export const opt = (f: Field): Field => ({ ...f, optional: true });
/** Respuestas: el elemento es obligatorio según el XSD (`minOccurs=1`). */
export const must = (f: Field): Field => ({ ...f, required: true });
export const list = (f: Field, minItems = 1): Field => ({ ...f, minItems });
/** Contenedor con ítems repetidos: `<container><item/>...</container>`. */
export const wrapped = (item: string, f: Field, minItems = 1): Field => ({ ...f, minItems, wrap: item });

// ---------------------------------------------------------------------------
// Encode (requests)
// ---------------------------------------------------------------------------

const AR_TIMEZONE = 'America/Argentina/Buenos_Aires';
let arDateTimeFormatter: Intl.DateTimeFormat | undefined;

/**
 * Formatea un `Date` como `xsd:dateTime` en hora de Argentina
 * (`AAAA-MM-DDTHH:mm:ss-03:00`; Argentina no tiene horario de verano desde 2009).
 */
export function formatDateTimeAR(d: Date): string {
  arDateTimeFormatter ??= new Intl.DateTimeFormat('en-US', {
    timeZone: AR_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = arDateTimeFormatter.formatToParts(d);
  const p = (t: Intl.DateTimeFormatPartTypes) => parts.find((x) => x.type === t)?.value ?? '00';
  return `${p('year')}-${p('month')}-${p('day')}T${p('hour')}:${p('minute')}:${p('second')}-03:00`;
}

const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);
}

function encodeScalar(v: unknown, s: Scalar, path: string, errors: ValidationErrorDetail[]): unknown {
  const fail = (message: string) => {
    errors.push({ field: path, message: `${path}: ${message}`, value: v });
    return undefined;
  };
  const checkRange = (n: number, min?: number, max?: number, minExclusive?: boolean) => {
    if (min !== undefined && (minExclusive ? n <= min : n < min))
      return fail(`debe ser ${minExclusive ? 'mayor a' : 'mayor o igual a'} ${min}`);
    if (max !== undefined && n > max) return fail(`debe ser menor o igual a ${max}`);
    return n;
  };
  switch (s.kind) {
    case 'str': {
      if (typeof v !== 'string') return fail('debe ser un string');
      if (s.values && !s.values.includes(v)) return fail(`valores permitidos: ${s.values.join(', ')}`);
      if (s.minLen !== undefined && v.length < s.minLen) return fail(`debe tener al menos ${s.minLen} caracteres`);
      if (s.maxLen !== undefined && v.length > s.maxLen) return fail(`debe tener como máximo ${s.maxLen} caracteres`);
      if (s.pattern && !s.pattern.test(v)) return fail(`formato inválido (${s.pattern.source})`);
      return v;
    }
    case 'int': {
      if (typeof v !== 'number' || !Number.isSafeInteger(v)) return fail('debe ser un número entero');
      return checkRange(v, s.min, s.max, s.minExclusive);
    }
    case 'id': {
      const str = typeof v === 'number' && Number.isSafeInteger(v) ? String(v) : v;
      if (typeof str !== 'string' || !/^\d{1,18}$/.test(str) || /^0+$/.test(str))
        return fail('debe ser un número positivo (string o number)');
      return str;
    }
    case 'dec': {
      if (typeof v !== 'number' || !Number.isFinite(v)) return fail('debe ser un número finito');
      const factor = 10 ** s.digits;
      const rounded = Math.round((v + Math.sign(v) * Number.EPSILON) * factor) / factor;
      if (checkRange(rounded, s.min, s.max, s.minExclusive) === undefined) return undefined;
      return rounded.toFixed(s.digits);
    }
    case 'bool':
      if (typeof v !== 'boolean') return fail('debe ser boolean');
      return v ? 'true' : 'false';
    case 'cuit':
      try {
        return validateCuit(v as string | number);
      } catch (e) {
        if (e instanceof ArcaValidationError) return fail(e.details[0]?.message ?? 'CUIT inválido');
        throw e;
      }
    case 'date':
      try {
        const f = formatDate(v as Date | string);
        return `${f.slice(0, 4)}-${f.slice(4, 6)}-${f.slice(6, 8)}`;
      } catch (e) {
        if (e instanceof ArcaValidationError) return fail('fecha inválida (Date, AAAAMMDD o AAAA-MM-DD)');
        throw e;
      }
    case 'date8':
      try {
        return formatDate(v as Date | string);
      } catch (e) {
        if (e instanceof ArcaValidationError) return fail('fecha inválida (Date, AAAAMMDD o AAAA-MM-DD)');
        throw e;
      }
    case 'datetime':
      if (v instanceof Date) {
        if (Number.isNaN(v.getTime())) return fail('fecha/hora inválida');
        return formatDateTimeAR(v);
      }
      if (typeof v !== 'string' || !DATETIME_RE.test(v) || Number.isNaN(Date.parse(v))) {
        return fail('fecha/hora inválida (Date o ISO-8601, ej: 2026-11-01T08:30:00-03:00)');
      }
      return v;
    case 'base64':
      if (typeof v !== 'string') return fail('debe ser un string base64');
      return v;
  }
}

function encodeValue(v: unknown, f: Field, path: string, errors: ValidationErrorDetail[]): unknown {
  if (f.schema) return encodeObject(v, f.schema, path, errors);
  return encodeScalar(v, f.scalar!, path, errors);
}

function encodeObject(
  input: unknown,
  schema: Schema,
  path: string,
  errors: ValidationErrorDetail[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!isPlainObject(input)) {
    errors.push({ field: path || '(raíz)', message: `${path || 'el request'} debe ser un objeto`, value: input });
    return out;
  }
  for (const key of Object.keys(input)) {
    if (!Object.hasOwn(schema, key) && input[key] !== undefined) {
      const p = path ? `${path}.${key}` : key;
      errors.push({ field: p, message: `${p}: campo desconocido (no existe en el XSD)`, value: input[key] });
    }
  }
  for (const [key, f] of Object.entries(schema)) {
    const p = path ? `${path}.${key}` : key;
    const v = input[key];
    if (v === undefined || v === null) {
      if (!f.optional) errors.push({ field: p, message: `${p} es requerido`, value: v });
      continue;
    }
    if (f.minItems !== undefined) {
      if (!Array.isArray(v)) {
        errors.push({ field: p, message: `${p} debe ser un array`, value: v });
        continue;
      }
      if (v.length < f.minItems) {
        errors.push({ field: p, message: `${p} debe tener al menos ${f.minItems} elemento(s)`, value: v });
        continue;
      }
      if (v.length === 0) continue;
      const items = v.map((item, i) => encodeValue(item, f, `${p}[${i}]`, errors));
      out[key] = f.wrap ? { [f.wrap]: items } : items;
    } else {
      out[key] = encodeValue(v, f, p, errors);
    }
  }
  return out;
}

/**
 * Valida y codifica un request según el schema (orden XSD).
 * @throws ArcaValidationError con todos los campos inválidos.
 */
export function encodeRequest(
  input: unknown,
  schema: Schema,
  context: string,
  extraCheck?: (input: Record<string, unknown>, errors: ValidationErrorDetail[]) => void,
): Record<string, unknown> {
  const errors: ValidationErrorDetail[] = [];
  const out = encodeObject(input, schema, '', errors);
  if (extraCheck && isPlainObject(input)) extraCheck(input, errors);
  if (errors.length > 0) {
    throw new ArcaValidationError(
      `Validación de ${context} fallida: ${errors.map((e) => e.message).join('; ')}`,
      errors,
      errors[0].field,
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Decode (respuestas)
// ---------------------------------------------------------------------------

function textValue(v: unknown): unknown {
  if (isPlainObject(v) && Object.hasOwn(v, '#text')) return v['#text'];
  return v;
}

/** Crea el error que se lanza ante una respuesta con forma inválida. */
export type ResponseErrorFactory = (message: string) => Error;

const defaultResponseError: ResponseErrorFactory = (message) => new ArcaResponseError(message);

function decodeScalar(raw: unknown, s: Scalar, path: string, error: ResponseErrorFactory): unknown {
  const v = textValue(raw);
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'object') throw error(`Respuesta inválida: ${path} no es un valor simple`);
  switch (s.kind) {
    case 'str':
    case 'id':
    case 'date':
    case 'date8':
    case 'datetime':
    case 'base64':
      return String(v);
    case 'cuit':
    case 'int':
    case 'dec': {
      if (v === '') return undefined;
      if (s.kind === 'cuit' && s.decodeAs === 'string') return String(v);
      const n = Number(v);
      if (!Number.isFinite(n)) throw error(`Respuesta inválida: ${path} no es numérico (${String(v)})`);
      return n;
    }
    case 'bool':
      if (v === true || v === 'true' || v === 1 || v === '1') return true;
      if (v === false || v === 'false' || v === 0 || v === '0') return false;
      if (v === '') return undefined;
      throw error(`Respuesta inválida: ${path} no es boolean (${String(v)})`);
  }
}

function decodeValue(v: unknown, f: Field, path: string, error: ResponseErrorFactory): unknown {
  if (f.schema) return decodeNode(v, f.schema, path, error);
  return decodeScalar(v, f.scalar!, path, error);
}

function decodeNode(node: unknown, schema: Schema, path: string, error: ResponseErrorFactory): Record<string, unknown> {
  if (node === undefined || node === null || node === '') return {};
  if (!isPlainObject(node)) throw error(`Respuesta inválida: ${path} no es un elemento complejo`);
  const out: Record<string, unknown> = {};
  for (const [key, f] of Object.entries(schema)) {
    const p = `${path}.${key}`;
    let v = node[key];
    if (f.minItems !== undefined) {
      if (f.wrap) v = isPlainObject(v) ? v[f.wrap] : undefined;
      out[key] = ensureArray(v as unknown).map((item, i) => decodeValue(item, f, `${p}[${i}]`, error));
      continue;
    }
    if (v === undefined || v === null) {
      if (f.required) throw error(`Respuesta inválida: falta ${p}`);
      continue;
    }
    if (Array.isArray(v)) throw error(`Respuesta inválida: ${p} aparece más de una vez`);
    const decoded = decodeValue(v, f, p, error);
    if (decoded !== undefined) out[key] = decoded;
    else if (f.required) throw error(`Respuesta inválida: ${p} vacío`);
  }
  return out;
}

/** Opciones de `decodeResponse`. */
export interface DecodeOptions {
  /** Error a lanzar ante una respuesta inválida (default: `ArcaResponseError`). */
  error?: ResponseErrorFactory;
}

/**
 * Decodifica un nodo de respuesta según el schema. Los campos que no están en
 * el schema se ignoran; las listas ausentes se devuelven como `[]`.
 *
 * @throws ArcaResponseError (o el de `options.error`) si falta un elemento
 *   obligatorio o un valor no tiene el tipo del schema.
 */
export function decodeResponse<T>(node: unknown, schema: Schema, path: string, options: DecodeOptions = {}): T {
  return decodeNode(node, schema, path, options.error ?? defaultResponseError) as T;
}
