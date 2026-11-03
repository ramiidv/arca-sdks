import { ArcaValidationError, CondicionIva, formatDate, roundHalfEven, validateCuit } from '@ramiidv/arca-common';
import {
  CBTES_ASOCIABLES,
  CbteTipo,
  Concepto,
  DocTipo,
  IVA_RATES,
  Moneda,
  TipoExpo,
  isFacturaFCE,
  isFCE,
  isNotaCredito,
  isNotaCreditoODebito,
  isNotaDebito,
  isRemito,
  isTipoA,
  isTipoB,
  isTipoC,
  isTipoE,
  isUmedSinCantidad,
  receptoresAdmitidos,
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

/** Importe a 2 decimales para los mensajes (mismo criterio que `redondear2`). */
const redondear = (n: number) => roundHalfEven(n, 2);

/** Códigos de validación de moneda y cotización de cada servicio (ver `checkMoneda`). */
const VALIDACIONES_MONEDA = {
  wsfe: {
    formato: 'MonCotiz Double 4+6',
    cotizacionPes: 10039,
    cotizacionRequerida: 10038,
    valores: 10239,
    soloExtranjera: 10241,
  },
  wsfex: {
    formato: 'validación 1600',
    cotizacionPes: 1601,
    cotizacionRequerida: 1602,
    valores: 1603,
    soloExtranjera: 1605,
  },
} as const;

/** La cotización tiene hasta 4 enteros (WSFEv1 `MonCotiz` Double 4+6; WSFEX validación 1600). */
const MAX_COTIZACION = 10_000;

/**
 * Valida moneda, cotización y CanMisMonExt (mismas reglas en WSFEv1 y WSFEX):
 * - la cotización es mayor a 0 y tiene hasta 4 enteros;
 * - con PES, la cotización debe ser 1 (10039 / 1601);
 * - con moneda extranjera la cotización es obligatoria (> 0) salvo
 *   CanMisMonExt = "S", en cuyo caso ARCA usa la cotización oficial (10038 / 1602);
 * - CanMisMonExt es "S" o "N" (10239 / 1603), y con PES no puede ser "S"
 *   (10241 / 1605; en WSFEX, con PES no se informa: ver `validateFacturarExpoOpts`).
 */
function checkMoneda(
  f: (name: string) => string,
  moneda: string,
  cotizacion: number | undefined,
  canMisMonExt: string | undefined,
  names: { cotizacion: string; canMisMonExt: string },
  servicio: keyof typeof VALIDACIONES_MONEDA = 'wsfe',
): void {
  const v = VALIDACIONES_MONEDA[servicio];
  if (cotizacion !== undefined && (!isAmount(cotizacion) || cotizacion <= 0))
    fail(f(names.cotizacion), `${names.cotizacion} debe ser un número mayor a 0`, cotizacion);
  if (cotizacion !== undefined && cotizacion >= MAX_COTIZACION)
    fail(f(names.cotizacion), `${names.cotizacion} tiene hasta 4 enteros (${v.formato})`, cotizacion);
  if (canMisMonExt !== undefined && canMisMonExt !== 'S' && canMisMonExt !== 'N')
    fail(f(names.canMisMonExt), `${names.canMisMonExt} debe ser "S" o "N" (validación ${v.valores})`, canMisMonExt);
  if (moneda === Moneda.PESOS) {
    if (cotizacion !== undefined && cotizacion !== 1)
      fail(
        f(names.cotizacion),
        `con moneda PES ${names.cotizacion} debe ser 1 (validación ${v.cotizacionPes})`,
        cotizacion,
      );
    if (canMisMonExt === 'S')
      fail(
        f(names.canMisMonExt),
        `${names.canMisMonExt} "S" solo aplica a moneda extranjera (validación ${v.soloExtranjera})`,
        canMisMonExt,
      );
  } else if (cotizacion === undefined && canMisMonExt !== 'S') {
    fail(
      f(names.cotizacion),
      `${names.cotizacion} es requerido para moneda extranjera (salvo ${names.canMisMonExt} "S", validación ${v.cotizacionRequerida})`,
    );
  }
}

/** Contexto opcional de `validateFacturarOpts`: datos del emisor y la hora de ARCA. */
export interface ContextoValidacion {
  /** CUIT del emisor: el receptor y los compradores no pueden ser el emisor (10069, 10140). */
  cuitEmisor?: number;
  /** Hora actual (reloj de ARCA) para las reglas que comparan con la fecha de presentación. Default: ahora. */
  ahora?: Date;
}

export function validateFacturarOpts(opts: FacturarOpts, ctx: ContextoValidacion = {}): void {
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
  checkVtoPago(opts, concepto, ctx);
  if (opts.cbteTipo === CbteTipo.COMPRA_BIENES_USADOS && concepto !== Concepto.PRODUCTOS)
    fail('concepto', 'el tipo 49 (Compra de Bienes Usados) solo admite concepto 1 (validación 10085)', concepto);

  checkMoneda((n) => n, opts.moneda ?? Moneda.PESOS, opts.cotizacion, opts.canMisMonExt, {
    cotizacion: 'cotizacion',
    canMisMonExt: 'canMisMonExt',
  });

  // Receptor.
  const docTipo = opts.docTipo ?? DocTipo.CONSUMIDOR_FINAL;
  if (opts.docNro !== undefined && (!Number.isInteger(opts.docNro) || opts.docNro < 0))
    fail('docNro', 'docNro debe ser un entero >= 0', opts.docNro);
  // DocNro (10015): 0 con docTipo 99; informado con cualquier otro (el SDK manda 0 si falta).
  if (docTipo === DocTipo.CONSUMIDOR_FINAL) {
    if (opts.docNro !== undefined && opts.docNro !== 0)
      fail(
        'docNro',
        'con docTipo 99 (consumidor final sin identificar) docNro debe ser 0 (validación 10015)',
        opts.docNro,
      );
    if (opts.cbteTipo === CbteTipo.COMPRA_BIENES_USADOS)
      fail(
        'docTipo',
        'el tipo 49 (Compra de Bienes Usados) requiere un vendedor identificado, no docTipo 99 (validación 10015)',
      );
  } else if (docTipo !== DocTipo.FONDO_COMUN_INVERSION_CNV && !opts.docNro) {
    fail('docNro', `docNro es requerido cuando el receptor está identificado (docTipo ${docTipo}) (validación 10015)`);
  }
  if (docTipo === DocTipo.CUIT || docTipo === DocTipo.CUIL) checkCuit('docNro', opts.docNro);
  if (docTipo === DocTipo.FONDO_COMUN_INVERSION_CNV) {
    if (opts.docNro === undefined || opts.docNro < 1 || opts.docNro > 9999)
      fail('docNro', 'con docTipo 31 (FCI CNV) docNro es un número de 1 a 4 dígitos (validación 10271)', opts.docNro);
    if (opts.condicionIva !== CondicionIva.IVA_NO_ALCANZADO)
      fail(
        'condicionIva',
        'con docTipo 31 (FCI CNV) condicionIva debe ser 15 (IVA No Alcanzado) (validación 10272)',
        opts.condicionIva,
      );
  }
  if (esEmisor(opts.docNro, ctx))
    fail('docNro', 'el receptor no puede ser el emisor del comprobante (validación 10069)', opts.docNro);

  // CondicionIVAReceptorId es obligatorio según la RG 5616 (validación 10246). Solo se
  // completa por defecto para consumidor final sin identificar (docTipo 99): un CUIT
  // puede ser RI, monotributista o exento, así que no se infiere.
  if (docTipo !== DocTipo.CONSUMIDOR_FINAL && opts.condicionIva == null)
    fail(
      'condicionIva',
      `condicionIva es requerido cuando el receptor está identificado (docTipo ${docTipo}). ` +
        'Usar enum CondicionIva; se puede obtener del padrón con condicionIvaDesdePadron (@ramiidv/arca-padron).',
    );
  if (isTipoA(opts.cbteTipo) && docTipo !== DocTipo.CUIT)
    fail(
      'docTipo',
      `un comprobante clase A o M requiere un receptor con CUIT (docTipo 80), no ${docTipo} (validación 10013)`,
      docTipo,
    );
  const admitidos = receptoresAdmitidos(opts.cbteTipo);
  if (opts.condicionIva != null && admitidos && !admitidos.has(opts.condicionIva))
    fail(
      'condicionIva',
      `la condición frente al IVA ${opts.condicionIva} no es válida para el tipo de comprobante ${opts.cbteTipo} ` +
        `(admite ${[...admitidos].join(', ')}; validación 10243)`,
      opts.condicionIva,
    );

  // FCE MiPyME: el receptor es un contribuyente registrado, identificado por CUIT (10176, 10177).
  if (isFCE(opts.cbteTipo)) {
    if (docTipo !== DocTipo.CUIT)
      fail(
        'docTipo',
        `los comprobantes FCE MiPyME requieren un receptor con CUIT (docTipo 80), no ${docTipo} (validaciones 10176/10177)`,
        docTipo,
      );
    if (Number(opts.docNro) === CUIT_NO_CATEGORIZADO)
      fail(
        'docNro',
        'los comprobantes FCE MiPyME no admiten el receptor No Categorizado 23000000000 (validación 10178)',
      );
  }

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

  checkCbtesAsoc(opts);

  checkOpcionales(opts);
  checkOpcionalesFCE(opts);
  checkPercepcionNoCategorizado(opts, docTipo);
  checkCompradores(opts, docTipo, concepto, ctx);

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

/** Ids de los opcionales propios de FCE MiPyME (`getTiposOpcional`). */
const OPCIONAL_FCE = { CBU: '2101', ALIAS: '2102', ANULACION: '22', TRANSFERENCIA: '27' } as const;

/** `true` si el comprobante es de anulación (opcional 22 = "S", FCE). */
function esAnulacion(opts: FacturarOpts): boolean {
  return opts.opcionales?.some((o) => String(o.id) === OPCIONAL_FCE.ANULACION && o.valor === 'S') ?? false;
}

/**
 * Opcionales de los comprobantes FCE MiPyME:
 * - 10169: los comprobantes que no son FCE no llevan 2101, 2102, 22 ni 27.
 * - 10165: el 2101 (CBU) son 22 dígitos; 10166: el 2102 (alias) son de 6 a
 *   20 caracteres (letras, números, punto o guion).
 * - Facturas (201, 206, 211): llevan el 2101 (10168) y el 27 (10216), con
 *   "SCA" (transferencia al sistema de circulación abierta) o "ADC" (agente de
 *   depósito colectivo) (10214/10215), y no llevan el 22 (10171).
 * - NC/ND: llevan el 22 (10173), con "S" o "N" (10167), y no llevan 2101,
 *   2102 ni 27 (10172).
 */
function checkOpcionalesFCE(opts: FacturarOpts): void {
  const opcionales = opts.opcionales ?? [];
  const indice = (id: string) => opcionales.findIndex((o) => String(o.id) === id);
  const prohibir = (ids: readonly string[], msg: (id: string) => string) => {
    const i = opcionales.findIndex((o) => ids.includes(String(o.id)));
    if (i >= 0) fail(`opcionales[${i}].id`, msg(String(opcionales[i].id)), opcionales[i].id);
  };
  /** Exige el opcional y, si se pasan `valores`, que su valor sea uno de ellos. */
  const exigir = (id: string, faltante: string, valores?: { permitidos: readonly string[]; msg: string }) => {
    const i = indice(id);
    if (i < 0) fail('opcionales', faltante);
    if (valores && !valores.permitidos.includes(String(opcionales[i].valor)))
      fail(`opcionales[${i}].valor`, valores.msg, opcionales[i].valor);
  };
  const formato = (id: string, re: RegExp, msg: string) => {
    const i = indice(id);
    if (i >= 0 && !re.test(String(opcionales[i].valor))) fail(`opcionales[${i}].valor`, msg, opcionales[i].valor);
  };
  const { CBU, ALIAS, ANULACION, TRANSFERENCIA } = OPCIONAL_FCE;

  if (!isFCE(opts.cbteTipo)) {
    prohibir(
      Object.values(OPCIONAL_FCE),
      (id) =>
        `el opcional ${id} es solo para FCE MiPyME (201 a 213); no se informa en otros comprobantes (validación 10169)`,
    );
    return;
  }

  formato(CBU, /^\d{22}$/, 'el opcional 2101 (CBU) debe tener 22 dígitos (validación 10165)');
  formato(
    ALIAS,
    /^[A-Za-z0-9.-]{6,20}$/,
    'el opcional 2102 (alias) debe tener de 6 a 20 caracteres: letras, números, punto o guion (validación 10166)',
  );

  if (isNotaCreditoODebito(opts.cbteTipo)) {
    prohibir(
      [CBU, ALIAS, TRANSFERENCIA],
      () =>
        'las notas de crédito/débito FCE MiPyME no llevan CBU (2101), alias (2102) ni transferencia (27) (validación 10172)',
    );
    exigir(
      ANULACION,
      'las notas de crédito/débito FCE MiPyME requieren el opcional 22 (anulación "S" o "N", validación 10173)',
      { permitidos: ['S', 'N'], msg: 'el opcional 22 de FCE MiPyME debe ser "S" o "N" (validación 10167)' },
    );
    return;
  }

  // Facturas FCE (201, 206, 211)
  prohibir([ANULACION], () => 'las facturas FCE MiPyME no llevan el opcional 22 (anulación) (validación 10171)');
  exigir(
    CBU,
    'las facturas FCE MiPyME (201, 206, 211) requieren el opcional 2101 con el CBU del emisor (validación 10168)',
  );
  exigir(
    TRANSFERENCIA,
    'las facturas FCE MiPyME (201, 206, 211) requieren el opcional 27 con "SCA" o "ADC" (validación 10216)',
    {
      permitidos: ['SCA', 'ADC'],
      msg: 'el opcional 27 de FCE MiPyME debe ser "SCA" o "ADC" (validaciones 10214/10215)',
    },
  );
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
function checkVtoPago(opts: FacturarOpts, concepto: number, ctx: ContextoValidacion): void {
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
  if (vto !== undefined && isFCE(opts.cbteTipo) && vto < formatDate(ctx.ahora ?? new Date()))
    fail(
      'vtoPago',
      'en FCE MiPyME vtoPago no puede ser anterior a la fecha de presentación (hoy) (validación 10164)',
      vtoPago ?? vtoServicio,
    );
}

/** CUIT genérico del receptor "No Categorizado" (validaciones 10067, 10178 y 10283). */
const CUIT_NO_CATEGORIZADO = 23000000000;

/**
 * Validación 10067: Factura/ND/NC B (6, 7, 8) a 23000000000 (No Categorizado)
 * con neto + IVA > 0 y sin tributos (ImpTrib = 0) requiere el tributo 13
 * (Percepción de IVA No Categorizado) con importe > 0. Con otros tributos
 * (ImpTrib > 0), la falta del 13 es la validación 10283, que solo observa: el
 * comprobante se autoriza con observación.
 */
function checkPercepcionNoCategorizado(opts: FacturarOpts, docTipo: number): void {
  if (
    !FACTURAS_Y_NOTAS_B.includes(opts.cbteTipo) ||
    docTipo !== DocTipo.CUIT ||
    Number(opts.docNro) !== CUIT_NO_CATEGORIZADO
  )
    return;
  const gravado = opts.items.some((i) => i.iva !== undefined && !i.exento && (i.neto ?? i.total ?? 0) > 0);
  // ImpTrib es la suma de los tributos redondeados a 2 decimales.
  const conTributos = opts.tributos?.some((t) => redondear(t.importe) > 0) ?? false;
  if (gravado && !conTributos)
    fail(
      'tributos',
      'al receptor No Categorizado (23000000000) con importes gravados hay que informar el tributo 13 ' +
        '(Percepción de IVA No Categorizado) con importe > 0 (validación 10067)',
    );
}

/**
 * Comprobantes asociados:
 * - Cada uno con `tipo`, `ptoVta` y `nro`; `fecha` y `cuit` válidos si vienen.
 * - 10197: las NC/ND llevan asociados o `periodoAsoc`; 10153: en FCE, asociados.
 * - 10040: solo los tipos de `CBTES_ASOCIABLES` llevan asociados, y de los
 *   tipos que indica la tabla.
 * - 10151 y 10158: en NC/ND FCE, cada asociado lleva `cuit` y `fecha`.
 * - 10156/10157: una NC/ND FCE que no es de anulación asocia una sola factura
 *   FCE y, además, remitos (88, 91, 988, 990, 991, 993-997).
 * - 10183: en NC/ND FCE de anulación, una ND asocia una NC, y una NC asocia
 *   una factura o una ND (sin remitos).
 */
function checkCbtesAsoc(opts: FacturarOpts): void {
  const asociados = opts.cbtesAsoc ?? [];
  asociados.forEach((c, i) => {
    const f = (n: string) => `cbtesAsoc[${i}].${n}`;
    if (!c.tipo) fail(f('tipo'), 'cbtesAsoc.tipo es requerido');
    if (!c.ptoVta) fail(f('ptoVta'), 'cbtesAsoc.ptoVta es requerido');
    if (!c.nro) fail(f('nro'), 'cbtesAsoc.nro es requerido');
    if (c.fecha !== undefined) checkFecha(f('fecha'), c.fecha);
    if (c.cuit !== undefined) checkCuit(f('cuit'), c.cuit);
  });

  const nota = isNotaCreditoODebito(opts.cbteTipo);
  const notaFCE = nota && isFCE(opts.cbteTipo);
  if (notaFCE && asociados.length === 0)
    fail('cbtesAsoc', 'las notas de crédito/débito FCE requieren cbtesAsoc (validación 10153)');
  if (nota && asociados.length === 0 && !opts.periodoAsoc)
    fail('cbtesAsoc', 'las notas de crédito/débito requieren cbtesAsoc o periodoAsoc (validación 10197)');
  if (asociados.length === 0) return;

  const permitidos = CBTES_ASOCIABLES[opts.cbteTipo];
  if (!permitidos)
    fail('cbtesAsoc', `el tipo de comprobante ${opts.cbteTipo} no admite comprobantes asociados (validación 10040)`);
  const anulacion = notaFCE && esAnulacion(opts);
  asociados.forEach((c, i) => {
    const f = (n: string) => `cbtesAsoc[${i}].${n}`;
    if (!permitidos.includes(c.tipo))
      fail(
        f('tipo'),
        `al tipo ${opts.cbteTipo} solo se le asocian los tipos ${permitidos.join(', ')} (validación 10040)`,
        c.tipo,
      );
    if (notaFCE && c.cuit === undefined)
      fail(f('cuit'), 'en notas de crédito/débito FCE el comprobante asociado lleva cuit (validación 10151)');
    if (notaFCE && c.fecha === undefined)
      fail(f('fecha'), 'en notas de crédito/débito FCE el comprobante asociado lleva fecha (validación 10158)');
    if (notaFCE && !anulacion && !isFacturaFCE(c.tipo) && !isRemito(c.tipo))
      fail(
        f('tipo'),
        'una nota de crédito/débito FCE que no es de anulación (opcional 22 = "N") asocia la factura FCE ' +
          'y remitos (validaciones 10156/10157)',
        c.tipo,
      );
    if (
      anulacion &&
      (isRemito(c.tipo) || (isNotaDebito(opts.cbteTipo) ? !isNotaCredito(c.tipo) : isNotaCredito(c.tipo)))
    )
      fail(
        f('tipo'),
        'en una anulación FCE, una nota de débito asocia una nota de crédito, y una nota de crédito asocia una ' +
          'factura o una nota de débito (validación 10183)',
        c.tipo,
      );
  });
  if (notaFCE && !anulacion && asociados.filter((c) => isFacturaFCE(c.tipo)).length !== 1)
    fail(
      'cbtesAsoc',
      'una nota de crédito/débito FCE que no es de anulación asocia una sola factura FCE (validación 10156)',
    );
}

/** Factura, ND y NC B (6, 7, 8). */
const FACTURAS_Y_NOTAS_B: readonly number[] = [CbteTipo.FACTURA_B, CbteTipo.NOTA_DEBITO_B, CbteTipo.NOTA_CREDITO_B];
/** Factura, ND y NC A y B (1, 2, 3, 6, 7, 8). */
const FACTURAS_Y_NOTAS_A_B: readonly number[] = [
  CbteTipo.FACTURA_A,
  CbteTipo.NOTA_DEBITO_A,
  CbteTipo.NOTA_CREDITO_A,
  ...FACTURAS_Y_NOTAS_B,
];

/**
 * Tipos de comprobante que admiten `Opcionales` (validación 10068): 1-4, 6-9,
 * 11-13, 15, 49, 51-54, 63, 64 y todos los FCE (201-203, 206-208, 211-213).
 */
const TIPOS_CON_OPCIONALES = new Set<number>([
  ...FACTURAS_Y_NOTAS_A_B,
  CbteTipo.RECIBO_A,
  CbteTipo.RECIBO_B,
  CbteTipo.FACTURA_C,
  CbteTipo.NOTA_DEBITO_C,
  CbteTipo.NOTA_CREDITO_C,
  CbteTipo.RECIBO_C,
  CbteTipo.COMPRA_BIENES_USADOS,
  CbteTipo.FACTURA_M,
  CbteTipo.NOTA_DEBITO_M,
  CbteTipo.NOTA_CREDITO_M,
  CbteTipo.RECIBO_M,
  CbteTipo.LIQUIDACION_A,
  CbteTipo.LIQUIDACION_B,
  CbteTipo.FCE_FACTURA_A,
  CbteTipo.FCE_NOTA_DEBITO_A,
  CbteTipo.FCE_NOTA_CREDITO_A,
  CbteTipo.FCE_FACTURA_B,
  CbteTipo.FCE_NOTA_DEBITO_B,
  CbteTipo.FCE_NOTA_CREDITO_B,
  CbteTipo.FCE_FACTURA_C,
  CbteTipo.FCE_NOTA_DEBITO_C,
  CbteTipo.FCE_NOTA_CREDITO_C,
]);

/** Opcionales de Bienes Usados (tipo 49) y de Seguros de Caución. */
const OPCIONAL = {
  NOMBRE_VENDEDOR: '91',
  DOMICILIO_VENDEDOR: '93',
  POLIZA: '2901',
  ENDOSO: '2902',
} as const;

/** Tipos que admiten los opcionales de Seguros de Caución (2901/2902): A y B 1, 2, 3, 6, 7, 8. */
const TIPOS_SEGURO_CAUCION: readonly number[] = FACTURAS_Y_NOTAS_A_B;

/** Máximo de opcionales con póliza/endoso de Seguros de Caución (validación 10280). */
const MAX_OPCIONALES_CAUCION = 6000;

/**
 * Opcionales en general:
 * - 10068: solo los tipos de `TIPOS_CON_OPCIONALES` los admiten.
 * - Tipo 49 (Bienes Usados): obligatorios, con el nombre (91) y el domicilio
 *   (93) del vendedor (10076, 10078, 10084).
 * - Seguros de Caución: póliza (2901) y endoso (2902) solo en A y B 1, 2, 3,
 *   6, 7 y 8 (10273, 10275), de 1 a 30 caracteres (10274, 10276), en igual
 *   cantidad (10281) y con hasta 6000 opcionales (10280).
 */
function checkOpcionales(opts: FacturarOpts): void {
  const opcionales = opts.opcionales ?? [];
  const ids = opcionales.map((o) => String(o.id));
  if (opcionales.length > 0 && !TIPOS_CON_OPCIONALES.has(opts.cbteTipo))
    fail('opcionales', `el tipo de comprobante ${opts.cbteTipo} no admite opcionales (validación 10068)`);

  if (opts.cbteTipo === CbteTipo.COMPRA_BIENES_USADOS) {
    if (!ids.includes(OPCIONAL.NOMBRE_VENDEDOR))
      fail('opcionales', 'el tipo 49 (Bienes Usados) requiere el opcional 91 (nombre y apellido) (validación 10078)');
    if (!ids.includes(OPCIONAL.DOMICILIO_VENDEDOR))
      fail('opcionales', 'el tipo 49 (Bienes Usados) requiere el opcional 93 (domicilio) (validación 10084)');
  }

  const polizas = ids.filter((id) => id === OPCIONAL.POLIZA).length;
  const endosos = ids.filter((id) => id === OPCIONAL.ENDOSO).length;
  if (polizas + endosos === 0) return;
  if (!TIPOS_SEGURO_CAUCION.includes(opts.cbteTipo))
    fail(
      'opcionales',
      'los opcionales 2901 (póliza) y 2902 (endoso) son solo para comprobantes 1, 2, 3, 6, 7 y 8 (validaciones 10273/10275)',
    );
  opcionales.forEach((o, i) => {
    const id = String(o.id);
    if ((id === OPCIONAL.POLIZA || id === OPCIONAL.ENDOSO) && !/^\S.{0,29}$/s.test(String(o.valor ?? '')))
      fail(
        `opcionales[${i}].valor`,
        `el opcional ${id} lleva de 1 a 30 caracteres (validaciones 10274/10276)`,
        o.valor,
      );
  });
  if (polizas !== endosos)
    fail('opcionales', `los opcionales 2901 (${polizas}) y 2902 (${endosos}) van en igual cantidad (validación 10281)`);
  if (opcionales.length > MAX_OPCIONALES_CAUCION)
    fail('opcionales', `con póliza/endoso se admiten hasta ${MAX_OPCIONALES_CAUCION} opcionales (validación 10280)`);
}

/** Tipos de documento admitidos en `Compradores` y en el receptor que los lleva (10136, 10137). */
const DOC_TIPOS_COMPRADOR = new Set<number>([DocTipo.CUIT, DocTipo.CUIL, DocTipo.CDI]);

/**
 * `Compradores` (validaciones 10134-10147, 10150 y 10194): solo en comprobantes A, B,
 * C o M (no FCE) con concepto 1.
 */
function checkCompradores(opts: FacturarOpts, docTipo: number, concepto: number, ctx: ContextoValidacion): void {
  const compradores = opts.compradores;
  if (compradores === undefined || compradores.length === 0) return;
  if (isFCE(opts.cbteTipo))
    fail('compradores', 'los comprobantes FCE MiPyME no admiten compradores (validación 10194)');
  if (!isTipoA(opts.cbteTipo) && !isTipoB(opts.cbteTipo) && !isTipoC(opts.cbteTipo))
    fail('compradores', 'compradores solo se informa en comprobantes A, B, C o M (validación 10134)', opts.cbteTipo);
  if (concepto !== Concepto.PRODUCTOS)
    fail('compradores', 'compradores solo se informa con concepto 1 (productos) (validación 10150)', concepto);
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
    if (!/^\d{11}$/.test(String(c.docNro)))
      fail(f('docNro'), 'docNro de un comprador es un número de 11 dígitos (validación 10139)', c.docNro);
    if (esEmisor(c.docNro, ctx))
      fail(f('docNro'), 'un comprador no puede ser el emisor del comprobante (validación 10140)', c.docNro);
    if (!isAmount(c.porcentaje) || c.porcentaje <= 0 || c.porcentaje > 100)
      fail(f('porcentaje'), 'porcentaje debe ser mayor a 0 y hasta 100 (validaciones 10143/10144)', c.porcentaje);
    if (Math.abs(c.porcentaje * 100 - Math.round(c.porcentaje * 100)) > 1e-6)
      fail(f('porcentaje'), 'porcentaje tiene hasta 2 decimales (validación 10143)', c.porcentaje);
    const clave = `${c.docTipo}-${Number(c.docNro)}`;
    if (vistos.has(clave)) fail(f('docNro'), 'los compradores no pueden repetirse (validación 10141)', c.docNro);
    vistos.add(clave);
    suma += Math.round(c.porcentaje * 100);
  });
  if (suma !== 10_000)
    fail('compradores', `los porcentajes de los compradores deben sumar 100 (suman ${suma / 100}, validación 10147)`);
  const receptor = compradores.find((c) => c.docTipo === docTipo && Number(c.docNro) === Number(opts.docNro));
  if (!receptor)
    fail('compradores', 'uno de los compradores tiene que ser el receptor del comprobante (validación 10145)');
  // Con empate en el mayor porcentaje alcanza con que el receptor sea uno de ellos.
  const mayor = Math.max(...compradores.map((c) => Math.round(c.porcentaje * 100)));
  if (Math.round(receptor.porcentaje * 100) !== mayor)
    fail(
      'compradores',
      'el comprador de mayor porcentaje tiene que ser el receptor del comprobante (validación 10146)',
    );
}

/** `true` si `docNro` es el CUIT del emisor (`ctx.cuitEmisor`), validaciones 10069 y 10140. */
function esEmisor(docNro: number | undefined, ctx: ContextoValidacion): boolean {
  return ctx.cuitEmisor !== undefined && docNro !== undefined && Number(docNro) === Number(ctx.cuitEmisor);
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
  checkMoneda(
    (n) => n,
    opts.moneda,
    opts.cotizacion,
    opts.canMisMonExt,
    { cotizacion: 'cotizacion', canMisMonExt: 'canMisMonExt' },
    'wsfex',
  );
  if (opts.canMisMonExt !== undefined && (opts.cbteTipo !== CbteTipo.FACTURA_E || opts.moneda === Moneda.PESOS))
    fail(
      'canMisMonExt',
      'canMisMonExt solo se informa en Factura E (19) en moneda extranjera: no con PES ni en notas de crédito/débito (validación 1605)',
      opts.canMisMonExt,
    );
  checkCmpsAsocExpo(opts);
  if (opts.cbteTipo === CbteTipo.FACTURA_E && !opts.formaPago)
    fail('formaPago', 'formaPago es requerido en Factura E (19) (validación 1620)');
  if (opts.cbteTipo === CbteTipo.FACTURA_E && opts.tipoExpo === TipoExpo.BIENES && !opts.incoterms)
    fail('incoterms', 'incoterms es requerido en Factura E (19) de bienes (tipoExpo 1) (validación 1640)');
  if (opts.incotermsDes && !opts.incoterms) fail('incoterms', 'incotermsDes requiere incoterms (validación 1641)');
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

/** Comprobantes que se asocian a una Factura E: remitos 88, 89, 91, 993 y 994 (validación 1755). */
const ASOCIABLES_FACTURA_E: readonly number[] = [88, 89, 91, 993, 994];
/** Remitos que se pueden asociar más de uno (validación 1754). */
const ASOCIABLES_MULTIPLES_EXPO: readonly number[] = [88, 89];

/**
 * Comprobantes asociados de WSFEX:
 * - 1755: la Factura E solo asocia remitos (88, 89, 91, 993, 994).
 * - 1754: un solo asociado, salvo que sean remitos 88 u 89.
 * - 2047: las NC/ND de servicios (tipoExpo 2) llevan asociados.
 */
function checkCmpsAsocExpo(opts: FacturarExpoOpts): void {
  const asociados = opts.cbtesAsoc ?? [];
  if (opts.cbteTipo !== CbteTipo.FACTURA_E && opts.tipoExpo === TipoExpo.SERVICIOS && asociados.length === 0)
    fail('cbtesAsoc', 'las notas de crédito/débito E de servicios (tipoExpo 2) requieren cbtesAsoc (validación 2047)');
  if (opts.cbteTipo === CbteTipo.FACTURA_E) {
    const i = asociados.findIndex((c) => !ASOCIABLES_FACTURA_E.includes(c.cbteTipo));
    if (i >= 0)
      fail(
        `cbtesAsoc[${i}].cbteTipo`,
        `la Factura E solo asocia los tipos ${ASOCIABLES_FACTURA_E.join(', ')} (validación 1755)`,
        asociados[i].cbteTipo,
      );
  }
  if (asociados.length > 1 && !asociados.every((c) => ASOCIABLES_MULTIPLES_EXPO.includes(c.cbteTipo)))
    fail('cbtesAsoc', 'no se puede informar más de un comprobante asociado, salvo remitos 88 u 89 (validación 1754)');
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
