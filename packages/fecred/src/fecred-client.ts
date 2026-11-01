import { afipSoapCall } from '@ramiidv/arca-common';
import type {
  ArcaEvent,
  CallOptions,
  LegacyTlsMode,
  ServerStatus,
  SoapOperationKind,
} from '@ramiidv/arca-common';
import {
  checkFecredErrors,
  invalidResponse,
  parseCodigosDescripciones,
  parseComprobante,
  parseCuentaCorriente,
  parseCuentaEnAgente,
  parseEstadoCmp,
  parseEstadoCtaCte,
  parseIdComprobante,
  parseIdCtaCte,
  parseInfo,
  parseInfoAgtDptoCltv,
  parseInfoCtaCte,
  parseItems,
  parseNum,
  parseOptNum,
  parseOptSiNo,
  parseOptStr,
  parseSiNo,
  parseStr,
  resultadoAprobado,
} from './parsers.js';
import {
  ajustesParam,
  cbuParam,
  codeParam,
  confirmarNotasParam,
  cotizacionParam,
  ctaAgenteParam,
  cuitParam,
  dateParam,
  estadoCmpParam,
  estadoCtaCteParam,
  fechaParam,
  formasCancelacionParam,
  idComprobanteParam,
  idCtaCteParam,
  importeParam,
  intParam,
  longParam,
  monedaParam,
  motivosRechazoParam,
  opcionTransferenciaParam,
  retencionesParam,
  rolParam,
  siNoParam,
  tipoCancelacionParam,
} from './validation.js';
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
  ObligadoRecepcionResult,
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

export interface FecredClientConfig {
  /** URL de FECredService. */
  endpoint: string;
  /** Namespace del servicio (`http://ar.gob.afip.wsfecred/FECredService/`). */
  namespace: string;
  /** Opciones de transporte SOAP. */
  soapOptions?: {
    timeout?: number;
    retries?: number;
    retryDelayMs?: number;
    fetch?: typeof fetch;
    legacyTls?: LegacyTlsMode;
  };
  /** Callback de eventos. */
  onEvent?: (event: ArcaEvent) => void;
}

type Xml = Record<string, unknown>;

/**
 * Credenciales para un request: el `WsAuth` o una función que lo obtiene. La
 * función se llama después de validar los parámetros.
 */
export type WsAuthSource = WsAuth | (() => Promise<WsAuth>);

/** Agrega al objeto solo los valores definidos (respetando el orden de inserción = orden del XSD). */
function put(target: Xml, key: string, value: unknown): void {
  if (value !== undefined) target[key] = value;
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
 * respuesta se pierde, el `ArcaSoapError` tiene `uncertain = true`.
 */
export class FecredClient {
  protected readonly endpoint: string;
  protected readonly namespace: string;
  protected readonly soapOptions: NonNullable<FecredClientConfig['soapOptions']>;
  protected readonly onEvent?: (event: ArcaEvent) => void;

  constructor(config: FecredClientConfig) {
    this.endpoint = config.endpoint;
    this.namespace = config.namespace;
    this.soapOptions = config.soapOptions ?? {};
    this.onEvent = config.onEvent;
  }

  // -------------------------------------------------------------------------
  // Helper
  // -------------------------------------------------------------------------

  /**
   * Llama a `method` con el wrapper `<method>Request` (o Body vacío si `auth`
   * es `null`), `SOAPAction = namespace + method`, y chequea errores de negocio.
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
    const result = await afipSoapCall(this.endpoint, this.namespace, method, params, {
      ...this.soapOptions,
      onEvent: this.onEvent,
      signal: opts?.signal,
      kind,
      requestElement: auth ? `${method}Request` : null,
      soapActionFromMethod: true,
    });
    checkFecredErrors(result);
    return result;
  }

  private async operacion(method: string, auth: WsAuthSource, fields: Xml, opts?: CallOptions): Promise<OperacionFecredResult> {
    const r = await this.call(method, auth, fields, 'emision', opts);
    return {
      resultado: resultadoAprobado(r, method),
      idCtaCte: parseIdCtaCte(r['idCtaCte'], `${method}.idCtaCte`),
      ...parseInfo(r, method),
    };
  }

  private async codigosDescripciones(method: string, auth: WsAuthSource, opts?: CallOptions): Promise<CodigoDescripcion[]> {
    const r = await this.call(method, auth, {}, 'consulta', opts);
    return parseCodigosDescripciones(r, 'arrayCodigoDescripcion', method);
  }

  // -------------------------------------------------------------------------
  // Health check
  // -------------------------------------------------------------------------

  /** `dummy`: estado de los servidores (sin autenticación). */
  async dummy(opts?: CallOptions): Promise<ServerStatus> {
    const r = await this.call('dummy', null, {}, 'consulta', opts);
    return {
      appserver: parseStr(r, 'appserver', 'dummy'),
      dbserver: parseStr(r, 'dbserver', 'dummy'),
      authserver: parseStr(r, 'authserver', 'dummy'),
    };
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
    const r = await this.call(
      m,
      auth,
      {
        cuitConsultada: cuitParam(params?.cuitConsultada, 'cuitConsultada'),
        fechaEmision: dateParam(params?.fechaEmision, 'fechaEmision'),
      },
      'consulta',
      opts,
    );
    const out: MontoObligadoRecepcionResult = { obligado: parseSiNo(r, 'obligado', m), ...parseInfo(r, m) };
    const monto = parseOptNum(r, 'montoDesde', m);
    if (monto !== undefined) out.montoDesde = monto;
    return out;
  }

  /** `consultarObligadoRecepcion`: si la CUIT está obligada a recibir FCE (campo `respuesta`) y desde cuándo. */
  async consultarObligadoRecepcion(
    auth: WsAuthSource,
    cuitConsultada: number | string,
    opts?: CallOptions,
  ): Promise<ObligadoRecepcionResult> {
    const m = 'consultarObligadoRecepcion';
    const r = await this.call(m, auth, { cuitConsultada: cuitParam(cuitConsultada, 'cuitConsultada') }, 'consulta', opts);
    const out: ObligadoRecepcionResult = { obligado: parseSiNo(r, 'respuesta', m), ...parseInfo(r, m) };
    const desde = parseOptStr(r, 'desde', m);
    if (desde !== undefined) out.desde = desde;
    return out;
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
    const f: Xml = { rolCUITRepresentada: rolParam(params?.rol) };
    if (params.cuitContraparte !== undefined) f.CUITContraparte = cuitParam(params.cuitContraparte, 'cuitContraparte');
    if (params.fecha !== undefined) f.fecha = fechaParam(params.fecha);
    if (params.estadoCtaCte !== undefined) f.estadoCtaCte = estadoCtaCteParam(params.estadoCtaCte);
    if (params.nroPagina !== undefined) f.nroPagina = intParam(params.nroPagina, 'nroPagina', 1, 32767);
    if (params.opcionTransferencia !== undefined) {
      f.opcionTransferencia = opcionTransferenciaParam(params.opcionTransferencia);
    }
    const r = await this.call(m, auth, f, 'consulta', opts);
    const out: ConsultarCtasCtesResult = {
      ctasCtes: parseItems(r, 'arrayInfosCtaCte', 'infoCtaCte', m).map((x, i) =>
        parseInfoCtaCte(x, `${m}.arrayInfosCtaCte.infoCtaCte[${i}]`),
      ),
      ...parseInfo(r, m),
    };
    const nroPagina = parseOptNum(r, 'nroPagina', m);
    if (nroPagina !== undefined) out.nroPagina = nroPagina;
    const hayMas = parseOptSiNo(r, 'hayMas', m);
    if (hayMas !== undefined) out.hayMas = hayMas;
    return out;
  }

  /** `consultarCtaCte`: detalle de una cuenta corriente. */
  async consultarCtaCte(auth: WsAuthSource, idCtaCte: IdCtaCteInput, opts?: CallOptions): Promise<ConsultarCtaCteResult> {
    const m = 'consultarCtaCte';
    const r = await this.call(m, auth, { idCtaCte: idCtaCteParam(idCtaCte) }, 'consulta', opts);
    if (r['ctaCte'] === undefined || r['ctaCte'] === null || r['ctaCte'] === '') invalidResponse(`${m}.ctaCte`);
    return { ctaCte: parseCuentaCorriente(r['ctaCte'], `${m}.ctaCte`), ...parseInfo(r, m) };
  }

  /** `consultarComprobantes`: facturas y notas FCE (paginado). */
  async consultarComprobantes(
    auth: WsAuthSource,
    params: ConsultarComprobantesParams,
    opts?: CallOptions,
  ): Promise<ConsultarComprobantesResult> {
    const m = 'consultarComprobantes';
    const f: Xml = { rolCUITRepresentada: rolParam(params?.rol) };
    if (params.cuitContraparte !== undefined) f.CUITContraparte = cuitParam(params.cuitContraparte, 'cuitContraparte');
    if (params.codTipoCmp !== undefined) f.codTipoCmp = codeParam(params.codTipoCmp, 'codTipoCmp');
    if (params.estadoCmp !== undefined) f.estadoCmp = estadoCmpParam(params.estadoCmp);
    if (params.fecha !== undefined) f.fecha = fechaParam(params.fecha);
    if (params.codCtaCte !== undefined) f.codCtaCte = longParam(params.codCtaCte, 'codCtaCte');
    if (params.estadoCtaCte !== undefined) f.estadoCtaCte = estadoCtaCteParam(params.estadoCtaCte);
    if (params.nroPagina !== undefined) f.nroPagina = intParam(params.nroPagina, 'nroPagina', 1, 32767);
    const r = await this.call(m, auth, f, 'consulta', opts);
    const out: ConsultarComprobantesResult = {
      comprobantes: parseItems(r, 'arrayComprobantes', 'comprobante', m).map((x, i) =>
        parseComprobante(x, `${m}.arrayComprobantes.comprobante[${i}]`),
      ),
      ...parseInfo(r, m),
    };
    const nroPagina = parseOptNum(r, 'nroPagina', m);
    if (nroPagina !== undefined) out.nroPagina = nroPagina;
    const hayMas = parseOptSiNo(r, 'hayMas', m);
    if (hayMas !== undefined) out.hayMas = hayMas;
    return out;
  }

  /** `consultarHistorialEstadosComprobante`. */
  async consultarHistorialEstadosComprobante(
    auth: WsAuthSource,
    idComprobante: IdComprobanteInput,
    opts?: CallOptions,
  ): Promise<HistorialEstadosComprobanteResult> {
    const m = 'consultarHistorialEstadosComprobante';
    const r = await this.call(m, auth, { idComprobante: idComprobanteParam(idComprobante, 'idComprobante') }, 'consulta', opts);
    if (r['arrayHistorialEstados'] === undefined) invalidResponse(`${m}.arrayHistorialEstados`);
    return {
      idComprobante: parseIdComprobante(r['idComprobante'], `${m}.idComprobante`),
      estados: parseItems(r, 'arrayHistorialEstados', 'estadoHistorico', m).map((x, i) =>
        parseEstadoCmp(x, `${m}.arrayHistorialEstados.estadoHistorico[${i}]`),
      ),
    };
  }

  /** `consultarHistorialEstadosCtaCte`. */
  async consultarHistorialEstadosCtaCte(
    auth: WsAuthSource,
    idCtaCte: IdCtaCteInput,
    opts?: CallOptions,
  ): Promise<HistorialEstadosCtaCteResult> {
    const m = 'consultarHistorialEstadosCtaCte';
    const r = await this.call(m, auth, { idCtaCte: idCtaCteParam(idCtaCte) }, 'consulta', opts);
    if (r['arrayHistorialEstados'] === undefined) invalidResponse(`${m}.arrayHistorialEstados`);
    return {
      idCtaCte: parseIdCtaCte(r['idCtaCte'], `${m}.idCtaCte`),
      estados: parseItems(r, 'arrayHistorialEstados', 'estadoHistorico', m).map((x, i) =>
        parseEstadoCtaCte(x, `${m}.arrayHistorialEstados.estadoHistorico[${i}]`),
      ),
    };
  }

  /** `obtenerRemitos`: remitos asociados a un comprobante. */
  async obtenerRemitos(auth: WsAuthSource, idComprobante: IdComprobanteInput, opts?: CallOptions): Promise<IdComprobante[]> {
    const m = 'obtenerRemitos';
    const r = await this.call(m, auth, { idComprobante: idComprobanteParam(idComprobante, 'idComprobante') }, 'consulta', opts);
    return parseItems(r, 'arrayIdsRemitos', 'idsComprobantes', m).map((x, i) =>
      parseIdComprobante(x, `${m}.arrayIdsRemitos.idsComprobantes[${i}]`),
    );
  }

  // -------------------------------------------------------------------------
  // Operaciones (emisiones: nunca se reintentan)
  // -------------------------------------------------------------------------

  /** `aceptarFECred`: acepta una factura de crédito. */
  async aceptarFECred(auth: WsAuthSource, params: AceptarFecredParams, opts?: CallOptions): Promise<OperacionFecredResult> {
    const f: Xml = { idCtaCte: idCtaCteParam(params?.idCtaCte) };
    put(f, 'arrayConfirmarNotasDC', confirmarNotasParam(params.confirmarNotasDC));
    put(f, 'arrayFormasCancelacion', formasCancelacionParam(params.formasCancelacion, 'formasCancelacion', false));
    put(f, 'arrayRetenciones', retencionesParam(params.retenciones));
    put(f, 'arrayAjustesOperacion', ajustesParam(params.ajustesOperacion));
    if (params.tipoCancelacion !== undefined) f.tipoCancelacion = tipoCancelacionParam(params.tipoCancelacion);
    if (params.importeCancelado !== undefined) f.importeCancelado = importeParam(params.importeCancelado, 'importeCancelado');
    if (params.importeTotalRetPesos !== undefined) {
      f.importeTotalRetPesos = importeParam(params.importeTotalRetPesos, 'importeTotalRetPesos');
    }
    if (params.importeEmbargoPesos !== undefined) {
      f.importeEmbargoPesos = importeParam(params.importeEmbargoPesos, 'importeEmbargoPesos');
    }
    f.saldoAceptado = importeParam(params.saldoAceptado, 'saldoAceptado');
    f.codMoneda = monedaParam(params.codMoneda);
    f.cotizacionMonedaUlt = cotizacionParam(params.cotizacionMonedaUlt, 'cotizacionMonedaUlt');
    if (params.informaCBU !== undefined) f.informaCBU = siNoParam(params.informaCBU, 'informaCBU');
    if (params.cbuComprador !== undefined) f.CBUComprador = cbuParam(params.cbuComprador, 'cbuComprador');
    return this.operacion('aceptarFECred', auth, f, opts);
  }

  /** `rechazarFECred`: rechaza una factura de crédito. */
  async rechazarFECred(auth: WsAuthSource, params: RechazarFecredParams, opts?: CallOptions): Promise<OperacionFecredResult> {
    return this.operacion(
      'rechazarFECred',
      auth,
      { idCtaCte: idCtaCteParam(params?.idCtaCte), arrayMotivosRechazo: motivosRechazoParam(params.motivos) },
      opts,
    );
  }

  /** `informarCancelacionTotalFECred`: informa la cancelación total de una FCE aceptada. */
  async informarCancelacionTotalFECred(
    auth: WsAuthSource,
    params: InformarCancelacionTotalParams,
    opts?: CallOptions,
  ): Promise<OperacionFecredResult> {
    return this.operacion(
      'informarCancelacionTotalFECred',
      auth,
      {
        idCtaCte: idCtaCteParam(params?.idCtaCte),
        arrayFormasCancelacion: formasCancelacionParam(params.formasCancelacion),
        importeCancelacion: importeParam(params.importeCancelacion, 'importeCancelacion'),
      },
      opts,
    );
  }

  /** `modificarOpcionTransferencia`: cambia la opción de transferencia (SCA/ADC). */
  async modificarOpcionTransferencia(
    auth: WsAuthSource,
    params: ModificarOpcionTransferenciaParams,
    opts?: CallOptions,
  ): Promise<OperacionFecredResult> {
    return this.operacion(
      'modificarOpcionTransferencia',
      auth,
      {
        idCtaCte: idCtaCteParam(params?.idCtaCte),
        opcionTransferencia: opcionTransferenciaParam(params.opcionTransferencia),
      },
      opts,
    );
  }

  /** `informarFacturaAgtDptoCltv`: informa la factura a un Agente de Depósito Colectivo. */
  async informarFacturaAgtDptoCltv(
    auth: WsAuthSource,
    params: InformarFacturaAgtDptoCltvParams,
    opts?: CallOptions,
  ): Promise<OperacionFecredResult> {
    return this.operacion(
      'informarFacturaAgtDptoCltv',
      auth,
      { idCtaCte: idCtaCteParam(params?.idCtaCte), ctaAgente: ctaAgenteParam(params.ctaAgente) },
      opts,
    );
  }

  /** `rechazarNotaDC`: rechaza una nota de débito/crédito. */
  async rechazarNotaDC(auth: WsAuthSource, params: RechazarNotaDCParams, opts?: CallOptions): Promise<RechazarNotaDCResult> {
    const m = 'rechazarNotaDC';
    const r = await this.call(
      m,
      auth,
      {
        idComprobante: idComprobanteParam(params?.idComprobante, 'idComprobante'),
        arrayMotivosRechazo: motivosRechazoParam(params.motivos),
      },
      'emision',
      opts,
    );
    return {
      resultado: resultadoAprobado(r, m),
      idComprobante: parseIdComprobante(r['idComprobante'], `${m}.idComprobante`),
      ...parseInfo(r, m),
    };
  }

  // -------------------------------------------------------------------------
  // Agente de Depósito Colectivo (consultas)
  // -------------------------------------------------------------------------

  /** `consultarCuentasEnAgtDptoCltv`: cuentas de la CUIT representada en Agentes de Depósito Colectivo. */
  async consultarCuentasEnAgtDptoCltv(auth: WsAuthSource, opts?: CallOptions): Promise<ConsultarCuentasEnAgtDptoCltvResult> {
    const m = 'consultarCuentasEnAgtDptoCltv';
    const r = await this.call(m, auth, {}, 'consulta', opts);
    return {
      cuentas: parseItems(r, 'arrayCuentasEnAgente', 'cuentaEnAgente', m).map((x, i) =>
        parseCuentaEnAgente(x, `${m}.arrayCuentasEnAgente.cuentaEnAgente[${i}]`),
      ),
      ...parseInfo(r, m),
    };
  }

  /** `consultarFacturasAgtDptoCltv`: facturas informadas a Agentes de Depósito Colectivo. */
  async consultarFacturasAgtDptoCltv(
    auth: WsAuthSource,
    params: ConsultarFacturasAgtDptoCltvParams = {},
    opts?: CallOptions,
  ): Promise<ConsultarFacturasAgtDptoCltvResult> {
    const m = 'consultarFacturasAgtDptoCltv';
    const f: Xml = {};
    if (params.idCtaCte !== undefined) f.idCtaCte = idCtaCteParam(params.idCtaCte);
    if (params.fecha !== undefined) f.filtroFecha = fechaParam(params.fecha);
    const r = await this.call(m, auth, f, 'consulta', opts);
    return {
      facturas: parseItems(r, 'arrayFacturasAgtDptoCltv', 'facturaInformada', m).map((x, i) => {
        const p = `${m}.arrayFacturasAgtDptoCltv.facturaInformada[${i}]`;
        return {
          idFactura: parseIdComprobante(x['idFactura'], `${p}.idFactura`),
          infoAgtDptoCltv: parseInfoAgtDptoCltv(x['infoAgtDptoCltv'], `${p}.infoAgtDptoCltv`),
        };
      }),
      ...parseInfo(r, m),
    };
  }

  // -------------------------------------------------------------------------
  // Tablas de parámetros
  // -------------------------------------------------------------------------

  /** `consultarTiposRetenciones`. */
  async consultarTiposRetenciones(auth: WsAuthSource, opts?: CallOptions): Promise<TipoRetencion[]> {
    const m = 'consultarTiposRetenciones';
    const r = await this.call(m, auth, {}, 'consulta', opts);
    return parseItems(r, 'arrayTiposRetenciones', 'tipoRetencion', m).map((x, i) => {
      const p = `${m}.arrayTiposRetenciones.tipoRetencion[${i}]`;
      return {
        codigoJurisdiccion: parseNum(x, 'codigoJurisdiccion', p),
        descripcionJurisdiccion: parseStr(x, 'descripcionJurisdiccion', p),
        porcentajeRetencion: parseNum(x, 'porcentajeRetencion', p),
      };
    });
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
