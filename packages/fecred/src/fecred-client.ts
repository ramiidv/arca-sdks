import {
  ArcaAuthError,
  ArcaRechazoError,
  ArcaServiceError,
  ArcaSoapError,
  SoapServiceClient,
  extractServiceErrors,
  formatServiceErrors,
  parseServerStatus,
} from '@ramiidv/arca-common';
import type {
  CallOptions,
  ServerStatus,
  ServiceClientConfig,
  ServiceErrorDetail,
  SoapOperationKind,
} from '@ramiidv/arca-common';
import { FECRED_NAMESPACE } from './constants.js';
import { decode, encode, OBSERVACIONES, REQ, RESP, SERVICE } from './schemas.js';
import type { Schema } from '@ramiidv/arca-common/schema';
import type {
  AceptarFecredParams,
  CodigoDescripcion,
  ConsultarComprobantesParams,
  ConsultarComprobantesResult,
  ConsultarCtaCteResult,
  ConsultarCtasCtesParams,
  ConsultarCtasCtesResult,
  ConsultarCuentasEnAgtDptoCltvResult,
  ConsultarFacturasAgtDptoCltvParams,
  ConsultarFacturasAgtDptoCltvResult,
  ConsultarMontoObligadoRecepcionParams,
  HistorialEstadosComprobanteResult,
  HistorialEstadosCtaCteResult,
  IdComprobante,
  IdComprobanteInput,
  IdCtaCteInput,
  InformarCancelacionTotalParams,
  InformarFacturaAgtDptoCltvParams,
  ModificarOpcionTransferenciaParams,
  MontoObligadoRecepcionResult,
  OperacionFecredResult,
  RechazarFecredParams,
  RechazarNotaDCParams,
  RechazarNotaDCResult,
  TipoRetencion,
  WsAuth,
} from './types.js';

// ---------------------------------------------------------------------------
// Client config
// ---------------------------------------------------------------------------

/**
 * Configuración de `FecredClient`: `endpoint` (ver `ENDPOINTS.wsfecred`) y
 * `transport` opcional. El namespace lo fija el cliente (`FECRED_NAMESPACE`).
 */
export type FecredClientConfig = ServiceClientConfig;

type Xml = Record<string, unknown>;

/**
 * Credenciales para un request: el `WsAuth` o una función que lo obtiene. La
 * función se llama después de validar los parámetros.
 */
export type WsAuthSource = WsAuth | (() => Promise<WsAuth>);

/**
 * Errores de la capa común de autenticación de los WS Java de ARCA
 * (`wscommon_NNN`: token, sign o CUIT representada inválidos o vencidos).
 */
const AUTH_FAULT = /\bwscommon_\d+/i;

/**
 * Un SOAP Fault `wscommon_*` es un rechazo del `authRequest` antes de procesar
 * la operación: se lanza como `ArcaAuthError` (sin `uncertain`), con el
 * `ArcaSoapError` original en `cause`.
 */
function authFault(e: unknown): ArcaAuthError | undefined {
  if (!(e instanceof ArcaSoapError) || e.faultString === undefined) return undefined;
  if (!AUTH_FAULT.test(`${e.faultCode ?? ''} ${e.faultString}`)) return undefined;
  return new ArcaAuthError(`${SERVICE}: ${e.faultString}`, { cause: e });
}

// ---------------------------------------------------------------------------
// FecredClient
// ---------------------------------------------------------------------------

/**
 * Cliente de bajo nivel de WSFECRED (FECredService). Cada método arma el
 * request según el XSD (en orden), valida los datos, detecta los errores de
 * negocio (`arrayErrores`/`arrayErroresFormato` → `ArcaServiceError`) y
 * devuelve la respuesta tipada.
 *
 * Las operaciones que cambian estado en ARCA (aceptar, rechazar, informar,
 * modificar) se envían como `kind: 'emision'`: nunca se reintentan y, si la
 * respuesta se pierde, el `ArcaSoapError` tiene `uncertain = true`. Una
 * emisión con `resultado` `R` se lanza como `ArcaRechazoError`; una respuesta
 * con forma inesperada, como `ArcaResponseError` (`uncertain` en las emisiones).
 *
 * Un SOAP Fault `wscommon_*` (rechazo del `authRequest`) se lanza como
 * `ArcaAuthError`: la operación no se procesó.
 *
 * @example
 * ```ts
 * const client = new FecredClient({ endpoint: ENDPOINTS.wsfecred.testing });
 * ```
 */
export class FecredClient extends SoapServiceClient {
  constructor(config: FecredClientConfig) {
    super({ ...config, namespace: FECRED_NAMESPACE });
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Llama a `method` con el wrapper `<method>Request` (o Body vacío si `auth`
   * es `null`), `SOAPAction = namespace + method`, y chequea errores de negocio:
   * en una emisión, `resultado` `R` → `ArcaRechazoError` (con o sin errores);
   * si no, `arrayErrores`/`arrayErroresFormato` → `ArcaServiceError` (con las
   * observaciones al final de `errors`). La respuesta queda como texto
   * (`parseNumbers: false`) para decodificarla con los schemas.
   */
  private async call(
    method: string,
    authSource: WsAuthSource | null,
    fields: Xml,
    kind: SoapOperationKind,
    opts?: CallOptions,
  ): Promise<Xml> {
    // El auth se resuelve después de validar y armar `fields`: un dato inválido no llega a pedir un TA.
    const auth = typeof authSource === 'function' ? await authSource() : authSource;
    const params: Xml = auth
      ? {
          authRequest: { token: auth.token, sign: auth.sign, cuitRepresentada: auth.cuitRepresentada },
          ...fields,
        }
      : {};
    let result: Xml;
    try {
      result = await this.soapCall(method, params, {
        signal: opts?.signal,
        kind,
        requestElement: auth ? `${method}Request` : null,
        soapActionFromMethod: true,
        parseNumbers: false,
      });
    } catch (e) {
      throw authFault(e) ?? e;
    }
    const errors = extractServiceErrors(result);
    if (kind === 'emision' && result['resultado'] === 'R') {
      const observaciones = this.observaciones(result, method);
      const details = [...errors, ...observaciones];
      throw new ArcaRechazoError(
        `${SERVICE} ${method}: operación rechazada (resultado R)${details.length ? `: ${formatServiceErrors(details)}` : ''}`,
        { operacion: method, errors, observaciones },
      );
    }
    if (errors.some((e) => e.code !== 0 || e.rawCode !== undefined)) {
      const details = [...errors, ...this.observaciones(result, method)];
      throw new ArcaServiceError(`${SERVICE} ${method}: ${formatServiceErrors(details)}`, details);
    }
    return result;
  }

  /** Observaciones de la respuesta (`arrayObservaciones` o `arrayObservacion`) como detalle de error. */
  private observaciones(result: Xml, method: string): ServiceErrorDetail[] {
    try {
      const r = decode<Record<string, CodigoDescripcion[]>>(result, OBSERVACIONES, method, 'consulta');
      return [...r['observaciones']!, ...r['observacion']!].map((o) => ({ code: o.codigo, msg: o.descripcion }));
    } catch {
      // Observaciones ilegibles: se informa el error igual.
      return [];
    }
  }

  /** Consulta: valida el request con `reqSchema` (si hay) y decodifica la respuesta con `respSchema`. */
  private async consulta<T>(
    method: string,
    auth: WsAuthSource,
    params: [input: unknown, schema: Schema] | null,
    respSchema: Schema,
    opts?: CallOptions,
  ): Promise<T> {
    const fields = params ? encode(params[0], params[1], method) : {};
    return decode<T>(await this.call(method, auth, fields, 'consulta', opts), respSchema, method, 'consulta');
  }

  /**
   * Emisión con `resultado`: `R` se lanza como `ArcaRechazoError` (en `call`),
   * así que lo que se devuelve siempre es `A` u `O`. Una respuesta sin
   * `resultado` (o ilegible) lanza `ArcaResponseError` con `uncertain`.
   */
  private async emision<T>(
    method: string,
    auth: WsAuthSource,
    input: unknown,
    reqSchema: Schema,
    respSchema: Schema,
    opts?: CallOptions,
  ): Promise<T> {
    const r = await this.call(method, auth, encode(input, reqSchema, method), 'emision', opts);
    return decode<T>(r, respSchema, method, 'emision');
  }

  // -------------------------------------------------------------------------
  // Health check
  // -------------------------------------------------------------------------

  /** `dummy`: estado de los servidores (sin autenticación). */
  async dummy(opts?: CallOptions): Promise<ServerStatus> {
    return parseServerStatus(await this.call('dummy', null, {}, 'consulta', opts));
  }

  // -------------------------------------------------------------------------
  // Obligación de recepción
  // -------------------------------------------------------------------------

  /** `consultarMontoObligadoRecepcion`: si la CUIT está obligada a recibir FCE y desde qué monto. */
  async consultarMontoObligadoRecepcion(
    auth: WsAuthSource,
    params: ConsultarMontoObligadoRecepcionParams,
    opts?: CallOptions,
  ): Promise<MontoObligadoRecepcionResult> {
    const m = 'consultarMontoObligadoRecepcion';
    return this.consulta(m, auth, [params, REQ[m]], RESP[m], opts);
  }

  // -------------------------------------------------------------------------
  // Cuentas corrientes y comprobantes
  // -------------------------------------------------------------------------

  /** `consultarCtasCtes`: cuentas corrientes (paginado). */
  async consultarCtasCtes(
    auth: WsAuthSource,
    params: ConsultarCtasCtesParams,
    opts?: CallOptions,
  ): Promise<ConsultarCtasCtesResult> {
    const m = 'consultarCtasCtes';
    return this.consulta(m, auth, [params, REQ[m]], RESP[m], opts);
  }

  /** `consultarCtaCte`: detalle de una cuenta corriente. */
  async consultarCtaCte(
    auth: WsAuthSource,
    idCtaCte: IdCtaCteInput,
    opts?: CallOptions,
  ): Promise<ConsultarCtaCteResult> {
    const m = 'consultarCtaCte';
    return this.consulta(m, auth, [{ idCtaCte }, REQ.idCtaCte], RESP[m], opts);
  }

  /** `consultarComprobantes`: facturas y notas FCE (paginado). */
  async consultarComprobantes(
    auth: WsAuthSource,
    params: ConsultarComprobantesParams,
    opts?: CallOptions,
  ): Promise<ConsultarComprobantesResult> {
    const m = 'consultarComprobantes';
    return this.consulta(m, auth, [params, REQ[m]], RESP[m], opts);
  }

  /** `consultarHistorialEstadosComprobante`. */
  async consultarHistorialEstadosComprobante(
    auth: WsAuthSource,
    idComprobante: IdComprobanteInput,
    opts?: CallOptions,
  ): Promise<HistorialEstadosComprobanteResult> {
    const m = 'consultarHistorialEstadosComprobante';
    return this.consulta(m, auth, [{ idComprobante }, REQ.idComprobante], RESP[m], opts);
  }

  /** `consultarHistorialEstadosCtaCte`. */
  async consultarHistorialEstadosCtaCte(
    auth: WsAuthSource,
    idCtaCte: IdCtaCteInput,
    opts?: CallOptions,
  ): Promise<HistorialEstadosCtaCteResult> {
    const m = 'consultarHistorialEstadosCtaCte';
    return this.consulta(m, auth, [{ idCtaCte }, REQ.idCtaCte], RESP[m], opts);
  }

  /** `obtenerRemitos`: remitos asociados a un comprobante. */
  async obtenerRemitos(
    auth: WsAuthSource,
    idComprobante: IdComprobanteInput,
    opts?: CallOptions,
  ): Promise<IdComprobante[]> {
    const m = 'obtenerRemitos';
    const r = await this.consulta<{ remitos: IdComprobante[] }>(
      m,
      auth,
      [{ idComprobante }, REQ.idComprobante],
      RESP[m],
      opts,
    );
    return r.remitos;
  }

  // -------------------------------------------------------------------------
  // Operaciones (emisiones: nunca se reintentan)
  // -------------------------------------------------------------------------

  /** `aceptarFECred`: acepta una factura de crédito. */
  async aceptarFECred(
    auth: WsAuthSource,
    params: AceptarFecredParams,
    opts?: CallOptions,
  ): Promise<OperacionFecredResult> {
    const m = 'aceptarFECred';
    return this.emision(m, auth, params, REQ[m], RESP.operacion, opts);
  }

  /** `rechazarFECred`: rechaza una factura de crédito. */
  async rechazarFECred(
    auth: WsAuthSource,
    params: RechazarFecredParams,
    opts?: CallOptions,
  ): Promise<OperacionFecredResult> {
    const m = 'rechazarFECred';
    return this.emision(m, auth, params, REQ[m], RESP.operacion, opts);
  }

  /** `informarCancelacionTotalFECred`: informa la cancelación total de una FCE aceptada. */
  async informarCancelacionTotalFECred(
    auth: WsAuthSource,
    params: InformarCancelacionTotalParams,
    opts?: CallOptions,
  ): Promise<OperacionFecredResult> {
    const m = 'informarCancelacionTotalFECred';
    return this.emision(m, auth, params, REQ[m], RESP.operacion, opts);
  }

  /** `modificarOpcionTransferencia`: cambia la opción de transferencia (SCA/ADC). */
  async modificarOpcionTransferencia(
    auth: WsAuthSource,
    params: ModificarOpcionTransferenciaParams,
    opts?: CallOptions,
  ): Promise<OperacionFecredResult> {
    const m = 'modificarOpcionTransferencia';
    return this.emision(m, auth, params, REQ[m], RESP.operacion, opts);
  }

  /** `informarFacturaAgtDptoCltv`: informa la factura a un Agente de Depósito Colectivo. */
  async informarFacturaAgtDptoCltv(
    auth: WsAuthSource,
    params: InformarFacturaAgtDptoCltvParams,
    opts?: CallOptions,
  ): Promise<OperacionFecredResult> {
    const m = 'informarFacturaAgtDptoCltv';
    return this.emision(m, auth, params, REQ[m], RESP.operacion, opts);
  }

  /** `rechazarNotaDC`: rechaza una nota de débito/crédito. */
  async rechazarNotaDC(
    auth: WsAuthSource,
    params: RechazarNotaDCParams,
    opts?: CallOptions,
  ): Promise<RechazarNotaDCResult> {
    const m = 'rechazarNotaDC';
    return this.emision(m, auth, params, REQ[m], RESP[m], opts);
  }

  // -------------------------------------------------------------------------
  // Agente de Depósito Colectivo (consultas)
  // -------------------------------------------------------------------------

  /** `consultarCuentasEnAgtDptoCltv`: cuentas de la CUIT representada en Agentes de Depósito Colectivo. */
  async consultarCuentasEnAgtDptoCltv(
    auth: WsAuthSource,
    opts?: CallOptions,
  ): Promise<ConsultarCuentasEnAgtDptoCltvResult> {
    const m = 'consultarCuentasEnAgtDptoCltv';
    return this.consulta(m, auth, null, RESP[m], opts);
  }

  /** `consultarFacturasAgtDptoCltv`: facturas informadas a Agentes de Depósito Colectivo. */
  async consultarFacturasAgtDptoCltv(
    auth: WsAuthSource,
    params: ConsultarFacturasAgtDptoCltvParams = {},
    opts?: CallOptions,
  ): Promise<ConsultarFacturasAgtDptoCltvResult> {
    const m = 'consultarFacturasAgtDptoCltv';
    return this.consulta(m, auth, [params, REQ[m]], RESP[m], opts);
  }

  // -------------------------------------------------------------------------
  // Tablas de parámetros
  // -------------------------------------------------------------------------

  /** `consultarTiposRetenciones`. */
  async consultarTiposRetenciones(auth: WsAuthSource, opts?: CallOptions): Promise<TipoRetencion[]> {
    const m = 'consultarTiposRetenciones';
    return (await this.consulta<{ tipos: TipoRetencion[] }>(m, auth, null, RESP[m], opts)).tipos;
  }

  private async codigosDescripciones(
    method: string,
    auth: WsAuthSource,
    opts?: CallOptions,
  ): Promise<CodigoDescripcion[]> {
    const r = await this.consulta<{ codigos: CodigoDescripcion[] }>(
      method,
      auth,
      null,
      RESP.codigosDescripciones,
      opts,
    );
    return r.codigos;
  }

  /** `consultarTiposFormasCancelacion`. */
  async consultarTiposFormasCancelacion(auth: WsAuthSource, opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.codigosDescripciones('consultarTiposFormasCancelacion', auth, opts);
  }

  /** `consultarTiposMotivosRechazo`. */
  async consultarTiposMotivosRechazo(auth: WsAuthSource, opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.codigosDescripciones('consultarTiposMotivosRechazo', auth, opts);
  }

  /** `consultarTiposAjustesOperacion`. */
  async consultarTiposAjustesOperacion(auth: WsAuthSource, opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.codigosDescripciones('consultarTiposAjustesOperacion', auth, opts);
  }
}
