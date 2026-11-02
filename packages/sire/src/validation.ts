import { ArcaValidationError, formatDate, formatDateTimeAR } from '@ramiidv/arca-common';
import type { ValidationErrorDetail } from '@ramiidv/arca-common';
import { encodeRequest } from '@ramiidv/arca-common/schema';
import {
  IMPUESTO_IVA,
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
import { CERTIFICADO, CERTIFICADO_ANULACION } from './schemas.js';

// Tipos, orden y opcionalidad del XSD, y largos/rangos por campo del manual
// para el desarrollador v1.0.3: en los schemas de `schemas.ts`. Acá quedan las
// fechas (formato propio de SIRE) y las reglas del manual que combinan campos.

const DATE_ONLY_RE = /^(?:\d{8}|\d{4}-\d{2}-\d{2})$/;
const DATETIME_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})?$/;

/** Formato `99999-99999999` de la tabla TIPO_COMPROBANTE. */
const NUMERO_PV_RE = /^\d{5}-\d{8}$/;
/**
 * `X(n)` de la tabla TIPO_COMPROBANTE: "caracteres alfanuméricos". Se aceptan
 * también los separadores habituales (`-`, `/`, `.`) para no rechazar localmente
 * numeraciones que ARCA podría aceptar; espacios y caracteres no ASCII no.
 */
const ALFANUMERICO_RE = /^[A-Za-z0-9][A-Za-z0-9./-]*$/;

/** Fecha de retención mínima: "a partir del 01-Diciembre-2019" (manual, 3.2.2). */
const FECHA_RETENCION_MINIMA = '2019-12-01';

/** Tipos de comprobante con valor negativo (tabla TIPO_COMPROBANTE): admiten `importeComprobante` < 0. */
const TIPOS_CON_VALOR_NEGATIVO: readonly number[] = [
  TipoComprobante.LIQUIDACION_SERVICIOS_PUBLICOS_A_NEGATIVA,
  TipoComprobante.LIQUIDACION_SERVICIOS_PUBLICOS_B_NEGATIVA,
];

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

/** Detalle de error con el formato de `encodeRequest` (`message` empieza con el campo). */
function detail(field: string, message: string, value: unknown): ValidationErrorDetail {
  return { field, message: `${field}: ${message}`, value };
}

function invalid(field: string, message: string, value: unknown): ArcaValidationError {
  return new ArcaValidationError(`Campo "${field}" inválido: ${message}`, [detail(field, message, value)], field);
}

/** Instante en hora de Argentina, `AAAA-MM-DDThh:mm:ss.SSS-03:00`. */
function formatInstant(ms: number): string {
  return formatDateTimeAR(new Date(ms), { millis: true });
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
  if (DATE_ONLY_RE.test(s)) return `${calendarDate(s, field)}T00:00:00.000-03:00`;

  const m = DATETIME_RE.exec(s);
  if (!m) {
    throw invalid(field, 'formato esperado: YYYY-MM-DD o YYYY-MM-DDThh:mm[:ss[.SSS]][Z|±hh:mm]', value);
  }
  const [, datePart, hh, mi, ss = '00', frac = '', zone] = m;
  const date = calendarDate(datePart, field);
  if (Number(hh) > 23 || Number(mi) > 59 || Number(ss) > 59) throw invalid(field, 'la hora no es válida', value);
  const millis = frac.padEnd(3, '0').slice(0, 3);

  // Argentina no tiene horario de verano desde 2009: siempre UTC-03:00.
  if (zone === undefined) return `${date}T${hh}:${mi}:${ss}.${millis}-03:00`;
  const instant = Date.parse(`${date}T${hh}:${mi}:${ss}.${millis}${zone === 'Z' ? 'Z' : zone}`);
  if (Number.isNaN(instant)) throw invalid(field, 'la fecha no es válida', value);
  return formatInstant(instant);
}

/**
 * Valida un importe `xs:double` de SIRE (11 enteros + 2 decimales) y lo devuelve
 * redondeado a 2 decimales (`"2100.00"`). Valida como `importeRetencion`: no
 * negativo (el manual no lo dice; es criterio del SDK).
 *
 * @throws ArcaValidationError si no es un número finito, es negativo o excede 11 enteros.
 */
export function formatImporte(value: number, field = 'importe'): string {
  return encodeRequest({ [field]: value }, { [field]: CERTIFICADO.importeRetencion }, field)[field] as string;
}

/** Campos `xs:dateTime` de `certificado`. */
const FECHAS = [
  'fechaRetencion',
  'fechaPublicacion',
  'fechaComprobante',
  'fechaRetencionCertificadoOriginal',
] as const satisfies readonly (keyof EmitirCertificadoParams)[];

const DATOS_CERTIFICADO_ORIGINAL = [
  'numeroCertificadoOriginal',
  'fechaRetencionCertificadoOriginal',
  'importeCertificadoOriginal',
] as const satisfies readonly (keyof EmitirCertificadoParams)[];

/** Fecha calendario de Argentina (`AAAA-MM-DD`) de un `xs:dateTime` ya serializado; `undefined` si no hay. */
function fechaAR(serializada: unknown): string | undefined {
  return typeof serializada === 'string' && serializada !== '' ? serializada.slice(0, 10) : undefined;
}

/**
 * Reglas del manual que dependen de más de un campo o de las tablas del anexo.
 * `fechas` tiene las fechas ya serializadas (`''` si eran inválidas).
 */
function reglasCertificado(
  p: Partial<EmitirCertificadoParams>,
  fechas: Record<string, unknown>,
  errors: ValidationErrorDetail[],
): void {
  const required = (field: keyof EmitirCertificadoParams, when: string) => {
    if (p[field] === undefined) errors.push(detail(field, `es obligatorio ${when}`, undefined));
  };
  const forbidden = (field: keyof EmitirCertificadoParams, when: string) => {
    if (p[field] !== undefined) errors.push(detail(field, `no corresponde ${when}`, p[field]));
  };

  if (p.condicion === undefined && typeof p.regimen === 'number' && REGIMENES_CON_CONDICION.includes(p.regimen)) {
    required('condicion', `para el régimen ${p.regimen}`);
  }
  if (p.imposibilidadRetencion === true) required('motivoNoRetencion', 'cuando imposibilidadRetencion es true');

  if (typeof p.porcentajeExclusion === 'number' && p.porcentajeExclusion !== 50 && p.porcentajeExclusion !== 100) {
    errors.push(detail('porcentajeExclusion', 'debe ser 50 o 100', p.porcentajeExclusion));
  }
  if (p.regimenExclusion === true) {
    required('porcentajeExclusion', 'cuando regimenExclusion es true');
    required('fechaPublicacion', 'cuando regimenExclusion es true');
  }

  const retencion = fechaAR(fechas.fechaRetencion);
  if (retencion !== undefined && retencion < FECHA_RETENCION_MINIMA) {
    errors.push(detail('fechaRetencion', 'debe ser a partir del 2019-12-01', p.fechaRetencion));
  }

  const tipo = p.tipoComprobante;
  if (tipo === undefined || !Number.isSafeInteger(tipo)) return; // el schema ya lo reporta
  if (!Object.hasOwn(NUMERO_COMPROBANTE_FORMATO, tipo)) {
    errors.push(detail('tipoComprobante', 'debe existir en la tabla TIPO_COMPROBANTE', tipo));
    return;
  }
  const when = `para el tipoComprobante ${tipo}`;

  required('numeroComprobante', when);
  const numero = p.numeroComprobante;
  const maxLength = NUMERO_COMPROBANTE_FORMATO[tipo];
  if (typeof numero === 'string') {
    if (maxLength === 0) {
      if (!NUMERO_PV_RE.test(numero))
        errors.push(detail('numeroComprobante', 'formato esperado: 99999-99999999', numero));
    } else if (numero.trim() === '') {
      errors.push(detail('numeroComprobante', 'debe ser un texto no vacío', numero));
    } else if (numero.length > maxLength) {
      errors.push(detail('numeroComprobante', `admite hasta ${maxLength} caracteres ${when}`, numero));
    } else if (!ALFANUMERICO_RE.test(numero)) {
      errors.push(detail('numeroComprobante', `admite solo letras, dígitos y los separadores - / . ${when}`, numero));
    }
  }

  if (
    typeof p.importeComprobante === 'number' &&
    p.importeComprobante < 0 &&
    !TIPOS_CON_VALOR_NEGATIVO.includes(tipo)
  ) {
    errors.push(
      detail('importeComprobante', `no puede ser negativo ${when} (solo los tipos 19 y 20)`, p.importeComprobante),
    );
  }

  // Fechas (manual, 3.2.2), comparadas como fechas calendario de Argentina.
  const comprobante = fechaAR(fechas.fechaComprobante);
  if (retencion !== undefined && comprobante !== undefined) {
    if (TIPOS_CON_CERTIFICADO_ORIGINAL.includes(tipo)) {
      if (comprobante !== retencion) {
        errors.push(
          detail('fechaComprobante', `debe ser igual a fechaRetencion (${retencion}) ${when}`, p.fechaComprobante),
        );
      }
    } else if (comprobante > retencion) {
      errors.push(
        detail('fechaComprobante', `debe ser menor o igual a fechaRetencion (${retencion})`, p.fechaComprobante),
      );
    }
  }

  if (tipo === TipoComprobante.NOTA_CREDITO) required('motivoEmisionNotaCredito', 'para una nota de crédito (tipo 3)');
  else forbidden('motivoEmisionNotaCredito', when);

  for (const f of DATOS_CERTIFICADO_ORIGINAL) {
    if (TIPOS_CON_CERTIFICADO_ORIGINAL.includes(tipo)) required(f, when);
    else forbidden(f, when);
  }
}

/**
 * Valida los datos de un certificado a emitir y arma el `certificado` del
 * request, serializado y en el orden del XSD. Acumula todos los errores.
 *
 * @throws ArcaValidationError con un detalle por campo inválido.
 */
export function buildCertificadoRequest(params: EmitirCertificadoParams): CertificadoRequest {
  const p: Partial<EmitirCertificadoParams> = params ?? {};
  const { motivoAnulacion, ...datos } = p as Partial<EmitirCertificadoParams> & { motivoAnulacion?: unknown };
  const input: Record<string, unknown> = { ...datos, version: SIRE_VERSION, impuesto: IMPUESTO_IVA };

  // Las fechas se serializan antes (formato propio de SIRE); sus errores se
  // suman a los del schema. Una fecha inválida queda como '' para que el
  // schema no la reporte de nuevo: el request no se usa porque hay errores.
  const fechaErrors: ValidationErrorDetail[] = [];
  for (const field of FECHAS) {
    const value = input[field];
    if (value === undefined || value === null) continue;
    try {
      input[field] = formatSireDateTime(value as FechaHora, field);
    } catch (e) {
      if (!(e instanceof ArcaValidationError)) throw e;
      fechaErrors.push(...e.details);
      input[field] = '';
    }
  }

  const out = encodeRequest(input, CERTIFICADO, 'certificado', (_, errors) => {
    errors.push(...fechaErrors);
    reglasCertificado(p, input, errors);
    if (Object.hasOwn(p, 'motivoAnulacion')) {
      errors.push(detail('motivoAnulacion', 'no se debe enviar en emitir (usar anularCertificado)', motivoAnulacion));
    }
  });

  // `encodeRequest` serializa boolean y CUIT como texto; `CertificadoRequest` los tipa como boolean/number.
  return {
    ...out,
    imposibilidadRetencion: out.imposibilidadRetencion === 'true',
    regimenExclusion: out.regimenExclusion === 'true',
    cuitRetenido: Number(out.cuitRetenido),
  } as unknown as CertificadoRequest;
}

/**
 * Valida los datos de una anulación y arma el `certificadoAnulacion` del request.
 *
 * @throws ArcaValidationError con un detalle por campo inválido.
 */
export function buildAnulacionRequest(params: AnularCertificadoParams): CertificadoAnulacionRequest {
  const input = { ...(params ?? {}), version: SIRE_VERSION, impuesto: IMPUESTO_IVA };
  return encodeRequest(input, CERTIFICADO_ANULACION, 'certificadoAnulacion') as unknown as CertificadoAnulacionRequest;
}
