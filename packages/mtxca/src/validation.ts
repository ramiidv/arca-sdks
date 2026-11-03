import { ArcaValidationError, formatDate, parseAfipDate } from '@ramiidv/arca-common';
import type { ValidationErrorDetail } from '@ramiidv/arca-common';
import { ALICUOTAS_IVA, Moneda, UnidadMedidaEspecial } from './constants.js';
import { roundDecimal, roundImporte } from './format.js';
import type { FechaInput, MtxcaComprobanteBase, MtxcaItem } from './types.js';

// Validaciones de negocio del manual del desarrollador de WSMTXCA (v0.25.8).
// Los números entre paréntesis son los códigos de error de ARCA que se evitan.

// --- Tipos de comprobante ---------------------------------------------------
/** A y "A con leyenda" (no FCE): el ítem lleva importeIVA y el precio va sin IVA (514, 515, 519). */
const ITEM_CON_IVA = new Set([1, 2, 3, 51, 52, 53]);
/** B (no FCE): el ítem no lleva importeIVA y el precio incluye IVA (514, 519). */
const ITEM_SIN_IVA = new Set([6, 7, 8]);
/** Factura de Crédito Electrónica MiPyME A y B (factura, ND, NC). */
const FCE_A = new Set([201, 202, 203]);
const FCE_B = new Set([206, 207, 208]);
const FCE = union(FCE_A, FCE_B);
/** Facturas FCE: exigen `fechaVencimientoPago` (148 / 764). */
const FCE_FACTURA = new Set([201, 206]);
const FCE_ND = new Set([202, 207]);
const FCE_NC = new Set([203, 208]);
/** Notas de débito/crédito FCE: no llevan `fechaVencimientoPago` (149 / 765). */
const FCE_NOTA = union(FCE_ND, FCE_NC);
/** Clase A (incluye "A con leyenda" y FCE A) y clase B (incluye FCE B). */
const CLASE_A = union(ITEM_CON_IVA, FCE_A);
const CLASE_B = union(ITEM_SIN_IVA, FCE_B);
/** Tipos que exigen receptor con CUIT: clase A y FCE (128, 129 / 718, 733). */
const RECEPTOR_CUIT = union(ITEM_CON_IVA, FCE);
/** Notas de débito/crédito que exigen comprobantes asociados o período (160, 161 / 778, 779). */
const NOTA_CON_ASOCIADOS = new Set([2, 3, 7, 8, 52, 53]);
/** Tipos que admiten `cancelaEnMismaMonedaExtranjera` = "S" (118). */
const CANCELA_MISMA_MONEDA = new Set([1, 6, 51, 201, 206]);
/**
 * Facturas que no admiten período de comprobantes asociados (162 / 780). El
 * manual lista "1, 2, 51, 201 ó 206 correspondientes a Facturas": el 2 (ND A)
 * contradice la 160, que le admite período, así que se toman solo las facturas
 * A; la B (6) no figura.
 */
const FACTURA_SIN_PERIODO = new Set([1, 51, 201, 206]);
/** Tipos que admiten el dato adicional 5 (337 / 935): A y FCE A. */
const TIPOS_MOTIVO_EXCEPCION = union(new Set([1, 2, 3]), FCE_A);

// --- Comprobantes asociados de FCE (208, 212, 214 / 808, 812, 814) ----------
/** Comprobantes (remitos) que asocia una factura FCE (208 / 808). */
const ASOCIABLES_FACTURA_FCE = new Set([88, 91, 990, 995]);
/** Lo que revierte una nota FCE de anulación (214 / 814): la NC, facturas y ND; la ND, NC. */
const REVIERTE_NC_FCE = union(FCE_FACTURA, FCE_ND);
const REVIERTE_ND_FCE = FCE_NC;

// --- Ítems, condiciones de IVA y receptor -----------------------------------
const { SENA, BONIFICACION, ANULACION_DEVOLUCION } = UnidadMedidaEspecial;
/** Conceptos válidos (121 / 713). */
const CONCEPTOS = new Set([1, 2, 3]);
/** Condiciones de IVA sin IVA (no gravado, exento, 0%): importeIVA 0 (521). */
const CONDICION_SIN_IVA = new Set([1, 2, 3]);
/** Condiciones de IVA gravadas (110) y las que llevan subtotal de IVA (127, 400). */
const GRAVADAS = new Set([3, 4, 5, 6]);
const CON_SUBTOTAL = new Set([4, 5, 6]);
const DOC_CUIT = 80;
/** Tipos de documento de los compradores: CUIT, CUIL o CDI (422). */
const DOC_COMPRADOR = new Set([80, 86, 87]);

/** CUIT genérico del Sujeto No Categorizado (145, 342) y su condición frente al IVA (RG 5616). */
const CUIT_NO_CATEGORIZADO = '23000000000';
const CONDICION_NO_CATEGORIZADO = 7;
/** Tributo 13: Percepción de IVA No Categorizado (145). */
const TRIBUTO_PERCEPCION_NO_CATEGORIZADO = 13;

/** Datos adicionales (`t`) de FCE MiPyME y de cómputo de crédito fiscal. */
const DATO = { MOTIVO_EXCEPCION: 5, CBU: 21, ANULACION: 22, REFERENCIA: 23, TRANSFERENCIA: 27 } as const;
/** Datos adicionales que solo van en FCE (326) y exigen `c1` (333 / 931). */
const DATOS_FCE = new Set<number>([DATO.CBU, DATO.ANULACION, DATO.REFERENCIA]);

function union(...sets: ReadonlySet<number>[]): Set<number> {
  return new Set(sets.flatMap((s) => [...s]));
}

/** `1, 2 y 3`, ordenados, para los mensajes. */
function lista(set: ReadonlySet<number>, y = 'y'): string {
  const v = [...set].sort((a, b) => a - b);
  return v.length < 2 ? v.join('') : `${v.slice(0, -1).join(', ')} ${y} ${v[v.length - 1]}`;
}

/** Número de documento comparable: number o string, sin guiones (como se envía). */
function nroDoc(v: unknown): string {
  return typeof v === 'string' ? v.replace(/-/g, '') : String(v);
}

const esObjeto = <T>(v: T | null | undefined): v is T => v !== null && typeof v === 'object';
const arr = <T>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : []);

/**
 * Códigos de error de las reglas que se aplican igual en `autorizarComprobante`
 * (CAE) y en `informarComprobanteCAEA`: cada método tiene su numeración.
 * `undefined`: en ese método la regla solo observa (no se valida localmente).
 */
const CODIGOS = {
  cae: {
    item: { unidades: 500, codigoMtx: 503, cantidad: 507, precio: 509, bonif: 510, iva: 514, par: 520, ivaCero: 521 },
    concepto: 121,
    docPar: 108,
    receptor: [128, 129],
    condicionIVA: 190,
    fechaVtoPagoFCE: [148, 149],
    notaAsociados: [160, 161],
    noCategorizado: { sujeto: 342, percepcion: 145 },
    dato: {
      soloFCE: 326,
      anulacionSN: 327,
      nota22: 329,
      factura22: 330,
      factura21: 331,
      nota21: 332,
      c1: 333,
      transferencia: 334,
      factura27: 335,
      nota27: 336,
      t5Tipos: 337,
      t5c1: 338,
      t5Valor: 339,
      t5Resto: 340,
    },
    asociados: {
      periodoFCE: 159,
      periodoFactura: 162,
      factura: 208,
      cuit: 209,
      cuitEmisor: 210,
      unoFCE: 212,
      anulacion: 214,
    },
  },
  caea: {
    item: {
      unidades: 1100,
      codigoMtx: 1103,
      cantidad: 1107,
      precio: 1109,
      bonif: 1110,
      iva: 1112,
      par: 1121,
      ivaCero: undefined, // 1122 solo observa
    },
    concepto: 713,
    docPar: 707,
    receptor: [718, 733],
    condicionIVA: 390,
    fechaVtoPagoFCE: [764, 765],
    notaAsociados: [778, 779],
    noCategorizado: { sujeto: 889, percepcion: undefined }, // 749 solo observa
    dato: {
      soloFCE: undefined, // 923 solo observa
      anulacionSN: 925,
      nota22: 927,
      factura22: 928,
      factura21: 929,
      nota21: 930,
      c1: 931,
      transferencia: 932,
      factura27: 933,
      nota27: 934,
      t5Tipos: 935,
      t5c1: 936,
      t5Valor: 937,
      t5Resto: 938,
    },
    asociados: {
      periodoFCE: 777,
      periodoFactura: 780,
      factura: 808,
      cuit: 809,
      cuitEmisor: 810,
      unoFCE: 812,
      anulacion: 814,
    },
  },
} as const;
type Codigos = (typeof CODIGOS)['cae' | 'caea'];

/**
 * Contexto opcional de las reglas: el CUIT del emisor no puede ser comprador
 * (426), y es el del comprobante FCE que asocia una nota FCE (210 / 810).
 */
export interface ContextoReglas {
  cuitEmisor?: number | string;
}

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
 * Reglas de presencia de campos de un ítem, con los códigos de cada método
 * (CAE: 500, 503, 507, 509, 510, 514, 520, 521; CAEA: 1100, 1103, 1107, 1109,
 * 1110, 1112, 1121). En CAEA el IVA en 0 de las condiciones 1 a 3 solo observa (1122).
 */
function validarItemEstructura(
  item: MtxcaItem,
  i: number,
  cbteTipo: number,
  codigos: Codigos['item'],
  errors: ValidationErrorDetail[],
): void {
  const p = `items[${i}]`;
  const add = (field: string, message: string, value: unknown) =>
    errors.push({ field: `${p}.${field}`, message, value });
  const sinCantidad = esUnidadSinCantidad(item);

  if (!sinCantidad) {
    if (item.unidadesMtx === undefined)
      add('unidadesMtx', `es obligatorio salvo unidad de medida 97 o 99 (${codigos.unidades})`, item.unidadesMtx);
    if (item.codigoMtx === undefined)
      add('codigoMtx', `es obligatorio salvo unidad de medida 97 o 99 (${codigos.codigoMtx})`, item.codigoMtx);
    if (item.cantidad === undefined)
      add('cantidad', `es obligatoria salvo unidad de medida 97 o 99 (${codigos.cantidad})`, item.cantidad);
    if (item.precioUnitario === undefined)
      add('precioUnitario', `es obligatorio salvo unidad de medida 97 o 99 (${codigos.precio})`, item.precioUnitario);
  } else {
    if (item.cantidad !== undefined)
      add('cantidad', `no corresponde con unidad de medida 97 o 99 (${codigos.cantidad})`, item.cantidad);
    if (item.precioUnitario !== undefined)
      add('precioUnitario', `no corresponde con unidad de medida 97 o 99 (${codigos.precio})`, item.precioUnitario);
    if (item.importeBonificacion !== undefined) {
      add(
        'importeBonificacion',
        `no corresponde con unidad de medida 97 o 99 (${codigos.bonif})`,
        item.importeBonificacion,
      );
    }
  }
  // Fuera de 97/99 los dos son obligatorios (ya reportado arriba).
  if (sinCantidad && (item.unidadesMtx === undefined) !== (item.codigoMtx === undefined)) {
    add('unidadesMtx', `unidadesMtx y codigoMtx se informan juntos (${codigos.par})`, item.unidadesMtx);
  }
  if (ITEM_CON_IVA.has(cbteTipo) && item.importeIVA === undefined) {
    add('importeIVA', `es obligatorio para el tipo de comprobante ${cbteTipo} (${codigos.iva})`, item.importeIVA);
  }
  if (ITEM_SIN_IVA.has(cbteTipo) && item.importeIVA !== undefined) {
    add('importeIVA', `no corresponde para el tipo de comprobante ${cbteTipo} (${codigos.iva})`, item.importeIVA);
  }
  if (
    codigos.ivaCero !== undefined &&
    CONDICION_SIN_IVA.has(item.codigoCondicionIVA) &&
    item.importeIVA !== undefined &&
    imp(item.importeIVA) !== 0
  ) {
    add(
      'importeIVA',
      `debe ser 0 si codigoCondicionIVA es ${lista(CONDICION_SIN_IVA, 'o')} (${codigos.ivaCero})`,
      item.importeIVA,
    );
  }
}

/**
 * Reglas del comprobante comunes a CAE y CAEA: concepto (121 / 713), tipo y
 * número de documento juntos (108 / 707), receptor con CUIT en clase A y FCE
 * (128, 129 / 718, 733), condición de IVA del receptor (190 / 390),
 * `fechaVencimientoPago` en FCE (148, 149 / 764, 765), asociados de las notas
 * (160, 161 / 778, 779), Sujeto No Categorizado (342 / 889), asociados y
 * período en FCE y datos adicionales.
 */
function reglasComunes(
  c: MtxcaComprobanteBase,
  codigos: Codigos,
  ctx: ContextoReglas,
  errors: ValidationErrorDetail[],
): void {
  if (!CONCEPTOS.has(c.codigoConcepto))
    errors.push({
      field: 'codigoConcepto',
      message: `debe ser ${lista(CONCEPTOS, 'o')} (${codigos.concepto})`,
      value: c.codigoConcepto,
    });
  if ((c.codigoTipoDocumento === undefined) !== (c.numeroDocumento === undefined))
    errors.push({
      field: 'numeroDocumento',
      message: `codigoTipoDocumento y numeroDocumento se informan juntos (${codigos.docPar})`,
    });
  reglaReceptorCUIT(c, codigos.receptor, errors);
  reglasNoCategorizado(c, codigos.noCategorizado, errors);
  reglaCondicionIVAReceptor(c, codigos.condicionIVA, errors);
  reglasFCE(c, codigos.fechaVtoPagoFCE, errors);
  reglasAsociados(c, codigos.notaAsociados, errors);
  reglasAsociadosFCE(c, codigos.asociados, ctx, errors);
  reglasDatosAdicionales(c, codigos.dato, errors);
}

/** Clase A y FCE: receptor obligatorio (128 / 718) y con CUIT (129 / 733). */
function reglaReceptorCUIT(
  c: MtxcaComprobanteBase,
  [falta, no80]: readonly [number, number],
  errors: ValidationErrorDetail[],
): void {
  const tipo = c.codigoTipoComprobante;
  if (!RECEPTOR_CUIT.has(tipo)) return;
  if (c.codigoTipoDocumento === undefined)
    errors.push({
      field: 'codigoTipoDocumento',
      message: `es obligatorio para el tipo de comprobante ${tipo} (${falta})`,
    });
  else if (c.codigoTipoDocumento !== DOC_CUIT)
    errors.push({
      field: 'codigoTipoDocumento',
      message: `debe ser 80 (CUIT) para el tipo de comprobante ${tipo} (${no80})`,
      value: c.codigoTipoDocumento,
    });
}

/** `fechaHoraGen` obligatoria en todo comprobante CAEA desde el 01/08/2026 (754). */
export function reglaFechaHoraGen(c: MtxcaComprobanteBase, errors: ValidationErrorDetail[]): void {
  if ((c as { fechaHoraGen?: unknown }).fechaHoraGen === undefined) {
    errors.push({ field: 'fechaHoraGen', message: 'es obligatoria para comprobantes CAEA desde el 01/08/2026 (754)' });
  }
}

/**
 * Datos adicionales de FCE MiPyME y del dato 5 (CAE 326-340, CAEA 925-938):
 * - 21, 22 y 23 solo en FCE (326; en CAEA solo observa) y con `c1` (333 / 931).
 * - 22 (anulación) con `c1` S o N (327 / 925): obligatorio en las notas FCE
 *   (329 / 927) y no va en las facturas (330 / 928).
 * - 21 (CBU) y 27 (opción de transferencia, ADC o SCA: 334 / 932): obligatorios
 *   en las facturas FCE (331, 335 / 929, 933) y no van en las notas (332, 336 / 930, 934).
 * - 5 (motivo de excepción): solo en 1, 2, 3, 201, 202 y 203 (337 / 935), con
 *   `c1` de 1 a 6 (338, 339 / 936, 937) y sin `c2` a `c6` (340 / 938).
 */
function reglasDatosAdicionales(c: MtxcaComprobanteBase, codigos: Codigos['dato'], errors: ValidationErrorDetail[]) {
  const datos = arr(c.datosAdicionales);
  const tipo = c.codigoTipoComprobante;
  const add = (field: string, message: string, value?: unknown) => errors.push({ field, message, value });
  const indice = (t: number) => datos.findIndex((d) => esObjeto(d) && d.t === t);
  const exigir = (t: number, codigo: number, nombre: string) => {
    if (indice(t) < 0)
      add('datosAdicionales', `el tipo ${tipo} requiere el dato adicional ${t} (${nombre}) (${codigo})`);
  };
  const prohibir = (t: number, codigo: number, nombre: string) => {
    const i = indice(t);
    if (i >= 0)
      add(`datosAdicionales[${i}].t`, `el tipo ${tipo} no lleva el dato adicional ${t} (${nombre}) (${codigo})`, t);
  };

  datos.forEach((d, i) => {
    if (!esObjeto(d)) return; // ya lo reporta la validación del XSD
    const p = `datosAdicionales[${i}]`;
    if (DATOS_FCE.has(d.t)) {
      if (codigos.soloFCE !== undefined && !FCE.has(tipo))
        add(`${p}.t`, `el dato adicional ${d.t} solo corresponde a FCE MiPyME (${codigos.soloFCE})`, d.t);
      if (d.c1 === undefined) add(`${p}.c1`, `es obligatorio en el dato adicional ${d.t} (${codigos.c1})`);
    }
    if (d.t === DATO.ANULACION && d.c1 !== undefined && d.c1 !== 'S' && d.c1 !== 'N')
      add(`${p}.c1`, `debe ser S o N en el dato adicional 22 (anulación) (${codigos.anulacionSN})`, d.c1);
    if (d.t === DATO.TRANSFERENCIA && d.c1 !== 'ADC' && d.c1 !== 'SCA')
      add(`${p}.c1`, `debe ser ADC o SCA en el dato adicional 27 (${codigos.transferencia})`, d.c1);
    if (d.t === DATO.MOTIVO_EXCEPCION) {
      // 338-340 solo aplican a los tipos que admiten el dato 5.
      if (!TIPOS_MOTIVO_EXCEPCION.has(tipo)) {
        add(
          `${p}.t`,
          `el dato adicional 5 solo corresponde a los tipos ${lista(TIPOS_MOTIVO_EXCEPCION)} (${codigos.t5Tipos})`,
          d.t,
        );
        return;
      }
      if (d.c1 === undefined) add(`${p}.c1`, `es obligatorio en el dato adicional 5 (${codigos.t5c1})`);
      else if (!/^[1-6]$/.test(d.c1)) add(`${p}.c1`, `debe ser un número del 1 al 6 (${codigos.t5Valor})`, d.c1);
      if ((['c2', 'c3', 'c4', 'c5', 'c6'] as const).some((k) => d[k] !== undefined))
        add(p, `el dato adicional 5 solo lleva c1 (${codigos.t5Resto})`);
    }
  });

  if (FCE_FACTURA.has(tipo)) {
    prohibir(DATO.ANULACION, codigos.factura22, 'anulación');
    exigir(DATO.CBU, codigos.factura21, 'CBU y alias del emisor');
    exigir(DATO.TRANSFERENCIA, codigos.factura27, 'opción de transferencia');
  } else if (FCE_NOTA.has(tipo)) {
    exigir(DATO.ANULACION, codigos.nota22, 'anulación');
    prohibir(DATO.CBU, codigos.nota21, 'CBU y alias del emisor');
    prohibir(DATO.TRANSFERENCIA, codigos.nota27, 'opción de transferencia');
  }
}

/** `true` si la nota FCE es de anulación (dato adicional 22 = "S"). */
function esAnulacionFCE(c: MtxcaComprobanteBase): boolean {
  return arr(c.datosAdicionales).some((d) => esObjeto(d) && d.t === DATO.ANULACION && d.c1 === 'S');
}

/**
 * Comprobantes asociados y período en FCE y facturas (CAE 159, 162, 208, 209,
 * 210, 212, 214; CAEA 777, 780, 808, 809, 810, 812, 814):
 * - Las notas FCE no llevan período (159 / 777), y tampoco las facturas 1, 51,
 *   201 y 206 (162 / 780).
 * - Las facturas FCE solo asocian 88, 91, 990 o 995 (208 / 808).
 * - Las notas FCE llevan exactamente un asociado FCE: 201 o 206, o en una
 *   anulación (dato adicional 22 = "S") cualquier FCE (212 / 812), y ese
 *   asociado lleva `cuit` (209 / 809; los remitos asociados no: 204), que es
 *   el del emisor (210 / 810, si se conoce `ctx.cuitEmisor`). En una
 *   anulación, la NC revierte 201, 202, 206 o 207 y la ND revierte 203 o 208
 *   (214 / 814).
 */
function reglasAsociadosFCE(
  c: MtxcaComprobanteBase,
  codigos: Codigos['asociados'],
  ctx: ContextoReglas,
  errors: ValidationErrorDetail[],
) {
  const tipo = c.codigoTipoComprobante;
  const asociados = arr(c.comprobantesAsociados)
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => esObjeto(a));
  const add = (field: string, message: string, value?: unknown) => errors.push({ field, message, value });
  if (c.periodoComprobantesAsociados !== undefined) {
    if (FCE_NOTA.has(tipo))
      add('periodoComprobantesAsociados', `no corresponde en notas FCE MiPyME (${codigos.periodoFCE})`);
    else if (FACTURA_SIN_PERIODO.has(tipo))
      add('periodoComprobantesAsociados', `no corresponde en la factura tipo ${tipo} (${codigos.periodoFactura})`);
  }
  if (FCE_FACTURA.has(tipo)) {
    for (const { a, i } of asociados) {
      if (!ASOCIABLES_FACTURA_FCE.has(a.codigoTipoComprobante))
        add(
          `comprobantesAsociados[${i}].codigoTipoComprobante`,
          `una factura FCE solo asocia los tipos ${lista(ASOCIABLES_FACTURA_FCE, 'o')} (${codigos.factura})`,
          a.codigoTipoComprobante,
        );
    }
    return;
  }
  if (!FCE_NOTA.has(tipo)) return;
  const anulacion = esAnulacionFCE(c);
  const admitidos = anulacion ? FCE : FCE_FACTURA;
  for (const { a, i } of asociados) {
    if (!FCE.has(a.codigoTipoComprobante)) continue;
    if (a.cuit === undefined)
      add(`comprobantesAsociados[${i}].cuit`, `es obligatorio en las notas FCE MiPyME (${codigos.cuit})`);
    else if (ctx.cuitEmisor !== undefined && nroDoc(a.cuit) !== nroDoc(ctx.cuitEmisor))
      add(
        `comprobantesAsociados[${i}].cuit`,
        `tiene que ser el CUIT del emisor del comprobante (${codigos.cuitEmisor})`,
        a.cuit,
      );
  }
  const fce = asociados.filter(({ a }) => admitidos.has(a.codigoTipoComprobante));
  if (fce.length !== 1) {
    add(
      'comprobantesAsociados',
      `una nota FCE MiPyME${anulacion ? ' de anulación' : ''} lleva un solo comprobante asociado de los tipos ${lista(admitidos, 'o')} (${codigos.unoFCE})`,
    );
    return;
  }
  const [{ a, i }] = fce;
  const revierte = FCE_NC.has(tipo) ? REVIERTE_NC_FCE : REVIERTE_ND_FCE;
  if (anulacion && !revierte.has(a.codigoTipoComprobante))
    add(
      `comprobantesAsociados[${i}].codigoTipoComprobante`,
      `en una anulación, el tipo ${tipo} revierte los tipos ${lista(revierte, 'o')} (${codigos.anulacion})`,
      a.codigoTipoComprobante,
    );
}

/**
 * Sujeto No Categorizado (23000000000):
 * - 342 / 889: solo con comprobantes clase B (6, 7, 8) y `condicionIVAReceptor` 7.
 * - 145 (solo CAE; en CAEA, 749, solo observa): con importe gravado + IVA > 0
 *   hay que informar el tributo 13 con importe > 0.
 */
function reglasNoCategorizado(
  c: MtxcaComprobanteBase,
  codigos: Codigos['noCategorizado'],
  errors: ValidationErrorDetail[],
): void {
  if (c.codigoTipoDocumento !== DOC_CUIT || nroDoc(c.numeroDocumento) !== CUIT_NO_CATEGORIZADO) return;
  const claseB = ITEM_SIN_IVA.has(c.codigoTipoComprobante);
  if (!claseB || c.condicionIVAReceptor !== CONDICION_NO_CATEGORIZADO) {
    errors.push({
      field: 'numeroDocumento',
      message: `el Sujeto No Categorizado (${CUIT_NO_CATEGORIZADO}) solo va en comprobantes ${lista(ITEM_SIN_IVA, 'u')} con condicionIVAReceptor ${CONDICION_NO_CATEGORIZADO} (${codigos.sujeto})`,
      value: c.numeroDocumento,
    });
  }
  if (codigos.percepcion === undefined || !claseB) return;
  const gravado = imp(c.importeGravado) + sum(arr(c.subtotalesIVA).map((s) => imp(s?.importe)));
  const percepcion = arr(c.otrosTributos).some(
    (t) => t?.codigo === TRIBUTO_PERCEPCION_NO_CATEGORIZADO && imp(t.importe) > 0,
  );
  if (gravado > 0 && !percepcion) {
    errors.push({
      field: 'otrosTributos',
      message: `al Sujeto No Categorizado con importe gravado hay que informar el tributo ${TRIBUTO_PERCEPCION_NO_CATEGORIZADO} con importe > 0 (${codigos.percepcion})`,
    });
  }
}

/**
 * Compradores en CAE (420-429, 432, 433): más de uno (420), con el receptor
 * informado (421), CUIT/CUIL/CDI (422), sin repetir (423), porcentaje mayor a 0
 * y menor a 100 (424, 425, por el XSD), distintos del emisor (426), sumando
 * 100 (427), con el receptor en la lista (428) y como uno de los de mayor
 * porcentaje (429). Solo con concepto 1 (432) y no en FCE MiPyME (433).
 */
function reglasCompradores(c: MtxcaComprobanteBase, ctx: ContextoReglas, errors: ValidationErrorDetail[]): void {
  const compradores = arr(c.compradores)
    .map((x, i) => ({ x, i }))
    .filter(({ x }) => esObjeto(x)); // los que no son objeto ya los reporta el XSD
  if (compradores.length === 0) return;
  const add = (field: string, message: string, value?: unknown) => errors.push({ field, message, value });
  if (c.codigoConcepto !== 1) add('compradores', 'solo corresponden si codigoConcepto es 1 (productos) (432)');
  if (FCE.has(c.codigoTipoComprobante)) add('compradores', 'una FCE MiPyME no admite compradores (433)');
  if (compradores.length < 2) add('compradores', 'si se informan, tiene que haber más de un comprador (420)');
  // Tipo y número como se envían (number o string, con o sin guiones).
  const clave = (tipo: unknown, nro: unknown) => `${tipo}-${nroDoc(nro)}`;
  const vistos = new Set<string>();
  for (const { x, i } of compradores) {
    const p = `compradores[${i}]`;
    if (!DOC_COMPRADOR.has(x.codigoTipoDocumento))
      add(`${p}.codigoTipoDocumento`, 'debe ser 80, 86 u 87 (CUIT, CUIL o CDI) (422)', x.codigoTipoDocumento);
    const k = clave(x.codigoTipoDocumento, x.numeroDocumento);
    if (vistos.has(k)) add(`${p}.numeroDocumento`, 'comprador repetido (423)', x.numeroDocumento);
    vistos.add(k);
    if (ctx.cuitEmisor !== undefined && nroDoc(x.numeroDocumento) === nroDoc(ctx.cuitEmisor))
      add(`${p}.numeroDocumento`, 'el emisor del comprobante no puede ser comprador (426)', x.numeroDocumento);
  }
  // En centésimos, como se envían (2 decimales), para que la suma sea exacta.
  const centesimos = compradores.map(({ x }) => Math.round(imp(x.porcentaje) * 100));
  const total = sum(centesimos);
  if (total !== 10_000) add('compradores', `los porcentajes deben sumar 100 (suman ${fmt(total / 100)}) (427)`);
  if (c.codigoTipoDocumento === undefined || c.numeroDocumento === undefined) {
    add('codigoTipoDocumento', 'es obligatorio si se informan compradores (421)');
    return;
  }
  const receptor = compradores.findIndex(
    ({ x }) => clave(x.codigoTipoDocumento, x.numeroDocumento) === clave(c.codigoTipoDocumento, c.numeroDocumento),
  );
  if (receptor < 0) add('compradores', 'el receptor del comprobante tiene que estar entre los compradores (428)');
  else if (centesimos[receptor] < Math.max(...centesimos))
    add('compradores', 'el receptor tiene que ser uno de los compradores de mayor porcentaje (429)');
}

function itemsDe(c: MtxcaComprobanteBase): MtxcaItem[] {
  return arr(c?.items).filter(esObjeto);
}

/**
 * Valida las reglas que el manual marca como excluyentes para
 * `informarComprobanteCAEA`: presencia de campos de los ítems (1100-1112,
 * 1121), concepto (713), receptor (707, 718, 733), Sujeto No Categorizado
 * (889), subtotales de IVA (715), condición de IVA del receptor (390, RG
 * 5616), `fechaVencimientoPago` en FCE (764, 765), comprobantes asociados y
 * período (777-780, 808, 809, 810, 812, 814), datos adicionales (925-938),
 * compradores (753) y `fechaHoraGen` (754: obligatoria para todo comprobante
 * CAEA desde el 01/08/2026). Con `ctx.cuitEmisor` valida además el `cuit` del
 * asociado de una nota FCE (810). No valida el XSD.
 *
 * @throws ArcaValidationError
 */
export function validateComprobanteCAEA(c: MtxcaComprobanteBase, ctx?: ContextoReglas): void {
  const errors: ValidationErrorDetail[] = [];
  reglasComprobanteCAEA(c, errors, ctx);
  throwIfErrors(errors, 'Comprobante CAEA inválido');
}

/** Igual que `validateComprobanteCAEA`, pero agrega los errores a `errors` en lugar de lanzar. */
export function reglasComprobanteCAEA(
  c: MtxcaComprobanteBase,
  errors: ValidationErrorDetail[],
  ctx: ContextoReglas = {},
): void {
  const add = (field: string, message: string, value?: unknown) => errors.push({ field, message, value });
  const codigos = CODIGOS.caea;
  const items = itemsDe(c);
  items.forEach((item, i) => validarItemEstructura(item, i, c.codigoTipoComprobante, codigos.item, errors));
  reglasComunes(c, codigos, ctx, errors);
  if (items.some((it) => CON_SUBTOTAL.has(it.codigoCondicionIVA)) && arr(c.subtotalesIVA).length === 0) {
    add('subtotalesIVA', `es obligatorio si algún ítem tiene codigoCondicionIVA ${lista(CON_SUBTOTAL, 'o')} (715)`);
  }
  if (arr(c.compradores).length > 0) {
    add('compradores', 'no se admiten en informarComprobanteCAEA (753)');
  }
  reglaFechaHoraGen(c, errors);
}

/** RG 5616: la condición de IVA del receptor es obligatoria (190 en CAE, 390 en CAEA). */
function reglaCondicionIVAReceptor(c: MtxcaComprobanteBase, codigo: number, errors: ValidationErrorDetail[]): void {
  if (c.condicionIVAReceptor === undefined) {
    errors.push({
      field: 'condicionIVAReceptor',
      message: `es obligatoria (RG 5616; ver getCondicionesIVAReceptor()) (${codigo})`,
    });
  }
}

/**
 * `fechaVencimientoPago` en FCE: obligatoria en 201/206 y no corresponde en
 * 202/203/207/208, cualquiera sea el concepto (148/149 en CAE, 764/765 en CAEA).
 */
function reglasFCE(
  c: MtxcaComprobanteBase,
  [obligatoria, prohibida]: readonly [number, number],
  errors: ValidationErrorDetail[],
) {
  const tipo = c.codigoTipoComprobante;
  if (FCE_FACTURA.has(tipo) && c.fechaVencimientoPago === undefined) {
    errors.push({
      field: 'fechaVencimientoPago',
      message: `es obligatoria en Facturas de Crédito Electrónica MiPyME (${obligatoria})`,
    });
  }
  if (FCE_NOTA.has(tipo) && c.fechaVencimientoPago !== undefined) {
    errors.push({
      field: 'fechaVencimientoPago',
      message: `no corresponde en notas de débito/crédito de FCE MiPyME (${prohibida})`,
      value: c.fechaVencimientoPago,
    });
  }
}

/**
 * Notas de débito/crédito 2, 3, 7, 8, 52, 53: comprobantes asociados o período,
 * pero no los dos (160/161 en CAE, 778/779 en CAEA).
 */
function reglasAsociados(
  c: MtxcaComprobanteBase,
  [falta, ambos]: readonly [number, number],
  errors: ValidationErrorDetail[],
) {
  if (!NOTA_CON_ASOCIADOS.has(c.codigoTipoComprobante)) return;
  const asociados = Array.isArray(c.comprobantesAsociados) && c.comprobantesAsociados.length > 0;
  const periodo = c.periodoComprobantesAsociados !== undefined;
  if (!asociados && !periodo) {
    errors.push({
      field: 'comprobantesAsociados',
      message: `una nota de débito/crédito requiere comprobantesAsociados o periodoComprobantesAsociados (${falta})`,
    });
  } else if (asociados && periodo) {
    errors.push({
      field: 'periodoComprobantesAsociados',
      message: `no corresponde si se informan comprobantesAsociados (${ambos})`,
    });
  }
}

/**
 * Valida un comprobante a autorizar con CAE (`autorizarComprobante`) según
 * las validaciones excluyentes del manual: presencia de campos por unidad de
 * medida y tipo de comprobante, fórmulas de importe e IVA por ítem, subtotales
 * de IVA por alícuota y la coherencia de gravado/no gravado/exento/subtotal/
 * otros tributos/total, con el margen de error del manual; además, fechas por
 * concepto y FCE (122-125, 133, 148, 149), concepto (121), receptor (108,
 * 128, 129), condición de IVA del receptor (190, RG 5616), Sujeto No
 * Categorizado (145, 342), comprobantes asociados (159-162, 208, 209, 210,
 * 212, 214), datos adicionales (326-340), moneda (118, 120, 169, 194),
 * tributos (301, 302) y compradores (420-429, 432, 433). Con `ctx.cuitEmisor`
 * valida además que el emisor no sea comprador (426) y el `cuit` del asociado
 * de una nota FCE (210). Usa los importes ya redondeados como se envían (mitad
 * al par; 2 decimales, 6 en cantidad y precio). No valida el XSD.
 *
 * No reemplaza las validaciones de padrón que hace ARCA (CUIT activa, punto de
 * venta habilitado, correlatividad, etc.).
 *
 * @throws ArcaValidationError con todos los errores encontrados.
 */
export function validateComprobanteCAE(c: MtxcaComprobanteBase, ctx?: ContextoReglas): void {
  const errors: ValidationErrorDetail[] = [];
  reglasComprobanteCAE(c, errors, ctx);
  throwIfErrors(errors, 'Comprobante inválido');
}

/** Igual que `validateComprobanteCAE`, pero agrega los errores a `errors` en lugar de lanzar. */
export function reglasComprobanteCAE(
  c: MtxcaComprobanteBase,
  errors: ValidationErrorDetail[],
  ctx: ContextoReglas = {},
): void {
  const add = (field: string, message: string, value?: unknown) => errors.push({ field, message, value });
  const tipo = c.codigoTipoComprobante;
  const items = itemsDe(c);
  const codigos = CODIGOS.cae;

  // --- Comprobante -------------------------------------------------------
  reglasComunes(c, codigos, ctx, errors);

  // 122-124 por concepto; en FCE, fechaVencimientoPago sigue 148/149.
  const servicios = c.codigoConcepto === 2 || c.codigoConcepto === 3;
  const campos = FCE.has(tipo)
    ? (['fechaServicioDesde', 'fechaServicioHasta'] as const)
    : (['fechaServicioDesde', 'fechaServicioHasta', 'fechaVencimientoPago'] as const);
  for (const campo of campos) {
    const presente = c[campo] !== undefined;
    if (servicios && !presente) add(campo, 'es obligatoria si codigoConcepto es 2 o 3 (122-124)');
    if (!servicios && presente) add(campo, 'solo corresponde si codigoConcepto es 2 o 3 (122-124)', c[campo]);
  }
  const fecha = (v: FechaInput | undefined) => {
    if (v === undefined) return undefined;
    try {
      return parseAfipDate(formatDate(v)).getTime();
    } catch (e) {
      if (e instanceof ArcaValidationError) return undefined; // ya lo reporta la validación del XSD
      throw e;
    }
  };
  const desde = fecha(c.fechaServicioDesde);
  const hasta = fecha(c.fechaServicioHasta);
  if (desde !== undefined && hasta !== undefined && desde > hasta) {
    add('fechaServicioHasta', 'debe ser posterior o igual a fechaServicioDesde (133)');
  }
  const emision = fecha(c.fechaEmision);
  const vto = fecha(c.fechaVencimientoPago);
  if (emision !== undefined && vto !== undefined && vto < emision) {
    add('fechaVencimientoPago', 'debe ser posterior o igual a fechaEmision (125)');
  }

  if (c.codigoMoneda === Moneda.PESOS) {
    if (c.cotizacionMoneda !== undefined && c.cotizacionMoneda !== 1)
      add('cotizacionMoneda', 'debe ser 1 si codigoMoneda es PES (120)', c.cotizacionMoneda);
    if (c.cancelaEnMismaMonedaExtranjera === 'S')
      add('cancelaEnMismaMonedaExtranjera', 'no corresponde con codigoMoneda PES (169)', 'S');
  }
  if (c.cancelaEnMismaMonedaExtranjera === 'S' && !CANCELA_MISMA_MONEDA.has(tipo)) {
    add('cancelaEnMismaMonedaExtranjera', `solo corresponde en los tipos ${lista(CANCELA_MISMA_MONEDA)} (118)`, 'S');
  }
  if (c.cotizacionMoneda === undefined && c.cancelaEnMismaMonedaExtranjera !== 'S') {
    add('cotizacionMoneda', 'es obligatoria salvo cancelaEnMismaMonedaExtranjera = "S" (194)');
  }

  arr(c.otrosTributos).forEach((t, i) => {
    if (t?.descripcion) return;
    if (FCE.has(tipo)) add(`otrosTributos[${i}].descripcion`, 'es obligatoria en FCE MiPyME (302)');
    else if (t?.codigo === 99) add(`otrosTributos[${i}].descripcion`, 'es obligatoria si codigo es 99 (301)');
  });

  reglasCompradores(c, ctx, errors);

  // --- Ítems ---------------------------------------------------------------
  const ivaItem: number[] = [];
  items.forEach((item, i) => {
    validarItemEstructura(item, i, tipo, codigos.item, errors);
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
    if ((u === BONIFICACION || u === ANULACION_DEVOLUCION) && !(importeItem < 0)) {
      add(`${p}.importeItem`, `debe ser menor a 0 con unidad de medida ${u} (518)`, item.importeItem);
    } else if (u !== SENA && u !== BONIFICACION && u !== ANULACION_DEVOLUCION && importeItem < 0) {
      add(`${p}.importeItem`, 'debe ser mayor o igual a 0 (518)', item.importeItem);
    }
    if (ITEM_CON_IVA.has(tipo)) {
      if ((u === BONIFICACION || u === ANULACION_DEVOLUCION) && importeIVA > 0) {
        add(`${p}.importeIVA`, `debe ser menor o igual a 0 con unidad de medida ${u} (517)`, item.importeIVA);
      } else if (u !== SENA && u !== BONIFICACION && u !== ANULACION_DEVOLUCION && importeIVA < 0) {
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
    const signo = u === ANULACION_DEVOLUCION ? -1 : 1;
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

  // Bonificaciones (99): |Σ IVA| <= IVA del resto de los ítems de la condición (516).
  if (ITEM_CON_IVA.has(tipo)) {
    const condiciones = new Set(
      items.filter((it) => it.codigoUnidadMedida === BONIFICACION).map((it) => it.codigoCondicionIVA),
    );
    for (const cond of condiciones) {
      const deCond = items.filter((it) => it.codigoCondicionIVA === cond);
      const bonif = deCond.filter((it) => it.codigoUnidadMedida === BONIFICACION);
      const ivaBonif = Math.abs(sum(bonif.map((it) => imp(it.importeIVA))));
      const ivaResto = sum(
        deCond.filter((it) => it.codigoUnidadMedida !== BONIFICACION).map((it) => imp(it.importeIVA)),
      );
      if (ivaBonif > ivaResto && !dentroDelMargen(ivaBonif, ivaResto, deCond.length)) {
        const k = items.indexOf(bonif[0]);
        add(
          `items[${k}].importeIVA`,
          `el IVA de las bonificaciones con condición ${cond} (${fmt(ivaBonif)}) no puede superar el IVA de los ítems de esa condición = ${fmt(ivaResto)} (516)`,
          bonif[0].importeIVA,
        );
      }
    }
  }

  // --- Subtotales de IVA (127, 400-405) -----------------------------------
  const subtotales = arr(c.subtotalesIVA);
  const codigosConIVA = new Set(
    items.filter((i) => CON_SUBTOTAL.has(i.codigoCondicionIVA)).map((i) => i.codigoCondicionIVA),
  );
  const vistos = new Set<number>();
  subtotales.forEach((s, i) => {
    const p = `subtotalesIVA[${i}]`;
    if (!CON_SUBTOTAL.has(s?.codigo)) {
      add(`${p}.codigo`, `debe ser ${lista(CON_SUBTOTAL, 'o')} (400)`, s?.codigo);
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
  const tributos = arr(c.otrosTributos);
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
}
