/**
 * Validación local de requests contra el XSD (sin llamar a ARCA).
 *
 * Los métodos de `CpeClient` y `LpgClient` ya validan antes de enviar; estas
 * funciones sirven para validar datos de antemano (ej: en un formulario).
 * Verifican campos obligatorios, campos desconocidos, rangos y largos del XSD,
 * CUIT con dígito verificador, números finitos y fechas.
 */
import type { ValidationErrorDetail } from '@ramiidv/arca-common';
import { encodeRequest } from './schema.js';
import { AUTORIZAR_AUTOMOTOR, AUTORIZAR_FERROVIARIA } from './cpe-schemas.js';
import { AJUSTE_UNIFICADO, LIQUIDACION_AUTORIZAR } from './lpg-schemas.js';
import type { AutorizarCPEAutomotorParams, AutorizarCPEFerroviariaParams } from './cpe-types.js';
import type { AjusteUnificadoParams, LiquidacionAutorizarParams } from './lpg-types.js';

/** @internal `origen` debe tener `operador` o `productor`. */
export function requireOrigen(input: Record<string, unknown>, errors: ValidationErrorDetail[]): void {
  const origen = input['origen'];
  if (origen !== null && typeof origen === 'object') {
    const o = origen as Record<string, unknown>;
    if (o['operador'] == null && o['productor'] == null) {
      errors.push({ field: 'origen', message: 'origen: se debe informar operador o productor', value: origen });
    }
  }
}

/** @internal Las consultas de una CPE necesitan `cartaPorte` o `nroCTG`. */
export function requireCartaPorteOCtg(input: Record<string, unknown>, errors: ValidationErrorDetail[]): void {
  if (input['cartaPorte'] == null && input['nroCTG'] == null) {
    errors.push({ field: 'cartaPorte', message: 'se debe informar cartaPorte o nroCTG' });
  }
}

/** @internal El ajuste unificado necesita `ajusteCredito` y/o `ajusteDebito`. */
export function requireAjuste(input: Record<string, unknown>, errors: ValidationErrorDetail[]): void {
  if (input['ajusteCredito'] == null && input['ajusteDebito'] == null) {
    errors.push({ field: 'ajusteCredito', message: 'se debe informar ajusteCredito y/o ajusteDebito' });
  }
}

/** Valida una solicitud de `autorizarCPEAutomotor`. @throws ArcaValidationError */
export function validateAutorizarCPEAutomotor(params: AutorizarCPEAutomotorParams): void {
  encodeRequest(params, AUTORIZAR_AUTOMOTOR, 'autorizarCPEAutomotor', requireOrigen);
}

/** Valida una solicitud de `autorizarCPEFerroviaria`. @throws ArcaValidationError */
export function validateAutorizarCPEFerroviaria(params: AutorizarCPEFerroviariaParams): void {
  encodeRequest(params, AUTORIZAR_FERROVIARIA, 'autorizarCPEFerroviaria');
}

/** Valida una solicitud de `liquidacionAutorizar`. @throws ArcaValidationError */
export function validateLiquidacion(params: LiquidacionAutorizarParams): void {
  encodeRequest(params, LIQUIDACION_AUTORIZAR, 'liquidacionAutorizar');
}

/** Valida una solicitud de `liquidacionAjustarUnificado`. @throws ArcaValidationError */
export function validateAjusteUnificado(params: AjusteUnificadoParams): void {
  encodeRequest(params, AJUSTE_UNIFICADO, 'liquidacionAjustarUnificado', requireAjuste);
}
