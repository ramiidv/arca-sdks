/**
 * Schemas de WSMTXCA (XSD del WSDL de producción) con el DSL de
 * `@ramiidv/arca-common/schema`.
 *
 * Los de `ComprobanteType` usan los nombres de la API (`items`, `caea`, ...),
 * que `serialize.ts` traduce a los del XML (`arrayItems`, `codigoAutorizacion`).
 * Los campos obligatorios llevan `must()` para que el mismo schema sirva para
 * codificar requests y decodificar respuestas.
 *
 * Restricciones que no están en el XSD y se mantienen del manual / del SDK:
 * largos máximos de texto, textos no vacíos, códigos `xsd:short` >= 1,
 * `unidadesMtx` <= 999999, `cotizacionMoneda` en (0, 9999.999999] y
 * `codigoTipoAutorizacion` solo "A" al informar.
 *
 * @internal No se exporta desde `index.ts`.
 */
import { cuit, date, datetime, dec, id, int, must, obj, opt, str, wrapped } from '@ramiidv/arca-common/schema';
import type { Field, Schema } from '@ramiidv/arca-common/schema';

// ---------------------------------------------------------------------------
// simpleTypes
// ---------------------------------------------------------------------------

const IMPORTE_MAX = 9999999999999.99;
// biome-ignore lint/correctness/noPrecisionLoss: tope literal del XSD (maxInclusive)
const DECIMAL_MAX = 999999999999.999999;

/** Códigos `xsd:short` (tipo de comprobante, documento, concepto, IVA, ...). */
const CODIGO = int(1, 32767);
/** `NumeroPuntoVentaSimpleType`. */
export const PTO_VTA = int(1, 99998);
/** `NumeroComprobanteSimpleType`. */
const NRO_CBTE = int(1, 99999999);
/** `ImporteSubtotalSimpleType` (admite negativos). */
const IMPORTE_SUBTOTAL = dec(2, -IMPORTE_MAX, IMPORTE_MAX);
/** `ImporteTotalSimpleType`. */
const IMPORTE_TOTAL = dec(2, 0, IMPORTE_MAX);
/** `DecimalSimpleType`: cantidad, precio unitario, bonificación. */
const DECIMAL = dec(6, 0, DECIMAL_MAX);
/** `PorcentajeSimpleType`. */
const PORCENTAJE = dec(2, 0, 100);
/** `xsd:string` no vacío (con largo máximo del manual). */
const texto = (maxLen?: number) => str({ maxLen, pattern: /\S/ });
/** `xsd:long` de un número de documento (la API acepta number o string; ver `serialize.ts`). */
const DOCUMENTO = str({ pattern: /^\d{1,18}$/ });
/** CAE/CAEA (`xsd:long` de 14 dígitos). */
export const CAEA = str({ pattern: /^\d{14}$/ });

// ---------------------------------------------------------------------------
// ComprobanteType
// ---------------------------------------------------------------------------

const ITEM: Schema = {
  unidadesMtx: opt(int(1, 999999)),
  codigoMtx: opt(texto()),
  codigo: opt(texto(50)),
  descripcion: must(texto(4000)),
  cantidad: opt(DECIMAL),
  codigoUnidadMedida: must(CODIGO),
  precioUnitario: opt(DECIMAL),
  importeBonificacion: opt(DECIMAL),
  codigoCondicionIVA: must(CODIGO),
  importeIVA: opt(IMPORTE_SUBTOTAL),
  importeItem: must(IMPORTE_SUBTOTAL),
};

const COMPROBANTE_ASOCIADO: Schema = {
  codigoTipoComprobante: must(CODIGO),
  numeroPuntoVenta: must(PTO_VTA),
  numeroComprobante: must(NRO_CBTE),
  cuit: opt(cuit({ decodeAs: 'string' })),
  fechaEmision: opt(date()),
};

const OTRO_TRIBUTO: Schema = {
  codigo: must(CODIGO),
  descripcion: opt(texto()),
  baseImponible: must(IMPORTE_TOTAL),
  importe: must(IMPORTE_TOTAL),
};

const DATO_ADICIONAL: Schema = {
  t: must(CODIGO),
  c1: opt(texto()),
  c2: opt(texto()),
  c3: opt(texto()),
  c4: opt(texto()),
  c5: opt(texto()),
  c6: opt(texto()),
};

const COMPRADOR: Schema = {
  codigoTipoDocumento: must(CODIGO),
  numeroDocumento: must(DOCUMENTO),
  porcentaje: must(PORCENTAJE),
};

/** Lista opcional: un array vacío no se envía. */
const lista = (item: string, f: Field) => opt(wrapped(item, f, 0));

const CABECERA: Schema = {
  codigoTipoComprobante: must(CODIGO),
  numeroPuntoVenta: must(PTO_VTA),
  numeroComprobante: must(NRO_CBTE),
  fechaEmision: opt(date()),
};

const CUERPO: Schema = {
  codigoTipoDocumento: opt(CODIGO),
  numeroDocumento: opt(DOCUMENTO),
  condicionIVAReceptor: opt(CODIGO),
  importeGravado: opt(IMPORTE_SUBTOTAL),
  importeNoGravado: opt(IMPORTE_SUBTOTAL),
  importeExento: opt(IMPORTE_SUBTOTAL),
  importeSubtotal: must(IMPORTE_SUBTOTAL),
  importeOtrosTributos: opt(IMPORTE_TOTAL),
  importeTotal: must(IMPORTE_TOTAL),
  codigoMoneda: must(texto(3)),
  cotizacionMoneda: opt(dec(6, 0, 9999.999999, true)),
  cancelaEnMismaMonedaExtranjera: opt(str({ values: ['S', 'N'] })),
  observaciones: opt(texto(2000)),
  codigoConcepto: must(CODIGO),
  fechaServicioDesde: opt(date()),
  fechaServicioHasta: opt(date()),
  fechaVencimientoPago: opt(date()),
};

/** Los arrays de `ComprobanteType`; en el XML van como `array<Nombre>` (ver `serialize.ts`). */
const ARRAYS: Schema = {
  comprobantesAsociados: lista('comprobanteAsociado', obj(COMPROBANTE_ASOCIADO)),
  periodoComprobantesAsociados: opt(obj({ fechaDesde: must(date()), fechaHasta: must(date()) })),
  otrosTributos: lista('otroTributo', obj(OTRO_TRIBUTO)),
  items: must(wrapped('item', obj(ITEM))),
  subtotalesIVA: lista('subtotalIVA', obj({ codigo: must(CODIGO), importe: must(IMPORTE_SUBTOTAL) })),
  datosAdicionales: lista('datoAdicional', obj(DATO_ADICIONAL)),
  compradores: lista('comprador', obj(COMPRADOR)),
  actividades: lista('actividad', int(1, Number.MAX_SAFE_INTEGER)),
};

/** `ComprobanteType` de `autorizarComprobante` / `autorizarAjusteIVA` (sin datos de CAEA). */
export const COMPROBANTE_CAE: Schema = { ...CABECERA, ...CUERPO, ...ARRAYS };

/** `ComprobanteType` de `informarComprobanteCAEA` / `informarAjusteIVACAEA`. */
export const COMPROBANTE_CAEA: Schema = {
  ...CABECERA,
  codigoTipoAutorizacion: opt(str({ values: ['A'] })),
  caea: must(CAEA),
  fechaVencimiento: opt(date()),
  ...CUERPO,
  fechaHoraGen: opt(datetime()),
  ...ARRAYS,
};

/** `ComprobanteType` como lo devuelve `consultarComprobante` (claves del XML; el orden no importa al decodificar). */
export const COMPROBANTE_CONSULTADO: Schema = {
  ...CABECERA,
  codigoTipoAutorizacion: opt(str()),
  codigoAutorizacion: opt(id()),
  fechaVencimiento: opt(date()),
  ...CUERPO,
  fechaHoraGen: opt(datetime()),
  arrayComprobantesAsociados: ARRAYS.comprobantesAsociados,
  periodoComprobantesAsociados: ARRAYS.periodoComprobantesAsociados,
  arrayOtrosTributos: ARRAYS.otrosTributos,
  arrayItems: ARRAYS.items,
  arraySubtotalesIVA: ARRAYS.subtotalesIVA,
  arrayDatosAdicionales: ARRAYS.datosAdicionales,
  arrayCompradores: ARRAYS.compradores,
  arrayActividades: lista('actividad', obj({ codigo: must(int()) })),
};

// ---------------------------------------------------------------------------
// Otros requests
// ---------------------------------------------------------------------------

/** `SolicitudCAEAType` (el mes de `periodo` se valida aparte). */
export const SOLICITUD_CAEA: Schema = { periodo: must(int(190001, 999912)), orden: must(int(1, 2)) };

/** `ConsultaUltimoComprobanteAutorizadoRequestType`. */
export const CONSULTA_ULTIMO: Schema = { codigoTipoComprobante: must(CODIGO), numeroPuntoVenta: must(PTO_VTA) };

/** `ConsultaComprobanteRequestType`. */
export const CONSULTA_COMPROBANTE: Schema = { ...CONSULTA_ULTIMO, numeroComprobante: must(NRO_CBTE) };

/** `ConsultaCondicionesIVARequestType`. */
export const CONSULTA_CONDICIONES_IVA: Schema = { codigoTipoComprobante: must(CODIGO) };

/** Cuerpo de `consultarCotizacionMoneda`. */
export const COTIZACION: Schema = { codigoMoneda: must(texto(3)), fechaCotizacion: must(date()) };

/** Cuerpo de `consultarCAEAEntreFechas`. */
export const ENTRE_FECHAS: Schema = { fechaDesde: must(date()), fechaHasta: must(date()) };

// ---------------------------------------------------------------------------
// Respuestas
// ---------------------------------------------------------------------------

/** `CodigoDescripcionType`. */
export const CODIGO_DESCRIPCION: Schema = { codigo: must(int()), descripcion: must(str()) };

/** `ArrayCodigosDescripcionesType`. */
export const CODIGOS = wrapped('codigoDescripcion', obj(CODIGO_DESCRIPCION), 0);

/** `ArrayCodigosDescripcionesStringType` (monedas). */
export const CODIGOS_STRING = wrapped('codigoDescripcion', obj({ codigo: must(str()), descripcion: must(str()) }), 0);

/** `evento` (`CodigoDescripcionType` opcional). */
export const EVENTO = opt(obj(CODIGO_DESCRIPCION));

/**
 * Parte común de las respuestas de emisión. `resultado` es obligatorio en el
 * XSD, pero se chequea a mano: si falta y hay `arrayErrores`, es un rechazo.
 */
export const RESULTADO: Schema = {
  resultado: opt(str()),
  arrayObservaciones: CODIGOS,
  arrayErrores: CODIGOS,
  evento: EVENTO,
};

/** `ComprobanteCAEResponseType`. */
export const COMPROBANTE_CAE_RESPONSE: Schema = {
  cuit: must(cuit({ decodeAs: 'string' })),
  codigoTipoComprobante: must(int()),
  numeroPuntoVenta: must(int()),
  numeroComprobante: must(int()),
  fechaEmision: must(date()),
  CAE: must(id()),
  fechaVencimientoCAE: must(date()),
};

/** `ComprobanteCAEAResponseType`. */
export const COMPROBANTE_CAEA_RESPONSE: Schema = {
  CAEA: must(id()),
  codigoTipoComprobante: must(int()),
  numeroPuntoVenta: must(int()),
  numeroComprobante: must(int()),
};

/** `InformarCAEANoUtilizado[PtoVta]ResponseType` (obligatorios solo si no es rechazo). */
export const CAEA_NO_UTILIZADO: Schema = {
  ...RESULTADO,
  fechaProceso: opt(date()),
  CAEA: opt(id()),
  numeroPuntoVenta: opt(int()),
};

/** `CAEAResponseType`. */
export const CAEA_RESPONSE: Schema = {
  fechaProceso: must(date()),
  CAEA: must(id()),
  periodo: must(int()),
  orden: must(int()),
  fechaDesde: must(date()),
  fechaHasta: must(date()),
  fechaTopeInforme: must(date()),
  arrayObservaciones: CODIGOS,
};

/** `PuntoVentaType`. */
export const PUNTO_VENTA = obj({ numeroPuntoVenta: must(int()), bloqueado: must(str()), fechaBaja: opt(date()) });

/** `ActividadVigenteType`. */
export const ACTIVIDAD_VIGENTE = obj({ codigo: must(int()), orden: must(int()), descripcion: must(str()) });
