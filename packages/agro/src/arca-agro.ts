import { ArcaSdkBase, statusOf } from '@ramiidv/arca-common';
import type { CallOptions } from '@ramiidv/arca-common';
import { CpeClient } from './cpe-client.js';
import { LpgClient } from './lpg-client.js';
import { CPE_ENDPOINTS, LPG_ENDPOINTS, WSAA_SERVICES } from './constants.js';
import type { ServiceContext } from './context.js';
import type { AgroServiceStatus, ArcaAgroConfig } from './types.js';

type AgroService = keyof typeof WSAA_SERVICES;

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
export class ArcaAgro extends ArcaSdkBase<AgroService> {
  /** WSCPE: Carta de Porte Electrónica (automotor y ferroviaria). */
  public readonly cpe: CpeClient;
  /** WSLPG: Liquidación Primaria de Granos y certificaciones. */
  public readonly lpg: LpgClient;

  /** @throws ArcaValidationError si el CUIT es inválido. */
  constructor(config: ArcaAgroConfig) {
    super(config, WSAA_SERVICES);
    const context = (service: AgroService, endpoint: string): ServiceContext => ({
      endpoint,
      cuit: this.cuit,
      transport: this.transport,
      getTicket: (opts) => this.ticket(service, opts),
      callOptions: (opts) => this.callOptions(opts),
    });
    this.cpe = new CpeClient(context('cpe', this.endpoint(CPE_ENDPOINTS, config.endpoints?.cpe)));
    this.lpg = new LpgClient(context('lpg', this.endpoint(LPG_ENDPOINTS, config.endpoints?.lpg)));
  }

  /**
   * Estado de los servidores de WSCPE y WSLPG (`dummy`, sin autenticación).
   * Una falla de un servicio no impide conocer el estado del otro.
   */
  status(opts?: CallOptions): Promise<{ cpe: AgroServiceStatus; lpg: AgroServiceStatus }> {
    return statusOf({ cpe: () => this.cpe.dummy(opts), lpg: () => this.lpg.dummy(opts) });
  }

  /** @deprecated Usá `status()` (mismo resultado). */
  serverStatus(opts?: CallOptions): Promise<{ cpe: AgroServiceStatus; lpg: AgroServiceStatus }> {
    return this.status(opts);
  }
}
