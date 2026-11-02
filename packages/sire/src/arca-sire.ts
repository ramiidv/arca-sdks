import { ArcaAuthError, ArcaSdkBase } from '@ramiidv/arca-common';
import type { CallOptions } from '@ramiidv/arca-common';
import { ENDPOINTS, SIRE_SERVICE_ID } from './constants.js';
import { SireClient } from './sire-client.js';
import { buildAnulacionRequest, buildCertificadoRequest } from './validation.js';
import type {
  AnularCertificadoParams,
  ArcaSireConfig,
  CertificadoResult,
  EmitirCertificadoParams,
  SireServerStatus,
  WsAuth,
} from './types.js';

/**
 * SDK del web service SIRE de ARCA para emitir y anular certificados de
 * retención electrónicos de IVA (formulario C2005, RG 4523/2019).
 *
 * Autentica con WSAA (servicio `sire-ws`), valida los datos localmente y
 * serializa el request según el XSD oficial.
 *
 * @example
 * ```ts
 * const sire = new ArcaSire({ cert, key, cuit: '20123456786', production: false });
 * const { certificadoNro, codigoSeguridad } = await sire.emitirCertificado({
 *   regimen: 831,
 *   condicion: Condicion.INSCRIPTO,
 *   fechaRetencion: '2026-10-30T11:16:00',
 *   imposibilidadRetencion: false,
 *   importeRetencion: 2100,
 *   importeBaseCalculo: 20000,
 *   regimenExclusion: false,
 *   tipoComprobante: TipoComprobante.FACTURA,
 *   fechaComprobante: '2026-10-30',
 *   numeroComprobante: '00003-00008497',
 *   importeComprobante: 24200,
 *   cuitRetenido: '30500010912',
 * });
 * ```
 */
export class ArcaSire extends ArcaSdkBase<'sire'> {
  /** Cliente SOAP de bajo nivel. */
  public readonly client: SireClient;

  /** CUIT del agente como número (`cuitAgente` es `xs:long` en el WSDL). */
  private readonly cuitAgente: number;

  /** @throws ArcaValidationError si la CUIT es inválida. */
  constructor(config: ArcaSireConfig) {
    super(config, { sire: SIRE_SERVICE_ID });
    this.cuitAgente = Number(this.cuit);
    this.client = new SireClient({
      endpoint: this.endpoint(ENDPOINTS.sire, config.endpoints?.sire),
      transport: this.transport,
    });
  }

  /**
   * Emite un certificado de retención C2005 (`emitir`).
   *
   * Los datos se validan antes de autenticar (`ArcaValidationError`). Un
   * rechazo de ARCA lanza `ArcaSireServiceError` (no se emitió nada). Un
   * `ArcaSoapError` con `uncertain: true` significa que el certificado pudo
   * haberse emitido: no reintentes a ciegas (ver README, "Resultado incierto").
   * Si SIRE rechaza el token/sign lanza `ArcaAuthError` y descarta el ticket cacheado.
   */
  async emitirCertificado(params: EmitirCertificadoParams, opts?: CallOptions): Promise<CertificadoResult> {
    const certificado = buildCertificadoRequest(params);
    const auth = await this.auth(opts);
    return this.withAuth(() => this.client.emitir(auth, this.cuitAgente, certificado, this.callOptions(opts)));
  }

  /**
   * Anula un certificado C2005 ya emitido (`anular`). Devuelve el número y el
   * código de seguridad del certificado de anulación. Mismo manejo de errores
   * que `emitirCertificado`.
   */
  async anularCertificado(params: AnularCertificadoParams, opts?: CallOptions): Promise<CertificadoResult> {
    const certificadoAnulacion = buildAnulacionRequest(params);
    const auth = await this.auth(opts);
    return this.withAuth(() => this.client.anular(auth, this.cuitAgente, certificadoAnulacion, this.callOptions(opts)));
  }

  /**
   * Estado de los servidores de SIRE (`dummy`, sin autenticación). Incluye el
   * `headerInfo` de la respuesta (ej: `ambiente: "homologacion - 207"`), útil para
   * verificar que se está apuntando al entorno correcto.
   */
  async status(opts?: CallOptions): Promise<SireServerStatus> {
    return this.client.dummy(this.callOptions(opts));
  }

  /** Si SIRE rechaza el token/sign, descarta el ticket cacheado para que el próximo intento pida otro. */
  private async withAuth<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ArcaAuthError) await this.clearAuthCache().catch(() => undefined);
      throw err;
    }
  }

  private async auth(opts?: CallOptions): Promise<WsAuth> {
    const ticket = await this.ticket('sire', opts);
    return { token: ticket.token, sign: ticket.sign };
  }
}
