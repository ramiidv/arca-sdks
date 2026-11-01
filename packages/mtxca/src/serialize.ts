import { ArcaValidationError, validateCuit } from '@ramiidv/arca-common';
import type { ValidationErrorDetail } from '@ramiidv/arca-common';
import { encodeRequest, formatDateTimeAR, must } from '@ramiidv/arca-common/schema';
import type { Schema } from '@ramiidv/arca-common/schema';
import { roundTo } from './format.js';
import { CAEA, COMPROBANTE_CAE, COMPROBANTE_CAEA } from './schemas.js';
import type { MtxcaComprobanteBase, MtxcaComprobanteCAE, MtxcaComprobanteCAEA } from './types.js';

type R = Record<string, unknown>;

/** Reglas de negocio que se reportan junto con las del XSD (ver `validation.ts`). */
export type ReglasComprobante = (c: MtxcaComprobanteBase, errors: ValidationErrorDetail[]) => void;

/** Elementos de `ComprobanteType` que en la API tienen otro nombre que en el XML. */
const XML_NAMES: Readonly<Record<string, string>> = {
  caea: 'codigoAutorizacion',
  comprobantesAsociados: 'arrayComprobantesAsociados',
  otrosTributos: 'arrayOtrosTributos',
  items: 'arrayItems',
  subtotalesIVA: 'arraySubtotalesIVA',
  datosAdicionales: 'arrayDatosAdicionales',
  compradores: 'arrayCompradores',
  actividades: 'arrayActividades',
};

/** Tipos de documento que son CUIT/CUIL (dígito verificador). */
const DOC_CUIT = new Set([80, 86]);

function isObject(v: unknown): v is R {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);
}

/** `xsd:long` que la API acepta como number o string; en documentos, también con guiones. */
function digitos(v: unknown, guiones = false): unknown {
  if (typeof v === 'number' && Number.isSafeInteger(v)) return String(v);
  return guiones && typeof v === 'string' ? v.replace(/-/g, '') : v;
}

/**
 * Redondea los `dec()` del schema con `roundTo` antes de `encodeRequest`, para
 * que lo enviado coincida con `roundImporte`/`roundDecimal` (el redondeo del
 * DSL difiere en casos como 8.575 → 8.57).
 */
function redondear(input: unknown, schema: Schema): unknown {
  if (!isObject(input)) return input;
  const out: R = { ...input };
  for (const [key, f] of Object.entries(schema)) {
    if (!Object.hasOwn(out, key)) continue;
    const round = (v: unknown): unknown => {
      if (f.schema) return redondear(v, f.schema);
      return f.scalar?.kind === 'dec' && typeof v === 'number' && Number.isFinite(v) ? roundTo(v, f.scalar.digits) : v;
    };
    const v = out[key];
    out[key] = f.minItems !== undefined && Array.isArray(v) ? v.map(round) : round(v);
  }
  return out;
}

/** Formas de entrada que la API admite y el XSD no: documentos/CAEA numéricos y `fechaHoraGen` como `Date`. */
function normalizar(c: R): R {
  const out: R = { ...c };
  if (c['numeroDocumento'] !== undefined) out['numeroDocumento'] = digitos(c['numeroDocumento'], true);
  if (c['caea'] !== undefined) out['caea'] = digitos(c['caea']);
  // Formato del manual (`YYYY-MM-DDTHH:MM:SS`, hora de Argentina, sin offset).
  const gen = c['fechaHoraGen'];
  if (gen instanceof Date && !Number.isNaN(gen.getTime())) out['fechaHoraGen'] = formatDateTimeAR(gen).slice(0, 19);
  const compradores = c['compradores'];
  if (Array.isArray(compradores)) {
    out['compradores'] = compradores.map((x: unknown) =>
      isObject(x) ? { ...x, numeroDocumento: digitos(x['numeroDocumento'], true) } : x,
    );
  }
  return out;
}

/** Con tipo de documento 80/86 el número es un CUIT: se valida el dígito verificador. */
function validarCuits(c: R, errors: ValidationErrorDetail[]): void {
  const check = (tipo: unknown, nro: unknown, field: string) => {
    if (!DOC_CUIT.has(tipo as number) || typeof nro !== 'string' || !/^\d{1,18}$/.test(nro)) return;
    try {
      validateCuit(nro);
    } catch (e) {
      if (!(e instanceof ArcaValidationError)) throw e;
      errors.push({ field, message: `${field}: ${e.details[0]?.message ?? e.message}`, value: nro });
    }
  };
  check(c['codigoTipoDocumento'], c['numeroDocumento'], 'numeroDocumento');
  const compradores = c['compradores'];
  if (Array.isArray(compradores)) {
    compradores.forEach((x: unknown, i) => {
      if (isObject(x)) check(x['codigoTipoDocumento'], x['numeroDocumento'], `compradores[${i}].numeroDocumento`);
    });
  }
}

/** Renombra a los elementos del XML (el orden de inserción es el del XSD). */
function aXml(out: R): R {
  const xml: R = {};
  for (const [key, value] of Object.entries(out)) xml[XML_NAMES[key] ?? key] = value;
  const actividades = xml['arrayActividades'] as { actividad: unknown[] } | undefined;
  if (actividades) xml['arrayActividades'] = { actividad: actividades.actividad.map((codigo) => ({ codigo })) };
  return xml;
}

/**
 * Valida un comprobante contra el XSD (`ComprobanteType`) y lo arma con los
 * elementos en el orden de la secuencia (Axis2 valida el orden). Redondea los
 * importes a 2 decimales y cantidad/precio/bonificación/cotización a 6.
 *
 * `caea`: agrega `codigoTipoAutorizacion`, `codigoAutorizacion` (el CAEA),
 * `fechaVencimiento` y `fechaHoraGen`, que en CAE no deben informarse.
 *
 * `reglas`: validaciones de negocio que se reportan en el mismo error (solo si
 * el comprobante cumple el XSD).
 *
 * @throws ArcaValidationError con todos los errores encontrados.
 */
export function buildComprobante(
  input: MtxcaComprobanteCAE | MtxcaComprobanteCAEA,
  mode: 'cae' | 'caea',
  reglas?: ReglasComprobante,
): R {
  if (!isObject(input)) {
    throw new ArcaValidationError(
      'El comprobante es obligatorio',
      [{ field: 'comprobante', message: 'es obligatorio', value: input }],
      'comprobante',
    );
  }
  const schema = mode === 'cae' ? COMPROBANTE_CAE : COMPROBANTE_CAEA;
  const c = redondear(normalizar(input), schema);
  const out = encodeRequest(c, schema, 'comprobante', (i, errors) => {
    validarCuits(i, errors);
    if (!reglas || errors.length > 0) return;
    const negocio: ValidationErrorDetail[] = [];
    reglas(input, negocio);
    errors.push(...negocio.map((e) => ({ ...e, message: `${e.field}: ${e.message}` })));
  });
  return aXml(out);
}

/** CAEA de un request (`xsd:long` de 14 dígitos; number o string). */
export function encodeCaea(caea: unknown, method: string): string {
  return encodeRequest({ caea: digitos(caea) }, { caea: must(CAEA) }, method)['caea'] as string;
}
