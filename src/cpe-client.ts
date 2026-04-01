import {
  afipSoapCall,
  ensureArray,
  checkServiceErrors,
} from '@ramiidv/arca-common';
import type { ArcaEvent, SoapCallOptions, ServerStatus } from '@ramiidv/arca-common';
import { CPE_ENDPOINTS, CPE_NAMESPACE } from './constants.js';
import type {
  AgroAuth,
  CartaPorteAutomotor,
  CartaPorteResult,
  ConsultaCPEParams,
  ConsultaCPEPorDestinoParams,
  ConfirmadoArriboCPEParams,
  RechazoAnulacionCPEParams,
  EditarCPEParams,
  ContingenciaCPEParams,
} from './types.js';

export interface CpeClientOptions {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  onEvent?: (event: ArcaEvent) => void;
}

/**
 * Cliente de bajo nivel para WSCPE (Carta de Porte Electrónica).
 * Maneja el transporte de granos por vía automotor.
 */
export class CpeClient {
  private readonly endpoint: string;
  private readonly soapOpts: Pick<SoapCallOptions, 'timeout' | 'retries' | 'retryDelayMs' | 'onEvent'>;

  constructor(production: boolean, opts: CpeClientOptions = {}) {
    this.endpoint = production
      ? CPE_ENDPOINTS.production
      : CPE_ENDPOINTS.testing;
    this.soapOpts = {
      timeout: opts.timeoutMs,
      retries: opts.retries,
      retryDelayMs: opts.retryDelayMs,
      onEvent: opts.onEvent,
    };
  }

  private async call(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const result = await afipSoapCall(
      this.endpoint,
      CPE_NAMESPACE,
      method,
      params,
      this.soapOpts,
    );
    checkServiceErrors(result, 'WSCPE');
    return result;
  }

  private parseResult(raw: Record<string, unknown>): CartaPorteResult {
    const errores = ensureArray(
      (raw['errores'] ?? raw['arrayErrores']) as Record<string, unknown>[] | undefined,
    ).map((e) => ({
      Code: Number(e['codigo'] ?? e['Code'] ?? 0),
      Msg: String(e['descripcion'] ?? e['Msg'] ?? ''),
    }));

    const eventos = ensureArray(
      (raw['eventos'] ?? raw['arrayEventos']) as Record<string, unknown>[] | undefined,
    ).map((e) => ({
      Code: Number(e['codigo'] ?? e['Code'] ?? 0),
      Msg: String(e['descripcion'] ?? e['Msg'] ?? ''),
    }));

    return {
      nroCTG: raw['nroCTG'] as number | undefined,
      nroCartaPorte: raw['nroCartaPorte'] as number | undefined,
      nroOrden: raw['nroOrden'] as number | undefined,
      fechaEmision: raw['fechaEmision'] as string | undefined,
      fechaVencimiento: raw['fechaVencimiento'] as string | undefined,
      estado: raw['estado'] as string | undefined,
      errores: errores.length > 0 ? errores : undefined,
      eventos: eventos.length > 0 ? eventos : undefined,
      raw,
    };
  }

  // ============================================================
  // Autorización
  // ============================================================

  /**
   * Autoriza una Carta de Porte Electrónica para transporte automotor.
   */
  async autorizarCPEAutomotor(auth: AgroAuth, cpe: CartaPorteAutomotor): Promise<CartaPorteResult> {
    const { cuitTitularCartaPorte, sucursal, nroOrden, ...rest } = cpe;
    const result = await this.call('autorizarCPEAutomotor', {
      auth: {
        token: auth.Token,
        sign: auth.Sign,
        cuitRepresentada: auth.Cuit,
      },
      solicitud: {
        cuitTitularCartaPorte,
        sucursal,
        nroOrden,
        ...rest,
      },
    });
    return this.parseResult(result);
  }

  // ============================================================
  // Confirmación de arribo
  // ============================================================

  /**
   * Confirma el arribo de una CPE en destino.
   */
  async confirmadoArriboCPE(auth: AgroAuth, params: ConfirmadoArriboCPEParams): Promise<CartaPorteResult> {
    const result = await this.call('confirmadoArriboCPE', {
      auth: {
        token: auth.Token,
        sign: auth.Sign,
        cuitRepresentada: auth.Cuit,
      },
      solicitud: {
        nroCTG: params.nroCTG,
        nroCartaPorte: params.nroCartaPorte,
        cuitDestino: params.cuitDestino,
        pesoNeto: params.pesoNeto,
        fechaArribo: params.fechaArribo,
      },
    });
    return this.parseResult(result);
  }

  // ============================================================
  // Rechazo
  // ============================================================

  /**
   * Rechaza una CPE.
   */
  async rechazoCPE(auth: AgroAuth, params: RechazoAnulacionCPEParams): Promise<CartaPorteResult> {
    const result = await this.call('rechazoCPE', {
      auth: {
        token: auth.Token,
        sign: auth.Sign,
        cuitRepresentada: auth.Cuit,
      },
      solicitud: {
        nroCTG: params.nroCTG,
        nroCartaPorte: params.nroCartaPorte,
        codMotivo: params.codMotivo,
        ...(params.observaciones !== undefined && { observaciones: params.observaciones }),
      },
    });
    return this.parseResult(result);
  }

  // ============================================================
  // Anulación
  // ============================================================

  /**
   * Anula una CPE.
   */
  async anularCPE(auth: AgroAuth, params: RechazoAnulacionCPEParams): Promise<CartaPorteResult> {
    const result = await this.call('anularCPE', {
      auth: {
        token: auth.Token,
        sign: auth.Sign,
        cuitRepresentada: auth.Cuit,
      },
      solicitud: {
        nroCTG: params.nroCTG,
        nroCartaPorte: params.nroCartaPorte,
        codMotivo: params.codMotivo,
        ...(params.observaciones !== undefined && { observaciones: params.observaciones }),
      },
    });
    return this.parseResult(result);
  }

  // ============================================================
  // Edición
  // ============================================================

  /**
   * Edita campos de una CPE previamente autorizada.
   */
  async editarCPE(auth: AgroAuth, params: EditarCPEParams): Promise<CartaPorteResult> {
    const { nroCTG, nroCartaPorte, ...campos } = params;
    const result = await this.call('editarCPE', {
      auth: {
        token: auth.Token,
        sign: auth.Sign,
        cuitRepresentada: auth.Cuit,
      },
      solicitud: {
        nroCTG,
        nroCartaPorte,
        ...campos,
      },
    });
    return this.parseResult(result);
  }

  // ============================================================
  // Contingencia
  // ============================================================

  /**
   * Informa una contingencia sobre una CPE.
   */
  async informarContingencia(auth: AgroAuth, params: ContingenciaCPEParams): Promise<CartaPorteResult> {
    const result = await this.call('informarContingencia', {
      auth: {
        token: auth.Token,
        sign: auth.Sign,
        cuitRepresentada: auth.Cuit,
      },
      solicitud: {
        nroCTG: params.nroCTG,
        nroCartaPorte: params.nroCartaPorte,
        tipoContingencia: params.tipoContingencia,
        ...(params.observaciones !== undefined && { observaciones: params.observaciones }),
      },
    });
    return this.parseResult(result);
  }

  // ============================================================
  // Consultas
  // ============================================================

  /**
   * Consulta CPEs según criterios de búsqueda.
   */
  async consultarCPE(auth: AgroAuth, params: ConsultaCPEParams): Promise<CartaPorteResult[]> {
    const result = await this.call('consultarCPE', {
      auth: {
        token: auth.Token,
        sign: auth.Sign,
        cuitRepresentada: auth.Cuit,
      },
      solicitud: params,
    });
    const items = ensureArray(
      (result['cartaPorte'] ?? result['resultado'] ?? result) as Record<string, unknown>[] | Record<string, unknown>,
    );
    return items.map((item) => this.parseResult(item as Record<string, unknown>));
  }

  /**
   * Consulta CPEs por destino.
   */
  async consultarCPEPorDestino(auth: AgroAuth, params: ConsultaCPEPorDestinoParams): Promise<CartaPorteResult[]> {
    const result = await this.call('consultarCPEPorDestino', {
      auth: {
        token: auth.Token,
        sign: auth.Sign,
        cuitRepresentada: auth.Cuit,
      },
      solicitud: {
        cuitDestino: params.cuitDestino,
        fechaDesde: params.fechaDesde,
        fechaHasta: params.fechaHasta,
        ...(params.codGrano !== undefined && { codGrano: params.codGrano }),
        ...(params.estado !== undefined && { estado: params.estado }),
      },
    });
    const items = ensureArray(
      (result['cartaPorte'] ?? result['resultado'] ?? result) as Record<string, unknown>[] | Record<string, unknown>,
    );
    return items.map((item) => this.parseResult(item as Record<string, unknown>));
  }

  /**
   * Consulta el último número de orden utilizado.
   */
  async consultarUltNroOrden(auth: AgroAuth, sucursal: number): Promise<number> {
    const result = await this.call('consultarUltNroOrden', {
      auth: {
        token: auth.Token,
        sign: auth.Sign,
        cuitRepresentada: auth.Cuit,
      },
      solicitud: {
        sucursal,
      },
    });
    return Number(result['nroOrden'] ?? 0);
  }

  /**
   * Obtiene la constancia PDF de una CPE en base64.
   */
  async consultarConstanciaCPEPDF(auth: AgroAuth, nroCTG: number): Promise<string> {
    const result = await this.call('consultarConstanciaCPEPDF', {
      auth: {
        token: auth.Token,
        sign: auth.Sign,
        cuitRepresentada: auth.Cuit,
      },
      solicitud: {
        nroCTG,
      },
    });
    return String(result['pdf'] ?? result['constancia'] ?? '');
  }

  // ============================================================
  // Estado del servicio
  // ============================================================

  /**
   * Verifica el estado de los servidores del WSCPE.
   */
  async dummy(): Promise<ServerStatus> {
    const result = await afipSoapCall(
      this.endpoint,
      CPE_NAMESPACE,
      'dummy',
      {},
      this.soapOpts,
    );
    return {
      appserver: String(result['appserver'] ?? result['AppServer'] ?? ''),
      dbserver: String(result['dbserver'] ?? result['DbServer'] ?? ''),
      authserver: String(result['authserver'] ?? result['AuthServer'] ?? ''),
    };
  }
}
