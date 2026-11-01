import { WsaaClient } from '@ramiidv/arca-common';
import type { CallOptions, ServerStatus } from '@ramiidv/arca-common';
import { ENDPOINTS } from './constants.js';
import { FecredClient } from './fecred-client.js';
import { cuitParam } from './validation.js';
import type {
  AceptarFecredParams,
  ArcaFecredConfig,
  CodigoDescripcion,
  ConsultarComprobantesParams,
  ConsultarComprobantesResult,
  ConsultarCtaCteResult,
  ConsultarCtasCtesParams,
  ConsultarCtasCtesResult,
  ConsultarCuentasEnAgtDptoCltvResult,
  ConsultarFacturasAgtDptoCltvParams,
  ConsultarFacturasAgtDptoCltvResult,
  ConsultarMontoObligadoRecepcionParams,
  HistorialEstadosComprobanteResult,
  HistorialEstadosCtaCteResult,
  IdComprobante,
  IdComprobanteInput,
  IdCtaCteInput,
  InformarCancelacionTotalParams,
  InformarFacturaAgtDptoCltvParams,
  ModificarOpcionTransferenciaParams,
  MontoObligadoRecepcionResult,
  ObligadoRecepcionResult,
  OperacionFecredResult,
  RechazarFecredParams,
  RechazarNotaDCParams,
  RechazarNotaDCResult,
  TipoRetencion,
  WsAuth,
} from './types.js';

/**
 * Cliente de alto nivel de WSFECRED (Factura de Crédito Electrónica MiPyME,
 * Ley 27.440). Obtiene y cachea el Ticket de Acceso de WSAA automáticamente.
 *
 * @example
 * ```ts
 * const fecred = new ArcaFecred({
 *   cert: readFileSync('cert.pem', 'utf-8'),
 *   key: readFileSync('key.pem', 'utf-8'),
 *   cuit: '20123456786',
 * });
 *
 * const { obligado, montoDesde } = await fecred.consultarMontoObligadoRecepcion({
 *   cuitConsultada: '30712345674',
 *   fechaEmision: '2026-11-01',
 * });
 *
 * const { ctasCtes, hayMas } = await fecred.consultarCtasCtes({
 *   rol: 'Receptor',
 *   fecha: { tipo: 'Emision', desde: '2026-10-01', hasta: '2026-10-31' },
 * });
 * ```
 */
export class ArcaFecred {
  /** Cliente WSAA (se puede compartir con otros SDKs). */
  public readonly wsaa: WsaaClient;
  /** Cliente de bajo nivel de FECredService. */
  public readonly fecred: FecredClient;

  /** CUIT representada (11 dígitos). */
  private readonly cuit: string;

  constructor(config: ArcaFecredConfig) {
    const production = config.production ?? false;
    this.cuit = cuitParam(config.cuit, 'cuit');

    this.wsaa =
      config.wsaa ??
      new WsaaClient({
        cert: config.cert,
        key: config.key,
        production,
        endpoint: config.endpoints?.wsaa,
        tokenTTLMinutes: config.tokenTTLMinutes,
        timeout: config.timeout,
        retries: config.retries,
        retryDelayMs: config.retryDelayMs,
        onEvent: config.onEvent,
        ticketStorage: config.ticketStorage,
        clockOffsetMs: config.clockOffsetMs,
        autoClockSkew: config.autoClockSkew,
        loginErrorCooldownMs: config.loginErrorCooldownMs,
        fetch: config.fetch,
        legacyTls: config.legacyTls,
      });

    this.fecred = new FecredClient({
      endpoint:
        config.endpoints?.wsfecred ?? (production ? ENDPOINTS.wsfecred.production : ENDPOINTS.wsfecred.testing),
      namespace: ENDPOINTS.wsfecred.namespace,
      soapOptions: {
        timeout: config.timeout,
        retries: config.retries,
        retryDelayMs: config.retryDelayMs,
        fetch: config.fetch,
        legacyTls: config.legacyTls,
      },
      onEvent: config.onEvent,
    });
  }

  // =========================================================================
  // Health check
  // =========================================================================

  /** Estado de los servidores de WSFECRED (`dummy`, sin autenticación). */
  status(opts?: CallOptions): Promise<ServerStatus> {
    return this.fecred.dummy(opts);
  }

  // =========================================================================
  // Obligación de recepción
  // =========================================================================

  /** Si una CUIT está obligada a recibir FCE para una fecha de emisión, y desde qué monto. */
  consultarMontoObligadoRecepcion(
    params: ConsultarMontoObligadoRecepcionParams,
    opts?: CallOptions,
  ): Promise<MontoObligadoRecepcionResult> {
    return this.fecred.consultarMontoObligadoRecepcion(this.auth(opts), params, opts);
  }

  /** Si una CUIT está obligada a recibir FCE y desde qué fecha. */
  consultarObligadoRecepcion(cuitConsultada: number | string, opts?: CallOptions): Promise<ObligadoRecepcionResult> {
    return this.fecred.consultarObligadoRecepcion(this.auth(opts), cuitConsultada, opts);
  }

  // =========================================================================
  // Consultas
  // =========================================================================

  /** Cuentas corrientes de FCE (paginado: ver `hayMas` / `nroPagina`). */
  consultarCtasCtes(params: ConsultarCtasCtesParams, opts?: CallOptions): Promise<ConsultarCtasCtesResult> {
    return this.fecred.consultarCtasCtes(this.auth(opts), params, opts);
  }

  /** Detalle de una cuenta corriente. */
  consultarCtaCte(idCtaCte: IdCtaCteInput, opts?: CallOptions): Promise<ConsultarCtaCteResult> {
    return this.fecred.consultarCtaCte(this.auth(opts), idCtaCte, opts);
  }

  /** Comprobantes FCE (paginado: ver `hayMas` / `nroPagina`). */
  consultarComprobantes(
    params: ConsultarComprobantesParams,
    opts?: CallOptions,
  ): Promise<ConsultarComprobantesResult> {
    return this.fecred.consultarComprobantes(this.auth(opts), params, opts);
  }

  /** Historial de estados de un comprobante. */
  consultarHistorialEstadosComprobante(
    idComprobante: IdComprobanteInput,
    opts?: CallOptions,
  ): Promise<HistorialEstadosComprobanteResult> {
    return this.fecred.consultarHistorialEstadosComprobante(this.auth(opts), idComprobante, opts);
  }

  /** Historial de estados de una cuenta corriente. */
  consultarHistorialEstadosCtaCte(
    idCtaCte: IdCtaCteInput,
    opts?: CallOptions,
  ): Promise<HistorialEstadosCtaCteResult> {
    return this.fecred.consultarHistorialEstadosCtaCte(this.auth(opts), idCtaCte, opts);
  }

  /** Remitos asociados a un comprobante. */
  obtenerRemitos(idComprobante: IdComprobanteInput, opts?: CallOptions): Promise<IdComprobante[]> {
    return this.fecred.obtenerRemitos(this.auth(opts), idComprobante, opts);
  }

  // =========================================================================
  // Operaciones (no idempotentes: nunca se reintentan)
  // =========================================================================

  /**
   * Acepta una FCE. Un rechazo de ARCA (errores o `resultado = 'R'`) se lanza
   * como `ArcaServiceError`. Si la respuesta se pierde (`ArcaSoapError` con
   * `uncertain`), consultá el estado con `consultarCtaCte` antes de reintentar.
   */
  aceptarFECred(params: AceptarFecredParams, opts?: CallOptions): Promise<OperacionFecredResult> {
    return this.fecred.aceptarFECred(this.auth(opts), params, opts);
  }

  /** Rechaza una FCE (motivos de `consultarTiposMotivosRechazo`). */
  rechazarFECred(params: RechazarFecredParams, opts?: CallOptions): Promise<OperacionFecredResult> {
    return this.fecred.rechazarFECred(this.auth(opts), params, opts);
  }

  /** Informa la cancelación total de una FCE aceptada. */
  informarCancelacionTotalFECred(
    params: InformarCancelacionTotalParams,
    opts?: CallOptions,
  ): Promise<OperacionFecredResult> {
    return this.fecred.informarCancelacionTotalFECred(this.auth(opts), params, opts);
  }

  /** Rechaza una nota de débito/crédito asociada a una FCE. */
  rechazarNotaDC(params: RechazarNotaDCParams, opts?: CallOptions): Promise<RechazarNotaDCResult> {
    return this.fecred.rechazarNotaDC(this.auth(opts), params, opts);
  }

  /** Cambia la opción de transferencia (SCA/ADC) de una cuenta corriente. */
  modificarOpcionTransferencia(
    params: ModificarOpcionTransferenciaParams,
    opts?: CallOptions,
  ): Promise<OperacionFecredResult> {
    return this.fecred.modificarOpcionTransferencia(this.auth(opts), params, opts);
  }

  /** Informa una factura a un Agente de Depósito Colectivo. */
  informarFacturaAgtDptoCltv(
    params: InformarFacturaAgtDptoCltvParams,
    opts?: CallOptions,
  ): Promise<OperacionFecredResult> {
    return this.fecred.informarFacturaAgtDptoCltv(this.auth(opts), params, opts);
  }

  // =========================================================================
  // Agente de Depósito Colectivo
  // =========================================================================

  /** Cuentas de la CUIT representada en Agentes de Depósito Colectivo. */
  consultarCuentasEnAgtDptoCltv(opts?: CallOptions): Promise<ConsultarCuentasEnAgtDptoCltvResult> {
    return this.fecred.consultarCuentasEnAgtDptoCltv(this.auth(opts), opts);
  }

  /** Facturas informadas a Agentes de Depósito Colectivo. */
  consultarFacturasAgtDptoCltv(
    params?: ConsultarFacturasAgtDptoCltvParams,
    opts?: CallOptions,
  ): Promise<ConsultarFacturasAgtDptoCltvResult> {
    return this.fecred.consultarFacturasAgtDptoCltv(this.auth(opts), params, opts);
  }

  // =========================================================================
  // Tablas de parámetros
  // =========================================================================

  /** Tipos de retenciones (jurisdicción y porcentaje). */
  consultarTiposRetenciones(opts?: CallOptions): Promise<TipoRetencion[]> {
    return this.fecred.consultarTiposRetenciones(this.auth(opts), opts);
  }

  /** Formas de cancelación (para `aceptarFECred` / `informarCancelacionTotalFECred`). */
  consultarTiposFormasCancelacion(opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.fecred.consultarTiposFormasCancelacion(this.auth(opts), opts);
  }

  /** Motivos de rechazo (para `rechazarFECred` / `rechazarNotaDC`). */
  consultarTiposMotivosRechazo(opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.fecred.consultarTiposMotivosRechazo(this.auth(opts), opts);
  }

  /** Tipos de ajustes de operación (para `aceptarFECred`). */
  consultarTiposAjustesOperacion(opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.fecred.consultarTiposAjustesOperacion(this.auth(opts), opts);
  }

  // =========================================================================
  // Tickets
  // =========================================================================

  /** Descarta el Ticket de Acceso de WSFECRED (memoria y `ticketStorage`). */
  clearAuthCache(): Promise<void> {
    return this.wsaa.clearTicket(ENDPOINTS.wsfecred.serviceId);
  }

  /** Credenciales diferidas: el cliente las pide después de validar los parámetros. */
  private auth(opts?: CallOptions): () => Promise<WsAuth> {
    return async () => {
      const ticket = await this.wsaa.getAccessTicket(ENDPOINTS.wsfecred.serviceId, opts);
      return { token: ticket.token, sign: ticket.sign, cuitRepresentada: this.cuit };
    };
  }
}
