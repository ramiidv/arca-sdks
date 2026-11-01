import { ArcaValidationError, collectErrors, validateCuit } from '@ramiidv/arca-common';
import type { ValidationErrorDetail } from '@ramiidv/arca-common';
import { PREFIJOS_CUIL_PERSONA_FISICA, VALORES_MARCA_COVID_CCG, VALORES_RECTIFICACION } from './constants.js';
import { erroresDeFormato, formatFechaSR } from './serializer.js';
import type { FechaInput, OpcionesSerializacion, RegistroRelacionLaboral } from './types.js';

/**
 * Valida un CUIL de trabajador: 11 dígitos, prefijo de persona física
 * (20, 23, 24 o 27) y dígito verificador. Devuelve el CUIL normalizado (solo dígitos).
 * @throws ArcaValidationError
 */
export function validateCuilTrabajador(cuil: string | number, field = 'cuil'): string {
  let normalizado: string;
  try {
    normalizado = validateCuit(cuil);
  } catch (e) {
    if (e instanceof ArcaValidationError) {
      throw new ArcaValidationError(
        e.message.replace(/^CUIT/, 'CUIL'),
        e.details.map((d) => ({ ...d, field, message: d.message.replace(/CUIT/g, 'CUIL') })),
        field,
        { cause: e },
      );
    }
    throw e;
  }
  if (!PREFIJOS_CUIL_PERSONA_FISICA.includes(normalizado.slice(0, 2))) {
    throw new ArcaValidationError(
      `CUIL inválido: "${cuil}". El prefijo ${normalizado.slice(0, 2)} no corresponde a una persona física (20, 23, 24 o 27).`,
      [{ field, message: `Prefijo ${normalizado.slice(0, 2)} no es de persona física`, value: cuil }],
      field,
    );
  }
  return normalizado;
}

function presente(v: unknown): boolean {
  return v !== undefined && v !== null && v !== '';
}

function requerido(r: RegistroRelacionLaboral, campos: (keyof RegistroRelacionLaboral)[], errores: ValidationErrorDetail[]): void {
  for (const c of campos) {
    if (!presente(r[c])) {
      errores.push({ field: c, message: `El campo "${c}" es obligatorio para el movimiento ${r.movimiento}`, value: r[c] });
    }
  }
}

/**
 * Campos obligatorios por movimiento que valida el SDK en modo `strict`.
 *
 * - `AT`: los datos mínimos del alta según el manual (RG 5508/2024): CUIL, fecha de
 *   inicio, modalidad de contrato, obra social y domicilio de desempeño (sucursal).
 *   La fecha de fin es obligatoria en contratos a plazo fijo, pero el SDK no conoce la
 *   tabla de modalidades (no es pública) y no lo puede verificar.
 * - `BT`: CUIL y fecha de fin (fecha de baja).
 * - `MR`, `NA`, `NB`: CUIL.
 *
 * El servicio de ARCA aplica sus propias validaciones al importar el archivo.
 */
export const CAMPOS_OBLIGATORIOS: Readonly<Record<RegistroRelacionLaboral['movimiento'], readonly (keyof RegistroRelacionLaboral)[]>> =
  Object.freeze({
    AT: Object.freeze(['cuil', 'fechaInicio', 'modalidadContrato', 'obraSocial', 'sucursal'] as const),
    BT: Object.freeze(['cuil', 'fechaFin'] as const),
    MR: Object.freeze(['cuil'] as const),
    NA: Object.freeze(['cuil'] as const),
    NB: Object.freeze(['cuil'] as const),
  });

function enRango(r: RegistroRelacionLaboral, campo: 'rectificacion' | 'marcaCovidTipoContratoCCG', validos: readonly number[], errores: ValidationErrorDetail[]): void {
  const v = r[campo];
  if (!presente(v)) return;
  const n = Number(v);
  if (!validos.includes(n)) {
    errores.push({ field: campo, message: `"${campo}" debe ser uno de ${validos.join(', ')}`, value: v });
  }
}

function fechaComparable(f: FechaInput): string | undefined {
  try {
    return formatFechaSR(f);
  } catch {
    return undefined; // el error de formato ya lo informa erroresDeFormato
  }
}

/**
 * Valida un registro completo: formato (que se pueda escribir en las 130 posiciones)
 * y reglas de negocio (CUIL con dígito verificador y prefijo de persona física,
 * campos obligatorios por movimiento, rectificación 00-05, marca 0-9, fechaFin ≥ fechaInicio).
 * Informa todos los errores juntos.
 * @throws ArcaValidationError
 */
export function validateRegistro(registro: RegistroRelacionLaboral, opciones?: OpcionesSerializacion): void {
  const errores = erroresDeFormato(registro, opciones);
  if (errores.length === 1 && errores[0].field === 'registro') {
    throw new ArcaValidationError(errores[0].message, errores, 'registro');
  }
  const conErrorDeFormato = new Set(errores.map((e) => e.field));

  if (!conErrorDeFormato.has('cuil')) {
    collectErrors(() => validateCuilTrabajador(registro.cuil), errores);
  }
  const obligatorios = CAMPOS_OBLIGATORIOS[registro.movimiento];
  if (obligatorios) requerido(registro, [...obligatorios], errores);

  enRango(registro, 'rectificacion', VALORES_RECTIFICACION, errores);
  enRango(registro, 'marcaCovidTipoContratoCCG', VALORES_MARCA_COVID_CCG, errores);

  if (presente(registro.fechaInicio) && presente(registro.fechaFin)) {
    const ini = fechaComparable(registro.fechaInicio!);
    const fin = fechaComparable(registro.fechaFin!);
    if (ini && fin && fin < ini) {
      errores.push({ field: 'fechaFin', message: `fechaFin (${fin}) es anterior a fechaInicio (${ini})`, value: registro.fechaFin });
    }
  }

  if (errores.length > 0) {
    throw new ArcaValidationError(
      `Registro ${String(registro.movimiento)} inválido: ${errores.map((e) => e.message).join('; ')}`,
      errores,
      errores[0].field,
    );
  }
}
