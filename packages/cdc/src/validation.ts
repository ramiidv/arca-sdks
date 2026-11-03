import { ArcaValidationError, formatDate, validateCuit } from '@ramiidv/arca-common';
import type { ValidationErrorDetail } from '@ramiidv/arca-common';
import { encodeRequest } from '@ramiidv/arca-common/schema';
import { CMP_REQ, DOC_NRO_RE, DOC_TIPO_RE } from './schemas.js';
import type { ConstatarInput } from './types.js';

/** `docTipoReceptor`/`docNroReceptor` aceptan número o string; `''` equivale a no informarlo. */
function digitsOrUndefined(value: number | string | undefined): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'number' ? (Number.isSafeInteger(value) && value >= 0 ? String(value) : 'x') : value.trim();
}

/**
 * Comprobantes A (1-5, 34, 39, 60, 63) y "A con leyenda operación sujeta a
 * retención" (51-54, ex clase M): receptor obligatorio con CUIT (113) y número
 * de documento obligatorio (114). Misma lista que la de WSFEv1 (validación 10007).
 */
const TIPOS_A = new Set([1, 2, 3, 4, 5, 34, 39, 51, 52, 53, 54, 60, 63]);
/** Comprobantes MiPyME (FCE A, B y C): receptor obligatorio con CUIT (113; la 114 no los nombra). */
const TIPOS_MIPYME = new Set([201, 202, 203, 206, 207, 208, 211, 212, 213]);
/** Comprobantes T (195, 196, 197): documentos 80, 91, 94 o 96 (118). */
const TIPOS_T = new Set([195, 196, 197]);
const DOCS_T = new Set([80, 91, 94, 96]);
const DOC_CUIT = 80;
/** Fecha mínima de un comprobante a constatar, `YYYYMMDD` (101). */
const FECHA_MINIMA = '20130101';

/**
 * Reglas del manual que no son del WSDL: fecha desde 2013 (101), receptor con
 * CUIT en A, "A con leyenda" y MiPyME (113, 114), documentos de los
 * comprobantes T (118), receptor completo (117), CUIT del receptor e `Id` de
 * opcionales únicos.
 */
function checkReglas(input: Record<string, unknown>, errors: ValidationErrorDetail[]): void {
  const docTipo = input.docTipoReceptor as string | undefined;
  const docNro = input.docNroReceptor as string | undefined;
  const cbteTipo = input.cbteTipo as number;
  let fecha: string | undefined;
  try {
    fecha = formatDate(input.cbteFch as string | Date);
  } catch (e) {
    if (!(e instanceof ArcaValidationError)) throw e; // la fecha inválida ya la informa el schema
  }
  if (fecha !== undefined && fecha < FECHA_MINIMA)
    errors.push({
      field: 'cbteFch',
      message: 'cbteFch: no puede ser anterior al 01/01/2013 (101)',
      value: input.cbteFch,
    });
  // Un docTipoReceptor con formato inválido ya lo informa el schema.
  const tipoDoc = docTipo === undefined ? undefined : DOC_TIPO_RE.test(docTipo) ? Number(docTipo) : null;
  const exigeCUIT = TIPOS_A.has(cbteTipo) || TIPOS_MIPYME.has(cbteTipo);
  if (exigeCUIT && tipoDoc !== null && tipoDoc !== DOC_CUIT) {
    const codigos = TIPOS_A.has(cbteTipo) ? '113, 114' : '113';
    errors.push({
      field: 'docTipoReceptor',
      message: `docTipoReceptor: en el tipo ${cbteTipo} el receptor es obligatorio y con CUIT (80) (${codigos})`,
      value: input.docTipoReceptor,
    });
  }
  if (TIPOS_T.has(cbteTipo) && typeof tipoDoc === 'number' && !DOCS_T.has(tipoDoc)) {
    errors.push({
      field: 'docTipoReceptor',
      message: 'docTipoReceptor: en los comprobantes T solo se admiten 80, 91, 94 o 96 (118)',
      value: input.docTipoReceptor,
    });
  }
  // Sin docTipoReceptor en A/MiPyME ya se informó 113.
  if ((docTipo === undefined) !== (docNro === undefined) && !(docTipo === undefined && exigeCUIT)) {
    const field = docTipo === undefined ? 'docTipoReceptor' : 'docNroReceptor';
    // En A y "A con leyenda" el número de documento es obligatorio (114); en el resto, van juntos (117).
    const codigo = field === 'docNroReceptor' && TIPOS_A.has(cbteTipo) ? 114 : 117;
    errors.push({
      field,
      message: `${field}: docTipoReceptor y docNroReceptor se informan juntos (${codigo})`,
      value: input[field],
    });
  }
  // DocTipo 80 = CUIT: se valida el dígito verificador.
  if (tipoDoc === DOC_CUIT && docNro !== undefined && DOC_NRO_RE.test(docNro)) {
    try {
      validateCuit(docNro);
    } catch (e) {
      if (!(e instanceof ArcaValidationError)) throw e;
      errors.push({
        field: 'docNroReceptor',
        message: `docNroReceptor: ${e.details[0]?.message ?? e.message}`,
        value: docNro,
      });
    }
  }
  if (Array.isArray(input.opcionales)) {
    const seen = new Set<string>();
    input.opcionales.forEach((op: unknown, i) => {
      const id = (op as { id?: unknown } | null)?.id;
      if (typeof id !== 'string' || id.length < 1 || id.length > 4) return; // ya lo reporta el schema
      if (seen.has(id)) {
        errors.push({ field: `opcionales[${i}].id`, message: `opcionales[${i}].id: id "${id}" repetido`, value: id });
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
          docTipoReceptor: digitsOrUndefined(input.docTipoReceptor),
          docNroReceptor: digitsOrUndefined(input.docNroReceptor),
        }
      : input;
  return encodeRequest(normalized, CMP_REQ, 'ConstatarInput', checkReglas);
}
