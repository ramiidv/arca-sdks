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
  | { kind: 'bool'; format: 'boolean' | 'SN' }
  | { kind: 'double'; min?: number; max?: number }
  | { kind: 'cuit'; decodeAs: 'number' | 'string' }
  | { kind: 'date' }
  | { kind: 'date8' }
  | { kind: 'datetime' }
  | { kind: 'base64' }
  | { kind: 'custom'; encode: CustomEncoder; decode?: CustomDecoder };

/**
 * Codifica un valor de un escalar propio: devuelve el valor a enviar o llama a
 * `fail(motivo)` (que devuelve `undefined`) si es inválido.
 */
export type CustomEncoder = (value: unknown, fail: (message: string) => undefined) => unknown;
/** Decodifica el texto de un escalar propio; `fail(motivo)` lanza el error de respuesta. */
export type CustomDecoder = (text: string, fail: (message: string) => never) => unknown;

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
  /**
   * Solo en respuestas: el elemento es obligatorio. Si falta o viene vacío, la
   * respuesta es inválida (en una lista: si no viene el elemento/contenedor).
   */
  readonly required?: boolean;
  /**
   * Nombre del elemento en el XML, si difiere del nombre de la propiedad en la
   * API (ver `xml()`). Los errores usan el nombre de la API.
   */
  readonly xml?: string;
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
/** `xsd:boolean` (`true`/`false`). */
export const bool = (): Field => ({ scalar: { kind: 'bool', format: 'boolean' } });
/** Booleano como `S`/`N` (convención de los servicios Java de ARCA). La API usa `boolean`. */
export const siNo = (): Field => ({ scalar: { kind: 'bool', format: 'SN' } });
/** `xsd:double`: número finito, sin redondeo. */
export const double = (min?: number, max?: number): Field => ({ scalar: { kind: 'double', min, max } });
/**
 * Escalar propio (ej: una fecha con un formato particular del servicio, un
 * número de documento que acepta string con guiones o number).
 */
export const custom = (encode: CustomEncoder, decode?: CustomDecoder): Field => ({
  scalar: { kind: 'custom', encode, decode },
});
/**
 * Usa otro nombre de elemento en el XML: `{ cuitEmisor: xml('CUITEmisor', cuit()) }`
 * se envía y se lee como `<CUITEmisor>` pero en la API es `cuitEmisor`.
 */
export const xml = (name: string, f: Field): Field => ({ ...f, xml: name });
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

/**
 * Redondea a `digits` decimales, mitad hacia arriba (en valor absoluto), sobre
 * el valor decimal que se escribió: `8.575` → `8.58` aunque en binario sea
 * `8.57499999…`.
 */
export function roundHalfUp(value: number, digits: number): number {
  const scaled = Number((Math.abs(value) * 10 ** digits).toPrecision(15));
  const result = (Math.sign(value) * Math.round(scaled)) / 10 ** digits;
  return result === 0 ? 0 : result;
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
      const rounded = roundHalfUp(v, s.digits);
      if (checkRange(rounded, s.min, s.max, s.minExclusive) === undefined) return undefined;
      return rounded.toFixed(s.digits);
    }
    case 'bool':
      if (typeof v !== 'boolean') return fail('debe ser boolean');
      if (s.format === 'SN') return v ? 'S' : 'N';
      return v ? 'true' : 'false';
    case 'double': {
      if (typeof v !== 'number' || !Number.isFinite(v)) return fail('debe ser un número finito');
      return checkRange(v, s.min, s.max);
    }
    case 'custom':
      return s.encode(v, fail);
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
      out[f.xml ?? key] = f.wrap ? { [f.wrap]: items } : items;
    } else {
      out[f.xml ?? key] = encodeValue(v, f, p, errors);
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

/** Crea el error que se lanza ante una respuesta con forma inválida. */
export type ResponseErrorFactory = (message: string) => Error;

const defaultResponseError: ResponseErrorFactory = (message) => new ArcaResponseError(message);

/** `xsi:nil="true"` (con o sin prefijo de namespace en el atributo). */
function isNil(v: unknown): boolean {
  if (!isPlainObject(v)) return false;
  const nil = v['@_nil'] ?? v['@_xsi:nil'];
  return nil === true || nil === 'true';
}

/** Texto de un elemento simple: `#text` si tiene atributos, `''` si sólo tiene atributos. */
function textValue(v: unknown): unknown {
  if (!isPlainObject(v)) return v;
  if (Object.hasOwn(v, '#text')) return v['#text'];
  return Object.keys(v).every((k) => k.startsWith('@_')) ? '' : v;
}

/** Elemento vacío (`<x/>`, `<x></x>` o sólo con atributos). */
function isEmptyElement(v: unknown): boolean {
  return v === '' || (isPlainObject(v) && Object.keys(v).every((k) => k.startsWith('@_')));
}

function decodeScalar(raw: unknown, s: Scalar, path: string, error: ResponseErrorFactory): unknown {
  const v = textValue(raw);
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'object') throw error(`Respuesta inválida: ${path} no es un valor simple`);
  const text = String(v);
  switch (s.kind) {
    case 'str':
      if (s.values && text !== '' && !s.values.includes(text)) {
        throw error(`Respuesta inválida: ${path} tiene un valor inesperado (${text})`);
      }
      return text;
    case 'id':
    case 'date':
    case 'date8':
    case 'datetime':
    case 'base64':
      return text;
    case 'cuit':
    case 'int':
    case 'dec':
    case 'double': {
      if (text === '') return undefined;
      if (s.kind === 'cuit' && s.decodeAs === 'string') return text;
      const n = Number(text);
      if (!Number.isFinite(n)) throw error(`Respuesta inválida: ${path} no es numérico (${text})`);
      if (s.kind === 'int' && !Number.isInteger(n)) throw error(`Respuesta inválida: ${path} no es entero (${text})`);
      return n;
    }
    case 'bool': {
      if (text === '') return undefined;
      const [yes, no] = s.format === 'SN' ? ['S', 'N'] : ['true', 'false'];
      if (text === yes || (s.format === 'boolean' && text === '1')) return true;
      if (text === no || (s.format === 'boolean' && text === '0')) return false;
      throw error(`Respuesta inválida: ${path} no es ${yes}/${no} (${text})`);
    }
    case 'custom': {
      if (!s.decode) return text;
      return s.decode(text, (message) => {
        throw error(`Respuesta inválida: ${path}: ${message}`);
      });
    }
  }
}

function decodeValue(v: unknown, f: Field, path: string, ctx: DecodeContext): unknown {
  if (f.schema) return decodeNode(v, f.schema, path, ctx);
  return decodeScalar(v, f.scalar!, path, ctx.error);
}

interface DecodeContext {
  error: ResponseErrorFactory;
  emptyLists: 'array' | 'omit';
}

function decodeList(v: unknown, f: Field, p: string, ctx: DecodeContext): unknown[] | undefined {
  let items = v;
  if (f.wrap) {
    if (items === undefined || items === null) return undefined;
    if (isNil(items)) return [];
    items = isPlainObject(items) ? items[f.wrap] : undefined;
    // Contenedor presente pero vacío: lista vacía.
    if (items === undefined) return [];
  } else if (items === undefined || items === null) {
    return undefined;
  }
  return ensureArray(items as unknown)
    .filter((item) => !isNil(item))
    .map((item, i) => decodeValue(item, f, `${p}[${i}]`, ctx));
}

function decodeNode(node: unknown, schema: Schema, path: string, ctx: DecodeContext): Record<string, unknown> {
  if (node === undefined || node === null || isNil(node) || isEmptyElement(node)) node = {};
  if (!isPlainObject(node)) throw ctx.error(`Respuesta inválida: ${path} no es un elemento complejo`);
  const out: Record<string, unknown> = {};
  for (const [key, f] of Object.entries(schema)) {
    const p = `${path}.${key}`;
    const v = node[f.xml ?? key];

    // En una lista, un `xsi:nil` suelto es una lista vacía (el elemento vino).
    if (f.minItems !== undefined) {
      const list = decodeList(v, f, p, ctx);
      if (list === undefined) {
        if (f.required) throw ctx.error(`Respuesta inválida: falta ${p}`);
        if (ctx.emptyLists === 'array') out[key] = [];
      } else {
        out[key] = list;
      }
      continue;
    }

    if (v === undefined || v === null || isNil(v)) {
      if (f.required) throw ctx.error(`Respuesta inválida: falta ${p}`);
      continue;
    }
    if (Array.isArray(v)) throw ctx.error(`Respuesta inválida: ${p} aparece más de una vez`);

    if (f.schema && isEmptyElement(v) && !f.required) continue;
    const decoded = decodeValue(v, f, p, ctx);
    if (decoded === undefined || (decoded === '' && f.required)) {
      if (f.required) throw ctx.error(`Respuesta inválida: ${p} vacío`);
      continue;
    }
    out[key] = decoded;
  }
  return out;
}

/** Opciones de `decodeResponse`. */
export interface DecodeOptions {
  /** Error a lanzar ante una respuesta inválida (default: `ArcaResponseError`). */
  error?: ResponseErrorFactory;
  /**
   * Listas que no vinieron en la respuesta: `'array'` (default) las devuelve
   * como `[]`; `'omit'` no incluye la propiedad.
   */
  emptyLists?: 'array' | 'omit';
}

/**
 * Decodifica un nodo de respuesta según el schema. Los campos que no están en
 * el schema se ignoran; los elementos `xsi:nil` cuentan como ausentes; las
 * listas ausentes se devuelven como `[]` (ver `emptyLists`); un objeto opcional
 * vacío (`<x/>`) se omite.
 *
 * @throws ArcaResponseError (o el de `options.error`) si falta (o viene vacío)
 *   un elemento obligatorio, o un valor no tiene el tipo del schema (número no
 *   numérico, entero con decimales, valor fuera de `values`, S/N inválido).
 */
export function decodeResponse<T>(node: unknown, schema: Schema, path: string, options: DecodeOptions = {}): T {
  const ctx: DecodeContext = {
    error: options.error ?? defaultResponseError,
    emptyLists: options.emptyLists ?? 'array',
  };
  return decodeNode(node, schema, path, ctx) as T;
}
