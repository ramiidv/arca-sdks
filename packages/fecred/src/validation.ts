import { ArcaValidationError, formatDate, validateCBU, validateCuit } from '@ramiidv/arca-common';
import {
  EstadoComprobante,
  EstadoCtaCte,
  OpcionTransferencia,
  RolCtaCte,
  TipoCancelacion,
  TipoFechaFiltro,
} from './constants.js';
import type {
  ConfirmarNotaDCInput,
  CuentaEnAgenteInput,
  FiltroFecha,
  FormaCancelacionInput,
  IdComprobanteInput,
  IdCtaCteInput,
  MotivoRechazo,
  RetencionInput,
  AjusteOperacion,
} from './types.js';

// Validación local y armado de los fragmentos del request, según las
// restricciones del XSD de FECredService. Todas las funciones lanzan
// ArcaValidationError con el `field` del parámetro inválido.

type Xml = Record<string, unknown>;

function invalid(field: string, message: string, value: unknown): never {
  throw new ArcaValidationError(`${field}: ${message}`, [{ field, message, value }], field);
}

function rethrowAs<T>(field: string, value: unknown, fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof ArcaValidationError) {
      const message = e.details[0]?.message ?? e.message;
      throw new ArcaValidationError(`${field}: ${message}`, [{ field, message, value }], field, { cause: e });
    }
    throw e;
  }
}

/** CUIT (`CuitSimpleType`) validado con dígito verificador, como 11 dígitos. */
export function cuitParam(value: unknown, field: string): string {
  if (typeof value !== 'string' && typeof value !== 'number') invalid(field, 'es requerido (number o string)', value);
  return rethrowAs(field, value, () => validateCuit(value));
}

/** `xsd:date` (`YYYY-MM-DD`). Acepta `Date` (fecha de Argentina), `YYYY-MM-DD` o `YYYYMMDD`. */
export function dateParam(value: unknown, field: string): string {
  if (!(value instanceof Date) && typeof value !== 'string') invalid(field, 'es requerida (Date o string)', value);
  const d = rethrowAs(field, value, () => formatDate(value));
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

/** Entero dentro de un rango (`xsd:short`, `PuntoVentaSimpleType`, etc.). */
export function intParam(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    invalid(field, `debe ser un entero entre ${min} y ${max}`, value);
  }
  return value;
}

const SHORT_MAX = 32767;

/** Código `xsd:short` no negativo. */
export function codeParam(value: unknown, field: string): number {
  return intParam(value, field, 0, SHORT_MAX);
}

/** `xsd:long` positivo (ej: `codCtaCte`), como string de dígitos. */
export function longParam(value: unknown, field: string): string {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) invalid(field, 'debe ser un entero positivo', value);
    return String(value);
  }
  if (typeof value === 'string' && /^\d{1,18}$/.test(value.trim()) && !/^0+$/.test(value.trim())) {
    return value.trim().replace(/^0+/, '');
  }
  return invalid(field, 'debe ser un entero positivo', value);
}

const IMPORTE_MAX = 9999999999999.99;

/**
 * `ImporteSimpleType`: decimal con 2 decimales (redondeado), entre
 * -9999999999999.99 y 9999999999999.99. Con `allowNegative = false` rechaza negativos.
 */
export function importeParam(value: unknown, field: string, allowNegative = false): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) invalid(field, 'debe ser un número finito', value);
  const rounded = Math.round(value * 100) / 100;
  if (Math.abs(rounded) > IMPORTE_MAX) invalid(field, 'excede el máximo del XSD (13 enteros, 2 decimales)', value);
  if (!allowNegative && rounded < 0) invalid(field, 'no puede ser negativo', value);
  return rounded.toFixed(2);
}

/** `PorcentajeSimpleType`: 0 a 100. */
export function porcentajeParam(value: unknown, field: string): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    invalid(field, 'debe ser un número entre 0 y 100', value);
  }
  return String(Math.round(value * 100) / 100);
}

/** Cotización (`xsd:decimal`), positiva; se envía con hasta 6 decimales. */
export function cotizacionParam(value: unknown, field: string): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    invalid(field, 'debe ser un número positivo', value);
  }
  return String(Math.round(value * 1e6) / 1e6);
}

/** String con longitud acotada (ej: `Texto250SimpleType` = 3..250). */
export function textParam(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== 'string') invalid(field, 'es requerido (string)', value);
  const t = value.trim();
  if (t.length < min || t.length > max) invalid(field, `debe tener entre ${min} y ${max} caracteres`, value);
  return t;
}

/** `xsd:string` no vacío. */
export function nonEmptyParam(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) invalid(field, 'es requerido (string no vacío)', value);
  return value.trim();
}

/** Valor de una enumeración del XSD. */
export function enumParam<T extends string>(value: unknown, field: string, values: Record<string, T>): T {
  const allowed = Object.values(values);
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    invalid(field, `debe ser uno de: ${allowed.join(', ')}`, value);
  }
  return value as T;
}

export const rolParam = (v: unknown, field = 'rol') => enumParam(v, field, RolCtaCte);
export const estadoCtaCteParam = (v: unknown, field = 'estadoCtaCte') => enumParam(v, field, EstadoCtaCte);
export const estadoCmpParam = (v: unknown, field = 'estadoCmp') => enumParam(v, field, EstadoComprobante);
export const opcionTransferenciaParam = (v: unknown, field = 'opcionTransferencia') =>
  enumParam(v, field, OpcionTransferencia);
export const tipoCancelacionParam = (v: unknown, field = 'tipoCancelacion') => enumParam(v, field, TipoCancelacion);

/** `SiNoSimpleType`. */
export function siNoParam(value: unknown, field: string): 'S' | 'N' {
  if (typeof value !== 'boolean') invalid(field, 'debe ser boolean', value);
  return value ? 'S' : 'N';
}

/** `CBUSimpleType` (22 dígitos, con dígitos verificadores). */
export function cbuParam(value: unknown, field: string): string {
  if (typeof value !== 'string') invalid(field, 'es requerido (string de 22 dígitos)', value);
  return rethrowAs(field, value, () => validateCBU(value));
}

function arrayParam<T>(value: unknown, field: string, required: boolean): T[] | undefined {
  if (value === undefined && !required) return undefined;
  if (!Array.isArray(value) || value.length === 0) invalid(field, 'debe ser un array con al menos un elemento', value);
  return value as T[];
}

// ---------------------------------------------------------------------------
// Tipos compuestos
// ---------------------------------------------------------------------------

/** `IdComprobanteType`. */
export function idComprobanteParam(value: IdComprobanteInput | undefined, field: string): Xml {
  if (!value || typeof value !== 'object') invalid(field, 'es requerido', value);
  return {
    CUITEmisor: cuitParam(value.cuitEmisor, `${field}.cuitEmisor`),
    codTipoCmp: codeParam(value.codTipoCmp, `${field}.codTipoCmp`),
    ptoVta: intParam(value.ptoVta, `${field}.ptoVta`, 1, 99999),
    nroCmp: intParam(value.nroCmp, `${field}.nroCmp`, 1, 99999999),
  };
}

/** `IdCtaCteType` (choice `codCtaCte` | `idFactura`). */
export function idCtaCteParam(value: IdCtaCteInput | undefined, field = 'idCtaCte'): Xml {
  if (!value || typeof value !== 'object') invalid(field, 'es requerido ({ codCtaCte } o { idFactura })', value);
  const hasCod = value.codCtaCte !== undefined;
  const hasFactura = value.idFactura !== undefined;
  if (hasCod === hasFactura) invalid(field, 'debe tener exactamente uno de codCtaCte o idFactura', value);
  return hasCod
    ? { codCtaCte: longParam(value.codCtaCte, `${field}.codCtaCte`) }
    : { idFactura: idComprobanteParam(value.idFactura, `${field}.idFactura`) };
}

/** `FiltroFechaType`. */
export function fechaParam(value: FiltroFecha | undefined, field = 'fecha'): Xml {
  if (!value || typeof value !== 'object') invalid(field, 'es requerido ({ tipo, desde, hasta })', value);
  const tipo = enumParam(value.tipo, `${field}.tipo`, TipoFechaFiltro);
  const desde = dateParam(value.desde, `${field}.desde`);
  const hasta = dateParam(value.hasta, `${field}.hasta`);
  if (desde > hasta) invalid(`${field}.hasta`, 'debe ser igual o posterior a desde', value);
  return { tipo, desde, hasta };
}

/** `ArrayMotivosRechazoType`. */
export function motivosRechazoParam(value: MotivoRechazo[] | undefined, field = 'motivos'): Xml {
  const motivos = arrayParam<MotivoRechazo>(value, field, true)!;
  return {
    motivoRechazo: motivos.map((m, i) => ({
      codMotivo: codeParam(m?.codMotivo, `${field}[${i}].codMotivo`),
      descMotivo: textParam(m?.descMotivo, `${field}[${i}].descMotivo`, 3, 250),
      justificacion: textParam(m?.justificacion, `${field}[${i}].justificacion`, 3, 250),
    })),
  };
}

/** `ArrayCodigosDescripcionesType` para formas de cancelación. */
export function formasCancelacionParam(
  value: FormaCancelacionInput[] | undefined,
  field = 'formasCancelacion',
  required = true,
): Xml | undefined {
  const formas = arrayParam<FormaCancelacionInput>(value, field, required);
  if (!formas) return undefined;
  return {
    codigoDescripcion: formas.map((f, i) => ({
      codigo: codeParam(f?.codigo, `${field}[${i}].codigo`),
      descripcion: nonEmptyParam(f?.descripcion, `${field}[${i}].descripcion`),
    })),
  };
}

/** `ArrayConfirmarNotasType`. */
export function confirmarNotasParam(value: ConfirmarNotaDCInput[] | undefined, field = 'confirmarNotasDC'): Xml | undefined {
  const notas = arrayParam<ConfirmarNotaDCInput>(value, field, false);
  if (!notas) return undefined;
  return {
    confirmarNota: notas.map((n, i) => ({
      acepta: siNoParam(n?.acepta, `${field}[${i}].acepta`),
      idNota: idComprobanteParam(n?.idNota, `${field}[${i}].idNota`),
    })),
  };
}

/** `ArrayRetencionesType`. */
export function retencionesParam(value: RetencionInput[] | undefined, field = 'retenciones'): Xml | undefined {
  const rets = arrayParam<RetencionInput>(value, field, false);
  if (!rets) return undefined;
  return {
    retencion: rets.map((r, i) => {
      const out: Xml = {
        codTipo: codeParam(r?.codTipo, `${field}[${i}].codTipo`),
        importe: importeParam(r?.importe, `${field}[${i}].importe`),
        porcentaje: porcentajeParam(r?.porcentaje, `${field}[${i}].porcentaje`),
      };
      if (r.descMotivo !== undefined) out.descMotivo = textParam(r.descMotivo, `${field}[${i}].descMotivo`, 3, 250);
      return out;
    }),
  };
}

/** `ArrayAjustesOperacionType`. */
export function ajustesParam(value: AjusteOperacion[] | undefined, field = 'ajustesOperacion'): Xml | undefined {
  const ajustes = arrayParam<AjusteOperacion>(value, field, false);
  if (!ajustes) return undefined;
  return {
    ajuste: ajustes.map((a, i) => ({
      codigo: codeParam(a?.codigo, `${field}[${i}].codigo`),
      importe: importeParam(a?.importe, `${field}[${i}].importe`, true),
    })),
  };
}

/** `CuentaEnAgenteType`. */
export function ctaAgenteParam(value: CuentaEnAgenteInput | undefined, field = 'ctaAgente'): Xml {
  if (!value || typeof value !== 'object') invalid(field, 'es requerido', value);
  const out: Xml = { cuitAgente: cuitParam(value.cuitAgente, `${field}.cuitAgente`) };
  if (value.razonSocialAgente !== undefined) {
    out.razonSocialAgente = nonEmptyParam(value.razonSocialAgente, `${field}.razonSocialAgente`);
  }
  out.idCuenta = textParam(value.idCuenta, `${field}.idCuenta`, 3, 20);
  if (value.denominacion !== undefined) out.denominacion = textParam(value.denominacion, `${field}.denominacion`, 3, 250);
  return out;
}

/** Código de moneda (`xsd:string`; ej: `PES`, `DOL`). */
export function monedaParam(value: unknown, field = 'codMoneda'): string {
  return nonEmptyParam(value, field);
}
