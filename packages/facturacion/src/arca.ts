import { ArcaRechazoError, ArcaResponseError, ArcaSdkBase, formatDate, statusOf } from '@ramiidv/arca-common';
import type { CallOptions, ServiceStatus } from '@ramiidv/arca-common';
import { WsfeClient } from './wsfe.js';
import { WsfexClient } from './wsfex.js';
import {
  armarComprobante,
  buildInvoiceDetail,
  coincidenDatos,
  facturaResultDesdeConsulta,
  intentoDesdeComprobante,
  optString,
  parseFacturaResult,
  formatFechaHora,
  redondear2,
  totalesDe,
} from './facturacion.js';
import { eventosWsfex } from './wsfex.js';
import { ArcaConflictoExpo, ArcaResultadoIncierto, ArcaResultadoInciertoExpo } from './errors.js';
import type { OperacionEmision } from './errors.js';
import { fail, validateFacturarOpts, validateFacturarExpoOpts, validateInvoiceRequest } from './validation.js';
import type {
  ArcaConfig,
  WsfeAuth,
  InvoiceRequest,
  InvoiceDetail,
  FECAESolicitarResult,
  FECompConsultarResult,
  ParamItem,
  MonedaItem,
  PtoVentaItem,
  CotizacionResult,
  CondicionIvaItem,
  ActividadItem,
  PaisItem,
  FacturarOpts,
  NotaCreditoOpts,
  NotaDebitoOpts,
  FacturaResult,
  QRInput,
  WsfexInvoice,
  WsfexAuthResult,
  WsfexGetCmpResult,
  WsfexParamItem,
  WsfexCotizacion,
  WsfexPtoVenta,
  FacturarExpoOpts,
  FacturaExpoResult,
  CaeaSolicitarResult,
  CaeaRegInfRequest,
  CaeaRegInfResult,
  CaeaSinMovResult,
  CaeaSinMovItem,
  ComprobanteArmado,
  ComprobanteRef,
  IntentoComprobante,
  ResultadoRecuperacion,
  QROptions,
  FacturarCAEAOpts,
  Importes,
} from './types.js';
import { generarUrlQR, urlQRDesdeFactura } from './qr.js';
import type { DatosQR } from './qr.js';
import {
  CbteTipo,
  ENDPOINTS,
  NOTA_CREDITO_MAP,
  NOTA_DEBITO_MAP,
  TipoExpo,
  WSAA_SERVICES,
  isTipoE,
  isUmedSinCantidad,
} from './constants.js';

/** TTL por defecto del cache de parámetros (24 horas). */
const DEFAULT_PARAM_CACHE_TTL_MS = 24 * 60 * 60_000;

/** Servicios de WSAA que usa `ArcaFacturacion` (nombre corto → id de WSAA). */
type ArcaService = keyof typeof WSAA_SERVICES;

/**
 * Cliente principal: WSFEv1 (facturación, CAEA) y WSFEX (exportación).
 *
 * Hereda de `ArcaSdkBase` de arca-common: `wsaa`, `cuit` (string de 11
 * dígitos), `production`, `on`/`off` y `clearAuthCache`.
 */
export class ArcaFacturacion extends ArcaSdkBase<ArcaService> {
  private readonly wsfe: WsfeClient;
  private readonly wsfex: WsfexClient;
  /** CUIT como número, como se envía en `Auth.Cuit` y en el QR. */
  private readonly cuitNum: number;
  private readonly paramCache = new Map<string, { data: Promise<unknown>; expires: number }>();
  private readonly paramCacheTTLMs: number;

  /**
   * @throws ArcaValidationError si el CUIT no es válido (dígito verificador).
   */
  constructor(config: ArcaConfig) {
    // Los defaults (timeout 30s, 1 reintento, 1s de backoff, TTL 12h) los aplica arca-common.
    super(config, WSAA_SERVICES);
    this.cuitNum = Number(this.cuit);
    this.paramCacheTTLMs = config.paramCacheTTLMs ?? DEFAULT_PARAM_CACHE_TTL_MS;

    const endpoints = config.endpoints ?? {};
    const transport = this.transport;
    this.wsfe = new WsfeClient({ endpoint: this.endpoint(ENDPOINTS.wsfe, endpoints.wsfe), transport });
    this.wsfex = new WsfexClient({ endpoint: this.endpoint(ENDPOINTS.wsfex, endpoints.wsfex), transport });
  }

  // ============================================================
  // Auth helpers
  // ============================================================

  /**
   * Combina el signal global de la config con el de la llamada. Sólo pasa el
   * `signal`: las opciones propias de cada método (`fecha`, `claseCmp`) no
   * llegan a los clientes de bajo nivel.
   */
  private opts(call?: CallOptions): CallOptions {
    return this.callOptions({ signal: call?.signal });
  }

  private async getAuth(service: ArcaService, call?: CallOptions): Promise<WsfeAuth> {
    const ticket = await this.ticket(service, call);
    return {
      token: ticket.token,
      sign: ticket.sign,
      cuit: this.cuitNum,
    };
  }

  // ============================================================
  // Facturación - Métodos principales (raw)
  // ============================================================

  /**
   * Solicita CAE para uno o más comprobantes (API raw).
   *
   * Devuelve la respuesta de ARCA tal cual, con el `resultado` de cada
   * comprobante ("A", "R", o "P" en la cabecera si el lote se aprobó en
   * parte): un comprobante rechazado **no** lanza `ArcaRechazoError`.
   *
   * No se reintenta. Si el resultado es incierto lanza `ArcaResultadoIncierto`;
   * si ARCA rechaza el request (`Errors`), `ArcaWSFEError`.
   */
  async crearFactura(request: InvoiceRequest, call?: CallOptions): Promise<FECAESolicitarResult> {
    validateInvoiceRequest(request);
    const opts = this.opts(call);
    const auth = await this.getAuth('wsfe', opts);
    return this.wsfe.solicitarCAE(auth, request, opts);
  }

  /** Último número de comprobante autorizado. */
  async ultimoComprobante(ptoVta: number, cbteTipo: number, call?: CallOptions): Promise<number> {
    const opts = this.opts(call);
    const auth = await this.getAuth('wsfe', opts);
    return this.wsfe.ultimoComprobante(auth, ptoVta, cbteTipo, opts);
  }

  /** Siguiente número de comprobante (último + 1). */
  async siguienteComprobante(ptoVta: number, cbteTipo: number, call?: CallOptions): Promise<number> {
    const ultimo = await this.ultimoComprobante(ptoVta, cbteTipo, call);
    return ultimo + 1;
  }

  /** Crea factura obteniendo el número automáticamente (API raw). */
  async crearFacturaAuto(
    ptoVta: number,
    cbteTipo: number,
    invoice: Omit<InvoiceDetail, 'cbteDesde' | 'cbteHasta'>,
    call?: CallOptions,
  ): Promise<FECAESolicitarResult> {
    const nextNum = await this.siguienteComprobante(ptoVta, cbteTipo, call);
    return this.crearFactura(
      {
        ptoVta: ptoVta,
        cbteTipo: cbteTipo,
        invoices: [{ ...invoice, cbteDesde: nextNum, cbteHasta: nextNum }],
      },
      call,
    );
  }

  // ============================================================
  // Facturación - API Simplificada
  // ============================================================

  /**
   * Valida y arma un comprobante sin enviarlo (no usa la red). Si `fecha` no
   * viene, usa la fecha de hoy según el reloj de ARCA (`clockOffsetMs`).
   *
   * Persistí el `intento` antes de enviar: si el proceso se cae o el resultado
   * es incierto, pasalo a `recuperarComprobante`.
   */
  armarComprobante(opts: FacturarOpts & { cbteNro: number }): ComprobanteArmado {
    return armarComprobante(opts, { ahora: this.wsaa.now() });
  }

  /**
   * Crea una factura con API simplificada.
   * Calcula automáticamente IVA y totales. Si no viene `cbteNro`, usa el
   * último autorizado + 1 (sin lock: serializá las emisiones por ptoVta y cbteTipo).
   *
   * Devuelve siempre un comprobante autorizado (con `cae`). Si no:
   *
   * - `ArcaRechazoError`: ARCA rechazó el comprobante (`Resultado` "R", no se
   *   emitió); los motivos están en `observaciones`. Si `requiereRecuperacion(error)`,
   *   el número ya se usó: resolver con `recuperarComprobante`.
   * - `ArcaWSFEError`: ARCA rechazó el request (`Errors`, no se emitió).
   * - `ArcaAuthError`: ARCA rechazó el ticket (errores 600 y 601).
   * - `ArcaResultadoIncierto`: no se sabe si se emitió; usar `recuperarComprobante(error.intento)`.
   */
  async facturar(opts: FacturarOpts, call?: CallOptions): Promise<FacturaResult> {
    return this.emitirComprobante(opts, call);
  }

  /**
   * Crea una nota de crédito. Tipo de NC inferido del comprobante original.
   * Mismos errores que `facturar` (un rechazo lanza `ArcaRechazoError`).
   */
  async notaCredito(opts: NotaCreditoOpts, call?: CallOptions): Promise<FacturaResult> {
    this.rechazarClaseE(opts, 'Crédito');
    const cbteTipo = NOTA_CREDITO_MAP[opts.comprobanteOriginal?.tipo];
    if (cbteTipo === undefined) {
      fail(
        'comprobanteOriginal.tipo',
        `No se puede inferir el tipo de Nota de Crédito para CbteTipo ${opts.comprobanteOriginal?.tipo}: ` +
          'no es un comprobante que una Nota de Crédito de WSFEv1 pueda asociar (validaciones 10040, 10157 y 10183)',
        opts.comprobanteOriginal?.tipo,
      );
    }
    return this.emitirComprobante(this.conAsociado(cbteTipo, opts), call);
  }

  /**
   * Crea una nota de débito. Tipo de ND inferido del comprobante original.
   * Mismos errores que `facturar` (un rechazo lanza `ArcaRechazoError`).
   */
  async notaDebito(opts: NotaDebitoOpts, call?: CallOptions): Promise<FacturaResult> {
    this.rechazarClaseE(opts, 'Débito');
    const cbteTipo = NOTA_DEBITO_MAP[opts.comprobanteOriginal?.tipo];
    if (cbteTipo === undefined) {
      fail(
        'comprobanteOriginal.tipo',
        `No se puede inferir el tipo de Nota de Débito para CbteTipo ${opts.comprobanteOriginal?.tipo}: ` +
          'no es un comprobante que una Nota de Débito de WSFEv1 pueda asociar (validaciones 10040, 10157 y 10183)',
        opts.comprobanteOriginal?.tipo,
      );
    }
    return this.emitirComprobante(this.conAsociado(cbteTipo, opts), call);
  }

  /** Las NC/ND de exportación (clase E) van por WSFEX, no por WSFEv1. */
  private rechazarClaseE(opts: NotaCreditoOpts | NotaDebitoOpts, clase: 'Crédito' | 'Débito'): void {
    const tipo = opts.comprobanteOriginal?.tipo;
    if (tipo !== undefined && isTipoE(tipo)) {
      const destino = clase === 'Crédito' ? CbteTipo.NOTA_CREDITO_E : CbteTipo.NOTA_DEBITO_E;
      fail(
        'comprobanteOriginal.tipo',
        `las Notas de ${clase} de exportación (tipo ${destino}) se emiten por WSFEX: usar ` +
          `facturarExpo({ cbteTipo: ${destino}, cbtesAsoc: [...] })`,
        tipo,
      );
    }
  }

  private conAsociado(cbteTipo: number, opts: NotaCreditoOpts | NotaDebitoOpts): FacturarOpts {
    const { comprobanteOriginal, ...rest } = opts;
    const asociados: ComprobanteRef[] = [comprobanteOriginal, ...(opts.cbtesAsoc ?? [])];
    return { ...rest, cbteTipo, cbtesAsoc: asociados };
  }

  private async emitirComprobante(opts: FacturarOpts, call?: CallOptions): Promise<FacturaResult> {
    const { detail, importes } = await this.prepararComprobante(opts, call);
    const result = await this.crearFactura({ ptoVta: opts.ptoVta, cbteTipo: opts.cbteTipo, invoices: [detail] }, call);
    return this.resultadoEmision('FECAESolicitar', result, opts, detail, importes);
  }

  /**
   * `FacturaResult` de una emisión simplificada (un comprobante). Un rechazo
   * lanza `ArcaRechazoError`; una respuesta que no permite saber si se emitió
   * (sin el comprobante, con otro `Resultado` o aprobada sin CAE),
   * `ArcaResultadoIncierto`.
   */
  private resultadoEmision(
    operacion: OperacionEmision,
    result: FECAESolicitarResult | CaeaRegInfResult,
    opts: { ptoVta: number; cbteTipo: number },
    detail: InvoiceDetail & { caea?: string },
    importes: Importes,
  ): FacturaResult {
    try {
      return parseFacturaResult(result, importes, {
        operacion,
        moneda: detail.monId,
        cotizacion: detail.monCotiz,
        caea: detail.caea,
      });
    } catch (err) {
      if (err instanceof ArcaResponseError) {
        throw new ArcaResultadoIncierto(operacion, [intentoDesdeComprobante(opts.ptoVta, opts.cbteTipo, detail)], {
          cause: err,
        });
      }
      throw err;
    }
  }

  /**
   * Valida (antes de tocar la red), resuelve el número y arma el detalle.
   * Los importes se calculan antes de consultar el último comprobante, así un
   * descuento inválido no gasta una consulta.
   */
  private async prepararComprobante(opts: FacturarOpts, call?: CallOptions, ahora: Date = this.wsaa.now()) {
    validateFacturarOpts(opts, { cuitEmisor: this.cuitNum, ahora });
    const totales = totalesDe(opts);
    const cbteNro = opts.cbteNro ?? (await this.siguienteComprobante(opts.ptoVta, opts.cbteTipo, call));
    return buildInvoiceDetail(opts, cbteNro, ahora, totales);
  }

  /**
   * Resuelve un resultado incierto (`ArcaResultadoIncierto`) consultando ARCA.
   *
   * - Si el último autorizado es menor que `cbteNro` → `no_emitido`: reintentar
   *   con el mismo `cbteNro` es seguro (si el intento original llegara a
   *   autorizarse después, ARCA rechaza el reintento con el error 10016).
   * - Si no, consulta el comprobante y compara ImpTotal (tolerancia 0,01),
   *   DocTipo, DocNro y CbteFch: si coinciden → `autorizado` con el CAE; si no
   *   → `conflicto` (ese número lo usó otra emisión).
   * - Si coinciden pero ARCA lo informa rechazado (`Resultado` "R"), lanza
   *   `ArcaRechazoError` (`operacion: "FECompConsultar"`), como la emisión: el
   *   comprobante del intento no está autorizado. No debería pasar (el último
   *   autorizado ya incluye ese número), pero no se informa como `autorizado`
   *   ni como `no_emitido` (reintentar con ese número no es seguro).
   * - Si coinciden pero la consulta trae otro `Resultado` o no trae el
   *   `CodAutorizacion`, lanza `ArcaResponseError`.
   *
   * Tip: si la respuesta se perdió por timeout, esperar unos segundos antes de
   * llamar: ARCA puede seguir procesando el request original.
   */
  async recuperarComprobante(intento: IntentoComprobante, call?: CallOptions): Promise<ResultadoRecuperacion> {
    const ultimo = await this.ultimoComprobante(intento.ptoVta, intento.cbteTipo, call);
    if (ultimo < intento.cbteNro) return { estado: 'no_emitido' };

    const encontrado = await this.consultarComprobante(intento.cbteTipo, intento.ptoVta, intento.cbteNro, call);
    if (!coincidenDatos(encontrado, intento)) return { estado: 'conflicto', encontrado };
    // Lanza ArcaRechazoError si ARCA lo informa rechazado.
    return { estado: 'autorizado', resultado: facturaResultDesdeConsulta(encontrado) };
  }

  /** Consulta un comprobante previamente autorizado. */
  async consultarComprobante(
    cbteTipo: number,
    ptoVta: number,
    cbteNro: number,
    call?: CallOptions,
  ): Promise<FECompConsultarResult> {
    const opts = this.opts(call);
    const auth = await this.getAuth('wsfe', opts);
    return this.wsfe.consultarComprobante(auth, cbteTipo, ptoVta, cbteNro, opts);
  }

  // ============================================================
  // WSFEX - Facturación de Exportación
  // ============================================================

  /**
   * Autoriza un comprobante de exportación (WSFEX, API raw). No se reintenta.
   * Devuelve la respuesta de WSFEX tal cual: un `Resultado` "R" **no** lanza
   * `ArcaRechazoError` (sí `facturarExpo`).
   *
   * - `ArcaResultadoInciertoExpo`: no se sabe si se autorizó. Reenviar el mismo
   *   request con el mismo `Id` (`crearFacturaExportacion(error.request)`):
   *   WSFEX devuelve `Reproceso = "S"` si ya estaba autorizado.
   * - `ArcaConflictoExpo`: el `Id` (único por CUIT) ya lo usaba otro
   *   comprobante; WSFEX devolvió la respuesta de ese otro comprobante.
   * - `ArcaWSFEError`: WSFEX rechazó el request.
   */
  async crearFacturaExportacion(invoice: WsfexInvoice, call?: CallOptions): Promise<WsfexAuthResult> {
    const callOpts = this.opts(call);
    const auth = await this.getAuth('wsfex', callOpts);
    return this.wsfex.authorize(auth, invoice, callOpts);
  }

  /** Último número de comprobante de exportación autorizado. */
  async ultimoComprobanteExpo(ptoVta: number, cbteTipo: number, call?: CallOptions): Promise<number> {
    const callOpts = this.opts(call);
    const auth = await this.getAuth('wsfex', callOpts);
    return this.wsfex.getLastCmp(auth, ptoVta, cbteTipo, callOpts);
  }

  /** Siguiente número de comprobante de exportación. */
  async siguienteComprobanteExpo(ptoVta: number, cbteTipo: number, call?: CallOptions): Promise<number> {
    const ultimo = await this.ultimoComprobanteExpo(ptoVta, cbteTipo, call);
    return ultimo + 1;
  }

  /** Último ID de request WSFEX. */
  async ultimoIdExpo(call?: CallOptions): Promise<number> {
    const callOpts = this.opts(call);
    const auth = await this.getAuth('wsfex', callOpts);
    return this.wsfex.getLastId(auth, callOpts);
  }

  /** Consulta un comprobante de exportación. */
  async consultarComprobanteExpo(
    cbteTipo: number,
    ptoVta: number,
    cbteNro: number,
    call?: CallOptions,
  ): Promise<WsfexGetCmpResult> {
    const callOpts = this.opts(call);
    const auth = await this.getAuth('wsfex', callOpts);
    return this.wsfex.getCmp(auth, cbteTipo, ptoVta, cbteNro, callOpts);
  }

  private async expo<T>(fn: (auth: WsfeAuth, opts: CallOptions) => Promise<T>, call?: CallOptions): Promise<T> {
    const callOpts = this.opts(call);
    const auth = await this.getAuth('wsfex', callOpts);
    return fn(auth, callOpts);
  }

  /** Tipos de comprobante de exportación. */
  async getTiposCbteExpo(call?: CallOptions): Promise<WsfexParamItem[]> {
    return this.expo((a, o) => this.wsfex.getTiposCbte(a, o), call);
  }

  /** Monedas (WSFEX). */
  async getMonedasExpo(call?: CallOptions): Promise<WsfexParamItem[]> {
    return this.expo((a, o) => this.wsfex.getMonedas(a, o), call);
  }

  /** Monedas con su cotización (`FEXGetPARAM_MON_CON_COTIZACION`). `fecha`: fecha de la cotización (opcional). */
  async getMonedasConCotizacionExpo(call?: CallOptions & { fecha?: Date | string }): Promise<WsfexParamItem[]> {
    const fecha = call?.fecha !== undefined ? formatDate(call.fecha) : undefined;
    return this.expo((a, o) => this.wsfex.getMonedasConCotizacion(a, { ...o, fechaCtz: fecha }), call);
  }

  /** Cotización de una moneda en WSFEX (`FEXGetPARAM_Ctz`). `fecha`: fecha de la cotización (opcional). */
  async getCotizacionExpo(monedaId: string, call?: CallOptions & { fecha?: Date | string }): Promise<WsfexCotizacion> {
    const fecha = call?.fecha !== undefined ? formatDate(call.fecha) : undefined;
    return this.expo((a, o) => this.wsfex.getCotizacion(a, monedaId, { ...o, fchCotiz: fecha }), call);
  }

  /** Verifica un permiso de embarque (`FEXCheck_Permiso`). Devuelve el `Status` de ARCA. */
  async checkPermisoExpo(idPermiso: string, dstMerc: number, call?: CallOptions): Promise<string> {
    return this.expo((a, o) => this.wsfex.checkPermiso(a, idPermiso, dstMerc, o), call);
  }

  /** Países destino de exportación. */
  async getPaisesExpo(call?: CallOptions): Promise<WsfexParamItem[]> {
    return this.expo((a, o) => this.wsfex.getPaises(a, o), call);
  }

  /** Idiomas disponibles (WSFEX). */
  async getIdiomasExpo(call?: CallOptions): Promise<WsfexParamItem[]> {
    return this.expo((a, o) => this.wsfex.getIdiomas(a, o), call);
  }

  /** Incoterms disponibles. */
  async getIncotermsExpo(call?: CallOptions): Promise<WsfexParamItem[]> {
    return this.expo((a, o) => this.wsfex.getIncoterms(a, o), call);
  }

  /** Unidades de medida (WSFEX). */
  async getUMedExpo(call?: CallOptions): Promise<WsfexParamItem[]> {
    return this.expo((a, o) => this.wsfex.getUMed(a, o), call);
  }

  /** Tipos de exportación. */
  async getTiposExpo(call?: CallOptions): Promise<WsfexParamItem[]> {
    return this.expo((a, o) => this.wsfex.getTiposExpo(a, o), call);
  }

  /** CUITs de países. */
  async getCuitsPaisExpo(call?: CallOptions): Promise<WsfexParamItem[]> {
    return this.expo((a, o) => this.wsfex.getCuitsPais(a, o), call);
  }

  /** Puntos de venta habilitados para exportación (`FEXGetPARAM_PtoVenta`). No se cachea. */
  async getPuntosVentaExpo(call?: CallOptions): Promise<WsfexPtoVenta[]> {
    return this.expo((a, o) => this.wsfex.getPuntosVenta(a, o), call);
  }

  /** Tipos de datos opcionales de exportación (`FEXGetPARAM_Opcionales`). */
  async getOpcionalesExpo(call?: CallOptions): Promise<WsfexParamItem[]> {
    return this.expo((a, o) => this.wsfex.getOpcionales(a, o), call);
  }

  /** Actividades del emisor para exportación (`FEXGetPARAM_Actividades`). */
  async getActividadesExpo(call?: CallOptions): Promise<WsfexParamItem[]> {
    return this.expo((a, o) => this.wsfex.getActividades(a, o), call);
  }

  /**
   * Crea un comprobante de exportación (Factura, NC o ND E) con API simplificada.
   * Si no vienen `id` y `cbteNro`, usa último + 1 sin lock. El `Id` es único
   * **por CUIT** (manual WSFEX, "Manejo transaccional"): serializá todas las
   * emisiones de exportación de la CUIT, no solo las del mismo punto de venta.
   *
   * - `ArcaResultadoInciertoExpo`: no se sabe si se autorizó. Reenviar con
   *   `facturarExpo({ ...opts, ...error.intento })` (mismo `id`, `cbteNro` y
   *   `fecha`): WSFEX responde `reproceso: true` si ya estaba autorizado.
   * - `ArcaConflictoExpo`: el `Id` ya lo usaba otra solicitud (emisiones
   *   concurrentes): este comprobante no se autorizó; reintentar sin `id`.
   * - `ArcaRechazoError` (`operacion: "FEXAuthorize"`): WSFEX rechazó el
   *   comprobante (`Resultado` "R", no se autorizó); `Motivos_Obs` queda en
   *   `observaciones`.
   * - `ArcaWSFEError`: WSFEX rechazó el request (`FEXErr`).
   *
   * Devuelve siempre un comprobante autorizado (con `cae`).
   */
  async facturarExpo(opts: FacturarExpoOpts, call?: CallOptions): Promise<FacturaExpoResult> {
    validateFacturarExpoOpts(opts);
    const callOpts = this.opts(call);
    const auth = await this.getAuth('wsfex', callOpts);
    const [id, cbteNro] = await Promise.all([
      opts.id ?? this.wsfex.getLastId(auth, callOpts).then((n) => n + 1),
      opts.cbteNro ?? this.wsfex.getLastCmp(auth, opts.ptoVta, opts.cbteTipo, callOpts).then((n) => n + 1),
    ]);

    const fecha = formatDate(opts.fecha ?? this.wsaa.now());

    let totalCents = 0;
    const items = opts.items.map((item) => {
      // Unidades 0, 97 y 99 (señas, bonificaciones): sin cantidad ni precio, con el total explícito (1775, 1810).
      const totalItem = isUmedSinCantidad(item.unidad)
        ? redondear2(item.total ?? 0)
        : redondear2(item.cantidad * item.precioUnitario - (item.bonificacion ?? 0));
      totalCents += Math.round(totalItem * 100);
      return {
        proCodigo: item.codigo,
        proDs: item.descripcion,
        proQty: item.cantidad,
        proUmed: item.unidad,
        proPrecioUni: item.precioUnitario,
        proBonificacion: item.bonificacion ?? 0,
        proTotalItem: totalItem,
      };
    });
    if (totalCents < 0) fail('items', 'el total de los items no puede ser negativo (validación 1610)');

    // Permiso_existente: "S"/"N" solo para Factura E (19) de bienes; vacío en el resto
    // (tabla de validación 1720 del manual de WSFEX).
    const esFactura = opts.cbteTipo === CbteTipo.FACTURA_E;
    const esFacturaBienes = esFactura && opts.tipoExpo === TipoExpo.BIENES;
    const esServicios = opts.tipoExpo === TipoExpo.SERVICIOS || opts.tipoExpo === TipoExpo.OTROS;

    const invoice: WsfexInvoice = {
      id: id,
      cbteTipo: opts.cbteTipo,
      fechaCbte: fecha,
      puntoVta: opts.ptoVta,
      cbteNro: cbteNro,
      tipoExpo: opts.tipoExpo,
      permisoExistente: esFacturaBienes ? (opts.permisoExistente ?? 'N') : '',
      dstCmp: opts.pais,
      cliente: opts.cliente.nombre,
      cuitPaisCliente: opts.cliente.cuitPais,
      domicilioCliente: opts.cliente.domicilio,
      idImpositivo: opts.cliente.idImpositivo,
      monedaId: opts.moneda,
      monedaCtz: opts.cotizacion,
      idiomaCbte: opts.idioma ?? 1,
      impTotal: totalCents / 100,
      items: items,
    };

    // Fecha_pago: solo Factura E (1673); obligatoria para servicios y otros (1672).
    if (esFactura) {
      if (opts.fechaPago !== undefined) invoice.fechaPago = formatDate(opts.fechaPago);
      else if (esServicios) invoice.fechaPago = fecha;
    }

    if (opts.formaPago) invoice.formaPago = opts.formaPago;
    if (opts.incoterms) invoice.incoterms = opts.incoterms;
    if (opts.incotermsDes) invoice.incotermsDs = opts.incotermsDes;
    if (opts.obsComerciales) invoice.obsComerciales = opts.obsComerciales;
    if (opts.obs) invoice.obs = opts.obs;
    if (opts.permisos?.length) invoice.permisos = opts.permisos;
    if (opts.cbtesAsoc?.length) invoice.cmpsAsoc = opts.cbtesAsoc;
    if (opts.canMisMonExt) invoice.canMisMonExt = opts.canMisMonExt;
    if (opts.opcionales?.length) invoice.opcionales = opts.opcionales;
    if (opts.actividades?.length) invoice.actividades = opts.actividades.map((a) => ({ id: a }));

    // Emisión: no se reintenta. Un resultado incierto llega como ArcaResultadoInciertoExpo.
    const result = await this.wsfex.authorize(auth, invoice, callOpts);
    const r = result.fexResultAuth!;
    // Con Id calculado (último + 1), un reproceso significa que otra emisión usó el mismo Id.
    if (opts.id === undefined && r.reproceso === 'S') {
      throw new ArcaConflictoExpo(invoice, result, 'WSFEX respondió Reproceso="S" con un Id nuevo');
    }
    const obs = optString(r.motivosObs);
    if (r.resultado === 'R') {
      // Motivos_Obs es texto libre (sin código): va como observación con code 0.
      throw new ArcaRechazoError(
        `FEXAuthorize: WSFEX rechazó el comprobante ${invoice.cbteTipo}-${invoice.puntoVta}-${invoice.cbteNro} ` +
          `(Id ${invoice.id})${obs ? `: ${obs}` : ''}`,
        { operacion: 'FEXAuthorize', observaciones: obs ? [{ code: 0, msg: obs }] : [] },
      );
    }
    const cae = optString(r.cae);
    if (cae === undefined) {
      throw new ArcaResultadoInciertoExpo(invoice, {
        cause: new ArcaResponseError('FEXAuthorize aprobó el comprobante sin informar el CAE', true),
      });
    }

    return {
      id: Number(r.id ?? id),
      reproceso: r.reproceso === 'S',
      fecha,
      cae,
      caeVencimiento: optString(r.fchVencCae),
      cbteNro: Number(r.cbteNro),
      ptoVta: Number(r.puntoVta),
      cbteTipo: Number(r.cbteTipo),
      obs,
      eventos: eventosWsfex(result),
      raw: result,
    };
  }

  // ============================================================
  // CAEA - Autorización Anticipada
  // ============================================================

  private validarPeriodoCAEA(periodo: string, orden: number): void {
    const m = /^(\d{4})(\d{2})$/.exec(String(periodo));
    if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) fail('periodo', 'periodo debe tener formato YYYYMM', periodo);
    if (orden !== 1 && orden !== 2) fail('orden', 'orden debe ser 1 (primera quincena) o 2 (segunda quincena)', orden);
  }

  /**
   * Solicita un CAEA para un período y quincena. Desde la RG 5782 el CAEA es
   * solo para contingencias (ver README).
   * @param periodo - Período en formato YYYYMM
   * @param orden - 1 = primera quincena, 2 = segunda quincena
   */
  async solicitarCAEA(periodo: string, orden: number, call?: CallOptions): Promise<CaeaSolicitarResult> {
    this.validarPeriodoCAEA(periodo, orden);
    const callOpts = this.opts(call);
    const auth = await this.getAuth('wsfe', callOpts);
    return this.wsfe.solicitarCAEA(auth, periodo, orden, callOpts);
  }

  /** Consulta un CAEA previamente solicitado. */
  async consultarCAEA(periodo: string, orden: number, call?: CallOptions): Promise<CaeaSolicitarResult> {
    this.validarPeriodoCAEA(periodo, orden);
    const callOpts = this.opts(call);
    const auth = await this.getAuth('wsfe', callOpts);
    return this.wsfe.consultarCAEA(auth, periodo, orden, callOpts);
  }

  /**
   * Informa comprobantes emitidos con un CAEA (API raw). Cada comprobante
   * lleva `CAEA` y `CbteFchHsGen` (yyyymmddhhmmss, obligatorio desde la RG 5782).
   * Devuelve la respuesta de ARCA tal cual: un comprobante con `resultado` "R"
   * **no** lanza `ArcaRechazoError` (sí `registrarFacturaCAEA`).
   */
  async registrarCAEA(request: CaeaRegInfRequest, call?: CallOptions): Promise<CaeaRegInfResult> {
    validateInvoiceRequest(request);
    request.invoices.forEach((inv, i) => {
      if (!inv.caea) fail(`invoices[${i}].caea`, 'caea es requerido');
      if (!inv.cbteFchHsGen)
        fail(
          `invoices[${i}].cbteFchHsGen`,
          'cbteFchHsGen (yyyymmddhhmmss) es requerido desde la RG 5782 (validación 1440)',
        );
      formatFechaHora(inv.cbteFchHsGen, `invoices[${i}].cbteFchHsGen`);
    });
    const callOpts = this.opts(call);
    const auth = await this.getAuth('wsfe', callOpts);
    return this.wsfe.registrarCAEA(auth, request, callOpts);
  }

  /**
   * Informa un comprobante emitido en contingencia con CAEA (API simplificada).
   * Calcula IVA y totales igual que `facturar()`, y tiene los mismos errores:
   * si ARCA rechaza el comprobante lanza `ArcaRechazoError`
   * (`operacion: "FECAEARegInformativo"`; si `requiereRecuperacion(error)`, por
   * ejemplo 703, el número ya se informó).
   *
   * - `fechaHoraGeneracion` (obligatorio): cuándo se generó el comprobante en
   *   contingencia (`CbteFchHsGen`). Un `Date` se formatea en hora de Argentina.
   * - `fecha`: fecha del comprobante. Default: la fecha de `fechaHoraGeneracion`
   *   (nunca la fecha del informe).
   * - `cbteNro`: default último autorizado + 1.
   *
   * @example
   * ```ts
   * const result = await arca.registrarFacturaCAEA(caea.caea, {
   *   ptoVta: 5,
   *   cbteTipo: CbteTipo.FACTURA_B,
   *   cbteNro: 120,
   *   fechaHoraGeneracion: new Date("2026-11-03T14:32:10-03:00"),
   *   items: [{ neto: 100, iva: IvaTipo.IVA_21 }],
   * });
   * ```
   */
  async registrarFacturaCAEA(caea: string, opts: FacturarCAEAOpts, call?: CallOptions): Promise<FacturaResult> {
    if (!caea) fail('caea', 'caea es requerido');
    if (opts.fechaHoraGeneracion === undefined)
      fail(
        'fechaHoraGeneracion',
        'fechaHoraGeneracion (CbteFchHsGen) es requerido: fecha y hora en que se generó el comprobante de contingencia (RG 5782)',
      );
    const hsGen = formatFechaHora(opts.fechaHoraGeneracion, 'fechaHoraGeneracion');
    const { fechaHoraGeneracion: _, ...facturarOpts } = opts;
    const fecha = opts.fecha ?? hsGen.slice(0, 8);
    const { detail, importes } = await this.prepararComprobante({ ...facturarOpts, fecha }, call);
    const enviado = { ...detail, caea: caea, cbteFchHsGen: hsGen };

    const result = await this.registrarCAEA(
      { ptoVta: opts.ptoVta, cbteTipo: opts.cbteTipo, invoices: [enviado] },
      call,
    );
    return this.resultadoEmision('FECAEARegInformativo', result, opts, enviado, importes);
  }

  /**
   * Informa que no hubo movimientos para un CAEA en un punto de venta (emisión,
   * no se reintenta). Si el error es incierto, verificar con `consultarSinMovimientoCAEA`.
   *
   * @throws ArcaRechazoError (`operacion: "FECAEASinMovimientoInformar"`) si ARCA
   *   responde `Resultado` "R".
   */
  async sinMovimientoCAEA(
    caea: string,
    ptoVta: number,
    call?: CallOptions,
  ): Promise<CaeaSinMovResult & { resultado: 'A' }> {
    const callOpts = this.opts(call);
    const auth = await this.getAuth('wsfe', callOpts);
    const result = await this.wsfe.sinMovimientoCAEA(auth, caea, ptoVta, callOpts);
    if (result.resultado === 'R') {
      throw new ArcaRechazoError(
        `FECAEASinMovimientoInformar: ARCA rechazó el informe sin movimiento del CAEA ${caea} (punto de venta ${ptoVta})`,
        { operacion: 'FECAEASinMovimientoInformar' },
      );
    }
    return result as CaeaSinMovResult & { resultado: 'A' };
  }

  /** Consulta los puntos de venta informados "sin movimiento" para un CAEA. */
  async consultarSinMovimientoCAEA(caea: string, ptoVta: number, call?: CallOptions): Promise<CaeaSinMovItem[]> {
    const callOpts = this.opts(call);
    const auth = await this.getAuth('wsfe', callOpts);
    return this.wsfe.consultarSinMovimientoCAEA(auth, caea, ptoVta, callOpts);
  }

  // ============================================================
  // Estado y parámetros WSFE
  // ============================================================

  /**
   * Cache de parámetros: guarda la promesa, así las consultas concurrentes
   * iguales comparten un solo request. Si falla, se descarta (no se cachean errores).
   */
  private cachedParam<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if (this.paramCacheTTLMs <= 0) return fn();
    const cached = this.paramCache.get(key);
    if (cached && cached.expires > Date.now()) return cached.data as Promise<T>;
    const data = fn();
    const entry = { data: data as Promise<unknown>, expires: Date.now() + this.paramCacheTTLMs };
    this.paramCache.set(key, entry);
    data.catch(() => {
      if (this.paramCache.get(key) === entry) this.paramCache.delete(key);
    });
    return data;
  }

  private wsfeParam<T>(
    key: string,
    fn: (auth: WsfeAuth, opts: CallOptions) => Promise<T>,
    call?: CallOptions,
  ): Promise<T> {
    const callOpts = this.opts(call);
    return this.cachedParam(key, async () => fn(await this.getAuth('wsfe', callOpts), callOpts));
  }

  /**
   * Estado de los servidores de WSFE y WSFEX (`FEDummy`/`FEXDummy`, sin
   * autenticación). Una falla de un servicio no impide conocer el del otro.
   */
  status(call?: CallOptions): Promise<{ wsfe: ServiceStatus; wsfex: ServiceStatus }> {
    const opts = this.opts(call);
    return statusOf({ wsfe: () => this.wsfe.dummy(opts), wsfex: () => this.wsfex.dummy(opts) });
  }

  /** Tipos de comprobante disponibles. Cacheado. */
  async getTiposComprobante(call?: CallOptions): Promise<ParamItem[]> {
    return this.wsfeParam('tiposCbte', (a, o) => this.wsfe.getTiposComprobante(a, o), call);
  }

  /** Tipos de concepto (Productos, Servicios, Ambos). Cacheado. */
  async getTiposConcepto(call?: CallOptions): Promise<ParamItem[]> {
    return this.wsfeParam('tiposConcepto', (a, o) => this.wsfe.getTiposConcepto(a, o), call);
  }

  /** Tipos de documento disponibles (CUIT, DNI, etc.). Cacheado. */
  async getTiposDocumento(call?: CallOptions): Promise<ParamItem[]> {
    return this.wsfeParam('tiposDoc', (a, o) => this.wsfe.getTiposDocumento(a, o), call);
  }

  /**
   * Condiciones de IVA válidas para el receptor. Cacheado.
   * `claseCmp` (opcional) filtra por clase de comprobante ("A", "B", "C", ...).
   */
  async getCondicionesIva(call?: CallOptions & { claseCmp?: string }): Promise<CondicionIvaItem[]> {
    const clase = call?.claseCmp;
    return this.wsfeParam(`condicionesIva:${clase ?? ''}`, (a, o) => this.wsfe.getCondicionesIva(a, o, clase), call);
  }

  /** Alícuotas de IVA disponibles (0%, 2.5%, 5%, 10.5%, 21%, 27%). Cacheado. */
  async getTiposIva(call?: CallOptions): Promise<ParamItem[]> {
    return this.wsfeParam('tiposIva', (a, o) => this.wsfe.getTiposIva(a, o), call);
  }

  /** Monedas disponibles. Cacheado. */
  async getMonedas(call?: CallOptions): Promise<MonedaItem[]> {
    return this.wsfeParam('monedas', (a, o) => this.wsfe.getMonedas(a, o), call);
  }

  /** Tipos de tributo disponibles. Cacheado. */
  async getTiposTributo(call?: CallOptions): Promise<ParamItem[]> {
    return this.wsfeParam('tiposTrib', (a, o) => this.wsfe.getTiposTributo(a, o), call);
  }

  /** Tipos de datos opcionales disponibles. Cacheado. */
  async getTiposOpcional(call?: CallOptions): Promise<ParamItem[]> {
    return this.wsfeParam('tiposOpc', (a, o) => this.wsfe.getTiposOpcional(a, o), call);
  }

  /** Actividades del emisor (`FEParamGetActividades`). Cacheado. */
  async getActividades(call?: CallOptions): Promise<ActividadItem[]> {
    return this.wsfeParam('actividades', (a, o) => this.wsfe.getActividades(a, o), call);
  }

  /** Países (`FEParamGetTiposPaises`). Cacheado. */
  async getTiposPaises(call?: CallOptions): Promise<PaisItem[]> {
    return this.wsfeParam('tiposPaises', (a, o) => this.wsfe.getTiposPaises(a, o), call);
  }

  /**
   * Puntos de venta habilitados. No se cachea: un punto de venta dado de alta
   * o bloqueado tiene que verse enseguida.
   */
  async getPuntosVenta(call?: CallOptions): Promise<PtoVentaItem[]> {
    const callOpts = this.opts(call);
    const auth = await this.getAuth('wsfe', callOpts);
    return this.wsfe.getPuntosVenta(auth, callOpts);
  }

  /**
   * Cotización oficial de una moneda (`FEParamGetCotizacion`). No se cachea.
   * `fecha` (opcional): fecha de la cotización (Date o YYYYMMDD).
   *
   * @example
   * ```ts
   * const { monCotiz, fchCotiz } = await arca.getCotizacion("DOL");
   * ```
   */
  async getCotizacion(monedaId: string, call?: CallOptions & { fecha?: Date | string }): Promise<CotizacionResult> {
    const fecha = call?.fecha !== undefined ? formatDate(call.fecha) : undefined;
    const callOpts = this.opts(call);
    const auth = await this.getAuth('wsfe', callOpts);
    return this.wsfe.getCotizacion(auth, monedaId, { ...callOpts, fchCotiz: fecha });
  }

  /** Cantidad máxima de registros por request de FECAESolicitar. */
  async getCantMaxRegistros(call?: CallOptions): Promise<number> {
    const callOpts = this.opts(call);
    const auth = await this.getAuth('wsfe', callOpts);
    return this.wsfe.getCantMaxRegistros(auth, callOpts);
  }

  // ============================================================
  // QR
  // ============================================================

  /**
   * Genera la URL del QR oficial de ARCA para un comprobante autorizado.
   * Ver `generarUrlQR`.
   *
   * @example
   * ```ts
   * const url = ArcaFacturacion.generateQRUrl({
   *   fecha: "2026-03-28",
   *   cuit: 20123456786,
   *   ptoVta: 1,
   *   tipoCmp: CbteTipo.FACTURA_B,
   *   nroCmp: 150,
   *   importe: 121,
   *   moneda: "PES",
   *   ctz: 1,
   *   tipoDocRec: DocTipo.CONSUMIDOR_FINAL,
   *   nroDocRec: 0,
   *   codAut: "73429843294823",
   * });
   * ```
   */
  static generateQRUrl(input: QRInput, options?: QROptions): string {
    return generarUrlQR(input, options);
  }

  /**
   * URL del QR de un comprobante emitido con `facturar`, `notaCredito`,
   * `notaDebito`, `registrarFacturaCAEA` o recuperado con `recuperarComprobante`
   * (siempre autorizado), usando el CUIT de esta instancia.
   */
  urlQR(factura: FacturaResult, datos?: Omit<DatosQR, 'cuit'>, options?: QROptions): string {
    return urlQRDesdeFactura(factura, { ...datos, cuit: this.cuitNum }, options);
  }

  // ============================================================
  // Utilidades estáticas
  // ============================================================

  /** Invalida el cache de parámetros (getTipos*, getMonedas, etc.). */
  clearParamCache(): void {
    this.paramCache.clear();
  }
}
