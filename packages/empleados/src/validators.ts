import { ArcaValidationError, collectErrors, validateCuit } from '@ramiidv/arca-common';
import type { ValidationErrorDetail } from '@ramiidv/arca-common';
import { PREFIJOS_CUIL_PERSONA_FISICA, VALORES_RECTIFICACION } from './constants.js';
import { erroresDeFormato, formatFechaSR } from './serializer.js';
import type { FechaInput, OpcionesSerializacion, OpcionesValidacion, RegistroRelacionLaboral } from './types.js';

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

function requerido(
  r: RegistroRelacionLaboral,
  campos: (keyof RegistroRelacionLaboral)[],
  errores: ValidationErrorDetail[],
): void {
  for (const c of campos) {
    if (!presente(r[c])) {
      errores.push({
        field: c,
        message: `El campo "${c}" es obligatorio para el movimiento ${r.movimiento}`,
        value: r[c],
      });
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
 * - `BT`: CUIL, fecha de inicio y fecha de fin (fecha de baja).
 * - `MR`, `NA`, `NB`: CUIL y fecha de inicio.
 *
 * La fecha de inicio se exige en todos los movimientos por la nota de la pantalla de
 * ingreso masivo (manual pág. 23): "fecha inicio de vínculo son obligatorios para todos
 * los eventos".
 *
 * El servicio de ARCA aplica sus propias validaciones al importar el archivo.
 */
export const CAMPOS_OBLIGATORIOS: Readonly<
  Record<RegistroRelacionLaboral['movimiento'], readonly (keyof RegistroRelacionLaboral)[]>
> = Object.freeze({
  AT: Object.freeze(['cuil', 'fechaInicio', 'modalidadContrato', 'obraSocial', 'sucursal'] as const),
  BT: Object.freeze(['cuil', 'fechaInicio', 'fechaFin'] as const),
  MR: Object.freeze(['cuil', 'fechaInicio'] as const),
  NA: Object.freeze(['cuil', 'fechaInicio'] as const),
  NB: Object.freeze(['cuil', 'fechaInicio'] as const),
});

function enRango(
  r: RegistroRelacionLaboral,
  campo: 'rectificacion',
  validos: readonly number[],
  errores: ValidationErrorDetail[],
): void {
  const v = r[campo];
  if (!presente(v)) return;
  const n = Number(v);
  if (!validos.includes(n)) {
    errores.push({ field: campo, message: `"${campo}" debe ser uno de ${validos.join(', ')}`, value: v });
  }
}

/** Días de anticipación máxima con que se puede comunicar un alta (manual pág. 19). */
const MAX_DIAS_ANTICIPACION_ALTA = 90;

/** Suma días a una fecha `AAAA/MM/DD` (aritmética de calendario, sin zona horaria). */
function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split('/').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d + dias));
  return `${t.getUTCFullYear()}/${String(t.getUTCMonth() + 1).padStart(2, '0')}/${String(t.getUTCDate()).padStart(2, '0')}`;
}

function fechaComparable(f: FechaInput): string | undefined {
  try {
    return formatFechaSR(f);
  } catch {
    return undefined; // el error de formato ya lo informa erroresDeFormato
  }
}

/**
 * Valida un registro completo: formato (que se pueda escribir en las 130 posiciones,
 * sin propiedades desconocidas) y reglas de negocio (CUIL con dígito verificador y
 * prefijo de persona física, campos obligatorios por movimiento, rectificación 00-05,
 * fechaFin ≥ fechaInicio y, en un alta, fechaInicio a lo sumo 90 días posterior a
 * `validacion.fechaReferencia`, default hoy en Argentina). Informa todos los errores juntos.
 * @throws ArcaValidationError
 */
export function validateRegistro(
  registro: RegistroRelacionLaboral,
  opciones?: OpcionesSerializacion,
  validacion: OpcionesValidacion = {},
): void {
  const errores = erroresDeFormato(registro, opciones);
  if (errores.length === 1 && errores[0].field === 'registro') {
    throw new ArcaValidationError(errores[0].message, errores, 'registro');
  }
  const conErrorDeFormato = new Set(errores.map((e) => e.field));

  if (!conErrorDeFormato.has('cuil')) {
    collectErrors(() => validateCuilTrabajador(registro.cuil), errores);
  }
  // Object.hasOwn: un movimiento como "constructor" no debe resolver a Object.prototype.
  if (Object.hasOwn(CAMPOS_OBLIGATORIOS, registro.movimiento)) {
    requerido(registro, [...CAMPOS_OBLIGATORIOS[registro.movimiento]], errores);
  }

  // La marca de la posición 130 (0-9) ya queda acotada por el formato N(1).
  enRango(registro, 'rectificacion', VALORES_RECTIFICACION, errores);

  if (registro.movimiento === 'AT' && presente(registro.fechaInicio)) {
    const ini = fechaComparable(registro.fechaInicio!);
    let hoy: string;
    try {
      hoy = formatFechaSR(validacion.fechaReferencia ?? new Date());
    } catch (e) {
      throw new ArcaValidationError(
        `fechaReferencia inválida: ${(e as Error).message}`,
        [{ field: 'fechaReferencia', message: (e as Error).message, value: validacion.fechaReferencia }],
        'fechaReferencia',
        { cause: e },
      );
    }
    const limite = sumarDias(hoy, MAX_DIAS_ANTICIPACION_ALTA);
    if (ini && ini > limite) {
      errores.push({
        field: 'fechaInicio',
        message: `fechaInicio (${ini}) supera los ${MAX_DIAS_ANTICIPACION_ALTA} días de anticipación permitidos para el alta (límite ${limite}, referencia ${hoy})`,
        value: registro.fechaInicio,
      });
    }
  }

  if (presente(registro.fechaInicio) && presente(registro.fechaFin)) {
    const ini = fechaComparable(registro.fechaInicio!);
    const fin = fechaComparable(registro.fechaFin!);
    if (ini && fin && fin < ini) {
      errores.push({
        field: 'fechaFin',
        message: `fechaFin (${fin}) es anterior a fechaInicio (${ini})`,
        value: registro.fechaFin,
      });
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
