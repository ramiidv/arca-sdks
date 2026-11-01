import { EventEmitter } from 'node:events';
import { WsaaClient, safeEmit, validateCuit } from '@ramiidv/arca-common';
import type { ArcaEvent, CallOptions } from '@ramiidv/arca-common';
import { CpeClient } from './cpe-client.js';
import { LpgClient } from './lpg-client.js';
import { CPE_ENDPOINTS, LPG_ENDPOINTS, WSAA_SERVICES } from './constants.js';
import type { ServiceContext } from './context.js';
import type { AgroServiceStatus, ArcaAgroConfig } from './types.js';

/**
 * Cliente de los servicios agropecuarios de ARCA: WSCPE (Carta de Porte
 * Electrónica) y WSLPG (Liquidación Primaria de Granos), con autenticación
 * WSAA automática.
 *
 * @example
 * ```ts
 * const agro = new ArcaAgro({
 *   cuit: '20-12345678-6',
 *   cert: fs.readFileSync('cert.pem', 'utf-8'),
 *   key: fs.readFileSync('key.pem', 'utf-8'),
 * });
 * const nroOrden = await agro.cpe.siguienteNroOrden(1, TIPO_CPE.AUTOMOTOR);
 * const cpe = await agro.cpe.autorizarCPEAutomotor({ ... });
 * const liq = await agro.lpg.liquidacionAutorizar({ liquidacion: { ... } });
 * ```
 */
export class ArcaAgro {
  /** WSCPE: Carta de Porte Electrónica (automotor y ferroviaria). */
  public readonly cpe: CpeClient;
  /** WSLPG: Liquidación Primaria de Granos y certificaciones. */
  public readonly lpg: LpgClient;

  readonly #wsaa: WsaaClient;
  readonly #emitter = new EventEmitter();

  /** @throws ArcaValidationError si el CUIT es inválido. */
  constructor(config: ArcaAgroConfig) {
    const cuit = validateCuit(config.cuit);
    const production = config.production ?? false;

    const emit = (event: ArcaEvent) => {
      safeEmit(config.onEvent, event);
      safeEmit((e) => this.#emitter.emit(e.type, e), event);
    };

    this.#wsaa = new WsaaClient({
      cert: config.cert,
      key: config.key,
      production,
      endpoint: config.endpoints?.wsaa,
      tokenTTLMinutes: config.tokenTTLMinutes,
      timeout: config.timeout,
      retries: config.retries,
      retryDelayMs: config.retryDelayMs,
      onEvent: emit,
      ticketStorage: config.ticketStorage,
      clockOffsetMs: config.clockOffsetMs,
      autoClockSkew: config.autoClockSkew,
      loginErrorCooldownMs: config.loginErrorCooldownMs,
      fetch: config.fetch,
      legacyTls: config.legacyTls,
    });

    const soap: ServiceContext['soap'] = {
      timeout: config.timeout,
      retries: config.retries,
      retryDelayMs: config.retryDelayMs,
      onEvent: emit,
      fetch: config.fetch,
      legacyTls: config.legacyTls,
    };
    const env = production ? 'production' : 'testing';

    this.cpe = new CpeClient({
      endpoint: config.endpoints?.cpe ?? CPE_ENDPOINTS[env],
      cuit,
      soap,
      getTicket: (opts) => this.#wsaa.getAccessTicket(WSAA_SERVICES.cpe, opts),
    });
    this.lpg = new LpgClient({
      endpoint: config.endpoints?.lpg ?? LPG_ENDPOINTS[env],
      cuit,
      soap,
      getTicket: (opts) => this.#wsaa.getAccessTicket(WSAA_SERVICES.lpg, opts),
    });
  }

  /**
   * Suscribirse a eventos del SDK (`auth:*`, `request:*`).
   * Los errores de los handlers se ignoran.
   */
  on(event: ArcaEvent['type'], handler: (event: ArcaEvent) => void): this {
    this.#emitter.on(event, handler);
    return this;
  }

  /** Desuscribirse de un evento. */
  off(event: ArcaEvent['type'], handler: (event: ArcaEvent) => void): this {
    this.#emitter.off(event, handler);
    return this;
  }

  /**
   * Estado de los servidores de WSCPE y WSLPG (`dummy`, sin autenticación).
   * Una falla de un servicio no impide conocer el estado del otro.
   */
  async serverStatus(opts?: CallOptions): Promise<{ cpe: AgroServiceStatus; lpg: AgroServiceStatus }> {
    const [cpe, lpg] = await Promise.allSettled([this.cpe.dummy(opts), this.lpg.dummy(opts)]);
    const toStatus = (r: PromiseSettledResult<Awaited<ReturnType<CpeClient['dummy']>>>): AgroServiceStatus =>
      r.status === 'fulfilled'
        ? { ok: true, status: r.value }
        : { ok: false, error: r.reason instanceof Error ? r.reason : new Error(String(r.reason)) };
    return { cpe: toStatus(cpe), lpg: toStatus(lpg) };
  }

  /** Invalida los tickets de acceso (memoria y `ticketStorage`) de WSCPE y WSLPG. */
  async clearAuthCache(): Promise<void> {
    await Promise.all([this.#wsaa.clearTicket(WSAA_SERVICES.cpe), this.#wsaa.clearTicket(WSAA_SERVICES.lpg)]);
  }
}
