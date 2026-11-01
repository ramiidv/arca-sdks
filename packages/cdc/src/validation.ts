import { ArcaValidationError, validateCuit } from '@ramiidv/arca-common';
import type { ValidationErrorDetail } from '@ramiidv/arca-common';
import { encodeRequest } from '@ramiidv/arca-common/schema';
import { CMP_REQ, DOC_NRO_RE } from './schemas.js';
import type { ConstatarInput } from './types.js';

/** `DocTipoReceptor`/`DocNroReceptor` aceptan número o string; `''` equivale a no informarlo. */
function digitsOrUndefined(value: number | string | undefined): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'number' ? (Number.isSafeInteger(value) && value >= 0 ? String(value) : 'x') : value.trim();
}

/** Reglas del manual que no son del WSDL: receptor completo, CUIT del receptor e `Id` de opcionales únicos. */
function checkReglas(input: Record<string, unknown>, errors: ValidationErrorDetail[]): void {
  const docTipo = input.DocTipoReceptor as string | undefined;
  const docNro = input.DocNroReceptor as string | undefined;
  if ((docTipo === undefined) !== (docNro === undefined)) {
    const field = docTipo === undefined ? 'DocTipoReceptor' : 'DocNroReceptor';
    errors.push({
      field,
      message: `${field}: DocTipoReceptor y DocNroReceptor se informan juntos`,
      value: input[field],
    });
  }
  // DocTipo 80 = CUIT: se valida el dígito verificador.
  if (docTipo !== undefined && Number(docTipo) === 80 && docNro !== undefined && DOC_NRO_RE.test(docNro)) {
    try {
      validateCuit(docNro);
    } catch (e) {
      if (!(e instanceof ArcaValidationError)) throw e;
      errors.push({
        field: 'DocNroReceptor',
        message: `DocNroReceptor: ${e.details[0]?.message ?? e.message}`,
        value: docNro,
      });
    }
  }
  if (Array.isArray(input.Opcionales)) {
    const seen = new Set<string>();
    input.Opcionales.forEach((op: unknown, i) => {
      const id = (op as { Id?: unknown } | null)?.Id;
      if (typeof id !== 'string' || id.length < 1 || id.length > 4) return; // ya lo reporta el schema
      if (seen.has(id)) {
        errors.push({ field: `Opcionales[${i}].Id`, message: `Opcionales[${i}].Id: Id "${id}" repetido`, value: id });
      }
      seen.add(id);
    });
  }
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
  const normalized =
    input !== null && typeof input === 'object'
      ? {
          ...input,
          DocTipoReceptor: digitsOrUndefined(input.DocTipoReceptor),
          DocNroReceptor: digitsOrUndefined(input.DocNroReceptor),
        }
      : input;
  return encodeRequest(normalized, CMP_REQ, 'ConstatarInput', checkReglas);
}
