import { ArcaValidationError, formatDate, validateCuit } from '@ramiidv/arca-common';
import type { ValidationErrorDetail } from '@ramiidv/arca-common';
import {
  Condicion,
  IMPUESTO_IVA,
  MotivoAnulacion,
  REGIMENES_CON_CONDICION,
  SIRE_VERSION,
  TIPOS_CON_CERTIFICADO_ORIGINAL,
  TipoComprobante,
} from './constants.js';
import type {
  AnularCertificadoParams,
  CertificadoAnulacionRequest,
  CertificadoRequest,
  EmitirCertificadoParams,
  FechaHora,
} from './types.js';

// Reglas tomadas del XSD (tipos y opcionalidad) y del manual para el
// desarrollador v1.0.3 (longitudes, obligatoriedad condicional y tablas).

/** Argentina no tiene horario de verano desde 2009: siempre UTC-03:00. */
const AR_OFFSET_MS = -3 * 60 * 60 * 1000;
const AR_OFFSET = '-03:00';

const DATE_ONLY_RE = /^(?:\d{8}|\d{4}-\d{2}-\d{2})$/;
const DATETIME_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})?$/;

/** Formato `99999-99999999` de la tabla TIPO_COMPROBANTE. */
const NUMERO_PV_RE = /^\d{5}-\d{8}$/;

/** Largo máximo de `numeroComprobante` por tipo (tabla TIPO_COMPROBANTE, manual 5.3). `0` = formato `99999-99999999`. */
const NUMERO_COMPROBANTE_FORMATO: Record<number, number> = {
  [TipoComprobante.FACTURA]: 0,
  [TipoComprobante.RECIBO]: 0,
  [TipoComprobante.NOTA_CREDITO]: 0,
  [TipoComprobante.NOTA_DEBITO]: 0,
  [TipoComprobante.OTRO_COMPROBANTE]: 16,
  [TipoComprobante.ORDEN_DE_PAGO]: 12,
  [TipoComprobante.ESCRITURA_PUBLICA]: 16,
  [TipoComprobante.FACTURA_16_DIGITOS]: 16,
  [TipoComprobante.LIQUIDACION_SERVICIOS_PUBLICOS_A]: 0,
  [TipoComprobante.LIQUIDACION_SERVICIOS_PUBLICOS_B]: 0,
  [TipoComprobante.LIQUIDACION_SERVICIOS_PUBLICOS_A_NEGATIVA]: 0,
  [TipoComprobante.LIQUIDACION_SERVICIOS_PUBLICOS_B_NEGATIVA]: 0,
};

/** Máximo de un importe `11,2` (11 enteros + 2 decimales). */
const IMPORTE_MAX = 99_999_999_999.99;

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

function detail(field: string, message: string, value: unknown): ValidationErrorDetail {
  return { field, message, value };
}

function invalid(field: string, message: string, value: unknown): ArcaValidationError {
  return new ArcaValidationError(`Campo "${field}" inválido: ${message}`, [detail(field, message, value)], field);
}

/** Corre `fn` y acumula su error de validación en `errors` (con el nombre de campo dado). */
function collect<T>(errors: ValidationErrorDetail[], field: string, fn: () => T): T | undefined {
  try {
    return fn();
  } catch (e) {
    if (e instanceof ArcaValidationError) {
      errors.push(...e.details.map((d) => ({ ...d, field })));
      return undefined;
    }
    throw e;
  }
}

function formatInstant(ms: number): string {
  const d = new Date(ms + AR_OFFSET_MS);
  return (
    `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}` +
    `T${pad(d.getUTCHours(), 2)}:${pad(d.getUTCMinutes(), 2)}:${pad(d.getUTCSeconds(), 2)}` +
    `.${pad(d.getUTCMilliseconds(), 3)}${AR_OFFSET}`
  );
}

/** Valida una fecha calendario `YYYYMMDD`/`YYYY-MM-DD` con common y la devuelve como `YYYY-MM-DD`. */
function calendarDate(value: string, field: string): string {
  let ymd: string;
  try {
    ymd = formatDate(value);
  } catch {
    throw invalid(field, 'la fecha no existe o tiene un formato inválido', value);
  }
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

/**
 * Serializa una fecha/hora para un campo `xs:dateTime` de SIRE con el formato
 * `AAAA-MM-DDThh:mm:ss.SSS-03:00` (manual, 5.1). Ver `FechaHora`.
 *
 * @throws ArcaValidationError si la fecha es inválida o no existe.
 */
export function formatSireDateTime(value: FechaHora, field = 'fecha'): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw invalid(field, 'la fecha no es válida', value);
    return formatInstant(value.getTime());
  }
  if (typeof value !== 'string') throw invalid(field, 'se esperaba un Date o un string', value);

  const s = value.trim();
  if (DATE_ONLY_RE.test(s)) return `${calendarDate(s, field)}T00:00:00.000${AR_OFFSET}`;

  const m = DATETIME_RE.exec(s);
  if (!m) {
    throw invalid(field, 'formato esperado: YYYY-MM-DD o YYYY-MM-DDThh:mm[:ss[.SSS]][Z|±hh:mm]', value);
  }
  const [, datePart, hh, mi, ss = '00', frac = '', zone] = m;
  const date = calendarDate(datePart, field);
  if (Number(hh) > 23 || Number(mi) > 59 || Number(ss) > 59) throw invalid(field, 'la hora no es válida', value);
  const millis = frac.padEnd(3, '0').slice(0, 3);

  if (zone === undefined) return `${date}T${hh}:${mi}:${ss}.${millis}${AR_OFFSET}`;
  const instant = Date.parse(`${date}T${hh}:${mi}:${ss}.${millis}${zone === 'Z' ? 'Z' : zone}`);
  if (Number.isNaN(instant)) throw invalid(field, 'la fecha no es válida', value);
  return formatInstant(instant);
}

/**
 * Valida un importe `xs:double` de SIRE (11 enteros + 2 decimales, sin signo)
 * y lo devuelve redondeado a 2 decimales (`"2100.00"`).
 *
 * @throws ArcaValidationError si no es un número finito, es negativo o excede 11 enteros.
 */
export function formatImporte(value: number, field = 'importe'): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw invalid(field, 'debe ser un número finito', value);
  }
  if (value < 0) throw invalid(field, 'no puede ser negativo', value);
  const rounded = Math.round(value * 100) / 100;
  if (rounded > IMPORTE_MAX) throw invalid(field, 'excede 11 dígitos enteros', value);
  return rounded.toFixed(2);
}

function checkInteger(
  errors: ValidationErrorDetail[],
  field: string,
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    errors.push(detail(field, `debe ser un entero entre ${min} y ${max}`, value));
    return undefined;
  }
  return value;
}

function checkText(
  errors: ValidationErrorDetail[],
  field: string,
  value: unknown,
  maxLength: number,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(detail(field, 'debe ser un texto no vacío', value));
    return undefined;
  }
  if (value.length > maxLength) {
    errors.push(detail(field, `admite hasta ${maxLength} caracteres`, value));
    return undefined;
  }
  return value;
}

function checkBoolean(errors: ValidationErrorDetail[], field: string, value: unknown): boolean | undefined {
  if (typeof value !== 'boolean') {
    errors.push(detail(field, 'debe ser true o false', value));
    return undefined;
  }
  return value;
}

function required(errors: ValidationErrorDetail[], field: string, value: unknown, when: string): void {
  if (value === undefined) errors.push(detail(field, when ? `es obligatorio ${when}` : 'es obligatorio', value));
}

function forbidden(errors: ValidationErrorDetail[], field: string, value: unknown, when: string): void {
  if (value !== undefined) errors.push(detail(field, `no corresponde ${when}`, value));
}

function throwIfErrors(errors: ValidationErrorDetail[], what: string): void {
  if (errors.length === 0) return;
  throw new ArcaValidationError(
    `${what} inválido: ${errors.map((e) => `${e.field}: ${e.message}`).join('; ')}`,
    errors,
    errors[0].field,
  );
}

/**
 * Valida el CUIT del agente de retención (dígito verificador) y lo devuelve
 * como número (`cuitAgente` es `xs:long`).
 */
export function toCuitNumber(cuit: string | number, field = 'cuit'): number {
  try {
    return Number(validateCuit(cuit));
  } catch (e) {
    if (e instanceof ArcaValidationError) {
      throw new ArcaValidationError(
        e.message,
        e.details.map((d) => ({ ...d, field })),
        field,
        { cause: e },
      );
    }
    throw e;
  }
}

/**
 * Valida los datos de un certificado a emitir y arma el `certificado` del
 * request, serializado y en el orden del XSD. Acumula todos los errores.
 *
 * @throws ArcaValidationError con un detalle por campo inválido.
 */
export function buildCertificadoRequest(params: EmitirCertificadoParams): CertificadoRequest {
  const errors: ValidationErrorDetail[] = [];
  const p = params ?? ({} as EmitirCertificadoParams);
  const date = (field: keyof EmitirCertificadoParams) => {
    const value = p[field] as FechaHora | undefined;
    return value === undefined ? undefined : collect(errors, field, () => formatSireDateTime(value, field));
  };
  const importe = (field: keyof EmitirCertificadoParams) => {
    const value = p[field] as number | undefined;
    return value === undefined ? undefined : collect(errors, field, () => formatImporte(value, field));
  };
  const req = (field: keyof EmitirCertificadoParams) => required(errors, field, p[field], '');

  // Obligatorios del XSD
  for (const f of [
    'regimen',
    'fechaRetencion',
    'imposibilidadRetencion',
    'importeRetencion',
    'importeBaseCalculo',
    'regimenExclusion',
    'tipoComprobante',
    'fechaComprobante',
    'importeComprobante',
    'cuitRetenido',
  ] as const) {
    req(f);
  }

  const codigoTrazabilidad = checkText(errors, 'codigoTrazabilidad', p.codigoTrazabilidad, 36);
  const regimen = p.regimen === undefined ? undefined : checkInteger(errors, 'regimen', p.regimen, 1, 999);
  const fechaRetencion = date('fechaRetencion');

  let condicion: number | undefined;
  if (p.condicion !== undefined) {
    if (p.condicion !== Condicion.INSCRIPTO && p.condicion !== Condicion.NO_INSCRIPTO) {
      errors.push(detail('condicion', 'debe existir en la tabla CONDICION (1 o 2)', p.condicion));
    } else {
      condicion = p.condicion;
    }
  } else if (regimen !== undefined && REGIMENES_CON_CONDICION.includes(regimen)) {
    required(errors, 'condicion', undefined, `para el régimen ${regimen}`);
  }

  const imposibilidadRetencion =
    p.imposibilidadRetencion === undefined
      ? undefined
      : checkBoolean(errors, 'imposibilidadRetencion', p.imposibilidadRetencion);
  const motivoNoRetencion = checkText(errors, 'motivoNoRetencion', p.motivoNoRetencion, 30);
  if (imposibilidadRetencion === true) {
    required(errors, 'motivoNoRetencion', p.motivoNoRetencion, 'cuando imposibilidadRetencion es true');
  }

  const importeRetencion = importe('importeRetencion');
  const importeBaseCalculo = importe('importeBaseCalculo');

  const regimenExclusion =
    p.regimenExclusion === undefined ? undefined : checkBoolean(errors, 'regimenExclusion', p.regimenExclusion);
  let porcentajeExclusion: string | undefined;
  if (p.porcentajeExclusion !== undefined) {
    if (p.porcentajeExclusion !== 50 && p.porcentajeExclusion !== 100) {
      errors.push(detail('porcentajeExclusion', 'debe ser 50 o 100', p.porcentajeExclusion));
    } else {
      porcentajeExclusion = p.porcentajeExclusion.toFixed(2);
    }
  }
  const fechaPublicacion = date('fechaPublicacion');
  if (regimenExclusion === true) {
    required(errors, 'porcentajeExclusion', p.porcentajeExclusion, 'cuando regimenExclusion es true');
    required(errors, 'fechaPublicacion', p.fechaPublicacion, 'cuando regimenExclusion es true');
  }

  let tipoComprobante: number | undefined;
  if (p.tipoComprobante !== undefined) {
    if (typeof p.tipoComprobante !== 'number' || !Object.hasOwn(NUMERO_COMPROBANTE_FORMATO, p.tipoComprobante)) {
      errors.push(detail('tipoComprobante', 'debe existir en la tabla TIPO_COMPROBANTE', p.tipoComprobante));
    } else {
      tipoComprobante = p.tipoComprobante;
    }
  }
  const fechaComprobante = date('fechaComprobante');

  let numeroComprobante: string | undefined;
  if (tipoComprobante !== undefined) {
    required(errors, 'numeroComprobante', p.numeroComprobante, `para el tipoComprobante ${tipoComprobante}`);
    const maxLength = NUMERO_COMPROBANTE_FORMATO[tipoComprobante];
    if (p.numeroComprobante !== undefined) {
      if (maxLength === 0) {
        if (typeof p.numeroComprobante !== 'string' || !NUMERO_PV_RE.test(p.numeroComprobante)) {
          errors.push(detail('numeroComprobante', 'formato esperado: 99999-99999999', p.numeroComprobante));
        } else {
          numeroComprobante = p.numeroComprobante;
        }
      } else {
        numeroComprobante = checkText(errors, 'numeroComprobante', p.numeroComprobante, maxLength);
      }
    }
  }

  const coe = checkText(errors, 'coe', p.coe, 12);
  const coeOriginal = checkText(errors, 'coeOriginal', p.coeOriginal, 12);
  const cae = checkText(errors, 'cae', p.cae, 14);
  const importeComprobante = importe('importeComprobante');

  const motivoEmisionNotaCredito = checkText(errors, 'motivoEmisionNotaCredito', p.motivoEmisionNotaCredito, 30);
  if (tipoComprobante === TipoComprobante.NOTA_CREDITO) {
    required(errors, 'motivoEmisionNotaCredito', p.motivoEmisionNotaCredito, 'para una nota de crédito (tipo 3)');
  } else if (tipoComprobante !== undefined) {
    forbidden(
      errors,
      'motivoEmisionNotaCredito',
      p.motivoEmisionNotaCredito,
      `para el tipoComprobante ${tipoComprobante}`,
    );
  }

  const cuitRetenido =
    p.cuitRetenido === undefined
      ? undefined
      : collect(errors, 'cuitRetenido', () => toCuitNumber(p.cuitRetenido, 'cuitRetenido'));

  const numeroCertificadoOriginal = checkText(errors, 'numeroCertificadoOriginal', p.numeroCertificadoOriginal, 25);
  const fechaRetencionCertificadoOriginal = date('fechaRetencionCertificadoOriginal');
  const importeCertificadoOriginal = importe('importeCertificadoOriginal');
  if (tipoComprobante !== undefined) {
    const original = [
      'numeroCertificadoOriginal',
      'fechaRetencionCertificadoOriginal',
      'importeCertificadoOriginal',
    ] as const;
    const when = `para el tipoComprobante ${tipoComprobante}`;
    for (const f of original) {
      if (TIPOS_CON_CERTIFICADO_ORIGINAL.includes(tipoComprobante)) required(errors, f, p[f], when);
      else forbidden(errors, f, p[f], when);
    }
  }

  if (Object.hasOwn(p, 'motivoAnulacion')) {
    errors.push(
      detail(
        'motivoAnulacion',
        'no se debe enviar en emitir (usar anularCertificado)',
        (p as { motivoAnulacion?: unknown }).motivoAnulacion,
      ),
    );
  }

  throwIfErrors(errors, 'Certificado');

  // Sin errores, todos los obligatorios están definidos.
  return {
    version: SIRE_VERSION,
    codigoTrazabilidad,
    impuesto: IMPUESTO_IVA,
    regimen: regimen!,
    fechaRetencion: fechaRetencion!,
    condicion,
    imposibilidadRetencion: imposibilidadRetencion!,
    motivoNoRetencion,
    importeRetencion: importeRetencion!,
    importeBaseCalculo: importeBaseCalculo!,
    regimenExclusion: regimenExclusion!,
    porcentajeExclusion,
    fechaPublicacion,
    tipoComprobante: tipoComprobante!,
    fechaComprobante: fechaComprobante!,
    numeroComprobante,
    coe,
    coeOriginal,
    cae,
    importeComprobante: importeComprobante!,
    motivoEmisionNotaCredito,
    cuitRetenido: cuitRetenido!,
    numeroCertificadoOriginal,
    fechaRetencionCertificadoOriginal,
    importeCertificadoOriginal,
  };
}

/**
 * Valida los datos de una anulación y arma el `certificadoAnulacion` del request.
 *
 * @throws ArcaValidationError con un detalle por campo inválido.
 */
export function buildAnulacionRequest(params: AnularCertificadoParams): CertificadoAnulacionRequest {
  const errors: ValidationErrorDetail[] = [];
  const p = params ?? ({} as AnularCertificadoParams);

  const codigoTrazabilidad = checkText(errors, 'codigoTrazabilidad', p.codigoTrazabilidad, 36);
  required(errors, 'numeroCertificado', p.numeroCertificado, '');
  const numeroCertificado = checkText(errors, 'numeroCertificado', p.numeroCertificado, 25);
  required(errors, 'motivoAnulacion', p.motivoAnulacion, '');
  const motivos: number[] = Object.values(MotivoAnulacion).filter((v): v is number => typeof v === 'number');
  if (p.motivoAnulacion !== undefined && !motivos.includes(p.motivoAnulacion)) {
    errors.push(detail('motivoAnulacion', 'debe existir en la tabla MOTIVO_DE_ANULACION (1 a 4)', p.motivoAnulacion));
  }

  throwIfErrors(errors, 'Anulación');

  return {
    version: SIRE_VERSION,
    codigoTrazabilidad,
    impuesto: IMPUESTO_IVA,
    numeroCertificado: numeroCertificado!,
    motivoAnulacion: p.motivoAnulacion,
  };
}
