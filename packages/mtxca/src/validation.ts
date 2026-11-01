import { ArcaValidationError, parseAfipDate } from '@ramiidv/arca-common';
import type { ValidationErrorDetail } from '@ramiidv/arca-common';
import { ALICUOTAS_IVA } from './constants.js';
import { roundDecimal, roundImporte, toXsdDate } from './format.js';
import type { FechaInput, MtxcaComprobanteBase, MtxcaItem } from './types.js';

// Validaciones de negocio del manual del desarrollador de WSMTXCA (v0.25.8).
// Los números entre paréntesis son los códigos de error de ARCA que se evitan.

/** Comprobantes clase A (incluye "A con leyenda" y FCE A). */
const CLASE_A = new Set([1, 2, 3, 51, 52, 53, 201, 202, 203]);
/** Comprobantes clase B (incluye FCE B). */
const CLASE_B = new Set([6, 7, 8, 206, 207, 208]);
/** Tipos en los que el ítem lleva importeIVA y precio sin IVA (514, 515, 519). */
const ITEM_CON_IVA = new Set([1, 2, 3, 51, 52, 53]);
/** Tipos en los que el ítem no lleva importeIVA y el precio incluye IVA (514, 519). */
const ITEM_SIN_IVA = new Set([6, 7, 8]);
/** Tipos que exigen receptor con CUIT (128, 129). */
const RECEPTOR_CUIT = new Set([1, 2, 3, 51, 52, 53, 201, 202, 203, 206, 207, 208]);
/** Condiciones de IVA gravadas (110) y las que llevan subtotal de IVA (127, 400). */
const GRAVADAS = new Set([3, 4, 5, 6]);
const CON_SUBTOTAL = new Set([4, 5, 6]);

const SENA = 97;
const BONIFICACION = 99;
const ANULACION = 95;

/**
 * Margen de error del manual: error relativo <= 0.01% o error absoluto
 * <= 0.01 * cantidad de elementos sumados.
 */
function dentroDelMargen(actual: number, esperado: number, cantidad = 1): boolean {
  const diff = Math.abs(actual - esperado);
  if (diff <= 0.01 * Math.max(1, cantidad) + 1e-9) return true;
  return esperado !== 0 && diff / Math.abs(esperado) <= 0.0001;
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const imp = (v: number | undefined) => (typeof v === 'number' && Number.isFinite(v) ? roundImporte(v) : 0);
const dec = (v: number | undefined) => (typeof v === 'number' && Number.isFinite(v) ? roundDecimal(v) : 0);
const fmt = (n: number) => roundImporte(n).toFixed(2);

function esUnidadSinCantidad(item: MtxcaItem): boolean {
  return item.codigoUnidadMedida === SENA || item.codigoUnidadMedida === BONIFICACION;
}

function throwIfErrors(errors: ValidationErrorDetail[], what: string): void {
  if (errors.length > 0) {
    throw new ArcaValidationError(
      `${what}: ${errors.map((e) => `${e.field}: ${e.message}`).join('; ')}`,
      errors,
      errors[0].field,
    );
  }
}

/**
 * Reglas de presencia de campos de un ítem (500, 503, 507, 509, 510, 514,
 * 520, 521), excluyentes tanto en CAE como en CAEA.
 */
function validarItemEstructura(item: MtxcaItem, i: number, cbteTipo: number, errors: ValidationErrorDetail[]): void {
  const p = `items[${i}]`;
  const add = (field: string, message: string, value: unknown) =>
    errors.push({ field: `${p}.${field}`, message, value });
  const sinCantidad = esUnidadSinCantidad(item);

  if (!sinCantidad) {
    if (item.unidadesMtx === undefined)
      add('unidadesMtx', 'es obligatorio salvo unidad de medida 97 o 99 (500)', item.unidadesMtx);
    if (item.codigoMtx === undefined)
      add('codigoMtx', 'es obligatorio salvo unidad de medida 97 o 99 (503)', item.codigoMtx);
    if (item.cantidad === undefined)
      add('cantidad', 'es obligatoria salvo unidad de medida 97 o 99 (507)', item.cantidad);
    if (item.precioUnitario === undefined)
      add('precioUnitario', 'es obligatorio salvo unidad de medida 97 o 99 (509)', item.precioUnitario);
  } else {
    if (item.cantidad !== undefined)
      add('cantidad', 'no corresponde con unidad de medida 97 o 99 (507)', item.cantidad);
    if (item.precioUnitario !== undefined)
      add('precioUnitario', 'no corresponde con unidad de medida 97 o 99 (509)', item.precioUnitario);
    if (item.importeBonificacion !== undefined) {
      add('importeBonificacion', 'no corresponde con unidad de medida 97 o 99 (510)', item.importeBonificacion);
    }
  }
  // Fuera de 97/99 los dos son obligatorios (ya reportado arriba).
  if (sinCantidad && (item.unidadesMtx === undefined) !== (item.codigoMtx === undefined)) {
    add('unidadesMtx', 'unidadesMtx y codigoMtx se informan juntos (520)', item.unidadesMtx);
  }
  if (ITEM_CON_IVA.has(cbteTipo) && item.importeIVA === undefined) {
    add('importeIVA', `es obligatorio para el tipo de comprobante ${cbteTipo} (514)`, item.importeIVA);
  }
  if (ITEM_SIN_IVA.has(cbteTipo) && item.importeIVA !== undefined) {
    add('importeIVA', `no corresponde para el tipo de comprobante ${cbteTipo} (514)`, item.importeIVA);
  }
  if ([1, 2, 3].includes(item.codigoCondicionIVA) && item.importeIVA !== undefined && imp(item.importeIVA) !== 0) {
    add('importeIVA', 'debe ser 0 si codigoCondicionIVA es 1, 2 o 3 (521)', item.importeIVA);
  }
}

function itemsDe(c: MtxcaComprobanteBase): MtxcaItem[] {
  return Array.isArray(c?.items) ? c.items.filter((i) => i !== null && typeof i === 'object') : [];
}

/**
 * Valida las reglas de ítems que el manual marca como excluyentes para
 * `informarComprobanteCAEA` (1100-1112, 1121) y el par tipo/número de documento (707).
 *
 * @throws ArcaValidationError
 */
export function validateComprobanteCAEA(c: MtxcaComprobanteBase): void {
  const errors: ValidationErrorDetail[] = [];
  itemsDe(c).forEach((item, i) => validarItemEstructura(item, i, c.codigoTipoComprobante, errors));
  if ((c.codigoTipoDocumento === undefined) !== (c.numeroDocumento === undefined)) {
    errors.push({
      field: 'numeroDocumento',
      message: 'codigoTipoDocumento y numeroDocumento se informan juntos (707)',
    });
  }
  throwIfErrors(errors, 'Comprobante CAEA inválido');
}

/**
 * Valida un comprobante a autorizar con CAE (`autorizarComprobante`) según
 * las validaciones excluyentes del manual: presencia de campos por unidad de
 * medida y tipo de comprobante, fórmulas de importe e IVA por ítem, subtotales
 * de IVA por alícuota y la coherencia de gravado/no gravado/exento/subtotal/
 * otros tributos/total, con el margen de error del manual. Usa los importes ya
 * redondeados como se envían (2 decimales; 6 en cantidad y precio).
 *
 * No reemplaza las validaciones de padrón que hace ARCA (CUIT activa, punto de
 * venta habilitado, correlatividad, etc.).
 *
 * @throws ArcaValidationError con todos los errores encontrados.
 */
export function validateComprobanteCAE(c: MtxcaComprobanteBase): void {
  const errors: ValidationErrorDetail[] = [];
  const add = (field: string, message: string, value?: unknown) => errors.push({ field, message, value });
  const tipo = c.codigoTipoComprobante;
  const items = itemsDe(c);

  // --- Comprobante -------------------------------------------------------
  if (![1, 2, 3].includes(c.codigoConcepto)) add('codigoConcepto', 'debe ser 1, 2 o 3 (121)', c.codigoConcepto);
  if ((c.codigoTipoDocumento === undefined) !== (c.numeroDocumento === undefined)) {
    add('numeroDocumento', 'codigoTipoDocumento y numeroDocumento se informan juntos (108)');
  }
  if (RECEPTOR_CUIT.has(tipo)) {
    if (c.codigoTipoDocumento === undefined)
      add('codigoTipoDocumento', `es obligatorio para el tipo de comprobante ${tipo} (128)`);
    else if (c.codigoTipoDocumento !== 80)
      add('codigoTipoDocumento', `debe ser 80 (CUIT) para el tipo de comprobante ${tipo} (129)`, c.codigoTipoDocumento);
  }

  const servicios = c.codigoConcepto === 2 || c.codigoConcepto === 3;
  for (const campo of ['fechaServicioDesde', 'fechaServicioHasta', 'fechaVencimientoPago'] as const) {
    const presente = c[campo] !== undefined;
    if (servicios && !presente) add(campo, 'es obligatoria si codigoConcepto es 2 o 3 (122-124)');
    if (!servicios && presente) add(campo, 'solo corresponde si codigoConcepto es 2 o 3 (122-124)', c[campo]);
  }
  const fecha = (v: FechaInput | undefined, field: string) => {
    if (v === undefined) return undefined;
    try {
      return parseAfipDate(toXsdDate(v, field)).getTime();
    } catch (e) {
      if (e instanceof ArcaValidationError) return undefined; // ya lo reporta la validación del XSD
      throw e;
    }
  };
  const desde = fecha(c.fechaServicioDesde, 'fechaServicioDesde');
  const hasta = fecha(c.fechaServicioHasta, 'fechaServicioHasta');
  if (desde !== undefined && hasta !== undefined && desde > hasta) {
    add('fechaServicioHasta', 'debe ser posterior o igual a fechaServicioDesde (133)');
  }
  const emision = fecha(c.fechaEmision, 'fechaEmision');
  const vto = fecha(c.fechaVencimientoPago, 'fechaVencimientoPago');
  if (emision !== undefined && vto !== undefined && vto < emision) {
    add('fechaVencimientoPago', 'debe ser posterior o igual a fechaEmision (125)');
  }

  if (c.codigoMoneda === 'PES') {
    if (c.cotizacionMoneda !== undefined && c.cotizacionMoneda !== 1)
      add('cotizacionMoneda', 'debe ser 1 si codigoMoneda es PES (120)', c.cotizacionMoneda);
    if (c.cancelaEnMismaMonedaExtranjera === 'S')
      add('cancelaEnMismaMonedaExtranjera', 'no corresponde con codigoMoneda PES (169)', 'S');
  }
  if (c.cotizacionMoneda === undefined && c.cancelaEnMismaMonedaExtranjera !== 'S') {
    add('cotizacionMoneda', 'es obligatoria salvo cancelaEnMismaMonedaExtranjera = "S" (194)');
  }

  (c.otrosTributos ?? []).forEach((t, i) => {
    if (t?.codigo === 99 && !t.descripcion)
      add(`otrosTributos[${i}].descripcion`, 'es obligatoria si codigo es 99 (301)');
  });

  // --- Ítems ---------------------------------------------------------------
  const ivaItem: number[] = [];
  items.forEach((item, i) => {
    validarItemEstructura(item, i, tipo, errors);
    const p = `items[${i}]`;
    const u = item.codigoUnidadMedida;
    const alic = ALICUOTAS_IVA[item.codigoCondicionIVA];
    const importeItem = imp(item.importeItem);
    const importeIVA = imp(item.importeIVA);

    if (alic === undefined) {
      add(
        `${p}.codigoCondicionIVA`,
        `condición de IVA ${item.codigoCondicionIVA} desconocida (consultá getCondicionesIVA())`,
        item.codigoCondicionIVA,
      );
      ivaItem.push(0);
      return;
    }
    ivaItem.push(CLASE_B.has(tipo) ? importeItem - importeItem / (1 + alic) : importeIVA);

    // Signo del importe (518) y del IVA (517).
    if ((u === BONIFICACION || u === ANULACION) && !(importeItem < 0)) {
      add(`${p}.importeItem`, `debe ser menor a 0 con unidad de medida ${u} (518)`, item.importeItem);
    } else if (u !== SENA && u !== BONIFICACION && u !== ANULACION && importeItem < 0) {
      add(`${p}.importeItem`, 'debe ser mayor o igual a 0 (518)', item.importeItem);
    }
    if (ITEM_CON_IVA.has(tipo)) {
      if ((u === BONIFICACION || u === ANULACION) && importeIVA > 0) {
        add(`${p}.importeIVA`, `debe ser menor o igual a 0 con unidad de medida ${u} (517)`, item.importeIVA);
      } else if (u !== SENA && u !== BONIFICACION && u !== ANULACION && importeIVA < 0) {
        add(`${p}.importeIVA`, 'debe ser mayor o igual a 0 (517)', item.importeIVA);
      }
    }

    // Bonificación <= precio * cantidad (511).
    const bruto = dec(item.precioUnitario) * dec(item.cantidad);
    if (item.importeBonificacion !== undefined && dec(item.importeBonificacion) > bruto + 1e-9) {
      add(
        `${p}.importeBonificacion`,
        'debe ser menor o igual a precioUnitario * cantidad (511)',
        item.importeBonificacion,
      );
    }

    // Unidad 99: tiene que haber otro ítem con la misma condición de IVA (513).
    if (
      u === BONIFICACION &&
      !items.some(
        (o) => o !== item && o.codigoCondicionIVA === item.codigoCondicionIVA && o.codigoUnidadMedida !== BONIFICACION,
      )
    ) {
      add(`${p}.codigoUnidadMedida`, 'una bonificación (99) requiere otro ítem con la misma condición de IVA (513)', u);
    }

    // Fórmulas de importe (515, 519).
    const base = bruto - dec(item.importeBonificacion);
    const signo = u === ANULACION ? -1 : 1;
    if (ITEM_CON_IVA.has(tipo)) {
      if (u === SENA || u === BONIFICACION) {
        const esperado = importeItem - importeItem / (1 + alic);
        if (!dentroDelMargen(importeIVA, esperado)) {
          add(
            `${p}.importeIVA`,
            `debe ser importeItem - importeItem / (1 + alícuota) = ${fmt(esperado)} (515)`,
            item.importeIVA,
          );
        }
      } else if (item.cantidad !== undefined && item.precioUnitario !== undefined) {
        const ivaEsperado = signo * base * alic;
        const itemEsperado = signo * base * (1 + alic);
        if (!dentroDelMargen(importeIVA, ivaEsperado)) {
          add(
            `${p}.importeIVA`,
            `debe ser (precioUnitario * cantidad - importeBonificacion) * alícuota = ${fmt(ivaEsperado)} (515)`,
            item.importeIVA,
          );
        }
        if (!dentroDelMargen(importeItem, itemEsperado)) {
          add(
            `${p}.importeItem`,
            `debe ser (precioUnitario * cantidad - importeBonificacion) * (1 + alícuota) = ${fmt(itemEsperado)} (519)`,
            item.importeItem,
          );
        }
      }
    } else if (
      ITEM_SIN_IVA.has(tipo) &&
      u !== SENA &&
      u !== BONIFICACION &&
      item.cantidad !== undefined &&
      item.precioUnitario !== undefined
    ) {
      const itemEsperado = signo * base;
      if (!dentroDelMargen(importeItem, itemEsperado)) {
        add(
          `${p}.importeItem`,
          `debe ser precioUnitario (con IVA) * cantidad - importeBonificacion = ${fmt(itemEsperado)} (519)`,
          item.importeItem,
        );
      }
    }
  });

  // --- Subtotales de IVA (127, 400-405) -----------------------------------
  const subtotales = c.subtotalesIVA ?? [];
  const codigosConIVA = new Set(
    items.filter((i) => CON_SUBTOTAL.has(i.codigoCondicionIVA)).map((i) => i.codigoCondicionIVA),
  );
  const vistos = new Set<number>();
  subtotales.forEach((s, i) => {
    const p = `subtotalesIVA[${i}]`;
    if (!CON_SUBTOTAL.has(s?.codigo)) {
      add(`${p}.codigo`, 'debe ser 4, 5 o 6 (400)', s?.codigo);
      return;
    }
    if (vistos.has(s.codigo)) add(`${p}.codigo`, `subtotal de IVA ${s.codigo} repetido (402)`, s.codigo);
    vistos.add(s.codigo);
    if (!codigosConIVA.has(s.codigo)) {
      add(`${p}.codigo`, `no hay ítems con condición de IVA ${s.codigo} (403)`, s.codigo);
      return;
    }
    const delCodigo = items
      .map((it, k) => (it.codigoCondicionIVA === s.codigo ? ivaItem[k] : undefined))
      .filter((v): v is number => v !== undefined);
    const esperado = sum(delCodigo);
    if (!dentroDelMargen(imp(s.importe), esperado, delCodigo.length)) {
      add(
        `${p}.importe`,
        `debe ser la suma del IVA de los ítems con condición ${s.codigo} = ${fmt(esperado)} (401)`,
        s.importe,
      );
    }
  });
  for (const codigo of codigosConIVA) {
    if (!vistos.has(codigo)) add('subtotalesIVA', `falta el subtotal de IVA para la condición ${codigo} (403)`);
  }
  const totalIVA = sum(subtotales.map((s) => imp(s?.importe)));
  if (totalIVA < 0) add('subtotalesIVA', 'la suma de los subtotales de IVA no puede ser negativa (405)');

  // --- Totales (110-116) ----------------------------------------------------
  const porCondicion = (pred: (cond: number) => boolean) =>
    items.map((it, k) => ({ it, k })).filter(({ it }) => pred(it.codigoCondicionIVA));
  if (CLASE_A.has(tipo) || CLASE_B.has(tipo)) {
    const gravados = porCondicion((x) => GRAVADAS.has(x));
    const gravadoEsperado = sum(gravados.map(({ it, k }) => imp(it.importeItem) - ivaItem[k]));
    if (!dentroDelMargen(imp(c.importeGravado), gravadoEsperado, gravados.length)) {
      add(
        'importeGravado',
        `debe ser la suma de importeItem sin IVA de los ítems gravados = ${fmt(gravadoEsperado)} (110)`,
        c.importeGravado,
      );
    }
  }
  const noGravados = porCondicion((x) => x === 1);
  const noGravadoEsperado = sum(noGravados.map(({ it }) => imp(it.importeItem)));
  if (!dentroDelMargen(imp(c.importeNoGravado), noGravadoEsperado, noGravados.length)) {
    add(
      'importeNoGravado',
      `debe ser la suma de importeItem de los ítems no gravados = ${fmt(noGravadoEsperado)} (111)`,
      c.importeNoGravado,
    );
  }
  const exentos = porCondicion((x) => x === 2);
  const exentoEsperado = sum(exentos.map(({ it }) => imp(it.importeItem)));
  if (!dentroDelMargen(imp(c.importeExento), exentoEsperado, exentos.length)) {
    add(
      'importeExento',
      `debe ser la suma de importeItem de los ítems exentos = ${fmt(exentoEsperado)} (112)`,
      c.importeExento,
    );
  }
  const subtotalEsperado = imp(c.importeGravado) + imp(c.importeNoGravado) + imp(c.importeExento);
  if (!dentroDelMargen(imp(c.importeSubtotal), subtotalEsperado)) {
    add(
      'importeSubtotal',
      `debe ser importeGravado + importeNoGravado + importeExento = ${fmt(subtotalEsperado)} (113)`,
      c.importeSubtotal,
    );
  }
  const tributos = c.otrosTributos ?? [];
  const tributosEsperado = sum(tributos.map((t) => imp(t?.importe)));
  if (!dentroDelMargen(imp(c.importeOtrosTributos), tributosEsperado, tributos.length)) {
    add(
      'importeOtrosTributos',
      `debe ser la suma de otrosTributos[].importe = ${fmt(tributosEsperado)} (114)`,
      c.importeOtrosTributos,
    );
  }
  const total = imp(c.importeTotal);
  const totalPorSubtotales = imp(c.importeSubtotal) + imp(c.importeOtrosTributos) + totalIVA;
  if (!dentroDelMargen(total, totalPorSubtotales)) {
    add(
      'importeTotal',
      `debe ser importeSubtotal + importeOtrosTributos + subtotales de IVA = ${fmt(totalPorSubtotales)} (115)`,
      c.importeTotal,
    );
  }
  const totalPorItems = imp(c.importeOtrosTributos) + sum(items.map((it) => imp(it.importeItem)));
  if (!dentroDelMargen(total, totalPorItems, items.length)) {
    add(
      'importeTotal',
      `debe ser importeOtrosTributos + suma de importeItem = ${fmt(totalPorItems)} (116)`,
      c.importeTotal,
    );
  }

  throwIfErrors(errors, 'Comprobante inválido');
}
