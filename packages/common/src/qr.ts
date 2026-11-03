/**
 * URL del código QR de los comprobantes electrónicos ("Especificaciones del QR
 * incluido en las facturas electrónicas", versión 1:
 * https://www.arca.gob.ar/fe/qr/documentos/QRespecificaciones.pdf).
 */
import { ArcaValidationError } from './errors.js';
import { roundHalfEven } from './rounding.js';
import { formatDate, validateCuit } from './validators.js';

/** URL base del QR según la especificación vigente. */
export const QR_URL = 'https://www.arca.gob.ar/fe/qr/';

/** Datos del QR de un comprobante (ver `generarUrlQR`). */
export interface QRInput {
  /** Fecha del comprobante: `YYYY-MM-DD`, `YYYYMMDD` o `Date` (se envía como `YYYY-MM-DD`). */
  fecha: string | Date;
  /** CUIT del emisor */
  cuit: number | string;
  /** Punto de venta (hasta 5 dígitos) */
  ptoVta: number;
  /** Tipo de comprobante (hasta 3 dígitos) */
  tipoCmp: number;
  /** Número de comprobante (hasta 8 dígitos) */
  nroCmp: number;
  /** Importe total (hasta 13 enteros; se redondea a 2 decimales) */
  importe: number;
  /** Código de moneda (3 caracteres) */
  moneda: string;
  /** Cotización (hasta 13 enteros; se redondea a 6 decimales) */
  ctz: number;
  /** Tipo de documento del receptor (de corresponder, hasta 2 dígitos) */
  tipoDocRec?: number;
  /** Número de documento del receptor (de corresponder, hasta 20 dígitos; como string si no entra en un `number`) */
  nroDocRec?: number | string;
  /** Tipo de código de autorización: "E" = CAE, "A" = CAEA */
  tipoCodAut?: 'E' | 'A';
  /** Código de autorización (CAE o CAEA, 14 dígitos). El string que devuelve ARCA se convierte a número. */
  codAut: number | string;
}

/** Opciones de `generarUrlQR`. */
export interface QROptions {
  /** URL base del QR. Default: `QR_URL` (https://www.arca.gob.ar/fe/qr/). */
  baseUrl?: string;
}

/** Lanza un ArcaValidationError con el formato de los SDKs. */
function fail(field: string, msg: string, value?: unknown): never {
  throw new ArcaValidationError(`Validación: ${msg}`, [{ field, message: msg, value }], field);
}

/** Cantidad máxima de dígitos de los campos numéricos según la especificación. */
const MAX_DIGITS = { ptoVta: 5, tipoCmp: 3, nroCmp: 8, tipoDocRec: 2, nroDocRec: 20 } as const;
/** `importe` y `ctz` tienen hasta 13 dígitos enteros en la especificación. */
const MAX_INTEGER_DIGITS = 13;
const MAX_DECIMAL = 10 ** MAX_INTEGER_DIGITS;
const NRO_DOC_REC_RE = new RegExp(`^\\d{1,${MAX_DIGITS.nroDocRec}}$`);

/**
 * Genera la URL del QR de un comprobante según la especificación de ARCA
 * ("Especificaciones del QR incluido en las facturas electrónicas", versión 1):
 * `{URL}?p={JSON en Base64}`.
 *
 * - `fecha` se envía como `YYYY-MM-DD` (acepta `YYYYMMDD`, `YYYY-MM-DD` o `Date`).
 * - `codAut` se envía como número de 14 dígitos (acepta el string que devuelve ARCA).
 * - `importe` se redondea a 2 decimales y `ctz` a 6, mitad al par (como WSFE).
 * - `tipoDocRec` / `nroDocRec` son "de corresponder": si no vienen, no se incluyen.
 * - La URL base es `QR_URL` (https://www.arca.gob.ar/fe/qr/) salvo `options.baseUrl`.
 *
 * @throws ArcaValidationError si algún dato no es válido.
 */
export function generarUrlQR(input: QRInput, options?: QROptions): string {
  let fecha: string;
  try {
    fecha = formatDate(input.fecha);
  } catch {
    fail('fecha', 'fecha debe ser un Date o una fecha existente YYYYMMDD / YYYY-MM-DD', input.fecha);
  }
  let cuit: number;
  try {
    cuit = Number(validateCuit(input.cuit));
  } catch {
    fail('cuit', 'cuit no es un CUIT válido', input.cuit);
  }
  const codAut = String(input.codAut ?? '').trim();
  if (!/^\d{14}$/.test(codAut)) fail('codAut', 'codAut debe ser el CAE/CAEA de 14 dígitos', input.codAut);
  for (const k of ['ptoVta', 'tipoCmp', 'nroCmp'] as const) {
    if (!Number.isInteger(input[k]) || input[k] < 1) fail(k, `${k} debe ser un entero >= 1`, input[k]);
    if (input[k] >= 10 ** MAX_DIGITS[k]) fail(k, `${k} debe tener como máximo ${MAX_DIGITS[k]} dígitos`, input[k]);
  }
  if (typeof input.importe !== 'number' || !Number.isFinite(input.importe))
    fail('importe', 'importe debe ser un número', input.importe);
  const importe = roundHalfEven(input.importe, 2);
  if (Math.abs(importe) >= MAX_DECIMAL)
    fail('importe', `importe debe tener como máximo ${MAX_INTEGER_DIGITS} enteros`, input.importe);
  if (typeof input.ctz !== 'number' || !Number.isFinite(input.ctz) || input.ctz <= 0)
    fail('ctz', 'ctz debe ser un número > 0', input.ctz);
  const ctz = roundHalfEven(input.ctz, 6);
  if (ctz <= 0) fail('ctz', 'ctz debe ser un número > 0', input.ctz);
  if (ctz >= MAX_DECIMAL) fail('ctz', `ctz debe tener como máximo ${MAX_INTEGER_DIGITS} enteros`, input.ctz);
  if (typeof input.moneda !== 'string' || input.moneda.length !== 3)
    fail('moneda', 'moneda debe ser el código de 3 caracteres', input.moneda);
  const tipoCodAut = input.tipoCodAut ?? 'E';
  if (tipoCodAut !== 'E' && tipoCodAut !== 'A')
    fail('tipoCodAut', 'tipoCodAut debe ser "E" (CAE) o "A" (CAEA)', tipoCodAut);

  const payload: Record<string, unknown> = {
    ver: 1,
    fecha: `${fecha.slice(0, 4)}-${fecha.slice(4, 6)}-${fecha.slice(6, 8)}`,
    cuit,
    ptoVta: input.ptoVta,
    tipoCmp: input.tipoCmp,
    nroCmp: input.nroCmp,
    importe,
    moneda: input.moneda,
    ctz,
  };
  if (input.tipoDocRec !== undefined && input.tipoDocRec !== null) {
    const max = MAX_DIGITS.tipoDocRec;
    if (!Number.isInteger(input.tipoDocRec) || input.tipoDocRec < 0 || input.tipoDocRec >= 10 ** max)
      fail('tipoDocRec', `tipoDocRec debe ser un entero de hasta ${max} dígitos`, input.tipoDocRec);
    payload.tipoDocRec = input.tipoDocRec;
  }
  // Hasta 20 dígitos: se escribe como número JSON a partir de los dígitos, sin pasar por `number`.
  let nroDocRec: string | undefined;
  const rawDocRec =
    typeof input.nroDocRec === 'string' ? input.nroDocRec.trim() : (input.nroDocRec as number | null | undefined);
  if (rawDocRec !== undefined && rawDocRec !== null && rawDocRec !== '') {
    if (typeof rawDocRec === 'number') {
      if (!Number.isSafeInteger(rawDocRec) || rawDocRec < 0)
        fail(
          'nroDocRec',
          'nroDocRec debe ser un entero >= 0 (si supera Number.MAX_SAFE_INTEGER, pasalo como string)',
          input.nroDocRec,
        );
    } else if (typeof rawDocRec !== 'string' || !NRO_DOC_REC_RE.test(rawDocRec)) {
      fail(
        'nroDocRec',
        `nroDocRec debe ser un número entero de hasta ${MAX_DIGITS.nroDocRec} dígitos`,
        input.nroDocRec,
      );
    }
    nroDocRec = String(rawDocRec).replace(/^0+(?=\d)/, '');
    payload.nroDocRec = nroDocRec;
  }
  payload.tipoCodAut = tipoCodAut;
  // 14 dígitos < 2^53: el número es exacto.
  payload.codAut = Number(codAut);

  let json = JSON.stringify(payload);
  if (nroDocRec !== undefined) json = json.replace(`"nroDocRec":"${nroDocRec}"`, `"nroDocRec":${nroDocRec}`);
  const base64 = Buffer.from(json).toString('base64');
  return `${options?.baseUrl ?? QR_URL}?p=${base64}`;
}
