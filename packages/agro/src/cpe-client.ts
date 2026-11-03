import { SoapServiceClient, parseServerStatus } from '@ramiidv/arca-common';
import type { CallOptions, ServerStatus, ServiceErrorDetail, SoapOperationKind } from '@ramiidv/arca-common';
import { CPE_NAMESPACE } from './constants.js';
import type { ServiceContext } from './context.js';
import { ArcaAgroResponseError } from './errors.js';
import { at, checkErrors, decodeResult, requireValue, ticketAuth, withAdvertencias } from './internal.js';
import { encodeRequest, list, obj } from './schema.js';
import type { Schema } from './schema.js';
import * as S from './cpe-schemas.js';
import type { CodigoDescripcion } from './types.js';
import type {
  AnularCPEEmisionDestinoDGParams,
  AnularCPEParams,
  AutorizarCPEAutomotorDGParams,
  AutorizarCPEAutomotorParams,
  AutorizarCPEEmisionDestinoDGParams,
  AutorizarCPEFerroviariaDGParams,
  AutorizarCPEFerroviariaParams,
  CerrarContingenciaCPEEmisionDestinoDGParams,
  CerrarContingenciaCPEParams,
  ConfirmacionDefinitivaCPEAutomotorDGParams,
  ConfirmacionDefinitivaCPEAutomotorParams,
  ConfirmacionDefinitivaCPEDuctosDGParams,
  ConfirmacionDefinitivaCPEFerroviariaDGParams,
  ConfirmacionDefinitivaCPEFerroviariaParams,
  ConsultarCPEDGParams,
  ConsultarCPEParams,
  ConsultarCPEPendientesParams,
  ConsultarCPEPorDestinoParams,
  CPEAutomotorDetalle,
  CPEAutomotorDGDetalle,
  CPEDGPendiente,
  CPEDuctosDetalle,
  CPEEmisionDestinoDGDetalle,
  CPEFerroviariaDetalle,
  CPEFerroviariaDGDetalle,
  CPEResultado,
  CPEResumen,
  DerivadoGranarioCPE,
  DesvioCPEAutomotorDGParams,
  DesvioCPEAutomotorParams,
  DomicilioCPE,
  DesvioCPEFerroviariaDGParams,
  DesvioCPEFerroviariaParams,
  EditarCPEAutomotorParams,
  EditarCPEConfirmadaParams,
  EditarCPEDGAutomotorParams,
  EditarCPEDGConfirmadaParams,
  EditarCPEDGDuctosParams,
  EditarCPEDGFerroviariaParams,
  EditarCPEFerroviariaParams,
  EditarCPEOptions,
  InformarContingenciaEmisionDestinoDGParams,
  InformarContingenciaParams,
  LocalidadProductorCPE,
  NuevoDestinoDestinatarioCPEAutomotorDGParams,
  NuevoDestinoDestinatarioCPEAutomotorParams,
  NuevoDestinoDestinatarioCPEEmisionDestinoDGParams,
  NuevoDestinoDestinatarioCPEFerroviariaDGParams,
  NuevoDestinoDestinatarioCPEFerroviariaParams,
  OperativoFerroviarioCPE,
  PlantaCPE,
  PlantaDGCPE,
  RechazoCPEParams,
  RegresoOrigenCPEAutomotorDGParams,
  RegresoOrigenCPEAutomotorParams,
  RegresoOrigenCPEEmisionDestinoDGParams,
  RegresoOrigenCPEFerroviariaDGParams,
  RegresoOrigenCPEFerroviariaParams,
  RenspaCPE,
  SolicitanteCartaPorteParams,
  SolicitanteDestinoCartaPorteParams,
  TipoEmbalajeCPE,
  VariedadSemillaCPE,
} from './cpe-types.js';
import type { CuitInput } from './types.js';
import {
  checkCargaDG,
  checkConceptoContingencia,
  checkRangoConsultaDestino,
  requireCartaPorteOCtg,
  requireOrigen,
} from './validation.js';

const SERVICE = 'WSCPE';

const listOf = (name: string, item: Schema): Schema => ({ [name]: list(obj(item), 0) });

type ExtraCheck = Parameters<typeof encodeRequest>[3];

/** Remitentes comerciales y corredores que se editan en una CPE activa (mismo nombre en `intervinientes`). */
const INTERVINIENTES_EDITABLES = [
  'cuitRemitenteComercialVentaPrimaria',
  'cuitRemitenteComercialVentaSecundaria',
  'cuitRemitenteComercialVentaSecundaria2',
  'cuitCorredorVentaPrimaria',
  'cuitCorredorVentaSecundaria',
] as const;
const desdeIntervinientes = (campos: readonly string[]) => campos.map((c) => [c, `intervinientes.${c}`] as const);

/**
 * CUIT opcionales de cada edición y su ruta en el detalle de la CPE, para
 * `preservarIntervinientes` (los obligatorios no hace falta completarlos).
 */
const PRESERVAR = {
  automotor: desdeIntervinientes(INTERVINIENTES_EDITABLES),
  ferroviaria: [
    ['cuitDestinatario', 'destinatario.cuit'],
    ...desdeIntervinientes(INTERVINIENTES_EDITABLES),
    ['cuitTransportista', 'transporte.cuitTransportista'],
  ],
  confirmada: [
    ...desdeIntervinientes([
      'cuitCorredorVentaPrimaria',
      'cuitCorredorVentaSecundaria',
      'cuitRemitenteComercialVentaPrimaria',
      'cuitRemitenteComercialVentaSecundaria',
    ]),
    ['cuitRemitenteComercialProductor', 'retiroProductor.cuitRemitenteComercialProductor'],
  ],
} as const satisfies Record<string, readonly (readonly [string, string])[]>;

/** Copia de `campos` con los valores `undefined` completados desde `detalle` (ver `PRESERVAR`). */
function completarDesde<T extends object>(
  campos: T,
  detalle: object,
  rutas: readonly (readonly [string, string])[],
): T {
  const out: Record<string, unknown> = { ...(campos as Record<string, unknown>) };
  for (const [campo, ruta] of rutas) {
    if (out[campo] === undefined) {
      const vigente = at(detalle, ruta);
      if (vigente !== undefined) out[campo] = vigente;
    }
  }
  return out as T;
}

/** Operaciones cuyos elementos no son `<Operacion>Req` / `<Operacion>Resp` (WSDL). */
const ELEMENTOS: Readonly<Record<string, { request?: string; response?: string }>> = {
  consultarRenspa: { response: 'ConsultarRenspaRes' },
  editarCPEDGConfirmadaAutomotor: {
    request: 'EditarCPEConfirmadaAutomotorDgReq',
    response: 'EditarCPEConfirmadaAutomotorDgResp',
  },
  editarCPEDGConfirmadaFerroviaria: {
    request: 'EditarCPEConfirmadaFerroviariaDgReq',
    response: 'EditarCPEConfirmadaFerroviariaDgResp',
  },
};

/** La respuesta trae la CPE (`cabecera.nroCTG` o `cabecera.estado`). */
const conCabecera = (node: Record<string, unknown>): boolean =>
  Boolean(at(node, 'cabecera.nroCTG') || at(node, 'cabecera.estado'));

/**
 * Cliente de WSCPE (Carta de Porte Electrónica). Se accede como `agro.cpe`.
 *
 * Cubre los circuitos automotor y ferroviario de granos, los de derivados
 * granarios (DG: automotor, ferroviaria, emitida en destino y ductos) y las
 * consultas paramétricas.
 *
 * Las operaciones que crean o modifican una CPE son emisiones: nunca se
 * reintentan y, si la respuesta se pierde, el `ArcaSoapError` tiene
 * `uncertain: true` (ver README, "Recuperar una emisión incierta").
 *
 * El error 550 (no se pudo generar el PDF) no cancela la operación: el
 * resultado viene sin `pdf` y con el error en `advertencias`.
 */
export class CpeClient extends SoapServiceClient {
  readonly #ctx: ServiceContext;

  /** @internal Se construye desde `ArcaAgro`. */
  constructor(ctx: ServiceContext) {
    super({ endpoint: ctx.endpoint, namespace: CPE_NAMESPACE, transport: ctx.transport });
    this.#ctx = ctx;
  }

  // ============================================================
  // Internos
  // ============================================================

  /**
   * Llama a una operación de WSCPE. Los elementos de request/response son
   * `<Operacion>Req` / `<Operacion>Resp` (salvo los de `ELEMENTOS`) y el
   * SOAPAction es `namespace + operacion`. Devuelve el nodo `respuesta` y los
   * errores admitidos, después de verificar `errores`.
   */
  async #call(
    method: string,
    body: Record<string, unknown> | null,
    kind: SoapOperationKind,
    opts?: CallOptions,
  ): Promise<{ node: Record<string, unknown>; advertencias: ServiceErrorDetail[] }> {
    const element = method.charAt(0).toUpperCase() + method.slice(1);
    const elementos = ELEMENTOS[method];
    const params =
      body === null
        ? {}
        : { auth: { ...(await ticketAuth(this.#ctx.getTicket, opts)), cuitRepresentada: this.#ctx.cuit }, ...body };
    const result = await this.soapCall(method, params, {
      kind,
      signal: this.#ctx.callOptions(opts).signal,
      requestElement: body === null ? null : (elementos?.request ?? `${element}Req`),
      responseElement: elementos?.response ?? `${element}Resp`,
      soapActionFromMethod: true,
      parseNumbers: false,
    });
    // `<respuesta/>` vacía (ej: una lista sin resultados) se parsea como ''.
    const respuesta = result['respuesta'] === '' ? {} : result['respuesta'];
    if (respuesta === undefined || respuesta === null || typeof respuesta !== 'object' || Array.isArray(respuesta)) {
      throw new ArcaAgroResponseError(`${SERVICE} ${method}: la respuesta no tiene <respuesta>`, kind === 'emision');
    }
    const node = respuesta as Record<string, unknown>;
    const advertencias = checkErrors(node, SERVICE, method, kind, conCabecera);
    return { node, advertencias };
  }

  /** Operación sobre una CPE que responde `CartaPorteRespuesta`. */
  async #operar(
    method: string,
    schema: Schema,
    params: unknown,
    opts?: CallOptions,
    extraCheck?: ExtraCheck,
  ): Promise<CPEResultado> {
    const solicitud = encodeRequest(params, schema, method, extraCheck);
    const { node, advertencias } = await this.#call(method, { solicitud }, 'emision', opts);
    const r = decodeResult<CPEResultado>(node, S.R_CARTA_PORTE, `${method}.respuesta`, 'emision');
    return withAdvertencias(r, advertencias);
  }

  /**
   * Operación que responde el detalle de una CPE (autorizar/consultar): exige
   * `cabecera.nroCTG`.
   */
  async #detalle<T extends { cabecera?: { nroCTG?: string } }>(
    method: string,
    kind: SoapOperationKind,
    request: Schema,
    params: unknown,
    response: Schema,
    opts?: CallOptions,
    extraCheck?: ExtraCheck,
  ): Promise<T> {
    const solicitud = encodeRequest(params, request, method, extraCheck);
    const { node, advertencias } = await this.#call(method, { solicitud }, kind, opts);
    const detalle = decodeResult<T>(node, response, `${method}.respuesta`, kind);
    requireValue(detalle.cabecera?.nroCTG, 'cabecera.nroCTG', SERVICE, method, kind);
    return withAdvertencias(detalle, advertencias);
  }

  /**
   * Edición de una CPE de granos. Con `preservarIntervinientes`, valida los
   * `params` (sin llamar a ARCA si son inválidos), consulta la CPE y completa
   * con `completar` los CUIT no informados antes de editar.
   */
  async #editar<P extends { nroCTG: string | number }>(
    circuito: 'automotor' | 'ferroviaria',
    method: string,
    schema: Schema,
    params: P,
    completar: (params: P, vigente: CPEAutomotorDetalle | CPEFerroviariaDetalle) => P,
    opts?: EditarCPEOptions,
  ): Promise<CPEResultado> {
    let p = params;
    if (opts?.preservarIntervinientes) {
      encodeRequest(params, schema, method);
      const consulta = { nroCTG: params.nroCTG };
      const vigente =
        circuito === 'automotor'
          ? await this.consultarCPEAutomotor(consulta, opts)
          : await this.consultarCPEFerroviaria(consulta, opts);
      p = completar(params, vigente);
    }
    return this.#operar(method, schema, p, opts);
  }

  /** `editarCPEConfirmada*`: los intervinientes se completan dentro de `intervinientes`. */
  async #editarConfirmada(
    circuito: 'automotor' | 'ferroviaria',
    method: string,
    params: EditarCPEConfirmadaParams,
    opts?: EditarCPEOptions,
  ): Promise<CPEResultado> {
    return this.#editar(
      circuito,
      method,
      S.EDITAR_CONFIRMADA,
      params,
      (p, vigente) => ({ ...p, intervinientes: completarDesde(p.intervinientes, vigente, PRESERVAR.confirmada) }),
      opts,
    );
  }

  async #lista<T>(
    method: string,
    body: Record<string, unknown>,
    item: string,
    schema: Schema,
    opts?: CallOptions,
  ): Promise<T[]> {
    const { node } = await this.#call(method, body, 'consulta', opts);
    return decodeResult<Record<string, T[]>>(node, listOf(item, schema), `${method}.respuesta`, 'consulta')[item];
  }

  // ============================================================
  // Circuito automotor
  // ============================================================

  /**
   * Autoriza una CPE automotor (`TIPO_CPE.AUTOMOTOR`, 74) o automotor flete corto
   * (`TIPO_CPE.AUTOMOTOR_FLETE_CORTO`, 274).
   * Emisión: no se reintenta. Si falla con `uncertain`, consultá
   * `consultarUltNroOrden` + `consultarCPEAutomotor` (y comprobá que sea la
   * tuya) antes de reintentar. Un error 550 va a `advertencias`.
   */
  async autorizarCPEAutomotor(params: AutorizarCPEAutomotorParams, opts?: CallOptions): Promise<CPEAutomotorDetalle> {
    return this.#detalle(
      'autorizarCPEAutomotor',
      'emision',
      S.AUTORIZAR_AUTOMOTOR,
      params,
      S.R_DETALLE_AUTOMOTOR,
      opts,
      requireOrigen,
    );
  }

  /** Consulta una CPE automotor por `cartaPorte` (tipo/sucursal/nroOrden) o por `nroCTG`. */
  async consultarCPEAutomotor(params: ConsultarCPEParams, opts?: CallOptions): Promise<CPEAutomotorDetalle> {
    return this.#detalle(
      'consultarCPEAutomotor',
      'consulta',
      S.CONSULTAR_CPE,
      params,
      S.R_DETALLE_AUTOMOTOR,
      opts,
      requireCartaPorteOCtg,
    );
  }

  /**
   * Edita una CPE automotor activa o confirmada. Emisión.
   *
   * ARCA anula los CUIT opcionales que no se informan: para mantenerlos,
   * pasalos o usá `opts.preservarIntervinientes` (ver `EditarCPEOptions`).
   */
  async editarCPEAutomotor(params: EditarCPEAutomotorParams, opts?: EditarCPEOptions): Promise<CPEResultado> {
    return this.#editar(
      'automotor',
      'editarCPEAutomotor',
      S.EDITAR_AUTOMOTOR,
      params,
      (p, vigente) => completarDesde(p, vigente, PRESERVAR.automotor),
      opts,
    );
  }

  /**
   * Edita los intervinientes de una CPE automotor confirmada. Emisión.
   * Los que no se informan se anulan (ver `EditarCPEOptions.preservarIntervinientes`).
   */
  async editarCPEConfirmadaAutomotor(
    params: EditarCPEConfirmadaParams,
    opts?: EditarCPEOptions,
  ): Promise<CPEResultado> {
    return this.#editarConfirmada('automotor', 'editarCPEConfirmadaAutomotor', params, opts);
  }

  /** Informa el arribo de la CPE a destino (destino/destinatario). Emisión. */
  async confirmarArriboCPE(params: SolicitanteCartaPorteParams, opts?: CallOptions): Promise<CPEResultado> {
    return this.#operar('confirmarArriboCPE', S.SOLICITANTE_CARTA_PORTE, params, opts);
  }

  /** Confirmación definitiva de una CPE automotor (pesos de descarga). Emisión. */
  async confirmacionDefinitivaCPEAutomotor(
    params: ConfirmacionDefinitivaCPEAutomotorParams,
    opts?: CallOptions,
  ): Promise<CPEResultado> {
    return this.#operar('confirmacionDefinitivaCPEAutomotor', S.CONFIRMACION_AUTOMOTOR, params, opts);
  }

  /** Informa la descarga en destino. Emisión. */
  async descargadoDestinoCPE(params: SolicitanteCartaPorteParams, opts?: CallOptions): Promise<CPEResultado> {
    return this.#operar('descargadoDestinoCPE', S.SOLICITANTE_CARTA_PORTE, params, opts);
  }

  /** Rechaza una CPE en destino. Emisión. */
  async rechazoCPE(params: RechazoCPEParams, opts?: CallOptions): Promise<CPEResultado> {
    return this.#operar('rechazoCPE', S.RECHAZO, params, opts);
  }

  /** Anula una CPE. Emisión. */
  async anularCPE(params: AnularCPEParams, opts?: CallOptions): Promise<CPEResultado> {
    return this.#operar('anularCPE', S.ANULAR, params, opts);
  }

  /** Cambia destino y/o destinatario de una CPE automotor. Emisión. */
  async nuevoDestinoDestinatarioCPEAutomotor(
    params: NuevoDestinoDestinatarioCPEAutomotorParams,
    opts?: CallOptions,
  ): Promise<CPEResultado> {
    return this.#operar('nuevoDestinoDestinatarioCPEAutomotor', S.NUEVO_DESTINO_AUTOMOTOR, params, opts);
  }

  /** Regreso a origen de una CPE automotor. Emisión. */
  async regresoOrigenCPEAutomotor(params: RegresoOrigenCPEAutomotorParams, opts?: CallOptions): Promise<CPEResultado> {
    return this.#operar('regresoOrigenCPEAutomotor', S.REGRESO_ORIGEN_AUTOMOTOR, params, opts);
  }

  /** Desvío de una CPE automotor a otra planta. Emisión. */
  async desvioCPEAutomotor(params: DesvioCPEAutomotorParams, opts?: CallOptions): Promise<CPEResultado> {
    return this.#operar('desvioCPEAutomotor', S.DESVIO_AUTOMOTOR, params, opts);
  }

  /**
   * Informa una contingencia sobre una CPE (granos, automotor DG, ferroviaria DG
   * o ductos; la emitida en destino usa `informarContingenciaEmisionDestinoDG`).
   * Emisión. Conceptos según `cartaPorte.tipoCPE` (manual §4.2): A a G en
   * ferroviaria y ferroviaria DG, A, C, D, E o F en ductos, A a F en el resto.
   */
  async informarContingencia(params: InformarContingenciaParams, opts?: CallOptions): Promise<CPEResultado> {
    return this.#operar('informarContingencia', S.INFORMAR_CONTINGENCIA, params, opts, checkConceptoContingencia);
  }

  /** Cierra una contingencia (reactivar, extender o desactivar la CP). Emisión. */
  async cerrarContingenciaCPE(params: CerrarContingenciaCPEParams, opts?: CallOptions): Promise<CPEResultado> {
    return this.#operar('cerrarContingenciaCPE', S.CERRAR_CONTINGENCIA, params, opts);
  }

  // ============================================================
  // Circuito ferroviario
  // ============================================================

  /**
   * Autoriza una CPE ferroviaria (`TIPO_CPE.FERROVIARIA`, 75). Emisión: si falla con
   * `uncertain`, consultá `consultarUltNroOrden(sucursal, TIPO_CPE.FERROVIARIA)` +
   * `consultarCPEFerroviaria`.
   */
  async autorizarCPEFerroviaria(
    params: AutorizarCPEFerroviariaParams,
    opts?: CallOptions,
  ): Promise<CPEFerroviariaDetalle> {
    return this.#detalle(
      'autorizarCPEFerroviaria',
      'emision',
      S.AUTORIZAR_FERROVIARIA,
      params,
      S.R_DETALLE_FERROVIARIA,
      opts,
    );
  }

  /** Consulta una CPE ferroviaria por `cartaPorte` o `nroCTG`. */
  async consultarCPEFerroviaria(params: ConsultarCPEParams, opts?: CallOptions): Promise<CPEFerroviariaDetalle> {
    return this.#detalle(
      'consultarCPEFerroviaria',
      'consulta',
      S.CONSULTAR_CPE,
      params,
      S.R_DETALLE_FERROVIARIA,
      opts,
      requireCartaPorteOCtg,
    );
  }

  /**
   * Edita una CPE ferroviaria activa. Emisión.
   *
   * ARCA anula los CUIT opcionales que no se informan: para mantenerlos,
   * pasalos o usá `opts.preservarIntervinientes` (ver `EditarCPEOptions`).
   */
  async editarCPEFerroviaria(params: EditarCPEFerroviariaParams, opts?: EditarCPEOptions): Promise<CPEResultado> {
    return this.#editar(
      'ferroviaria',
      'editarCPEFerroviaria',
      S.EDITAR_FERROVIARIA,
      params,
      (p, vigente) => completarDesde(p, vigente, PRESERVAR.ferroviaria),
      opts,
    );
  }

  /**
   * Edita los intervinientes de una CPE ferroviaria confirmada. Emisión.
   * Los que no se informan se anulan (ver `EditarCPEOptions.preservarIntervinientes`).
   */
  async editarCPEConfirmadaFerroviaria(
    params: EditarCPEConfirmadaParams,
    opts?: EditarCPEOptions,
  ): Promise<CPEResultado> {
    return this.#editarConfirmada('ferroviaria', 'editarCPEConfirmadaFerroviaria', params, opts);
  }

  /** Confirmación definitiva de una CPE ferroviaria. Emisión. */
  async confirmacionDefinitivaCPEFerroviaria(
    params: ConfirmacionDefinitivaCPEFerroviariaParams,
    opts?: CallOptions,
  ): Promise<CPEResultado> {
    return this.#operar('confirmacionDefinitivaCPEFerroviaria', S.CONFIRMACION_FERROVIARIA, params, opts);
  }

  /** Cambia destino y/o destinatario de una CPE ferroviaria. Emisión. */
  async nuevoDestinoDestinatarioCPEFerroviaria(
    params: NuevoDestinoDestinatarioCPEFerroviariaParams,
    opts?: CallOptions,
  ): Promise<CPEResultado> {
    return this.#operar('nuevoDestinoDestinatarioCPEFerroviaria', S.NUEVO_DESTINO_FERROVIARIA, params, opts);
  }

  /** Regreso a origen de una CPE ferroviaria. Emisión. */
  async regresoOrigenCPEFerroviaria(
    params: RegresoOrigenCPEFerroviariaParams,
    opts?: CallOptions,
  ): Promise<CPEResultado> {
    return this.#operar('regresoOrigenCPEFerroviaria', S.REGRESO_ORIGEN_FERROVIARIA, params, opts);
  }

  /** Desvío de una CPE ferroviaria. Emisión. */
  async desvioCPEFerroviaria(params: DesvioCPEFerroviariaParams, opts?: CallOptions): Promise<CPEResultado> {
    return this.#operar('desvioCPEFerroviaria', S.DESVIO_FERROVIARIA, params, opts);
  }

  /** Consulta las CPE ferroviarias de un operativo. */
  async consultaCPEFerroviariaPorNroOperativo(
    nroOperativo: number,
    opts?: CallOptions,
  ): Promise<OperativoFerroviarioCPE> {
    const method = 'consultaCPEFerroviariaPorNroOperativo';
    const solicitud = encodeRequest({ nroOperativo }, S.CONSULTAR_POR_NRO_OPERATIVO, method);
    const { node, advertencias } = await this.#call(method, { solicitud }, 'consulta', opts);
    const r = decodeResult<OperativoFerroviarioCPE>(node, S.R_OPERATIVO_FERROVIARIO, `${method}.respuesta`, 'consulta');
    return withAdvertencias(r, advertencias);
  }

  // ============================================================
  // Derivados granarios (DG): automotor (284)
  // ============================================================

  /**
   * Autoriza una CPE automotor de derivados granarios (`cabecera.tipoCP`
   * `TIPO_CPE.AUTOMOTOR_DG`, 284).
   * Emisión: si falla con `uncertain`, consultá `consultarUltNroOrden` +
   * `consultarCPEAutomotorDG` antes de reintentar.
   */
  async autorizarCPEAutomotorDG(
    params: AutorizarCPEAutomotorDGParams,
    opts?: CallOptions,
  ): Promise<CPEAutomotorDGDetalle> {
    return this.#detalle(
      'autorizarCPEAutomotorDG',
      'emision',
      S.AUTORIZAR_AUTOMOTOR_DG,
      params,
      S.R_DETALLE_AUTOMOTOR_DG,
      opts,
      checkCargaDG,
    );
  }

  /** Consulta una CPE automotor DG por `cartaPorte` o `nroCTG`. */
  async consultarCPEAutomotorDG(params: ConsultarCPEDGParams, opts?: CallOptions): Promise<CPEAutomotorDGDetalle> {
    return this.#detalle(
      'consultarCPEAutomotorDG',
      'consulta',
      S.CONSULTAR_CPE_DG,
      params,
      S.R_DETALLE_AUTOMOTOR_DG,
      opts,
      requireCartaPorteOCtg,
    );
  }

  /** Edita una CPE automotor DG activa (también la emitida en destino). Emisión. */
  async editarCPEDGAutomotor(params: EditarCPEDGAutomotorParams, opts?: CallOptions): Promise<CPEResultado> {
    return this.#operar('editarCPEDGAutomotor', S.EDITAR_AUTOMOTOR_DG, params, opts);
  }

  /** Edita los intervinientes y observaciones de una CPE automotor DG confirmada. Emisión. */
  async editarCPEDGConfirmadaAutomotor(params: EditarCPEDGConfirmadaParams, opts?: CallOptions): Promise<CPEResultado> {
    return this.#operar('editarCPEDGConfirmadaAutomotor', S.EDITAR_CONFIRMADA_DG, params, opts);
  }

  /** Confirmación definitiva de una CPE automotor DG (también la emitida en destino). Emisión. */
  async confirmacionDefinitivaCPEAutomotorDG(
    params: ConfirmacionDefinitivaCPEAutomotorDGParams,
    opts?: CallOptions,
  ): Promise<CPEResultado> {
    return this.#operar('confirmacionDefinitivaCPEAutomotorDG', S.CONFIRMACION_AUTOMOTOR_DG, params, opts);
  }

  /** Desvío de una CPE automotor DG (también la emitida en destino). Emisión. */
  async desvioCPEAutomotorDG(params: DesvioCPEAutomotorDGParams, opts?: CallOptions): Promise<CPEResultado> {
    return this.#operar('desvioCPEAutomotorDG', S.DESVIO_AUTOMOTOR_DG, params, opts);
  }

  /** Cambia destino y/o destinatario de una CPE automotor DG. Emisión. */
  async nuevoDestinoDestinatarioCPEAutomotorDG(
    params: NuevoDestinoDestinatarioCPEAutomotorDGParams,
    opts?: CallOptions,
  ): Promise<CPEResultado> {
    return this.#operar('nuevoDestinoDestinatarioCPEAutomotorDG', S.NUEVO_DESTINO_AUTOMOTOR_DG, params, opts);
  }

  /** Regreso a origen de una CPE automotor DG. Emisión. */
  async regresoOrigenCPEAutomotorDG(
    params: RegresoOrigenCPEAutomotorDGParams,
    opts?: CallOptions,
  ): Promise<CPEResultado> {
    return this.#operar('regresoOrigenCPEAutomotorDG', S.REGRESO_ORIGEN_AUTOMOTOR_DG, params, opts);
  }

  // ============================================================
  // Derivados granarios (DG): ferroviaria (285)
  // ============================================================

  /**
   * Autoriza una CPE ferroviaria de derivados granarios (`TIPO_CPE.FERROVIARIA_DG`, 285).
   * Emisión: si falla con `uncertain`, consultá
   * `consultarUltNroOrden(sucursal, TIPO_CPE.FERROVIARIA_DG)` + `consultarCPEFerroviariaDG`.
   */
  async autorizarCPEFerroviariaDG(
    params: AutorizarCPEFerroviariaDGParams,
    opts?: CallOptions,
  ): Promise<CPEFerroviariaDGDetalle> {
    return this.#detalle(
      'autorizarCPEFerroviariaDG',
      'emision',
      S.AUTORIZAR_FERROVIARIA_DG,
      params,
      S.R_DETALLE_FERROVIARIA_DG,
      opts,
      checkCargaDG,
    );
  }

  /** Consulta una CPE ferroviaria DG por `cartaPorte` o `nroCTG`. */
  async consultarCPEFerroviariaDG(params: ConsultarCPEDGParams, opts?: CallOptions): Promise<CPEFerroviariaDGDetalle> {
    return this.#detalle(
      'consultarCPEFerroviariaDG',
      'consulta',
      S.CONSULTAR_CPE_DG,
      params,
      S.R_DETALLE_FERROVIARIA_DG,
      opts,
      requireCartaPorteOCtg,
    );
  }

  /** Edita una CPE ferroviaria DG activa o confirmada. Emisión. */
  async editarCPEDGFerroviaria(params: EditarCPEDGFerroviariaParams, opts?: CallOptions): Promise<CPEResultado> {
    return this.#operar('editarCPEDGFerroviaria', S.EDITAR_FERROVIARIA_DG, params, opts);
  }

  /** Edita los intervinientes y observaciones de una CPE ferroviaria DG confirmada. Emisión. */
  async editarCPEDGConfirmadaFerroviaria(
    params: EditarCPEDGConfirmadaParams,
    opts?: CallOptions,
  ): Promise<CPEResultado> {
    return this.#operar('editarCPEDGConfirmadaFerroviaria', S.EDITAR_CONFIRMADA_DG, params, opts);
  }

  /** Confirmación definitiva de una CPE ferroviaria DG. Emisión. */
  async confirmacionDefinitivaCPEFerroviariaDG(
    params: ConfirmacionDefinitivaCPEFerroviariaDGParams,
    opts?: CallOptions,
  ): Promise<CPEResultado> {
    return this.#operar('confirmacionDefinitivaCPEFerroviariaDG', S.CONFIRMACION_FERROVIARIA_DG, params, opts);
  }

  /** Desvío de una CPE ferroviaria DG. Emisión. */
  async desvioCPEFerroviariaDG(params: DesvioCPEFerroviariaDGParams, opts?: CallOptions): Promise<CPEResultado> {
    return this.#operar('desvioCPEFerroviariaDG', S.DESVIO_FERROVIARIA_DG, params, opts);
  }

  /** Cambia destino y/o destinatario de una CPE ferroviaria DG. Emisión. */
  async nuevoDestinoDestinatarioCPEFerroviariaDG(
    params: NuevoDestinoDestinatarioCPEFerroviariaDGParams,
    opts?: CallOptions,
  ): Promise<CPEResultado> {
    return this.#operar('nuevoDestinoDestinatarioCPEFerroviariaDG', S.NUEVO_DESTINO_FERROVIARIA_DG, params, opts);
  }

  /** Regreso a origen de una CPE ferroviaria DG. Emisión. */
  async regresoOrigenCPEFerroviariaDG(
    params: RegresoOrigenCPEFerroviariaDGParams,
    opts?: CallOptions,
  ): Promise<CPEResultado> {
    return this.#operar('regresoOrigenCPEFerroviariaDG', S.REGRESO_ORIGEN_FERROVIARIA_DG, params, opts);
  }

  // ============================================================
  // Derivados granarios (DG): pendientes de emisión (PE), automotor y ferroviaria
  // ============================================================

  /** CPE DG (automotor y ferroviaria) en estado PE de una planta. Sin resultados → `[]`. */
  async consultarCPEDGPendienteActivacion(planta: number, opts?: CallOptions): Promise<CPEDGPendiente[]> {
    const solicitud = encodeRequest({ planta }, S.CONSULTAR_POR_PLANTA, 'consultarCPEDGPendienteActivacion');
    return this.#lista('consultarCPEDGPendienteActivacion', { solicitud }, 'cartaPorte', S.R_CPE_DG_PENDIENTE, opts);
  }

  /** Acepta una CPE DG en estado PE. Emisión. */
  async aceptarEmisionDG(params: SolicitanteCartaPorteParams, opts?: CallOptions): Promise<CPEResultado> {
    return this.#operar('aceptarEmisionDG', S.SOLICITANTE_CARTA_PORTE, params, opts);
  }

  /** Rechaza una CPE DG en estado PE. Emisión. */
  async rechazarEmisionDG(params: SolicitanteCartaPorteParams, opts?: CallOptions): Promise<CPEResultado> {
    return this.#operar('rechazarEmisionDG', S.SOLICITANTE_CARTA_PORTE, params, opts);
  }

  // ============================================================
  // Derivados granarios (DG): emitida en destino (286)
  // ============================================================

  /**
   * Autoriza una CPE DG emitida por el destino (`cabecera.tipoCP`
   * `TIPO_CPE.EMISION_DESTINO_DG`, 286); queda
   * pendiente de aceptación del origen (PO). Emisión: si falla con `uncertain`,
   * consultá `consultarUltNroOrden` + `consultarCPEEmisionDestinoDG`.
   */
  async autorizarCPEEmisionDestinoDG(
    params: AutorizarCPEEmisionDestinoDGParams,
    opts?: CallOptions,
  ): Promise<CPEEmisionDestinoDGDetalle> {
    return this.#detalle(
      'autorizarCPEEmisionDestinoDG',
      'emision',
      S.AUTORIZAR_EMISION_DESTINO_DG,
      params,
      S.R_DETALLE_EMISION_DESTINO_DG,
      opts,
      checkCargaDG,
    );
  }

  /** Consulta una CPE emitida en destino por `cartaPorte` o `nroCTG`. */
  async consultarCPEEmisionDestinoDG(
    params: ConsultarCPEDGParams,
    opts?: CallOptions,
  ): Promise<CPEEmisionDestinoDGDetalle> {
    return this.#detalle(
      'consultarCPEEmisionDestinoDG',
      'consulta',
      S.CONSULTAR_CPE_DG,
      params,
      S.R_DETALLE_EMISION_DESTINO_DG,
      opts,
      requireCartaPorteOCtg,
    );
  }

  /** CPE emitidas en destino pendientes de aceptación del origen (PO) de una planta. Sin resultados → `[]`. */
  async consultarCPEEmitidasDestinoDGPendientesActivacion(
    planta: number,
    opts?: CallOptions,
  ): Promise<CPEDGPendiente[]> {
    const method = 'consultarCPEEmitidasDestinoDGPendientesActivacion';
    const solicitud = encodeRequest({ planta }, S.CONSULTAR_POR_PLANTA, method);
    return this.#lista(method, { solicitud }, 'cartaPorte', S.R_CPE_DG_PENDIENTE, opts);
  }

  /** El origen acepta una CPE emitida en destino (estado PO). Emisión. */
  async aceptarEmisionDestinoDG(params: SolicitanteDestinoCartaPorteParams, opts?: CallOptions): Promise<CPEResultado> {
    return this.#operar('aceptarEmisionDestinoDG', S.SOLICITANTE_DESTINO_CARTA_PORTE, params, opts);
  }

  /** El origen rechaza una CPE emitida en destino (estado PO). Emisión. */
  async rechazarEmisionDestinoDG(
    params: SolicitanteDestinoCartaPorteParams,
    opts?: CallOptions,
  ): Promise<CPEResultado> {
    return this.#operar('rechazarEmisionDestinoDG', S.SOLICITANTE_DESTINO_CARTA_PORTE, params, opts);
  }

  /** Anula una CPE emitida en destino. Emisión. */
  async anularCPEEmisionDestinoDG(params: AnularCPEEmisionDestinoDGParams, opts?: CallOptions): Promise<CPEResultado> {
    return this.#operar('anularCPEEmisionDestinoDG', S.ANULAR_EMISION_DESTINO_DG, params, opts);
  }

  /** Informa una contingencia sobre una CPE emitida en destino (conceptos A a F). Emisión. */
  async informarContingenciaEmisionDestinoDG(
    params: InformarContingenciaEmisionDestinoDGParams,
    opts?: CallOptions,
  ): Promise<CPEResultado> {
    return this.#operar(
      'informarContingenciaEmisionDestinoDG',
      S.INFORMAR_CONTINGENCIA_EMISION_DESTINO_DG,
      params,
      opts,
      checkConceptoContingencia,
    );
  }

  /** Cierra una contingencia de una CPE emitida en destino. Emisión. */
  async cerrarContingenciaCPEEmisionDestinoDG(
    params: CerrarContingenciaCPEEmisionDestinoDGParams,
    opts?: CallOptions,
  ): Promise<CPEResultado> {
    return this.#operar(
      'cerrarContingenciaCPEEmisionDestinoDG',
      S.CERRAR_CONTINGENCIA_EMISION_DESTINO_DG,
      params,
      opts,
    );
  }

  /** Informa la descarga en destino de una CPE emitida en destino. Emisión. */
  async descargadoDestinoCPEEmisionDestinoDG(
    params: SolicitanteDestinoCartaPorteParams,
    opts?: CallOptions,
  ): Promise<CPEResultado> {
    return this.#operar('descargadoDestinoCPEEmisionDestinoDG', S.SOLICITANTE_DESTINO_CARTA_PORTE, params, opts);
  }

  /** Cambia destino y/o destinatario de una CPE emitida en destino. Emisión. */
  async nuevoDestinoDestinatarioCPEEmisionDestinoDG(
    params: NuevoDestinoDestinatarioCPEEmisionDestinoDGParams,
    opts?: CallOptions,
  ): Promise<CPEResultado> {
    return this.#operar(
      'nuevoDestinoDestinatarioCPEEmisionDestinoDG',
      S.NUEVO_DESTINO_EMISION_DESTINO_DG,
      params,
      opts,
    );
  }

  /** Regreso a origen de una CPE emitida en destino. Emisión. */
  async regresoOrigenCPEEmisionDestinoDG(
    params: RegresoOrigenCPEEmisionDestinoDGParams,
    opts?: CallOptions,
  ): Promise<CPEResultado> {
    return this.#operar('regresoOrigenCPEEmisionDestinoDG', S.REGRESO_ORIGEN_EMISION_DESTINO_DG, params, opts);
  }

  // ============================================================
  // Derivados granarios (DG): ductos (287)
  // ============================================================

  /** Consulta una CPE de ductos por `cartaPorte` o `nroCTG`. */
  async consultarCPEDuctos(params: ConsultarCPEParams, opts?: CallOptions): Promise<CPEDuctosDetalle> {
    return this.#detalle(
      'consultarCPEDuctos',
      'consulta',
      S.CONSULTAR_CPE_DUCTOS,
      params,
      S.R_DETALLE_DUCTOS_DG,
      opts,
      requireCartaPorteOCtg,
    );
  }

  /** Edita una CPE de ductos activa. Emisión. */
  async editarCPEDGDuctos(params: EditarCPEDGDuctosParams, opts?: CallOptions): Promise<CPEResultado> {
    return this.#operar('editarCPEDGDuctos', S.EDITAR_DUCTOS_DG, params, opts);
  }

  /** Edita los intervinientes y observaciones de una CPE de ductos confirmada. Emisión. */
  async editarCPEConfirmadaDuctos(params: EditarCPEDGConfirmadaParams, opts?: CallOptions): Promise<CPEResultado> {
    return this.#operar('editarCPEConfirmadaDuctos', S.EDITAR_CONFIRMADA_DG, params, opts);
  }

  /** Confirmación definitiva de una CPE de ductos. Emisión. */
  async confirmacionDefinitivaCPEDuctosDG(
    params: ConfirmacionDefinitivaCPEDuctosDGParams,
    opts?: CallOptions,
  ): Promise<CPEResultado> {
    return this.#operar('confirmacionDefinitivaCPEDuctosDG', S.CONFIRMACION_DUCTOS_DG, params, opts);
  }

  // ============================================================
  // Consultas
  // ============================================================

  /**
   * CPEs con destino en una planta, por rango de fecha de partida (de hasta 3
   * días, error 2152). Sin resultados → `[]`.
   */
  async consultarCPEPorDestino(params: ConsultarCPEPorDestinoParams, opts?: CallOptions): Promise<CPEResumen[]> {
    const solicitud = encodeRequest(
      params,
      S.CONSULTAR_POR_DESTINO,
      'consultarCPEPorDestino',
      checkRangoConsultaDestino,
    );
    return this.#lista('consultarCPEPorDestino', { solicitud }, 'cartaPorte', S.R_CPE_RESUMEN, opts);
  }

  /** CPEs pendientes de resolución como solicitante (`S`) o destino (`D`). Sin resultados → `[]`. */
  async consultarCPEPPendientesDeResolucion(
    params: ConsultarCPEPendientesParams,
    opts?: CallOptions,
  ): Promise<CPEResumen[]> {
    const solicitud = encodeRequest(params, S.CONSULTAR_PENDIENTES, 'consultarCPEPPendientesDeResolucion');
    return this.#lista('consultarCPEPPendientesDeResolucion', { solicitud }, 'cartaPorte', S.R_CPE_RESUMEN, opts);
  }

  /**
   * Último número de orden autorizado para una sucursal y tipo de CPE.
   * @throws ArcaAgroResponseError si ARCA no devuelve `nroOrden`.
   */
  async consultarUltNroOrden(sucursal: number, tipoCPE: number, opts?: CallOptions): Promise<number> {
    const solicitud = encodeRequest({ sucursal, tipoCPE }, S.CONSULTAR_ULT_NRO_ORDEN, 'consultarUltNroOrden');
    const { node } = await this.#call('consultarUltNroOrden', { solicitud }, 'consulta', opts);
    return decodeResult<{ nroOrden: number }>(node, S.R_ULT_NRO_ORDEN, 'consultarUltNroOrden.respuesta', 'consulta')
      .nroOrden;
  }

  /**
   * Número de orden siguiente al último autorizado (`consultarUltNroOrden + 1`).
   *
   * **No es atómico**: dos procesos que lo llamen a la vez obtienen el mismo
   * número y uno de los dos `autorizar*` será rechazado. Si emitís en paralelo
   * para la misma sucursal y tipo, serializá las emisiones o llevá tu propio
   * contador.
   */
  async siguienteNroOrden(sucursal: number, tipoCPE: number, opts?: CallOptions): Promise<number> {
    return (await this.consultarUltNroOrden(sucursal, tipoCPE, opts)) + 1;
  }

  // ============================================================
  // Paramétricas
  // ============================================================

  /** Provincias. */
  async consultarProvincias(opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.#lista('consultarProvincias', {}, 'provincia', S.R_CODIGO_DESCRIPCION, opts);
  }

  /** Localidades de una provincia. */
  async consultarLocalidadesPorProvincia(codProvincia: number, opts?: CallOptions): Promise<CodigoDescripcion[]> {
    const solicitud = encodeRequest({ codProvincia }, S.CONSULTAR_LOCALIDADES, 'consultarLocalidadesPorProvincia');
    return this.#lista('consultarLocalidadesPorProvincia', { solicitud }, 'localidad', S.R_CODIGO_DESCRIPCION, opts);
  }

  /** Tipos de grano. */
  async consultarTiposGrano(opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.#lista('consultarTiposGrano', {}, 'grano', S.R_CODIGO_DESCRIPCION, opts);
  }

  /** Plantas habilitadas de un CUIT. */
  async consultarPlantas(cuit: CuitInput, opts?: CallOptions): Promise<PlantaCPE[]> {
    const solicitud = encodeRequest({ cuit }, S.SOLICITUD_CUIT, 'consultarPlantas');
    return this.#lista('consultarPlantas', { solicitud }, 'planta', S.R_PLANTA, opts);
  }

  /** Plantas de derivados granarios de un CUIT (titular de planta). */
  async consultarPlantasDG(cuit: CuitInput, opts?: CallOptions): Promise<PlantaDGCPE[]> {
    const solicitud = encodeRequest({ cuit }, S.SOLICITUD_CUIT, 'consultarPlantasDG');
    return this.#lista('consultarPlantasDG', { solicitud }, 'planta', S.R_PLANTA_DG, opts);
  }

  /** Derivados granarios, con su grano padre. */
  async consultarDerivadosGranarios(opts?: CallOptions): Promise<DerivadoGranarioCPE[]> {
    return this.#lista('consultarDerivadosGranarios', {}, 'derivadoGranario', S.R_DERIVADO_GRANARIO, opts);
  }

  /** Localidades (campos) de un productor. */
  async consultarLocalidadesProductor(cuit: CuitInput, opts?: CallOptions): Promise<LocalidadProductorCPE[]> {
    const solicitud = encodeRequest({ cuit }, S.SOLICITUD_CUIT, 'consultarLocalidadesProductor');
    return this.#lista('consultarLocalidadesProductor', { solicitud }, 'localidad', S.R_LOCALIDAD_PRODUCTOR, opts);
  }

  /** Categorías de semillas. */
  async consultarCategoriasSemillas(opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.#lista('consultarCategoriasSemillas', {}, 'categoria', S.R_CODIGO_DESCRIPCION, opts);
  }

  /** Variedades de semillas, opcionalmente filtradas por grano. */
  async consultarVariedadesSemillas(codGrano?: number, opts?: CallOptions): Promise<VariedadSemillaCPE[]> {
    const body = encodeRequest({ codGrano }, S.CONSULTAR_VARIEDADES, 'consultarVariedadesSemillas');
    return this.#lista('consultarVariedadesSemillas', body, 'variedad', S.R_VARIEDAD_SEMILLA, opts);
  }

  /** RENSPA de un productor en una provincia. */
  async consultarRenspa(cuit: CuitInput, codProvincia: number, opts?: CallOptions): Promise<RenspaCPE[]> {
    const body = encodeRequest({ cuit, codProvincia }, S.CONSULTAR_RENSPA, 'consultarRenspa');
    return this.#lista('consultarRenspa', body, 'renspa', S.R_RENSPA, opts);
  }

  /** Domicilios (PUC) de un CUIT, para los circuitos que piden `DomicilioPUC`. */
  async consultarDomiciliosPorCUIT(cuit: CuitInput, opts?: CallOptions): Promise<DomicilioCPE[]> {
    const body = encodeRequest({ cuit }, S.CONSULTAR_DOMICILIOS, 'consultarDomiciliosPorCUIT');
    return this.#lista('consultarDomiciliosPorCUIT', body, 'domicilio', S.R_DOMICILIO, opts);
  }

  /** Tipos de embalaje, con sus unidades de medida. */
  async consultarTiposEmbalaje(opts?: CallOptions): Promise<TipoEmbalajeCPE[]> {
    return this.#lista('consultarTiposEmbalaje', {}, 'tipoEmbalaje', S.R_TIPO_EMBALAJE, opts);
  }

  /** Unidades de medida. */
  async consultarUnidadesMedida(opts?: CallOptions): Promise<CodigoDescripcion[]> {
    return this.#lista('consultarUnidadesMedida', {}, 'unidadMedida', S.R_CODIGO_DESCRIPCION, opts);
  }

  /** Estado de los servidores de WSCPE (no requiere autenticación). */
  async dummy(opts?: CallOptions): Promise<ServerStatus> {
    return parseServerStatus((await this.#call('dummy', null, 'consulta', opts)).node);
  }
}
