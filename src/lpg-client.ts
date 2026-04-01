import {
  afipSoapCall,
  ensureArray,
  checkServiceErrors,
} from '@ramiidv/arca-common';
import type { ArcaEvent, SoapCallOptions, ServerStatus } from '@ramiidv/arca-common';
import { LPG_ENDPOINTS, LPG_NAMESPACE } from './constants.js';
import type {
  AgroAuth,
  Liquidacion,
  LiquidacionResult,
  ConsultaLiquidacionParams,
  AjusteUnificadoParams,
  Certificacion,
  CertificacionResult,
  LpgParameterQueryParams,
} from './types.js';

export interface LpgClientOptions {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  onEvent?: (event: ArcaEvent) => void;
}

/**
 * Cliente de bajo nivel para WSLPG (Liquidación Primaria de Granos).
 * Gestiona liquidaciones y certificaciones de operaciones de granos.
 */
export class LpgClient {
  private readonly endpoint: string;
  private readonly soapOpts: Pick<SoapCallOptions, 'timeout' | 'retries' | 'retryDelayMs' | 'onEvent'>;

  constructor(production: boolean, opts: LpgClientOptions = {}) {
    this.endpoint = production
      ? LPG_ENDPOINTS.production
      : LPG_ENDPOINTS.testing;
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
      LPG_NAMESPACE,
      method,
      params,
      this.soapOpts,
    );
    checkServiceErrors(result, 'WSLPG');
    return result;
  }

  private parseLiquidacionResult(raw: Record<string, unknown>): LiquidacionResult {
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
      codOperacion: raw['codOperacion'] as number | undefined,
      nroOrden: raw['nroOrden'] as number | undefined,
      fechaLiquidacion: raw['fechaLiquidacion'] as string | undefined,
      totalPagar: raw['totalPagar'] as number | undefined,
      totalDeducciones: raw['totalDeducciones'] as number | undefined,
      totalPesoNeto: raw['totalPesoNeto'] as number | undefined,
      nroContrato: raw['nroContrato'] as number | undefined,
      resultado: raw['resultado'] as string | undefined,
      errores: errores.length > 0 ? errores : undefined,
      eventos: eventos.length > 0 ? eventos : undefined,
      raw,
    };
  }

  private parseCertificacionResult(raw: Record<string, unknown>): CertificacionResult {
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
      nroCertificacion: raw['nroCertificacion'] as number | undefined,
      codOperacion: raw['codOperacion'] as number | undefined,
      fechaCertificacion: raw['fechaCertificacion'] as string | undefined,
      resultado: raw['resultado'] as string | undefined,
      errores: errores.length > 0 ? errores : undefined,
      eventos: eventos.length > 0 ? eventos : undefined,
      raw,
    };
  }

  // ============================================================
  // Liquidaciones
  // ============================================================

  /**
   * Autoriza una liquidación primaria de granos.
   */
  async liquidacionAutorizar(auth: AgroAuth, liquidacion: Liquidacion): Promise<LiquidacionResult> {
    const result = await this.call('liquidacionAutorizar', {
      auth: {
        token: auth.Token,
        sign: auth.Sign,
        cuitRepresentada: auth.Cuit,
      },
      liquidacion,
    });
    return this.parseLiquidacionResult(result);
  }

  /**
   * Consulta una liquidación previamente autorizada.
   */
  async liquidacionConsultar(auth: AgroAuth, params: ConsultaLiquidacionParams): Promise<LiquidacionResult[]> {
    const result = await this.call('liquidacionConsultar', {
      auth: {
        token: auth.Token,
        sign: auth.Sign,
        cuitRepresentada: auth.Cuit,
      },
      solicitud: params,
    });
    const items = ensureArray(
      (result['liquidacion'] ?? result['resultado'] ?? result) as Record<string, unknown>[] | Record<string, unknown>,
    );
    return items.map((item) => this.parseLiquidacionResult(item as Record<string, unknown>));
  }

  /**
   * Anula una liquidación previamente autorizada.
   */
  async liquidacionAnular(auth: AgroAuth, ptoEmision: number, nroOrden: number): Promise<LiquidacionResult> {
    const result = await this.call('liquidacionAnular', {
      auth: {
        token: auth.Token,
        sign: auth.Sign,
        cuitRepresentada: auth.Cuit,
      },
      solicitud: {
        ptoEmision,
        nroOrden,
      },
    });
    return this.parseLiquidacionResult(result);
  }

  /**
   * Ajusta una liquidación mediante ajuste unificado (débito/crédito en un solo paso).
   */
  async liquidacionAjustarUnificado(auth: AgroAuth, params: AjusteUnificadoParams): Promise<LiquidacionResult> {
    const result = await this.call('liquidacionAjustarUnificado', {
      auth: {
        token: auth.Token,
        sign: auth.Sign,
        cuitRepresentada: auth.Cuit,
      },
      solicitud: {
        nroOrdenOriginal: params.nroOrdenOriginal,
        ptoEmisionOriginal: params.ptoEmisionOriginal,
        tipoAjuste: params.tipoAjuste,
        liquidacion: params.liquidacion,
        ...(params.observaciones !== undefined && { observaciones: params.observaciones }),
      },
    });
    return this.parseLiquidacionResult(result);
  }

  // ============================================================
  // Certificaciones
  // ============================================================

  /**
   * Autoriza una certificación de granos (depósito, retiro, transferencia, preexistencia).
   */
  async certificacionAutorizar(auth: AgroAuth, certificacion: Certificacion): Promise<CertificacionResult> {
    const result = await this.call('certificacionAutorizar', {
      auth: {
        token: auth.Token,
        sign: auth.Sign,
        cuitRepresentada: auth.Cuit,
      },
      certificacion,
    });
    return this.parseCertificacionResult(result);
  }

  /**
   * Anula una certificación previamente autorizada.
   */
  async certificacionAnular(auth: AgroAuth, tipoCertificacion: number, nroCertificacion: number): Promise<CertificacionResult> {
    const result = await this.call('certificacionAnular', {
      auth: {
        token: auth.Token,
        sign: auth.Sign,
        cuitRepresentada: auth.Cuit,
      },
      solicitud: {
        tipoCertificacion,
        nroCertificacion,
      },
    });
    return this.parseCertificacionResult(result);
  }

  // ============================================================
  // Consultas de parámetros
  // ============================================================

  /**
   * Consulta de parámetros genérica del WSLPG.
   * Puede consultar tipos de grano, grados, puertos, tipos de operación, etc.
   */
  async consultarParametros(auth: AgroAuth, tipoParametro: string, params?: LpgParameterQueryParams): Promise<Record<string, unknown>[]> {
    const result = await this.call(tipoParametro, {
      auth: {
        token: auth.Token,
        sign: auth.Sign,
        cuitRepresentada: auth.Cuit,
      },
      ...(params ?? {}),
    });
    // El resultado viene en un key que varía según el tipo de parámetro
    const values = Object.values(result).find((v) => Array.isArray(v) || (typeof v === 'object' && v !== null));
    return ensureArray(values as Record<string, unknown>[] | Record<string, unknown> | undefined);
  }

  // ============================================================
  // Estado del servicio
  // ============================================================

  /**
   * Verifica el estado de los servidores del WSLPG.
   */
  async dummy(): Promise<ServerStatus> {
    const result = await afipSoapCall(
      this.endpoint,
      LPG_NAMESPACE,
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
