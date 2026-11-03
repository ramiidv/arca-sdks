/**
 * Schemas de FECredService, transcriptos del XSD embebido en el WSDL oficial
 * (https://fwshomo.afip.gob.ar/wsfecred/FECredService?wsdl), con el DSL de
 * `@ramiidv/arca-common/schema`. El orden de las claves es el de la `xsd:sequence`.
 *
 * Las claves son los nombres de la API del SDK; cuando el elemento del XML se
 * llama distinto se indica con `as('NombreXml', ...)` (`xml()` del DSL).
 *
 * @internal No se exporta desde `index.ts`.
 */
import { ArcaResponseError, formatDate, validateCBU } from '@ramiidv/arca-common';
import type { ValidationErrorDetail } from '@ramiidv/arca-common';
import {
  choice,
  cuit,
  date,
  datetime,
  dec,
  decodeResponse,
  encodeRequest,
  id,
  importe as importeNoNegativo,
  int,
  must,
  obj,
  opt,
  siNo,
  str,
  wrapped,
  xml,
} from '@ramiidv/arca-common/schema';
import type { Schema } from '@ramiidv/arca-common/schema';
import type { SoapOperationKind } from '@ramiidv/arca-common';
import {
  EstadoComprobante,
  EstadoCtaCte,
  OpcionTransferencia,
  Resultado,
  RolCtaCte,
  TipoCancelacion,
  TipoFechaFiltro,
} from './constants.js';

export const SERVICE = 'WSFECRED';

type Obj = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** El elemento del XML se llama `name` (la clave del schema es el nombre de la API). */
const as = xml;

const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Código de moneda de los pesos argentinos (tabla de monedas de ARCA). */
const PESOS = 'PES';

/** Listas cuyos códigos no se pueden repetir (manual WSFECRED v2.0.3): lista → campo del código, error. */
const SIN_REPETIR = {
  retenciones: ['codTipo', 2003],
  ajustesOperacion: ['codigo', 2013],
  motivos: ['codMotivo', 3001],
  formasCancelacion: ['codigo', 4002],
} as const;

/**
 * Reglas que el DSL no expresa (manual WSFECRED v2.0.3):
 * - rango de `fecha` y dígito verificador del CBU;
 * - códigos repetidos en retenciones, ajustes, motivos y formas de
 *   cancelación (2003, 2013, 3001, 4002);
 * - `aceptarFECred`: `informaCBU` y `cbuComprador` van juntos (12013), sin
 *   CBU con cancelación total (12012) ni con saldo aceptado 0 (2016);
 *   retenciones con `importeTotalRetPesos` > 0 y viceversa (12007);
 *   cancelación con importe > 0, formas y tipo, todos juntos (12008); con PES
 *   la cotización es 1 (2007, 12000).
 */
function checkRequest(input: Obj, errors: ValidationErrorDetail[], schema: Schema): void {
  const push = (field: string, message: string, value: unknown) =>
    errors.push({ field, message: `${field}: ${message}`, value });
  for (const [lista, [campo, codigo]] of Object.entries(SIN_REPETIR)) {
    const items = input[lista];
    if (!Array.isArray(items)) continue;
    const vistos = new Set<unknown>();
    items.forEach((item: unknown, i) => {
      const v = isObj(item) ? item[campo] : undefined;
      if (v === undefined) return;
      if (vistos.has(v)) push(`${lista}[${i}].${campo}`, `código repetido (${codigo})`, v);
      vistos.add(v);
    });
  }
  if (schema === REQ.aceptarFECred) checkAceptar(input, push);
  const fecha = input['fecha'];
  if (isObj(fecha)) {
    try {
      if (formatDate(fecha['desde'] as string) > formatDate(fecha['hasta'] as string)) {
        push('fecha.hasta', 'debe ser igual o posterior a desde', fecha);
      }
    } catch {
      // Fecha inválida: ya la informa el schema.
    }
  }
  const cbu = input['cbuComprador'];
  if (typeof cbu === 'string' && /^\d{22}$/.test(cbu)) {
    try {
      validateCBU(cbu);
    } catch (e) {
      push('cbuComprador', (e as Error).message, cbu);
    }
  }
}

/** Reglas de `aceptarFECred` que dependen de varios campos (ver `checkRequest`). */
function checkAceptar(input: Obj, push: (field: string, message: string, value: unknown) => void): void {
  const cbu = input['cbuComprador'];
  if ((input['informaCBU'] === true) !== (cbu !== undefined && cbu !== null))
    push('cbuComprador', 'informaCBU y cbuComprador van juntos (12013)', cbu);
  if (cbu !== undefined && cbu !== null) {
    if (input['tipoCancelacion'] === TipoCancelacion.TOTAL)
      push('cbuComprador', 'no se informa con cancelación total (12012)', cbu);
    if (input['saldoAceptado'] === 0) push('cbuComprador', 'no se informa si el saldo aceptado es 0 (2016)', cbu);
  }
  const hay = (v: unknown) => (Array.isArray(v) ? v.length > 0 : typeof v === 'number' ? v > 0 : v != null);
  if (hay(input['retenciones']) !== hay(input['importeTotalRetPesos']))
    push(
      'importeTotalRetPesos',
      'retenciones e importeTotalRetPesos > 0 van juntos (12007)',
      input['importeTotalRetPesos'],
    );
  const cancelacion = [input['importeCancelado'], input['formasCancelacion'], input['tipoCancelacion']].map(hay);
  if (cancelacion.some(Boolean) && !cancelacion.every(Boolean))
    push(
      'importeCancelado',
      'una cancelación lleva importeCancelado > 0, formasCancelacion y tipoCancelacion (12008)',
      input['importeCancelado'],
    );
  const cotizacion = input['cotizacionMonedaUlt'];
  // Sin cotización numérica el error ya lo informa el schema.
  if (input['codMoneda'] === PESOS && typeof cotizacion === 'number' && cotizacion !== 1)
    push('cotizacionMonedaUlt', `con ${PESOS} la cotización es 1 (2007, 12000)`, cotizacion);
}

/**
 * Valida el request contra el schema (lanza `ArcaValidationError` con todos
 * los errores) y lo devuelve con los nombres y valores del XML, en orden XSD.
 */
export function encode(input: unknown, schema: Schema, method: string): Obj {
  return encodeRequest(input, schema, method, (i, errors) => checkRequest(i, errors, schema));
}

/**
 * El manual y el XSD nombran distinto el array de observaciones de algunas
 * operaciones (`arrayObservaciones` / `arrayObservacion`): si la respuesta trae
 * el que el schema no lee, se toma como el otro (si trae los dos, se unen).
 */
const OBSERVACIONES_ALIAS = [
  ['arrayObservaciones', 'arrayObservacion'],
  ['arrayObservacion', 'arrayObservaciones'],
] as const;

/** Elemento de cada observación dentro del array (`codigosDescripciones()`). */
const OBSERVACION_ITEM = 'codigoDescripcion';

/** Los `codigoDescripcion` de un array de observaciones (vacío o ausente: ninguno). */
const itemsObservacion = (v: unknown): unknown[] => {
  const items = isObj(v) ? v[OBSERVACION_ITEM] : undefined;
  return items === undefined ? [] : Array.isArray(items) ? items : [items];
};

function conObservaciones(node: unknown, schema: Schema): unknown {
  if (!isObj(node)) return node;
  const leidos = new Set(Object.entries(schema).map(([k, f]) => f.xml ?? k));
  let out = node;
  for (const [esperado, otro] of OBSERVACIONES_ALIAS) {
    if (!leidos.has(esperado) || leidos.has(otro) || out[otro] === undefined) continue;
    const valor =
      out[esperado] === undefined
        ? out[otro]
        : { [OBSERVACION_ITEM]: [...itemsObservacion(out[esperado]), ...itemsObservacion(out[otro])] };
    out = { ...out, [esperado]: valor };
  }
  return out;
}

/**
 * Decodifica una respuesta (pedida con `parseNumbers: false`). Una respuesta
 * que no cumple el schema lanza `ArcaResponseError`, con `uncertain` solo en las
 * emisiones (la operación pudo haberse registrado aunque no se pueda leer).
 */
export function decode<T>(node: unknown, schema: Schema, path: string, kind: SoapOperationKind): T {
  return decodeResponse<T>(conObservaciones(node, schema), schema, path, {
    error: (message) => new ArcaResponseError(`${SERVICE}: ${message}`, kind === 'emision'),
  });
}

// ---------------------------------------------------------------------------
// Tipos simples
// ---------------------------------------------------------------------------

const IMPORTE_MAX = 9999999999999.99;
const enumOf = (values: Record<string, string>) => str({ values: Object.values(values) });
/**
 * Enumeración en una respuesta: se acepta cualquier valor, para que un valor
 * nuevo de ARCA (como pasó con `InformadaAgDpto`) no rompa las consultas.
 */
const enumResp = () => str();

/** Código `xsd:short` (el SDK no acepta negativos). */
export const short = () => int(0, 32767);
/** `ImporteSimpleType` (con signo). */
export const importe = () => dec(2, -IMPORTE_MAX, IMPORTE_MAX);
/** `ImporteSimpleType` no negativo (regla del SDK para los importes de los requests, salvo ajustes). */
export const importePositivo = () => importeNoNegativo(IMPORTE_MAX);
/** `PorcentajeSimpleType`: mayor a 0 y menor a 100, 2 decimales (manual §3.1). */
export const porcentaje = () => dec(2, 0, 99.99, true);
/** Cotización (`xsd:decimal`): positiva, con hasta 6 decimales. */
export const cotizacion = () => dec(6, 0, undefined, true);
/** `Texto250SimpleType`. */
export const texto250 = () => str({ minLen: 3, maxLen: 250 });
/** `CBUSimpleType` (22 dígitos; el dígito verificador se valida en `checkRequest`). */
export const cbu = () => str({ pattern: /^\d{22}$/ });
/** `CuitSimpleType`, devuelto como string de 11 dígitos. */
const cuitStr = () => cuit({ decodeAs: 'string' });
const nonEmpty = () => str({ minLen: 1 });

// ---------------------------------------------------------------------------
// Tipos complejos (requests y respuestas)
// ---------------------------------------------------------------------------

/** `CodigoDescripcionType`. */
const CODIGO_DESCRIPCION: Schema = { codigo: must(short()), descripcion: must(nonEmpty()) };
const codigosDescripciones = () => wrapped('codigoDescripcion', obj(CODIGO_DESCRIPCION));

/** `IdComprobanteType`. */
export const ID_COMPROBANTE: Schema = {
  cuitEmisor: as('CUITEmisor', must(cuitStr())),
  codTipoCmp: must(short()),
  ptoVta: must(int(1, 99999)),
  nroCmp: must(int(1, 99999999)),
};

/** `IdCtaCteType` (`xsd:choice`: usar con `choice()`). */
export const ID_CTA_CTE: Schema = { codCtaCte: opt(id()), idFactura: opt(obj(ID_COMPROBANTE)) };

/** `FiltroFechaType`. */
const FILTRO_FECHA: Schema = { tipo: enumOf(TipoFechaFiltro), desde: date(), hasta: date() };

/** `MotivoRechazoType`. */
const MOTIVO_RECHAZO: Schema = {
  codMotivo: must(short()),
  descMotivo: must(texto250()),
  justificacion: must(texto250()),
};
const motivosRechazo = () => as('arrayMotivosRechazo', wrapped('motivoRechazo', obj(MOTIVO_RECHAZO)));

/** `RetencionType`. */
const RETENCION: Schema = {
  codTipo: must(short()),
  importe: must(importePositivo()),
  porcentaje: must(porcentaje()),
  descMotivo: opt(texto250()),
};

/** `AjusteOperacionType`. */
const AJUSTE: Schema = { codigo: must(short()), importe: must(importe()) };

/** `CuentaEnAgenteType`. */
const CUENTA_EN_AGENTE: Schema = {
  cuitAgente: must(cuitStr()),
  razonSocialAgente: opt(nonEmpty()),
  idCuenta: must(str({ minLen: 3, maxLen: 20 })),
  denominacion: opt(texto250()),
};

// ---------------------------------------------------------------------------
// Requests (sin `authRequest`)
// ---------------------------------------------------------------------------

const rol = () => as('rolCUITRepresentada', enumOf(RolCtaCte));
const cuitContraparte = () => as('CUITContraparte', opt(cuit()));
const nroPagina = () => opt(int(1, 32767));

export const REQ = {
  consultarMontoObligadoRecepcion: { cuitConsultada: cuit(), fechaEmision: date() },
  consultarCtasCtes: {
    rol: rol(),
    cuitContraparte: cuitContraparte(),
    fecha: opt(obj(FILTRO_FECHA)),
    estadoCtaCte: opt(enumOf(EstadoCtaCte)),
    nroPagina: nroPagina(),
    opcionTransferencia: opt(enumOf(OpcionTransferencia)),
  },
  consultarComprobantes: {
    rol: rol(),
    cuitContraparte: cuitContraparte(),
    codTipoCmp: opt(short()),
    estadoCmp: opt(enumOf(EstadoComprobante)),
    fecha: opt(obj(FILTRO_FECHA)),
    codCtaCte: opt(id()),
    estadoCtaCte: opt(enumOf(EstadoCtaCte)),
    nroPagina: nroPagina(),
  },
  idComprobante: { idComprobante: obj(ID_COMPROBANTE) },
  idCtaCte: { idCtaCte: choice(ID_CTA_CTE) },
  aceptarFECred: {
    idCtaCte: choice(ID_CTA_CTE),
    confirmarNotasDC: as(
      'arrayConfirmarNotasDC',
      opt(wrapped('confirmarNota', obj({ acepta: siNo(), idNota: obj(ID_COMPROBANTE) }))),
    ),
    formasCancelacion: as('arrayFormasCancelacion', opt(codigosDescripciones())),
    retenciones: as('arrayRetenciones', opt(wrapped('retencion', obj(RETENCION)))),
    ajustesOperacion: as('arrayAjustesOperacion', opt(wrapped('ajuste', obj(AJUSTE)))),
    tipoCancelacion: opt(enumOf(TipoCancelacion)),
    importeCancelado: opt(importePositivo()),
    importeTotalRetPesos: opt(importePositivo()),
    importeEmbargoPesos: opt(importePositivo()),
    saldoAceptado: importePositivo(),
    codMoneda: nonEmpty(),
    cotizacionMonedaUlt: cotizacion(),
    informaCBU: opt(siNo()),
    cbuComprador: as('CBUComprador', opt(cbu())),
  },
  rechazarFECred: { idCtaCte: choice(ID_CTA_CTE), motivos: motivosRechazo() },
  informarCancelacionTotalFECred: {
    idCtaCte: choice(ID_CTA_CTE),
    formasCancelacion: as('arrayFormasCancelacion', codigosDescripciones()),
    importeCancelacion: importePositivo(),
  },
  modificarOpcionTransferencia: { idCtaCte: choice(ID_CTA_CTE), opcionTransferencia: enumOf(OpcionTransferencia) },
  informarFacturaAgtDptoCltv: { idCtaCte: choice(ID_CTA_CTE), ctaAgente: obj(CUENTA_EN_AGENTE) },
  rechazarNotaDC: { idComprobante: obj(ID_COMPROBANTE), motivos: motivosRechazo() },
  consultarFacturasAgtDptoCltv: { idCtaCte: opt(choice(ID_CTA_CTE)), fecha: as('filtroFecha', opt(obj(FILTRO_FECHA))) },
} satisfies Record<string, Schema>;

// ---------------------------------------------------------------------------
// Respuestas (sin `must()` = minOccurs 0). Las enumeraciones se decodifican
// con `enumResp()` (cualquier string).
// ---------------------------------------------------------------------------

/** `EstadoCtaCteType`. */
const ESTADO_CTA_CTE: Schema = { estado: must(enumResp()), fechaHoraEstado: must(datetime()) };
/** `EstadoCmpType`. */
const ESTADO_CMP: Schema = { estado: must(enumResp()), fechaHoraEstado: must(datetime()) };

/** `InfoCtaCteType`. */
const INFO_CTA_CTE: Schema = {
  codCtaCte: must(id()),
  estadoCtaCte: must(obj(ESTADO_CTA_CTE)),
  idFacturaCredito: must(obj(ID_COMPROBANTE)),
  importeTotalFC: must(importe()),
  saldo: must(importe()),
  saldoAceptado: importe(),
  codMoneda: must(str()),
  opcionTransferencia: must(enumResp()),
};

/** `InfoAgtDptoCltvType`. */
const INFO_AGT_DPTO_CLTV: Schema = {
  fechaInfo: must(date()),
  ctaAgente: must(obj(CUENTA_EN_AGENTE)),
  recibida: must(siNo()),
  fechaLectura: date(),
  fechaRecep: date(),
  aceptada: siNo(),
  motivoRechazo: str(),
  idPagoAgtDptoCltv: str(),
  cbuAgtDptoCltv: as('CBUAgtDptoCltv', str()),
};

/** `InfoSCAType`. */
const INFO_SCA: Schema = {
  fechaAceptacionFactura: must(date()),
  informaCBUReceptor: must(siNo()),
  cbuReceptor: as('CBUReceptor', str()),
  cbuValidada: as('CBUValidada', siNo()),
  fechaLecturaSCA: datetime(),
};

/** `ItemType`. */
const ITEM: Schema = {
  orden: must(int()),
  unidadesMtx: int(),
  codigoMtx: str(),
  codigo: str(),
  descripcion: must(str()),
  codNomMercosur: str(),
  cantidad: dec(6),
  codigoUnidadMedida: int(),
  precioUnitario: importe(),
  importeBonificacion: importe(),
  codigoCondicionIVA: must(int()),
  importeIVA: importe(),
  importeItem: must(importe()),
};

/** `ComprobanteType`. */
const COMPROBANTE: Schema = {
  cuitEmisor: must(cuitStr()),
  razonSocialEmi: must(str()),
  codTipoCmp: must(int()),
  ptoVta: as('ptovta', must(int())),
  nroCmp: must(int()),
  cuitReceptor: must(cuitStr()),
  razonSocialRecep: must(str()),
  tipoCodAuto: must(enumResp()),
  codAutorizacion: must(id()),
  fechaEmision: must(date()),
  fechaPuestaDispo: date(),
  fechaVenPago: date(),
  fechaVenAcep: date(),
  importeTotal: must(importe()),
  codMoneda: must(str()),
  cotizacionMoneda: must(dec(6)),
  cbuEmisor: as('CBUEmisor', str()),
  aliasEmisor: as('AliasEmisor', str()),
  esAnulacion: siNo(),
  esPostAceptacion: siNo(),
  idComprobanteAsociado: obj(ID_COMPROBANTE),
  referenciasComerciales: wrapped('texto', str()),
  subtotalesIVA: as(
    'arraySubtotalesIVA',
    wrapped('subtotalIVA', obj({ codigo: must(int()), baseImponible: must(importe()), importe: must(importe()) })),
  ),
  otrosTributos: as(
    'arrayOtrosTributos',
    wrapped(
      'otroTributo',
      obj({ codigo: must(int()), detalle: str(), baseImponible: must(importe()), importe: must(importe()) }),
    ),
  ),
  items: as('arrayItems', wrapped('item', obj(ITEM))),
  datosGenerales: str(),
  datosComerciales: str(),
  leyendaComercial: str(),
  codCtaCte: must(id()),
  estado: must(obj(ESTADO_CMP)),
  tipoAcep: enumResp(),
  fechaHoraAcep: datetime(),
  motivosRechazo: motivosRechazo(),
  opcionTransferencia: enumResp(),
  infoTransferencia: choice({ infoAgtDptoCltv: obj(INFO_AGT_DPTO_CLTV), infoSCA: obj(INFO_SCA) }),
};

/** `CuentaCorrienteType`. */
const CUENTA_CORRIENTE: Schema = {
  codCtaCte: must(id()),
  estadoCtaCte: must(obj(ESTADO_CTA_CTE)),
  factura: must(obj(COMPROBANTE)),
  notasDCAsociadas: as('arrayNotasDCAsociadas', wrapped('comprobante', obj(COMPROBANTE))),
  formasCancelacion: as('arrayFormasCancelacion', codigosDescripciones()),
  retenciones: as('arrayRetenciones', wrapped('retencion', obj(RETENCION))),
  ajustesOperacion: as('arrayAjustesOperacion', wrapped('ajuste', obj(AJUSTE))),
  importeInicial: must(importe()),
  importeTotalNotasDC: importe(),
  importeCancelado: importe(),
  importeTotalRetPesos: importe(),
  importeEmbargoPesos: importe(),
  saldoAceptado: importe(),
  saldo: must(importe()),
  codMoneda: must(str()),
  cotizacionMonedaUlt: must(dec(6)),
};

/** `evento` + `arrayObservaciones` (InfoRespuesta). */
const INFO: Schema = {
  evento: obj(CODIGO_DESCRIPCION),
  observaciones: as('arrayObservaciones', codigosDescripciones()),
};
/** Las operaciones de obligación de recepción y de cuentas en agente usan `arrayObservacion`. */
const INFO_OBSERVACION: Schema = { observaciones: as('arrayObservacion', codigosDescripciones()) };

export const RESP = {
  consultarMontoObligadoRecepcion: { obligado: siNo(), montoDesde: importe(), ...INFO_OBSERVACION },
  consultarCtasCtes: {
    ctasCtes: as('arrayInfosCtaCte', wrapped('infoCtaCte', obj(INFO_CTA_CTE))),
    nroPagina: int(),
    hayMas: siNo(),
    ...INFO,
  },
  consultarCtaCte: { ctaCte: obj(CUENTA_CORRIENTE), ...INFO },
  consultarComprobantes: {
    comprobantes: as('arrayComprobantes', wrapped('comprobante', obj(COMPROBANTE))),
    nroPagina: int(),
    hayMas: siNo(),
    ...INFO,
  },
  consultarHistorialEstadosComprobante: {
    idComprobante: must(obj(ID_COMPROBANTE)),
    estados: as('arrayHistorialEstados', must(wrapped('estadoHistorico', obj(ESTADO_CMP)))),
  },
  consultarHistorialEstadosCtaCte: {
    idCtaCte: must(choice(ID_CTA_CTE)),
    estados: as('arrayHistorialEstados', must(wrapped('estadoHistorico', obj(ESTADO_CTA_CTE)))),
  },
  obtenerRemitos: { remitos: as('arrayIdsRemitos', wrapped('idsComprobantes', obj(ID_COMPROBANTE))) },
  /** `OperacionFECredReturnType`. */
  operacion: { resultado: must(enumOf(Resultado)), idCtaCte: must(choice(ID_CTA_CTE)), ...INFO },
  rechazarNotaDC: { idComprobante: must(obj(ID_COMPROBANTE)), resultado: must(enumOf(Resultado)), ...INFO },
  /** Solo `evento` y observaciones de `OperacionFECredReturnType`/`RechazarNotaDCReturnType`. */
  info: INFO,
  consultarCuentasEnAgtDptoCltv: {
    cuentas: as('arrayCuentasEnAgente', wrapped('cuentaEnAgente', obj(CUENTA_EN_AGENTE))),
    ...INFO_OBSERVACION,
  },
  consultarFacturasAgtDptoCltv: {
    facturas: as(
      'arrayFacturasAgtDptoCltv',
      wrapped(
        'facturaInformada',
        obj({ idFactura: must(obj(ID_COMPROBANTE)), infoAgtDptoCltv: must(obj(INFO_AGT_DPTO_CLTV)) }),
      ),
    ),
    ...INFO,
  },
  consultarTiposRetenciones: {
    tipos: as(
      'arrayTiposRetenciones',
      wrapped(
        'tipoRetencion',
        obj({
          codigoJurisdiccion: must(int()),
          descripcionJurisdiccion: must(str()),
          porcentajeRetencion: must(dec(2)),
        }),
      ),
    ),
  },
  /** `ConsultarCodigoDescripcionReturnType`. */
  codigosDescripciones: { codigos: as('arrayCodigoDescripcion', codigosDescripciones()) },
} satisfies Record<string, Schema>;

/**
 * Las observaciones con cualquiera de los dos nombres del XSD, para el detalle
 * de un `ArcaServiceError` (errores de negocio) o un `ArcaRechazoError` (resultado `R`).
 */
export const OBSERVACIONES: Schema = {
  observaciones: INFO['observaciones']!,
  observacion: INFO_OBSERVACION['observaciones']!,
};
