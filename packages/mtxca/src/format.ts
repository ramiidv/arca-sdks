import { formatDate, ArcaValidationError } from '@ramiidv/arca-common';
import type { FechaInput } from './types.js';

/**
 * Redondea a `decimals` decimales (mitad hacia afuera del cero), sin los
 * errores de `toFixed` con binarios (ej. `1.005` → `1.01`).
 */
export function roundTo(value: number, decimals: number): number {
  const abs = Math.abs(value);
  const text = String(abs);
  const rounded = text.includes('e')
    ? Math.round(abs * 10 ** decimals) / 10 ** decimals
    : Number(`${Math.round(Number(`${text}e${decimals}`))}e-${decimals}`);
  const result = value < 0 ? -rounded : rounded;
  return result === 0 ? 0 : result; // sin -0
}

/** Redondea un importe a 2 decimales (`ImporteSubtotalSimpleType` / `ImporteTotalSimpleType`). */
export function roundImporte(value: number): number {
  return roundTo(value, 2);
}

/** Redondea cantidad, precio unitario o bonificación a 6 decimales (`DecimalSimpleType`). */
export function roundDecimal(value: number): number {
  return roundTo(value, 6);
}

/** `xsd:date`: `YYYY-MM-DD`. Lanza `ArcaValidationError` si la fecha es inválida. */
export function toXsdDate(value: FechaInput, field: string): string {
  let yyyymmdd: string;
  try {
    yyyymmdd = formatDate(value);
  } catch (e) {
    if (e instanceof ArcaValidationError) {
      throw new ArcaValidationError(
        `Fecha inválida en "${field}": ${String(value)}`,
        [{ field, message: 'Fecha inválida (Date, YYYY-MM-DD o YYYYMMDD)', value }],
        field,
        { cause: e },
      );
    }
    throw e;
  }
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;

let arTimeFormatter: Intl.DateTimeFormat | undefined;

/**
 * `xsd:dateTime`. Un `Date` se expresa en hora de Argentina como
 * `YYYY-MM-DDTHH:MM:SS` (formato del manual); un string se valida y se envía tal cual.
 */
export function toXsdDateTime(value: Date | string, field: string): string {
  const invalid = () =>
    new ArcaValidationError(
      `Fecha/hora inválida en "${field}": ${String(value)}`,
      [{ field, message: 'Fecha/hora inválida (Date o YYYY-MM-DDTHH:MM:SS)', value }],
      field,
    );
  if (typeof value === 'string') {
    if (!DATETIME_RE.test(value)) throw invalid();
    toXsdDate(value.slice(0, 10), field);
    return value;
  }
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw invalid();
  arTimeFormatter ??= new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = arTimeFormatter.formatToParts(value);
  const part = (t: Intl.DateTimeFormatPartTypes) => (parts.find((p) => p.type === t)?.value ?? '00').padStart(2, '0');
  const hour = part('hour') === '24' ? '00' : part('hour');
  return `${toXsdDate(value, field)}T${hour}:${part('minute')}:${part('second')}`;
}
