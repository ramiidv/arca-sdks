import { ArcaSoapError, ArcaServiceError, checkServiceErrors, ensureArray, extractServiceErrors } from '@ramiidv/arca-common';
import type {
  CodigoDescripcion,
  Comprobante,
  CuentaCorriente,
  CuentaEnAgente,
  EstadoComprobanteInfo,
  EstadoCtaCteInfo,
  IdComprobante,
  IdCtaCte,
  InfoAgtDptoCltv,
  InfoCtaCte,
  InfoRespuesta,
  InfoTransferencia,
  MotivoRechazo,
  Retencion,
} from './types.js';
import {
  EstadoComprobante,
  EstadoCtaCte,
  OpcionTransferencia,
  Resultado,
  TipoAceptacion,
  type TipoCodAutorizacion,
} from './constants.js';

// Conversión de las respuestas de FECredService a los tipos del SDK, según el
// XSD. Un campo obligatorio (minOccurs=1) ausente lanza ArcaSoapError.

type Obj = Record<string, unknown>;

const SERVICE = 'WSFECRED';

function invalidResponse(path: string, detail = 'falta el campo'): never {
  throw new ArcaSoapError(`Respuesta inválida de ${SERVICE}: ${detail} ${path}`, { uncertain: true });
}

function isAbsent(v: unknown): boolean {
  return v === undefined || v === null || v === '';
}

function obj(v: unknown, path: string): Obj {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) invalidResponse(path);
  return v as Obj;
}

function optObj(o: Obj, key: string, path: string): Obj | undefined {
  return isAbsent(o[key]) ? undefined : obj(o[key], `${path}.${key}`);
}

function str(o: Obj, key: string, path: string): string {
  const v = o[key];
  if (isAbsent(v) || typeof v === 'object') invalidResponse(`${path}.${key}`);
  return String(v);
}

function optStr(o: Obj, key: string, path: string): string | undefined {
  return isAbsent(o[key]) ? undefined : str(o, key, path);
}

function num(o: Obj, key: string, path: string): number {
  const s = str(o, key, path);
  const n = Number(s);
  if (!Number.isFinite(n)) invalidResponse(`${path}.${key}`, 'valor no numérico en');
  return n;
}

function optNum(o: Obj, key: string, path: string): number | undefined {
  return isAbsent(o[key]) ? undefined : num(o, key, path);
}

function siNo(o: Obj, key: string, path: string): boolean {
  const v = str(o, key, path);
  if (v === 'S') return true;
  if (v === 'N') return false;
  return invalidResponse(`${path}.${key}`, `valor "${v}" (se esperaba S/N) en`);
}

function optSiNo(o: Obj, key: string, path: string): boolean | undefined {
  return isAbsent(o[key]) ? undefined : siNo(o, key, path);
}

function enumValue<T extends string>(o: Obj, key: string, path: string, values: Record<string, T>): T {
  const v = str(o, key, path);
  if (!Object.values(values).includes(v as T)) invalidResponse(`${path}.${key}`, `valor "${v}" desconocido en`);
  return v as T;
}

/** Ítems `item` de un contenedor opcional `container` (ensureArray sobre el hijo, nunca sobre el contenedor). */
function items(o: Obj, container: string, item: string, path: string): Obj[] {
  if (isAbsent(o[container])) return [];
  const c = obj(o[container], `${path}.${container}`);
  return ensureArray(c[item]).map((x, i) => obj(x, `${path}.${container}.${item}[${i}]`));
}

// ---------------------------------------------------------------------------
// Errores de negocio
// ---------------------------------------------------------------------------

/**
 * Lanza ArcaServiceError si la respuesta trae `arrayErrores` o
 * `arrayErroresFormato` (este último con ítems `codigoDescripcionString`,
 * que `checkServiceErrors` de common reconoce).
 */
export function checkFecredErrors(result: Obj): void {
  checkServiceErrors(result, SERVICE);
}

/**
 * Para operaciones con `resultado`: `R` sin errores informados (no debería
 * pasar) también se lanza, con las observaciones como detalle.
 */
export function resultadoAprobado(r: Obj, path: string): 'A' | 'O' {
  const resultado = enumValue(r, 'resultado', path, Resultado);
  if (resultado === 'R') {
    const errors = extractServiceErrors(r);
    const obs = parseInfo(r, path).observaciones.map((o) => ({ code: o.codigo, msg: o.descripcion }));
    const details = [...errors, ...obs];
    throw new ArcaServiceError(
      `${SERVICE}: operación rechazada (resultado R)${details.length ? ': ' + details.map((d) => `[${d.code}] ${d.msg}`).join(', ') : ''}`,
      details,
    );
  }
  return resultado;
}

// ---------------------------------------------------------------------------
// Tipos comunes
// ---------------------------------------------------------------------------

export function parseCodigoDescripcion(o: Obj, path: string): CodigoDescripcion {
  return { codigo: num(o, 'codigo', path), descripcion: str(o, 'descripcion', path) };
}

export function parseCodigosDescripciones(o: Obj, container: string, path: string): CodigoDescripcion[] {
  return items(o, container, 'codigoDescripcion', path).map((x, i) =>
    parseCodigoDescripcion(x, `${path}.${container}.codigoDescripcion[${i}]`),
  );
}

/** `evento` + `arrayObservaciones` (o `arrayObservacion`, según la operación). */
export function parseInfo(o: Obj, path: string): InfoRespuesta {
  const ev = optObj(o, 'evento', path);
  const info: InfoRespuesta = {
    observaciones: [
      ...parseCodigosDescripciones(o, 'arrayObservaciones', path),
      ...parseCodigosDescripciones(o, 'arrayObservacion', path),
    ],
  };
  if (ev) info.evento = parseCodigoDescripcion(ev, `${path}.evento`);
  return info;
}

export function parseIdComprobante(v: unknown, path: string): IdComprobante {
  const o = obj(v, path);
  return {
    cuitEmisor: str(o, 'CUITEmisor', path),
    codTipoCmp: num(o, 'codTipoCmp', path),
    ptoVta: num(o, 'ptoVta', path),
    nroCmp: num(o, 'nroCmp', path),
  };
}

export function parseIdCtaCte(v: unknown, path: string): IdCtaCte {
  const o = obj(v, path);
  if (!isAbsent(o['codCtaCte'])) return { codCtaCte: str(o, 'codCtaCte', path) };
  if (!isAbsent(o['idFactura'])) return { idFactura: parseIdComprobante(o['idFactura'], `${path}.idFactura`) };
  return invalidResponse(`${path}.codCtaCte|idFactura`);
}

export function parseEstadoCtaCte(v: unknown, path: string): EstadoCtaCteInfo {
  const o = obj(v, path);
  return { estado: enumValue(o, 'estado', path, EstadoCtaCte), fechaHoraEstado: str(o, 'fechaHoraEstado', path) };
}

export function parseEstadoCmp(v: unknown, path: string): EstadoComprobanteInfo {
  const o = obj(v, path);
  return { estado: enumValue(o, 'estado', path, EstadoComprobante), fechaHoraEstado: str(o, 'fechaHoraEstado', path) };
}

// ---------------------------------------------------------------------------
// Cuenta corriente
// ---------------------------------------------------------------------------

export function parseInfoCtaCte(o: Obj, path: string): InfoCtaCte {
  const r: InfoCtaCte = {
    codCtaCte: str(o, 'codCtaCte', path),
    estadoCtaCte: parseEstadoCtaCte(o['estadoCtaCte'], `${path}.estadoCtaCte`),
    idFacturaCredito: parseIdComprobante(o['idFacturaCredito'], `${path}.idFacturaCredito`),
    importeTotalFC: num(o, 'importeTotalFC', path),
    saldo: num(o, 'saldo', path),
    codMoneda: str(o, 'codMoneda', path),
    opcionTransferencia: enumValue(o, 'opcionTransferencia', path, OpcionTransferencia),
  };
  const saldoAceptado = optNum(o, 'saldoAceptado', path);
  if (saldoAceptado !== undefined) r.saldoAceptado = saldoAceptado;
  return r;
}

function parseRetencion(o: Obj, path: string): Retencion {
  const r: Retencion = {
    codTipo: num(o, 'codTipo', path),
    importe: num(o, 'importe', path),
    porcentaje: num(o, 'porcentaje', path),
  };
  const desc = optStr(o, 'descMotivo', path);
  if (desc !== undefined) r.descMotivo = desc;
  return r;
}

export function parseCuentaCorriente(v: unknown, path: string): CuentaCorriente {
  const o = obj(v, path);
  return dropUndefined({
    codCtaCte: str(o, 'codCtaCte', path),
    estadoCtaCte: parseEstadoCtaCte(o['estadoCtaCte'], `${path}.estadoCtaCte`),
    factura: parseComprobante(o['factura'], `${path}.factura`),
    notasDCAsociadas: items(o, 'arrayNotasDCAsociadas', 'comprobante', path).map((x, i) =>
      parseComprobante(x, `${path}.arrayNotasDCAsociadas.comprobante[${i}]`),
    ),
    formasCancelacion: parseCodigosDescripciones(o, 'arrayFormasCancelacion', path),
    retenciones: items(o, 'arrayRetenciones', 'retencion', path).map((x, i) =>
      parseRetencion(x, `${path}.arrayRetenciones.retencion[${i}]`),
    ),
    ajustesOperacion: items(o, 'arrayAjustesOperacion', 'ajuste', path).map((x, i) => {
      const p = `${path}.arrayAjustesOperacion.ajuste[${i}]`;
      return { codigo: num(x, 'codigo', p), importe: num(x, 'importe', p) };
    }),
    importeInicial: num(o, 'importeInicial', path),
    importeTotalNotasDC: optNum(o, 'importeTotalNotasDC', path),
    importeCancelado: optNum(o, 'importeCancelado', path),
    importeTotalRetPesos: optNum(o, 'importeTotalRetPesos', path),
    importeEmbargoPesos: optNum(o, 'importeEmbargoPesos', path),
    saldoAceptado: optNum(o, 'saldoAceptado', path),
    saldo: num(o, 'saldo', path),
    codMoneda: str(o, 'codMoneda', path),
    cotizacionMonedaUlt: num(o, 'cotizacionMonedaUlt', path),
  });
}

// ---------------------------------------------------------------------------
// Comprobante
// ---------------------------------------------------------------------------

export function parseCuentaEnAgente(v: unknown, path: string): CuentaEnAgente {
  const o = obj(v, path);
  return dropUndefined({
    cuitAgente: str(o, 'cuitAgente', path),
    razonSocialAgente: optStr(o, 'razonSocialAgente', path),
    idCuenta: str(o, 'idCuenta', path),
    denominacion: optStr(o, 'denominacion', path),
  });
}

export function parseInfoAgtDptoCltv(v: unknown, path: string): InfoAgtDptoCltv {
  const o = obj(v, path);
  return dropUndefined({
    fechaInfo: str(o, 'fechaInfo', path),
    ctaAgente: parseCuentaEnAgente(o['ctaAgente'], `${path}.ctaAgente`),
    recibida: siNo(o, 'recibida', path),
    fechaLectura: optStr(o, 'fechaLectura', path),
    fechaRecep: optStr(o, 'fechaRecep', path),
    aceptada: optSiNo(o, 'aceptada', path),
    motivoRechazo: optStr(o, 'motivoRechazo', path),
    idPagoAgtDptoCltv: optStr(o, 'idPagoAgtDptoCltv', path),
    cbuAgtDptoCltv: optStr(o, 'CBUAgtDptoCltv', path),
  });
}

function parseInfoTransferencia(v: unknown, path: string): InfoTransferencia {
  const o = obj(v, path);
  if (!isAbsent(o['infoAgtDptoCltv'])) {
    return { infoAgtDptoCltv: parseInfoAgtDptoCltv(o['infoAgtDptoCltv'], `${path}.infoAgtDptoCltv`) };
  }
  if (!isAbsent(o['infoSCA'])) {
    const p = `${path}.infoSCA`;
    const s = obj(o['infoSCA'], p);
    return {
      infoSCA: dropUndefined({
        fechaAceptacionFactura: str(s, 'fechaAceptacionFactura', p),
        informaCBUReceptor: siNo(s, 'informaCBUReceptor', p),
        cbuReceptor: optStr(s, 'CBUReceptor', p),
        cbuValidada: optSiNo(s, 'CBUValidada', p),
        fechaLecturaSCA: optStr(s, 'fechaLecturaSCA', p),
      }),
    };
  }
  return invalidResponse(`${path}.infoAgtDptoCltv|infoSCA`);
}

function parseMotivoRechazo(o: Obj, path: string): MotivoRechazo {
  return {
    codMotivo: num(o, 'codMotivo', path),
    descMotivo: str(o, 'descMotivo', path),
    justificacion: str(o, 'justificacion', path),
  };
}

export function parseComprobante(v: unknown, path: string): Comprobante {
  const o = obj(v, path);
  const tipoCodAuto = str(o, 'tipoCodAuto', path);
  if (tipoCodAuto !== 'A' && tipoCodAuto !== 'E') invalidResponse(`${path}.tipoCodAuto`, `valor "${tipoCodAuto}" desconocido en`);
  const asociado = o['idComprobanteAsociado'];
  const infoTransf = o['infoTransferencia'];
  return dropUndefined({
    cuitEmisor: str(o, 'cuitEmisor', path),
    razonSocialEmi: str(o, 'razonSocialEmi', path),
    codTipoCmp: num(o, 'codTipoCmp', path),
    ptoVta: num(o, 'ptovta', path),
    nroCmp: num(o, 'nroCmp', path),
    cuitReceptor: str(o, 'cuitReceptor', path),
    razonSocialRecep: str(o, 'razonSocialRecep', path),
    tipoCodAuto: tipoCodAuto as TipoCodAutorizacion,
    codAutorizacion: str(o, 'codAutorizacion', path),
    fechaEmision: str(o, 'fechaEmision', path),
    fechaPuestaDispo: optStr(o, 'fechaPuestaDispo', path),
    fechaVenPago: optStr(o, 'fechaVenPago', path),
    fechaVenAcep: optStr(o, 'fechaVenAcep', path),
    importeTotal: num(o, 'importeTotal', path),
    codMoneda: str(o, 'codMoneda', path),
    cotizacionMoneda: num(o, 'cotizacionMoneda', path),
    cbuEmisor: optStr(o, 'CBUEmisor', path),
    aliasEmisor: optStr(o, 'AliasEmisor', path),
    esAnulacion: optSiNo(o, 'esAnulacion', path),
    esPostAceptacion: optSiNo(o, 'esPostAceptacion', path),
    idComprobanteAsociado: isAbsent(asociado)
      ? undefined
      : parseIdComprobante(asociado, `${path}.idComprobanteAsociado`),
    referenciasComerciales: isAbsent(o['referenciasComerciales'])
      ? []
      : ensureArray(obj(o['referenciasComerciales'], `${path}.referenciasComerciales`)['texto']).map(String),
    subtotalesIVA: items(o, 'arraySubtotalesIVA', 'subtotalIVA', path).map((x, i) => {
      const p = `${path}.arraySubtotalesIVA.subtotalIVA[${i}]`;
      return { codigo: num(x, 'codigo', p), baseImponible: num(x, 'baseImponible', p), importe: num(x, 'importe', p) };
    }),
    otrosTributos: items(o, 'arrayOtrosTributos', 'otroTributo', path).map((x, i) => {
      const p = `${path}.arrayOtrosTributos.otroTributo[${i}]`;
      return dropUndefined({
        codigo: num(x, 'codigo', p),
        detalle: optStr(x, 'detalle', p),
        baseImponible: num(x, 'baseImponible', p),
        importe: num(x, 'importe', p),
      });
    }),
    items: items(o, 'arrayItems', 'item', path).map((x, i) => {
      const p = `${path}.arrayItems.item[${i}]`;
      return dropUndefined({
        orden: num(x, 'orden', p),
        unidadesMtx: optNum(x, 'unidadesMtx', p),
        codigoMtx: optStr(x, 'codigoMtx', p),
        codigo: optStr(x, 'codigo', p),
        descripcion: str(x, 'descripcion', p),
        codNomMercosur: optStr(x, 'codNomMercosur', p),
        cantidad: optNum(x, 'cantidad', p),
        codigoUnidadMedida: optNum(x, 'codigoUnidadMedida', p),
        precioUnitario: optNum(x, 'precioUnitario', p),
        importeBonificacion: optNum(x, 'importeBonificacion', p),
        codigoCondicionIVA: num(x, 'codigoCondicionIVA', p),
        importeIVA: optNum(x, 'importeIVA', p),
        importeItem: num(x, 'importeItem', p),
      });
    }),
    datosGenerales: optStr(o, 'datosGenerales', path),
    datosComerciales: optStr(o, 'datosComerciales', path),
    leyendaComercial: optStr(o, 'leyendaComercial', path),
    codCtaCte: str(o, 'codCtaCte', path),
    estado: parseEstadoCmp(o['estado'], `${path}.estado`),
    tipoAcep: isAbsent(o['tipoAcep']) ? undefined : enumValue(o, 'tipoAcep', path, TipoAceptacion),
    fechaHoraAcep: optStr(o, 'fechaHoraAcep', path),
    motivosRechazo: items(o, 'arrayMotivosRechazo', 'motivoRechazo', path).map((x, i) =>
      parseMotivoRechazo(x, `${path}.arrayMotivosRechazo.motivoRechazo[${i}]`),
    ),
    opcionTransferencia: isAbsent(o['opcionTransferencia'])
      ? undefined
      : enumValue(o, 'opcionTransferencia', path, OpcionTransferencia),
    infoTransferencia: isAbsent(infoTransf) ? undefined : parseInfoTransferencia(infoTransf, `${path}.infoTransferencia`),
  });
}

/** Saca las claves `undefined` (para que los objetos no tengan claves opcionales vacías). */
function dropUndefined<T extends object>(o: T): T {
  for (const k of Object.keys(o) as Array<keyof T>) if (o[k] === undefined) delete o[k];
  return o;
}

export { items as parseItems, num as parseNum, optNum as parseOptNum, optStr as parseOptStr, siNo as parseSiNo, optSiNo as parseOptSiNo, str as parseStr };
export { invalidResponse };
