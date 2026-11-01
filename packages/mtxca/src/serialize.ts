import { ArcaValidationError, validateCuit } from '@ramiidv/arca-common';
import type { ValidationErrorDetail } from '@ramiidv/arca-common';
import { roundTo, toXsdDate, toXsdDateTime } from './format.js';
import type { FechaInput, MtxcaComprobanteCAE, MtxcaComprobanteCAEA, MtxcaItem } from './types.js';

type R = Record<string, unknown>;

/** Límites de los simpleTypes del XSD de WSMTXCA. */
const SHORT_MAX = 32767;
const IMPORTE_MAX = 9999999999999.99;
const DECIMAL_MAX = 999999999999.999999;
const LONG_DIGITS = /^\d{1,18}$/;

/** Tipos de documento que son CUIT/CUIL (dígito verificador). */
const DOC_CUIT = new Set([80, 86]);

/**
 * Valida un valor contra su tipo del XSD y lo convierte a la forma en que se
 * envía. Acumula los errores para reportarlos todos juntos.
 */
export class XsdFields {
  readonly errors: ValidationErrorDetail[] = [];

  fail(field: string, message: string, value?: unknown): undefined {
    this.errors.push({ field, message, value });
    return undefined;
  }

  throwIfErrors(what: string): void {
    if (this.errors.length > 0) {
      throw new ArcaValidationError(
        `${what}: ${this.errors.map((e) => `${e.field}: ${e.message}`).join('; ')}`,
        this.errors,
        this.errors[0].field,
      );
    }
  }

  private missing(field: string, value: unknown, required: boolean): boolean {
    if (value !== undefined && value !== null) return false;
    if (required) this.fail(field, 'es obligatorio', value);
    return true;
  }

  /** Entero en [min, max] (`xsd:short`, `xsd:int`, NumeroPuntoVenta, NumeroComprobante). */
  int(field: string, value: unknown, required: boolean, min = 1, max = SHORT_MAX): number | undefined {
    if (this.missing(field, value, required)) return undefined;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
      return this.fail(field, `debe ser un entero entre ${min} y ${max}`, value);
    }
    return value;
  }

  /** Importe de 2 decimales. `ImporteSubtotalSimpleType` admite negativos; `ImporteTotalSimpleType` no. */
  importe(field: string, value: unknown, required: boolean, allowNegative: boolean): string | undefined {
    return this.decimalValue(field, value, required, 2, allowNegative ? -IMPORTE_MAX : 0, IMPORTE_MAX);
  }

  /** `DecimalSimpleType`: 0..999999999999.999999, 6 decimales. */
  decimal6(field: string, value: unknown, required: boolean): string | undefined {
    return this.decimalValue(field, value, required, 6, 0, DECIMAL_MAX);
  }

  decimalValue(
    field: string,
    value: unknown,
    required: boolean,
    decimals: number,
    min: number,
    max: number,
  ): string | undefined {
    if (this.missing(field, value, required)) return undefined;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return this.fail(field, 'debe ser un número finito', value);
    }
    const rounded = roundTo(value, decimals);
    if (rounded < min || rounded > max) {
      return this.fail(field, min === 0 ? `debe estar entre 0 y ${max}` : `debe estar entre ${min} y ${max}`, value);
    }
    return rounded.toFixed(decimals);
  }

  text(field: string, value: unknown, required: boolean, maxLength?: number): string | undefined {
    if (this.missing(field, value, required)) return undefined;
    if (typeof value !== 'string' || value.trim() === '') {
      return this.fail(field, 'debe ser un texto no vacío', value);
    }
    if (maxLength !== undefined && value.length > maxLength) {
      return this.fail(field, `admite hasta ${maxLength} caracteres`, value);
    }
    return value;
  }

  date(field: string, value: FechaInput | undefined, required: boolean): string | undefined {
    if (this.missing(field, value, required)) return undefined;
    try {
      return toXsdDate(value as FechaInput, field);
    } catch (e) {
      if (e instanceof ArcaValidationError) {
        this.errors.push(...e.details);
        return undefined;
      }
      throw e;
    }
  }

  dateTime(field: string, value: Date | string | undefined): string | undefined {
    if (value === undefined || value === null) return undefined;
    try {
      return toXsdDateTime(value, field);
    } catch (e) {
      if (e instanceof ArcaValidationError) {
        this.errors.push(...e.details);
        return undefined;
      }
      throw e;
    }
  }

  /** CUIT (dígito verificador), normalizado a 11 dígitos. */
  cuit(field: string, value: unknown, required: boolean): string | undefined {
    if (this.missing(field, value, required)) return undefined;
    if (typeof value !== 'number' && typeof value !== 'string') return this.fail(field, 'CUIT inválido', value);
    try {
      return validateCuit(value);
    } catch (e) {
      if (e instanceof ArcaValidationError) {
        return this.fail(field, e.details[0]?.message ?? e.message, value);
      }
      throw e;
    }
  }

  /** Número de documento (`xsd:long`). Con tipo 80/86 se valida el dígito verificador. */
  documento(field: string, value: unknown, tipo: number | undefined, required: boolean): string | undefined {
    if (this.missing(field, value, required)) return undefined;
    if (tipo !== undefined && DOC_CUIT.has(tipo)) return this.cuit(field, value, true);
    const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
    if (typeof text !== 'string' || !LONG_DIGITS.test(text.replace(/-/g, ''))) {
      return this.fail(field, 'debe ser un número entero no negativo', value);
    }
    return text.replace(/-/g, '');
  }

  /** CAE/CAEA (`xsd:long`, 14 dígitos). */
  codigoAutorizacion(field: string, value: unknown, required: boolean): string | undefined {
    if (this.missing(field, value, required)) return undefined;
    const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
    if (typeof text !== 'string' || !/^\d{14}$/.test(text)) {
      return this.fail(field, 'debe tener 14 dígitos', value);
    }
    return text;
  }

  array<T>(field: string, value: T[] | undefined, required: boolean): T[] | undefined {
    if (this.missing(field, value, required)) return undefined;
    if (!Array.isArray(value)) return this.fail(field, 'debe ser un array', value);
    if (value.length === 0) {
      if (required) this.fail(field, 'no puede estar vacío', value);
      return undefined;
    }
    return value;
  }
}

/** Agrega `key` solo si el valor está definido (el orden de inserción es el orden del XSD). */
function put(target: R, key: string, value: unknown): void {
  if (value !== undefined) target[key] = value;
}

function buildItem(f: XsdFields, item: MtxcaItem, i: number): R {
  const p = `items[${i}]`;
  const out: R = {};
  if (item === null || typeof item !== 'object') {
    f.fail(p, 'debe ser un objeto', item);
    return out;
  }
  put(out, 'unidadesMtx', f.int(`${p}.unidadesMtx`, item.unidadesMtx, false, 1, 999999));
  put(out, 'codigoMtx', f.text(`${p}.codigoMtx`, item.codigoMtx, false));
  put(out, 'codigo', f.text(`${p}.codigo`, item.codigo, false, 50));
  put(out, 'descripcion', f.text(`${p}.descripcion`, item.descripcion, true, 4000));
  put(out, 'cantidad', f.decimal6(`${p}.cantidad`, item.cantidad, false));
  put(out, 'codigoUnidadMedida', f.int(`${p}.codigoUnidadMedida`, item.codigoUnidadMedida, true));
  put(out, 'precioUnitario', f.decimal6(`${p}.precioUnitario`, item.precioUnitario, false));
  put(out, 'importeBonificacion', f.decimal6(`${p}.importeBonificacion`, item.importeBonificacion, false));
  put(out, 'codigoCondicionIVA', f.int(`${p}.codigoCondicionIVA`, item.codigoCondicionIVA, true));
  put(out, 'importeIVA', f.importe(`${p}.importeIVA`, item.importeIVA, false, true));
  put(out, 'importeItem', f.importe(`${p}.importeItem`, item.importeItem, true, true));
  return out;
}

/**
 * Valida un comprobante contra el XSD (`ComprobanteType`) y lo arma con los
 * elementos en el orden de la secuencia (Axis2 valida el orden). Redondea los
 * importes a 2 decimales y cantidad/precio/bonificación/cotización a 6.
 *
 * `caea`: agrega `codigoTipoAutorizacion`, `codigoAutorizacion` (el CAEA),
 * `fechaVencimiento` y `fechaHoraGen`, que en CAE no deben informarse.
 *
 * @throws ArcaValidationError con todos los errores encontrados.
 */
export function buildComprobante(input: MtxcaComprobanteCAE | MtxcaComprobanteCAEA, mode: 'cae' | 'caea'): R {
  if (input === null || typeof input !== 'object') {
    throw new ArcaValidationError(
      'El comprobante es obligatorio',
      [{ field: 'comprobante', message: 'es obligatorio', value: input }],
      'comprobante',
    );
  }
  const f = new XsdFields();
  const c = input as MtxcaComprobanteCAEA;
  const out: R = {};

  put(out, 'codigoTipoComprobante', f.int('codigoTipoComprobante', c.codigoTipoComprobante, true));
  put(out, 'numeroPuntoVenta', f.int('numeroPuntoVenta', c.numeroPuntoVenta, true, 1, 99998));
  put(out, 'numeroComprobante', f.int('numeroComprobante', c.numeroComprobante, true, 1, 99999999));
  put(out, 'fechaEmision', f.date('fechaEmision', c.fechaEmision, false));
  if (mode === 'caea') {
    if (c.codigoTipoAutorizacion !== undefined && c.codigoTipoAutorizacion !== 'A') {
      f.fail('codigoTipoAutorizacion', 'si se informa debe ser "A"', c.codigoTipoAutorizacion);
    }
    put(out, 'codigoTipoAutorizacion', c.codigoTipoAutorizacion);
    put(out, 'codigoAutorizacion', f.codigoAutorizacion('caea', c.caea, true));
    put(out, 'fechaVencimiento', f.date('fechaVencimiento', c.fechaVencimiento, false));
  }
  const tipoDoc = f.int('codigoTipoDocumento', c.codigoTipoDocumento, false);
  put(out, 'codigoTipoDocumento', tipoDoc);
  put(out, 'numeroDocumento', f.documento('numeroDocumento', c.numeroDocumento, tipoDoc, false));
  put(out, 'condicionIVAReceptor', f.int('condicionIVAReceptor', c.condicionIVAReceptor, false));
  put(out, 'importeGravado', f.importe('importeGravado', c.importeGravado, false, true));
  put(out, 'importeNoGravado', f.importe('importeNoGravado', c.importeNoGravado, false, true));
  put(out, 'importeExento', f.importe('importeExento', c.importeExento, false, true));
  put(out, 'importeSubtotal', f.importe('importeSubtotal', c.importeSubtotal, true, true));
  put(out, 'importeOtrosTributos', f.importe('importeOtrosTributos', c.importeOtrosTributos, false, false));
  put(out, 'importeTotal', f.importe('importeTotal', c.importeTotal, true, false));
  put(out, 'codigoMoneda', f.text('codigoMoneda', c.codigoMoneda, true, 3));
  if (c.cotizacionMoneda !== undefined && (typeof c.cotizacionMoneda !== 'number' || !(c.cotizacionMoneda > 0))) {
    f.fail('cotizacionMoneda', 'debe ser mayor a 0', c.cotizacionMoneda);
  } else {
    put(out, 'cotizacionMoneda', f.decimalValue('cotizacionMoneda', c.cotizacionMoneda, false, 6, 0, 9999.999999));
  }
  if (
    c.cancelaEnMismaMonedaExtranjera !== undefined &&
    c.cancelaEnMismaMonedaExtranjera !== 'S' &&
    c.cancelaEnMismaMonedaExtranjera !== 'N'
  ) {
    f.fail('cancelaEnMismaMonedaExtranjera', 'debe ser "S" o "N"', c.cancelaEnMismaMonedaExtranjera);
  }
  put(out, 'cancelaEnMismaMonedaExtranjera', c.cancelaEnMismaMonedaExtranjera);
  put(out, 'observaciones', f.text('observaciones', c.observaciones, false, 2000));
  put(out, 'codigoConcepto', f.int('codigoConcepto', c.codigoConcepto, true));
  put(out, 'fechaServicioDesde', f.date('fechaServicioDesde', c.fechaServicioDesde, false));
  put(out, 'fechaServicioHasta', f.date('fechaServicioHasta', c.fechaServicioHasta, false));
  put(out, 'fechaVencimientoPago', f.date('fechaVencimientoPago', c.fechaVencimientoPago, false));
  if (mode === 'caea') put(out, 'fechaHoraGen', f.dateTime('fechaHoraGen', c.fechaHoraGen));

  const asociados = f.array('comprobantesAsociados', c.comprobantesAsociados, false);
  if (asociados) {
    out['arrayComprobantesAsociados'] = {
      comprobanteAsociado: asociados.map((a, i) => {
        const p = `comprobantesAsociados[${i}]`;
        const o: R = {};
        put(o, 'codigoTipoComprobante', f.int(`${p}.codigoTipoComprobante`, a?.codigoTipoComprobante, true));
        put(o, 'numeroPuntoVenta', f.int(`${p}.numeroPuntoVenta`, a?.numeroPuntoVenta, true, 1, 99998));
        put(o, 'numeroComprobante', f.int(`${p}.numeroComprobante`, a?.numeroComprobante, true, 1, 99999999));
        put(o, 'cuit', f.cuit(`${p}.cuit`, a?.cuit, false));
        put(o, 'fechaEmision', f.date(`${p}.fechaEmision`, a?.fechaEmision, false));
        return o;
      }),
    };
  }

  if (c.periodoComprobantesAsociados !== undefined) {
    const per = c.periodoComprobantesAsociados;
    const o: R = {};
    put(o, 'fechaDesde', f.date('periodoComprobantesAsociados.fechaDesde', per?.fechaDesde, true));
    put(o, 'fechaHasta', f.date('periodoComprobantesAsociados.fechaHasta', per?.fechaHasta, true));
    out['periodoComprobantesAsociados'] = o;
  }

  const tributos = f.array('otrosTributos', c.otrosTributos, false);
  if (tributos) {
    out['arrayOtrosTributos'] = {
      otroTributo: tributos.map((t, i) => {
        const p = `otrosTributos[${i}]`;
        const o: R = {};
        put(o, 'codigo', f.int(`${p}.codigo`, t?.codigo, true));
        put(o, 'descripcion', f.text(`${p}.descripcion`, t?.descripcion, false));
        put(o, 'baseImponible', f.importe(`${p}.baseImponible`, t?.baseImponible, true, false));
        put(o, 'importe', f.importe(`${p}.importe`, t?.importe, true, false));
        return o;
      }),
    };
  }

  const items = f.array('items', c.items, true);
  out['arrayItems'] = { item: (items ?? []).map((item, i) => buildItem(f, item, i)) };

  const subtotales = f.array('subtotalesIVA', c.subtotalesIVA, false);
  if (subtotales) {
    out['arraySubtotalesIVA'] = {
      subtotalIVA: subtotales.map((s, i) => {
        const o: R = {};
        put(o, 'codigo', f.int(`subtotalesIVA[${i}].codigo`, s?.codigo, true));
        put(o, 'importe', f.importe(`subtotalesIVA[${i}].importe`, s?.importe, true, true));
        return o;
      }),
    };
  }

  const datos = f.array('datosAdicionales', c.datosAdicionales, false);
  if (datos) {
    out['arrayDatosAdicionales'] = {
      datoAdicional: datos.map((d, i) => {
        const p = `datosAdicionales[${i}]`;
        const o: R = {};
        put(o, 't', f.int(`${p}.t`, d?.t, true));
        for (const k of ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'] as const) {
          put(o, k, f.text(`${p}.${k}`, d?.[k], false));
        }
        return o;
      }),
    };
  }

  const compradores = f.array('compradores', c.compradores, false);
  if (compradores) {
    out['arrayCompradores'] = {
      comprador: compradores.map((x, i) => {
        const p = `compradores[${i}]`;
        const o: R = {};
        const tipo = f.int(`${p}.codigoTipoDocumento`, x?.codigoTipoDocumento, true);
        put(o, 'codigoTipoDocumento', tipo);
        put(o, 'numeroDocumento', f.documento(`${p}.numeroDocumento`, x?.numeroDocumento, tipo, true));
        put(o, 'porcentaje', f.decimalValue(`${p}.porcentaje`, x?.porcentaje, true, 2, 0, 100));
        return o;
      }),
    };
  }

  const actividades = f.array('actividades', c.actividades, false);
  if (actividades) {
    out['arrayActividades'] = {
      actividad: actividades.map((codigo, i) => ({
        codigo: f.int(`actividades[${i}]`, codigo, true, 1, Number.MAX_SAFE_INTEGER),
      })),
    };
  }

  f.throwIfErrors('Comprobante inválido');
  return out;
}
