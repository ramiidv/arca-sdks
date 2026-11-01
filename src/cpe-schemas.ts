/**
 * Schemas de WSCPE, transcriptos del XSD embebido en el WSDL oficial
 * (https://cpea-ws-qaext.afip.gob.ar/wscpe/services/soap?wsdl). El orden de
 * las claves es el orden de la `xsd:sequence`.
 *
 * @internal
 */
import { base64, bool, cuit, date, datetime, dec, id, int, list, must, obj, opt, str } from './schema.js';
import type { Schema } from './schema.js';

// ---------------------------------------------------------------------------
// Tipos simples (XSD)
// ---------------------------------------------------------------------------

const tipoCPE = () => int(1, 999);
const sucursal = () => int(0, 99999);
const nroOrden = () => int(1, 99999999);
const planta = () => int(1, 999999);
const codGrano = () => int(0, 999);
const cosecha = () => int(0, 9999);
const kilogramos = () => int(1, 88000);
const kilometros = () => int(1, 99999);
const texto = (maxLen: number) => str({ minLen: 1, maxLen });

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/** CartaPorte */
export const CARTA_PORTE: Schema = { tipoCPE: tipoCPE(), sucursal: sucursal(), nroOrden: nroOrden() };

/** DestinoSolicitud */
const DESTINO: Schema = {
  cuit: cuit(),
  esDestinoCampo: bool(),
  codProvincia: int(),
  codLocalidad: int(),
  planta: opt(planta()),
};

/** DestinatarioSolicitud */
const DESTINATARIO: Schema = { cuit: cuit() };

/** RetiroProductorSolicitud */
const RETIRO_PRODUCTOR: Schema = { cuitRemitenteComercialProductor: cuit() };

/** IntervinientesSolicitud */
const INTERVINIENTES: Schema = {
  cuitRemitenteComercialVentaPrimaria: opt(cuit()),
  cuitRemitenteComercialVentaSecundaria: opt(cuit()),
  cuitRemitenteComercialVentaSecundaria2: opt(cuit()),
  cuitMercadoATermino: opt(cuit()),
  cuitCorredorVentaPrimaria: opt(cuit()),
  cuitCorredorVentaSecundaria: opt(cuit()),
  cuitRepresentanteEntregador: opt(cuit()),
  cuitRepresentanteRecibidor: opt(cuit()),
};

/** GMS */
const GMS: Schema = { grados: str(), minutos: str(), segundos: str() };

/** OrigenAutomotorSolicitud */
const ORIGEN_AUTOMOTOR: Schema = {
  operador: opt(obj({ codProvincia: int(), codLocalidad: int(), planta: planta() })),
  productor: opt(
    obj({
      codProvincia: int(),
      codLocalidad: int(),
      nroRenspa: opt(str()),
      coordenadasGPS: opt(obj({ latitud: obj(GMS), longitud: obj(GMS), ubicacionGeoreferencial: opt(str()) })),
    }),
  ),
};

/** Semilla */
const SEMILLA: Schema = {
  presentacionInase: int(200000, 999999),
  categoriaSemilla: int(),
  variedadSemilla: opt(int()),
};

/** TransporteAutomotorModificaSolicitud */
const TRANSPORTE_AUTOMOTOR_MODIFICA: Schema = {
  fechaHoraPartida: datetime(),
  kmRecorrer: kilometros(),
  codigoTurno: opt(texto(30)),
};

/** Ramal */
const RAMAL: Schema = { codigo: int(1, 99), descripcion: opt(texto(50)) };

/** TransporteFerroviariaModificaSolicitud */
const TRANSPORTE_FERROVIARIA_MODIFICA: Schema = {
  ramal: obj(RAMAL),
  fechaHoraPartidaTren: datetime(),
  kmRecorrer: kilometros(),
};

/** AutorizarAutomotorSolicitud */
export const AUTORIZAR_AUTOMOTOR: Schema = {
  cabecera: obj({ tipoCP: tipoCPE(), cuitSolicitante: cuit(), sucursal: sucursal(), nroOrden: nroOrden() }),
  origen: obj(ORIGEN_AUTOMOTOR),
  correspondeRetiroProductor: bool(),
  esSolicitanteCampo: bool(),
  retiroProductor: opt(obj(RETIRO_PRODUCTOR)),
  intervinientes: opt(obj(INTERVINIENTES)),
  datosCarga: obj({
    codGrano: codGrano(),
    cosecha: cosecha(),
    semilla: opt(obj(SEMILLA)),
    pesoBruto: kilogramos(),
    pesoTara: kilogramos(),
  }),
  destino: obj(DESTINO),
  destinatario: obj(DESTINATARIO),
  transporte: obj({
    cuitTransportista: cuit(),
    dominio: list(str({ minLen: 6, maxLen: 7 })),
    fechaHoraPartida: datetime(),
    kmRecorrer: kilometros(),
    codigoTurno: opt(texto(30)),
    cuitChofer: cuit(),
    tarifa: opt(dec(2, 0, 99999.99)),
    cuitPagadorFlete: cuit(),
    cuitIntermediarioFlete: opt(cuit()),
    mercaderiaFumigada: bool(),
  }),
  observaciones: opt(str({ minLen: 0, maxLen: 2000 })),
};

/** AutorizarFerroviariaSolicitud */
export const AUTORIZAR_FERROVIARIA: Schema = {
  cabecera: obj({ sucursal: sucursal(), nroOrden: nroOrden(), planta: planta() }),
  correspondeRetiroProductor: bool(),
  retiroProductor: opt(obj(RETIRO_PRODUCTOR)),
  intervinientes: opt(obj(INTERVINIENTES)),
  datosCarga: obj({ codGrano: codGrano(), cosecha: cosecha(), pesoBruto: kilogramos(), pesoTara: kilogramos() }),
  destino: obj(DESTINO),
  destinatario: obj(DESTINATARIO),
  transporte: obj({
    cuitTransportista: cuit(),
    cuitTransportistaTramo2: opt(cuit()),
    nroVagon: int(1, 99999999),
    nroPrecinto: list(texto(20)),
    nroOperativo: int(1, 9999999999),
    ramal: obj(RAMAL),
    fechaHoraPartidaTren: datetime(),
    kmRecorrer: kilometros(),
    cuitPagadorFlete: opt(cuit()),
    mercaderiaFumigada: bool(),
  }),
  observaciones: opt(str({ minLen: 0, maxLen: 2000 })),
};

/** ConsultarAutomotorSolicitud / ConsultarFerroviariaSolicitud */
export const CONSULTAR_CPE: Schema = {
  cuitSolicitante: opt(cuit()),
  cartaPorte: opt(obj(CARTA_PORTE)),
  nroCTG: opt(id()),
};

/** EditarActivaAutomotorSolicitud */
export const EDITAR_AUTOMOTOR: Schema = {
  nroCTG: id(),
  cuitRemitenteComercialVentaPrimaria: opt(cuit()),
  cuitRemitenteComercialVentaSecundaria: opt(cuit()),
  cuitRemitenteComercialVentaSecundaria2: opt(cuit()),
  cuitCorredorVentaPrimaria: opt(cuit()),
  cuitCorredorVentaSecundaria: opt(cuit()),
  cuitDestinatario: cuit(),
  cuitChofer: cuit(),
  cuitTransportista: cuit(),
  destino: obj(DESTINO),
  cosecha: opt(cosecha()),
  pesoBruto: kilogramos(),
  codGrano: codGrano(),
  dominio: opt(list(str({ minLen: 6, maxLen: 7 }), 0)),
  kmRecorrer: opt(kilometros()),
  tarifa: opt(dec(2, 0, 99999.99)),
  observaciones: opt(texto(140)),
};

/** EditarActivaFerroviariaSolicitud */
export const EDITAR_FERROVIARIA: Schema = {
  nroCTG: id(),
  cuitDestinatario: opt(cuit()),
  cuitRemitenteComercialVentaPrimaria: opt(cuit()),
  cuitRemitenteComercialVentaSecundaria: opt(cuit()),
  cuitRemitenteComercialVentaSecundaria2: opt(cuit()),
  cuitCorredorVentaPrimaria: opt(cuit()),
  cuitCorredorVentaSecundaria: opt(cuit()),
  cuitTransportista: opt(cuit()),
  destino: opt(obj(DESTINO)),
  nroVagon: opt(int(1, 99999999)),
  pesoBruto: kilogramos(),
  codGrano: codGrano(),
};

const INTERV_EDITAR_CONFIRMADA: Schema = {
  cuitCorredorVentaPrimaria: opt(cuit()),
  cuitCorredorVentaSecundaria: opt(cuit()),
  cuitRemitenteComercialVentaPrimaria: opt(cuit()),
  cuitRemitenteComercialVentaSecundaria: opt(cuit()),
  cuitRemitenteComercialProductor: opt(cuit()),
};

/** EditarCPEConfirmadaAutomotorSolicitud / EditarCPEConfirmadaFerroviariaSolicitud */
export const EDITAR_CONFIRMADA: Schema = {
  nroCTG: id(),
  intervinientes: obj(INTERV_EDITAR_CONFIRMADA),
};

/** AnularCPESolicitud */
export const ANULAR: Schema = {
  cartaPorte: obj(CARTA_PORTE),
  anulacionMotivo: opt(int()),
  anulacionObservaciones: opt(texto(100)),
};

/** RechazoCPESolicitud */
export const RECHAZO: Schema = {
  cuitSolicitante: cuit(),
  cartaPorte: obj(CARTA_PORTE),
  rechazoMotivo: opt(int()),
  rechazoObservaciones: opt(texto(100)),
};

/** ConfirmarArriboSolicitud / DescargadoDestinoCPESolicitud */
export const SOLICITANTE_CARTA_PORTE: Schema = {
  cuitSolicitante: cuit(),
  cartaPorte: obj(CARTA_PORTE),
};

/** ConfirmacionAutomotorSolicitud */
export const CONFIRMACION_AUTOMOTOR: Schema = {
  cuitSolicitante: cuit(),
  cartaPorte: obj(CARTA_PORTE),
  intervinientes: opt(obj({ cuitRepresentanteRecibidor: opt(cuit()) })),
  pesoBrutoDescarga: kilogramos(),
  pesoTaraDescarga: kilogramos(),
};

/** ConfirmacionFerroviariaSolicitud */
export const CONFIRMACION_FERROVIARIA: Schema = {
  cuitSolicitante: cuit(),
  cartaPorte: obj(CARTA_PORTE),
  intervinientes: opt(
    obj({
      cuitRemitenteComercialVentaPrimaria: opt(cuit()),
      cuitRemitenteComercialVentaSecundaria: opt(cuit()),
      cuitRemitenteComercialVentaSecundaria2: opt(cuit()),
      cuitCorredorVentaPrimaria: opt(cuit()),
      cuitCorredorVentaSecundaria: opt(cuit()),
      cuitRepresentanteRecibidor: opt(cuit()),
    }),
  ),
  destinatario: opt(obj(DESTINATARIO)),
  pesoBrutoDescarga: kilogramos(),
  pesoTaraDescarga: kilogramos(),
  ramalDescarga: obj(RAMAL),
};

/** NuevoDestinoDestinatarioAutomotorSolicitud */
export const NUEVO_DESTINO_AUTOMOTOR: Schema = {
  cartaPorte: obj(CARTA_PORTE),
  destino: obj(DESTINO),
  destinatario: opt(obj(DESTINATARIO)),
  transporte: obj(TRANSPORTE_AUTOMOTOR_MODIFICA),
};

/** NuevoDestinoDestinatarioFerroviariaSolicitud */
export const NUEVO_DESTINO_FERROVIARIA: Schema = {
  cartaPorte: obj(CARTA_PORTE),
  destino: obj(DESTINO),
  destinatario: opt(obj(DESTINATARIO)),
  transporte: obj(TRANSPORTE_FERROVIARIA_MODIFICA),
};

/** RegresoOrigenAutomotorSolicitud */
export const REGRESO_ORIGEN_AUTOMOTOR: Schema = {
  cartaPorte: obj(CARTA_PORTE),
  transporte: obj(TRANSPORTE_AUTOMOTOR_MODIFICA),
};

/** RegresoOrigenFerroviariaSolicitud */
export const REGRESO_ORIGEN_FERROVIARIA: Schema = {
  cartaPorte: obj(CARTA_PORTE),
  transporte: obj(TRANSPORTE_FERROVIARIA_MODIFICA),
};

/** DesvioAutomotorSolicitud */
export const DESVIO_AUTOMOTOR: Schema = {
  cuitSolicitante: cuit(),
  cartaPorte: obj(CARTA_PORTE),
  destino: obj({
    cuit: cuit(),
    codProvincia: int(),
    codLocalidad: int(),
    planta: planta(),
    esDestinoCampo: bool(),
  }),
  transporte: obj(TRANSPORTE_AUTOMOTOR_MODIFICA),
};

/** DesvioFerroviariaSolicitud */
export const DESVIO_FERROVIARIA: Schema = {
  cuitSolicitante: opt(cuit()),
  cartaPorte: obj(CARTA_PORTE),
  destino: obj({ cuit: cuit(), codProvincia: int(), codLocalidad: int(), planta: planta() }),
  transporte: obj(TRANSPORTE_FERROVIARIA_MODIFICA),
};

/** InformarContingenciaSolicitud */
export const INFORMAR_CONTINGENCIA: Schema = {
  cartaPorte: obj(CARTA_PORTE),
  contingencia: obj({ concepto: str({ minLen: 1, maxLen: 2 }), descripcion: opt(texto(140)) }),
};

/** CerrarContingenciaFerroviariaSolicitud (tipo de `cerrarContingenciaCPE`) */
export const CERRAR_CONTINGENCIA: Schema = {
  cartaPorte: obj(CARTA_PORTE),
  concepto: str({ minLen: 1, maxLen: 2 }),
  reactivacionDestino: opt(obj({ cuitTransportista: opt(cuit()), nroOperativo: opt(int(1, 9999999999)) })),
  motivoDesactivacionCP: opt(obj({ concepto: str({ minLen: 1, maxLen: 2 }), descripcion: opt(texto(140)) })),
};

/** ConsultarCPEPorDestinoSolicitud */
export const CONSULTAR_POR_DESTINO: Schema = {
  planta: planta(),
  fechaPartidaDesde: date(),
  fechaPartidaHasta: date(),
  tipoCartaPorte: opt(int(1)),
};

/** ConsultarCPEPPendientesDeResolucionSolicitud */
export const CONSULTAR_PENDIENTES: Schema = {
  perfil: str({ values: ['S', 'D'] }),
  planta: opt(planta()),
};

/** ConsultarUltNroOrdenSolicitud */
export const CONSULTAR_ULT_NRO_ORDEN: Schema = { sucursal: sucursal(), tipoCPE: tipoCPE() };

/** ConsultaCPEFerroviariaPorNroOperativoSolicitud */
export const CONSULTAR_POR_NRO_OPERATIVO: Schema = { nroOperativo: int(1, 9999999999) };

/** ConsultarLocalidadesPorProvinciaSolicitud */
export const CONSULTAR_LOCALIDADES: Schema = { codProvincia: int() };

/** ConsultarPlantasSolicitud / ConsultarLocalidadesProductorSolicitud */
export const SOLICITUD_CUIT: Schema = { cuit: cuit() };

/** ConsultarVariedadesSemillasRequest (sin `solicitud`: `codGrano` va directo bajo el Req) */
export const CONSULTAR_VARIEDADES: Schema = { codGrano: opt(codGrano()) };

// ---------------------------------------------------------------------------
// Respuestas
// ---------------------------------------------------------------------------

/** CodigoDescripcion */
export const R_CODIGO_DESCRIPCION: Schema = { codigo: must(str()), descripcion: must(str()) };

/** CabeceraRespuesta */
const R_CABECERA: Schema = {
  tipoCartaPorte: int(),
  sucursal: int(),
  nroOrden: int(),
  nroCTG: id(),
  fechaEmision: datetime(),
  estado: str(),
  fechaInicioEstado: datetime(),
  fechaVencimiento: datetime(),
  observaciones: str(),
  anulacionMotivo: int(),
  anulacionObservaciones: str(),
};

/** Metadata */
const R_METADATA: Schema = { servidor: str(), fechaHora: datetime() };

/** CartaPorteRespuesta (sin `errores`, que se lanzan como error) */
export const R_CARTA_PORTE: Schema = {
  cabecera: opt(obj(R_CABECERA)),
  pdf: opt(base64()),
  metadata: opt(obj(R_METADATA)),
};

const R_RETIRO_PRODUCTOR: Schema = { cuitRemitenteComercialProductor: cuit() };

const R_DESTINO: Schema = {
  cuit: cuit(),
  codProvincia: int(),
  codLocalidad: int(),
  planta: int(),
  plantaObservaciones: str(),
  domicilioDestino: str(),
};

/** DetalleAutomotorRespuesta */
export const R_DETALLE_AUTOMOTOR: Schema = {
  cabecera: opt(obj(R_CABECERA)),
  origen: opt(
    obj({
      cuit: cuit(),
      codProvincia: int(),
      codLocalidad: int(),
      nroRenspa: str(),
      domicilio: str(),
      planta: int(),
      plantaAFIP: str(),
      coordenadasGPS: opt(obj({ latitud: str(), longitud: str(), ubicacionGeoreferencial: str() })),
    }),
  ),
  correspondeRetiroProductor: bool(),
  retiroProductor: opt(obj(R_RETIRO_PRODUCTOR)),
  intervinientes: opt(
    obj({
      cuitRemitenteComercialVentaPrimaria: cuit(),
      cuitRemitenteComercialVentaSecundaria: cuit(),
      cuitRemitenteComercialVentaSecundaria2: cuit(),
      cuitMercadoATermino: cuit(),
      cuitCorredorVentaPrimaria: cuit(),
      cuitCorredorVentaSecundaria: cuit(),
      cuitRepresentanteEntregador: cuit(),
      cuitRepresentanteRecibidor: cuit(),
    }),
  ),
  datosCarga: opt(
    obj({
      codGrano: int(),
      semilla: opt(obj({ presentacionInase: int(), categoriaSemilla: int(), variedadSemilla: int() })),
      pesoBruto: int(),
      pesoTara: int(),
      cosecha: int(),
      pesoBrutoDescarga: int(),
      pesoTaraDescarga: int(),
      tipoEmbalaje: int(),
      otroEmbalaje: str(),
      unidadMedida: int(),
      cantidadUnidades: int(),
      kgLitroM3: int(),
      lote: str(),
    }),
  ),
  destino: opt(obj(R_DESTINO)),
  destinatario: opt(obj({ cuit: cuit() })),
  transporte: opt(
    obj({
      cuitTransportista: cuit(),
      dominio: list(str(), 0),
      fechaHoraPartida: datetime(),
      kmRecorrer: int(),
      codigoTurno: str(),
      cuitChofer: cuit(),
      tarifaReferencia: dec(2),
      tarifa: dec(2),
      cuitPagadorFlete: cuit(),
      cuitIntermediarioFlete: cuit(),
      mercaderiaFumigada: bool(),
    }),
  ),
  pdf: opt(base64()),
  metadata: opt(obj(R_METADATA)),
};

/** DetalleFerroviariaRespuesta */
export const R_DETALLE_FERROVIARIA: Schema = {
  cabecera: opt(obj(R_CABECERA)),
  origen: opt(
    obj({
      cuit: cuit(),
      esUsuarioIndustria: bool(),
      codProvincia: int(),
      codLocalidad: int(),
      domicilio: str(),
      planta: int(),
      cuitTitularPlanta: cuit(),
    }),
  ),
  correspondeRetiroProductor: bool(),
  retiroProductor: opt(obj(R_RETIRO_PRODUCTOR)),
  intervinientes: opt(
    obj({
      cuitRemitenteComercial: cuit(),
      cuitRemitenteComercialVentaPrimaria: cuit(),
      cuitRemitenteComercialVentaSecundaria: cuit(),
      cuitRemitenteComercialVentaSecundaria2: cuit(),
      cuitMercadoATermino: cuit(),
      cuitCorredorVentaPrimaria: cuit(),
      cuitCorredorVentaSecundaria: cuit(),
      cuitRepresentanteEntregador: cuit(),
      cuitRepresentanteRecibidor: cuit(),
      cuitComisionista: cuit(),
      cuitCorredor: cuit(),
    }),
  ),
  datosCarga: opt(
    obj({
      codGrano: int(),
      codDerivadoGranario: int(),
      cosecha: int(),
      pesoBruto: int(),
      pesoTara: int(),
      pesoBrutoDescarga: int(),
      pesoTaraDescarga: int(),
      tipoEmbalaje: int(),
      otroEmbalaje: str(),
      unidadMedida: int(),
      cantidadUnidades: int(),
      kgLitroM3: int(),
      lote: str(),
      fechaLote: datetime(),
    }),
  ),
  destino: opt(obj(R_DESTINO)),
  destinatario: opt(obj({ cuit: cuit() })),
  transporte: opt(
    obj({
      cuitTransportista: cuit(),
      cuitTransportistaTramo2: cuit(),
      nroVagon: int(),
      nroPrecinto: list(str(), 0),
      nroOperativo: int(),
      ramal: opt(obj({ codigo: int(), descripcion: str() })),
      fechaHoraPartidaTren: datetime(),
      kmRecorrer: int(),
      cuitPagadorFlete: cuit(),
      cuitConductor: cuit(),
      cuitConductorTramo2: cuit(),
      tarifa: int(),
      cuitIntermediarioFlete: cuit(),
      mercaderiaFumigada: bool(),
    }),
  ),
  pdf: opt(base64()),
  metadata: opt(obj(R_METADATA)),
};

/** CPEResumenRespuesta */
export const R_CPE_RESUMEN: Schema = {
  tipoCartaPorte: int(),
  nroCTG: id(),
  fechaPartida: datetime(),
  estado: str(),
  fechaUltimaModificacion: datetime(),
};

/** CartaPorteFerroviariaResumenRespuesta */
export const R_OPERATIVO_FERROVIARIO: Schema = {
  fecha: datetime(),
  cuitTransportista: cuit(),
  cuitTransportistaTramo2: cuit(),
  nroOperativo: int(),
  cartaPorte: list(
    obj({
      nroCTG: id(),
      nroVagon: str(),
      grano: int(),
      nroPrecinto: list(str(), 0),
      pesoBruto: int(),
      pesoTara: int(),
    }),
    0,
  ),
  pdf: opt(base64()),
  metadata: opt(obj(R_METADATA)),
};

/** PlantaResponse */
export const R_PLANTA: Schema = {
  nroPlanta: int(),
  codProvincia: int(),
  codLocalidad: int(),
  latitud: str(),
  longitud: str(),
  ubicacionGeoreferencial: str(),
};

const R_COORDENADA: Schema = { grados: str(), minutos: str(), segundos: str(), coordenada: str() };

/** LocalidadProductor */
export const R_LOCALIDAD_PRODUCTOR: Schema = {
  codigo: str(),
  descripcion: str(),
  coordenadas: list(
    obj({ latitud: opt(obj(R_COORDENADA)), longitud: opt(obj(R_COORDENADA)), ubicacionGeoreferencial: str() }),
    0,
  ),
};

/** CodigoDescripcionGrano */
export const R_VARIEDAD_SEMILLA: Schema = { codigo: must(str()), descripcion: must(str()), grano: must(int()) };

/** DummyRespuesta */
export const R_DUMMY: Schema = { appserver: must(str()), authserver: must(str()), dbserver: must(str()) };
