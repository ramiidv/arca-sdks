import type { ArcaSdkConfig, CallOptions } from '@ramiidv/arca-common';

// Tipos compartidos de common que forman parte de la API pública.
export type {
  AccessTicket,
  ArcaEvent,
  CallOptions,
  LegacyTlsMode,
  ServerStatus,
  ServiceClientConfig,
  ServiceEndpoints,
  ServiceTransport,
  TicketStorage,
} from '@ramiidv/arca-common';

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

export interface ArcaMtxcaConfig extends ArcaSdkConfig {
  /**
   * URLs propias (proxy, mock). Si se indican, ignoran `production`; las que no
   * se indiquen usan las oficiales.
   */
  endpoints?: {
    /** URL de WSMTXCA (`.../wsmtxca/services/MTXCAService`). */
    wsmtxca?: string;
    /** URL del WSAA (`.../ws/services/LoginCms`). Se ignora si se pasa `wsaa`. */
    wsaa?: string;
  };
  /**
   * Recibe el `evento` (aviso informativo de ARCA) de cualquier respuesta que
   * lo traiga, incluidas las que devuelven un número o una lista. Los errores
   * del callback se ignoran.
   */
  onEvento?: (evento: CodigoDescripcion, method: string) => void;
}

/** Credenciales de cada request (`AuthRequestType`). */
export interface MtxcaAuth {
  token: string;
  sign: string;
  /** CUIT representada (11 dígitos). */
  cuitRepresentada: string;
}

/**
 * Fecha de un campo `xsd:date`: `Date` (se toma la fecha calendario de
 * Argentina) o string `YYYY-MM-DD` / `YYYYMMDD`. Se envía como `YYYY-MM-DD`.
 */
export type FechaInput = Date | string;

// ---------------------------------------------------------------------------
// Request: ComprobanteType
// ---------------------------------------------------------------------------

/** `ItemType`. Los importes se redondean según el XSD antes de enviarse. */
export interface MtxcaItem {
  /** Unidades MTX (int >= 1). Obligatorio salvo unidad 97/99 (validación 500). */
  unidadesMtx?: number;
  /** Código MTX/GTIN. Obligatorio salvo unidad 97/99 (validación 503). */
  codigoMtx?: string;
  /** Código interno del producto (máx. 50). */
  codigo?: string;
  /** Descripción (máx. 4000). */
  descripcion: string;
  /** Cantidad (6 decimales). No corresponde con unidad 97/99; obligatoria en el resto. */
  cantidad?: number;
  /** Código de unidad de medida (`getUnidadesMedida()`). */
  codigoUnidadMedida: number;
  /**
   * Precio unitario (6 decimales). Sin IVA en clase A, con IVA en clase B.
   * No corresponde con unidad 97/99; obligatorio en el resto.
   */
  precioUnitario?: number;
  /** Bonificación (6 decimales). No corresponde con unidad 97/99. */
  importeBonificacion?: number;
  /** Condición de IVA del ítem (`CodigoCondicionIVA`). */
  codigoCondicionIVA: number;
  /**
   * IVA del ítem (2 decimales). Obligatorio en clase A (1, 2, 3, 51, 52, 53); no
   * corresponde en 6, 7, 8 (514). En FCE (201-208) el manual no lo exige ni
   * valida su fórmula.
   */
  importeIVA?: number;
  /** Importe del ítem con IVA incluido (2 decimales). Negativo en unidad 95/99. */
  importeItem: number;
}

/** `SubtotalIVAType`: total de IVA de una alícuota (códigos 4, 5, 6). */
export interface MtxcaSubtotalIVA {
  codigo: number;
  importe: number;
}

/** `OtroTributoType`. */
export interface MtxcaOtroTributo {
  /** Código de tributo (`getTiposTributo()`). */
  codigo: number;
  /** Hasta 25 caracteres. Obligatoria si `codigo` es 99 (301) y en FCE (302); se valida localmente en CAE. */
  descripcion?: string;
  baseImponible: number;
  importe: number;
}

/** `ComprobanteAsociadoType`. */
export interface MtxcaComprobanteAsociado {
  codigoTipoComprobante: number;
  numeroPuntoVenta: number;
  numeroComprobante: number;
  /** En una nota FCE, obligatorio en el asociado FCE (209 / 809) y es el CUIT del emisor (210 / 810). */
  cuit?: number | string;
  fechaEmision?: FechaInput;
}

/** `PeriodoComprobantesAsociadosType`. */
export interface MtxcaPeriodo {
  fechaDesde: FechaInput;
  fechaHasta: FechaInput;
}

/** `DatoAdicionalType` (`getTiposDatosAdicionales()`). */
export interface MtxcaDatoAdicional {
  t: number;
  c1?: string;
  c2?: string;
  c3?: string;
  c4?: string;
  c5?: string;
  c6?: string;
}

/** `CompradorType`. */
export interface MtxcaComprador {
  codigoTipoDocumento: number;
  numeroDocumento: number | string;
  /** Porcentaje de titularidad (2 decimales), mayor a 0 y menor a 100 (424, 425). */
  porcentaje: number;
}

/** Campos de `ComprobanteType` comunes a CAE, CAEA y ajustes de IVA. */
export interface MtxcaComprobanteBase {
  codigoTipoComprobante: number;
  numeroPuntoVenta: number;
  /** Opcional: si no se envía, ARCA usa la fecha de proceso. */
  fechaEmision?: FechaInput;
  codigoTipoDocumento?: number;
  numeroDocumento?: number | string;
  /**
   * Condición de IVA del receptor, RG 5616 (`getCondicionesIVAReceptor()`).
   * Obligatoria: `autorizar()` e `informarComprobanteCAEA()` la exigen
   * localmente (ARCA observa 190 / 390 y pasará a rechazar).
   */
  condicionIVAReceptor?: number;
  importeGravado?: number;
  importeNoGravado?: number;
  importeExento?: number;
  /** Gravado + no gravado + exento. */
  importeSubtotal: number;
  importeOtrosTributos?: number;
  importeTotal: number;
  /** Código de moneda (`Moneda` o `getMonedas()`). */
  codigoMoneda: string;
  /** Cotización (6 decimales). Debe ser 1 para PES. */
  cotizacionMoneda?: number;
  /** "S" solo en los tipos 1, 6, 51, 201 y 206 (118), con moneda extranjera (169). */
  cancelaEnMismaMonedaExtranjera?: 'S' | 'N';
  observaciones?: string;
  codigoConcepto: number;
  /** Obligatoria si `codigoConcepto` es 2 o 3. */
  fechaServicioDesde?: FechaInput;
  /** Obligatoria si `codigoConcepto` es 2 o 3. */
  fechaServicioHasta?: FechaInput;
  /**
   * Obligatoria si `codigoConcepto` es 2 o 3 (124). En FCE no depende del
   * concepto: obligatoria en 201 y 206 (148) y no corresponde en 202, 203, 207
   * y 208 (149).
   */
  fechaVencimientoPago?: FechaInput;
  /** En ND/NC 2, 3, 7, 8, 52, 53: obligatorio este o `periodoComprobantesAsociados`, no ambos (160, 161). */
  comprobantesAsociados?: MtxcaComprobanteAsociado[];
  periodoComprobantesAsociados?: MtxcaPeriodo;
  /** En FCE, cada tributo lleva `descripcion` (302). */
  otrosTributos?: MtxcaOtroTributo[];
  items: MtxcaItem[];
  subtotalesIVA?: MtxcaSubtotalIVA[];
  datosAdicionales?: MtxcaDatoAdicional[];
  /**
   * Más de uno, solo con `codigoConcepto` 1 (420, 432) y no en FCE (433). No
   * se admite en `informarComprobanteCAEA` (753).
   */
  compradores?: MtxcaComprador[];
  /** Códigos de actividad (`getActividadesVigentes()`). */
  actividades?: number[];
}

/** Comprobante a autorizar con CAE (`autorizarComprobante` / `autorizarAjusteIVA`), con número explícito. */
export interface MtxcaComprobanteCAE extends MtxcaComprobanteBase {
  numeroComprobante: number;
}

/**
 * Request de `ArcaMtxca.autorizar()`. Si no se indica `numeroComprobante`, se
 * usa el último autorizado + 1 (`consultarUltimoComprobanteAutorizado`).
 */
export interface AutorizarRequest extends MtxcaComprobanteBase {
  numeroComprobante?: number;
}

/** Comprobante emitido con CAEA a informar (`informarComprobanteCAEA` / `informarAjusteIVACAEA`). */
export interface MtxcaComprobanteCAEA extends MtxcaComprobanteBase {
  numeroComprobante: number;
  /** CAEA usado (14 dígitos). Se envía como `codigoAutorizacion`. */
  caea: string;
  /** Opcional; si se informa debe ser "A". */
  codigoTipoAutorizacion?: 'A';
  /** Opcional; si se informa debe coincidir con la fecha hasta del CAEA. */
  fechaVencimiento?: FechaInput;
  /**
   * Fecha/hora de generación: `Date` (hora de Argentina) o string
   * `YYYY-MM-DDTHH:MM:SS`. Obligatoria desde el 01/08/2026 (754): el SDK la
   * exige localmente en `informarComprobanteCAEA` e `informarAjusteIVACAEA`.
   */
  fechaHoraGen?: Date | string;
}

/** Opciones de `ArcaMtxca.autorizar()`. */
export interface AutorizarOptions extends CallOptions {
  /**
   * Valida localmente las reglas de negocio excluyentes del manual (default:
   * true): importes y fórmulas, pero también receptor, fechas, moneda, FCE,
   * comprobantes asociados, datos adicionales, compradores, etc. Con `false`
   * solo se valida el XSD (y el dígito verificador de los CUIT). Desactivalo
   * solo si ARCA acepta un caso que esta validación rechaza.
   */
  validarImportes?: boolean;
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

/** `CodigoDescripcionType`. */
export interface CodigoDescripcion {
  codigo: number;
  descripcion: string;
}

/** `CodigoDescripcionStringType` (monedas). */
export interface CodigoDescripcionString {
  codigo: string;
  descripcion: string;
}

/**
 * Resultado de una emisión aprobada: A = aprobado, O = aprobado con
 * observaciones. Un rechazo (R) no se devuelve: lanza `ArcaRechazoError`.
 */
export type MtxcaResultado = 'A' | 'O';

/** `ComprobanteCAEResponseType`. */
export interface MtxcaComprobanteCAEResponse {
  cuit: string;
  codigoTipoComprobante: number;
  numeroPuntoVenta: number;
  numeroComprobante: number;
  fechaEmision: string;
  /** CAE (14 dígitos). */
  cae: string;
  fechaVencimientoCAE: string;
}

/**
 * Respuesta de `autorizarComprobante` / `autorizarAjusteIVA`: siempre un
 * comprobante aprobado (`A`, u `O` con observaciones). Un rechazo lanza
 * `ArcaRechazoError` (motivos en `errors`).
 */
export interface MtxcaAutorizarResult {
  resultado: MtxcaResultado;
  comprobante: MtxcaComprobanteCAEResponse;
  /** Observaciones (en A no suele haber; en O explican por qué). */
  observaciones: CodigoDescripcion[];
  /** Anuncio informativo del sistema, si lo hay. */
  evento?: CodigoDescripcion;
}

/** `ComprobanteCAEAResponseType`. */
export interface MtxcaComprobanteCAEAResponse {
  caea: string;
  codigoTipoComprobante: number;
  numeroPuntoVenta: number;
  numeroComprobante: number;
}

/**
 * Respuesta de `informarComprobanteCAEA` / `informarAjusteIVACAEA`: siempre un
 * comprobante aceptado (`A`, u `O` con observaciones). Un rechazo lanza
 * `ArcaRechazoError` (motivos en `errors`).
 */
export interface MtxcaInformarCAEAResult {
  resultado: MtxcaResultado;
  /** Fecha de proceso (YYYY-MM-DD). */
  fechaProceso: string;
  comprobante: MtxcaComprobanteCAEAResponse;
  /** Observaciones (en A no suele haber; en O explican por qué). */
  observaciones: CodigoDescripcion[];
  /** Anuncio informativo del sistema, si lo hay. */
  evento?: CodigoDescripcion;
}

/** `CAEAResponseType`. */
export interface MtxcaCAEA {
  fechaProceso: string;
  /** CAEA (14 dígitos). */
  caea: string;
  /** AAAAMM */
  periodo: number;
  /** 1 = primera quincena, 2 = segunda. */
  orden: number;
  fechaDesde: string;
  fechaHasta: string;
  fechaTopeInforme: string;
  observaciones: CodigoDescripcion[];
  /** Anuncio informativo del sistema (`solicitarCAEA` / `consultarCAEA`), si lo hay. */
  evento?: CodigoDescripcion;
}

/**
 * Respuesta de `informarCAEANoUtilizado` / `informarCAEANoUtilizadoPtoVta`:
 * siempre una operación aceptada. Un rechazo lanza `ArcaRechazoError` (motivos
 * en `errors`).
 */
export interface MtxcaCAEANoUtilizadoResult {
  resultado: MtxcaResultado;
  /** Fecha de proceso (YYYY-MM-DD). */
  fechaProceso: string;
  caea: string;
  /** Solo en `informarCAEANoUtilizadoPtoVta`. */
  numeroPuntoVenta?: number;
  /** Anuncio informativo del sistema, si lo hay. */
  evento?: CodigoDescripcion;
}

/** Ítem tal como lo devuelve `consultarComprobante`. */
export interface MtxcaItemConsultado {
  unidadesMtx?: number;
  codigoMtx?: string;
  codigo?: string;
  descripcion: string;
  cantidad?: number;
  codigoUnidadMedida: number;
  precioUnitario?: number;
  importeBonificacion?: number;
  codigoCondicionIVA: number;
  importeIVA?: number;
  importeItem: number;
}

/** `ComprobanteType` tal como lo devuelve `consultarComprobante`. */
export interface MtxcaComprobanteConsultado {
  codigoTipoComprobante: number;
  numeroPuntoVenta: number;
  numeroComprobante: number;
  fechaEmision?: string;
  /** "E" = CAE, "A" = CAEA. */
  codigoTipoAutorizacion?: string;
  /** CAE o CAEA (14 dígitos). */
  codigoAutorizacion?: string;
  fechaVencimiento?: string;
  codigoTipoDocumento?: number;
  numeroDocumento?: string;
  condicionIVAReceptor?: number;
  importeGravado?: number;
  importeNoGravado?: number;
  importeExento?: number;
  importeSubtotal: number;
  importeOtrosTributos?: number;
  importeTotal: number;
  codigoMoneda: string;
  cotizacionMoneda?: number;
  cancelaEnMismaMonedaExtranjera?: string;
  observaciones?: string;
  codigoConcepto: number;
  fechaServicioDesde?: string;
  fechaServicioHasta?: string;
  fechaVencimientoPago?: string;
  fechaHoraGen?: string;
  comprobantesAsociados: Array<{
    codigoTipoComprobante: number;
    numeroPuntoVenta: number;
    numeroComprobante: number;
    cuit?: string;
    fechaEmision?: string;
  }>;
  periodoComprobantesAsociados?: { fechaDesde: string; fechaHasta: string };
  otrosTributos: Array<{ codigo: number; descripcion?: string; baseImponible: number; importe: number }>;
  items: MtxcaItemConsultado[];
  subtotalesIVA: MtxcaSubtotalIVA[];
  datosAdicionales: MtxcaDatoAdicional[];
  compradores: Array<{ codigoTipoDocumento: number; numeroDocumento: string; porcentaje: number }>;
  actividades: number[];
}

/** Respuesta de `consultarComprobante`. */
export interface MtxcaConsultaComprobanteResult {
  comprobante: MtxcaComprobanteConsultado;
  observaciones: CodigoDescripcion[];
  evento?: CodigoDescripcion;
}

/** `PuntoVentaType`. */
export interface PuntoVenta {
  numeroPuntoVenta: number;
  /** "S" o "N". */
  bloqueado: string;
  fechaBaja?: string;
}

/** `ActividadVigenteType`. */
export interface ActividadVigente {
  codigo: number;
  orden: number;
  descripcion: string;
}

/** Respuesta de `consultarCotizacionMoneda`. */
export interface CotizacionResult {
  codigoMoneda: string;
  /** Fecha consultada (YYYY-MM-DD). */
  fechaCotizacion: string;
  /** Cotización, o `null` si ARCA no tiene cotización para esa moneda (respuesta sin valor, sin error). */
  cotizacion: number | null;
  /** Anuncio informativo del sistema, si lo hay. */
  evento?: CodigoDescripcion;
}
