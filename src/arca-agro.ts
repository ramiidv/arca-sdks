import { EventEmitter } from 'node:events';
import { WsaaClient } from '@ramiidv/arca-common';
import type { ArcaEvent, ServerStatus } from '@ramiidv/arca-common';
import { CpeClient } from './cpe-client.js';
import { CtgClient } from './ctg-client.js';
import { LpgClient } from './lpg-client.js';
import { WSAA_SERVICES } from './constants.js';
import { validateCPE, validateCTG, validateLiquidacion } from './validation.js';
import type {
  ArcaAgroConfig,
  AgroAuth,
  CartaPorteAutomotor,
  CartaPorteResult,
  ConsultaCPEParams,
  ConsultaCPEPorDestinoParams,
  ConfirmadoArriboCPEParams,
  RechazoAnulacionCPEParams,
  EditarCPEParams,
  ContingenciaCPEParams,
  SolicitudCTG,
  CTGResult,
  ConsultaCTGParams,
  ConfirmarArriboCTGParams,
  RechazoCTGParams,
  AnulacionCTGParams,
  CTGActivosResult,
  Liquidacion,
  LiquidacionResult,
  ConsultaLiquidacionParams,
  AjusteUnificadoParams,
  Certificacion,
  CertificacionResult,
  LpgParameterQueryParams,
} from './types.js';

/**
 * Orquestador principal para los servicios agropecuarios de ARCA.
 * Expone los tres servicios (WSCPE, WSCTG, WSLPG) con autenticación automática.
 *
 * @example
 * ```ts
 * const agro = new ArcaAgro({
 *   cuit: 20123456789,
 *   cert: fs.readFileSync('cert.pem', 'utf-8'),
 *   key: fs.readFileSync('key.pem', 'utf-8'),
 *   production: false,
 * });
 *
 * // Carta de Porte
 * const cpe = await agro.cpe.autorizarCPEAutomotor({ ... });
 *
 * // CTG
 * const ctg = await agro.ctg.solicitarCTGInicial({ ... });
 *
 * // Liquidaciones
 * const liq = await agro.lpg.liquidacionAutorizar({ ... });
 * ```
 */
export class ArcaAgro {
  private readonly wsaa: WsaaClient;
  private readonly cpeClient: CpeClient;
  private readonly ctgClient: CtgClient;
  private readonly lpgClient: LpgClient;
  private readonly cuit: number;
  private readonly production: boolean;
  private readonly emitter = new EventEmitter();
  private readonly onEventCb?: (event: ArcaEvent) => void;

  /** Acceso a los servicios de Carta de Porte Electrónica (WSCPE). */
  public readonly cpe: ArcaAgroCpe;
  /** Acceso a los servicios de Código de Trazabilidad de Granos (WSCTG). */
  public readonly ctg: ArcaAgroCtg;
  /** Acceso a los servicios de Liquidación Primaria de Granos (WSLPG). */
  public readonly lpg: ArcaAgroLpg;

  constructor(config: ArcaAgroConfig) {
    this.cuit = config.cuit;
    this.production = config.production ?? false;
    this.onEventCb = config.onEvent;

    const timeoutMs = config.requestTimeoutMs ?? 30_000;
    const retries = config.retries ?? 1;
    const retryDelayMs = config.retryDelayMs ?? 1_000;

    const emit = (event: ArcaEvent) => {
      this.onEventCb?.(event);
      this.emitter.emit(event.type, event);
    };

    const clientOpts = { timeoutMs, retries, retryDelayMs, onEvent: emit };

    this.wsaa = new WsaaClient({
      cert: config.cert,
      key: config.key,
      production: this.production,
      tokenTTLMinutes: config.tokenTTLMinutes ?? 720,
      timeout: timeoutMs,
      retries,
      retryDelayMs,
      onEvent: emit,
    });

    this.cpeClient = new CpeClient(this.production, clientOpts);
    this.ctgClient = new CtgClient(this.production, clientOpts);
    this.lpgClient = new LpgClient(this.production, clientOpts);

    this.cpe = new ArcaAgroCpe(this);
    this.ctg = new ArcaAgroCtg(this);
    this.lpg = new ArcaAgroLpg(this);
  }

  // ============================================================
  // Eventos
  // ============================================================

  /**
   * Suscribirse a eventos del SDK.
   *
   * @example
   * ```ts
   * agro.on('request:end', (e) => console.log(`${e.method} took ${e.durationMs}ms`));
   * agro.on('auth:login', (e) => console.log(`Login ${e.service} in ${e.durationMs}ms`));
   * ```
   */
  on(event: ArcaEvent['type'], handler: (event: ArcaEvent) => void): this {
    this.emitter.on(event, handler);
    return this;
  }

  /** Desuscribirse de un evento. */
  off(event: ArcaEvent['type'], handler: (event: ArcaEvent) => void): this {
    this.emitter.off(event, handler);
    return this;
  }

  // ============================================================
  // Auth helpers (internal)
  // ============================================================

  /** @internal */
  async getAuth(service: string): Promise<AgroAuth> {
    const ticket = await this.wsaa.getAccessTicket(service);
    return {
      Token: ticket.token,
      Sign: ticket.sign,
      Cuit: this.cuit,
    };
  }

  /** @internal */
  getCpeClient(): CpeClient { return this.cpeClient; }

  /** @internal */
  getCtgClient(): CtgClient { return this.ctgClient; }

  /** @internal */
  getLpgClient(): LpgClient { return this.lpgClient; }

  // ============================================================
  // Estado de servicios
  // ============================================================

  /** Verifica el estado de los servidores de los 3 servicios agro. */
  async serverStatus(): Promise<{
    cpe: ServerStatus;
    ctg: ServerStatus;
    lpg: ServerStatus;
  }> {
    const [cpe, ctg, lpg] = await Promise.all([
      this.cpeClient.dummy(),
      this.ctgClient.dummy(),
      this.lpgClient.dummy(),
    ]);
    return { cpe, ctg, lpg };
  }

  // ============================================================
  // Cache
  // ============================================================

  /** Invalida los tickets de acceso cacheados para todos los servicios agro. */
  clearAuthCache(): void {
    this.wsaa.clearTicket(WSAA_SERVICES.cpe);
    this.wsaa.clearTicket(WSAA_SERVICES.ctg);
    this.wsaa.clearTicket(WSAA_SERVICES.lpg);
  }
}

// ============================================================
// Namespace: CPE
// ============================================================

/**
 * Namespace con métodos de Carta de Porte Electrónica (WSCPE).
 * Se accede a través de `agro.cpe.*`.
 */
class ArcaAgroCpe {
  constructor(private readonly agro: ArcaAgro) {}

  private auth() { return this.agro.getAuth(WSAA_SERVICES.cpe); }
  private client() { return this.agro.getCpeClient(); }

  /** Autoriza una CPE para transporte automotor. */
  async autorizarCPEAutomotor(cpe: CartaPorteAutomotor): Promise<CartaPorteResult> {
    validateCPE(cpe);
    return this.client().autorizarCPEAutomotor(await this.auth(), cpe);
  }

  /** Confirma el arribo de una CPE en destino. */
  async confirmadoArriboCPE(params: ConfirmadoArriboCPEParams): Promise<CartaPorteResult> {
    return this.client().confirmadoArriboCPE(await this.auth(), params);
  }

  /** Rechaza una CPE. */
  async rechazoCPE(params: RechazoAnulacionCPEParams): Promise<CartaPorteResult> {
    return this.client().rechazoCPE(await this.auth(), params);
  }

  /** Anula una CPE. */
  async anularCPE(params: RechazoAnulacionCPEParams): Promise<CartaPorteResult> {
    return this.client().anularCPE(await this.auth(), params);
  }

  /** Edita campos de una CPE previamente autorizada. */
  async editarCPE(params: EditarCPEParams): Promise<CartaPorteResult> {
    return this.client().editarCPE(await this.auth(), params);
  }

  /** Informa una contingencia sobre una CPE. */
  async informarContingencia(params: ContingenciaCPEParams): Promise<CartaPorteResult> {
    return this.client().informarContingencia(await this.auth(), params);
  }

  /** Consulta CPEs según criterios de búsqueda. */
  async consultarCPE(params: ConsultaCPEParams): Promise<CartaPorteResult[]> {
    return this.client().consultarCPE(await this.auth(), params);
  }

  /** Consulta CPEs por destino. */
  async consultarCPEPorDestino(params: ConsultaCPEPorDestinoParams): Promise<CartaPorteResult[]> {
    return this.client().consultarCPEPorDestino(await this.auth(), params);
  }

  /** Consulta el último número de orden utilizado para una sucursal. */
  async consultarUltNroOrden(sucursal: number): Promise<number> {
    return this.client().consultarUltNroOrden(await this.auth(), sucursal);
  }

  /** Obtiene el siguiente número de orden (último + 1). */
  async siguienteNroOrden(sucursal: number): Promise<number> {
    const ultimo = await this.consultarUltNroOrden(sucursal);
    return ultimo + 1;
  }

  /** Obtiene la constancia PDF de una CPE en base64. */
  async consultarConstanciaCPEPDF(nroCTG: number): Promise<string> {
    return this.client().consultarConstanciaCPEPDF(await this.auth(), nroCTG);
  }

  /** Verifica el estado de los servidores del WSCPE. */
  async dummy(): Promise<ServerStatus> {
    return this.client().dummy();
  }
}

// ============================================================
// Namespace: CTG
// ============================================================

/**
 * Namespace con métodos de Código de Trazabilidad de Granos (WSCTG).
 * Se accede a través de `agro.ctg.*`.
 */
class ArcaAgroCtg {
  constructor(private readonly agro: ArcaAgro) {}

  private auth() { return this.agro.getAuth(WSAA_SERVICES.ctg); }
  private client() { return this.agro.getCtgClient(); }

  /** Solicita un CTG inicial para el transporte de granos. */
  async solicitarCTGInicial(solicitud: SolicitudCTG): Promise<CTGResult> {
    validateCTG(solicitud);
    return this.client().solicitarCTGInicial(await this.auth(), solicitud);
  }

  /** Confirma el arribo de un CTG en destino. */
  async confirmarArribo(params: ConfirmarArriboCTGParams): Promise<CTGResult> {
    return this.client().confirmarArribo(await this.auth(), params);
  }

  /** Rechaza un CTG. */
  async rechazarCTG(params: RechazoCTGParams): Promise<CTGResult> {
    return this.client().rechazarCTG(await this.auth(), params);
  }

  /** Anula un CTG. */
  async anularCTG(params: AnulacionCTGParams): Promise<CTGResult> {
    return this.client().anularCTG(await this.auth(), params);
  }

  /** Consulta CTGs según criterios de búsqueda. */
  async consultarCTG(params: ConsultaCTGParams): Promise<CTGResult[]> {
    return this.client().consultarCTG(await this.auth(), params);
  }

  /** Consulta CTGs y retorna el resultado en formato Excel (base64). */
  async consultarCTGExcel(params: ConsultaCTGParams): Promise<string> {
    return this.client().consultarCTGExcel(await this.auth(), params);
  }

  /** Obtiene la constancia PDF de un CTG en base64. */
  async consultarConstanciaCTGPDF(nroCTG: number): Promise<string> {
    return this.client().consultarConstanciaCTGPDF(await this.auth(), nroCTG);
  }

  /** Obtiene los CTGs activos (pendientes). */
  async obtenerCTGActivos(): Promise<CTGActivosResult> {
    return this.client().obtenerCTGActivos(await this.auth());
  }

  /** Verifica el estado de los servidores del WSCTG. */
  async dummy(): Promise<ServerStatus> {
    return this.client().dummy();
  }
}

// ============================================================
// Namespace: LPG
// ============================================================

/**
 * Namespace con métodos de Liquidación Primaria de Granos (WSLPG).
 * Se accede a través de `agro.lpg.*`.
 */
class ArcaAgroLpg {
  constructor(private readonly agro: ArcaAgro) {}

  private auth() { return this.agro.getAuth(WSAA_SERVICES.lpg); }
  private client() { return this.agro.getLpgClient(); }

  /** Autoriza una liquidación primaria de granos. */
  async liquidacionAutorizar(liquidacion: Liquidacion): Promise<LiquidacionResult> {
    validateLiquidacion(liquidacion);
    return this.client().liquidacionAutorizar(await this.auth(), liquidacion);
  }

  /** Consulta liquidaciones previamente autorizadas. */
  async liquidacionConsultar(params: ConsultaLiquidacionParams): Promise<LiquidacionResult[]> {
    return this.client().liquidacionConsultar(await this.auth(), params);
  }

  /** Anula una liquidación previamente autorizada. */
  async liquidacionAnular(ptoEmision: number, nroOrden: number): Promise<LiquidacionResult> {
    return this.client().liquidacionAnular(await this.auth(), ptoEmision, nroOrden);
  }

  /** Ajusta una liquidación mediante ajuste unificado. */
  async liquidacionAjustarUnificado(params: AjusteUnificadoParams): Promise<LiquidacionResult> {
    return this.client().liquidacionAjustarUnificado(await this.auth(), params);
  }

  /** Autoriza una certificación de granos. */
  async certificacionAutorizar(certificacion: Certificacion): Promise<CertificacionResult> {
    return this.client().certificacionAutorizar(await this.auth(), certificacion);
  }

  /** Anula una certificación previamente autorizada. */
  async certificacionAnular(tipoCertificacion: number, nroCertificacion: number): Promise<CertificacionResult> {
    return this.client().certificacionAnular(await this.auth(), tipoCertificacion, nroCertificacion);
  }

  /** Consulta parámetros del WSLPG (tipos de grano, grados, puertos, etc.). */
  async consultarParametros(tipoParametro: string, params?: LpgParameterQueryParams): Promise<Record<string, unknown>[]> {
    return this.client().consultarParametros(await this.auth(), tipoParametro, params);
  }

  /** Verifica el estado de los servidores del WSLPG. */
  async dummy(): Promise<ServerStatus> {
    return this.client().dummy();
  }
}
