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
  AnularCPEParams,
  AutorizarCPEAutomotorParams,
  AutorizarCPEFerroviariaParams,
  CerrarContingenciaCPEParams,
  ConfirmacionDefinitivaCPEAutomotorParams,
  ConfirmacionDefinitivaCPEFerroviariaParams,
  ConsultarCPEParams,
  ConsultarCPEPendientesParams,
  ConsultarCPEPorDestinoParams,
  CPEAutomotorDetalle,
  CPEFerroviariaDetalle,
  CPEResultado,
  CPEResumen,
  DesvioCPEAutomotorParams,
  DomicilioCPE,
  DesvioCPEFerroviariaParams,
  EditarCPEAutomotorParams,
  EditarCPEConfirmadaParams,
  EditarCPEFerroviariaParams,
  InformarContingenciaParams,
  LocalidadProductorCPE,
  NuevoDestinoDestinatarioCPEAutomotorParams,
  NuevoDestinoDestinatarioCPEFerroviariaParams,
  OperativoFerroviarioCPE,
  PlantaCPE,
  RechazoCPEParams,
  RegresoOrigenCPEAutomotorParams,
  RegresoOrigenCPEFerroviariaParams,
  RenspaCPE,
  SolicitanteCartaPorteParams,
  TipoEmbalajeCPE,
  VariedadSemillaCPE,
} from './cpe-types.js';
import type { CuitInput } from './types.js';
import { requireCartaPorteOCtg, requireOrigen } from './validation.js';

const SERVICE = 'WSCPE';

const listOf = (name: string, item: Schema): Schema => ({ [name]: list(obj(item), 0) });

/** La respuesta trae la CPE (`cabecera.nroCTG` o `cabecera.estado`). */
const conCabecera = (node: Record<string, unknown>): boolean =>
  Boolean(at(node, 'cabecera.nroCTG') || at(node, 'cabecera.estado'));

/**
 * Cliente de WSCPE (Carta de Porte Electrónica). Se accede como `agro.cpe`.
 *
 * Cubre el circuito automotor y ferroviario de granos y las consultas
 * paramétricas. El circuito de derivados granarios (DG) no está soportado.
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
   * `<Operacion>Req` / `<Operacion>Resp` (salvo `responseElement`) y el
   * SOAPAction es `namespace + operacion`. Devuelve el nodo `respuesta` y los
   * errores admitidos, después de verificar `errores`.
   */
  async #call(
    method: string,
    body: Record<string, unknown> | null,
    kind: SoapOperationKind,
    opts?: CallOptions,
    responseElement?: string,
  ): Promise<{ node: Record<string, unknown>; advertencias: ServiceErrorDetail[] }> {
    const element = method.charAt(0).toUpperCase() + method.slice(1);
    const params =
      body === null
        ? {}
        : { auth: { ...(await ticketAuth(this.#ctx.getTicket, opts)), cuitRepresentada: this.#ctx.cuit }, ...body };
    const result = await this.soapCall(method, params, {
      kind,
      signal: this.#ctx.callOptions(opts).signal,
      requestElement: body === null ? null : `${element}Req`,
      responseElement: responseElement ?? `${element}Resp`,
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
  async #operar(method: string, schema: Schema, params: unknown, opts?: CallOptions): Promise<CPEResultado> {
    const solicitud = encodeRequest(params, schema, method);
    const { node, advertencias } = await this.#call(method, { solicitud }, 'emision', opts);
    const r = decodeResult<CPEResultado>(node, S.R_CARTA_PORTE, `${method}.respuesta`, 'emision');
    return withAdvertencias(r, advertencias);
  }

  /** Respuesta de detalle (autorizar/consultar): exige `cabecera.nroCTG`. */
  async #detalle<T extends { cabecera?: { nroCTG?: string } }>(
    method: string,
    solicitud: unknown,
    schema: Schema,
    kind: SoapOperationKind,
    opts?: CallOptions,
  ): Promise<T> {
    const { node, advertencias } = await this.#call(method, { solicitud }, kind, opts);
    const detalle = decodeResult<T>(node, schema, `${method}.respuesta`, kind);
    requireValue(detalle.cabecera?.nroCTG, 'cabecera.nroCTG', SERVICE, method, kind);
    return withAdvertencias(detalle, advertencias);
  }

  async #lista<T>(
    method: string,
    body: Record<string, unknown>,
    item: string,
    schema: Schema,
    opts?: CallOptions,
    responseElement?: string,
  ): Promise<T[]> {
    const { node } = await this.#call(method, body, 'consulta', opts, responseElement);
    return decodeResult<Record<string, T[]>>(node, listOf(item, schema), `${method}.respuesta`, 'consulta')[item];
  }

  // ============================================================
  // Circuito automotor
  // ============================================================

  /**
   * Autoriza una CPE automotor (tipo 74) o automotor flete corto (274).
   * Emisión: no se reintenta. Si falla con `uncertain`, consultá
   * `consultarUltNroOrden` + `consultarCPEAutomotor` (y comprobá que sea la
   * tuya) antes de reintentar. Un error 550 va a `advertencias`.
   */
  async autorizarCPEAutomotor(params: AutorizarCPEAutomotorParams, opts?: CallOptions): Promise<CPEAutomotorDetalle> {
    const solicitud = encodeRequest(params, S.AUTORIZAR_AUTOMOTOR, 'autorizarCPEAutomotor', requireOrigen);
    return this.#detalle<CPEAutomotorDetalle>(
      'autorizarCPEAutomotor',
      solicitud,
      S.R_DETALLE_AUTOMOTOR,
      'emision',
      opts,
    );
  }

  /** Consulta una CPE automotor por `cartaPorte` (tipo/sucursal/nroOrden) o por `nroCTG`. */
  async consultarCPEAutomotor(params: ConsultarCPEParams, opts?: CallOptions): Promise<CPEAutomotorDetalle> {
    const solicitud = encodeRequest(params, S.CONSULTAR_CPE, 'consultarCPEAutomotor', requireCartaPorteOCtg);
    return this.#detalle<CPEAutomotorDetalle>(
      'consultarCPEAutomotor',
      solicitud,
      S.R_DETALLE_AUTOMOTOR,
      'consulta',
      opts,
    );
  }

  /** Edita una CPE automotor activa. Emisión. */
  async editarCPEAutomotor(params: EditarCPEAutomotorParams, opts?: CallOptions): Promise<CPEResultado> {
    return this.#operar('editarCPEAutomotor', S.EDITAR_AUTOMOTOR, params, opts);
  }

  /** Edita los intervinientes de una CPE automotor confirmada. Emisión. */
  async editarCPEConfirmadaAutomotor(params: EditarCPEConfirmadaParams, opts?: CallOptions): Promise<CPEResultado> {
    return this.#operar('editarCPEConfirmadaAutomotor', S.EDITAR_CONFIRMADA, params, opts);
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

  /** Informa una contingencia sobre una CPE. Emisión. */
  async informarContingencia(params: InformarContingenciaParams, opts?: CallOptions): Promise<CPEResultado> {
    return this.#operar('informarContingencia', S.INFORMAR_CONTINGENCIA, params, opts);
  }

  /** Cierra una contingencia (reactivar, extender o desactivar la CP). Emisión. */
  async cerrarContingenciaCPE(params: CerrarContingenciaCPEParams, opts?: CallOptions): Promise<CPEResultado> {
    return this.#operar('cerrarContingenciaCPE', S.CERRAR_CONTINGENCIA, params, opts);
  }

  // ============================================================
  // Circuito ferroviario
  // ============================================================

  /**
   * Autoriza una CPE ferroviaria (tipo 75). Emisión: si falla con `uncertain`,
   * consultá `consultarUltNroOrden(sucursal, 75)` + `consultarCPEFerroviaria`.
   */
  async autorizarCPEFerroviaria(
    params: AutorizarCPEFerroviariaParams,
    opts?: CallOptions,
  ): Promise<CPEFerroviariaDetalle> {
    const solicitud = encodeRequest(params, S.AUTORIZAR_FERROVIARIA, 'autorizarCPEFerroviaria');
    return this.#detalle<CPEFerroviariaDetalle>(
      'autorizarCPEFerroviaria',
      solicitud,
      S.R_DETALLE_FERROVIARIA,
      'emision',
      opts,
    );
  }

  /** Consulta una CPE ferroviaria por `cartaPorte` o `nroCTG`. */
  async consultarCPEFerroviaria(params: ConsultarCPEParams, opts?: CallOptions): Promise<CPEFerroviariaDetalle> {
    const solicitud = encodeRequest(params, S.CONSULTAR_CPE, 'consultarCPEFerroviaria', requireCartaPorteOCtg);
    return this.#detalle<CPEFerroviariaDetalle>(
      'consultarCPEFerroviaria',
      solicitud,
      S.R_DETALLE_FERROVIARIA,
      'consulta',
      opts,
    );
  }

  /** Edita una CPE ferroviaria activa. Emisión. */
  async editarCPEFerroviaria(params: EditarCPEFerroviariaParams, opts?: CallOptions): Promise<CPEResultado> {
    return this.#operar('editarCPEFerroviaria', S.EDITAR_FERROVIARIA, params, opts);
  }

  /** Edita los intervinientes de una CPE ferroviaria confirmada. Emisión. */
  async editarCPEConfirmadaFerroviaria(params: EditarCPEConfirmadaParams, opts?: CallOptions): Promise<CPEResultado> {
    return this.#operar('editarCPEConfirmadaFerroviaria', S.EDITAR_CONFIRMADA, params, opts);
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
  // Consultas
  // ============================================================

  /** CPEs con destino en una planta, por rango de fecha de partida. Sin resultados → `[]`. */
  async consultarCPEPorDestino(params: ConsultarCPEPorDestinoParams, opts?: CallOptions): Promise<CPEResumen[]> {
    const solicitud = encodeRequest(params, S.CONSULTAR_POR_DESTINO, 'consultarCPEPorDestino');
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
    // El elemento de respuesta es `ConsultarRenspaRes` (no `...Resp`).
    return this.#lista('consultarRenspa', body, 'renspa', S.R_RENSPA, opts, 'ConsultarRenspaRes');
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
