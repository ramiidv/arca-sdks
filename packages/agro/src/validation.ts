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
import {
  AUTORIZAR_AUTOMOTOR,
  AUTORIZAR_FERROVIARIA,
  CONFIRMACION_AUTOMOTOR,
  CONFIRMACION_FERROVIARIA,
  EDITAR_AUTOMOTOR,
  EDITAR_CONFIRMADA,
  EDITAR_FERROVIARIA,
} from './cpe-schemas.js';
import { AJUSTE_UNIFICADO, CG_AUTORIZAR, LIQUIDACION_AUTORIZAR } from './lpg-schemas.js';
import type {
  AutorizarCPEAutomotorParams,
  AutorizarCPEFerroviariaParams,
  ConfirmacionDefinitivaCPEAutomotorParams,
  ConfirmacionDefinitivaCPEFerroviariaParams,
  EditarCPEAutomotorParams,
  EditarCPEConfirmadaParams,
  EditarCPEFerroviariaParams,
} from './cpe-types.js';
import type { AjusteUnificadoParams, CgAutorizarParams, LiquidacionAutorizarParams } from './lpg-types.js';

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

/** Valida una solicitud de `editarCPEAutomotor`. @throws ArcaValidationError */
export function validateEditarCPEAutomotor(params: EditarCPEAutomotorParams): void {
  encodeRequest(params, EDITAR_AUTOMOTOR, 'editarCPEAutomotor');
}

/** Valida una solicitud de `editarCPEFerroviaria`. @throws ArcaValidationError */
export function validateEditarCPEFerroviaria(params: EditarCPEFerroviariaParams): void {
  encodeRequest(params, EDITAR_FERROVIARIA, 'editarCPEFerroviaria');
}

/**
 * Valida una solicitud de `editarCPEConfirmadaAutomotor` o
 * `editarCPEConfirmadaFerroviaria` (mismo tipo). @throws ArcaValidationError
 */
export function validateEditarCPEConfirmada(params: EditarCPEConfirmadaParams): void {
  encodeRequest(params, EDITAR_CONFIRMADA, 'editarCPEConfirmada');
}

/** Valida una solicitud de `confirmacionDefinitivaCPEAutomotor`. @throws ArcaValidationError */
export function validateConfirmacionDefinitivaCPEAutomotor(params: ConfirmacionDefinitivaCPEAutomotorParams): void {
  encodeRequest(params, CONFIRMACION_AUTOMOTOR, 'confirmacionDefinitivaCPEAutomotor');
}

/** Valida una solicitud de `confirmacionDefinitivaCPEFerroviaria`. @throws ArcaValidationError */
export function validateConfirmacionDefinitivaCPEFerroviaria(params: ConfirmacionDefinitivaCPEFerroviariaParams): void {
  encodeRequest(params, CONFIRMACION_FERROVIARIA, 'confirmacionDefinitivaCPEFerroviaria');
}

/** Valida una solicitud de `liquidacionAutorizar`. @throws ArcaValidationError */
export function validateLiquidacion(params: LiquidacionAutorizarParams): void {
  encodeRequest(params, LIQUIDACION_AUTORIZAR, 'liquidacionAutorizar');
}

/** Valida una solicitud de `liquidacionAjustarUnificado`. @throws ArcaValidationError */
export function validateAjusteUnificado(params: AjusteUnificadoParams): void {
  encodeRequest(params, AJUSTE_UNIFICADO, 'liquidacionAjustarUnificado', requireAjuste);
}

/** Valida una solicitud de `cgAutorizar`. @throws ArcaValidationError */
export function validateCgAutorizar(params: CgAutorizarParams): void {
  encodeRequest(params, CG_AUTORIZAR, 'cgAutorizar');
}
