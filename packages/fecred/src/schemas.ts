/**
 * Schemas de FECredService, transcriptos del XSD embebido en el WSDL oficial
 * (https://fwshomo.afip.gob.ar/wsfecred/FECredService?wsdl), con el DSL de
 * `@ramiidv/arca-common/schema`. El orden de las claves es el de la `xsd:sequence`.
 *
 * Las claves son los nombres de la API del SDK; cuando el elemento del XML se
 * llama distinto se indica con `as('NombreXml', ...)`. Encima del DSL, este
 * módulo agrega:
 * - `as`: renombre API ↔ XML (`cuitEmisor` ↔ `CUITEmisor`, `motivos` ↔ `arrayMotivosRechazo`, ...);
 * - `siNo`: `SiNoSimpleType` (`S`/`N`) ↔ `boolean`;
 * - `choice`: `xsd:choice` en respuestas (al menos una de las opciones);
 * - en respuestas, los valores fuera de una enumeración (`str({ values })`) y
 *   las listas `must()` ausentes se rechazan.
 *
 * @internal No se exporta desde `index.ts`.
 */
import { ArcaSoapError, ensureArray, formatDate, validateCBU } from '@ramiidv/arca-common';
import type { ValidationErrorDetail } from '@ramiidv/arca-common';
import {
  bool,
  cuit,
  date,
  datetime,
  dec,
  decodeResponse,
  encodeRequest,
  id,
  int,
  must,
  obj,
  opt,
  str,
  wrapped,
} from '@ramiidv/arca-common/schema';
import type { Field, Schema } from '@ramiidv/arca-common/schema';
import {
  EstadoComprobante,
  EstadoCtaCte,
  OpcionTransferencia,
  Resultado,
  RolCtaCte,
  TipoAceptacion,
  TipoCancelacion,
  TipoFechaFiltro,
} from './constants.js';

export const SERVICE = 'WSFECRED';

type Obj = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Extensiones del DSL: renombre API ↔ XML, S/N y xsd:choice
// ---------------------------------------------------------------------------

interface Ext {
  /** Nombre del elemento en el XML, si difiere de la clave de la API. */
  readonly xml?: string;
  /** `SiNoSimpleType`: `boolean` en la API, `S`/`N` en el XML. */
  readonly siNo?: boolean;
  /** `xsd:choice`: en las respuestas tiene que venir al menos una opción. */
  readonly choice?: boolean;
}

const ext = (f: Field) => f as Field & Ext;

/** El elemento del XML se llama `xml` (la clave del schema es el nombre de la API). */
const as = (xml: string, f: Field): Field => ({ ...f, xml }) as Field & Ext;
/** `SiNoSimpleType`. */
const siNo = (): Field => ({ ...bool(), siNo: true }) as Field & Ext;
/** `xsd:choice` entre los elementos de `schema`. */
const choice = (schema: Schema): Field => ({ ...obj(schema), choice: true }) as Field & Ext;

const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);
const isAbsent = (v: unknown) => v === undefined || v === null || v === '';

/** Aplica `item` a cada valor del campo (escalar, lista o contenedor `wrapped`). */
function mapField(v: unknown, f: Field, path: string, item: (x: unknown, p: string) => unknown): unknown {
  if (f.minItems === undefined) return item(v, path);
  if (f.wrap) {
    if (!isObj(v)) return v;
    return { [f.wrap]: ensureArray(v[f.wrap]).map((x, i) => item(x, `${path}[${i}]`)) };
  }
  return Array.isArray(v) ? v.map((x, i) => item(x, `${path}[${i}]`)) : item(v, path);
}

/** Request ya codificado por `encodeRequest` (claves de la API) → elementos del XML. */
function toXml(node: Obj, schema: Schema): Obj {
  const out: Obj = {};
  for (const [key, f] of Object.entries(schema)) {
    if (node[key] === undefined) continue;
    out[ext(f).xml ?? key] = mapField(node[key], f, key, (x) => {
      if (f.schema) return toXml(x as Obj, f.schema);
      if (ext(f).siNo) return x === 'true' ? 'S' : 'N';
      return x;
    });
  }
  return out;
}

const responseError = (message: string) => new ArcaSoapError(`${SERVICE}: ${message}`, { uncertain: true });

/** Respuesta del XML → claves de la API y valores que entiende `decodeResponse`. */
function fromXml(node: unknown, schema: Schema, path: string): unknown {
  if (!isObj(node)) return node;
  const out: Obj = {};
  for (const [key, f] of Object.entries(schema)) {
    const p = `${path}.${key}`;
    const v = node[ext(f).xml ?? key];
    if (v === undefined || v === null) {
      // `decodeResponse` devuelve `[]` para cualquier lista ausente, aun con `must()`.
      if (f.required && f.minItems !== undefined) throw responseError(`Respuesta inválida: falta ${p}`);
      continue;
    }
    out[key] = mapField(v, f, p, (x, xp) => fromXmlValue(x, f, xp));
  }
  return out;
}

function fromXmlValue(x: unknown, f: Field, path: string): unknown {
  if (f.schema) {
    if (ext(f).choice) {
      const options = Object.entries(f.schema).map(([k, c]) => ext(c).xml ?? k);
      if (!isObj(x) || options.every((k) => isAbsent(x[k]))) {
        throw responseError(`Respuesta inválida: falta ${path}.${options.join('|')}`);
      }
    }
    return fromXml(x, f.schema, path);
  }
  if (typeof x !== 'string' || x === '') return x;
  if (ext(f).siNo) {
    if (x === 'S') return 'true';
    if (x === 'N') return 'false';
    throw responseError(`Respuesta inválida: ${path} vale "${x}" (se esperaba S/N)`);
  }
  const values = f.scalar?.kind === 'str' ? f.scalar.values : undefined;
  if (values && !values.includes(x)) throw responseError(`Respuesta inválida: ${path} vale "${x}" (valor desconocido)`);
  return x;
}

/**
 * Reglas que el DSL no expresa: `xsd:choice` de `idCtaCte` (exactamente uno),
 * rango de `fecha` y dígitos verificadores del CBU.
 */
function checkRequest(input: Obj, errors: ValidationErrorDetail[]): void {
  const push = (field: string, message: string, value: unknown) =>
    errors.push({ field, message: `${field}: ${message}`, value });
  const idCtaCte = input['idCtaCte'];
  if (isObj(idCtaCte) && (idCtaCte['codCtaCte'] === undefined) === (idCtaCte['idFactura'] === undefined)) {
    push('idCtaCte', 'debe tener exactamente uno de codCtaCte o idFactura', idCtaCte);
  }
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

/**
 * Valida el request contra el schema (lanza `ArcaValidationError` con todos
 * los errores) y lo devuelve con los nombres y valores del XML, en orden XSD.
 */
export function encode(input: unknown, schema: Schema, method: string): Obj {
  return toXml(encodeRequest(input, schema, method, checkRequest), schema);
}

/**
 * Decodifica una respuesta (pedida con `parseNumbers: false`). Una respuesta
 * que no cumple el schema lanza `ArcaSoapError` (`uncertain`).
 */
export function decode<T>(node: unknown, schema: Schema, path: string): T {
  return decodeResponse<T>(fromXml(node, schema, path), schema, path, { error: responseError });
}

// ---------------------------------------------------------------------------
// Tipos simples
// ---------------------------------------------------------------------------

const IMPORTE_MAX = 9999999999999.99;
const enumOf = (values: Record<string, string>) => str({ values: Object.values(values) });

/** Código `xsd:short` (el SDK no acepta negativos). */
export const short = () => int(0, 32767);
/** `ImporteSimpleType`. */
export const importe = () => dec(2, -IMPORTE_MAX, IMPORTE_MAX);
/** `ImporteSimpleType` no negativo (regla del SDK para los importes de los requests, salvo ajustes). */
export const importePositivo = () => dec(2, 0, IMPORTE_MAX);
/** `PorcentajeSimpleType` (0 a 100), con 2 decimales. */
export const porcentaje = () => dec(2, 0, 100);
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

/** `IdCtaCteType` (`xsd:choice`: en requests, exactamente uno; ver `checkRequest`). */
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
  consultarObligadoRecepcion: { cuitConsultada: cuit() },
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
  idCtaCte: { idCtaCte: obj(ID_CTA_CTE) },
  aceptarFECred: {
    idCtaCte: obj(ID_CTA_CTE),
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
  rechazarFECred: { idCtaCte: obj(ID_CTA_CTE), motivos: motivosRechazo() },
  informarCancelacionTotalFECred: {
    idCtaCte: obj(ID_CTA_CTE),
    formasCancelacion: as('arrayFormasCancelacion', codigosDescripciones()),
    importeCancelacion: importePositivo(),
  },
  modificarOpcionTransferencia: { idCtaCte: obj(ID_CTA_CTE), opcionTransferencia: enumOf(OpcionTransferencia) },
  informarFacturaAgtDptoCltv: { idCtaCte: obj(ID_CTA_CTE), ctaAgente: obj(CUENTA_EN_AGENTE) },
  rechazarNotaDC: { idComprobante: obj(ID_COMPROBANTE), motivos: motivosRechazo() },
  consultarFacturasAgtDptoCltv: { idCtaCte: opt(obj(ID_CTA_CTE)), fecha: as('filtroFecha', opt(obj(FILTRO_FECHA))) },
} satisfies Record<string, Schema>;

// ---------------------------------------------------------------------------
// Respuestas (sin `must()` = minOccurs 0)
// ---------------------------------------------------------------------------

/** `EstadoCtaCteType`. */
const ESTADO_CTA_CTE: Schema = { estado: must(enumOf(EstadoCtaCte)), fechaHoraEstado: must(datetime()) };
/** `EstadoCmpType`. */
const ESTADO_CMP: Schema = { estado: must(enumOf(EstadoComprobante)), fechaHoraEstado: must(datetime()) };

/** `InfoCtaCteType`. */
const INFO_CTA_CTE: Schema = {
  codCtaCte: must(id()),
  estadoCtaCte: must(obj(ESTADO_CTA_CTE)),
  idFacturaCredito: must(obj(ID_COMPROBANTE)),
  importeTotalFC: must(importe()),
  saldo: must(importe()),
  saldoAceptado: importe(),
  codMoneda: must(str()),
  opcionTransferencia: must(enumOf(OpcionTransferencia)),
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
  tipoCodAuto: must(str({ values: ['A', 'E'] })),
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
  tipoAcep: enumOf(TipoAceptacion),
  fechaHoraAcep: datetime(),
  motivosRechazo: motivosRechazo(),
  opcionTransferencia: enumOf(OpcionTransferencia),
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
  consultarMontoObligadoRecepcion: { obligado: must(siNo()), montoDesde: importe(), ...INFO_OBSERVACION },
  consultarObligadoRecepcion: { obligado: as('respuesta', must(siNo())), desde: date(), ...INFO_OBSERVACION },
  consultarCtasCtes: {
    ctasCtes: as('arrayInfosCtaCte', wrapped('infoCtaCte', obj(INFO_CTA_CTE))),
    nroPagina: int(),
    hayMas: siNo(),
    ...INFO,
  },
  consultarCtaCte: { ctaCte: must(obj(CUENTA_CORRIENTE)), ...INFO },
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
  /** Solo las observaciones (para el detalle de un resultado `R`). */
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
