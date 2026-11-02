/**
 * Fechas y horas de Argentina: un único formateador `Intl` para todos los
 * helpers (`formatDate`, `formatDateTimeAR`) y los SDKs.
 */
import { ArcaValidationError } from './errors.js';

/** Zona horaria de ARCA: las fechas de los comprobantes son fechas calendario de Argentina. */
export const AR_TIMEZONE = 'America/Argentina/Buenos_Aires';

/** Partes de una fecha/hora en Argentina, con ceros a la izquierda (`year` de 4 dígitos). */
export interface PartesAR {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
  millisecond: string;
}

let arFormatter: Intl.DateTimeFormat | undefined;

/**
 * Fecha y hora de `date` en Argentina. `date` tiene que ser un `Date` válido.
 * @internal
 */
export function partesAR(date: Date): PartesAR {
  arFormatter ??= new Intl.DateTimeFormat('en-US', {
    timeZone: AR_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = arFormatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes, width: number) =>
    (parts.find((p) => p.type === type)?.value ?? '0').padStart(width, '0');
  return {
    year: part('year', 4),
    month: part('month', 2),
    day: part('day', 2),
    hour: part('hour', 2),
    minute: part('minute', 2),
    second: part('second', 2),
    // Los milisegundos no dependen de la zona horaria (los offsets son de minutos enteros).
    millisecond: String(date.getUTCMilliseconds()).padStart(3, '0'),
  };
}

/** Opciones de `formatDateTimeAR`. */
export interface FormatDateTimeAROptions {
  /** Incluir milisegundos: `AAAA-MM-DDTHH:mm:ss.SSS-03:00` (default: `false`). */
  millis?: boolean;
}

/**
 * Formatea un `Date` como `xsd:dateTime` en hora de Argentina:
 * `AAAA-MM-DDTHH:mm:ss-03:00`, o `AAAA-MM-DDTHH:mm:ss.SSS-03:00` con
 * `millis: true`. Argentina no tiene horario de verano desde 2009.
 *
 * @throws ArcaValidationError si el `Date` es inválido.
 */
export function formatDateTimeAR(d: Date, options?: FormatDateTimeAROptions): string {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    throw new ArcaValidationError(
      `Fecha/hora inválida: "${String(d)}".`,
      [{ field: 'fecha', message: 'La fecha/hora no es válida', value: d }],
      'fecha',
    );
  }
  const p = partesAR(d);
  const ms = options?.millis ? `.${p.millisecond}` : '';
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${ms}-03:00`;
}
