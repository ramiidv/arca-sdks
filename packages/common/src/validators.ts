import { partesAR } from './dates.js';
import { ArcaValidationError } from './errors.js';
import type { ValidationErrorDetail } from './errors.js';

// ---------------------------------------------------------------------------
// CUIT / CUIL
// ---------------------------------------------------------------------------

const CUIT_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;
/**
 * Prefijos válidos: personas humanas (20, 23, 24, 27), personas jurídicas (30,
 * 33, 34) y CUIT país / sujetos del exterior (50, 51, 55).
 */
const VALID_PREFIXES = [20, 23, 24, 27, 30, 33, 34, 50, 51, 55];

/**
 * Normaliza un CUIT/CUIL quitando guiones, puntos y espacios.
 * Acepta string (ej: `"20-12345678-6"`, `"20.12345678.6"`) o number. No valida.
 * Un number se convierte tal cual (`2012345678.6` queda con el punto decimal).
 */
export function normalizeCuit(cuit: string | number): string {
  return typeof cuit === 'number' ? String(cuit) : String(cuit).replace(/[-.\s]/g, '');
}

/**
 * Formatea un CUIT/CUIL como XX-XXXXXXXX-X.
 * Acepta string con o sin guiones, o number.
 */
export function formatCuit(cuit: string | number): string {
  const n = normalizeCuit(cuit);
  if (!/^\d{11}$/.test(n)) {
    throw new ArcaValidationError(
      `CUIT inválido: "${cuit}". Debe tener 11 dígitos.`,
      [{ field: 'cuit', message: 'El CUIT debe tener 11 dígitos numéricos', value: cuit }],
      'cuit',
    );
  }
  return `${n.slice(0, 2)}-${n.slice(2, 10)}-${n.slice(10)}`;
}

/**
 * Valida un CUIT/CUIL (formato y dígito verificador).
 * Acepta formato XX-XXXXXXXX-X, XXXXXXXXXXX, o number.
 * Retorna el CUIT/CUIL normalizado (11 dígitos).
 * @throws ArcaValidationError si el CUIT/CUIL es inválido.
 */
export function validateCuit(cuit: string | number, field = 'cuit'): string {
  const normalized = normalizeCuit(cuit);

  if (!/^\d{11}$/.test(normalized)) {
    throw new ArcaValidationError(
      `CUIT inválido: "${cuit}". Debe tener 11 dígitos.`,
      [{ field, message: 'El CUIT debe tener 11 dígitos numéricos', value: cuit }],
      field,
    );
  }

  const prefix = parseInt(normalized.slice(0, 2), 10);
  if (!VALID_PREFIXES.includes(prefix)) {
    throw new ArcaValidationError(
      `CUIT inválido: "${cuit}". Prefijo ${prefix} no es válido.`,
      [{ field, message: `Prefijo ${prefix} no es un prefijo CUIT válido`, value: cuit }],
      field,
    );
  }

  const digits = normalized.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += digits[i] * CUIT_WEIGHTS[i];
  }

  const remainder = sum % 11;
  let expectedCheck: number;

  if (remainder === 0) {
    expectedCheck = 0;
  } else if (remainder === 1) {
    throw new ArcaValidationError(
      `CUIT inválido: "${cuit}". Dígito verificador no puede ser calculado (remainder=1).`,
      [{ field, message: 'CUIT con dígito verificador inválido (remainder=1)', value: cuit }],
      field,
    );
  } else {
    expectedCheck = 11 - remainder;
  }

  if (digits[10] !== expectedCheck) {
    throw new ArcaValidationError(
      `CUIT inválido: "${cuit}". Dígito verificador incorrecto (esperado: ${expectedCheck}, recibido: ${digits[10]}).`,
      [
        {
          field,
          message: `Dígito verificador incorrecto (esperado: ${expectedCheck}, recibido: ${digits[10]})`,
          value: cuit,
        },
      ],
      field,
    );
  }

  return normalized;
}

/**
 * Verifica si un CUIT/CUIL es válido sin lanzar error.
 * Acepta string con o sin guiones, o number.
 */
export function isValidCuit(cuit: string | number): boolean {
  try {
    validateCuit(cuit);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// CBU
// ---------------------------------------------------------------------------

/**
 * Valida un CBU (formato de 22 dígitos con checksums). Acepta espacios y
 * guiones como separadores (se quitan).
 * Retorna el CBU validado, solo dígitos.
 * @throws ArcaValidationError si el CBU es inválido.
 */
export function validateCBU(cbu: string): string {
  const raw = cbu;
  // Solo string: un CBU tiene 22 dígitos y no entra exacto en un `number`.
  cbu = typeof raw === 'string' ? raw.replace(/[\s-]/g, '') : '';
  if (!/^\d{22}$/.test(cbu)) {
    throw new ArcaValidationError(
      `CBU inválido: "${String(raw)}". Debe tener 22 dígitos.`,
      [{ field: 'cbu', message: 'El CBU debe tener 22 dígitos numéricos', value: raw }],
      'cbu',
    );
  }

  // Bloque 1: primeros 8 dígitos (código banco + sucursal + dígito verificador)
  const b1 = cbu.slice(0, 8).split('').map(Number);
  // Ponderadores oficiales BCRA: 7-1-3-9 cíclico (patrón "7139713")
  const b1w = [7, 1, 3, 9, 7, 1, 3];
  let b1sum = 0;
  for (let i = 0; i < 7; i++) b1sum += b1[i] * b1w[i];
  const b1check = (10 - (b1sum % 10)) % 10;
  if (b1[7] !== b1check) {
    throw new ArcaValidationError(
      `CBU inválido: "${cbu}". Dígito verificador del bloque 1 incorrecto.`,
      [
        {
          field: 'cbu',
          message: `Dígito verificador del bloque 1 incorrecto (esperado: ${b1check}, recibido: ${b1[7]})`,
          value: cbu,
        },
      ],
      'cbu',
    );
  }

  // Bloque 2: últimos 14 dígitos (número de cuenta + dígito verificador)
  const b2 = cbu.slice(8, 22).split('').map(Number);
  // Ponderadores oficiales BCRA: 3-9-7-1 cíclico (patrón "3971397139713")
  const b2w = [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3];
  let b2sum = 0;
  for (let i = 0; i < 13; i++) b2sum += b2[i] * b2w[i];
  const b2check = (10 - (b2sum % 10)) % 10;
  if (b2[13] !== b2check) {
    throw new ArcaValidationError(
      `CBU inválido: "${cbu}". Dígito verificador del bloque 2 incorrecto.`,
      [
        {
          field: 'cbu',
          message: `Dígito verificador del bloque 2 incorrecto (esperado: ${b2check}, recibido: ${b2[13]})`,
          value: cbu,
        },
      ],
      'cbu',
    );
  }

  return cbu;
}

/**
 * Verifica si un CBU es válido sin lanzar error.
 */
export function isValidCBU(cbu: string): boolean {
  try {
    validateCBU(cbu);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------

const AFIP_DATE_RE = /^(\d{4})(\d{2})(\d{2})$/;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function invalidDate(value: unknown, field: string, message: string): ArcaValidationError {
  return new ArcaValidationError(
    `Fecha inválida en campo "${field}": "${String(value)}". ${message}`,
    [{ field, message, value }],
    field,
  );
}

/**
 * Parsea estrictamente `YYYYMMDD` o `YYYY-MM-DD` y verifica que la fecha exista
 * (sin overflow: `20230230` o mes 13 son inválidos). Devuelve año, mes (1-12) y día.
 */
function parseCalendarDate(value: string, field: string): { y: number; m: number; d: number } {
  const match = AFIP_DATE_RE.exec(value) ?? ISO_DATE_RE.exec(value);
  if (!match) {
    throw invalidDate(value, field, 'Formato esperado: YYYYMMDD o YYYY-MM-DD.');
  }
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const probe = new Date(0);
  probe.setUTCFullYear(y, m - 1, d);
  if (y < 1 || probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    throw invalidDate(value, field, 'La fecha no existe.');
  }
  return { y, m, d };
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/**
 * Formatea una fecha al formato YYYYMMDD que usa AFIP/ARCA.
 *
 * - String `YYYYMMDD` o `YYYY-MM-DD`: se formatea literal (sin pasar por `Date`,
 *   así no hay corrimientos de zona horaria), después de validar que la fecha exista.
 * - `Date`: se toma la fecha calendario en Argentina (`America/Argentina/Buenos_Aires`).
 *
 * @throws ArcaValidationError si el string no tiene uno de esos formatos, la
 *   fecha no existe, o el `Date` es inválido.
 */
export function formatDate(date: Date | string): string {
  if (typeof date === 'string') {
    const { y, m, d } = parseCalendarDate(date, 'fecha');
    return `${pad(y, 4)}${pad(m, 2)}${pad(d, 2)}`;
  }

  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw invalidDate(date, 'fecha', 'La fecha no es válida.');
  }

  const p = partesAR(date);
  return `${p.year}${p.month}${p.day}`;
}

/**
 * Parsea una fecha en formato `YYYYMMDD` (usado por ARCA) o `YYYY-MM-DD` a `Date`.
 *
 * Devuelve el mediodía de Argentina (15:00 UTC) de ese día, así
 * `formatDate(parseArcaDate(x))` devuelve la misma fecha sin importar la zona
 * horaria del proceso.
 *
 * @throws ArcaValidationError si el formato no es exacto o la fecha no existe.
 */
export function parseArcaDate(dateStr: string): Date {
  if (typeof dateStr !== 'string') {
    throw invalidDate(dateStr, 'fecha', 'Formato esperado: YYYYMMDD o YYYY-MM-DD.');
  }
  const { y, m, d } = parseCalendarDate(dateStr, 'fecha');
  const date = new Date(Date.UTC(2000, m - 1, d, 15));
  date.setUTCFullYear(y);
  return date;
}

/** Convierte un `Date` o un string `YYYYMMDD`/`YYYY-MM-DD` a `Date`, validando con las mismas reglas. */
function toValidDate(date: Date | string, fieldName: string): Date {
  if (typeof date === 'string') {
    try {
      return parseArcaDate(date);
    } catch {
      throw invalidDate(date, fieldName, 'Formato esperado: YYYYMMDD o YYYY-MM-DD, con una fecha existente.');
    }
  }
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new ArcaValidationError(
      `Fecha inválida en campo "${fieldName}".`,
      [{ field: fieldName, message: 'La fecha no es válida', value: date }],
      fieldName,
    );
  }
  return date;
}

/**
 * Valida que un valor sea un `Date` válido, o un string `YYYYMMDD`/`YYYY-MM-DD`
 * con una fecha existente (misma validación estricta que `parseArcaDate`).
 * @throws ArcaValidationError si la fecha es inválida.
 */
export function validateFecha(date: Date | string, fieldName: string): void {
  toValidDate(date, fieldName);
}

/**
 * Valida que fechaFin no sea anterior a fechaInicio (pueden ser iguales: WSFE
 * acepta `FchServDesde == FchServHasta`). Se comparan fechas calendario de
 * Argentina: la hora de un `Date` no cuenta. Acepta `Date` o strings
 * `YYYYMMDD`/`YYYY-MM-DD` (validados como en `validateFecha`).
 * @throws ArcaValidationError si alguna fecha es inválida o fechaFin es anterior a fechaInicio.
 */
export function validateFechaRango(fechaInicio: Date | string, fechaFin: Date | string | undefined): void {
  if (fechaFin === undefined) return;

  const inicio = toValidDate(fechaInicio, 'fechaInicio');
  const fin = toValidDate(fechaFin, 'fechaFin');

  // Se comparan fechas calendario de Argentina (la hora de un `Date` no cuenta).
  if (formatDate(fin) < formatDate(inicio)) {
    throw new ArcaValidationError(
      'La fecha de fin no puede ser anterior a la fecha de inicio.',
      [
        {
          field: 'fechaFin',
          message: `fechaFin (${fin.toISOString()}) no puede ser anterior a fechaInicio (${inicio.toISOString()})`,
          value: { fechaInicio, fechaFin },
        },
      ],
      'fechaFin',
    );
  }
}

/**
 * Días de calendario de Argentina entre dos fechas (`hasta - desde`; negativo
 * si `hasta` es anterior). La hora de un `Date` no cuenta. Acepta `Date` o
 * strings `YYYYMMDD`/`YYYY-MM-DD`.
 * @throws ArcaValidationError si alguna fecha es inválida.
 */
export function diasEntre(desde: Date | string, hasta: Date | string): number {
  return (diaCalendario(hasta, 'hasta') - diaCalendario(desde, 'desde')) / MS_PER_DAY;
}

const MS_PER_DAY = 86_400_000;

/** Medianoche UTC de la fecha calendario de Argentina de `date` (también años < 100). */
function diaCalendario(date: Date | string, field: string): number {
  const f = formatDate(toValidDate(date, field));
  const t = new Date(0);
  t.setUTCFullYear(Number(f.slice(0, 4)), Number(f.slice(4, 6)) - 1, Number(f.slice(6, 8)));
  return t.getTime();
}

// ---------------------------------------------------------------------------
// Helpers para recolección de errores (uso interno de SDKs)
// ---------------------------------------------------------------------------

/**
 * Ejecuta una función de validación y recolecta errores en el array provisto
 * en vez de lanzar. Útil para validar múltiples campos y reportar todos los errores juntos.
 * Solo recolecta `ArcaValidationError`: cualquier otro error (ej: un `TypeError`
 * por un bug) se re-lanza.
 */
export function collectErrors(fn: () => void, errors: ValidationErrorDetail[]): void {
  try {
    fn();
  } catch (e) {
    if (e instanceof ArcaValidationError) {
      errors.push(...e.details);
      return;
    }
    throw e;
  }
}

/**
 * Igual que collectErrors pero prefija el nombre del campo en los errores.
 */
export function collectErrorsWithPrefix(fn: () => void, errors: ValidationErrorDetail[], prefix: string): void {
  try {
    fn();
  } catch (e) {
    if (e instanceof ArcaValidationError) {
      errors.push(
        ...e.details.map((err) => ({
          ...err,
          field: `${prefix}.${err.field}`,
        })),
      );
      return;
    }
    throw e;
  }
}
