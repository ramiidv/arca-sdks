/**
 * Schemas de WSCPE, transcriptos del XSD embebido en el WSDL oficial
 * (https://cpea-ws-qaext.afip.gob.ar/wscpe/services/soap?wsdl). El orden de
 * las claves es el orden de la `xsd:sequence`.
 *
 * @internal
 */
import { base64, bool, cuit, custom, date, datetime, dec, id, int, list, must, obj, opt, str } from './schema.js';
import type { Schema } from './schema.js';

// ---------------------------------------------------------------------------
// Tipos simples (XSD)
// ---------------------------------------------------------------------------

const tipoCPE = () => int(1, 999);
const sucursal = () => int(0, 99999);
const nroOrden = () => int(1, 99999999);
const planta = () => int(1, 999999);
const codGrano = () => int(0, 999);
/** Campaña de 4 números (error 2073); ARCA admite las últimas 10 (2074). */
const cosecha = () => int(1000, 9999);
const kilogramos = () => int(1, 88000);
const kilometros = () => int(1, 99999);
const nroVagon = () => int(1, 99999999);
const nroOperativo = () => int(1, 9999999999);
const tarifa = () => dec(2, 0, 99999.99);
const texto = (maxLen: number) => str({ minLen: 1, maxLen });
/** `Observaciones` (0 a 2000 caracteres). */
const observaciones = () => opt(str({ minLen: 0, maxLen: 2000 }));
/** Dominios del vehículo: hasta 3 (error 2144). */
const dominios = (minItems: number) => list(str({ minLen: 6, maxLen: 7 }), minItems, 3);
/** Alfanumérico de 1 a 30, con `-`, `_`, `/` y espacios intermedios (error 2244). */
const codigoTurno = () =>
  str({
    minLen: 1,
    maxLen: 30,
    pattern: /^[A-Za-z0-9_/-]+( [A-Za-z0-9_/-]+)*$/,
    patternMessage: 'alfanumérico con -, _, / y espacios intermedios (error 2244)',
  });
/** `nn.nnn.n.nnnnn/nn` (error 2153). */
const renspa = () =>
  str({ pattern: /^\d{2}\.\d{3}\.\d\.\d{5}\/\d{2}$/, patternMessage: 'formato nn.nnn.n.nnnnn/nn (error 2153)' });
/** Motivo de anulación o de rechazo: 1, 2 o 3 (errores 2220 y 2225). */
const motivo = () => int(1, 3);
/** `MotivoContingencia`: A a G; los admitidos dependen del tipo de CPE (ver `checkConceptoContingencia`). */
const motivoContingencia = () => str({ values: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] });
/** `ConceptoCierreContingencia` y `MotivoDesactivacion`: A, B o C. */
const conceptoABC = () => str({ values: ['A', 'B', 'C'] });
const codDerivadoGranario = () => int(0, 999);
const tipoEmbalaje = () => int(1, 99);
const unidadMedida = () => int(1, 9);
const digitos5 = () => int(1, 99999);
const kilogramosDuctos = () => int(1, 9999999);
/** Precintos de una CPE ferroviaria DG: de 1 a 10 (manual §3.2, error 2212). */
const precintosDG = () => list(texto(20), 1, 10);
/** Tipo de `DomicilioPUC`: 1 (fiscal) o 3 (locales y establecimientos) (errores 2223 y 2224). */
const tipoDomicilio = () =>
  custom((v, fail) =>
    v === 1 || v === 3 ? v : fail('debe ser 1 (fiscal) o 3 (locales y establecimientos) (errores 2223 y 2224)'),
  );

/** Copia de `schema` sin los elementos `omitir`, en el mismo orden. */
const sin = (schema: Schema, ...omitir: string[]): Schema =>
  Object.fromEntries(Object.entries(schema).filter(([k]) => !omitir.includes(k)));

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
      nroRenspa: opt(renspa()),
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

/** TransporteAutomotorModificaDGSolicitud */
const TRANSPORTE_AUTOMOTOR_MODIFICA_DG: Schema = { fechaHoraPartida: datetime(), kmRecorrer: kilometros() };

/** TransporteAutomotorModificaSolicitud */
const TRANSPORTE_AUTOMOTOR_MODIFICA: Schema = { ...TRANSPORTE_AUTOMOTOR_MODIFICA_DG, codigoTurno: opt(codigoTurno()) };

/** Ramal */
const RAMAL: Schema = { codigo: int(1, 99), descripcion: opt(texto(50)) };

/** TransporteFerroviariaModificaSolicitud */
const TRANSPORTE_FERROVIARIA_MODIFICA: Schema = {
  ramal: obj(RAMAL),
  fechaHoraPartidaTren: datetime(),
  kmRecorrer: kilometros(),
};

/** Comienzo común de TransporteFerroviariaSolicitud y TransporteFerroviariaDGSolicitud. */
const TRANSPORTE_FERROVIARIA_TREN: Schema = {
  cuitTransportista: cuit(),
  cuitTransportistaTramo2: opt(cuit()),
  nroVagon: nroVagon(),
  nroPrecinto: list(texto(20)),
  nroOperativo: nroOperativo(),
  ...TRANSPORTE_FERROVIARIA_MODIFICA,
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
    dominio: dominios(1),
    fechaHoraPartida: datetime(),
    kmRecorrer: kilometros(),
    codigoTurno: opt(codigoTurno()),
    cuitChofer: cuit(),
    tarifa: opt(tarifa()),
    cuitPagadorFlete: cuit(),
    cuitIntermediarioFlete: opt(cuit()),
    mercaderiaFumigada: bool(),
  }),
  observaciones: observaciones(),
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
  transporte: obj({ ...TRANSPORTE_FERROVIARIA_TREN, cuitPagadorFlete: opt(cuit()), mercaderiaFumigada: bool() }),
  observaciones: observaciones(),
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
  dominio: opt(dominios(0)),
  kmRecorrer: opt(kilometros()),
  tarifa: opt(tarifa()),
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
  nroVagon: opt(nroVagon()),
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
  anulacionMotivo: opt(motivo()),
  anulacionObservaciones: opt(texto(100)),
};

/** RechazoCPESolicitud */
export const RECHAZO: Schema = {
  cuitSolicitante: cuit(),
  cartaPorte: obj(CARTA_PORTE),
  rechazoMotivo: opt(motivo()),
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
  contingencia: obj({ concepto: motivoContingencia(), descripcion: opt(texto(140)) }),
};

/** CerrarContingenciaFerroviariaSolicitud (tipo de `cerrarContingenciaCPE`) */
export const CERRAR_CONTINGENCIA: Schema = {
  cartaPorte: obj(CARTA_PORTE),
  concepto: conceptoABC(),
  reactivacionDestino: opt(obj({ cuitTransportista: opt(cuit()), nroOperativo: opt(nroOperativo()) })),
  motivoDesactivacionCP: opt(obj({ concepto: conceptoABC(), descripcion: opt(texto(140)) })),
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
export const CONSULTAR_POR_NRO_OPERATIVO: Schema = { nroOperativo: nroOperativo() };

/** ConsultarLocalidadesPorProvinciaSolicitud */
export const CONSULTAR_LOCALIDADES: Schema = { codProvincia: int() };

/** ConsultarPlantasSolicitud / ConsultarLocalidadesProductorSolicitud */
export const SOLICITUD_CUIT: Schema = { cuit: cuit() };

/** ConsultarVariedadesSemillasRequest (sin `solicitud`: `codGrano` va directo bajo el Req) */
export const CONSULTAR_VARIEDADES: Schema = { codGrano: opt(codGrano()) };

/** ConsultarRenspaRequest (sin `solicitud`) */
export const CONSULTAR_RENSPA: Schema = { cuit: cuit(), codProvincia: int() };

/** ConsultarDomiciliosPorCUITRequest (sin `solicitud`) */
export const CONSULTAR_DOMICILIOS: Schema = { cuit: cuit() };

// ---------------------------------------------------------------------------
// Requests de derivados granarios (DG): automotor, ferroviaria, emitida en
// destino y ductos
// ---------------------------------------------------------------------------

/** DomicilioPUC */
const DOMICILIO_PUC: Schema = { tipo: tipoDomicilio(), orden: int() };

/** OrigenAutomotorDGSolicitud (y OrigenFerroviariaDGSolicitud, con `planta` obligatoria) */
const ORIGEN_DG: Schema = {
  esUsuarioIndustria: bool(),
  planta: opt(planta()),
  cuitTitularPlanta: opt(cuit()),
  domicilioOrigen: obj(DOMICILIO_PUC),
};

/** OrigenEmisionDestinoDGSolicitud */
const ORIGEN_EMISION_DESTINO_DG: Schema = { cuitOrigen: cuit(), planta: planta(), domicilioOrigen: obj(DOMICILIO_PUC) };

/** DestinoAutomotorDGSolicitud / DesvioDestinoAutomotorDGSolicitud */
const DESTINO_DG: Schema = { cuit: cuit(), planta: opt(planta()), domicilioDestino: obj(DOMICILIO_PUC) };

/** DestinoFerroviariaDGSolicitud / DesvioDestinoFerroviariaDGSolicitud / DestinoEmisionDestinoDGSolicitud */
const DESTINO_DG_PLANTA: Schema = { ...DESTINO_DG, planta: planta() };

/**
 * IntervEditarConfirmadaAutomotorDgSolicitud / IntervEditarConfirmadaFerroviariaDgSolicitud.
 * Con `cuitMercadoATermino` al final es IntervinientesFerroviariaDGSolicitud.
 */
const INTERV_EDITAR_CONFIRMADA_DG: Schema = {
  cuitRemitenteComercial: opt(cuit()),
  cuitComisionista: opt(cuit()),
  cuitCorredor: opt(cuit()),
};

/** IntervinientesAutomotorDGSolicitud / IntervinientesDuctosDGModificacionActivaSolicitud */
const INTERVINIENTES_DG: Schema = {
  cuitRemitenteComercial: opt(cuit()),
  cuitMercadoATermino: opt(cuit()),
  cuitComisionista: opt(cuit()),
  cuitCorredor: opt(cuit()),
};

/** IntervinientesFerroviariaDGSolicitud (otro orden que en automotor) */
const INTERVINIENTES_FERROVIARIA_DG: Schema = { ...INTERV_EDITAR_CONFIRMADA_DG, cuitMercadoATermino: opt(cuit()) };

/** DatosCargaAutomotorDGSolicitud */
const DATOS_CARGA_DG: Schema = {
  codGrano: codGrano(),
  codDerivadoGranario: codDerivadoGranario(),
  pesoBruto: kilogramos(),
  pesoTara: kilogramos(),
  tipoEmbalaje: tipoEmbalaje(),
  otroEmbalaje: opt(str()),
  unidadMedida: unidadMedida(),
  cantidadUnidades: opt(digitos5()),
  kgLitroM3: opt(digitos5()),
  lote: opt(texto(15)),
  fechaLote: opt(datetime()),
};

/** TransporteAutomotorDGSolicitud */
const TRANSPORTE_AUTOMOTOR_DG: Schema = {
  cuitTransportista: cuit(),
  dominio: dominios(1),
  fechaHoraPartida: datetime(),
  kmRecorrer: kilometros(),
  cuitChofer: cuit(),
  tarifa: opt(tarifa()),
  cuitPagadorFlete: cuit(),
  cuitIntermediarioFlete: opt(cuit()),
};

/** AutorizarAutomotorDGSolicitud */
export const AUTORIZAR_AUTOMOTOR_DG: Schema = {
  cabecera: obj({ tipoCP: tipoCPE(), sucursal: sucursal(), nroOrden: nroOrden() }),
  origen: obj(ORIGEN_DG),
  intervinientes: opt(obj(INTERVINIENTES_DG)),
  datosCarga: obj(DATOS_CARGA_DG),
  destino: obj(DESTINO_DG),
  destinatario: obj(DESTINATARIO),
  transporte: obj(TRANSPORTE_AUTOMOTOR_DG),
  observaciones: observaciones(),
};

/** AutorizarEmisionDestinoDGSolicitud */
export const AUTORIZAR_EMISION_DESTINO_DG: Schema = {
  ...AUTORIZAR_AUTOMOTOR_DG,
  origen: obj(ORIGEN_EMISION_DESTINO_DG),
  destino: obj(DESTINO_DG_PLANTA),
};

/** AutorizarFerroviariaDGSolicitud */
export const AUTORIZAR_FERROVIARIA_DG: Schema = {
  cabecera: obj({ sucursal: sucursal(), nroOrden: nroOrden() }),
  origen: obj({ ...ORIGEN_DG, planta: planta() }),
  intervinientes: opt(obj(INTERVINIENTES_FERROVIARIA_DG)),
  // DatosCargaFerroviariaDGSolicitud: `otroEmbalaje` es Texto140.
  datosCarga: obj({ ...DATOS_CARGA_DG, otroEmbalaje: opt(texto(140)) }),
  destino: obj(DESTINO_DG_PLANTA),
  destinatario: obj(DESTINATARIO),
  transporte: obj({
    ...TRANSPORTE_FERROVIARIA_TREN,
    nroPrecinto: precintosDG(),
    cuitConductor: opt(cuit()),
    cuitConductorTramo2: opt(cuit()),
    tarifa: opt(tarifa()),
    cuitPagadorFlete: cuit(),
    cuitIntermediarioFlete: opt(cuit()),
  }),
  observaciones: observaciones(),
};

/** ConsultarAutomotorDGSolicitud / ConsultarFerroviariaDGSolicitud / ConsultarEmisionDestinoDGSolicitud */
export const CONSULTAR_CPE_DG: Schema = {
  cartaPorte: opt(obj(CARTA_PORTE)),
  cuitSolicitante: opt(cuit()),
  cuitTitularPlanta: opt(cuit()),
  nroCTG: opt(id()),
};

/** ConsultarDuctosSolicitud */
export const CONSULTAR_CPE_DUCTOS: Schema = sin(CONSULTAR_CPE_DG, 'cuitTitularPlanta');

/** ConsultarCPEDGPendienteActivacionSolicitud / ConsultarCPEEmitidasDestinoDGPendientesActivacionSolicitud */
export const CONSULTAR_POR_PLANTA: Schema = { planta: planta() };

/** Campos de carga editables (EditarActivaDGDuctosSolicitud; el resto sigue en `EDITAR_CARGA_DG`). */
const EDITAR_CARGA_DUCTOS: Schema = {
  codGrano: opt(codGrano()),
  codDerivadoGranario: opt(codDerivadoGranario()),
  unidadMedida: opt(unidadMedida()),
  tipoEmbalaje: opt(tipoEmbalaje()),
};

/** Campos de carga editables en automotor y ferroviaria DG. */
const EDITAR_CARGA_DG: Schema = {
  ...EDITAR_CARGA_DUCTOS,
  otroEmbalaje: opt(str()),
  cantidadUnidades: opt(digitos5()),
  kgLitroM3: opt(digitos5()),
};

/** Campos de flete y peso editables en automotor y ferroviaria DG. */
const EDITAR_FLETE_DG: Schema = {
  tarifa: opt(tarifa()),
  cuitPagadorFlete: cuit(),
  cuitIntermediarioFlete: opt(cuit()),
  kmRecorrer: kilometros(),
  pesoBruto: opt(kilogramos()),
};

/** EditarActivaDGAutomotorSolicitud */
export const EDITAR_AUTOMOTOR_DG: Schema = {
  nroCTG: id(),
  cuitTransportista: opt(cuit()),
  cuitChofer: opt(cuit()),
  ...EDITAR_CARGA_DG,
  intervinientes: opt(obj(INTERVINIENTES_DG)),
  destino: opt(obj(DESTINO_DG)),
  cuitDestinatario: opt(cuit()),
  ...EDITAR_FLETE_DG,
  dominio: opt(dominios(0)),
  observaciones: observaciones(),
};

/** EditarActivaDGFerroviariaSolicitud */
export const EDITAR_FERROVIARIA_DG: Schema = {
  nroCTG: id(),
  cuitTransportista: opt(cuit()),
  cuitConductor: opt(cuit()),
  cuitTransportistaTramo2: opt(cuit()),
  cuitConductorTramo2: opt(cuit()),
  nroVagon: opt(nroVagon()),
  nroPrecinto: precintosDG(),
  nroOperativo: nroOperativo(),
  ramal: obj(RAMAL),
  ...EDITAR_CARGA_DG,
  intervinientes: opt(obj(INTERVINIENTES_FERROVIARIA_DG)),
  cuitDestinatario: opt(cuit()),
  destino: opt(obj(DESTINO_DG_PLANTA)),
  ...EDITAR_FLETE_DG,
  observaciones: observaciones(),
};

/** EditarActivaDGDuctosSolicitud */
export const EDITAR_DUCTOS_DG: Schema = {
  nroCTG: id(),
  ...EDITAR_CARGA_DUCTOS,
  intervinientes: opt(obj(INTERVINIENTES_DG)),
  cuitDestinatario: opt(cuit()),
  observaciones: observaciones(),
};

/**
 * EditarCPEConfirmadaAutomotorDgSolicitud / EditarCPEConfirmadaFerroviariaDgSolicitud /
 * EditarCPEConfirmadaDuctosSolicitud (las tres con los mismos elementos).
 */
export const EDITAR_CONFIRMADA_DG: Schema = {
  nroCTG: id(),
  intervinientes: opt(obj(INTERV_EDITAR_CONFIRMADA_DG)),
  observaciones: observaciones(),
};

/** ConfirmacionAutomotorDGSolicitud */
export const CONFIRMACION_AUTOMOTOR_DG: Schema = {
  ...SOLICITANTE_CARTA_PORTE,
  pesoBrutoDescarga: kilogramos(),
  pesoTaraDescarga: kilogramos(),
};

/** ConfirmacionFerroviariaDGSolicitud */
export const CONFIRMACION_FERROVIARIA_DG: Schema = { ...CONFIRMACION_AUTOMOTOR_DG, ramalDescarga: obj(RAMAL) };

/** ConfirmacionDuctosDGSolicitud */
export const CONFIRMACION_DUCTOS_DG: Schema = { ...SOLICITANTE_CARTA_PORTE, pesoBrutoDescarga: kilogramosDuctos() };

/** DesvioAutomotorDGSolicitud */
export const DESVIO_AUTOMOTOR_DG: Schema = {
  ...SOLICITANTE_CARTA_PORTE,
  destino: obj(DESTINO_DG),
  transporte: obj(TRANSPORTE_AUTOMOTOR_MODIFICA_DG),
};

/** DesvioFerroviariaDGSolicitud */
export const DESVIO_FERROVIARIA_DG: Schema = {
  ...SOLICITANTE_CARTA_PORTE,
  destino: obj(DESTINO_DG_PLANTA),
  transporte: obj(TRANSPORTE_FERROVIARIA_MODIFICA),
};

/** NuevoDestinoDestinatarioAutomotorDGSolicitud */
export const NUEVO_DESTINO_AUTOMOTOR_DG: Schema = {
  cartaPorte: obj(CARTA_PORTE),
  destino: obj(DESTINO_DG),
  destinatario: opt(obj(DESTINATARIO)),
  transporte: obj(TRANSPORTE_AUTOMOTOR_MODIFICA_DG),
};

/** NuevoDestinoDestinatarioFerroviariaDGSolicitud */
export const NUEVO_DESTINO_FERROVIARIA_DG: Schema = {
  cartaPorte: obj(CARTA_PORTE),
  destino: obj(DESTINO_DG_PLANTA),
  destinatario: opt(obj(DESTINATARIO)),
  transporte: obj(TRANSPORTE_FERROVIARIA_MODIFICA),
};

/** Destino al que vuelve la CPE en un regreso a origen DG. */
const REGRESO_DESTINO_DG: Schema = { planta: opt(planta()), domicilioDestino: opt(obj(DOMICILIO_PUC)) };

/** RegresoOrigenAutomotorDGSolicitud */
export const REGRESO_ORIGEN_AUTOMOTOR_DG: Schema = {
  cartaPorte: obj(CARTA_PORTE),
  transporte: obj(TRANSPORTE_AUTOMOTOR_MODIFICA_DG),
  ...REGRESO_DESTINO_DG,
  cuitDestinatario: opt(cuit()),
};

/** RegresoOrigenFerroviariaDGSolicitud (`cuitDestinatario` obligatorio según el XSD) */
export const REGRESO_ORIGEN_FERROVIARIA_DG: Schema = {
  cartaPorte: obj(CARTA_PORTE),
  transporte: obj(TRANSPORTE_FERROVIARIA_MODIFICA),
  ...REGRESO_DESTINO_DG,
  cuitDestinatario: cuit(),
};

/** AceptarEmisionDestinoDGSolicitud / RechazarEmisionDestinoDGSolicitud / DescargadoDestinoCPEEmisionDestinoDGSolicitud */
export const SOLICITANTE_DESTINO_CARTA_PORTE: Schema = {
  cuitSolicitante: cuit(),
  cuitDestino: cuit(),
  cartaPorte: obj(CARTA_PORTE),
};

/**
 * Solicitud de una operación sobre una CPE emitida en destino: `cartaPorte`,
 * `cuitDestino` y después los elementos de `resto` (al esparcir `resto`, su
 * `cartaPorte` conserva el primer lugar).
 */
const emisionDestino = (resto: Schema): Schema => ({ cartaPorte: obj(CARTA_PORTE), cuitDestino: cuit(), ...resto });

/** AnularCPEEmisionDestinoDGSolicitud */
export const ANULAR_EMISION_DESTINO_DG: Schema = emisionDestino(ANULAR);

/** InformarContingenciaEmisionDestinoDGSolicitud */
export const INFORMAR_CONTINGENCIA_EMISION_DESTINO_DG: Schema = emisionDestino(INFORMAR_CONTINGENCIA);

/** CerrarContingenciaEmisionDestinoDGSolicitud */
export const CERRAR_CONTINGENCIA_EMISION_DESTINO_DG: Schema = emisionDestino(CERRAR_CONTINGENCIA);

/** NuevoDestinoDestinatarioEmisionDestinoDGSolicitud */
export const NUEVO_DESTINO_EMISION_DESTINO_DG: Schema = emisionDestino(NUEVO_DESTINO_AUTOMOTOR_DG);

/** RegresoOrigenEmisionDestinoDGSolicitud */
export const REGRESO_ORIGEN_EMISION_DESTINO_DG: Schema = emisionDestino({
  transporte: obj(TRANSPORTE_AUTOMOTOR_MODIFICA_DG),
  planta: opt(planta()),
});

// ---------------------------------------------------------------------------
// Respuestas
// ---------------------------------------------------------------------------

/** CodigoDescripcion */
export const R_CODIGO_DESCRIPCION: Schema = { codigo: must(str()), descripcion: must(str()) };

/** ConsultarUltNroOrdenRespuesta */
export const R_ULT_NRO_ORDEN: Schema = { nroOrden: must(int()) };

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

/** Renspa */
export const R_RENSPA: Schema = { nroRenspa: str(), descripcion: str() };

/** DomicilioPUCRespuesta */
export const R_DOMICILIO: Schema = { tipo: int(), orden: int(), descripcion: str() };

/** TipoEmbalajeUnidadMedida */
export const R_TIPO_EMBALAJE: Schema = {
  codigo: must(str()),
  descripcion: must(str()),
  unidadMedida: list(obj(R_CODIGO_DESCRIPCION), 0),
};

// ---------------------------------------------------------------------------
// Respuestas de derivados granarios (DG)
// ---------------------------------------------------------------------------

/** DetalleFerroviariaDGRespuesta: DetalleFerroviariaRespuesta sin retiro del productor. */
export const R_DETALLE_FERROVIARIA_DG: Schema = sin(
  R_DETALLE_FERROVIARIA,
  'correspondeRetiroProductor',
  'retiroProductor',
);

/** IntervinientesAutomotorDGRespuesta / IntervinientesDuctosDGRespuesta */
const R_INTERVINIENTES_DG: Schema = {
  cuitRemitenteComercial: cuit(),
  cuitMercadoATermino: cuit(),
  cuitComisionista: cuit(),
  cuitCorredor: cuit(),
};

/** DetalleAutomotorDGRespuesta */
export const R_DETALLE_AUTOMOTOR_DG: Schema = {
  cabecera: opt(obj(R_CABECERA)),
  origen: opt(
    obj({
      esUsuarioIndustria: bool(),
      planta: int(),
      plantaObservaciones: str(),
      cuitTitularPlanta: cuit(),
      domicilioOrigen: str(),
      cuitOrigen: cuit(),
    }),
  ),
  intervinientes: opt(obj(R_INTERVINIENTES_DG)),
  datosCarga: opt(
    obj({
      codGrano: int(),
      codDerivadoGranario: int(),
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
      dominio: list(str(), 0),
      fechaHoraPartida: datetime(),
      kmRecorrer: int(),
      cuitChofer: cuit(),
      tarifa: dec(2),
      tarifaReferencia: dec(2),
      cuitPagadorFlete: cuit(),
      cuitIntermediarioFlete: cuit(),
    }),
  ),
  pdf: opt(base64()),
  metadata: opt(obj(R_METADATA)),
};

/** DetalleEmisionDestinoDGRespuesta: como la automotor DG, con otro origen y destino. */
export const R_DETALLE_EMISION_DESTINO_DG: Schema = {
  ...R_DETALLE_AUTOMOTOR_DG,
  origen: opt(obj({ planta: int(), domicilioOrigen: str(), cuitOrigen: cuit() })),
  destino: opt(obj({ cuit: cuit(), planta: int(), domicilioDestino: str(), cuitTitularPlanta: cuit() })),
};

/** DetalleDuctosDGRespuesta */
export const R_DETALLE_DUCTOS_DG: Schema = {
  cabecera: opt(obj(R_CABECERA)),
  origen: opt(
    obj({
      esUsuarioIndustria: bool(),
      planta: int(),
      cuitTitularPlanta: cuit(),
      domicilioOrigen: str(),
      cuitOrigen: cuit(),
    }),
  ),
  intervinientes: opt(obj(R_INTERVINIENTES_DG)),
  datosCarga: opt(
    obj({
      codGrano: int(),
      codDerivadoGranario: int(),
      cosecha: int(),
      pesoBrutoDescarga: int(),
      pesoTaraDescarga: int(),
      tipoEmbalaje: int(),
      otroEmbalaje: str(),
      unidadMedida: int(),
      pesoBruto: int(),
      lote: str(),
      fechaLote: datetime(),
    }),
  ),
  destino: opt(
    obj({
      cuit: cuit(),
      codProvincia: int(),
      codLocalidad: int(),
      planta: int(),
      domicilioDestino: str(),
      fechaHoraInicioEnvio: datetime(),
      fechaHoraFinEnvio: datetime(),
    }),
  ),
  destinatario: opt(obj({ cuit: cuit() })),
  pdf: opt(base64()),
  metadata: opt(obj(R_METADATA)),
};

/** CPEDGPendienteActivacionRespuesta / CPEEmitidasDestinoDGRespuesta (mismos elementos) */
export const R_CPE_DG_PENDIENTE: Schema = {
  tipoCartaPorte: int(),
  sucursal: int(),
  nroOrden: int(),
  cuitSolicitante: cuit(),
  fechaPartida: datetime(),
};

/** DerivadoGranario */
export const R_DERIVADO_GRANARIO: Schema = {
  granoPadre: int(),
  granoPadreDescripcion: str(),
  codigo: must(int()),
  descripcion: must(str()),
};

/** PlantaDGResponse */
export const R_PLANTA_DG: Schema = { nroPlanta: int(), actividad: int(), conPlantaDG: str(), sinPlantaDG: str() };
