/**
 * Schemas de WSMTXCA (XSD del WSDL de producción) con el DSL de
 * `@ramiidv/arca-common/schema`.
 *
 * Los de `ComprobanteType` usan los nombres de la API (`items`, `caea`, ...)
 * con `xml()` para los elementos que en el XML se llaman distinto
 * (`arrayItems`, `codigoAutorizacion`, ...).
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
import { cuit, date, datetime, dec, id, int, must, obj, opt, str, wrapped, xml } from '@ramiidv/arca-common/schema';
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
const texto = (maxLen?: number) => str({ maxLen, pattern: /\S/, patternMessage: 'no puede estar vacío' });
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

/**
 * Los arrays de `ComprobanteType`; en el XML van como `array<Nombre>`.
 * `actividades` es `number[]` en la API: `serialize.ts` arma cada
 * `{ codigo }` (`ActividadType`) antes de codificar.
 */
const ARRAYS: Schema = {
  comprobantesAsociados: xml('arrayComprobantesAsociados', lista('comprobanteAsociado', obj(COMPROBANTE_ASOCIADO))),
  periodoComprobantesAsociados: opt(obj({ fechaDesde: must(date()), fechaHasta: must(date()) })),
  otrosTributos: xml('arrayOtrosTributos', lista('otroTributo', obj(OTRO_TRIBUTO))),
  items: xml('arrayItems', must(wrapped('item', obj(ITEM)))),
  subtotalesIVA: xml(
    'arraySubtotalesIVA',
    lista('subtotalIVA', obj({ codigo: must(CODIGO), importe: must(IMPORTE_SUBTOTAL) })),
  ),
  datosAdicionales: xml('arrayDatosAdicionales', lista('datoAdicional', obj(DATO_ADICIONAL))),
  compradores: xml('arrayCompradores', lista('comprador', obj(COMPRADOR))),
  actividades: xml('arrayActividades', lista('actividad', obj({ codigo: must(int(1, Number.MAX_SAFE_INTEGER)) }))),
};

/** `ComprobanteType` de `autorizarComprobante` / `autorizarAjusteIVA` (sin datos de CAEA). */
export const COMPROBANTE_CAE: Schema = { ...CABECERA, ...CUERPO, ...ARRAYS };

/** `ComprobanteType` de `informarComprobanteCAEA` / `informarAjusteIVACAEA`. */
export const COMPROBANTE_CAEA: Schema = {
  ...CABECERA,
  codigoTipoAutorizacion: opt(str({ values: ['A'] })),
  caea: xml('codigoAutorizacion', must(CAEA)),
  fechaVencimiento: opt(date()),
  ...CUERPO,
  fechaHoraGen: opt(datetime()),
  ...ARRAYS,
};

/**
 * `ComprobanteType` como lo devuelve `consultarComprobante`, con las claves del
 * XML (los `xml()` de `ARRAYS` coinciden con la clave).
 */
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

/** Cuerpo de `consultarCAEA`, `informarCAEANoUtilizado` y `consultarPtosVtaCAEANoInformados`. */
export const CON_CAEA: Schema = { caea: xml('CAEA', must(CAEA)) };

/** Cuerpo de `informarCAEANoUtilizadoPtoVta`. */
export const CON_CAEA_PTO_VTA: Schema = { ...CON_CAEA, numeroPuntoVenta: must(PTO_VTA) };

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

/**
 * `InformarCAEANoUtilizadoResponseType` (obligatorios solo si no es rechazo;
 * `resultado` se chequea como en `RESULTADO`). No tiene `arrayObservaciones`.
 */
export const CAEA_NO_UTILIZADO: Schema = {
  resultado: opt(str()),
  fechaProceso: opt(date()),
  CAEA: opt(id()),
  arrayErrores: CODIGOS,
  evento: EVENTO,
};

/** `InformarCAEANoUtilizadoPtoVtaResponseType`. */
export const CAEA_NO_UTILIZADO_PTO_VTA: Schema = {
  resultado: opt(str()),
  fechaProceso: opt(date()),
  CAEA: opt(id()),
  numeroPuntoVenta: opt(int()),
  arrayErrores: CODIGOS,
  evento: EVENTO,
};

/** `fechaProceso` de `Informar[ComprobanteCAEA|AjusteIVACAEA]ResponseType` (obligatorio solo si no es rechazo). */
export const FECHA_PROCESO: Schema = { fechaProceso: opt(date()) };

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

/** `ConsultarCAEAEntreFechasResponseType`. */
export const CAEA_ENTRE_FECHAS_RESPONSE: Schema = { arrayCAEAResponse: wrapped('CAEAResponse', obj(CAEA_RESPONSE), 0) };

/** `ConsultarUltimoComprobanteAutorizadoResponseType` (los errores se chequean aparte). */
export const ULTIMO_RESPONSE: Schema = { numeroComprobante: must(int()) };

/** `ConsultarComprobanteResponseType` (los errores se chequean aparte). */
export const CONSULTA_COMPROBANTE_RESPONSE: Schema = {
  comprobante: obj(COMPROBANTE_CONSULTADO),
  arrayObservaciones: CODIGOS,
  evento: EVENTO,
};

/** `ConsultarCondicionesIVAReceptorResponseType`. */
export const CONDICIONES_IVA_RECEPTOR_RESPONSE: Schema = { arrayCondicionesIVAReceptor: CODIGOS };

/** `ConsultarCotizacionMonedaResponseType`. */
export const COTIZACION_RESPONSE: Schema = { cotizacionMoneda: opt(dec(6)) };

/** `ConsultarPuntosVenta*ResponseType` y `ConsultarPtosVtaCAEANoInformadosResponseType`. */
export const PUNTOS_VENTA_RESPONSE: Schema = { arrayPuntosVenta: wrapped('puntoVenta', PUNTO_VENTA, 0) };

/** `ConsultarActividadesVigentesResponseType`. */
export const ACTIVIDADES_VIGENTES_RESPONSE: Schema = { arrayActividades: wrapped('actividad', ACTIVIDAD_VIGENTE, 0) };

/** Respuestas de las consultas de parámetros: método → `{ contenedor: lista }`. */
export const PARAMETROS = {
  consultarTiposComprobante: { arrayTiposComprobante: CODIGOS },
  consultarTiposDocumento: { arrayTiposDocumento: CODIGOS },
  consultarAlicuotasIVA: { arrayAlicuotasIVA: CODIGOS },
  consultarCondicionesIVA: { arrayCondicionesIVA: CODIGOS },
  consultarUnidadesMedida: { arrayUnidadesMedida: CODIGOS },
  consultarTiposTributo: { arrayTiposTributo: CODIGOS },
  consultarTiposDatosAdicionales: { arrayTiposDatosAdicionales: CODIGOS },
  consultarMonedas: { arrayMonedas: CODIGOS_STRING },
} as const satisfies Record<string, Schema>;
