import { ArcaSoapError, checkServiceErrors, parseServerStatus, SoapServiceClient } from '@ramiidv/arca-common';
import type { CallOptions, ServerStatus, ServiceTransport } from '@ramiidv/arca-common';
import { decodeResponse, obj, wrapped, xml } from '@ramiidv/arca-common/schema';
import type { Schema } from '@ramiidv/arca-common/schema';
import { WSCDC_NAMESPACE } from './constants.js';
import * as S from './schemas.js';
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

/** Endpoint y opciones de transporte del cliente de bajo nivel. */
export interface CdcClientConfig extends ServiceTransport {
  /** URL del WSCDC. */
  endpoint: string;
}

const responseError = (message: string) => new ArcaSoapError(`WSCDC ${message}`);

function isRecord(value: unknown): value is Raw {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Quita los elementos vacíos (`<FchHasta/>`, ítems `nillable` como `<Obs/>`):
 * ARCA los omite o los manda vacíos indistintamente, y vacío equivale a ausente.
 */
function dropEmpty(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropEmpty).filter((v) => v !== '');
  if (!isRecord(value)) return value;
  const out: Raw = {};
  for (const [k, v] of Object.entries(value)) {
    const clean = dropEmpty(v);
    if (clean !== '') out[k] = clean;
  }
  return out;
}

function decode<T>(node: unknown, schema: Schema, path: string): T {
  return decodeResponse<T>(dropEmpty(node), schema, path, { error: responseError });
}

type MensajeRaw = { code: number; msg?: string };
const mensajes = (list: MensajeRaw[]): CdcMensaje[] => list.map((m) => ({ code: m.code, msg: m.msg ?? '' }));

/** Bloque `Auth` con los nombres del XML. */
const authXml = (auth: CdcAuth) => ({ Token: auth.token, Sign: auth.sign, Cuit: auth.cuit });

function parseCmpResp(raw: Raw, method: string): ComprobanteConstatado {
  const { opcionales, ...cmp } = decode<ComprobanteConstatado>(raw, S.CMP_RESP, `${method}.CmpResp`);
  if (!opcionales?.length) return cmp;
  return { ...cmp, opcionales: opcionales.map((o) => ({ id: o.id, valor: o.valor ?? '' })) };
}

/**
 * Cliente de bajo nivel: un método por operación del WSCDC. No maneja la
 * autenticación: el caller pasa el bloque `Auth`.
 */
export class CdcClient extends SoapServiceClient {
  constructor({ endpoint, ...transport }: CdcClientConfig) {
    super({ endpoint, namespace: WSCDC_NAMESPACE, transport });
  }

  /**
   * Única llamada SOAP: ASMX con hijos calificados y SOAPAction = namespace + método. Todas son consultas.
   * La respuesta queda como texto (`parseNumbers: false`): la convierte el schema de cada operación.
   */
  private call(method: string, params: Raw, opts?: CallOptions): Promise<Raw> {
    return this.soapCall(method, params, {
      qualified: true,
      soapActionFromMethod: true,
      parseNumbers: false,
      signal: opts?.signal,
    });
  }

  /** Llama a un método de tabla (`ResultGet/<child>`), verifica `Errors` y decodifica los ítems. */
  private async consultarTabla<T>(
    method: string,
    child: string,
    item: Schema,
    auth: CdcAuth,
    opts?: CallOptions,
  ): Promise<T[]> {
    const result = await this.call(method, { Auth: authXml(auth) }, opts);
    checkServiceErrors(result, `WSCDC ${method}`);
    return decode<{ resultGet: T[] }>(result, { resultGet: xml('ResultGet', wrapped(child, obj(item), 0)) }, method)
      .resultGet;
  }

  /**
   * `ComprobanteConstatar`: constata un comprobante (CAE, CAI o CAEA).
   *
   * - Errores de formato, autenticación o infraestructura (`Errors`) → `ArcaServiceError`.
   * - Rechazo funcional → `resultado: 'R'` con el detalle en `observaciones`.
   */
  async constatar(auth: CdcAuth, input: ConstatarInput, opts?: CallOptions): Promise<ConstatarResult> {
    const method = 'ComprobanteConstatar';
    const cmpReq = buildCmpReq(input);
    const result = await this.call(method, { Auth: authXml(auth), CmpReq: cmpReq }, opts);

    checkServiceErrors(result, `WSCDC ${method}`);

    const r = decode<{ resultado: string; fchProceso: string; observaciones: MensajeRaw[]; events: MensajeRaw[] }>(
      result,
      S.CONSTATAR_RESP,
      method,
    );
    if (r.resultado !== 'A' && r.resultado !== 'R') {
      throw responseError(`Respuesta inválida: ${method}.Resultado desconocido "${r.resultado}"`);
    }
    const out: ConstatarResult = {
      resultado: r.resultado,
      fchProceso: r.fchProceso,
      observaciones: mensajes(r.observaciones),
      events: mensajes(r.events),
    };
    if (isRecord(result['CmpResp'])) out.cmpResp = parseCmpResp(result['CmpResp'], method);
    return out;
  }

  /** `ComprobanteDummy`: estado de la infraestructura. No requiere autenticación. */
  async dummy(opts?: CallOptions): Promise<ServerStatus> {
    const method = 'ComprobanteDummy';
    return parseServerStatus(await this.call(method, {}, opts), `WSCDC ${method}`);
  }

  /** `ComprobantesModalidadConsultar`: modalidades de autorización (CAE, CAI, CAEA). */
  async getModalidades(auth: CdcAuth, opts?: CallOptions): Promise<ModalidadItem[]> {
    return this.consultarTabla('ComprobantesModalidadConsultar', 'FacModTipo', S.FAC_MOD_TIPO, auth, opts);
  }

  /** `ComprobantesTipoConsultar`: tipos de comprobante habilitados. */
  async getTiposCbte(auth: CdcAuth, opts?: CallOptions): Promise<TipoCbteItem[]> {
    return this.consultarTabla('ComprobantesTipoConsultar', 'CbteTipo', S.CBTE_TIPO, auth, opts);
  }

  /** `DocumentosTipoConsultar`: tipos de documento habilitados. */
  async getDocTipos(auth: CdcAuth, opts?: CallOptions): Promise<DocTipoItem[]> {
    return this.consultarTabla('DocumentosTipoConsultar', 'DocTipo', S.ID_DESC, auth, opts);
  }

  /** `OpcionalesTipoConsultar`: identificadores válidos para `Opcionales`. */
  async getTiposOpcionales(auth: CdcAuth, opts?: CallOptions): Promise<OpcionalTipoItem[]> {
    return this.consultarTabla('OpcionalesTipoConsultar', 'OpcionalTipo', S.ID_DESC, auth, opts);
  }
}
