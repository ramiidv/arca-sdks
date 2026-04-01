import {
  afipSoapCall,
  ensureArray,
  checkServiceErrors,
} from '@ramiidv/arca-common';
import type { ArcaEvent, SoapCallOptions, ServerStatus } from '@ramiidv/arca-common';
import { CTG_ENDPOINTS, CTG_NAMESPACE } from './constants.js';
import type {
  AgroAuth,
  SolicitudCTG,
  CTGResult,
  ConsultaCTGParams,
  ConfirmarArriboCTGParams,
  RechazoCTGParams,
  AnulacionCTGParams,
  CTGActivosResult,
} from './types.js';

export interface CtgClientOptions {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  onEvent?: (event: ArcaEvent) => void;
}

/**
 * Cliente de bajo nivel para WSCTG (Código de Trazabilidad de Granos).
 * Gestiona CTGs para el seguimiento del transporte de granos.
 */
export class CtgClient {
  private readonly endpoint: string;
  private readonly soapOpts: Pick<SoapCallOptions, 'timeout' | 'retries' | 'retryDelayMs' | 'onEvent'>;

  constructor(production: boolean, opts: CtgClientOptions = {}) {
    this.endpoint = production
      ? CTG_ENDPOINTS.production
      : CTG_ENDPOINTS.testing;
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
      CTG_NAMESPACE,
      method,
      params,
      this.soapOpts,
    );
    checkServiceErrors(result, 'WSCTG');
    return result;
  }

  private parseResult(raw: Record<string, unknown>): CTGResult {
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
      fechaEmision: raw['fechaEmision'] as string | undefined,
      vigenciaDesde: raw['vigenciaDesde'] as string | undefined,
      vigenciaHasta: raw['vigenciaHasta'] as string | undefined,
      tarifaReferencia: raw['tarifaReferencia'] as number | undefined,
      estado: raw['estado'] as string | undefined,
      nroCartaPorte: raw['nroCartaPorte'] as number | undefined,
      errores: errores.length > 0 ? errores : undefined,
      eventos: eventos.length > 0 ? eventos : undefined,
      raw,
    };
  }

  // ============================================================
  // Solicitud de CTG
  // ============================================================

  /**
   * Solicita un CTG inicial para el transporte de granos.
   */
  async solicitarCTGInicial(auth: AgroAuth, solicitud: SolicitudCTG): Promise<CTGResult> {
    const result = await this.call('solicitarCTGInicial', {
      auth: {
        token: auth.Token,
        sign: auth.Sign,
        cuitRepresentada: auth.Cuit,
      },
      solicitud,
    });
    return this.parseResult(result);
  }

  // ============================================================
  // Confirmación de arribo
  // ============================================================

  /**
   * Confirma el arribo de un CTG en destino.
   */
  async confirmarArribo(auth: AgroAuth, params: ConfirmarArriboCTGParams): Promise<CTGResult> {
    const result = await this.call('confirmarArribo', {
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
        ...(params.codCosecha !== undefined && { codCosecha: params.codCosecha }),
      },
    });
    return this.parseResult(result);
  }

  // ============================================================
  // Rechazo
  // ============================================================

  /**
   * Rechaza un CTG.
   */
  async rechazarCTG(auth: AgroAuth, params: RechazoCTGParams): Promise<CTGResult> {
    const result = await this.call('rechazarCTG', {
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
   * Anula un CTG.
   */
  async anularCTG(auth: AgroAuth, params: AnulacionCTGParams): Promise<CTGResult> {
    const result = await this.call('anularCTG', {
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
  // Consultas
  // ============================================================

  /**
   * Consulta CTGs según criterios de búsqueda.
   */
  async consultarCTG(auth: AgroAuth, params: ConsultaCTGParams): Promise<CTGResult[]> {
    const result = await this.call('consultarCTG', {
      auth: {
        token: auth.Token,
        sign: auth.Sign,
        cuitRepresentada: auth.Cuit,
      },
      solicitud: params,
    });
    const items = ensureArray(
      (result['consultarCTGDatos'] ?? result['resultado'] ?? result) as Record<string, unknown>[] | Record<string, unknown>,
    );
    return items.map((item) => this.parseResult(item as Record<string, unknown>));
  }

  /**
   * Consulta CTGs y retorna el resultado en formato Excel (base64).
   */
  async consultarCTGExcel(auth: AgroAuth, params: ConsultaCTGParams): Promise<string> {
    const result = await this.call('consultarCTGExcel', {
      auth: {
        token: auth.Token,
        sign: auth.Sign,
        cuitRepresentada: auth.Cuit,
      },
      solicitud: params,
    });
    return String(result['excel'] ?? result['archivo'] ?? '');
  }

  /**
   * Obtiene la constancia PDF de un CTG en base64.
   */
  async consultarConstanciaCTGPDF(auth: AgroAuth, nroCTG: number): Promise<string> {
    const result = await this.call('consultarConstanciaCTGPDF', {
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

  /**
   * Obtiene los CTGs activos (pendientes).
   */
  async obtenerCTGActivos(auth: AgroAuth): Promise<CTGActivosResult> {
    const result = await this.call('obtenerCTGActivos', {
      auth: {
        token: auth.Token,
        sign: auth.Sign,
        cuitRepresentada: auth.Cuit,
      },
    });
    const ctgs = ensureArray(
      (result['ctgActivo'] ?? result['resultado']) as Record<string, unknown>[] | undefined,
    ) as Record<string, unknown>[];
    return {
      ctgs,
      errores: undefined,
      raw: result,
    };
  }

  // ============================================================
  // Estado del servicio
  // ============================================================

  /**
   * Verifica el estado de los servidores del WSCTG.
   */
  async dummy(): Promise<ServerStatus> {
    const result = await afipSoapCall(
      this.endpoint,
      CTG_NAMESPACE,
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
