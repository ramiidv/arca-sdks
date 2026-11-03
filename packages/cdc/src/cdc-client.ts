import {
  ArcaResponseError,
  checkServiceErrors,
  parseServerStatus,
  SoapServiceClient,
  validateCuit,
} from '@ramiidv/arca-common';
import type { CallOptions, ServerStatus, ServiceClientConfig } from '@ramiidv/arca-common';
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
  ListaCdc,
  ModalidadItem,
  OpcionalTipoItem,
  TipoCbteItem,
} from './types.js';

type Raw = Record<string, unknown>;

/**
 * Configuración del cliente de bajo nivel: `{ endpoint, transport? }` (el
 * namespace lo fija el cliente). `endpoint`: ver `ENDPOINTS.wscdc`.
 */
export type CdcClientConfig = ServiceClientConfig;

function isRecord(value: unknown): value is Raw {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Quita los elementos vacíos (`<FchHasta/>`, ítems `nillable` como `<Obs/>`):
 * ARCA los omite o los manda vacíos indistintamente, y vacío equivale a ausente.
 * El DSL no lo hace solo: decodifica `<FchHasta/>` como `''` y un ítem vacío
 * como un objeto sin datos (`emptyLists: 'omit'` solo omite las listas ausentes).
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

/** Decodifica una respuesta (todas son consultas: un error es `ArcaResponseError` sin `uncertain`). */
function decode<T>(node: unknown, schema: Schema, path: string): T {
  return decodeResponse<T>(dropEmpty(node), schema, path, { kind: 'consulta' });
}

type MensajeRaw = { code: number; msg?: string };
const mensajes = (list: MensajeRaw[]): CdcMensaje[] => list.map((m) => ({ code: m.code, msg: m.msg ?? '' }));

/**
 * Bloque `Auth` con los nombres del XML. La CUIT se valida (dígito verificador) y
 * se envía normalizada a 11 dígitos.
 * @throws ArcaValidationError si `auth.cuit` es inválida.
 */
const authXml = (auth: CdcAuth) => ({ Token: auth.token, Sign: auth.sign, Cuit: validateCuit(auth.cuit, 'cuit') });

function parseCmpResp(raw: Raw, method: string): ComprobanteConstatado {
  const { opcionales, ...cmp } = decode<ComprobanteConstatado>(raw, S.CMP_RESP, `${method}.CmpResp`);
  if (!opcionales?.length) return cmp;
  return { ...cmp, opcionales: opcionales.map((o) => ({ id: o.id, valor: o.valor ?? '' })) };
}

/**
 * Agrega los `Events` de ARCA a una lista como propiedad no enumerable
 * `eventos` (no aparece al iterar, serializar ni copiar el array).
 */
function conEventos<T>(items: T[], eventos: CdcMensaje[]): ListaCdc<T> {
  if (eventos.length > 0) {
    Object.defineProperty(items, 'eventos', { value: eventos, enumerable: false, writable: true, configurable: true });
  }
  return items;
}

/**
 * Cliente de bajo nivel: un método por operación del WSCDC. No maneja la
 * autenticación: el caller pasa el bloque `Auth`.
 */
export class CdcClient extends SoapServiceClient {
  constructor(config: CdcClientConfig) {
    super({ endpoint: config.endpoint, transport: config.transport, namespace: WSCDC_NAMESPACE });
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

  /**
   * Llama a un método de tabla (`ResultGet/<child>`), verifica `Errors` y
   * decodifica los ítems (`Desc` ausente queda como `''`) y los `Events`.
   */
  private async consultarTabla<T extends { desc: string }>(
    method: string,
    child: string,
    item: Schema,
    auth: CdcAuth,
    opts?: CallOptions,
  ): Promise<ListaCdc<T>> {
    const result = await this.call(method, { Auth: authXml(auth) }, opts);
    checkServiceErrors(result, `WSCDC ${method}`);
    const r = decode<{ resultGet: T[]; eventos: MensajeRaw[] }>(
      result,
      { resultGet: xml('ResultGet', wrapped(child, obj(item), 0)), eventos: S.EVENTS },
      method,
    );
    return conEventos(
      r.resultGet.map((i) => ({ ...i, desc: i.desc ?? '' })),
      mensajes(r.eventos),
    );
  }

  /**
   * `ComprobanteConstatar`: constata un comprobante (CAE, CAI o CAEA).
   *
   * - Errores de formato, autenticación o infraestructura (`Errors`) → `ArcaServiceError`.
   * - Comprobante no constatado → `resultado: 'R'` con el detalle en `observaciones`
   *   (es una consulta: no lanza `ArcaRechazoError`). Si en
   *   un rechazo `CmpResp` viene incompleto, se devuelve sin `cmpResp`.
   * @throws ArcaValidationError si el input o `auth.cuit` son inválidos (antes de llamar a ARCA).
   * @throws ArcaResponseError si la respuesta no tiene la forma esperada.
   */
  async constatar(auth: CdcAuth, input: ConstatarInput, opts?: CallOptions): Promise<ConstatarResult> {
    return this.constatarCmpReq(auth, buildCmpReq(input), opts);
  }

  /**
   * `ComprobanteConstatar` con el `CmpReq` ya validado y normalizado por
   * `buildCmpReq` (lo usa `ArcaCdc`, que valida antes de autenticarse).
   * @internal
   */
  async constatarCmpReq(auth: CdcAuth, cmpReq: Record<string, unknown>, opts?: CallOptions): Promise<ConstatarResult> {
    const method = 'ComprobanteConstatar';
    const result = await this.call(method, { Auth: authXml(auth), CmpReq: cmpReq }, opts);

    checkServiceErrors(result, `WSCDC ${method}`);

    const r = decode<{ resultado: string; fchProceso: string; observaciones: MensajeRaw[]; eventos: MensajeRaw[] }>(
      result,
      S.CONSTATAR_RESP,
      method,
    );
    if (r.resultado !== 'A' && r.resultado !== 'R') {
      throw new ArcaResponseError(`Respuesta inválida: ${method}.Resultado desconocido "${r.resultado}"`);
    }
    const out: ConstatarResult = {
      resultado: r.resultado,
      fchProceso: r.fchProceso,
      observaciones: mensajes(r.observaciones),
      eventos: mensajes(r.eventos),
    };
    if (isRecord(result['CmpResp'])) {
      try {
        out.cmpResp = parseCmpResp(result['CmpResp'], method);
      } catch (err) {
        // En un rechazo, ARCA puede devolver `CmpResp` incompleto (todos sus campos son
        // minOccurs=0): lo que importa es `resultado` + `observaciones`.
        if (!(err instanceof ArcaResponseError) || r.resultado !== 'R') throw err;
      }
    }
    return out;
  }

  /** `ComprobanteDummy`: estado de la infraestructura. No requiere autenticación. */
  async dummy(opts?: CallOptions): Promise<ServerStatus> {
    const method = 'ComprobanteDummy';
    return parseServerStatus(await this.call(method, {}, opts), `WSCDC ${method}`);
  }

  /** `ComprobantesModalidadConsultar`: modalidades de autorización (CAE, CAI, CAEA). */
  async getModalidades(auth: CdcAuth, opts?: CallOptions): Promise<ListaCdc<ModalidadItem>> {
    return this.consultarTabla('ComprobantesModalidadConsultar', 'FacModTipo', S.FAC_MOD_TIPO, auth, opts);
  }

  /** `ComprobantesTipoConsultar`: tipos de comprobante habilitados. */
  async getTiposCbte(auth: CdcAuth, opts?: CallOptions): Promise<ListaCdc<TipoCbteItem>> {
    return this.consultarTabla('ComprobantesTipoConsultar', 'CbteTipo', S.CBTE_TIPO, auth, opts);
  }

  /** `DocumentosTipoConsultar`: tipos de documento habilitados. */
  async getDocTipos(auth: CdcAuth, opts?: CallOptions): Promise<ListaCdc<DocTipoItem>> {
    return this.consultarTabla('DocumentosTipoConsultar', 'DocTipo', S.ID_DESC, auth, opts);
  }

  /** `OpcionalesTipoConsultar`: identificadores válidos para `Opcionales`. */
  async getTiposOpcionales(auth: CdcAuth, opts?: CallOptions): Promise<ListaCdc<OpcionalTipoItem>> {
    return this.consultarTabla('OpcionalesTipoConsultar', 'OpcionalTipo', S.ID_DESC, auth, opts);
  }
}
