import { ArcaSdkBase } from '@ramiidv/arca-common';
import type { CallOptions, ServerStatus } from '@ramiidv/arca-common';
import { ENDPOINTS } from './constants.js';
import { FecredClient } from './fecred-client.js';
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
 *   cuitConsultada: '30712345671',
 *   fechaEmision: '2026-11-01',
 * });
 *
 * const { ctasCtes, hayMas } = await fecred.consultarCtasCtes({
 *   rol: 'Receptor',
 *   fecha: { tipo: 'Emision', desde: '2026-10-01', hasta: '2026-10-31' },
 * });
 * ```
 */
export class ArcaFecred extends ArcaSdkBase<'wsfecred'> {
  /** Cliente de bajo nivel de FECredService. */
  public readonly client: FecredClient;

  constructor(config: ArcaFecredConfig) {
    // `ArcaSdkBase` valida la CUIT (dígito verificador) y la normaliza a 11 dígitos (`this.cuit`).
    super(config, { wsfecred: ENDPOINTS.wsfecred.serviceId });
    this.client = new FecredClient({
      endpoint: this.endpoint(ENDPOINTS.wsfecred, config.endpoints?.wsfecred),
      namespace: ENDPOINTS.wsfecred.namespace,
      transport: this.transport,
    });
  }

  // =========================================================================
  // Health check
  // =========================================================================

  /** Estado de los servidores de WSFECRED (`dummy`, sin autenticación). */
  status(opts?: CallOptions): Promise<ServerStatus> {
    return this.client.dummy(this.callOptions(opts));
  }

  // =========================================================================
  // Obligación de recepción
  // =========================================================================

  /** Si una CUIT está obligada a recibir FCE para una fecha de emisión, y desde qué monto. */
  consultarMontoObligadoRecepcion(
    params: ConsultarMontoObligadoRecepcionParams,
    opts?: CallOptions,
  ): Promise<MontoObligadoRecepcionResult> {
    return this.client.consultarMontoObligadoRecepcion(this.auth(opts), params, this.callOptions(opts));
  }

  /** Si una CUIT está obligada a recibir FCE y desde qué fecha. */
  consultarObligadoRecepcion(cuitConsultada: number | string, opts?: CallOptions): Promise<ObligadoRecepcionResult> {
    return this.client.consultarObligadoRecepcion(this.auth(opts), cuitConsultada, this.callOptions(opts));
  }

  // =========================================================================
  // Consultas
  // =========================================================================

  /** Cuentas corrientes de FCE (paginado: ver `hayMas` / `nroPagina`). */
  consultarCtasCtes(params: ConsultarCtasCtesParams, opts?: CallOptions): Promise<ConsultarCtasCtesResult> {
    return this.client.consultarCtasCtes(this.auth(opts), params, this.callOptions(opts));
  }

  /** Detalle de una cuenta corriente. */
  consultarCtaCte(idCtaCte: IdCtaCteInput, opts?: CallOptions): Promise<ConsultarCtaCteResult> {
    return this.client.consultarCtaCte(this.auth(opts), idCtaCte, this.callOptions(opts));
  }

  /** Comprobantes FCE (paginado: ver `hayMas` / `nroPagina`). */
  consultarComprobantes(params: ConsultarComprobantesParams, opts?: CallOptions): Promise<ConsultarComprobantesResult> {
    return this.client.consultarComprobantes(this.auth(opts), params, this.callOptions(opts));
  }

  /** Historial de estados de un comprobante. */
  consultarHistorialEstadosComprobante(
    idComprobante: IdComprobanteInput,
    opts?: CallOptions,
  ): Promise<HistorialEstadosComprobanteResult> {
    return this.client.consultarHistorialEstadosComprobante(this.auth(opts), idComprobante, this.callOptions(opts));
  }

  /** Historial de estados de una cuenta corriente. */
  consultarHistorialEstadosCtaCte(idCtaCte: IdCtaCteInput, opts?: CallOptions): Promise<HistorialEstadosCtaCteResult> {
    return this.client.consultarHistorialEstadosCtaCte(this.auth(opts), idCtaCte, this.callOptions(opts));
  }

  /** Remitos asociados a un comprobante. */
  obtenerRemitos(idComprobante: IdComprobanteInput, opts?: CallOptions): Promise<IdComprobante[]> {
    return this.client.obtenerRemitos(this.auth(opts), idComprobante, this.callOptions(opts));
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
    return this.client.aceptarFECred(this.auth(opts), params, this.callOptions(opts));
  }

  /** Rechaza una FCE (motivos de `consultarTiposMotivosRechazo`). */
  rechazarFECred(params: RechazarFecredParams, opts?: CallOptions): Promise<OperacionFecredResult> {
    return this.client.rechazarFECred(this.auth(opts), params, this.callOptions(opts));
  }

  /** Informa la cancelación total de una FCE aceptada. */
  informarCancelacionTotalFECred(
    params: InformarCancelacionTotalParams,
    opts?: CallOptions,
  ): Promise<OperacionFecredResult> {
    return this.client.informarCancelacionTotalFECred(this.auth(opts), params, this.callOptions(opts));
  }

  /** Rechaza una nota de débito/crédito asociada a una FCE. */
  rechazarNotaDC(params: RechazarNotaDCParams, opts?: CallOptions): Promise<RechazarNotaDCResult> {
    return this.client.rechazarNotaDC(this.auth(opts), params, this.callOptions(opts));
  }

  /** Cambia la opción de transferencia (SCA/ADC) de una cuenta corriente. */
  modificarOpcionTransferencia(
    params: ModificarOpcionTransferenciaParams,
    opts?: CallOptions,
  ): Promise<OperacionFecredResult> {
    return this.client.modificarOpcionTransferencia(this.auth(opts), params, this.callOptions(opts));
  }

  /** Informa una factura a un Agente de Depósito Colectivo. */
  informarFacturaAgtDptoCltv(
    params: InformarFacturaAgtDptoCltvParams,
    opts?: CallOptions,
  ): Promise<OperacionFecredResult> {
    return this.client.informarFacturaAgtDptoCltv(this.auth(opts), params, this.callOptions(opts));
  }

  // =========================================================================
  // Agente de Depósito Colectivo
  // =========================================================================

  /** Cuentas de la CUIT representada en Agentes de Depósito Colectivo. */
  consultarCuentasEnAgtDptoCltv(opts?: CallOptions): Promise<ConsultarCuentasEnAgtDptoCltvResult> {
    return this.client.consultarCuentasEnAgtDptoCltv(this.auth(opts), this.callOptions(opts));
  }

  /** Facturas informadas a Agentes de Depósito Colectivo. */
  consultarFacturasAgtDptoCltv(
    params?: ConsultarFacturasAgtDptoCltvParams,
    opts?: CallOptions,
  ): Promise<ConsultarFacturasAgtDptoCltvResult> {
    return this.client.consultarFacturasAgtDptoCltv(this.auth(opts), params, this.callOptions(opts));
  }

  // =========================================================================
  // Tablas de parámetros
  // =========================================================================

  /** Tipos de retenciones (jurisdicción y porcentaje). */
  consultarTiposRetenciones(opts?: CallOptions): Promise<TipoRetencion[]> {
    return this.client.consultarTiposRetenciones(this.auth(opts), this.callOptions(opts));
  }

  /** Formas de cancelación (para `aceptarFECred` / `informarCancelacionTotalFECred`). */
  consultarTiposFormasCancelacion(opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.client.consultarTiposFormasCancelacion(this.auth(opts), this.callOptions(opts));
  }

  /** Motivos de rechazo (para `rechazarFECred` / `rechazarNotaDC`). */
  consultarTiposMotivosRechazo(opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.client.consultarTiposMotivosRechazo(this.auth(opts), this.callOptions(opts));
  }

  /** Tipos de ajustes de operación (para `aceptarFECred`). */
  consultarTiposAjustesOperacion(opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.client.consultarTiposAjustesOperacion(this.auth(opts), this.callOptions(opts));
  }

  /** Credenciales diferidas: el cliente las pide después de validar los parámetros. */
  private auth(opts?: CallOptions): () => Promise<WsAuth> {
    return async () => {
      const ticket = await this.ticket('wsfecred', opts);
      return { token: ticket.token, sign: ticket.sign, cuitRepresentada: this.cuit };
    };
  }
}
