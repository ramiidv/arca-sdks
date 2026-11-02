// Re-export from common
export type { AccessTicket, ArcaEvent, TicketStorage, CallOptions, LegacyTlsMode } from '@ramiidv/arca-common';
import type { ArcaSdkConfig } from '@ramiidv/arca-common';

// ============================================================
// Configuración
// ============================================================

/**
 * Configuración de `ArcaFacturacion`. Extiende `ArcaSdkConfig` de `@ramiidv/arca-common`
 * (cert, key, cuit, production, timeout, retries, retryDelayMs,
 * tokenTTLMinutes, onEvent, ticketStorage, clockOffsetMs, autoClockSkew,
 * loginErrorCooldownMs, fetch, legacyTls, wsaa, signal).
 *
 * - `retries`: reintentos en consultas ante errores transitorios (default: 1).
 *   Las emisiones (FECAESolicitar, FECAEARegInformativo,
 *   FECAEASinMovimientoInformar, FEXAuthorize) nunca se reintentan: ver
 *   `ArcaResultadoIncierto` y `ArcaResultadoInciertoExpo`.
 * - `legacyTls`: la producción de WSFEv1/WSFEX (`servicios1.afip.gov.ar`)
 *   negocia DH de 1024 bits, que Node >= 17 rechaza; con `auto` (default) el
 *   SDK reintenta ese handshake con el transporte TLS legacy de arca-common.
 */
export interface ArcaConfig extends ArcaSdkConfig {
  /**
   * CUIT del contribuyente (con o sin guiones). Se valida el dígito
   * verificador y se envía como número.
   */
  cuit: number | string;
  /**
   * TTL del cache de parámetros (getTipos*, getMonedas, etc.) en milisegundos.
   * Default: 86400000 (24 horas). 0 para desactivar. Los puntos de venta y las
   * cotizaciones no se cachean.
   */
  paramCacheTTLMs?: number;
  /** URLs propias de los servicios (ej: un proxy). Si no se indican, se usan las de ARCA según `production`. */
  endpoints?: {
    wsaa?: string;
    wsfe?: string;
    wsfex?: string;
  };
}

// ============================================================
// WSFE - Auth
// ============================================================

export interface WsfeAuth {
  token: string;
  sign: string;
  cuit: number;
}

// ============================================================
// WSFE - Solicitar CAE
// ============================================================

export interface AlicuotaIva {
  /** ID de tipo de IVA (usar enum IvaTipo) */
  id: number;
  /** Base imponible */
  baseImp: number;
  /** Importe del IVA */
  importe: number;
}

export interface Tributo {
  /** ID de tipo de tributo (usar enum TributoTipo) */
  id: number;
  /** Descripción del tributo (opcional en el request; ARCA puede no devolverla) */
  desc?: string;
  /** Base imponible (>= 0, se redondea a 2 decimales) */
  baseImp: number;
  /** Alícuota del tributo (>= 0) */
  alic: number;
  /** Importe del tributo (>= 0, se redondea a 2 decimales) */
  importe: number;
}

/**
 * Comprador de un comprobante con receptores múltiples (estructura
 * `Compradores` de WSFEv1, validaciones 10135-10148): al menos 2, con
 * DocTipo 80, 86 u 87, porcentajes que suman 100 y el de mayor porcentaje
 * igual al receptor del comprobante.
 */
export interface Comprador {
  /** Tipo de documento: 80 (CUIT), 86 (CUIL) u 87 (CDI) */
  docTipo: number;
  docNro: number;
  /** Porcentaje de titularidad (> 0, 2 decimales) */
  porcentaje: number;
}

/** Período asociado (`PeriodoAsoc`): NC/ND que refieren a un período en lugar de a comprobantes. */
export interface PeriodoAsociado {
  /** Fecha desde (YYYYMMDD) */
  fchDesde: string;
  /** Fecha hasta (YYYYMMDD) */
  fchHasta: string;
}

export interface ComprobanteAsociado {
  /** Tipo de comprobante asociado */
  tipo: number;
  /** Punto de venta del comprobante asociado */
  ptoVta: number;
  /** Número de comprobante asociado */
  nro: number;
  /** CUIT del emisor del comprobante asociado */
  cuit?: string | number;
  /** Fecha del comprobante asociado (formato YYYYMMDD) */
  cbteFch?: string;
}

export interface Opcional {
  /** ID de dato opcional */
  id: string;
  /** Valor del dato opcional */
  valor: string;
}

export interface InvoiceDetail {
  /** Concepto: 1=Productos, 2=Servicios, 3=Productos y Servicios */
  concepto: number;
  /** Tipo de documento del receptor (usar enum DocTipo) */
  docTipo: number;
  /** Número de documento del receptor */
  docNro: number;
  /** Número de comprobante desde */
  cbteDesde: number;
  /** Número de comprobante hasta */
  cbteHasta: number;
  /** Fecha del comprobante (formato YYYYMMDD) */
  cbteFch: string;
  /** Importe total */
  impTotal: number;
  /** Importe total de conceptos no gravados */
  impTotConc: number;
  /** Importe neto gravado */
  impNeto: number;
  /** Importe exento de IVA */
  impOpEx: number;
  /** Importe total de tributos */
  impTrib: number;
  /** Importe total de IVA */
  impIva: number;
  /** Código de moneda (usar enum Moneda) */
  monId: string;
  /**
   * Cotización de la moneda: 1 para pesos. Obligatoria salvo moneda extranjera
   * con `CanMisMonExt = "S"` (validación 10038).
   */
  monCotiz?: number;
  /** Fecha inicio del servicio (formato YYYYMMDD, requerido para servicios) */
  fchServDesde?: string;
  /** Fecha fin del servicio (formato YYYYMMDD, requerido para servicios) */
  fchServHasta?: string;
  /** Fecha de vencimiento de pago (formato YYYYMMDD, requerido para servicios y facturas FCE) */
  fchVtoPago?: string;
  /** Array de alícuotas de IVA */
  iva?: AlicuotaIva[];
  /** Array de tributos */
  tributos?: Tributo[];
  /** Array de comprobantes asociados */
  cbtesAsoc?: ComprobanteAsociado[];
  /** Array de datos opcionales */
  opcionales?: Opcional[];
  /**
   * Condición de IVA del receptor (usar enum CondicionIva). Obligatorio según
   * la RG 5616 (validación 10246 del manual WSFEv1 v4.7), también para
   * consumidor final (DocTipo 99).
   */
  condicionIvaReceptorId?: number;
  /**
   * Cancela en la misma moneda extranjera: "S" o "N" (opcional). Con `MonId`
   * = PES no debe informarse o debe ser "N" (validación 10241).
   */
  canMisMonExt?: string;
  /** Compradores (receptores múltiples). */
  compradores?: Comprador[];
  /** Período asociado (solo NC/ND, alternativa a `CbtesAsoc`). */
  periodoAsoc?: PeriodoAsociado;
  /** Actividades asociadas al comprobante (ver `getActividades`). */
  actividades?: { id: number }[];
  /**
   * Solo FECAEARegInformativo: fecha y hora de generación del comprobante
   * de contingencia, formato yyyymmddhhmmss (manual WSFEv1 v4.6, RG 5782).
   */
  cbteFchHsGen?: string;
}

export interface InvoiceRequest {
  /** Punto de venta */
  ptoVta: number;
  /** Tipo de comprobante (usar enum CbteTipo) */
  cbteTipo: number;
  /** Detalle de comprobantes */
  invoices: InvoiceDetail[];
}

// ============================================================
// WSFE - Respuestas
// ============================================================

export interface FeCabResp {
  cuit: number;
  ptoVta: number;
  cbteTipo: number;
  fchProceso?: string;
  cantReg: number;
  /** "A" aprobado, "R" rechazado, "P" parcial (en lotes: algunos aprobados y otros rechazados) */
  resultado: 'A' | 'R' | 'P';
  reproceso?: string;
}

export interface FECAEDetResponse {
  concepto: number;
  docTipo: number;
  docNro: number;
  cbteDesde: number;
  cbteHasta: number;
  cbteFch?: string;
  resultado: 'A' | 'R';
  /** CAE otorgado (FECAESolicitar) */
  cae?: string;
  caeFchVto?: string;
  /** CAEA informado (FECAEARegInformativo) */
  caea?: string;
  observaciones?: MensajeArca[];
}

/** Error, observación o evento de ARCA ya normalizado. */
export interface MensajeArca {
  code: number;
  msg: string;
}

export interface FECAESolicitarResult {
  feCabResp: FeCabResp;
  feDetResp: FECAEDetResponse[];
  /** `Events` de ARCA: avisos generales. */
  events?: MensajeArca[];
}

export interface FECompUltimoAutorizadoResult {
  ptoVta: number;
  cbteTipo: number;
  cbteNro: number;
  /** `Events` de ARCA: avisos generales. */
  events?: MensajeArca[];
}

export interface FECompConsultarResult {
  resultGet: {
    concepto: number;
    docTipo: number;
    docNro: number;
    cbteDesde: number;
    cbteHasta: number;
    cbteFch?: string;
    impTotal: number;
    impTotConc: number;
    impNeto: number;
    impOpEx: number;
    impTrib: number;
    impIva: number;
    fchServDesde?: string;
    fchServHasta?: string;
    fchVtoPago?: string;
    monId?: string;
    monCotiz?: number;
    resultado?: 'A' | 'R';
    codAutorizacion?: string;
    /** "CAE" o "CAEA" */
    emisionTipo?: string;
    fchVto?: string;
    fchProceso?: string;
    ptoVta: number;
    cbteTipo: number;
    condicionIvaReceptorId?: number;
    canMisMonExt?: string;
    iva?: AlicuotaIva[];
    tributos?: Tributo[];
    cbtesAsoc?: ComprobanteAsociado[];
    opcionales?: Opcional[];
    compradores?: Comprador[];
    periodoAsoc?: PeriodoAsociado;
    actividades?: { id: number }[];
    observaciones?: MensajeArca[];
  };
  /** `Events` de ARCA: avisos generales. */
  events?: MensajeArca[];
}

export interface ParamItem {
  id: number;
  desc: string;
  fchDesde?: string;
  fchHasta?: string;
}

/** Condición frente al IVA del receptor (`FEParamGetCondicionIvaReceptor`). */
export interface CondicionIvaItem {
  id: number;
  desc: string;
  /** Clases de comprobante para las que es válida (ej: "A/M/C") */
  cmpClase?: string;
}

export interface MonedaItem {
  id: string;
  desc: string;
  fchDesde?: string;
  fchHasta?: string;
}

export interface PtoVentaItem {
  nro: number;
  emisionTipo?: string;
  bloqueado?: string;
  fchBaja?: string;
}

/** Cotización de `FEParamGetCotizacion` (`ResultGet`). */
export interface CotizacionResult {
  monId: string;
  monCotiz: number;
  /** Fecha de la cotización (YYYYMMDD) */
  fchCotiz: string;
}

/** Actividad del emisor (`FEParamGetActividades`). */
export interface ActividadItem {
  id: number;
  orden: number;
  desc: string;
}

/** País (`FEParamGetTiposPaises`). */
export interface PaisItem {
  id: number;
  desc: string;
}

// ============================================================
// Eventos / Logging
// ============================================================
// QR
// ============================================================

// Definidos en @ramiidv/arca-common (`generarUrlQR`).
export type { QRInput, QROptions } from '@ramiidv/arca-common';

// ============================================================
// WSFEX - Factura de Exportación
// ============================================================

export interface WsfexItem {
  /** Código del producto */
  proCodigo: string;
  /** Descripción del producto */
  proDs: string;
  /** Cantidad */
  proQty: number;
  /** Unidad de medida (código AFIP) */
  proUmed: number;
  /** Precio unitario */
  proPrecioUni: number;
  /** Bonificación / descuento */
  proBonificacion: number;
  /** Total del item */
  proTotalItem: number;
}

export interface WsfexPermiso {
  /** Número de permiso de embarque */
  idPermiso: string;
  /** País destino de la mercadería */
  dstMerc: number;
}

export interface WsfexCmpAsoc {
  /** Tipo de comprobante asociado */
  cbteTipo: number;
  /** Punto de venta del comprobante asociado */
  cbtePuntoVta: number;
  /** Número del comprobante asociado */
  cbteNro: number;
  /** CUIT del emisor del comprobante asociado */
  cbteCuit: number;
}

export interface WsfexInvoice {
  /**
   * ID único del request (usar getLastId + 1). Ante un corte, reenviar la
   * misma solicitud con el mismo Id: WSFEX responde `Reproceso = "S"` sin duplicar.
   */
  id: number;
  /** Tipo de comprobante (19=Factura E, 20=ND E, 21=NC E) */
  cbteTipo: number;
  /** Fecha del comprobante (YYYYMMDD) */
  fechaCbte: string;
  /** Punto de venta */
  puntoVta: number;
  /** Número de comprobante */
  cbteNro: number;
  /** Tipo de exportación: 1=Bienes, 2=Servicios, 4=Otros */
  tipoExpo: number;
  /**
   * Permiso de embarque existente: "S"/"N" solo para Factura E (19) de bienes
   * (Tipo_expo 1); vacío en los demás casos (validación 1720).
   */
  permisoExistente?: string;
  /** Código de país destino */
  dstCmp: number;
  /** Nombre del cliente */
  cliente: string;
  /**
   * CUIT del país del cliente (`getCuitsPaisExpo`). No es obligatorio si se
   * informa `idImpositivo` (validación 1580: al menos uno de los dos). El WSDL
   * lo declara obligatorio: si falta se envía 0.
   */
  cuitPaisCliente?: number;
  /** Domicilio del cliente */
  domicilioCliente: string;
  /** ID impositivo del cliente extranjero. No es obligatorio si se informa `cuitPaisCliente` (1580). */
  idImpositivo?: string;
  /** Código de moneda */
  monedaId: string;
  /** Cotización de la moneda */
  monedaCtz: number;
  /** Importe total del comprobante */
  impTotal: number;
  /** Observaciones comerciales */
  obsComerciales?: string;
  /** Observaciones */
  obs?: string;
  /** Idioma: 1=Español, 2=Inglés, 3=Portugués */
  idiomaCbte: number;
  /** Forma de pago. Obligatoria en Factura E (19), opcional en NC/ND (validación 1620). */
  formaPago?: string;
  /** Código Incoterms */
  incoterms?: string;
  /** Descripción Incoterms */
  incotermsDs?: string;
  /** Fecha de pago (YYYYMMDD). Solo Factura E (19); obligatoria para servicios/otros (1672, 1673). */
  fechaPago?: string;
  /** Cancela en misma moneda extranjera: "S" o "N" */
  canMisMonExt?: string;
  /** Items del comprobante */
  items: WsfexItem[];
  /** Permisos de embarque */
  permisos?: WsfexPermiso[];
  /** Comprobantes asociados */
  cmpsAsoc?: WsfexCmpAsoc[];
  /** Datos opcionales */
  opcionales?: Opcional[];
  /** Actividades (ver `getActividadesExpo`) */
  actividades?: { id: number }[];
}

/** `FEXEvents` de WSFEX (código 0 = sin eventos). */
export interface WsfexEvents {
  eventCode: number;
  eventMsg: string;
}

export interface WsfexAuthResult {
  fexResultAuth?: {
    id: number;
    cuit: number;
    cbteTipo: number;
    puntoVta: number;
    cbteNro: number;
    cae?: string;
    fchVencCae?: string;
    fchCbte?: string;
    resultado: 'A' | 'R';
    /** "S" si WSFEX encontró la misma solicitud (mismo Id) ya procesada. */
    reproceso?: string;
    motivosObs?: string;
  };
  fexEvents?: WsfexEvents;
}

export interface WsfexLastCmpResult {
  fexResultLastCmp?: {
    cbteNro: number;
    cbteFecha?: string;
  };
  fexEvents?: WsfexEvents;
}

export interface WsfexLastIdResult {
  fexResultGet?: { id: number };
  fexEvents?: WsfexEvents;
}

/** Respuesta de `FEXGetCMP` (campos según el WSDL de WSFEX, `ClsFEXGetCMPR`). */
export interface WsfexGetCmpResult {
  fexResultGet?: {
    id: number;
    fechaCbte?: string;
    cbteTipo: number;
    puntoVta: number;
    cbteNro: number;
    tipoExpo: number;
    permisoExistente?: string;
    permisos?: WsfexPermiso[];
    dstCmp: number;
    cliente?: string;
    cuitPaisCliente: number | string;
    domicilioCliente?: string;
    idImpositivo?: string;
    monedaId?: string;
    monedaCtz: number;
    canMisMonExt?: string;
    obsComerciales?: string;
    impTotal: number;
    obs?: string;
    cmpsAsoc?: WsfexCmpAsoc[];
    formaPago?: string;
    incoterms?: string;
    incotermsDs?: string;
    idiomaCbte: number;
    items?: WsfexItem[];
    /** Fecha de autorización del CAE */
    fechaCbteCae?: string;
    fchVencCae?: string;
    cae?: string;
    resultado?: 'A' | 'R';
    motivosObs?: string;
    opcionales?: Opcional[];
    fechaPago?: string;
    actividades?: { id: number }[];
  };
  fexEvents?: WsfexEvents;
}

/** Cotización de `FEXGetPARAM_Ctz`. */
export interface WsfexCotizacion {
  monCtz: number;
  monFecha?: string;
}

/** Punto de venta de exportación (`FEXGetPARAM_PtoVenta`). */
export interface WsfexPtoVenta {
  pveNro: number;
  pveBloqueado?: string;
  pveFchBaja?: string;
}

/**
 * Item de parámetro WSFEX. Los nombres de campo varían por tabla (ej: `monId`,
 * `cbteId`, `dstCodigo`): son los de ARCA en camelCase.
 */
export type WsfexParamItem = Record<string, string | number>;

// ============================================================
// CAEA - Autorización Anticipada
// ============================================================

/** `ResultGet` de FECAEASolicitar / FECAEAConsultar (`FECAEAGet`). */
export interface CaeaSolicitarResult {
  caea: string;
  /** Período YYYYMM */
  periodo: string;
  /** Quincena: 1 o 2 */
  orden: number;
  fchVigDesde: string;
  fchVigHasta: string;
  fchTopeInf: string;
  fchProceso: string;
  observaciones?: MensajeArca[];
  /** Eventos de ARCA de la respuesta (normalizados). */
  eventos?: MensajeArca[];
}

export interface CaeaRegInfResult {
  feCabResp: FeCabResp;
  feDetResp: FECAEDetResponse[];
  /** `Events` de ARCA: avisos generales. */
  events?: MensajeArca[];
}

export interface CaeaRegInfRequest {
  /** Punto de venta */
  ptoVta: number;
  /** Tipo de comprobante */
  cbteTipo: number;
  /**
   * Detalle de comprobantes con CAEA. `CbteFchHsGen` (yyyymmddhhmmss) es
   * obligatorio desde la RG 5782 (validación 1440).
   */
  invoices: (InvoiceDetail & { caea: string; cbteFchHsGen: string })[];
}

/** Respuesta de FECAEASinMovimientoInformar. */
export interface CaeaSinMovResult {
  caea?: string;
  fchProceso?: string;
  ptoVta?: number;
  resultado: 'A' | 'R';
  /** `Events` de ARCA: avisos generales. */
  events?: MensajeArca[];
}

/** Un informe "sin movimiento" (`FECAEASinMovimientoConsultar`). */
export interface CaeaSinMovItem {
  caea: string;
  fchProceso: string;
  ptoVta: number;
}

// ============================================================
// WSFEX - API Simplificada
// ============================================================

export interface ExpoLineItem {
  /** Código del producto */
  codigo: string;
  /** Descripción */
  descripcion: string;
  /** Cantidad (> 0; 0 con las unidades 0, 97 y 99) */
  cantidad: number;
  /** Unidad de medida (código de `getUMedExpo`) */
  unidad: number;
  /** Precio unitario (>= 0; 0 con las unidades 0, 97 y 99) */
  precioUnitario: number;
  /** Bonificación / descuento. Default: 0 (con las unidades 0, 97 y 99 tiene que ser 0) */
  bonificacion?: number;
  /**
   * Total del item, solo para las unidades 0, 97 (señas/anticipos) y 99
   * (bonificaciones), que van sin cantidad ni precio (validaciones 1775 y
   * 1810): con 97 puede ser negativo, con 99 tiene que ser menor a 0. En el
   * resto de las unidades el total es `cantidad * precioUnitario - bonificacion`.
   */
  total?: number;
}

export interface FacturarExpoOpts {
  /** Punto de venta */
  ptoVta: number;
  /** Tipo de comprobante (CbteTipo.FACTURA_E, NOTA_CREDITO_E, NOTA_DEBITO_E) */
  cbteTipo: number;
  /** Tipo de exportación: 1=Bienes, 2=Servicios, 4=Otros */
  tipoExpo: number;
  /** Código de país destino (usar getPaisesExpo()) */
  pais: number;
  /**
   * Datos del cliente. Hay que informar `cuitPais` (ver `getCuitsPaisExpo`),
   * `idImpositivo` o los dos (validación 1580).
   */
  cliente: {
    nombre: string;
    cuitPais?: number;
    domicilio: string;
    idImpositivo?: string;
  };
  /** Código de moneda */
  moneda: string;
  /** Cotización de la moneda */
  cotizacion: number;
  /** Items del comprobante */
  items: ExpoLineItem[];
  /** Forma de pago. Obligatoria en Factura E (19), opcional en NC/ND (validación 1620). */
  formaPago?: string;
  /** Idioma: 1=Español, 2=Inglés, 3=Portugués. Default: 1 */
  idioma?: number;
  /** Código Incoterms */
  incoterms?: string;
  /** Descripción Incoterms */
  incotermsDes?: string;
  /**
   * Permiso de embarque existente: "S" o "N". Solo aplica a Factura E (19) de
   * bienes (tipoExpo 1), donde el default es "N"; en los demás casos se envía
   * vacío y no se admite (validación 1720).
   */
  permisoExistente?: 'S' | 'N';
  /** Permisos de embarque */
  permisos?: WsfexPermiso[];
  /** Comprobantes asociados (para NC/ND de exportación) */
  cbtesAsoc?: WsfexCmpAsoc[];
  /** Observaciones comerciales */
  obsComerciales?: string;
  /** Observaciones */
  obs?: string;
  /**
   * Fecha del comprobante (Date o string YYYYMMDD / YYYY-MM-DD). Default: hoy
   * (reloj de ARCA). Al reenviar un resultado incierto, usar la misma fecha
   * (`error.intento.fecha`).
   */
  fecha?: Date | string;
  /**
   * Fecha de pago (Date o string YYYYMMDD). Solo Factura E (19): obligatoria
   * para servicios y otros (si falta, se usa la fecha del comprobante); no se
   * admite en NC/ND (validación 1673).
   */
  fechaPago?: Date | string;
  /** Cancela en misma moneda extranjera: "S" o "N" */
  canMisMonExt?: string;
  /** Datos opcionales (ver `getOpcionalesExpo`) */
  opcionales?: Opcional[];
  /** Actividades (ver `getActividadesExpo`) */
  actividades?: number[];
  /**
   * `Id` del request. Default: último Id + 1. Es único por CUIT (no por punto
   * de venta ni tipo): indicarlo solo para reenviar un resultado incierto
   * (`ArcaResultadoInciertoExpo.intento`).
   */
  id?: number;
  /** Número de comprobante. Default: último autorizado + 1. */
  cbteNro?: number;
}

/** Datos para reenviar una factura de exportación con resultado incierto. */
export interface IntentoExpo {
  id: number;
  cbteNro: number;
  /** Fecha del comprobante enviada (YYYYMMDD) */
  fecha: string;
}

export interface FacturaExpoResult {
  /** Si el comprobante fue aprobado */
  aprobada: boolean;
  /** `Id` del request */
  id: number;
  /**
   * `true` si WSFEX ya tenía esta solicitud (mismo `Id`) y devolvió la
   * respuesta original (`Reproceso = "S"`): no se autorizó otro comprobante.
   */
  reproceso: boolean;
  /** Fecha del comprobante (YYYYMMDD) */
  fecha: string;
  /** CAE otorgado */
  cae?: string;
  /** Fecha de vencimiento del CAE */
  caeVencimiento?: string;
  /** Número de comprobante */
  cbteNro: number;
  /** Punto de venta */
  ptoVta: number;
  /** Tipo de comprobante */
  cbteTipo: number;
  /** Observaciones */
  obs?: string;
  /** Eventos de ARCA (`FEXEvents` con código distinto de 0) */
  eventos: MensajeArca[];
  /** Resultado crudo */
  raw: WsfexAuthResult;
}

// ============================================================
// API Simplificada - Tipos de entrada
// ============================================================

interface LineItemBase {
  /**
   * Tipo de alícuota IVA (usar enum IvaTipo).
   * Si no se especifica y exento=false, el item se trata como no gravado (ImpTotConc).
   */
  iva?: number;
  /** Si true, el importe es exento de IVA (va a ImpOpEx) */
  exento?: boolean;
}

/** Item con importe neto (sin IVA). El IVA se calcula sobre el neto. */
export interface LineItemNeto extends LineItemBase {
  /** Importe neto (sin IVA) */
  neto: number;
  total?: undefined;
}

/**
 * Item con precio final (IVA incluido), típico de un punto de venta.
 * El neto y el IVA se despejan del total. En exentos y no gravados, total = neto.
 */
export interface LineItemTotal extends LineItemBase {
  /** Precio final con IVA incluido */
  total: number;
  neto?: undefined;
}

/** Un item lleva `neto` (sin IVA) o `total` (IVA incluido), nunca ambos. */
export type LineItem = LineItemNeto | LineItemTotal;

export interface FacturarOpts {
  /** Punto de venta */
  ptoVta: number;
  /** Tipo de comprobante (usar enum CbteTipo) */
  cbteTipo: number;
  /**
   * Número de comprobante a emitir. Si se indica, no se consulta
   * `ultimoComprobante` y reintentar con el mismo número es seguro (ARCA
   * rechaza un número ya usado: nunca se duplica un comprobante).
   *
   * Sin `cbteNro`, el SDK usa último + 1 y no hay lock: el caller es
   * responsable de serializar las emisiones por (ptoVta, cbteTipo).
   */
  cbteNro?: number;
  /** Items de la factura: cada uno con `neto` (sin IVA) o `total` (IVA incluido) */
  items: LineItem[];
  /**
   * Descuento global, como monto final (IVA incluido). Se prorratea entre las
   * alícuotas, exento y no gravado en proporción a su total. No afecta tributos.
   */
  descuentoGlobal?: number;
  /**
   * Concepto. Default: PRODUCTOS, o SERVICIOS si se provee `servicio`.
   * Servicios (2) y Productos y Servicios (3) exigen `servicio`; Productos (1) no lo admite.
   */
  concepto?: number;
  /** Tipo de documento del receptor (usar enum DocTipo). Default: CONSUMIDOR_FINAL */
  docTipo?: number;
  /** Número de documento del receptor. Default: 0 */
  docNro?: number;
  /** Fecha del comprobante (Date o string YYYYMMDD / YYYY-MM-DD). Default: hoy (timezone Argentina) */
  fecha?: Date | string;
  /**
   * Para servicios (concepto 2 o 3): fechas del período y vencimiento de pago
   * (`vtoPago` aquí o en `FacturarOpts.vtoPago`, obligatorio para servicios:
   * validación 10049).
   */
  servicio?: {
    desde: Date | string;
    hasta: Date | string;
    vtoPago?: Date | string;
  };
  /**
   * Fecha de vencimiento del pago (`FchVtoPago`), independiente del concepto.
   * Obligatoria en las facturas FCE MiPyME (201, 206, 211), también con
   * concepto 1 (validación 10163). En notas de crédito/débito FCE con concepto
   * 1 solo se admite si son de anulación (opcional 22 = "S", validación
   * 10175). Para servicios puede ir acá o en `servicio.vtoPago`.
   */
  vtoPago?: Date | string;
  /** Código de moneda (usar enum Moneda). Default: PES */
  moneda?: string;
  /**
   * Cotización de la moneda (> 0). Con PES debe ser 1 (default). Con moneda
   * extranjera es obligatoria salvo `canMisMonExt: "S"` (ARCA usa la oficial).
   */
  cotizacion?: number;
  /** Tributos adicionales (Importe y BaseImp >= 0, se redondean a 2 decimales) */
  tributos?: Tributo[];
  /** Datos opcionales (ej: CBU para FCE) */
  opcionales?: Opcional[];
  /**
   * Condición de IVA del receptor (usar enum CondicionIva). Obligatoria si el
   * receptor está identificado (docTipo distinto de 99): no se infiere del tipo
   * de documento porque un CUIT puede ser RI, monotributista o exento. Para
   * consumidor final sin identificar (docTipo 99) el default es CONSUMIDOR_FINAL (5).
   */
  condicionIva?: number;
  /**
   * Cancela en la misma moneda extranjera: "S" o "N" (opcional). "S" solo con
   * moneda extranjera (validación 10241).
   */
  canMisMonExt?: 'S' | 'N';
  /** Comprobantes asociados (para NC/ND, o para asociar otros comprobantes). */
  cbtesAsoc?: ComprobanteRef[];
  /**
   * Período asociado (`PeriodoAsoc`), solo para notas de crédito/débito (no
   * FCE): alternativa a asociar comprobantes (validaciones 10196-10198).
   */
  periodoAsoc?: { desde: Date | string; hasta: Date | string };
  /** Actividades del emisor asociadas al comprobante (ver `getActividades`). */
  actividades?: number[];
  /**
   * Compradores, para comprobantes con varios receptores (validaciones
   * 10135-10148): al menos 2, porcentajes que suman 100, y el receptor del
   * comprobante tiene que ser el de mayor porcentaje.
   */
  compradores?: Comprador[];
}

/** Opciones de `registrarFacturaCAEA`: las de `facturar` más la fecha y hora de generación. */
export interface FacturarCAEAOpts extends FacturarOpts {
  /**
   * Fecha y hora en que se generó el comprobante en contingencia
   * (`CbteFchHsGen`, obligatorio desde la RG 5782). `Date` (se toma la hora de
   * Argentina) o string `yyyymmddhhmmss`.
   */
  fechaHoraGeneracion: Date | string;
  /** Fecha del comprobante. Default: la fecha de `fechaHoraGeneracion`. */
  fecha?: Date | string;
}

export interface ComprobanteRef {
  /** Tipo del comprobante original (usar enum CbteTipo) */
  tipo: number;
  /** Punto de venta del comprobante original */
  ptoVta: number;
  /** Número del comprobante original */
  nro: number;
  /** CUIT del emisor (requerido para FCE). Se valida el dígito verificador. */
  cuit?: number | string;
  /** Fecha del comprobante original (Date o string YYYYMMDD) */
  fecha?: Date | string;
}

export interface NotaCreditoOpts extends Omit<FacturarOpts, 'cbteTipo'> {
  /** Comprobante original al que se asocia la nota de crédito.
   * El tipo de NC se infiere automáticamente del tipo del comprobante original. */
  comprobanteOriginal: ComprobanteRef;
}

export interface NotaDebitoOpts extends Omit<FacturarOpts, 'cbteTipo'> {
  /** Comprobante original al que se asocia la nota de débito.
   * El tipo de ND se infiere automáticamente del tipo del comprobante original. */
  comprobanteOriginal: ComprobanteRef;
}

// ============================================================
// API Simplificada - Tipos de salida
// ============================================================

export interface Importes {
  total: number;
  neto: number;
  iva: number;
  exento: number;
  noGravado: number;
  tributos: number;
  /** Descuento global aplicado (IVA incluido). No disponible en comprobantes recuperados. */
  descuento?: number;
}

export interface FacturaResult {
  /** Si el comprobante fue aprobado por ARCA */
  aprobada: boolean;
  /** CAE otorgado (solo si aprobada) */
  cae?: string;
  /** Fecha de vencimiento del CAE en formato YYYYMMDD */
  caeVencimiento?: string;
  /** Número de comprobante asignado */
  cbteNro: number;
  /** Punto de venta */
  ptoVta: number;
  /** Tipo de comprobante */
  cbteTipo: number;
  /** Importes calculados y enviados */
  importes: Importes;
  /** Observaciones de ARCA (pueden existir incluso si fue aprobada) */
  observaciones: MensajeArca[];
  /** Eventos de ARCA (`Events`): avisos generales, no afectan el resultado */
  eventos: MensajeArca[];
  /** Fecha del comprobante (YYYYMMDD) */
  fecha?: string;
  /** Tipo de documento del receptor */
  docTipo?: number;
  /** Número de documento del receptor */
  docNro?: number;
  /** Moneda del comprobante (si se conoce) */
  moneda?: string;
  /** Cotización enviada (si se conoce) */
  cotizacion?: number;
  /** "E" si se autorizó con CAE, "A" si se informó con CAEA (para el QR) */
  tipoCodAut?: 'E' | 'A';
  /** Resultado crudo: FECAESolicitar, o FECompConsultar si se obtuvo con `recuperarComprobante` */
  raw: FECAESolicitarResult | FECompConsultarResult;
}

/**
 * Datos de un intento de emisión: alcanzan para saber, después, si ARCA lo
 * autorizó (`recuperarComprobante`). Es JSON puro: se puede persistir antes de
 * enviar el comprobante.
 */
export interface IntentoComprobante {
  ptoVta: number;
  cbteTipo: number;
  cbteNro: number;
  importeTotal: number;
  docTipo: number;
  docNro: number;
  /** Fecha del comprobante (YYYYMMDD) */
  fecha: string;
}

export type ResultadoRecuperacion =
  /** ARCA autorizó el comprobante con los mismos datos del intento. */
  | { estado: 'autorizado'; resultado: FacturaResult }
  /** ARCA no tiene ese número: reintentar con el mismo `cbteNro` es seguro. */
  | { estado: 'no_emitido' }
  /** El número existe pero con otros datos (lo usó otra emisión). */
  | { estado: 'conflicto'; encontrado: FECompConsultarResult };

export interface ComprobanteArmado {
  /** Detalle listo para enviar a FECAESolicitar */
  request: InvoiceDetail;
  /** Importes calculados */
  importes: Importes;
  /** Datos para recuperar el comprobante si el resultado es incierto. Persistilo antes de enviar. */
  intento: IntentoComprobante;
}
