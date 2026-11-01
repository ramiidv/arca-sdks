/**
 * Tipos de WSLPG (Liquidación Primaria de Granos), fieles al XSD del WSDL
 * oficial. Los contenedores con ítems repetidos del XSD (`certificados/certificado`,
 * `deducciones/deduccion`, `eventos/evento`, ...) se exponen como arrays.
 */
import type { CodigoDescripcion, CuitInput, FechaInput } from './types.js';

export type SiNo = 'S' | 'N';

// ============================================================
// Requests
// ============================================================

/** `LpgCertType`: certificado de depósito. */
export interface CertificadoDepositoLpg {
  tipoCertificadoDeposito: string;
  nroCertificadoDeposito: number;
  pesoNeto: number;
  pesoNetoTotalCertificado?: number;
  codLocalidadProcedencia: number;
  codProvProcedencia: number;
  campania: number;
  fechaCierre: FechaInput;
}

/** `LpgLiquidacionBaseType`. */
export interface LiquidacionLpg {
  /** Punto de emisión (1-9999). */
  ptoEmision: number;
  nroOrden: number;
  numeroContrato?: number;
  cuitComprador: CuitInput;
  nroActComprador: number;
  nroIngBrutoComprador: number;
  codTipoOperacion: string;
  esLiquidacionPropia?: SiNo;
  /** `P`, `T` o `N`. */
  esCanje?: 'P' | 'T' | 'N';
  codPuerto: number;
  desPuertoLocalidad?: string;
  codGrano: number;
  pesoNetoSinCertificado?: number;
  codLocalidadProcedenciaSinCertificado?: number;
  codProvProcedenciaSinCertificado?: number;
  cuitVendedor: CuitInput;
  nroIngBrutoVendedor: number;
  actuaCorredor?: SiNo;
  liquidaCorredor: SiNo;
  cuitCorredor?: CuitInput;
  /** Porcentaje (hasta 99.99). */
  comisionCorredor?: number;
  nroIngBrutoCorredor?: number;
  fechaPrecioOperacion: FechaInput;
  /** Precio de referencia por tonelada (3 decimales). */
  precioRefTn: number;
  codGradoRef?: string;
  codGradoEnt?: string;
  /** Valor del grado entregado (8 decimales, > 0 y <= 1.99999999). */
  valGradoEnt?: number;
  factorEnt?: number;
  /** Precio del flete por tonelada (2 decimales). */
  precioFleteTn: number;
  contProteico?: number;
  /** Alícuota de IVA de la operación (4 decimales, 0-100). */
  alicIvaOperacion?: number;
  /** Campaña principal (ej: 2526). */
  campaniaPPal: number;
  codLocalidadProcedencia: number;
  codProvProcedencia: number;
  datosAdicionales?: string;
  certificados?: CertificadoDepositoLpg[];
  opcionales?: CodigoDescripcion[];
}

/** `LpgDeduccionType`. */
export interface DeduccionLpg {
  codigoConcepto: string;
  detalleAclaratorio?: string;
  diasAlmacenaje?: number;
  precioPKGdiario?: number;
  comisionGastosAdm?: number;
  baseCalculo?: number;
  alicuotaIva: number;
}

/** `LpgRetencionType`. */
export interface RetencionLpg {
  codigoConcepto: string;
  detalleAclaratorio?: string;
  baseCalculo?: number;
  alicuota: number;
  nroCertificadoRetencion?: number;
  fechaCertificadoRetencion?: FechaInput;
  importeCertificadoRetencion?: number;
}

/** `LpgPercepcionType`. */
export interface PercepcionLpg {
  descripcion: string;
  importeFinal: number;
}

/** `liquidacionReq` sin `auth`: `liquidacion` y sus hermanos `deducciones`, `retenciones`, `percepciones`. */
export interface LiquidacionAutorizarParams {
  liquidacion: LiquidacionLpg;
  deducciones?: DeduccionLpg[];
  retenciones?: RetencionLpg[];
  percepciones?: PercepcionLpg[];
}

/** `LpgAjusteCreditoType` / `LpgAjusteDebitoType`. */
export interface AjusteCreditoDebitoLpg {
  certificados?: Array<{ coe: string | number; pesoAjustado: number }>;
  diferenciaPesoNeto: number;
  diferenciaPrecioOperacion: number;
  codGrado?: string;
  valGrado?: number;
  factor?: number;
  diferenciaPrecioFleteTn: number;
  datosAdicionales?: string;
  opcionales?: CodigoDescripcion[];
  conceptoImporteIva0?: string;
  importeAjustarIva0?: number;
  conceptoImporteIva105?: string;
  importeAjustarIva105?: number;
  conceptoImporteIva21?: string;
  importeAjustarIva21?: number;
  deducciones?: DeduccionLpg[];
  retenciones?: RetencionLpg[];
}

/** `ajustarUnificadoReq` sin `auth`. */
export interface AjusteUnificadoParams {
  ajusteBase: {
    ptoEmision: number;
    nroOrden: number;
    /** COE de la liquidación que se ajusta. */
    coeAjustado: string | number;
    certificados?: CertificadoDepositoLpg[];
    codLocalidad: number;
    codProv: number;
    fusion?: { nroIngBrutos: number; nroActividad: number };
  };
  ajusteCredito?: AjusteCreditoDebitoLpg;
  ajusteDebito?: AjusteCreditoDebitoLpg;
}

/** Mermas de un CTG / carta de porte ferroviaria en `cgAutorizar`. */
export interface MermasCg {
  porcentajeSecadoHumedad: number;
  importeSecado: number;
  pesoNetoMermaSecado: number;
  tarifaSecado: number;
  importeZarandeo: number;
  pesoNetoMermaZarandeo: number;
  tarifaZarandeo: number;
}

/** `cgAutorizarReq` sin `auth` (`CgAutorizarReqType`). */
export interface CgAutorizarParams {
  cabecera: {
    /** `P` primaria, `R` retiro, `T` transferencia, `E` preexistente. */
    tipoCertificado: 'P' | 'R' | 'T' | 'E';
    ptoEmision: number;
    nroOrden: number;
    nroIngBrutoDepositario: number;
    /** `P` propio, `T` tercero. */
    titularGrano: 'P' | 'T';
    cuitDepositante?: CuitInput;
    nroIngBrutoDepositante?: number;
    codGrano: number;
    campania: number;
    cuitCorredor?: CuitInput;
    datosAdicionales?: string;
  };
  primaria?: {
    nroActDepositario: number;
    ctg?: Array<{ nroCTG: string | number; nroCartaDePorte: string; pesoNetoConfirmadoDefinitivo: number } & MermasCg>;
    cartaPorteFerroviaria?: Array<{ nroCartaPorte: number; pesoNetoConfirmadoDefinitivo: number } & MermasCg>;
    descripcionTipoGrano: string;
    montoAlmacenaje: number;
    montoAcarreo: number;
    montoGastosGenerales: number;
    montoZarandeo: number;
    porcentajeSecadoDe: number;
    porcentajeSecadoA: number;
    montoSecado: number;
    montoPorCadaPuntoExceso: number;
    montoOtros: number;
    calidad?: {
      analisisMuestra: number;
      nroBoletin: number;
      codGrado?: string;
      valorGrado?: number;
      valorContProteico: number;
      valorFactor?: number;
      detalleMuestraAnalisis?: Array<{
        descripcionRubro: string;
        /** `B` bonificación, `R` rebaja. */
        tipoRubro: 'B' | 'R';
        porcentaje: number;
        valor: number;
      }>;
    };
    pesoNetoMermaVolatil: number;
    serviciosFormaDePago?: string;
    serviciosOtros?: number;
    serviciosConceptosNoGravados?: number;
    serviciosPercepcionesIVA?: number;
    serviciosOtrasPercepciones?: number;
  };
  retiroTransferencia?: {
    certificadoDeposito: { coeCertificadoDeposito: string | number; pesoNeto: number };
    nroActDepositario: number;
    cuitReceptor?: CuitInput;
    nroCartaPorteAUtilizar?: string;
    nroCTG?: string | number;
    descripcionCausaJudicial?: string;
  };
  preexistente?: {
    nroPlanta: number;
    tipoCertificadoDepositoPreexistente: number;
    nroCertificadoDepositoPreexistente: number;
    cacCertificadoDepositoPreexistente: number;
    fechaEmisionCertificadoDepositoPreexistente: FechaInput;
    pesoNeto: number;
  };
  preexistenteFusion?: {
    nroPlanta: number;
    nroCertificadoDepositoPreexistente: number;
    fechaEmisionCertificadoDepositoPreexistente: FechaInput;
    pesoNeto: number;
  };
}

// ============================================================
// Respuestas
// ============================================================

/** `LpgDeduccionReturnType`. */
export interface DeduccionLiquidadaLpg {
  deduccion?: {
    codigoConcepto?: string;
    detalleAclaratorio?: string;
    diasAlmacenaje?: number;
    precioPKGdiario?: number;
    comisionGastosAdm?: number;
    baseCalculo?: number;
    alicuotaIva?: number;
  };
  importeIva?: number;
  importeDeduccion?: number;
}

/** `LpgRetencionReturnType`. */
export interface RetencionLiquidadaLpg {
  retencion?: {
    codigoConcepto?: string;
    detalleAclaratorio?: string;
    baseCalculo?: number;
    alicuota?: number;
    nroCertificadoRetencion?: number;
    fechaCertificadoRetencion?: string;
    importeCertificadoRetencion?: number;
  };
  importeRetencion?: number;
}

/** `LpgLiquidacionRespType`: datos de la liquidación autorizada. `coe` siempre presente. */
export interface LiquidacionAutorizadaLpg {
  ptoEmision?: number;
  nroOrden?: number;
  codTipoOperacion?: string;
  codTipoAjuste?: string;
  nroOpComercial?: number;
  fechaLiquidacion?: string;
  precioOperacion?: number;
  subTotal?: number;
  importeIva?: number;
  operacionConIva?: number;
  totalPesoNeto?: number;
  percepciones: Array<{ descripcion?: string; baseCalculo?: number; alicuota?: number; importeFinal?: number }>;
  totalPercepcion?: number;
  deducciones: DeduccionLiquidadaLpg[];
  totalDeduccion?: number;
  retenciones: RetencionLiquidadaLpg[];
  totalRetencion?: number;
  totalRetencionAfip?: number;
  totalOtrasRetenciones?: number;
  totalNetoAPagar?: number;
  totalIvaRg4310_18?: number;
  totalPagoSegunCondicion?: number;
  /** Código de Operación Electrónico (como string). */
  coe: string;
  coeAjustado?: string;
  numeroContrato?: number;
  estado?: string;
}

/** Resultado de `liquidacionAutorizar` (`LpgLiqReturnType`). */
export interface LiquidacionResultado {
  autorizacion: LiquidacionAutorizadaLpg;
  /** Eventos informativos de ARCA (`eventos.evento[]`). */
  eventos: CodigoDescripcion[];
}

/** `LpgLiquidacionBaseType` tal como la devuelven las consultas. */
export interface LiquidacionConsultadaLpg {
  ptoEmision?: number;
  nroOrden?: number;
  numeroContrato?: number;
  cuitComprador?: number;
  nroActComprador?: number;
  nroIngBrutoComprador?: number;
  codTipoOperacion?: string;
  esLiquidacionPropia?: string;
  esCanje?: string;
  codPuerto?: number;
  desPuertoLocalidad?: string;
  codGrano?: number;
  pesoNetoSinCertificado?: number;
  codLocalidadProcedenciaSinCertificado?: number;
  codProvProcedenciaSinCertificado?: number;
  cuitVendedor?: number;
  nroIngBrutoVendedor?: number;
  actuaCorredor?: string;
  liquidaCorredor?: string;
  cuitCorredor?: number;
  comisionCorredor?: number;
  nroIngBrutoCorredor?: number;
  fechaPrecioOperacion?: string;
  precioRefTn?: number;
  codGradoRef?: string;
  codGradoEnt?: string;
  valGradoEnt?: number;
  factorEnt?: number;
  precioFleteTn?: number;
  contProteico?: number;
  alicIvaOperacion?: number;
  campaniaPPal?: number;
  codLocalidadProcedencia?: number;
  codProvProcedencia?: number;
  datosAdicionales?: string;
  certificados: Array<{
    tipoCertificadoDeposito?: string;
    nroCertificadoDeposito?: number;
    pesoNeto?: number;
    pesoNetoTotalCertificado?: number;
    codLocalidadProcedencia?: number;
    codProvProcedencia?: number;
    campania?: number;
    fechaCierre?: string;
  }>;
  opcionales: CodigoDescripcion[];
}

/** Resultado de `liquidacionXCoeConsultar` / `liquidacionXNroOrdenConsultar` (`LpgLiqConsReturnType`). */
export interface LiquidacionConsultaResultado {
  liquidacion?: LiquidacionConsultadaLpg;
  autorizacion: LiquidacionAutorizadaLpg;
  /** PDF en base64 (si se pidió con `pdf: 'S'`). */
  pdf?: string;
  eventos: CodigoDescripcion[];
}

/** Resultado de `liquidacionAnular` (`LpgAnulacionReturnType`). */
export interface AnulacionLiquidacionResultado {
  coe?: string;
  resultado: string;
  pdf?: string;
  eventos: CodigoDescripcion[];
}

/** `LpgAjusteCreditoRespType` / `LpgAjusteDebitoRespType`. */
export interface AjusteCreditoDebitoResultadoLpg {
  nroOpComercial?: number;
  fechaLiquidacion?: string;
  precioOperacion?: number;
  subTotal?: number;
  importeIva?: number;
  operacionConIva?: number;
  totalPesoNeto?: number;
  importes: Array<{ importe?: number; concepto?: string; alicuota?: number; ivaCalculado?: number }>;
  deducciones: DeduccionLiquidadaLpg[];
  totalDeduccion?: number;
  retenciones: RetencionLiquidadaLpg[];
  totalRetencion?: number;
  totalRetencionAfip?: number;
  totalOtrasRetenciones?: number;
  totalNetoAPagar?: number;
  totalIvaRg4310_18?: number;
  totalPagoSegunCondicion?: number;
}

/** `LpgAjusteUnificadoRespType`. `coe` siempre presente. */
export interface AjusteUnificadoLpg {
  ptoEmision?: number;
  nroOrden?: number;
  nroContrato?: number;
  coeAjustado?: string;
  codTipoOperacion?: string;
  ajusteCredito?: AjusteCreditoDebitoResultadoLpg;
  ajusteDebito?: AjusteCreditoDebitoResultadoLpg;
  totalesUnificados?: {
    subTotalDebCred?: number;
    totalBaseDeducciones?: number;
    subTotalGeneral?: number;
    ivaDeducciones?: number;
    iva105?: number;
    iva21?: number;
    retencionesGanancias?: number;
    retencionesIVA?: number;
    importeOtrasRetenciones?: number;
    importeNeto?: number;
    ivaRG4310_18?: number;
    pagoSCondicion?: number;
  };
  coe: string;
  estado?: string;
}

/** Resultado de `liquidacionAjustarUnificado`. */
export interface AjusteUnificadoResultado {
  ajusteUnificado: AjusteUnificadoLpg;
  eventos: CodigoDescripcion[];
}

/** `LpgGradoEntType`. */
export interface GradoEntregadoLpg {
  codigoDescripcion: CodigoDescripcion;
  valor: number;
}

/** `CgAutorizacionType`. `coe` siempre presente. */
export interface CertificacionAutorizadaLpg {
  ptoEmision?: number;
  nroOrden?: number;
  coe: string;
  /** `AC`, `PA` o `AN`. */
  estado?: string;
  fechaCertificacion?: string;
  pesosResumen?: {
    pesoBrutoCertificado?: number;
    pesoMermaVolatil?: number;
    pesoMermaSecado?: number;
    pesoMermaZarandeo?: number;
    pesoNetoCertificado?: number;
  };
  serviciosResumen?: {
    servicioSecado?: number;
    servicioZarandeo?: number;
    servicioOtros?: number;
    servicioGastosGenerales?: number;
    importeIVA?: number;
    servicioTotal?: number;
  };
  planta?: { nroPlanta?: number; cuitTitularPlanta?: number; razonSocialTitularPlanta?: string };
}

/** Resultado de `cgAutorizar`. */
export interface CertificacionResultado {
  autorizacion: CertificacionAutorizadaLpg;
  eventos: CodigoDescripcion[];
}

/** Resultado de `cgSolicitarAnulacion` / `cgConfirmarAnulacion` (`CgSolicitarAnulacionReturnType`). */
export interface AnulacionCertificacionResultado {
  /** `AC`, `PA` o `AN`. */
  estadoCertificado: string;
  pdf?: string;
  eventos: CodigoDescripcion[];
}
