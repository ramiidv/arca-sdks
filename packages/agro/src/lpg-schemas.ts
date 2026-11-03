/**
 * Schemas de WSLPG, transcriptos del XSD embebido en el WSDL oficial
 * (https://fwshomo.afip.gov.ar/wslpg/LpgService?wsdl). El orden de las claves
 * es el orden de la `xsd:sequence`.
 *
 * @internal
 */
import { ArcaValidationError, validateCuit } from '@ramiidv/arca-common';
import {
  base64,
  cuit,
  custom,
  date,
  dec,
  id,
  int,
  list,
  must,
  obj,
  opt,
  porcentaje,
  str,
  wrapped,
  xml,
} from './schema.js';
import type { Schema } from './schema.js';
import type { GradoLpg } from './lpg-types.js';

// ---------------------------------------------------------------------------
// Tipos simples (XSD)
// ---------------------------------------------------------------------------

const ptoEmision = () => int(1, 9999); // LpgPtoEmision
const nroOrden = () => int(0); // long
const ib = () => int(0, 999999999999999); // LpgIbType
const actividad = () => int(0, 999999, true); // LpgActividadType
const codGrano = () => int(0, 999, true); // LpgCodigoGranoType
const pesoNeto = () => int(0, 99999999, true); // LpgPesoNetoType
const codLocalidad = () => int(0, 999999, true); // LpgCodLocProcedenciaType
const codProvincia = () => int(0, 99); // LpgCodProvProcedenciaType
const campania = () => int(203, 9999); // LpgCampaniaType
const siNo = () => str({ values: ['S', 'N'] }); // LpgSiNoType
const alicuota = () => dec(4, 0, 100); // LpgAlicuotaType
// biome-ignore lint/correctness/noPrecisionLoss: tope literal del XSD (maxInclusive)
const importe17_2 = () => dec(2, 0, 99999999999999999.99); // LpgImporte_17_2_Type
/** Grados que no llevan valor de grado (manual WSLPG §3.1; error 3014 en `cgInformarCalidad`). */
export const GRADOS_SIN_VALOR: readonly GradoLpg[] = ['G1', 'G2', 'G3'];
/** Grados que exigen valor de grado (manual WSLPG §3.1; error 3015 en `cgInformarCalidad`). */
export const GRADOS_CON_VALOR: readonly GradoLpg[] = ['FG', 'F1', 'F2', 'F3'];
/** `LpgGradoCodigoType`: el XSD solo limita el largo; los valores son los del manual WSLPG §3.1. */
const gradoCodigo = () => str({ values: [...GRADOS_SIN_VALOR, ...GRADOS_CON_VALOR] });
const gradoValor = () => dec(8, 0, 1.99999999, true); // LpgGradoValorType
const factor = () => dec(8, 0, 999.99999999, true); // LpgFactorEntType
/**
 * `LpgPrecioRefTnType`. El manual WSLPG §3.1 indica 99999.999 como máximo, pero
 * el XSD admite 999999999.999 (los precios en pesos por tonelada ya superan el
 * tope del manual): se valida contra el XSD.
 */
const precioRefTn = () => dec(3, 0, 999999999.999);
const precioFleteTn = () => dec(2, 0, 9999999.99); // LpgPrecioFleteTnType
const datosAdicionales = () => str({ minLen: 0, maxLen: 400 }); // LpgDatosAdicionalesType
const numeroContrato = () => int(0, 999999999999999, true); // LpgNumeroContratoType
const importe12_2 = () => dec(2, 0, 999999999999.98); // LpgImporte12_2Type (maxExclusive 999999999999.99)
const conceptoImporte = () => str({ minLen: 0, maxLen: 200 }); // LpgConceptoImporteType
const zImporte8_2 = () => dec(2, 0, 99999999.99); // NumeroZ_8_2_Type
// biome-ignore lint/correctness/noPrecisionLoss: tope literal del XSD (maxInclusive)
const importe17_3 = () => dec(3, 0, 99999999999999999.999); // LpgImporte_17_3_Type
const importe8_2 = () => dec(2, 0, 99999999.99, true); // Numero_8_2_Type
const importe13_2 = () => dec(2, 0, 9999999999999.99, true); // Numero_13_2_Type
const cantidad8_3 = () => dec(3, 0, 99999999.999, true); // Numero_8_3_Type
const string50 = () => str({ minLen: 0, maxLen: 50 }); // String_50_Type
const codPuerto = () => int(0, 9999, true); // LpgCodPuertoType
const puertoLocalidad = () => str({ maxLen: 240 }); // LpgDesPuertoLocalidadType
const porcentaje99 = () => dec(2, 0, 99.99); // LpgPorcType, LpgComisionGastosAdmType
const codTipoOperacion = () => str({ minLen: 0, maxLen: 2 }); // LpgCodTipoOperacionType
// LpgPorcentajeType = `porcentaje()` de common (dec(2, 0, 100)).

/**
 * `LpgCuit0Type`: CUIT o `0` (sin corredor). Una CUIT distinta de 0 se valida
 * con dígito verificador y se envía normalizada.
 */
const cuit0 = () =>
  custom((v, fail) => {
    if (v === 0 || v === '0') return 0;
    try {
      return validateCuit(v as string | number);
    } catch (e) {
      if (e instanceof ArcaValidationError) return fail(e.details[0]?.message ?? 'CUIT inválido');
      throw e;
    }
  });

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/** LpgCodigoDescripcionType */
const CODIGO_DESCRIPCION: Schema = { codigo: str(), descripcion: str() };

/** `opcionales.opcional[]` (LpgArrOpcionalType) */
const OPCIONALES = opt(wrapped('opcional', obj(CODIGO_DESCRIPCION)));

/** LpgCertType */
const CERTIFICADO: Schema = {
  // LpgTipoCertificadoDepType: el XSD solo limita el largo; el manual WSLPG §3.1 admite solo "332".
  tipoCertificadoDeposito: str({ values: ['332'] }),
  nroCertificadoDeposito: int(100000000, 999999999999, true),
  pesoNeto: pesoNeto(),
  pesoNetoTotalCertificado: opt(pesoNeto()),
  codLocalidadProcedencia: codLocalidad(),
  codProvProcedencia: codProvincia(),
  campania: campania(),
  fechaCierre: date(),
};

/** LpgLiquidacionBaseType */
export const LIQUIDACION_BASE: Schema = {
  ptoEmision: ptoEmision(),
  nroOrden: nroOrden(),
  numeroContrato: opt(numeroContrato()),
  cuitComprador: cuit(),
  nroActComprador: actividad(),
  nroIngBrutoComprador: ib(),
  codTipoOperacion: codTipoOperacion(),
  esLiquidacionPropia: opt(siNo()),
  esCanje: opt(str({ values: ['P', 'T', 'N'] })),
  codPuerto: codPuerto(),
  desPuertoLocalidad: opt(puertoLocalidad()),
  codGrano: codGrano(),
  pesoNetoSinCertificado: opt(pesoNeto()),
  codLocalidadProcedenciaSinCertificado: opt(codLocalidad()),
  codProvProcedenciaSinCertificado: opt(codProvincia()),
  cuitVendedor: cuit(),
  nroIngBrutoVendedor: ib(),
  actuaCorredor: opt(siNo()),
  liquidaCorredor: siNo(),
  cuitCorredor: opt(cuit()),
  comisionCorredor: opt(porcentaje99()),
  nroIngBrutoCorredor: opt(ib()),
  fechaPrecioOperacion: date(),
  precioRefTn: precioRefTn(),
  codGradoRef: opt(gradoCodigo()),
  codGradoEnt: opt(gradoCodigo()),
  valGradoEnt: opt(gradoValor()),
  factorEnt: opt(factor()),
  precioFleteTn: precioFleteTn(),
  contProteico: opt(dec(3, 0, 999.999)),
  alicIvaOperacion: opt(alicuota()),
  campaniaPPal: campania(),
  codLocalidadProcedencia: codLocalidad(),
  codProvProcedencia: codProvincia(),
  datosAdicionales: opt(datosAdicionales()),
  certificados: opt(wrapped('certificado', obj(CERTIFICADO))),
  opcionales: OPCIONALES,
};

/** LpgDeduccionType */
const DEDUCCION: Schema = {
  codigoConcepto: str({ maxLen: 2 }),
  detalleAclaratorio: opt(str({ minLen: 0, maxLen: 50 })),
  diasAlmacenaje: opt(int(0, 9999)),
  precioPKGdiario: opt(dec(8, 0, 999999.99999999)),
  comisionGastosAdm: opt(porcentaje99()),
  baseCalculo: opt(dec(8, 0)),
  alicuotaIva: alicuota(),
};

/** LpgRetencionType */
const RETENCION: Schema = {
  codigoConcepto: str({ maxLen: 2 }),
  detalleAclaratorio: opt(str({ minLen: 0, maxLen: 50 })),
  baseCalculo: opt(dec(11, 0)),
  alicuota: alicuota(),
  nroCertificadoRetencion: opt(int(0, 99999999999999)),
  fechaCertificadoRetencion: opt(date()),
  importeCertificadoRetencion: opt(importe17_2()),
};

/** LpgPercepcionType */
const PERCEPCION: Schema = {
  descripcion: str({ minLen: 0, maxLen: 50 }),
  importeFinal: importe17_2(),
};

const DEDUCCIONES = opt(wrapped('deduccion', obj(DEDUCCION)));
const RETENCIONES = opt(wrapped('retencion', obj(RETENCION)));

/** LpgLiqReqType (sin `auth`) */
export const LIQUIDACION_AUTORIZAR: Schema = {
  liquidacion: obj(LIQUIDACION_BASE),
  deducciones: DEDUCCIONES,
  retenciones: RETENCIONES,
  percepciones: opt(wrapped('percepcion', obj(PERCEPCION))),
};

/** LpgAjustePorImporteType (ajuste por contrato): la parte final de LpgAjusteCreditoType / LpgAjusteDebitoType */
const AJUSTE_POR_IMPORTE: Schema = {
  datosAdicionales: opt(datosAdicionales()),
  opcionales: OPCIONALES,
  conceptoImporteIva0: opt(conceptoImporte()),
  importeAjustarIva0: opt(importe12_2()),
  conceptoImporteIva105: opt(conceptoImporte()),
  importeAjustarIva105: opt(importe12_2()),
  conceptoImporteIva21: opt(conceptoImporte()),
  importeAjustarIva21: opt(importe12_2()),
  deducciones: DEDUCCIONES,
  retenciones: RETENCIONES,
};

/** LpgAjusteCreditoType / LpgAjusteDebitoType */
const AJUSTE_CREDITO_DEBITO: Schema = {
  certificados: opt(wrapped('certificado', obj({ coe: id(), pesoAjustado: pesoNeto() }))),
  diferenciaPesoNeto: int(0, 99999998),
  diferenciaPrecioOperacion: precioRefTn(),
  codGrado: opt(gradoCodigo()),
  valGrado: opt(gradoValor()),
  factor: opt(factor()),
  diferenciaPrecioFleteTn: precioFleteTn(),
  ...AJUSTE_POR_IMPORTE,
};

/** LpgFusionType / LsgFusionType */
const FUSION: Schema = { nroIngBrutos: ib(), nroActividad: actividad() };

/** LpgAjusteUnificadoReqType (sin `auth`) */
export const AJUSTE_UNIFICADO: Schema = {
  ajusteBase: obj({
    ptoEmision: ptoEmision(),
    nroOrden: nroOrden(),
    coeAjustado: id(),
    certificados: opt(wrapped('certificado', obj(CERTIFICADO))),
    codLocalidad: codLocalidad(),
    codProv: codProvincia(),
    fusion: opt(obj(FUSION)),
  }),
  ajusteCredito: opt(obj(AJUSTE_CREDITO_DEBITO)),
  ajusteDebito: opt(obj(AJUSTE_CREDITO_DEBITO)),
};

/** LpgAjusteContratoReqType (sin `auth`) */
export const AJUSTE_CONTRATO: Schema = {
  ajusteBase: obj({
    ptoEmision: ptoEmision(),
    nroOrden: nroOrden(),
    nroContrato: numeroContrato(),
    certificados: opt(wrapped('certificado', obj(CERTIFICADO))),
    actividad: actividad(),
    codGrano: codGrano(),
    cuitVendedor: cuit(),
    cuitCorredor: opt(cuit()),
    cuitComprador: cuit(),
    precioRefTn: precioRefTn(),
    codGradoEnt: gradoCodigo(),
    valGradoEnt: gradoValor(),
    precioFleteTn: precioFleteTn(),
    codPuerto: codPuerto(),
    desPuertoLocalidad: opt(puertoLocalidad()),
    codLocalidad: codLocalidad(),
    codProv: codProvincia(),
  }),
  ajusteCredito: opt(obj(AJUSTE_POR_IMPORTE)),
  ajusteDebito: opt(obj(AJUSTE_POR_IMPORTE)),
};

/** LpgAutorizarAnticipoReqType (sin `auth`): `LpgLiquidacionAnticipoBaseType`, retenciones y deducciones */
export const AUTORIZAR_ANTICIPO: Schema = {
  anticipo: obj({
    liquidacion: obj({
      ptoEmision: ptoEmision(),
      nroOrden: nroOrden(),
      cuitComprador: cuit(),
      nroActComprador: actividad(),
      nroIngBrutoComprador: ib(),
      codTipoOperacion: codTipoOperacion(),
      nroContrato: opt(numeroContrato()),
      codPuerto: codPuerto(),
      descPuertoLocalidad: opt(puertoLocalidad()),
      codGrano: codGrano(),
      pesoNetoSinCertificado: pesoNeto(),
      cuitVendedor: cuit(),
      nroIngBrutoVendedor: ib(),
      actuaCorredor: opt(siNo()),
      liquidaCorredor: siNo(),
      cuitCorredor: opt(cuit()),
      comisionCorredor: opt(porcentaje99()),
      nroIngBrutoCorredor: opt(ib()),
      fechaPrecioOperacion: date(),
      precioRefTn: precioRefTn(),
      alicIvaOperacion: opt(alicuota()),
      campaniaPpal: campania(),
      codLocProcedencia: codLocalidad(),
      codProvProcedencia: codProvincia(),
      datosAdicionales: opt(datosAdicionales()),
      opcionales: OPCIONALES,
    }),
    retenciones: RETENCIONES,
    deducciones: DEDUCCIONES,
  }),
};

/** LpgCancelarAnticipoReqType (sin `auth`): `pdf` es obligatorio en el XSD */
export const CANCELAR_ANTICIPO: Schema = { coe: id(), ptoEmision: ptoEmision(), nroOrden: nroOrden(), pdf: siNo() };

/** LpgAnularContraDocumentoReqType (sin `auth`): lo usan lpgAnularContraDocumento y lsgAnularContraDocumento */
export const ANULAR_CONTRA_DOCUMENTO: Schema = {
  anulacionBase: obj({ puntoEmision: ptoEmision(), nroOrden: nroOrden(), coeAnular: id() }),
};

/** LpgLiqConsXCoeReqType (sin `auth`): también lo usan cgSolicitarAnulacion y cgConfirmarAnulacion */
export const CONSULTA_X_COE: Schema = { coe: id(), pdf: opt(siNo()) };

/** LpgLiqConsXNroOrdenReqType (sin `auth`) */
export const CONSULTA_X_NRO_ORDEN: Schema = { ptoEmision: ptoEmision(), nroOrden: nroOrden() };

/** LpgLiqUltNroOrdenReqType (sin `auth`) */
export const ULT_NRO_ORDEN: Schema = { ptoEmision: ptoEmision() };

/** LpgLocalidadReqType: `codProvincia` es `xs:string` */
export const LOCALIDADES: Schema = { codProvincia: str() };

/** LpgTipoOperacionReqType */
export const TIPO_OPERACION: Schema = { nroActLiquida: int(0) };

/** LpgGradoEntReqType */
export const GRADO_ENTREGADO: Schema = { codGrano: codGrano() };

/** LpgLiqPorContratoConsReqType (sin `auth`) */
export const LIQ_POR_CONTRATO: Schema = {
  nroContrato: numeroContrato(),
  cuitComprador: cuit(),
  cuitVendedor: cuit(),
  cuitCorredor: opt(cuit()),
  codGrano: codGrano(),
};

/** LpgAsociarLiqAContratoReqType (sin `auth`): lo usan asociarLiquidacionAContrato y lsgAsociarAContrato */
export const ASOCIAR_A_CONTRATO: Schema = { coe: id(), ...LIQ_POR_CONTRATO };

/** LpgAjustePorContratoReqType (sin `auth`) */
export const AJUSTE_POR_CONTRATO: Schema = { nroContrato: numeroContrato() };

// --- Liquidación secundaria (lsg*) ------------------------------------------

/** LsgDeduccionType */
const LSG_DEDUCCION: Schema = { detalleAclaratoria: string50(), baseCalculo: importe8_2(), alicuotaIVA: alicuota() };

/** LsgPercepcionType */
const LSG_PERCEPCION: Schema = { detalleAclaratoria: string50(), baseCalculo: importe13_2(), alicuota: alicuota() };

/** LsgLiqReqType (sin `auth`) */
export const LSG_AUTORIZAR: Schema = {
  liqSecundariaBase: obj({
    ptoEmision: ptoEmision(),
    nroOrden: nroOrden(),
    numeroContrato: opt(numeroContrato()),
    cuitComprador: cuit(),
    nroIngBrutoComprador: ib(),
    codPuerto: codPuerto(),
    desPuertoLocalidad: opt(puertoLocalidad()),
    codGrano: codGrano(),
    cantidadTn: cantidad8_3(),
    cuitVendedor: cuit(),
    nroActVendedor: actividad(),
    nroIngBrutoVendedor: ib(),
    actuaCorredor: opt(siNo()),
    liquidaCorredor: siNo(),
    cuitCorredor: opt(cuit()),
    nroIngBrutoCorredor: opt(ib()),
    fechaPrecioOperacion: date(),
    precioRefTn: precioRefTn(),
    precioOperacion: importe17_3(),
    alicIvaOperacion: opt(alicuota()),
    campaniaPPal: campania(),
    codLocalidad: codLocalidad(),
    codProvincia: codProvincia(),
    deduccion: opt(list(obj(LSG_DEDUCCION), 0)),
    percepcion: opt(list(obj(LSG_PERCEPCION), 0)),
    opcionales: OPCIONALES,
    datosAdicionales: opt(datosAdicionales()),
  }),
  facturaPapel: opt(
    obj({
      nroCAI: int(0, 99999999999999, true),
      nroFacturaPapel: int(0, 999999999999, true),
      fechaFactura: date(),
      tipoComprobante: str({ values: ['1', '34', '51', '63', '39'] }),
    }),
  ),
};

/** LsgAjusteBaseReqType */
const LSG_AJUSTE: Schema = {
  conceptoIva0: opt(conceptoImporte()),
  importeAjustar0: opt(importe13_2()),
  conceptoIva10: opt(conceptoImporte()),
  importeAjustar10: opt(importe13_2()),
  conceptoIva21: opt(conceptoImporte()),
  importeAjustar21: opt(importe13_2()),
  percepcion: opt(list(obj(LSG_PERCEPCION), 0)),
  datosAdicionales: opt(datosAdicionales()),
};

/** Punto de emisión, número de orden y lugar de un ajuste de liquidación secundaria. */
const LSG_AJUSTE_ORDEN: Schema = {
  ptoEmision: ptoEmision(),
  nroOrden: nroOrden(),
  codLocalidad: codLocalidad(),
  codProvincia: codProvincia(),
};

const LSG_AJUSTES: Schema = { ajusteCredito: opt(obj(LSG_AJUSTE)), ajusteDebito: opt(obj(LSG_AJUSTE)) };

/** LsgAjustarXCoeReqType (sin `auth`) */
export const LSG_AJUSTAR_X_COE: Schema = { coe: id(), ...LSG_AJUSTE_ORDEN, ...LSG_AJUSTES, fusion: opt(obj(FUSION)) };

/** LsgAjustarXContratoReqType (sin `auth`) */
export const LSG_AJUSTAR_X_CONTRATO: Schema = {
  nroContrato: numeroContrato(),
  ...LSG_AJUSTE_ORDEN,
  cuitComprador: cuit(),
  cuitVendedor: cuit(),
  cuitCorredor: opt(cuit0()),
  codGrano: codGrano(),
  ...LSG_AJUSTES,
};

const tipoCertificado = () => str({ values: ['P', 'R', 'T', 'E'] }); // CgTipoCertificadoType

/** CgBuscarCtgReqType (sin `auth`) */
export const CG_BUSCAR_CTG: Schema = {
  tipoCertificado: tipoCertificado(),
  cuitDepositante: cuit(),
  nroPlanta: opt(int(0, 999999, true)),
  codGrano: codGrano(),
  campania: campania(),
  nroCtg: opt(id()),
  tipoCtg: opt(str({ values: ['CTG', 'FC', 'CPE'] })),
  nroCartaPorte: opt(str()),
  fechaConfirmacionCtgDes: opt(date()),
  fechaConfirmacionCtgHas: opt(date()),
};

/** CgBuscarCertConSaldoDisponibleReqType (sin `auth`) */
export const CG_BUSCAR_CERT_SALDO: Schema = {
  cuitDepositante: cuit(),
  codGrano: codGrano(),
  campania: campania(),
  coe: opt(id()),
  fechaEmisionDes: opt(date()),
  fechaEmisionHas: opt(date()),
};

// --- Certificación de granos (cgAutorizar) ---------------------------------

const MERMAS: Schema = {
  porcentajeSecadoHumedad: porcentaje(),
  importeSecado: zImporte8_2(),
  pesoNetoMermaSecado: zImporte8_2(),
  tarifaSecado: zImporte8_2(),
  importeZarandeo: zImporte8_2(),
  pesoNetoMermaZarandeo: zImporte8_2(),
  tarifaZarandeo: zImporte8_2(),
};

/** CgCalidadType */
const CALIDAD_CG: Schema = {
  analisisMuestra: int(0, 9999999999, true),
  nroBoletin: int(0, 9999999999, true),
  codGrado: opt(gradoCodigo()),
  valorGrado: opt(dec(2, 0, 1.99, true)),
  valorContProteico: dec(2, 0, 999.99),
  valorFactor: opt(factor()),
  detalleMuestraAnalisis: opt(
    list(
      obj({
        descripcionRubro: str({ minLen: 0, maxLen: 400 }),
        tipoRubro: str({ values: ['B', 'R'] }),
        porcentaje: porcentaje(),
        valor: dec(2, 0, 999.99),
      }),
      0,
    ),
  ),
};

/** CgInformarCalidadReqType (sin `auth`) */
export const CG_INFORMAR_CALIDAD: Schema = { coe: id(), calidad: obj(CALIDAD_CG) };

/** CgAutorizarReqType (sin `auth`) */
export const CG_AUTORIZAR: Schema = {
  cabecera: obj({
    tipoCertificado: tipoCertificado(),
    ptoEmision: ptoEmision(),
    nroOrden: nroOrden(),
    nroIngBrutoDepositario: ib(),
    titularGrano: str({ values: ['P', 'T'] }),
    cuitDepositante: opt(cuit()),
    nroIngBrutoDepositante: opt(ib()),
    codGrano: codGrano(),
    campania: campania(),
    cuitCorredor: opt(cuit0()),
    datosAdicionales: opt(datosAdicionales()),
  }),
  primaria: opt(
    obj({
      nroActDepositario: actividad(),
      ctg: opt(
        list(
          obj({
            nroCTG: id(),
            nroCartaDePorte: str(),
            pesoNetoConfirmadoDefinitivo: zImporte8_2(),
            ...MERMAS,
          }),
          0,
        ),
      ),
      cartaPorteFerroviaria: opt(
        list(
          obj({
            nroCartaPorte: int(0, 999999999, true),
            pesoNetoConfirmadoDefinitivo: zImporte8_2(),
            ...MERMAS,
          }),
          0,
        ),
      ),
      descripcionTipoGrano: str({ minLen: 0, maxLen: 20 }),
      montoAlmacenaje: zImporte8_2(),
      montoAcarreo: zImporte8_2(),
      montoGastosGenerales: zImporte8_2(),
      montoZarandeo: zImporte8_2(),
      porcentajeSecadoDe: porcentaje(),
      porcentajeSecadoA: porcentaje(),
      montoSecado: zImporte8_2(),
      montoPorCadaPuntoExceso: zImporte8_2(),
      montoOtros: zImporte8_2(),
      calidad: opt(obj(CALIDAD_CG)),
      pesoNetoMermaVolatil: zImporte8_2(),
      serviciosFormaDePago: opt(str({ minLen: 0, maxLen: 20 })),
      serviciosOtros: opt(zImporte8_2()),
      serviciosConceptosNoGravados: opt(zImporte8_2()),
      serviciosPercepcionesIVA: opt(zImporte8_2()),
      serviciosOtrasPercepciones: opt(zImporte8_2()),
    }),
  ),
  retiroTransferencia: opt(
    obj({
      certificadoDeposito: obj({ coeCertificadoDeposito: id(), pesoNeto: pesoNeto() }),
      nroActDepositario: actividad(),
      cuitReceptor: opt(cuit()),
      nroCartaPorteAUtilizar: opt(str()),
      nroCTG: opt(id()),
      descripcionCausaJudicial: opt(str({ minLen: 0, maxLen: 400 })),
    }),
  ),
  preexistente: opt(
    obj({
      nroPlanta: int(0, 999999, true),
      tipoCertificadoDepositoPreexistente: int(0, 9, true),
      nroCertificadoDepositoPreexistente: int(0, 999999999999, true),
      cacCertificadoDepositoPreexistente: int(0, 99999999999999, true),
      fechaEmisionCertificadoDepositoPreexistente: date(),
      pesoNeto: dec(3, 0, 99999999.999, true),
    }),
  ),
  preexistenteFusion: opt(
    obj({
      nroPlanta: int(0, 999999, true),
      nroCertificadoDepositoPreexistente: int(0, 999999999999, true),
      fechaEmisionCertificadoDepositoPreexistente: date(),
      pesoNeto: dec(3, 0, 99999999.999),
    }),
  ),
};

// ---------------------------------------------------------------------------
// Respuestas
// ---------------------------------------------------------------------------

/** LpgCodigoDescripcionType */
export const R_CODIGO_DESCRIPCION: Schema = { codigo: must(str()), descripcion: must(str()) };

/** `eventos.evento[]` (LpgArrEventoType) */
export const R_EVENTOS: Schema = { eventos: wrapped('evento', obj(R_CODIGO_DESCRIPCION), 0) };

const R_DEDUCCION: Schema = {
  codigoConcepto: str(),
  detalleAclaratorio: str(),
  diasAlmacenaje: int(),
  precioPKGdiario: dec(8),
  comisionGastosAdm: dec(2),
  baseCalculo: dec(8),
  alicuotaIva: dec(4),
};

const R_RETENCION: Schema = {
  codigoConcepto: str(),
  detalleAclaratorio: str(),
  baseCalculo: dec(11),
  alicuota: dec(4),
  nroCertificadoRetencion: int(),
  fechaCertificadoRetencion: date(),
  importeCertificadoRetencion: dec(2),
};

const R_DEDUCCIONES = wrapped(
  'deduccionReturn',
  obj({ deduccion: opt(obj(R_DEDUCCION)), importeIva: dec(2), importeDeduccion: dec(2) }),
  0,
);
const R_RETENCIONES = wrapped(
  'retencionReturn',
  obj({ retencion: opt(obj(R_RETENCION)), importeRetencion: dec(2) }),
  0,
);

/** LpgLiquidacionRespType */
export const R_LIQUIDACION_AUTORIZADA: Schema = {
  ptoEmision: int(),
  nroOrden: int(),
  codTipoOperacion: str(),
  codTipoAjuste: str(),
  nroOpComercial: int(),
  fechaLiquidacion: date(),
  precioOperacion: dec(3),
  subTotal: dec(2),
  importeIva: dec(2),
  operacionConIva: dec(2),
  totalPesoNeto: int(),
  percepciones: wrapped(
    'percepcion',
    obj({ descripcion: str(), baseCalculo: dec(2), alicuota: dec(4), importeFinal: dec(2) }),
    0,
  ),
  totalPercepcion: dec(2),
  deducciones: R_DEDUCCIONES,
  totalDeduccion: dec(2),
  retenciones: R_RETENCIONES,
  totalRetencion: dec(2),
  totalRetencionAfip: dec(2),
  totalOtrasRetenciones: dec(2),
  totalNetoAPagar: dec(2),
  totalIvaRg4310_18: dec(2),
  totalPagoSegunCondicion: dec(2),
  coe: id(),
  coeAjustado: id(),
  numeroContrato: int(),
  estado: str(),
};

const R_CERTIFICADO: Schema = {
  tipoCertificadoDeposito: str(),
  nroCertificadoDeposito: int(),
  pesoNeto: int(),
  pesoNetoTotalCertificado: int(),
  codLocalidadProcedencia: int(),
  codProvProcedencia: int(),
  campania: int(),
  fechaCierre: date(),
};

/** LpgLiquidacionBaseType (respuesta de las consultas) */
export const R_LIQUIDACION_BASE: Schema = {
  ptoEmision: int(),
  nroOrden: int(),
  numeroContrato: int(),
  cuitComprador: cuit(),
  nroActComprador: int(),
  nroIngBrutoComprador: int(),
  codTipoOperacion: str(),
  esLiquidacionPropia: str(),
  esCanje: str(),
  codPuerto: int(),
  desPuertoLocalidad: str(),
  codGrano: int(),
  pesoNetoSinCertificado: int(),
  codLocalidadProcedenciaSinCertificado: int(),
  codProvProcedenciaSinCertificado: int(),
  cuitVendedor: cuit(),
  nroIngBrutoVendedor: int(),
  actuaCorredor: str(),
  liquidaCorredor: str(),
  cuitCorredor: cuit(),
  comisionCorredor: dec(2),
  nroIngBrutoCorredor: int(),
  fechaPrecioOperacion: date(),
  precioRefTn: dec(3),
  codGradoRef: str(),
  codGradoEnt: str(),
  valGradoEnt: dec(8),
  factorEnt: dec(8),
  precioFleteTn: dec(2),
  contProteico: dec(3),
  alicIvaOperacion: dec(4),
  campaniaPPal: int(),
  codLocalidadProcedencia: int(),
  codProvProcedencia: int(),
  datosAdicionales: str(),
  certificados: wrapped('certificado', obj(R_CERTIFICADO), 0),
  opcionales: wrapped('opcional', obj(R_CODIGO_DESCRIPCION), 0),
};

/** LpgLiqReturnType */
export const R_LIQ_RETURN: Schema = {
  autorizacion: opt(obj(R_LIQUIDACION_AUTORIZADA)),
  ...R_EVENTOS,
};

/** LpgLiqConsReturnType */
export const R_LIQ_CONS_RETURN: Schema = {
  liquidacion: opt(obj(R_LIQUIDACION_BASE)),
  autorizacion: opt(obj(R_LIQUIDACION_AUTORIZADA)),
  pdf: opt(base64()),
  ...R_EVENTOS,
};

/** LpgLiqUltNroOrdenReturnType */
export const R_ULT_NRO_ORDEN: Schema = { nroOrden: must(int()), ...R_EVENTOS };

/** LpgImportesNetoAjustadoType */
const R_IMPORTE_AJUSTADO: Schema = { importe: dec(2), concepto: str(), alicuota: dec(4), ivaCalculado: dec(2) };

const R_AJUSTE_CRED_DEB: Schema = {
  nroOpComercial: int(),
  fechaLiquidacion: date(),
  precioOperacion: dec(3),
  subTotal: dec(2),
  importeIva: dec(2),
  operacionConIva: dec(2),
  totalPesoNeto: int(),
  importes: wrapped('importeReturn', obj(R_IMPORTE_AJUSTADO), 0),
  deducciones: R_DEDUCCIONES,
  totalDeduccion: dec(2),
  retenciones: R_RETENCIONES,
  totalRetencion: dec(2),
  totalRetencionAfip: dec(2),
  totalOtrasRetenciones: dec(2),
  totalNetoAPagar: dec(2),
  totalIvaRg4310_18: dec(2),
  totalPagoSegunCondicion: dec(2),
};

/** LpgAjusteUnificadoRespType */
const R_AJUSTE_UNIFICADO: Schema = {
  ptoEmision: int(),
  nroOrden: int(),
  nroContrato: int(),
  coeAjustado: id(),
  codTipoOperacion: str(),
  ajusteCredito: opt(obj(R_AJUSTE_CRED_DEB)),
  ajusteDebito: opt(obj(R_AJUSTE_CRED_DEB)),
  totalesUnificados: opt(
    obj({
      subTotalDebCred: dec(2),
      totalBaseDeducciones: dec(2),
      subTotalGeneral: dec(2),
      ivaDeducciones: dec(2),
      iva105: dec(2),
      iva21: dec(2),
      retencionesGanancias: dec(2),
      retencionesIVA: dec(2),
      importeOtrasRetenciones: dec(2),
      importeNeto: dec(2),
      ivaRG4310_18: dec(2),
      pagoSCondicion: dec(2),
    }),
  ),
  coe: id(),
  estado: str(),
};

/** LpgAjusteUnificadoReturnType */
export const R_AJUSTE_UNIFICADO_RETURN: Schema = {
  ajusteUnificado: opt(obj(R_AJUSTE_UNIFICADO)),
  ...R_EVENTOS,
};

/** LpgAjusteContratoReturnType (liquidacionAjustarContrato) */
export const R_AJUSTE_CONTRATO_RETURN: Schema = {
  ajusteContrato: opt(obj(R_AJUSTE_UNIFICADO)),
  ...R_EVENTOS,
};

/** LpgAjusteConsReturnType (ajusteXCoeConsultar, ajusteXNroOrdenConsultar, ajustePorContratoConsultar) */
export const R_AJUSTE_CONS_RETURN: Schema = {
  ajusteUnificado: opt(obj(R_AJUSTE_UNIFICADO)),
  pdf: opt(base64()),
  ...R_EVENTOS,
};

/** LpgLiqPorContratoConsReturnType */
export const R_LIQ_POR_CONTRATO_RETURN: Schema = {
  ...R_EVENTOS,
  coeRelacionados: wrapped('coe', id(), 0),
};

/** LpgGradoEntType */
export const R_GRADO_ENTREGADO: Schema = {
  codigoDescripcion: must(obj(R_CODIGO_DESCRIPCION)),
  valor: must(dec(8)),
};

/** CgAutorizacionType */
const R_CG_AUTORIZACION: Schema = {
  ptoEmision: int(),
  nroOrden: int(),
  coe: id(),
  estado: str(),
  fechaCertificacion: date(),
  pesosResumen: opt(
    obj({
      pesoBrutoCertificado: dec(2),
      pesoMermaVolatil: dec(2),
      pesoMermaSecado: dec(2),
      pesoMermaZarandeo: dec(2),
      pesoNetoCertificado: dec(2),
    }),
  ),
  serviciosResumen: opt(
    obj({
      servicioSecado: dec(2),
      servicioZarandeo: dec(2),
      servicioOtros: dec(2),
      servicioGastosGenerales: dec(2),
      importeIVA: dec(2),
      servicioTotal: dec(2),
    }),
  ),
  planta: opt(obj({ nroPlanta: int(), cuitTitularPlanta: cuit(), razonSocialTitularPlanta: str() })),
};

/** CgAutorizarReturnType */
export const R_CG_AUTORIZAR_RETURN: Schema = {
  autorizacion: opt(obj(R_CG_AUTORIZACION)),
  ...R_EVENTOS,
};

const R_MERMAS: Schema = {
  porcentajeSecadoHumedad: dec(2),
  importeSecado: dec(2),
  pesoNetoMermaSecado: dec(2),
  tarifaSecado: dec(2),
  importeZarandeo: dec(2),
  pesoNetoMermaZarandeo: dec(2),
  tarifaZarandeo: dec(2),
};

/** CgConsultarReturnType (cgConsultarXCoe, cgConsultarXNroOrden) */
export const R_CG_CONSULTAR_RETURN: Schema = {
  autorizacion: opt(obj(R_CG_AUTORIZACION)),
  cabecera: opt(
    obj({
      tipoCertificado: str(),
      ptoEmision: int(),
      nroOrden: int(),
      nroIngBrutoDepositario: int(),
      titularGrano: str(),
      cuitDepositante: cuit(),
      nroIngBrutoDepositante: int(),
      codGrano: int(),
      campania: int(),
      cuitCorredor: int(),
      datosAdicionales: str(),
    }),
  ),
  primaria: opt(
    obj({
      nroActDepositario: int(),
      ctg: list(obj({ nroCTG: id(), nroCartaDePorte: str(), pesoNetoConfirmadoDefinitivo: dec(2), ...R_MERMAS }), 0),
      cartaPorteFerroviaria: list(obj({ nroCartaPorte: int(), pesoNetoConfirmadoDefinitivo: dec(2), ...R_MERMAS }), 0),
      descripcionTipoGrano: str(),
      montoAlmacenaje: dec(2),
      montoAcarreo: dec(2),
      montoGastosGenerales: dec(2),
      montoZarandeo: dec(2),
      porcentajeSecadoDe: dec(2),
      porcentajeSecadoA: dec(2),
      montoSecado: dec(2),
      montoPorCadaPuntoExceso: dec(2),
      montoOtros: dec(2),
      calidad: opt(
        obj({
          analisisMuestra: int(),
          nroBoletin: int(),
          codGrado: str(),
          valorGrado: dec(8),
          valorContProteico: dec(2),
          valorFactor: dec(8),
          detalleMuestraAnalisis: list(
            obj({ descripcionRubro: str(), tipoRubro: str(), porcentaje: dec(2), valor: dec(2) }),
            0,
          ),
        }),
      ),
      pesoNetoMermaVolatil: dec(2),
      serviciosFormaDePago: str(),
      serviciosOtros: dec(2),
      serviciosConceptosNoGravados: dec(2),
      serviciosPercepcionesIVA: dec(2),
      serviciosOtrasPercepciones: dec(2),
    }),
  ),
  retiroTransferencia: opt(
    obj({
      certificadoDeposito: opt(obj({ coeCertificadoDeposito: id(), pesoNeto: int() })),
      nroActDepositario: int(),
      cuitReceptor: cuit(),
      nroCartaPorteAUtilizar: str(),
      nroCTG: id(),
      descripcionCausaJudicial: str(),
    }),
  ),
  preexistente: opt(
    obj({
      nroPlanta: int(),
      tipoCertificadoDepositoPreexistente: int(),
      nroCertificadoDepositoPreexistente: int(),
      cacCertificadoDepositoPreexistente: int(),
      fechaEmisionCertificadoDepositoPreexistente: date(),
      pesoNeto: dec(3),
    }),
  ),
  nroPlanta: int(),
  cuitDepositario: cuit(),
  alicuotaIVA: dec(4),
  cuitRemitenteComercial: cuit(),
  codLocalidad: int(),
  codProvincia: int(),
  kilosDisponible: dec(2),
  pdf: opt(base64()),
  ...R_EVENTOS,
};

/** CgBuscarCtgReturnType */
export const R_CG_BUSCAR_CTG_RETURN: Schema = {
  ctg: list(
    obj({
      campania: int(),
      nroPlanta: int(),
      nroCtg: id(),
      tipoCtg: str(),
      nroCartaPorte: str(),
      kilosConfirmados: int(),
      fechaConfirmacionCtg: date(),
      codGrano: int(),
      cuitRemitenteComercial: cuit(),
      cuitLiquida: cuit(),
      cuitCertifica: cuit(),
    }),
    0,
  ),
  ...R_EVENTOS,
};

/** CgBuscarCertConSaldoDisponibleReturnType */
export const R_CG_BUSCAR_CERT_SALDO_RETURN: Schema = {
  certificado: list(
    obj({
      coe: id(),
      tipoCertificado: str(),
      campania: int(),
      cuitDepositante: cuit(),
      cuitDepositario: cuit(),
      nroPlanta: int(),
      kilosDisponibles: int(),
      codGrano: int(),
    }),
    0,
  ),
  ...R_EVENTOS,
};

/** CgSolicitarAnulacionReturnType */
export const R_CG_ANULACION_RETURN: Schema = {
  ...R_EVENTOS,
  estadoCertificado: str(),
  pdf: opt(base64()),
};

// --- Liquidación secundaria (lsg*) ------------------------------------------

/** LsgAutorizacionRespType */
const R_LSG_AUTORIZACION: Schema = {
  ptoEmision: int(),
  nroOrden: int(),
  fechaLiquidacion: date(),
  subTotal: dec(2),
  importeIva: dec(2),
  operacionConIva: dec(2),
  coe: id(),
  totalDeducciones: dec(2),
  totalPercepciones: dec(2),
};

/** LsgReturnType (lsgAutorizar) */
export const R_LSG_AUTORIZAR_RETURN: Schema = {
  autorizacion: opt(obj(R_LSG_AUTORIZACION)),
  ...R_EVENTOS,
};

const R_LSG_DEDUCCION: Schema = { detalleAclaratoria: str(), baseCalculo: dec(2), alicuotaIVA: dec(4) };
const R_LSG_PERCEPCION: Schema = { detalleAclaratoria: str(), baseCalculo: dec(2), alicuota: dec(4) };

/** LsgTotalesUnificadosType */
const R_LSG_TOTALES: Schema = {
  subtotalCredDeb: dec(2),
  subtotalGeneral: dec(2),
  iva105: dec(2),
  iva21: dec(2),
  totalBasePercepciones: dec(2),
  importeNeto: dec(2),
  pagoSegunCondicion: dec(2),
};

/** LsgBaseType */
const R_LSG_BASE: Schema = {
  ptoEmision: int(),
  nroOrden: int(),
  cuitComprador: cuit(),
  nroIngBrutoComprador: int(),
  cuitVendedor: cuit(),
  nroActVendedor: int(),
  nroIngBrutoVendedor: int(),
  actuaCorredor: str(),
  liquidaCorredor: str(),
  cuitCorredor: cuit(),
  nroIngBrutoCorredor: int(),
  codGrano: int(),
  pesoNetoEnTn: dec(3),
  campania: int(),
  fechaPrecioOperacion: date(),
  codPuerto: int(),
  descripcionPuertoLocalidad: str(),
  otraLocalidad: str(),
  precioReferenciaTn: dec(3),
  precioOperacionTn: dec(3),
  alicuotaIvaOperacion: dec(4),
  deduccion: list(obj(R_LSG_DEDUCCION), 0),
  percepcion: list(obj(R_LSG_PERCEPCION), 0),
  totalDeducciones: dec(2),
  // El XSD escribe `todalPercepciones`.
  totalPercepciones: xml('todalPercepciones', dec(2)),
  codProvinciaOperacion: int(),
  codLocalidadOperacion: int(),
  localidadEmision: str(),
  nroContrato: int(),
  facturaPapel: opt(obj({ nroCAI: int(), nroFacturaPapel: int(), fechaFactura: date(), tipoComprobante: str() })),
  estado: str(),
  datosAdicionales: str(),
};

/** LsgResp2Type */
const R_LSG_AUTORIZACION_CONSULTA: Schema = {
  ptoEmision: int(),
  nroOrden: int(),
  fechaLiquidacion: date(),
  precioOperacion: dec(3),
  subtotal: dec(3),
  importeIva: dec(3),
  operacionConIva: dec(3),
  coe: id(),
  coeAjustado: id(),
  datosAdicionales: str(),
};

/** LsgAjusteBaseRespType */
const R_LSG_AJUSTE: Schema = {
  tipoAjuste: str(),
  req: opt(
    obj({
      conceptoIva0: str(),
      importeAjustar0: dec(2),
      conceptoIva10: str(),
      importeAjustar10: dec(2),
      conceptoIva21: str(),
      importeAjustar21: dec(2),
      percepcion: list(obj(R_LSG_PERCEPCION), 0),
      datosAdicionales: str(),
    }),
  ),
  coeAjustado: id(),
  codLocalidad: int(),
  codProvincia: int(),
  totalesUnificados: opt(obj(R_LSG_TOTALES)),
  estado: str(),
};

/**
 * LsgConsultaReturnType (lsgConsultarXCoe, lsgConsultarXNroOrden,
 * lsgAsociarAContrato). Un ajuste con crédito y débito trae dos liquidaciones.
 */
export const R_LSG_CONSULTA_RETURN: Schema = {
  liquidaciones: must(
    list(
      obj({
        liquidacion: opt(obj(R_LSG_BASE)),
        autorizacion: opt(obj(R_LSG_AUTORIZACION_CONSULTA)),
        ajuste: opt(obj(R_LSG_AJUSTE)),
      }),
      0,
    ),
  ),
  pdf: opt(base64()),
  ...R_EVENTOS,
};

/** LsgAjusteCredDebRespType */
const R_LSG_AJUSTE_CRED_DEB: Schema = {
  nroOpComercial: int(),
  fechaLiquidacion: date(),
  precioOperacion: dec(3),
  subTotal: dec(2),
  importeIVA: dec(2),
  totalPesoNeto: int(),
  importe: list(obj(R_IMPORTE_AJUSTADO), 0),
  percepcion: list(obj(R_LSG_PERCEPCION), 0),
  totalPercepcion: dec(2),
  totalNetoAPagar: dec(2),
  totalPagoSegunCondicion: dec(2),
};

/** LsgAjustarXCoeContratoReturnType (lsgAjustarXCoe, lsgAjustarXContrato): `eventos` va primero */
export const R_LSG_AJUSTE_RETURN: Schema = {
  ...R_EVENTOS,
  ptoEmision: int(),
  nroOrden: int(),
  nroContrato: int(),
  coeAjustado: id(),
  coe: id(),
  ajusteCredito: opt(obj(R_LSG_AJUSTE_CRED_DEB)),
  ajusteDebito: opt(obj(R_LSG_AJUSTE_CRED_DEB)),
  totalesUnificados: opt(obj(R_LSG_TOTALES)),
  estado: str(),
};
