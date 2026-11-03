import { generarUrlQR } from '@ramiidv/arca-common';
import { Moneda } from './constants.js';
import { fail } from './validation.js';
import type { FacturaResult, QROptions } from './types.js';

/**
 * Genera la URL del QR de un comprobante según la especificación de ARCA
 * ("Especificaciones del QR incluido en las facturas electrónicas", versión 1).
 * Es la de `@ramiidv/arca-common`: importe a 2 decimales, `ctz` a 6, punto de
 * venta de hasta 5 dígitos y número de comprobante de hasta 8.
 */
export { generarUrlQR };

/** Datos del QR que no están en un `FacturaResult` (o para sobrescribirlos). */
export interface DatosQR {
  /** CUIT del emisor */
  cuit: number | string;
  /** Fecha del comprobante. Default: `factura.fecha`. */
  fecha?: string | Date;
  /** Moneda. Default: `factura.moneda`, o "PES". */
  moneda?: string;
  /** Cotización. Default: `factura.cotizacion`, o 1 si la moneda es PES. */
  ctz?: number;
  /** Tipo de documento del receptor. Default: `factura.docTipo`. */
  tipoDocRec?: number;
  /** Número de documento del receptor. Default: `factura.docNro`. */
  nroDocRec?: number | string;
  /** "E" (CAE) o "A" (CAEA). Default: `factura.tipoCodAut`, o "E". */
  tipoCodAut?: 'E' | 'A';
}

/**
 * Genera la URL del QR a partir del resultado de `facturar` / `notaCredito` /
 * `notaDebito` / `registrarFacturaCAEA` / `recuperarComprobante`.
 *
 * Con moneda extranjera y `canMisMonExt: "S"` sin cotización enviada, pasar
 * `datos.ctz` (la cotización con la que ARCA autorizó el comprobante).
 *
 * @throws ArcaValidationError si el comprobante no está aprobado o faltan datos.
 */
export function urlQRDesdeFactura(factura: FacturaResult, datos: DatosQR, options?: QROptions): string {
  if (!factura.aprobada || !factura.cae) fail('factura', 'el comprobante no está aprobado: no tiene CAE para el QR');
  const fecha = datos.fecha ?? factura.fecha;
  if (fecha === undefined) fail('fecha', 'falta la fecha del comprobante (datos.fecha)');
  const moneda = datos.moneda ?? factura.moneda ?? Moneda.PESOS;
  const ctz = datos.ctz ?? factura.cotizacion ?? (moneda === Moneda.PESOS ? 1 : undefined);
  if (ctz === undefined) fail('ctz', 'falta la cotización del comprobante (datos.ctz)');
  return generarUrlQR(
    {
      fecha,
      cuit: datos.cuit,
      ptoVta: factura.ptoVta,
      tipoCmp: factura.cbteTipo,
      nroCmp: factura.cbteNro,
      importe: factura.importes.total,
      moneda,
      ctz,
      tipoDocRec: datos.tipoDocRec ?? factura.docTipo,
      nroDocRec: datos.nroDocRec ?? factura.docNro,
      tipoCodAut: datos.tipoCodAut ?? factura.tipoCodAut ?? 'E',
      codAut: factura.cae,
    },
    options,
  );
}
