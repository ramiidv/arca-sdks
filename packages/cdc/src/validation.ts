import { ArcaValidationError, collectErrors, formatDate, validateCuit, validateFecha } from '@ramiidv/arca-common';
import type { ValidationErrorDetail } from '@ramiidv/arca-common';
import { CBTE_MODOS } from './constants.js';
import type { ConstatarInput } from './types.js';

/** Máximo de `ImpTotal`: 13 enteros y 2 decimales (manual WSCDC, error 7). */
const IMP_TOTAL_MAX = 1e13;

function intInRange(errors: ValidationErrorDetail[], field: string, value: unknown, min: number, max: number): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    errors.push({ field, message: `${field} debe ser un entero entre ${min} y ${max}`, value });
  }
}

function digitsOrUndefined(value: number | string | undefined): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'number' ? (Number.isSafeInteger(value) && value >= 0 ? String(value) : 'x') : value.trim();
}

/**
 * Valida el input de `constatar()` contra las restricciones del manual WSCDC.
 *
 * @throws ArcaValidationError con todos los problemas encontrados.
 */
export function validateConstatarInput(input: ConstatarInput): void {
  buildCmpReq(input);
}

/**
 * Valida y normaliza el input de `constatar()` al bloque `CmpReq` (tipo
 * `CmpDatos`), con los campos en el orden del WSDL.
 *
 * @internal
 */
export function buildCmpReq(input: ConstatarInput): Record<string, unknown> {
  const errors: ValidationErrorDetail[] = [];

  if (!(CBTE_MODOS as readonly unknown[]).includes(input.CbteModo)) {
    errors.push({ field: 'CbteModo', message: `CbteModo debe ser ${CBTE_MODOS.join(', ')}`, value: input.CbteModo });
  }

  let cuitEmisor = '';
  collectErrors(() => {
    try {
      cuitEmisor = validateCuit(input.CuitEmisor);
    } catch (e) {
      if (e instanceof ArcaValidationError) {
        throw new ArcaValidationError(
          e.message,
          e.details.map((d) => ({ ...d, field: 'CuitEmisor' })),
          'CuitEmisor',
        );
      }
      throw e;
    }
  }, errors);

  intInRange(errors, 'PtoVta', input.PtoVta, 1, 99998);
  intInRange(errors, 'CbteTipo', input.CbteTipo, 1, 999);
  intInRange(errors, 'CbteNro', input.CbteNro, 1, 99_999_999);

  let cbteFch = '';
  collectErrors(() => {
    validateFecha(input.CbteFch, 'CbteFch');
    cbteFch = formatDate(input.CbteFch);
  }, errors);

  if (typeof input.ImpTotal !== 'number' || !Number.isFinite(input.ImpTotal) || input.ImpTotal < 0) {
    errors.push({ field: 'ImpTotal', message: 'ImpTotal debe ser un número finito >= 0', value: input.ImpTotal });
  } else if (input.ImpTotal >= IMP_TOTAL_MAX) {
    errors.push({ field: 'ImpTotal', message: 'ImpTotal admite hasta 13 enteros', value: input.ImpTotal });
  }

  if (typeof input.CodAutorizacion !== 'string' || !/^\d{14}$/.test(input.CodAutorizacion)) {
    errors.push({
      field: 'CodAutorizacion',
      message: 'CodAutorizacion debe ser un string de 14 dígitos',
      value: input.CodAutorizacion,
    });
  }

  const docTipo = digitsOrUndefined(input.DocTipoReceptor);
  const docNro = digitsOrUndefined(input.DocNroReceptor);
  if ((docTipo === undefined) !== (docNro === undefined)) {
    errors.push({
      field: docTipo === undefined ? 'DocTipoReceptor' : 'DocNroReceptor',
      message: 'DocTipoReceptor y DocNroReceptor se informan juntos',
      value: docTipo === undefined ? input.DocTipoReceptor : input.DocNroReceptor,
    });
  }
  if (docTipo !== undefined && !/^\d{1,2}$/.test(docTipo)) {
    errors.push({
      field: 'DocTipoReceptor',
      message: 'DocTipoReceptor debe ser numérico de hasta 2 dígitos',
      value: input.DocTipoReceptor,
    });
  }
  if (docNro !== undefined && !/^\d{1,20}$/.test(docNro)) {
    errors.push({
      field: 'DocNroReceptor',
      message: 'DocNroReceptor debe tener solo dígitos (hasta 20)',
      value: input.DocNroReceptor,
    });
  } else if (docNro !== undefined && docTipo !== undefined && Number(docTipo) === 80) {
    // DocTipo 80 = CUIT: se valida el dígito verificador.
    collectErrors(() => {
      try {
        validateCuit(docNro);
      } catch (e) {
        if (e instanceof ArcaValidationError) {
          throw new ArcaValidationError(
            e.message,
            e.details.map((d) => ({ ...d, field: 'DocNroReceptor' })),
          );
        }
        throw e;
      }
    }, errors);
  }

  if (input.Opcionales !== undefined) {
    if (!Array.isArray(input.Opcionales) || input.Opcionales.length === 0) {
      errors.push({
        field: 'Opcionales',
        message: 'Opcionales, si se informa, debe tener al menos un Opcional',
        value: input.Opcionales,
      });
    } else {
      const seen = new Set<string>();
      input.Opcionales.forEach((op, i) => {
        const id = op?.Id;
        if (typeof id !== 'string' || id.length < 1 || id.length > 4) {
          errors.push({ field: `Opcionales[${i}].Id`, message: 'Id debe tener de 1 a 4 caracteres', value: id });
        } else if (seen.has(id)) {
          errors.push({ field: `Opcionales[${i}].Id`, message: `Id "${id}" repetido`, value: id });
        } else {
          seen.add(id);
        }
        const valor = op?.Valor;
        if (typeof valor !== 'string' || valor.length < 1 || valor.length > 250) {
          errors.push({
            field: `Opcionales[${i}].Valor`,
            message: 'Valor debe tener de 1 a 250 caracteres',
            value: valor,
          });
        }
      });
    }
  }

  if (errors.length > 0) {
    throw new ArcaValidationError(
      `Validación de ConstatarInput fallida: ${errors.map((e) => `${e.field}: ${e.message}`).join('; ')}`,
      errors,
      errors[0].field,
    );
  }

  // Orden de la secuencia CmpDatos del WSDL.
  const cmpReq: Record<string, unknown> = {
    CbteModo: input.CbteModo,
    CuitEmisor: cuitEmisor,
    PtoVta: input.PtoVta,
    CbteTipo: input.CbteTipo,
    CbteNro: input.CbteNro,
    CbteFch: cbteFch,
    ImpTotal: Math.round(input.ImpTotal * 100) / 100,
    CodAutorizacion: input.CodAutorizacion,
  };
  if (docTipo !== undefined && docNro !== undefined) {
    cmpReq.DocTipoReceptor = docTipo;
    cmpReq.DocNroReceptor = docNro;
  }
  if (input.Opcionales !== undefined) {
    cmpReq.Opcionales = { Opcional: input.Opcionales.map((op) => ({ Id: op.Id, Valor: op.Valor })) };
  }
  return cmpReq;
}
