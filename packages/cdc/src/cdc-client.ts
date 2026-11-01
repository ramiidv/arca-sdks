import { afipSoapCall, ArcaSoapError, checkServiceErrors, ensureArray } from '@ramiidv/arca-common';
import type { ArcaEvent, CallOptions, LegacyTlsMode, ServerStatus } from '@ramiidv/arca-common';
import { WSCDC_NAMESPACE } from './constants.js';
import { buildCmpReq } from './validation.js';
import type {
  CdcAuth,
  CdcMensaje,
  ComprobanteConstatado,
  ConstatarInput,
  ConstatarResult,
  DocTipoItem,
  ModalidadItem,
  OpcionalTipoItem,
  TipoCbteItem,
} from './types.js';

type Raw = Record<string, unknown>;

/** Opciones de transporte del cliente de bajo nivel. */
export interface CdcClientConfig {
  /** URL del WSCDC. */
  endpoint: string;
  timeout?: number;
  retries?: number;
  retryDelayMs?: number;
  onEvent?: (event: ArcaEvent) => void;
  fetch?: typeof fetch;
  legacyTls?: LegacyTlsMode;
}

function invalidResponse(method: string, detail: string): ArcaSoapError {
  return new ArcaSoapError(`Respuesta inválida de WSCDC ${method}: ${detail}`);
}

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

function requireValue(obj: Raw, key: string, method: string): unknown {
  const value = obj[key];
  if (!isPresent(value)) throw invalidResponse(method, `falta ${key}`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return isPresent(value) ? String(value) : undefined;
}

function asRecord(value: unknown): Raw | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : undefined;
}

/** Ítems de un `ArrayOfX`: `ensureArray` sobre el hijo, nunca sobre el contenedor. */
function items(container: unknown, child: string): Raw[] {
  const rec = asRecord(container);
  if (!rec) return [];
  return ensureArray(rec[child] as Raw | Raw[] | undefined).filter((x): x is Raw => asRecord(x) !== undefined);
}

function parseMensajes(container: unknown, child: 'Obs' | 'Evt', method: string): CdcMensaje[] {
  return items(container, child).map((m) => {
    const code = Number(requireValue(m, 'Code', method));
    if (!Number.isInteger(code)) throw invalidResponse(method, `${child}.Code no numérico`);
    return { Code: code, Msg: m['Msg'] === undefined || m['Msg'] === null ? '' : String(m['Msg']) };
  });
}

function parseCmpResp(raw: Raw, method: string): ComprobanteConstatado {
  const num = (key: string): number => {
    const n = Number(requireValue(raw, key, method));
    if (!Number.isFinite(n)) throw invalidResponse(method, `CmpResp.${key} no numérico`);
    return n;
  };
  const cmp: ComprobanteConstatado = {
    CbteModo: String(requireValue(raw, 'CbteModo', method)),
    CuitEmisor: String(requireValue(raw, 'CuitEmisor', method)),
    PtoVta: num('PtoVta'),
    CbteTipo: num('CbteTipo'),
    CbteNro: num('CbteNro'),
    CbteFch: String(requireValue(raw, 'CbteFch', method)),
    ImpTotal: num('ImpTotal'),
    CodAutorizacion: String(requireValue(raw, 'CodAutorizacion', method)),
  };
  const docTipo = optionalString(raw['DocTipoReceptor']);
  if (docTipo !== undefined) cmp.DocTipoReceptor = docTipo;
  const docNro = optionalString(raw['DocNroReceptor']);
  if (docNro !== undefined) cmp.DocNroReceptor = docNro;
  const opcionales = items(raw['Opcionales'], 'Opcional').map((o) => ({
    Id: String(requireValue(o, 'Id', method)),
    Valor: o['Valor'] === undefined || o['Valor'] === null ? '' : String(o['Valor']),
  }));
  if (opcionales.length > 0) cmp.Opcionales = opcionales;
  return cmp;
}

/**
 * Cliente de bajo nivel: un método por operación del WSCDC. No maneja la
 * autenticación: el caller pasa el bloque `Auth`.
 */
export class CdcClient {
  private readonly config: CdcClientConfig;

  constructor(config: CdcClientConfig) {
    this.config = config;
  }

  /** Única llamada SOAP: ASMX con hijos calificados y SOAPAction = namespace + método. Todas son consultas. */
  private call(method: string, params: Raw, opts?: CallOptions): Promise<Raw> {
    const { endpoint, ...transport } = this.config;
    return afipSoapCall(endpoint, WSCDC_NAMESPACE, method, params, {
      ...transport,
      qualified: true,
      soapActionFromMethod: true,
      kind: 'consulta',
      signal: opts?.signal,
    });
  }

  /** Llama a un método de tabla (`ResultGet/<child>`) y verifica `Errors`. */
  private async consultarTabla(method: string, child: string, auth: CdcAuth, opts?: CallOptions): Promise<Raw[]> {
    const result = await this.call(method, { Auth: auth }, opts);
    checkServiceErrors(result, `WSCDC ${method}`);
    return items(result['ResultGet'], child);
  }

  /**
   * `ComprobanteConstatar`: constata un comprobante (CAE, CAI o CAEA).
   *
   * - Errores de formato, autenticación o infraestructura (`Errors`) → `ArcaServiceError`.
   * - Rechazo funcional → `Resultado: 'R'` con el detalle en `Observaciones`.
   */
  async constatar(auth: CdcAuth, input: ConstatarInput, opts?: CallOptions): Promise<ConstatarResult> {
    const method = 'ComprobanteConstatar';
    const cmpReq = buildCmpReq(input);
    const result = await this.call(method, { Auth: auth, CmpReq: cmpReq }, opts);

    checkServiceErrors(result, `WSCDC ${method}`);

    const resultado = requireValue(result, 'Resultado', method);
    if (resultado !== 'A' && resultado !== 'R') {
      throw invalidResponse(method, `Resultado desconocido "${String(resultado)}"`);
    }
    const out: ConstatarResult = {
      Resultado: resultado,
      FchProceso: String(requireValue(result, 'FchProceso', method)),
      Observaciones: parseMensajes(result['Observaciones'], 'Obs', method),
      Events: parseMensajes(result['Events'], 'Evt', method),
    };
    const cmpResp = asRecord(result['CmpResp']);
    if (cmpResp) out.CmpResp = parseCmpResp(cmpResp, method);
    return out;
  }

  /** `ComprobanteDummy`: estado de la infraestructura. No requiere autenticación. */
  async dummy(opts?: CallOptions): Promise<ServerStatus> {
    const method = 'ComprobanteDummy';
    const result = await this.call(method, {}, opts);
    return {
      appserver: String(requireValue(result, 'AppServer', method)),
      dbserver: String(requireValue(result, 'DbServer', method)),
      authserver: String(requireValue(result, 'AuthServer', method)),
    };
  }

  /** `ComprobantesModalidadConsultar`: modalidades de autorización (CAE, CAI, CAEA). */
  async getModalidades(auth: CdcAuth, opts?: CallOptions): Promise<ModalidadItem[]> {
    const method = 'ComprobantesModalidadConsultar';
    const rows = await this.consultarTabla(method, 'FacModTipo', auth, opts);
    return rows.map((raw) => {
      const item: ModalidadItem = {
        Cod: String(requireValue(raw, 'Cod', method)),
        Desc: String(requireValue(raw, 'Desc', method)),
      };
      const desde = optionalString(raw['FchDesde']);
      if (desde !== undefined) item.FchDesde = desde;
      const hasta = optionalString(raw['FchHasta']);
      if (hasta !== undefined) item.FchHasta = hasta;
      return item;
    });
  }

  /** `ComprobantesTipoConsultar`: tipos de comprobante habilitados. */
  async getTiposCbte(auth: CdcAuth, opts?: CallOptions): Promise<TipoCbteItem[]> {
    const method = 'ComprobantesTipoConsultar';
    const rows = await this.consultarTabla(method, 'CbteTipo', auth, opts);
    return rows.map((raw) => {
      const id = Number(requireValue(raw, 'Id', method));
      if (!Number.isInteger(id)) throw invalidResponse(method, 'CbteTipo.Id no numérico');
      return { Id: id, Desc: String(requireValue(raw, 'Desc', method)) };
    });
  }

  /** `DocumentosTipoConsultar`: tipos de documento habilitados. */
  async getDocTipos(auth: CdcAuth, opts?: CallOptions): Promise<DocTipoItem[]> {
    const method = 'DocumentosTipoConsultar';
    const rows = await this.consultarTabla(method, 'DocTipo', auth, opts);
    return rows.map((raw) => ({
      Id: String(requireValue(raw, 'Id', method)),
      Desc: String(requireValue(raw, 'Desc', method)),
    }));
  }

  /** `OpcionalesTipoConsultar`: identificadores válidos para `Opcionales`. */
  async getTiposOpcionales(auth: CdcAuth, opts?: CallOptions): Promise<OpcionalTipoItem[]> {
    const method = 'OpcionalesTipoConsultar';
    const rows = await this.consultarTabla(method, 'OpcionalTipo', auth, opts);
    return rows.map((raw) => ({
      Id: String(requireValue(raw, 'Id', method)),
      Desc: String(requireValue(raw, 'Desc', method)),
    }));
  }
}
