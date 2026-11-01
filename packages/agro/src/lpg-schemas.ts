/**
 * Schemas de WSLPG, transcriptos del XSD embebido en el WSDL oficial
 * (https://fwshomo.afip.gov.ar/wslpg/LpgService?wsdl). El orden de las claves
 * es el orden de la `xsd:sequence`.
 *
 * @internal
 */
import { base64, cuit, date, dec, id, int, list, must, obj, opt, str, wrapped } from './schema.js';
import type { Schema } from './schema.js';

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
const importe17_2 = () => dec(2, 0, 99999999999999999.99); // LpgImporte_17_2_Type
const gradoCodigo = () => str({ maxLen: 2 }); // LpgGradoCodigoType
const gradoValor = () => dec(8, 0, 1.99999999, true); // LpgGradoValorType
const factor = () => dec(8, 0, 999.99999999, true); // LpgFactorEntType
const precioRefTn = () => dec(3, 0, 999999999.999); // LpgPrecioRefTnType
const precioFleteTn = () => dec(2, 0, 9999999.99); // LpgPrecioFleteTnType
const datosAdicionales = () => str({ minLen: 0, maxLen: 400 }); // LpgDatosAdicionalesType
const numeroContrato = () => int(0, 999999999999999, true); // LpgNumeroContratoType
const importe12_2 = () => dec(2, 0, 999999999999.98); // LpgImporte12_2Type (maxExclusive 999999999999.99)
const conceptoImporte = () => str({ minLen: 0, maxLen: 200 }); // LpgConceptoImporteType
const zImporte8_2 = () => dec(2, 0, 99999999.99); // NumeroZ_8_2_Type
const porcentaje = () => dec(2, 0, 100); // LpgPorcentajeType

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/** LpgCodigoDescripcionType */
const CODIGO_DESCRIPCION: Schema = { codigo: str(), descripcion: str() };

/** LpgCertType */
const CERTIFICADO: Schema = {
  tipoCertificadoDeposito: str({ maxLen: 3 }),
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
  codTipoOperacion: str({ minLen: 0, maxLen: 2 }),
  esLiquidacionPropia: opt(siNo()),
  esCanje: opt(str({ values: ['P', 'T', 'N'] })),
  codPuerto: int(0, 9999, true),
  desPuertoLocalidad: opt(str({ maxLen: 240 })),
  codGrano: codGrano(),
  pesoNetoSinCertificado: opt(pesoNeto()),
  codLocalidadProcedenciaSinCertificado: opt(codLocalidad()),
  codProvProcedenciaSinCertificado: opt(codProvincia()),
  cuitVendedor: cuit(),
  nroIngBrutoVendedor: ib(),
  actuaCorredor: opt(siNo()),
  liquidaCorredor: siNo(),
  cuitCorredor: opt(cuit()),
  comisionCorredor: opt(dec(2, 0, 99.99)),
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
  opcionales: opt(wrapped('opcional', obj(CODIGO_DESCRIPCION))),
};

/** LpgDeduccionType */
const DEDUCCION: Schema = {
  codigoConcepto: str({ maxLen: 2 }),
  detalleAclaratorio: opt(str({ minLen: 0, maxLen: 50 })),
  diasAlmacenaje: opt(int(0, 9999)),
  precioPKGdiario: opt(dec(8, 0, 999999.99999999)),
  comisionGastosAdm: opt(dec(2, 0, 99.99)),
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

/** LpgLiqReqType (sin `auth`) */
export const LIQUIDACION_AUTORIZAR: Schema = {
  liquidacion: obj(LIQUIDACION_BASE),
  deducciones: opt(wrapped('deduccion', obj(DEDUCCION))),
  retenciones: opt(wrapped('retencion', obj(RETENCION))),
  percepciones: opt(wrapped('percepcion', obj(PERCEPCION))),
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
  datosAdicionales: opt(datosAdicionales()),
  opcionales: opt(wrapped('opcional', obj(CODIGO_DESCRIPCION))),
  conceptoImporteIva0: opt(conceptoImporte()),
  importeAjustarIva0: opt(importe12_2()),
  conceptoImporteIva105: opt(conceptoImporte()),
  importeAjustarIva105: opt(importe12_2()),
  conceptoImporteIva21: opt(conceptoImporte()),
  importeAjustarIva21: opt(importe12_2()),
  deducciones: opt(wrapped('deduccion', obj(DEDUCCION))),
  retenciones: opt(wrapped('retencion', obj(RETENCION))),
};

/** LpgAjusteUnificadoReqType (sin `auth`) */
export const AJUSTE_UNIFICADO: Schema = {
  ajusteBase: obj({
    ptoEmision: ptoEmision(),
    nroOrden: nroOrden(),
    coeAjustado: id(),
    certificados: opt(wrapped('certificado', obj(CERTIFICADO))),
    codLocalidad: codLocalidad(),
    codProv: codProvincia(),
    fusion: opt(obj({ nroIngBrutos: ib(), nroActividad: actividad() })),
  }),
  ajusteCredito: opt(obj(AJUSTE_CREDITO_DEBITO)),
  ajusteDebito: opt(obj(AJUSTE_CREDITO_DEBITO)),
};

/** LpgLiqConsXCoeReqType (sin `auth`): también lo usan cgSolicitarAnulacion y cgConfirmarAnulacion */
export const CONSULTA_X_COE: Schema = { coe: id(), pdf: opt(siNo()) };

/** LpgLiqConsXNroOrdenReqType (sin `auth`) */
export const CONSULTA_X_NRO_ORDEN: Schema = { ptoEmision: ptoEmision(), nroOrden: nroOrden() };

/** LpgLiqUltNroOrdenReqType (sin `auth`) */
export const ULT_NRO_ORDEN: Schema = { ptoEmision: ptoEmision() };

/** LpgAnulacionReqType (sin `auth`) */
export const ANULACION: Schema = { coe: id() };

/** LpgLocalidadReqType: `codProvincia` es `xs:string` */
export const LOCALIDADES: Schema = { codProvincia: str() };

/** LpgTipoOperacionReqType */
export const TIPO_OPERACION: Schema = { nroActLiquida: int(0) };

/** LpgGradoEntReqType */
export const GRADO_ENTREGADO: Schema = { codGrano: codGrano() };

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

/** CgAutorizarReqType (sin `auth`) */
export const CG_AUTORIZAR: Schema = {
  cabecera: obj({
    tipoCertificado: str({ values: ['P', 'R', 'T', 'E'] }),
    ptoEmision: ptoEmision(),
    nroOrden: nroOrden(),
    nroIngBrutoDepositario: ib(),
    titularGrano: str({ values: ['P', 'T'] }),
    cuitDepositante: opt(cuit()),
    nroIngBrutoDepositante: opt(ib()),
    codGrano: codGrano(),
    campania: campania(),
    cuitCorredor: opt(cuit()),
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
      calidad: opt(
        obj({
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
        }),
      ),
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
const R_RETENCIONES = wrapped('retencionReturn', obj({ retencion: opt(obj(R_RETENCION)), importeRetencion: dec(2) }), 0);

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

/** LpgAnulacionReturnType */
export const R_ANULACION_RETURN: Schema = {
  coe: id(),
  resultado: must(str()),
  pdf: opt(base64()),
  ...R_EVENTOS,
};

/** LpgLiqUltNroOrdenReturnType */
export const R_ULT_NRO_ORDEN: Schema = { nroOrden: must(int()), ...R_EVENTOS };

const R_AJUSTE_CRED_DEB: Schema = {
  nroOpComercial: int(),
  fechaLiquidacion: date(),
  precioOperacion: dec(3),
  subTotal: dec(2),
  importeIva: dec(2),
  operacionConIva: dec(2),
  totalPesoNeto: int(),
  importes: wrapped(
    'importeReturn',
    obj({ importe: dec(2), concepto: str(), alicuota: dec(4), ivaCalculado: dec(2) }),
    0,
  ),
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

/** LpgAjusteUnificadoReturnType */
export const R_AJUSTE_UNIFICADO_RETURN: Schema = {
  ajusteUnificado: opt(
    obj({
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
    }),
  ),
  ...R_EVENTOS,
};

/** LpgGradoEntType */
export const R_GRADO_ENTREGADO: Schema = {
  codigoDescripcion: must(obj(R_CODIGO_DESCRIPCION)),
  valor: must(dec(8)),
};

/** CgAutorizarReturnType */
export const R_CG_AUTORIZAR_RETURN: Schema = {
  autorizacion: opt(
    obj({
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
    }),
  ),
  ...R_EVENTOS,
};

/** CgSolicitarAnulacionReturnType */
export const R_CG_ANULACION_RETURN: Schema = {
  ...R_EVENTOS,
  estadoCertificado: must(str()),
  pdf: opt(base64()),
};

/** returnDummyRespType */
export const R_DUMMY: Schema = { appserver: must(str()), authserver: must(str()), dbserver: must(str()) };
