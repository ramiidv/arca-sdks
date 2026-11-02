import { ArcaValidationError, formatDate, validateCuit } from '@ramiidv/arca-common';
import {
  CbteTipo,
  Concepto,
  DocTipo,
  IVA_RATES,
  Moneda,
  RECEPTORES_CLASE_A,
  TipoExpo,
  TributoTipo,
  isFacturaFCE,
  isFCE,
  isNotaCreditoODebito,
  isTipoA,
  isTipoC,
  isTipoE,
  isUmedSinCantidad,
} from './constants.js';
import type { FacturarOpts, FacturarExpoOpts, InvoiceRequest, LineItem, ExpoLineItem } from './types.js';

/** Lanza un ArcaValidationError con el formato común del SDK. */
export function fail(field: string, msg: string, value?: unknown): never {
  throw new ArcaValidationError(`Validación: ${msg}`, [{ field, message: msg, value }], field);
}

function isAmount(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/** Valida una fecha (Date o YYYYMMDD / YYYY-MM-DD existente) y la devuelve como YYYYMMDD. */
function checkFecha(field: string, fecha: unknown): string {
  try {
    return formatDate(fecha as Date | string);
  } catch {
    fail(field, `${field} debe ser un Date o una fecha existente con formato YYYYMMDD o YYYY-MM-DD`, fecha);
  }
}

function checkCuit(field: string, cuit: unknown): void {
  try {
    validateCuit(cuit as string | number);
  } catch {
    fail(field, `${field} no es un CUIT válido (dígito verificador)`, cuit);
  }
}

function checkEntero(field: string, n: unknown, min: number): void {
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min) fail(field, `${field} debe ser un entero >= ${min}`, n);
}

/**
 * Valida moneda, cotización y CanMisMonExt según el manual de WSFEv1:
 * - 10039: con PES, la cotización debe ser 1.
 * - 10038: con moneda extranjera la cotización es obligatoria (> 0) salvo CanMisMonExt = "S".
 * - 10239/10241: CanMisMonExt es "S" o "N", y con PES no puede ser "S".
 */
function checkMoneda(
  f: (name: string) => string,
  moneda: string,
  cotizacion: number | undefined,
  canMisMonExt: string | undefined,
  names: { cotizacion: string; canMisMonExt: string },
): void {
  if (cotizacion !== undefined && (!isAmount(cotizacion) || cotizacion <= 0))
    fail(f(names.cotizacion), `${names.cotizacion} debe ser un número mayor a 0`, cotizacion);
  if (canMisMonExt !== undefined && canMisMonExt !== 'S' && canMisMonExt !== 'N')
    fail(f(names.canMisMonExt), `${names.canMisMonExt} debe ser "S" o "N"`, canMisMonExt);
  if (moneda === Moneda.PESOS) {
    if (cotizacion !== undefined && cotizacion !== 1)
      fail(f(names.cotizacion), `con moneda PES ${names.cotizacion} debe ser 1 (validación 10039)`, cotizacion);
    if (canMisMonExt === 'S')
      fail(
        f(names.canMisMonExt),
        `${names.canMisMonExt} "S" solo aplica a moneda extranjera (validación 10241)`,
        canMisMonExt,
      );
  } else if (cotizacion === undefined && canMisMonExt !== 'S') {
    fail(
      f(names.cotizacion),
      `${names.cotizacion} es requerido para moneda extranjera (salvo ${names.canMisMonExt} "S")`,
    );
  }
}

export function validateFacturarOpts(opts: FacturarOpts): void {
  if (!opts.ptoVta || !Number.isInteger(opts.ptoVta) || opts.ptoVta < 1)
    fail('ptoVta', 'ptoVta debe ser un entero >= 1', opts.ptoVta);
  if (!opts.cbteTipo) fail('cbteTipo', 'cbteTipo es requerido');
  if (isTipoE(opts.cbteTipo))
    fail(
      'cbteTipo',
      `los comprobantes de exportación (clase E, tipo ${opts.cbteTipo}) se emiten por WSFEX: usar facturarExpo`,
      opts.cbteTipo,
    );
  if (opts.cbteNro !== undefined && (!Number.isInteger(opts.cbteNro) || opts.cbteNro < 1))
    fail('cbteNro', 'cbteNro debe ser un entero >= 1', opts.cbteNro);
  if (!opts.items || opts.items.length === 0) fail('items', 'items no puede estar vacío');

  validateItems(opts.items, opts.descuentoGlobal);

  if (opts.fecha !== undefined) checkFecha('fecha', opts.fecha);

  // Concepto y fechas de servicio (validaciones 10031-10035 y 10049).
  if (
    opts.concepto !== undefined &&
    ![Concepto.PRODUCTOS, Concepto.SERVICIOS, Concepto.PRODUCTOS_Y_SERVICIOS].includes(opts.concepto)
  )
    fail('concepto', 'concepto debe ser 1 (productos), 2 (servicios) o 3 (productos y servicios)', opts.concepto);
  const concepto = opts.concepto ?? (opts.servicio !== undefined ? Concepto.SERVICIOS : Concepto.PRODUCTOS);
  if (concepto === Concepto.PRODUCTOS && opts.servicio !== undefined)
    fail('servicio', 'servicio (FchServDesde/FchServHasta) solo se informa con concepto 2 o 3');
  if (concepto !== Concepto.PRODUCTOS && opts.servicio === undefined)
    fail('servicio', `servicio (desde, hasta, vtoPago) es requerido para concepto ${concepto}`);
  if (opts.servicio) {
    if (!opts.servicio.desde) fail('servicio.desde', 'servicio.desde es requerido');
    if (!opts.servicio.hasta) fail('servicio.hasta', 'servicio.hasta es requerido');
    const desde = checkFecha('servicio.desde', opts.servicio.desde);
    const hasta = checkFecha('servicio.hasta', opts.servicio.hasta);
    if (desde > hasta)
      fail(
        'servicio.hasta',
        'servicio.hasta no puede ser anterior a servicio.desde (validación 10032)',
        opts.servicio.hasta,
      );
  }
  checkVtoPago(opts, concepto);

  checkMoneda((n) => n, opts.moneda ?? Moneda.PESOS, opts.cotizacion, opts.canMisMonExt, {
    cotizacion: 'cotizacion',
    canMisMonExt: 'canMisMonExt',
  });

  // Receptor.
  const docTipo = opts.docTipo ?? DocTipo.CONSUMIDOR_FINAL;
  if (opts.docNro !== undefined && (!Number.isInteger(opts.docNro) || opts.docNro < 0))
    fail('docNro', 'docNro debe ser un entero >= 0', opts.docNro);
  if (docTipo === DocTipo.CUIT || docTipo === DocTipo.CUIL) checkCuit('docNro', opts.docNro);

  // CondicionIVAReceptorId es obligatorio según la RG 5616 (validación 10246). Solo se
  // completa por defecto para consumidor final sin identificar (docTipo 99): un CUIT
  // puede ser RI, monotributista o exento, así que no se infiere.
  if (docTipo !== DocTipo.CONSUMIDOR_FINAL && opts.condicionIva == null)
    fail(
      'condicionIva',
      `condicionIva es requerido cuando el receptor está identificado (docTipo ${docTipo}). ` +
        'Usar enum CondicionIva; se puede obtener del padrón con condicionIvaDesdePadron (@ramiidv/arca-padron).',
    );
  if (isTipoA(opts.cbteTipo)) {
    if (docTipo !== DocTipo.CUIT)
      fail(
        'docTipo',
        `un comprobante clase A o M requiere un receptor con CUIT (docTipo 80), no ${docTipo} (validación 10013)`,
        docTipo,
      );
    if (opts.condicionIva != null && !RECEPTORES_CLASE_A.has(opts.condicionIva))
      fail(
        'condicionIva',
        `la condición frente al IVA ${opts.condicionIva} no es válida para comprobantes clase A o M (validación 10243)`,
        opts.condicionIva,
      );
  }

  // FCE MiPyME: el receptor es un contribuyente registrado, identificado por CUIT (10176, 10177).
  if (isFCE(opts.cbteTipo) && docTipo !== DocTipo.CUIT)
    fail(
      'docTipo',
      `los comprobantes FCE MiPyME requieren un receptor con CUIT (docTipo 80), no ${docTipo} (validaciones 10176/10177)`,
      docTipo,
    );

  if (opts.tributos) {
    opts.tributos.forEach((t, i) => {
      const f = (n: string) => `tributos[${i}].${n}`;
      if (t.id == null || !Number.isInteger(t.id)) fail(f('id'), 'tributo.id es requerido y debe ser un entero', t.id);
      if (!isAmount(t.importe) || t.importe < 0)
        fail(f('importe'), 'tributo.importe debe ser un número >= 0', t.importe);
      if (!isAmount(t.baseImp) || t.baseImp < 0)
        fail(f('baseImp'), 'tributo.baseImp debe ser un número >= 0', t.baseImp);
      if (!isAmount(t.alic) || t.alic < 0) fail(f('alic'), 'tributo.alic debe ser un número >= 0', t.alic);
    });
  }

  if (opts.cbtesAsoc) {
    opts.cbtesAsoc.forEach((c, i) => {
      if (!c.tipo) fail(`cbtesAsoc[${i}].tipo`, 'cbtesAsoc.tipo es requerido');
      if (!c.ptoVta) fail(`cbtesAsoc[${i}].ptoVta`, 'cbtesAsoc.ptoVta es requerido');
      if (!c.nro) fail(`cbtesAsoc[${i}].nro`, 'cbtesAsoc.nro es requerido');
      if (c.fecha !== undefined) checkFecha(`cbtesAsoc[${i}].fecha`, c.fecha);
      if (c.cuit !== undefined) checkCuit(`cbtesAsoc[${i}].cuit`, c.cuit);
    });
  }

  // NC/ND: comprobantes asociados o período asociado (10197); en FCE, comprobantes asociados (10153).
  if (isNotaCreditoODebito(opts.cbteTipo)) {
    const tieneAsociados = (opts.cbtesAsoc?.length ?? 0) > 0;
    if (isFCE(opts.cbteTipo) && !tieneAsociados)
      fail('cbtesAsoc', 'las notas de crédito/débito FCE requieren cbtesAsoc (validación 10153)');
    if (!tieneAsociados && !opts.periodoAsoc)
      fail('cbtesAsoc', 'las notas de crédito/débito requieren cbtesAsoc o periodoAsoc (validación 10197)');
  }

  checkPercepcionNoCategorizado(opts, docTipo);
  checkCompradores(opts, docTipo);

  if (opts.periodoAsoc) {
    if (!isNotaCreditoODebito(opts.cbteTipo))
      fail('periodoAsoc', 'periodoAsoc solo se informa en notas de crédito o débito (validación 10198)');
    if (isFCE(opts.cbteTipo))
      fail('periodoAsoc', 'los comprobantes FCE MiPyME no admiten periodoAsoc (validación 10196)');
    const desde = checkFecha('periodoAsoc.desde', opts.periodoAsoc.desde);
    const hasta = checkFecha('periodoAsoc.hasta', opts.periodoAsoc.hasta);
    if (desde > hasta)
      fail('periodoAsoc.hasta', 'periodoAsoc.hasta debe ser igual o posterior a periodoAsoc.desde (validación 10207)');
  }

  opts.actividades?.forEach((a, i) => checkEntero(`actividades[${i}]`, a, 1));
}

/** `true` si el comprobante es de anulación (opcional 22 = "S", FCE). */
function esAnulacion(opts: FacturarOpts): boolean {
  return opts.opcionales?.some((o) => String(o.id) === '22' && o.valor === 'S') ?? false;
}

/**
 * `FchVtoPago` (vencimiento del pago), en `vtoPago` o `servicio.vtoPago`:
 * - 10049: obligatorio con concepto 2 o 3.
 * - 10163: obligatorio en las facturas FCE (201, 206, 211), con cualquier concepto.
 * - 10175: en NC/ND FCE solo si son de anulación (opcional 22 = "S"). Con
 *   concepto 2 o 3 choca con 10049 (el manual no resuelve el caso): ahí no se valida.
 * - 10031/10033: fuera de servicios y FCE, informarlo exige FchServDesde/Hasta.
 * - 10036: no puede ser anterior a la fecha del comprobante.
 */
function checkVtoPago(opts: FacturarOpts, concepto: number): void {
  const { vtoPago } = opts;
  const vtoServicio = opts.servicio?.vtoPago;
  const v = vtoPago !== undefined ? checkFecha('vtoPago', vtoPago) : undefined;
  const vs = vtoServicio !== undefined ? checkFecha('servicio.vtoPago', vtoServicio) : undefined;
  if (v !== undefined && vs !== undefined && v !== vs)
    fail('vtoPago', 'vtoPago y servicio.vtoPago son la misma fecha (FchVtoPago): informar solo una', vtoPago);
  const vto = v ?? vs;

  if (concepto !== Concepto.PRODUCTOS && vto === undefined)
    fail('servicio.vtoPago', `servicio.vtoPago (o vtoPago) es requerido para concepto ${concepto} (validación 10049)`);
  if (isFacturaFCE(opts.cbteTipo) && vto === undefined)
    fail(
      'vtoPago',
      'vtoPago es requerido en las facturas FCE MiPyME (201, 206, 211), también con concepto 1 (validación 10163)',
    );
  if (vto !== undefined && concepto === Concepto.PRODUCTOS && !isFacturaFCE(opts.cbteTipo)) {
    if (isFCE(opts.cbteTipo)) {
      if (!esAnulacion(opts))
        fail(
          'vtoPago',
          'en notas de crédito/débito FCE, vtoPago solo se informa si son de anulación (opcional 22 = "S", validación 10175)',
          vtoPago,
        );
    } else {
      fail(
        'vtoPago',
        'con concepto 1 (productos), vtoPago solo se informa en facturas FCE MiPyME (validaciones 10031 y 10033)',
        vtoPago,
      );
    }
  }
  if (vto !== undefined && opts.fecha !== undefined && vto < checkFecha('fecha', opts.fecha))
    fail(
      'vtoPago',
      'vtoPago no puede ser anterior a la fecha del comprobante (validación 10036)',
      vtoPago ?? vtoServicio,
    );
}

/** CUIT genérico del receptor "No Categorizado" (validaciones 10067 y 10283). */
const CUIT_NO_CATEGORIZADO = 23000000000;

/**
 * Validaciones 10067 y 10283: Factura/ND/NC B (6, 7, 8) a 23000000000 (No
 * Categorizado) con neto + IVA > 0 requiere el tributo 13 (Percepción de IVA
 * No Categorizado) con importe > 0.
 */
function checkPercepcionNoCategorizado(opts: FacturarOpts, docTipo: number): void {
  const esB = [CbteTipo.FACTURA_B, CbteTipo.NOTA_DEBITO_B, CbteTipo.NOTA_CREDITO_B].includes(opts.cbteTipo);
  if (!esB || docTipo !== DocTipo.CUIT || Number(opts.docNro) !== CUIT_NO_CATEGORIZADO) return;
  const gravado = opts.items.some((i) => i.iva !== undefined && !i.exento && (i.neto ?? i.total ?? 0) > 0);
  if (!gravado) return;
  const tiene13 = opts.tributos?.some((t) => t.id === TributoTipo.PERCEP_IVA_NO_CATEGORIZADO && t.importe > 0);
  if (!tiene13)
    fail(
      'tributos',
      'al receptor No Categorizado (23000000000) con importes gravados hay que informar el tributo 13 ' +
        '(Percepción de IVA No Categorizado) con importe > 0 (validaciones 10067 y 10283)',
    );
}

/** Tipos de documento admitidos en `Compradores` y en el receptor que los lleva (10136, 10137). */
const DOC_TIPOS_COMPRADOR = new Set<number>([DocTipo.CUIT, DocTipo.CUIL, DocTipo.CDI]);

/** `Compradores` (validaciones 10135-10147). */
function checkCompradores(opts: FacturarOpts, docTipo: number): void {
  const compradores = opts.compradores;
  if (compradores === undefined || compradores.length === 0) return;
  if (!DOC_TIPOS_COMPRADOR.has(docTipo))
    fail('compradores', 'compradores solo se informa con receptor docTipo 80, 86 u 87 (validación 10136)', docTipo);
  if (compradores.length < 2)
    fail('compradores', 'compradores tiene que tener al menos 2 (validación 10145)', compradores.length);
  const vistos = new Set<string>();
  let suma = 0;
  compradores.forEach((c, i) => {
    const f = (n: string) => `compradores[${i}].${n}`;
    if (!DOC_TIPOS_COMPRADOR.has(c.docTipo))
      fail(f('docTipo'), 'docTipo de un comprador debe ser 80, 86 u 87 (validación 10137)', c.docTipo);
    if (!Number.isSafeInteger(Number(c.docNro)) || Number(c.docNro) <= 0)
      fail(f('docNro'), 'docNro de un comprador es requerido (validación 10138)', c.docNro);
    if (!isAmount(c.porcentaje) || c.porcentaje <= 0 || c.porcentaje > 100)
      fail(f('porcentaje'), 'porcentaje debe ser mayor a 0 y hasta 100 (validaciones 10143/10144)', c.porcentaje);
    const clave = `${c.docTipo}-${Number(c.docNro)}`;
    if (vistos.has(clave)) fail(f('docNro'), 'los compradores no pueden repetirse (validación 10141)', c.docNro);
    vistos.add(clave);
    suma += Math.round(c.porcentaje * 100);
  });
  if (suma !== 10_000)
    fail('compradores', `los porcentajes de los compradores deben sumar 100 (suman ${suma / 100}, validación 10147)`);
  const mayor = compradores.reduce((a, b) => (b.porcentaje > a.porcentaje ? b : a));
  if (mayor.docTipo !== docTipo || Number(mayor.docNro) !== Number(opts.docNro))
    fail(
      'compradores',
      'el comprador de mayor porcentaje tiene que ser el receptor del comprobante (validación 10146)',
    );
}

/**
 * Valida la forma de los items y del descuento global. Que el descuento no
 * supere el total se valida al calcular los importes (al centavo).
 */
export function validateItems(items: LineItem[], descuentoGlobal?: number): void {
  items.forEach(validateLineItem);
  if (descuentoGlobal !== undefined && (!isAmount(descuentoGlobal) || descuentoGlobal < 0))
    fail('descuentoGlobal', 'descuentoGlobal debe ser un número >= 0', descuentoGlobal);
}

function validateLineItem(item: LineItem, index: number): void {
  const field = `items[${index}]`;
  const hasNeto = item.neto !== undefined;
  const hasTotal = item.total !== undefined;

  if (hasNeto && hasTotal) fail(field, `${field} no puede tener 'neto' y 'total' a la vez`);
  if (!hasNeto && !hasTotal) fail(`${field}.neto`, `${field}.neto o ${field}.total es requerido y debe ser un número`);

  const amount = hasTotal ? item.total : item.neto;
  const amountField = hasTotal ? 'total' : 'neto';
  if (!isAmount(amount))
    fail(`${field}.${amountField}`, `${field}.${amountField} es requerido y debe ser un número`, amount);
  if (amount < 0) fail(`${field}.${amountField}`, `${field}.${amountField} no puede ser negativo`, amount);
  if (item.exento && item.iva !== undefined) fail(field, `${field} no puede tener 'iva' y 'exento' a la vez`);

  if (item.iva !== undefined && IVA_RATES[item.iva as keyof typeof IVA_RATES] === undefined)
    fail(`${field}.iva`, `Tipo de IVA desconocido: ${item.iva}`, item.iva);
}

export function validateFacturarExpoOpts(opts: FacturarExpoOpts): void {
  if (!opts.ptoVta || !Number.isInteger(opts.ptoVta) || opts.ptoVta < 1)
    fail('ptoVta', 'ptoVta debe ser un entero >= 1', opts.ptoVta);
  if (!opts.cbteTipo) fail('cbteTipo', 'cbteTipo es requerido');
  if (!isTipoE(opts.cbteTipo))
    fail('cbteTipo', 'cbteTipo debe ser 19 (Factura E), 20 (Nota de Débito E) o 21 (Nota de Crédito E)', opts.cbteTipo);
  if (!opts.tipoExpo) fail('tipoExpo', 'tipoExpo es requerido (1=Bienes, 2=Servicios, 4=Otros)');
  if (![TipoExpo.BIENES, TipoExpo.SERVICIOS, TipoExpo.OTROS].includes(opts.tipoExpo))
    fail('tipoExpo', 'tipoExpo debe ser 1 (Bienes), 2 (Servicios) o 4 (Otros)', opts.tipoExpo);
  if (!opts.items || opts.items.length === 0) fail('items', 'items no puede estar vacío');
  if (!opts.cliente) fail('cliente', 'cliente es requerido');
  if (!opts.cliente.nombre) fail('cliente.nombre', 'cliente.nombre es requerido');
  if (!opts.cliente.domicilio) fail('cliente.domicilio', 'cliente.domicilio es requerido');
  if (!opts.cliente.cuitPais && !opts.cliente.idImpositivo)
    fail('cliente.cuitPais', 'cliente.cuitPais o cliente.idImpositivo es requerido (validación 1580)');
  if (opts.cliente.cuitPais !== undefined) checkEntero('cliente.cuitPais', opts.cliente.cuitPais, 1);
  if (!opts.moneda) fail('moneda', 'moneda es requerido para exportación');
  if (!isAmount(opts.cotizacion) || opts.cotizacion <= 0)
    fail('cotizacion', 'cotizacion es requerido para exportación y debe ser mayor a 0', opts.cotizacion);
  if (opts.canMisMonExt !== undefined && opts.canMisMonExt !== 'S' && opts.canMisMonExt !== 'N')
    fail('canMisMonExt', 'canMisMonExt debe ser "S" o "N"', opts.canMisMonExt);
  if (opts.cbteTipo === CbteTipo.FACTURA_E && !opts.formaPago)
    fail('formaPago', 'formaPago es requerido en Factura E (19) (validación 1620)');
  if (!opts.pais) fail('pais', 'pais (código de país destino) es requerido');
  if (opts.id !== undefined) checkEntero('id', opts.id, 1);
  if (opts.cbteNro !== undefined) checkEntero('cbteNro', opts.cbteNro, 1);

  const fecha = opts.fecha !== undefined ? checkFecha('fecha', opts.fecha) : undefined;

  // Permisos de embarque (manual WSFEX, tabla de validación 1720):
  // solo Factura E (19) de bienes lleva Permiso_existente S/N; con "S" los permisos son
  // obligatorios y con "N" no se envían. NC/ND de bienes pueden llevar permisos con
  // Permiso_existente vacío. Servicios y otros no llevan ni una cosa ni la otra.
  const esFacturaBienes = opts.cbteTipo === CbteTipo.FACTURA_E && opts.tipoExpo === TipoExpo.BIENES;
  const tienePermisos = (opts.permisos?.length ?? 0) > 0;
  if (opts.permisoExistente !== undefined) {
    if (!esFacturaBienes)
      fail(
        'permisoExistente',
        'permisoExistente solo se informa en Factura E (19) de bienes (tipoExpo 1); en los demás casos va vacío (validación 1720)',
        opts.permisoExistente,
      );
    if (opts.permisoExistente !== 'S' && opts.permisoExistente !== 'N')
      fail('permisoExistente', 'permisoExistente debe ser "S" o "N"', opts.permisoExistente);
  }
  if (esFacturaBienes) {
    if (opts.permisoExistente === 'S' && !tienePermisos)
      fail('permisos', 'con permisoExistente "S" los permisos son obligatorios (validación 1720)');
    if (opts.permisoExistente !== 'S' && tienePermisos)
      fail('permisos', 'los permisos solo se informan con permisoExistente "S" (validación 1720)');
  } else if (opts.tipoExpo !== TipoExpo.BIENES && tienePermisos) {
    fail('permisos', 'los comprobantes de servicios u otros no llevan permisos de embarque (validación 1720)');
  }

  // Fecha de pago (validaciones 1671-1674).
  if (opts.fechaPago !== undefined) {
    if (opts.cbteTipo !== CbteTipo.FACTURA_E)
      fail(
        'fechaPago',
        'fechaPago solo se informa en Factura E (19), no en notas de crédito/débito (validación 1673)',
        opts.fechaPago,
      );
    const pago = checkFecha('fechaPago', opts.fechaPago);
    if (opts.tipoExpo !== TipoExpo.BIENES && fecha !== undefined && pago < fecha)
      fail(
        'fechaPago',
        'fechaPago debe ser igual o posterior a la fecha del comprobante (validación 1674)',
        opts.fechaPago,
      );
  }

  opts.permisos?.forEach((p, i) => {
    if (!p.idPermiso) fail(`permisos[${i}].idPermiso`, 'idPermiso es requerido');
    checkEntero(`permisos[${i}].dstMerc`, p.dstMerc, 0);
  });
  opts.actividades?.forEach((a, i) => checkEntero(`actividades[${i}]`, a, 1));

  for (let i = 0; i < opts.items.length; i++) {
    validateExpoLineItem(opts.items[i], i);
  }
}

function validateExpoLineItem(item: ExpoLineItem, index: number): void {
  const f = (n: string) => `items[${index}].${n}`;
  if (!item.descripcion) fail(f('descripcion'), `${f('descripcion')} es requerido`);
  if (isUmedSinCantidad(item.unidad)) {
    // Unidades 0, 97 y 99: cantidad, precio y bonificación en 0, con el total explícito (1775, 1810).
    for (const k of ['cantidad', 'precioUnitario', 'bonificacion'] as const) {
      if (item[k] !== undefined && item[k] !== 0)
        fail(f(k), `con la unidad ${item.unidad}, ${f(k)} debe ser 0 (validación 1775)`, item[k]);
    }
    if (!isAmount(item.total))
      fail(f('total'), `con la unidad ${item.unidad}, ${f('total')} es requerido (validación 1810)`, item.total);
    if (item.unidad === 0 && item.total < 0)
      fail(f('total'), `con la unidad 0, ${f('total')} debe ser >= 0 (validación 1810)`, item.total);
    if (item.unidad === 99 && item.total >= 0)
      fail(
        f('total'),
        `con la unidad 99 (bonificación), ${f('total')} debe ser menor a 0 (validación 1810)`,
        item.total,
      );
    return;
  }
  if (item.total !== undefined)
    fail(
      f('total'),
      `${f('total')} solo se informa con las unidades 0, 97 y 99; el resto lo calcula el SDK`,
      item.total,
    );
  if (!isAmount(item.cantidad) || item.cantidad <= 0)
    fail(f('cantidad'), `${f('cantidad')} debe ser > 0`, item.cantidad);
  if (!isAmount(item.precioUnitario) || item.precioUnitario < 0)
    fail(f('precioUnitario'), `${f('precioUnitario')} debe ser >= 0`, item.precioUnitario);
  if (item.bonificacion !== undefined && (!isAmount(item.bonificacion) || item.bonificacion < 0))
    fail(f('bonificacion'), `${f('bonificacion')} debe ser >= 0`, item.bonificacion);
}

const FECHA_HORA_RE = /^\d{14}$/;

/**
 * Coincidencia con el margen de error del manual de WSFEv1: error relativo
 * <= 0,01% o error absoluto <= 0,01 (por cada elemento sumado, en los arrays).
 */
function coincide(informado: number, calculado: number, elementos = 1): boolean {
  const abs = Math.abs(informado - calculado);
  return abs <= 0.01 * Math.max(1, elementos) + 1e-9 || (calculado !== 0 && abs / Math.abs(calculado) <= 0.0001);
}

/** Totales del detalle: 10048 (ImpTotal), 10023 (ImpIVA vs Iva) y 10029 (ImpTrib vs Tributos). */
function checkSumas(inv: InvoiceRequest['invoices'][number], cbteTipo: number, f: (name: string) => string): void {
  const suma = inv.impTotConc + inv.impNeto + inv.impOpEx + inv.impTrib + inv.impIva;
  if (!coincide(inv.impTotal, suma))
    fail(
      f('impTotal'),
      `impTotal (${inv.impTotal}) debe ser igual a impTotConc + impNeto + impOpEx + impTrib + impIva (${redondear(suma)}) (validación 10048)`,
      inv.impTotal,
    );
  const iva = inv.iva ?? [];
  if (!isTipoC(cbteTipo) && (iva.length > 0 || inv.impIva !== 0)) {
    const sumaIva = iva.reduce((a, i) => a + i.importe, 0);
    if (!coincide(inv.impIva, sumaIva, iva.length))
      fail(
        f('impIva'),
        `impIva (${inv.impIva}) debe ser igual a la suma de iva[].importe (${redondear(sumaIva)}) (validación 10023)`,
        inv.impIva,
      );
  }
  const tributos = inv.tributos ?? [];
  if (tributos.length > 0 || inv.impTrib !== 0) {
    const sumaTrib = tributos.reduce((a, t) => a + t.importe, 0);
    if (!coincide(inv.impTrib, sumaTrib, tributos.length))
      fail(
        f('impTrib'),
        `impTrib (${inv.impTrib}) debe ser igual a la suma de tributos[].importe (${redondear(sumaTrib)}) (validación 10029)`,
        inv.impTrib,
      );
  }
}

const redondear = (n: number) => Math.round(n * 100) / 100;

export function validateInvoiceRequest(req: InvoiceRequest): void {
  if (!req.ptoVta || req.ptoVta < 1) fail('ptoVta', 'ptoVta debe ser >= 1');
  if (!req.cbteTipo) fail('cbteTipo', 'cbteTipo es requerido');
  if (isTipoE(req.cbteTipo))
    fail('cbteTipo', 'los comprobantes clase E se emiten por WSFEX (crearFacturaExportacion)', req.cbteTipo);
  if (!req.invoices || req.invoices.length === 0) fail('invoices', 'invoices no puede estar vacío');

  req.invoices.forEach((inv, i) => {
    const f = (name: string) => `invoices[${i}].${name}`;
    for (const k of ['impTotal', 'impTotConc', 'impNeto', 'impOpEx', 'impTrib', 'impIva'] as const) {
      if (inv[k] == null) fail(f(k), `${k} es requerido`);
      if (!isAmount(inv[k])) fail(f(k), `${k} debe ser un número finito`, inv[k]);
    }
    if (inv.cbteDesde == null) fail(f('cbteDesde'), 'cbteDesde es requerido');
    if (inv.cbteHasta == null) fail(f('cbteHasta'), 'cbteHasta es requerido');
    if (!inv.cbteFch) fail(f('cbteFch'), 'cbteFch es requerido');
    if (!/^\d{8}$/.test(inv.cbteFch)) fail(f('cbteFch'), 'cbteFch debe tener formato YYYYMMDD', inv.cbteFch);
    checkFecha(f('cbteFch'), inv.cbteFch);
    for (const k of ['fchServDesde', 'fchServHasta', 'fchVtoPago'] as const) {
      const v = inv[k];
      if (v !== undefined && v !== '') {
        if (!/^\d{8}$/.test(v)) fail(f(k), `${k} debe tener formato YYYYMMDD`, v);
        checkFecha(f(k), v);
      }
    }
    if (!inv.monId) fail(f('monId'), 'monId es requerido');
    if (inv.monCotiz == null && inv.canMisMonExt !== 'S')
      fail(f('monCotiz'), 'monCotiz es requerido (salvo moneda extranjera con canMisMonExt "S")');
    checkMoneda(f, inv.monId, inv.monCotiz ?? undefined, inv.canMisMonExt, {
      cotizacion: 'monCotiz',
      canMisMonExt: 'canMisMonExt',
    });
    if (inv.condicionIvaReceptorId == null)
      fail(
        f('condicionIvaReceptorId'),
        'condicionIvaReceptorId es requerido, también para consumidor final (RG 5616, validación 10246)',
      );
    checkSumas(inv, req.cbteTipo, f);
    if (inv.cbteFchHsGen !== undefined && !FECHA_HORA_RE.test(inv.cbteFchHsGen))
      fail(f('cbteFchHsGen'), 'cbteFchHsGen debe tener formato yyyymmddhhmmss (validación 1441)', inv.cbteFchHsGen);
  });
}
