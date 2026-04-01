import {
  ArcaValidationError,
  collectErrors,
} from '@ramiidv/arca-common';
import type { ValidationErrorDetail } from '@ramiidv/arca-common';
import type { CartaPorteAutomotor, SolicitudCTG, Liquidacion } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validateCuitField(
  value: unknown,
  fieldName: string,
  errors: ValidationErrorDetail[],
): void {
  if (value == null) {
    errors.push({ field: fieldName, message: `${fieldName} es requerido`, value });
    return;
  }
  const str = String(value);
  if (!/^\d{11}$/.test(str)) {
    errors.push({
      field: fieldName,
      message: `${fieldName} debe tener exactamente 11 digitos numericos`,
      value,
    });
  }
}

function requirePositive(
  value: unknown,
  fieldName: string,
  errors: ValidationErrorDetail[],
): void {
  if (value == null) {
    errors.push({ field: fieldName, message: `${fieldName} es requerido`, value });
    return;
  }
  if (typeof value !== 'number' || value <= 0) {
    errors.push({
      field: fieldName,
      message: `${fieldName} debe ser un numero mayor a 0`,
      value,
    });
  }
}

function requireNonNegative(
  value: unknown,
  fieldName: string,
  errors: ValidationErrorDetail[],
): void {
  if (value == null) {
    errors.push({ field: fieldName, message: `${fieldName} es requerido`, value });
    return;
  }
  if (typeof value !== 'number' || value < 0) {
    errors.push({
      field: fieldName,
      message: `${fieldName} debe ser un numero mayor o igual a 0`,
      value,
    });
  }
}

function throwIfErrors(errors: ValidationErrorDetail[], context: string): void {
  if (errors.length > 0) {
    throw new ArcaValidationError(
      `Validacion de ${context} fallida: ${errors.map((e) => e.message).join('; ')}`,
      errors,
      context,
    );
  }
}

// ---------------------------------------------------------------------------
// CPE Validation
// ---------------------------------------------------------------------------

/**
 * Valida los datos de una Carta de Porte Electronica antes de enviar al servicio WSCPE.
 *
 * Campos validados:
 * - cuitTitularCartaPorte: 11 digitos
 * - sucursal: > 0
 * - nroOrden: >= 0
 * - codGrano: > 0
 * - pesoNeto: > 0
 * - cuitDestino: 11 digitos
 * - codLocalidadDestino: > 0
 * - cuitTransportista: 11 digitos
 *
 * @throws ArcaValidationError con detalles de todos los campos invalidos.
 */
export function validateCPE(cpe: CartaPorteAutomotor): void {
  const errors: ValidationErrorDetail[] = [];

  validateCuitField(cpe.cuitTitularCartaPorte, 'cuitTitularCartaPorte', errors);
  requirePositive(cpe.sucursal, 'sucursal', errors);
  requireNonNegative(cpe.nroOrden, 'nroOrden', errors);
  requirePositive(cpe.codGrano, 'codGrano', errors);
  requirePositive(cpe.pesoNeto, 'pesoNeto', errors);
  validateCuitField(cpe.cuitDestino, 'cuitDestino', errors);
  requirePositive(cpe.codLocalidadDestino, 'codLocalidadDestino', errors);
  validateCuitField(cpe.cuitTransportista, 'cuitTransportista', errors);

  throwIfErrors(errors, 'CartaPorteAutomotor');
}

// ---------------------------------------------------------------------------
// CTG Validation
// ---------------------------------------------------------------------------

/**
 * Valida los datos de una solicitud de CTG antes de enviar al servicio WSCTG.
 *
 * Campos validados:
 * - nroCartaPorte: > 0
 * - codEspecie: > 0
 * - pesoNeto: > 0
 * - cuitDestino: 11 digitos
 * - cuitDestinatario: 11 digitos
 * - codLocalidadOrigen: > 0
 * - codLocalidadDestino: > 0
 * - codCosecha: > 0
 *
 * @throws ArcaValidationError con detalles de todos los campos invalidos.
 */
export function validateCTG(ctg: SolicitudCTG): void {
  const errors: ValidationErrorDetail[] = [];

  requirePositive(ctg.nroCartaPorte, 'nroCartaPorte', errors);
  requirePositive(ctg.codEspecie, 'codEspecie', errors);
  requirePositive(ctg.pesoNeto, 'pesoNeto', errors);
  validateCuitField(ctg.cuitDestino, 'cuitDestino', errors);
  validateCuitField(ctg.cuitDestinatario, 'cuitDestinatario', errors);
  requirePositive(ctg.codLocalidadOrigen, 'codLocalidadOrigen', errors);
  requirePositive(ctg.codLocalidadDestino, 'codLocalidadDestino', errors);
  requirePositive(ctg.codCosecha, 'codCosecha', errors);

  if (ctg.cuitTransportista != null) {
    validateCuitField(ctg.cuitTransportista, 'cuitTransportista', errors);
  }

  throwIfErrors(errors, 'SolicitudCTG');
}

// ---------------------------------------------------------------------------
// Liquidacion Validation
// ---------------------------------------------------------------------------

/**
 * Valida los datos de una liquidacion primaria de granos antes de enviar al servicio WSLPG.
 *
 * Campos validados:
 * - cuitComprador: 11 digitos
 * - cuitVendedor: 11 digitos
 * - codGrano: > 0
 * - pesoNeto: > 0
 * - precioRefTn: >= 0 (si presente)
 *
 * @throws ArcaValidationError con detalles de todos los campos invalidos.
 */
export function validateLiquidacion(liq: Liquidacion): void {
  const errors: ValidationErrorDetail[] = [];

  validateCuitField(liq.cuitComprador, 'cuitComprador', errors);
  validateCuitField(liq.cuitVendedor, 'cuitVendedor', errors);
  requirePositive(liq.codGrano, 'codGrano', errors);
  requirePositive(liq.pesoNeto, 'pesoNeto', errors);

  if (liq.precioRefTn != null) {
    requireNonNegative(liq.precioRefTn, 'precioRefTn', errors);
  }

  if (liq.cuitCorredorVendedor != null) {
    validateCuitField(liq.cuitCorredorVendedor, 'cuitCorredorVendedor', errors);
  }

  if (liq.cuitCorredorComprador != null) {
    validateCuitField(liq.cuitCorredorComprador, 'cuitCorredorComprador', errors);
  }

  throwIfErrors(errors, 'Liquidacion');
}
