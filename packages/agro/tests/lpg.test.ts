import { describe, it, expect } from 'vitest';
import {
  ArcaAgroResponseError,
  ArcaAgroServiceError,
  ArcaRechazoError,
  ArcaServiceError,
  ArcaSoapError,
  ArcaValidationError,
  ENDPOINTS,
  validateAjusteContrato,
  validateAutorizarAnticipo,
  validateCgAutorizar,
  validateCgInformarCalidad,
  validateLsgAjustarXCoe,
  validateLsgAjustarXContrato,
  validateLsgAutorizar,
} from '../src/index.js';
import type {
  AjusteContratoParams,
  AjusteUnificadoParams,
  AnulacionContraDocumentoParams,
  ArcaAgro,
  AsociarAContratoParams,
  AutorizarAnticipoParams,
  CgAutorizarParams,
  CgInformarCalidadParams,
  LiquidacionAutorizarParams,
  LsgAutorizarParams,
} from '../src/index.js';
import { CUIT, CUIT2, CUIT3, LPG_NS, hang, http503, keys, lpgResp, setup } from './helpers.js';
import { soapFaultResponse } from '@ramiidv/arca-common/testing';

function liquidacion(): LiquidacionAutorizarParams {
  return {
    // Orden distinto al XSD a propósito.
    percepciones: [{ importeFinal: 1500, descripcion: 'Percepción IIBB' }],
    retenciones: [{ alicuota: 2, codigoConcepto: 'RG', baseCalculo: 1000000 }],
    deducciones: [{ alicuotaIva: 21, codigoConcepto: 'CO', comisionGastosAdm: 1.5, detalleAclaratorio: 'Comisión' }],
    liquidacion: {
      ptoEmision: 1,
      nroOrden: 12,
      cuitComprador: CUIT,
      nroActComprador: 40,
      nroIngBrutoComprador: 901234567,
      codTipoOperacion: '1',
      esLiquidacionPropia: 'N',
      esCanje: 'N',
      codPuerto: 14,
      desPuertoLocalidad: 'Rosario',
      codGrano: 31,
      cuitVendedor: CUIT2,
      nroIngBrutoVendedor: 900123,
      actuaCorredor: 'N',
      liquidaCorredor: 'N',
      fechaPrecioOperacion: '2026-10-30',
      precioRefTn: 250000.12345,
      precioFleteTn: 1000,
      alicIvaOperacion: 10.5,
      campaniaPPal: 2526,
      codLocalidadProcedencia: 3,
      codProvProcedencia: 1,
      certificados: [
        {
          tipoCertificadoDeposito: '332',
          nroCertificadoDeposito: 101200604,
          pesoNeto: 30000,
          codLocalidadProcedencia: 3,
          codProvProcedencia: 1,
          campania: 2526,
          fechaCierre: new Date('2026-10-28T15:00:00Z'),
        },
      ],
    },
  };
}

const AUTORIZACION =
  '<autorizacion><ptoEmision>1</ptoEmision><nroOrden>12</nroOrden><codTipoOperacion>1</codTipoOperacion>' +
  '<nroOpComercial>0</nroOpComercial><fechaLiquidacion>2026-11-01</fechaLiquidacion><precioOperacion>250000.123</precioOperacion>' +
  '<subTotal>7500003.69</subTotal><importeIva>787500.39</importeIva><operacionConIva>8287504.08</operacionConIva>' +
  '<totalPesoNeto>30000</totalPesoNeto>' +
  '<deducciones><deduccionReturn><deduccion><codigoConcepto>CO</codigoConcepto><alicuotaIva>21.0000</alicuotaIva></deduccion>' +
  '<importeIva>23625.01</importeIva><importeDeduccion>136125.07</importeDeduccion></deduccionReturn>' +
  '<deduccionReturn><deduccion><codigoConcepto>AL</codigoConcepto><alicuotaIva>10.5</alicuotaIva></deduccion>' +
  '<importeIva>105</importeIva><importeDeduccion>1105</importeDeduccion></deduccionReturn></deducciones>' +
  '<totalDeduccion>137230.07</totalDeduccion>' +
  '<retenciones><retencionReturn><retencion><codigoConcepto>RG</codigoConcepto><alicuota>2</alicuota></retencion>' +
  '<importeRetencion>20000</importeRetencion></retencionReturn></retenciones>' +
  '<totalRetencion>20000</totalRetencion><totalNetoAPagar>8130274.01</totalNetoAPagar>' +
  '<coe>330100012345</coe><estado>AC</estado></autorizacion>';

const EVENTO =
  '<eventos><evento><codigo>1</codigo><descripcion>Liquidación registrada</descripcion></evento></eventos>';

const ERROR_1 =
  '<errores><error><codigo>1105</codigo><descripcion>El número de orden ya fue utilizado.</descripcion></error></errores>';
const ERROR_N =
  '<errores><error><codigo>1105</codigo><descripcion>El número de orden ya fue utilizado.</descripcion></error>' +
  '<error><codigo>1201</codigo><descripcion>CUIT vendedor inválido.</descripcion></error></errores>';
const ERROR_FORMATO =
  '<erroresFormato><error><codigo>CTG01</codigo><descripcion>Campo precioRefTn mal formado</descripcion></error></erroresFormato>';

describe('WSLPG: liquidacionAutorizar', () => {
  it('wrapper liquidacionReq, namespace http, SOAPAction, auth {token,sign,cuit} y orden XSD', async () => {
    const { agro, calls } = setup(() => lpgResp('liquidacionResp', 'liqReturn', AUTORIZACION + EVENTO));
    await agro.lpg.liquidacionAutorizar(liquidacion());
    const c = calls[0];
    expect(c.url).toBe(ENDPOINTS.lpg.testing);
    expect(c.element).toBe('ser:liquidacionReq');
    expect(c.ns).toBe('http://serviciosjava.afip.gob.ar/wslpg/');
    expect(c.ns).toBe(LPG_NS);
    expect(c.soapAction).toBe('"http://serviciosjava.afip.gob.ar/wslpg/liquidacionAutorizar"');
    expect(keys(c.req)).toEqual(['auth', 'liquidacion', 'deducciones', 'retenciones', 'percepciones']);
    expect(keys(c.req.auth)).toEqual(['token', 'sign', 'cuit']);
    expect(c.req.auth.cuit).toBe(CUIT);
    expect(keys(c.req.liquidacion)).toEqual([
      'ptoEmision',
      'nroOrden',
      'cuitComprador',
      'nroActComprador',
      'nroIngBrutoComprador',
      'codTipoOperacion',
      'esLiquidacionPropia',
      'esCanje',
      'codPuerto',
      'desPuertoLocalidad',
      'codGrano',
      'cuitVendedor',
      'nroIngBrutoVendedor',
      'actuaCorredor',
      'liquidaCorredor',
      'fechaPrecioOperacion',
      'precioRefTn',
      'precioFleteTn',
      'alicIvaOperacion',
      'campaniaPPal',
      'codLocalidadProcedencia',
      'codProvProcedencia',
      'certificados',
    ]);
    expect(keys(c.req.liquidacion.certificados.certificado)).toEqual([
      'tipoCertificadoDeposito',
      'nroCertificadoDeposito',
      'pesoNeto',
      'codLocalidadProcedencia',
      'codProvProcedencia',
      'campania',
      'fechaCierre',
    ]);
    expect(keys(c.req.deducciones.deduccion)).toEqual([
      'codigoConcepto',
      'detalleAclaratorio',
      'comisionGastosAdm',
      'alicuotaIva',
    ]);
    expect(keys(c.req.retenciones.retencion)).toEqual(['codigoConcepto', 'baseCalculo', 'alicuota']);
    expect(keys(c.req.percepciones.percepcion)).toEqual(['descripcion', 'importeFinal']);
    expect(c.body).toContain('<precioRefTn>250000.123</precioRefTn>');
    expect(c.body).toContain('<precioFleteTn>1000.00</precioFleteTn>');
    expect(c.body).toContain('<alicIvaOperacion>10.5000</alicIvaOperacion>');
    expect(c.body).toContain('<fechaPrecioOperacion>2026-10-30</fechaPrecioOperacion>');
    expect(c.body).toContain('<fechaCierre>2026-10-28</fechaCierre>');
    expect(c.body).not.toContain('cuitRepresentada');
  });

  it('parsea liqReturn: COE string, deducciones N, retenciones 1, eventos', async () => {
    const { agro } = setup(() => lpgResp('liquidacionResp', 'liqReturn', AUTORIZACION + EVENTO));
    const r = await agro.lpg.liquidacionAutorizar(liquidacion());
    expect(r.autorizacion.coe).toBe('330100012345');
    expect(r.autorizacion.estado).toBe('AC');
    expect(r.autorizacion.codTipoOperacion).toBe('1');
    expect(r.autorizacion.totalNetoAPagar).toBe(8130274.01);
    expect(r.autorizacion.deducciones).toHaveLength(2);
    expect(r.autorizacion.deducciones[0]).toEqual({
      deduccion: { codigoConcepto: 'CO', alicuotaIva: 21 },
      importeIva: 23625.01,
      importeDeduccion: 136125.07,
    });
    expect(r.autorizacion.retenciones).toEqual([
      { retencion: { codigoConcepto: 'RG', alicuota: 2 }, importeRetencion: 20000 },
    ]);
    expect(r.autorizacion.percepciones).toEqual([]);
    expect(r.eventos).toEqual([{ codigo: '1', descripcion: 'Liquidación registrada' }]);
  });

  it('errores 1 y N → ArcaAgroServiceError', async () => {
    const one = setup(() => lpgResp('liquidacionResp', 'liqReturn', ERROR_1));
    const e1 = await one.agro.lpg.liquidacionAutorizar(liquidacion()).catch((e: any) => e);
    expect(e1).toBeInstanceOf(ArcaAgroServiceError);
    expect(e1).toBeInstanceOf(ArcaServiceError);
    expect(e1.service).toBe('WSLPG');
    expect(e1.errors).toEqual([{ code: 1105, msg: 'El número de orden ya fue utilizado.' }]);

    const many = setup(() => lpgResp('liquidacionResp', 'liqReturn', ERROR_N));
    const eN = await many.agro.lpg.liquidacionAutorizar(liquidacion()).catch((e: any) => e);
    expect(eN.errors.map((e: { code: number }) => e.code)).toEqual([1105, 1201]);
  });

  it('erroresFormato también se detectan (código no numérico en rawCode)', async () => {
    const { agro } = setup(() => lpgResp('liquidacionResp', 'liqReturn', ERROR_FORMATO));
    const e = await agro.lpg.liquidacionAutorizar(liquidacion()).catch((err: any) => err);
    expect(e).toBeInstanceOf(ArcaAgroServiceError);
    expect(e.errors).toEqual([{ code: 0, msg: 'Campo precioRefTn mal formado', rawCode: 'CTG01' }]);
  });

  it('sin autorizacion.coe → ArcaAgroResponseError uncertain', async () => {
    const { agro } = setup(() => lpgResp('liquidacionResp', 'liqReturn', EVENTO));
    const e = await agro.lpg.liquidacionAutorizar(liquidacion()).catch((err: any) => err);
    expect(e).toBeInstanceOf(ArcaAgroResponseError);
    expect(e.uncertain).toBe(true);
  });

  it('timeout → 1 fetch, uncertain', async () => {
    const { agro, fetchMock } = setup(hang, { timeout: 30 });
    const e = await agro.lpg.liquidacionAutorizar(liquidacion()).catch((err: any) => err);
    expect(e).toBeInstanceOf(ArcaSoapError);
    expect(e.uncertain).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('SOAP Fault en emisión → uncertain', async () => {
    const { agro, fetchMock } = setup(() => soapFaultResponse('S:Server', 'Error interno'));
    const e = await agro.lpg.liquidacionAutorizar(liquidacion()).catch((err: any) => err);
    expect(e).toBeInstanceOf(ArcaSoapError);
    expect(e.faultString).toBe('Error interno');
    expect(e.uncertain).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('validación: CUIT, NaN, liquidaCorredor inválido, campaña fuera de rango', async () => {
    const { agro, fetchMock } = setup(() => '');
    const p = liquidacion();
    p.liquidacion.cuitVendedor = '30712345670';
    p.liquidacion.precioRefTn = NaN;
    (p.liquidacion as { liquidaCorredor: string }).liquidaCorredor = 'X';
    p.liquidacion.campaniaPPal = 100;
    const e = await agro.lpg.liquidacionAutorizar(p).catch((err: any) => err);
    expect(e).toBeInstanceOf(ArcaValidationError);
    expect(e.details.map((d: { field: string }) => d.field)).toEqual([
      'liquidacion.cuitVendedor',
      'liquidacion.liquidaCorredor',
      'liquidacion.precioRefTn',
      'liquidacion.campaniaPPal',
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('WSLPG: consultas de liquidación', () => {
  const CONS = `<liquidacion><ptoEmision>1</ptoEmision><nroOrden>12</nroOrden><cuitComprador>${CUIT}</cuitComprador><codTipoOperacion>1</codTipoOperacion><liquidaCorredor>N</liquidaCorredor><certificados><certificado><tipoCertificadoDeposito>5</tipoCertificadoDeposito><nroCertificadoDeposito>101200604</nroCertificadoDeposito><pesoNeto>30000</pesoNeto></certificado></certificados></liquidacion>${AUTORIZACION}<pdf>JVBERi0=</pdf>`;

  it('liquidacionXCoeConsultar: liqConsXCoeReq con coe y pdf', async () => {
    const { agro, calls } = setup(() => lpgResp('liqConsXCoeResp', 'liqConsReturn', CONS));
    const r = await agro.lpg.liquidacionXCoeConsultar('330100012345', { pdf: true });
    expect(calls[0].element).toBe('ser:liqConsXCoeReq');
    expect(calls[0].soapAction).toBe(`"${LPG_NS}liquidacionXCoeConsultar"`);
    expect(keys(calls[0].req)).toEqual(['auth', 'coe', 'pdf']);
    expect(calls[0].req.coe).toBe('330100012345');
    expect(calls[0].req.pdf).toBe('S');
    expect(r.autorizacion.coe).toBe('330100012345');
    expect(r.liquidacion?.cuitComprador).toBe(Number(CUIT));
    expect(r.liquidacion?.certificados).toHaveLength(1);
    expect(r.liquidacion?.opcionales).toEqual([]);
    expect(r.pdf).toBe('JVBERi0=');
    expect(r.eventos).toEqual([]);
  });

  it('liquidacionXNroOrdenConsultar', async () => {
    const { agro, calls } = setup(() => lpgResp('liqConsXNroOrdenResp', 'liqConsReturn', CONS));
    const r = await agro.lpg.liquidacionXNroOrdenConsultar(1, 12);
    expect(calls[0].element).toBe('ser:liqConsXNroOrdenReq');
    expect(keys(calls[0].req)).toEqual(['auth', 'ptoEmision', 'nroOrden']);
    expect(r.autorizacion.nroOrden).toBe(12);
  });

  it('consulta con errores → lanza', async () => {
    const { agro } = setup(() => lpgResp('liqConsXNroOrdenResp', 'liqConsReturn', ERROR_1));
    await expect(agro.lpg.liquidacionXNroOrdenConsultar(1, 999)).rejects.toBeInstanceOf(ArcaAgroServiceError);
  });

  it('liquidacionUltimoNroOrdenConsultar devuelve el número; si falta → error', async () => {
    const ok = setup(() => lpgResp('liqUltNroOrdenResp', 'liqUltNroOrdenReturn', '<nroOrden>12</nroOrden>'));
    expect(await ok.agro.lpg.liquidacionUltimoNroOrdenConsultar(1)).toBe(12);
    expect(ok.calls[0].element).toBe('ser:liqUltNroOrdenReq');
    expect(keys(ok.calls[0].req)).toEqual(['auth', 'ptoEmision']);

    const vacio = setup(() => lpgResp('liqUltNroOrdenResp', 'liqUltNroOrdenReturn', ''));
    await expect(vacio.agro.lpg.liquidacionUltimoNroOrdenConsultar(1)).rejects.toBeInstanceOf(ArcaAgroResponseError);
  });

  it('consultas se reintentan ante 503', async () => {
    const { agro, fetchMock } = setup(http503);
    await expect(agro.lpg.liquidacionUltimoNroOrdenConsultar(1)).rejects.toBeInstanceOf(ArcaSoapError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// Emisiones: anular, ajuste, cg*
// ---------------------------------------------------------------------------

const ajuste = (): AjusteUnificadoParams => ({
  ajusteDebito: {
    diferenciaPesoNeto: 0,
    diferenciaPrecioOperacion: 1000,
    diferenciaPrecioFleteTn: 0,
    conceptoImporteIva105: 'Diferencia de precio',
    importeAjustarIva105: 30000,
  },
  ajusteBase: { codProv: 1, codLocalidad: 3, coeAjustado: '330100012345', nroOrden: 13, ptoEmision: 1 },
});

const cg = (): CgAutorizarParams => ({
  cabecera: {
    tipoCertificado: 'R',
    ptoEmision: 1,
    nroOrden: 3,
    nroIngBrutoDepositario: 901234567,
    titularGrano: 'T',
    cuitDepositante: CUIT3,
    codGrano: 23,
    campania: 2526,
  },
  retiroTransferencia: {
    certificadoDeposito: { coeCertificadoDeposito: '330200000001', pesoNeto: 10000 },
    nroActDepositario: 40,
    cuitReceptor: CUIT2,
  },
});

const contraDocumento = (): AnulacionContraDocumentoParams => ({
  // Orden distinto al XSD a propósito.
  anulacionBase: { coeAnular: '330100012345', nroOrden: 14, puntoEmision: 1 },
});

/** Contradocumento: nueva liquidación en estado PA (manual WSLPG §2.4.6.2). */
const CONTRA_DOCUMENTO =
  '<autorizacion><ptoEmision>1</ptoEmision><nroOrden>14</nroOrden><codTipoOperacion>1</codTipoOperacion>' +
  '<coe>330100012399</coe><coeAjustado>330100012345</coeAjustado><estado>PA</estado></autorizacion>';

const ajusteContrato = (): AjusteContratoParams => ({
  ajusteCredito: { conceptoImporteIva105: 'Diferencia', importeAjustarIva105: 1000 },
  ajusteBase: {
    ptoEmision: 1,
    nroOrden: 15,
    nroContrato: 123456,
    actividad: 40,
    codGrano: 23,
    cuitVendedor: CUIT2,
    cuitComprador: CUIT,
    precioRefTn: 250000,
    codGradoEnt: 'G1',
    valGradoEnt: 1,
    precioFleteTn: 0,
    codPuerto: 14,
    desPuertoLocalidad: 'Rosario',
    codLocalidad: 3,
    codProv: 1,
  },
});

const asociar = (): AsociarAContratoParams => ({
  codGrano: 23,
  cuitVendedor: CUIT2,
  cuitComprador: CUIT,
  nroContrato: 123456,
  coe: '330100012345',
});

const anticipo = (): AutorizarAnticipoParams => ({
  anticipo: {
    deducciones: [{ codigoConcepto: 'CO', alicuotaIva: 21 }],
    retenciones: [{ codigoConcepto: 'RG', alicuota: 2 }],
    liquidacion: {
      ptoEmision: 1,
      nroOrden: 16,
      cuitComprador: CUIT,
      nroActComprador: 40,
      nroIngBrutoComprador: 901234567,
      codTipoOperacion: '2',
      codPuerto: 14,
      descPuertoLocalidad: 'Otro puerto',
      codGrano: 1,
      pesoNetoSinCertificado: 560,
      cuitVendedor: CUIT2,
      nroIngBrutoVendedor: 1235,
      liquidaCorredor: 'N',
      fechaPrecioOperacion: '2026-10-30',
      precioRefTn: 567,
      alicIvaOperacion: 10.5,
      campaniaPpal: 2526,
      codLocProcedencia: 32,
      codProvProcedencia: 1,
    },
  },
});

const informarCalidad = (): CgInformarCalidadParams => ({
  coe: '330200000099',
  calidad: { analisisMuestra: 10, nroBoletin: 11, codGrado: 'F1', valorGrado: 1.01, valorContProteico: 20 },
});

const lsg = (): LsgAutorizarParams => ({
  facturaPapel: { nroCAI: 12345678901234, nroFacturaPapel: 1, fechaFactura: '2026-10-30', tipoComprobante: '1' },
  liqSecundariaBase: {
    ptoEmision: 331,
    nroOrden: 49,
    cuitComprador: CUIT,
    nroIngBrutoComprador: 123456789,
    codPuerto: 14,
    desPuertoLocalidad: 'OtroPuerto',
    codGrano: 1,
    cantidadTn: 0.01,
    cuitVendedor: CUIT2,
    nroActVendedor: 45,
    nroIngBrutoVendedor: 12311115,
    actuaCorredor: 'N',
    liquidaCorredor: 'N',
    fechaPrecioOperacion: '2026-10-30',
    precioRefTn: 35.26,
    precioOperacion: 40.5,
    alicIvaOperacion: 21,
    campaniaPPal: 2526,
    codLocalidad: 14,
    codProvincia: 12,
    percepcion: [{ alicuota: 23.1235, baseCalculo: 1000, detalleAclaratoria: 'percepcion 1' }],
    deduccion: [{ alicuotaIVA: 21, baseCalculo: 100, detalleAclaratoria: 'deduccion 1' }],
  },
});

const LSG_AUTORIZACION =
  '<autorizacion><ptoEmision>331</ptoEmision><nroOrden>49</nroOrden><fechaLiquidacion>2015-02-13</fechaLiquidacion>' +
  '<subTotal>0.40</subTotal><importeIva>0.08</importeIva><operacionConIva>0.48</operacionConIva><coe>331000000537</coe>' +
  '<totalDeducciones>231.50</totalDeducciones><totalPercepciones>231.24</totalPercepciones></autorizacion>';

const lsgAjuste = () => ({
  ajusteDebito: { conceptoIva21: 'Diferencia', importeAjustar21: 100 },
  codProvincia: 12,
  codLocalidad: 14,
  nroOrden: 50,
  ptoEmision: 331,
});

/** LsgAjustarXCoeContratoReturnType: `errores`/`eventos` van antes que los datos. */
const LSG_AJUSTE =
  '<ptoEmision>331</ptoEmision><nroOrden>50</nroOrden><coeAjustado>331000000537</coeAjustado><coe>331000000540</coe>' +
  '<ajusteDebito><importe><importe>100</importe><concepto>Diferencia</concepto><alicuota>21</alicuota><ivaCalculado>21</ivaCalculado></importe></ajusteDebito>' +
  '<totalesUnificados><importeNeto>-10.5</importeNeto></totalesUnificados><estado>AC</estado>';

/** LsgConsultaReturnType de un ajuste con crédito y débito: dos liquidaciones. */
const LSG_CONSULTA =
  '<liquidaciones><liquidacion><ptoEmision>331</ptoEmision><nroOrden>49</nroOrden>' +
  `<cuitComprador>${CUIT}</cuitComprador><pesoNetoEnTn>0.010</pesoNetoEnTn><todalPercepciones>231.24</todalPercepciones>` +
  '<deduccion><detalleAclaratoria>deduccion 1</detalleAclaratoria><baseCalculo>100</baseCalculo><alicuotaIVA>21</alicuotaIVA></deduccion>' +
  '<facturaPapel><nroCAI>12345678901234</nroCAI><tipoComprobante>1</tipoComprobante></facturaPapel></liquidacion>' +
  '<autorizacion><coe>331000000537</coe><subtotal>0.405</subtotal></autorizacion></liquidaciones>' +
  '<liquidaciones><ajuste><tipoAjuste>C</tipoAjuste><req><conceptoIva21>Dif</conceptoIva21><importeAjustar21>10</importeAjustar21></req>' +
  '<totalesUnificados><importeNeto>-10.5</importeNeto></totalesUnificados><estado>AC</estado></ajuste></liquidaciones>';

const CG_CONSULTA =
  '<autorizacion><ptoEmision>1</ptoEmision><nroOrden>3</nroOrden><coe>330200000099</coe><estado>AC</estado>' +
  '<fechaCertificacion>2026-11-01</fechaCertificacion></autorizacion>' +
  '<cabecera><tipoCertificado>R</tipoCertificado><ptoEmision>1</ptoEmision><nroOrden>3</nroOrden>' +
  `<cuitDepositante>${CUIT3}</cuitDepositante><codGrano>23</codGrano><campania>2526</campania><cuitCorredor>0</cuitCorredor></cabecera>` +
  '<retiroTransferencia><certificadoDeposito><coeCertificadoDeposito>330200000001</coeCertificadoDeposito>' +
  '<pesoNeto>10000</pesoNeto></certificadoDeposito><nroActDepositario>40</nroActDepositario></retiroTransferencia>' +
  '<kilosDisponible>5000.50</kilosDisponible>';

interface EmisionCase {
  name: string;
  req: string;
  resp: string;
  ret: string;
  ok: string;
  order: string[];
  run: (a: ArcaAgro) => Promise<unknown>;
  check: (r: any) => void;
  /** La respuesta puede no traer el resultado (`estadoCertificado` opcional en el XSD). */
  resultadoOpcional?: true;
  /** Errores junto con el resultado no vuelven incierta la operación. */
  sinDeteccion?: true;
}

const EMISIONES: EmisionCase[] = [
  {
    name: 'liquidacionAjustarUnificado',
    req: 'ajustarUnificadoReq',
    resp: 'ajustarUnificadoResp',
    ret: 'ajusteUnifReturn',
    ok:
      '<ajusteUnificado><ptoEmision>1</ptoEmision><nroOrden>13</nroOrden><coeAjustado>330100012345</coeAjustado>' +
      '<codTipoOperacion>1</codTipoOperacion><ajusteCredito/><ajusteDebito><importes><importeReturn><importe>30000</importe>' +
      '<concepto>Diferencia de precio</concepto><alicuota>10.5</alicuota><ivaCalculado>3150</ivaCalculado></importeReturn></importes>' +
      '</ajusteDebito><totalesUnificados><subTotalDebCred>30000</subTotalDebCred><importeNeto>-1.5</importeNeto></totalesUnificados>' +
      '<coe>330100012346</coe><estado>AC</estado></ajusteUnificado>',
    order: ['auth', 'ajusteBase', 'ajusteDebito'],
    run: (a) => a.lpg.liquidacionAjustarUnificado(ajuste()),
    check: (r) => {
      expect(r.ajusteUnificado.coe).toBe('330100012346');
      expect(r.ajusteUnificado.coeAjustado).toBe('330100012345');
      expect(r.ajusteUnificado.ajusteDebito.importes).toEqual([
        { importe: 30000, concepto: 'Diferencia de precio', alicuota: 10.5, ivaCalculado: 3150 },
      ]);
      expect(r.ajusteUnificado.totalesUnificados.importeNeto).toBe(-1.5);
    },
  },
  {
    name: 'cgAutorizar',
    req: 'cgAutorizarReq',
    resp: 'cgAutorizarResp',
    ret: 'oReturn',
    ok:
      '<autorizacion><ptoEmision>1</ptoEmision><nroOrden>3</nroOrden><coe>330200000099</coe><estado>AC</estado>' +
      `<fechaCertificacion>2026-11-01</fechaCertificacion><planta><nroPlanta>1938</nroPlanta><cuitTitularPlanta>${CUIT}</cuitTitularPlanta></planta></autorizacion>`,
    order: ['auth', 'cabecera', 'retiroTransferencia'],
    run: (a) => a.lpg.cgAutorizar(cg()),
    check: (r) => {
      expect(r.autorizacion.coe).toBe('330200000099');
      expect(r.autorizacion.planta).toEqual({ nroPlanta: 1938, cuitTitularPlanta: Number(CUIT) });
    },
  },
  {
    name: 'cgSolicitarAnulacion',
    req: 'cgSolicitarAnulacionReq',
    resp: 'cgSolicitarAnulacionResp',
    ret: 'oReturn',
    ok: '<estadoCertificado>PA</estadoCertificado>',
    order: ['auth', 'coe'],
    run: (a) => a.lpg.cgSolicitarAnulacion('330200000099'),
    check: (r) => expect(r).toEqual({ estadoCertificado: 'PA', eventos: [] }),
    resultadoOpcional: true,
    sinDeteccion: true,
  },
  {
    name: 'cgConfirmarAnulacion',
    req: 'cgConfirmarAnulacionReq',
    resp: 'cgConfirmarAnulacionResp',
    ret: 'oReturn',
    ok: '<estadoCertificado>AN</estadoCertificado><pdf>JVBE</pdf>',
    order: ['auth', 'coe', 'pdf'],
    run: (a) => a.lpg.cgConfirmarAnulacion('330200000099', { pdf: true }),
    check: (r) => expect(r).toEqual({ estadoCertificado: 'AN', pdf: 'JVBE', eventos: [] }),
    resultadoOpcional: true,
    sinDeteccion: true,
  },
  {
    name: 'lpgAnularContraDocumento',
    req: 'LpgAnularContraDocumentoReq',
    resp: 'LpgAnularContraDocumentoResp',
    ret: 'liqConsReturn',
    ok: CONTRA_DOCUMENTO,
    order: ['auth', 'anulacionBase'],
    run: (a) => a.lpg.lpgAnularContraDocumento(contraDocumento()),
    check: (r) => {
      expect(r.autorizacion.coe).toBe('330100012399');
      expect(r.autorizacion.coeAjustado).toBe('330100012345');
      expect(r.autorizacion.estado).toBe('PA');
    },
  },
  {
    name: 'liquidacionAjustarContrato',
    req: 'ajustarContratoReq',
    resp: 'ajustarContratoResp',
    ret: 'ajusteContratoReturn',
    ok: '<ajusteContrato><ptoEmision>1</ptoEmision><nroOrden>15</nroOrden><nroContrato>123456</nroContrato><codTipoOperacion>1</codTipoOperacion><coe>330100012400</coe><estado>AC</estado></ajusteContrato>',
    order: ['auth', 'ajusteBase', 'ajusteCredito'],
    run: (a) => a.lpg.liquidacionAjustarContrato(ajusteContrato()),
    check: (r) => {
      expect(r.ajusteContrato.coe).toBe('330100012400');
      expect(r.ajusteContrato.nroContrato).toBe(123456);
    },
  },
  {
    name: 'asociarLiquidacionAContrato',
    // Opera sobre un comprobante existente: su COE en la respuesta no indica que se haya procesado.
    sinDeteccion: true,
    req: 'asociarLiqAContratoReq',
    resp: 'asociarLiqAContratoResp',
    ret: 'liquidacion',
    ok: AUTORIZACION,
    order: ['auth', 'coe', 'nroContrato', 'cuitComprador', 'cuitVendedor', 'codGrano'],
    run: (a) => a.lpg.asociarLiquidacionAContrato(asociar()),
    check: (r) => expect(r.autorizacion.coe).toBe('330100012345'),
  },
  {
    name: 'lpgAutorizarAnticipo',
    req: 'LpgAutorizarAnticipoReq',
    resp: 'LpgAutorizarAnticipoResp',
    ret: 'liqReturn',
    ok: AUTORIZACION + EVENTO,
    order: ['auth', 'anticipo'],
    run: (a) => a.lpg.lpgAutorizarAnticipo(anticipo()),
    check: (r) => {
      expect(r.autorizacion.coe).toBe('330100012345');
      expect(r.eventos).toHaveLength(1);
    },
  },
  {
    name: 'lpgCancelarAnticipo',
    req: 'LpgCancelarAnticipoReq',
    resp: 'LpgCancelarAnticipoResp',
    ret: 'liqConsReturn',
    ok: AUTORIZACION,
    order: ['auth', 'coe', 'ptoEmision', 'nroOrden', 'pdf'],
    run: (a) => a.lpg.lpgCancelarAnticipo({ nroOrden: 13, ptoEmision: 1, coe: '330100012300' }),
    check: (r) => expect(r.autorizacion.coe).toBe('330100012345'),
  },
  {
    name: 'cgInformarCalidad',
    // Opera sobre un comprobante existente: su COE en la respuesta no indica que se haya procesado.
    sinDeteccion: true,
    req: 'CgInformarCalidadReq',
    resp: 'CgInformarCalidadResp',
    ret: 'oReturn',
    ok: CG_CONSULTA,
    order: ['auth', 'coe', 'calidad'],
    run: (a) => a.lpg.cgInformarCalidad(informarCalidad()),
    check: (r) => {
      expect(r.autorizacion.coe).toBe('330200000099');
      expect(r.kilosDisponible).toBe(5000.5);
    },
  },
  {
    name: 'lsgAutorizar',
    req: 'lsgAutorizarReq',
    resp: 'lsgAutorizarResp',
    ret: 'oReturn',
    ok: LSG_AUTORIZACION,
    order: ['auth', 'liqSecundariaBase', 'facturaPapel'],
    run: (a) => a.lpg.lsgAutorizar(lsg()),
    check: (r) =>
      expect(r).toEqual({
        autorizacion: {
          ptoEmision: 331,
          nroOrden: 49,
          fechaLiquidacion: '2015-02-13',
          subTotal: 0.4,
          importeIva: 0.08,
          operacionConIva: 0.48,
          coe: '331000000537',
          totalDeducciones: 231.5,
          totalPercepciones: 231.24,
        },
        eventos: [],
      }),
  },
  {
    name: 'lsgAjustarXCoe',
    req: 'lsgAjustarXCoeReq',
    resp: 'lsgAjustarXCoeResp',
    ret: 'oReturn',
    ok: LSG_AJUSTE,
    order: ['auth', 'coe', 'ptoEmision', 'nroOrden', 'codLocalidad', 'codProvincia', 'ajusteDebito'],
    run: (a) => a.lpg.lsgAjustarXCoe({ ...lsgAjuste(), coe: '331000000537' }),
    check: (r) => {
      expect(r.coe).toBe('331000000540');
      expect(r.ajusteDebito.importe).toEqual([
        { importe: 100, concepto: 'Diferencia', alicuota: 21, ivaCalculado: 21 },
      ]);
      expect(r.ajusteDebito.percepcion).toEqual([]);
      expect(r.totalesUnificados).toEqual({ importeNeto: -10.5 });
    },
  },
  {
    name: 'lsgAjustarXContrato',
    req: 'lsgAjustarXContratoReq',
    resp: 'lsgAjustarXContratoResp',
    ret: 'oReturn',
    ok: LSG_AJUSTE,
    order: [
      'auth',
      'nroContrato',
      'ptoEmision',
      'nroOrden',
      'codLocalidad',
      'codProvincia',
      'cuitComprador',
      'cuitVendedor',
      'cuitCorredor',
      'codGrano',
      'ajusteDebito',
    ],
    run: (a) =>
      a.lpg.lsgAjustarXContrato({
        ...lsgAjuste(),
        codGrano: 1,
        cuitCorredor: 0,
        cuitVendedor: CUIT2,
        cuitComprador: CUIT,
        nroContrato: 100001250,
      }),
    check: (r) => expect(r.coe).toBe('331000000540'),
  },
  {
    name: 'lsgAsociarAContrato',
    // Opera sobre un comprobante existente: su COE en la respuesta no indica que se haya procesado.
    sinDeteccion: true,
    req: 'lsgAsociarAContratoReq',
    resp: 'lsgAsociarAContratoResp',
    ret: 'oReturn',
    ok: LSG_CONSULTA,
    order: ['auth', 'coe', 'nroContrato', 'cuitComprador', 'cuitVendedor', 'codGrano'],
    run: (a) => a.lpg.lsgAsociarAContrato({ ...asociar(), coe: '331000000537' }),
    check: (r) => expect(r.liquidaciones[0].autorizacion.coe).toBe('331000000537'),
  },
  {
    name: 'lsgAnularContraDocumento',
    req: 'LsgAnularContraDocumentoReq',
    resp: 'LsgAnularContraDocumentoResp',
    ret: 'liqConsReturn',
    ok: CONTRA_DOCUMENTO,
    order: ['auth', 'anulacionBase'],
    run: (a) => a.lpg.lsgAnularContraDocumento(contraDocumento()),
    check: (r) => expect(r.autorizacion.coe).toBe('330100012399'),
  },
];

describe.each(EMISIONES)('WSLPG $name (emisión)', (c) => {
  const { name, req, resp, ret, ok, order, run, check } = c;
  it('request y respuesta', async () => {
    const { agro, calls } = setup(() => lpgResp(resp, ret, ok));
    check(await run(agro));
    expect(calls[0].element).toBe(`ser:${req}`);
    expect(calls[0].ns).toBe(LPG_NS);
    expect(calls[0].soapAction).toBe(`"${LPG_NS}${name}"`);
    expect(keys(calls[0].req)).toEqual(order);
    expect(keys(calls[0].req.auth)).toEqual(['token', 'sign', 'cuit']);
  });

  it('errores 1 y N lanzan', async () => {
    const one = setup(() => lpgResp(resp, ret, ERROR_1));
    expect(((await run(one.agro).catch((e: any) => e)) as any).errors).toHaveLength(1);
    const many = setup(() => lpgResp(resp, ret, ERROR_N));
    const e: any = await run(many.agro).catch((err: any) => err);
    expect(e).toBeInstanceOf(ArcaAgroServiceError);
    expect(e).toBeInstanceOf(ArcaServiceError);
    // Sin `resultado: 'R'` en WSLPG: los rechazos vienen en `errores` (no son ArcaRechazoError).
    expect(e).not.toBeInstanceOf(ArcaRechazoError);
    expect(e.errors).toHaveLength(2);
  });

  it('503 → 1 fetch, uncertain', async () => {
    const { agro, fetchMock } = setup(http503);
    const e: any = await run(agro).catch((err: any) => err);
    expect(e).toBeInstanceOf(ArcaSoapError);
    expect(e.uncertain).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it(`errores junto con el resultado → ArcaAgroServiceError${c.sinDeteccion ? '' : ' uncertain'}`, async () => {
    const { agro } = setup(() => lpgResp(resp, ret, ok + ERROR_1));
    const e: any = await run(agro).catch((err: any) => err);
    expect(e).toBeInstanceOf(ArcaAgroServiceError);
    expect(e.uncertain).toBe(!c.sinDeteccion);
  });

  it(`sin resultado → ${c.resultadoOpcional ? 'se acepta (resultado opcional en el XSD)' : 'ArcaAgroResponseError uncertain'}`, async () => {
    const { agro } = setup(() => lpgResp(resp, ret, EVENTO));
    const r: any = await run(agro).catch((err: any) => err);
    if (c.resultadoOpcional) {
      expect(r).not.toBeInstanceOf(Error);
    } else {
      expect(r).toBeInstanceOf(ArcaAgroResponseError);
      expect(r.uncertain).toBe(true);
    }
  });
});

describe('WSLPG: ajuste y certificación, detalles', () => {
  it('ajuste: orden XSD de ajusteBase y ajusteDebito', async () => {
    const { agro, calls } = setup(() =>
      lpgResp('ajustarUnificadoResp', 'ajusteUnifReturn', '<ajusteUnificado><coe>1</coe></ajusteUnificado>'),
    );
    await agro.lpg.liquidacionAjustarUnificado(ajuste());
    expect(keys(calls[0].req.ajusteBase)).toEqual(['ptoEmision', 'nroOrden', 'coeAjustado', 'codLocalidad', 'codProv']);
    expect(keys(calls[0].req.ajusteDebito)).toEqual([
      'diferenciaPesoNeto',
      'diferenciaPrecioOperacion',
      'diferenciaPrecioFleteTn',
      'conceptoImporteIva105',
      'importeAjustarIva105',
    ]);
  });

  it('ajuste sin crédito ni débito → validación', async () => {
    const { agro, fetchMock } = setup(() => '');
    const p = ajuste();
    delete p.ajusteDebito;
    await expect(agro.lpg.liquidacionAjustarUnificado(p)).rejects.toBeInstanceOf(ArcaValidationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cgAutorizar: orden XSD de cabecera', async () => {
    const { agro, calls } = setup(() =>
      lpgResp('cgAutorizarResp', 'oReturn', '<autorizacion><coe>1</coe></autorizacion>'),
    );
    await agro.lpg.cgAutorizar(cg());
    expect(keys(calls[0].req.cabecera)).toEqual([
      'tipoCertificado',
      'ptoEmision',
      'nroOrden',
      'nroIngBrutoDepositario',
      'titularGrano',
      'cuitDepositante',
      'codGrano',
      'campania',
    ]);
    expect(keys(calls[0].req.retiroTransferencia)).toEqual([
      'certificadoDeposito',
      'nroActDepositario',
      'cuitReceptor',
    ]);
  });

  it('cgConsultarUltimoNroOrden', async () => {
    const { agro, calls } = setup(() =>
      lpgResp('cgConsultarUltimoNroOrdenResp', 'liqUltNroOrdenReturn', '<nroOrden>3</nroOrden>'),
    );
    expect(await agro.lpg.cgConsultarUltimoNroOrden(1)).toBe(3);
    expect(calls[0].element).toBe('ser:cgConsultarUltimoNroOrdenReq');
  });
});

describe('WSLPG: paramétricas', () => {
  const item = (c: string, d: string) =>
    `<codigoDescripcion><codigo>${c}</codigo><descripcion>${d}</descripcion></codigoDescripcion>`;

  it('tipoGranoConsultar: tipoGranoReq solo con auth; 1 y N; vacía → []', async () => {
    const una = setup(() => lpgResp('tipoGranoResp', 'tipoGranoReturn', `<granos>${item('23', 'SOJA')}</granos>`));
    expect(await una.agro.lpg.tipoGranoConsultar()).toEqual([{ codigo: '23', descripcion: 'SOJA' }]);
    expect(una.calls[0].element).toBe('ser:tipoGranoReq');
    expect(keys(una.calls[0].req)).toEqual(['auth']);
    expect(una.calls[0].soapAction).toBe(`"${LPG_NS}tipoGranoConsultar"`);

    const varias = setup(() =>
      lpgResp('tipoGranoResp', 'tipoGranoReturn', `<granos>${item('23', 'SOJA')}${item('2', 'MAIZ')}</granos>`),
    );
    expect((await varias.agro.lpg.tipoGranoConsultar()).map((g) => g.codigo)).toEqual(['23', '2']);

    const vacia = setup(() => lpgResp('tipoGranoResp', 'tipoGranoReturn', ''));
    expect(await vacia.agro.lpg.tipoGranoConsultar()).toEqual([]);
  });

  it('paramétrica con errores → lanza (no [])', async () => {
    const { agro } = setup(() => lpgResp('tipoGranoResp', 'tipoGranoReturn', ERROR_1));
    await expect(agro.lpg.tipoGranoConsultar()).rejects.toBeInstanceOf(ArcaAgroServiceError);
  });

  it.each([
    [
      'provinciasConsultar',
      'provinciasReq',
      'provinciasResp',
      'provinciasReturn',
      'provincias',
      (a: ArcaAgro) => a.lpg.provinciasConsultar(),
    ],
    ['puertoConsultar', 'puertoReq', 'puertoResp', 'puertoReturn', 'puertos', (a: ArcaAgro) => a.lpg.puertoConsultar()],
    [
      'tipoActividadConsultar',
      'tipoActividadReq',
      'tipoActividadResp',
      'tipoActividadReturn',
      'tiposActividad',
      (a: ArcaAgro) => a.lpg.tipoActividadConsultar(),
    ],
    [
      'tipoActividadRepresentadoConsultar',
      'tipoActividadRepresentadoReq',
      'tipoActividadRepresentadoResp',
      'tipoActividadReturn',
      'tiposActividad',
      (a: ArcaAgro) => a.lpg.tipoActividadRepresentadoConsultar(),
    ],
    [
      'tipoCertificadoDepositoConsultar',
      'tipoCertificadoDepReq',
      'tipoCertificadoDepResp',
      'tipoCertDepReturn',
      'tiposCertDep',
      (a: ArcaAgro) => a.lpg.tipoCertificadoDepositoConsultar(),
    ],
    [
      'tipoRetencionConsultar',
      'tipoRetencionReq',
      'tipoRetencionResp',
      'tipoRetencionReturn',
      'tiposRetencion',
      (a: ArcaAgro) => a.lpg.tipoRetencionConsultar(),
    ],
    [
      'tipoDeduccionConsultar',
      'tipoDeduccionReq',
      'tipoDeduccionResp',
      'tipoDeduccionReturn',
      'tiposDeduccion',
      (a: ArcaAgro) => a.lpg.tipoDeduccionConsultar(),
    ],
    [
      'codigoGradoReferenciaConsultar',
      'gradoReferenciaReq',
      'gradoReferenciaResp',
      'gradoRefReturn',
      'gradosRef',
      (a: ArcaAgro) => a.lpg.codigoGradoReferenciaConsultar(),
    ],
    [
      'campaniasConsultar',
      'campaniaReq',
      'campaniaResp',
      'campaniaReturn',
      'campanias',
      (a: ArcaAgro) => a.lpg.campaniasConsultar(),
    ],
    [
      'localidadXProvinciaConsultar',
      'localidadReq',
      'localidadResp',
      'localidadesReturn',
      'localidades',
      (a: ArcaAgro) => a.lpg.localidadXProvinciaConsultar(1),
    ],
    [
      'tipoOperacionXActividadConsultar',
      'tipoOperacionReq',
      'tipoOperacionResp',
      'tipoOperacionReturn',
      'tiposOperacion',
      (a: ArcaAgro) => a.lpg.tipoOperacionXActividadConsultar(40),
    ],
  ] as const)('%s', async (method, req, resp, ret, container, run) => {
    const { agro, calls } = setup(() =>
      lpgResp(resp, ret, `<${container}>${item('1', 'UNO')}${item('2', 'DOS')}</${container}>`),
    );
    expect(await run(agro)).toEqual([
      { codigo: '1', descripcion: 'UNO' },
      { codigo: '2', descripcion: 'DOS' },
    ]);
    expect(calls[0].element).toBe(`ser:${req}`);
    expect(calls[0].soapAction).toBe(`"${LPG_NS}${method}"`);
  });

  it('localidadXProvinciaConsultar envía codProvincia como string', async () => {
    const { agro, calls } = setup(() => lpgResp('localidadResp', 'localidadesReturn', ''));
    await agro.lpg.localidadXProvinciaConsultar(1);
    expect(calls[0].body).toContain('<codProvincia>1</codProvincia>');
  });

  it('codigoGradoEntregadoXTipoGranoConsultar', async () => {
    const { agro, calls } = setup(() =>
      lpgResp(
        'gradoEntregadoResp',
        'gradoEntReturn',
        '<gradoEnt><gradoEnt><codigoDescripcion><codigo>G1</codigo><descripcion>Grado 1</descripcion></codigoDescripcion><valor>1.01</valor></gradoEnt></gradoEnt>',
      ),
    );
    expect(await agro.lpg.codigoGradoEntregadoXTipoGranoConsultar(2)).toEqual([
      { codigoDescripcion: { codigo: 'G1', descripcion: 'Grado 1' }, valor: 1.01 },
    ]);
    expect(calls[0].element).toBe('ser:gradoEntregadoReq');
    expect(keys(calls[0].req)).toEqual(['auth', 'codGrano']);
  });

  it('dummy: Body vacío y dummyResp/return', async () => {
    const { agro, calls } = setup(() =>
      lpgResp('dummyResp', 'return', '<appserver>OK</appserver><authserver>OK</authserver><dbserver>OK</dbserver>'),
    );
    expect(await agro.lpg.dummy()).toEqual({ appserver: 'OK', authserver: 'OK', dbserver: 'OK' });
    expect(calls[0].element).toBe('');
    expect(calls[0].soapAction).toBe(`"${LPG_NS}dummy"`);
  });
});

// ---------------------------------------------------------------------------
// Anulación de certificaciones: estadoCertificado ausente
// ---------------------------------------------------------------------------

describe('WSLPG: anulación de certificaciones', () => {
  it('liquidacionAnular y lsgAnular (discontinuados por el manual) no existen: se usa *AnularContraDocumento', () => {
    const { agro } = setup(() => '');
    expect('liquidacionAnular' in agro.lpg).toBe(false);
    expect('lsgAnular' in agro.lpg).toBe(false);
    expect(typeof agro.lpg.lpgAnularContraDocumento).toBe('function');
    expect(typeof agro.lpg.lsgAnularContraDocumento).toBe('function');
  });

  it('cgSolicitarAnulacion sin estadoCertificado → devuelve, no es un error incierto', async () => {
    const { agro } = setup(() => lpgResp('cgSolicitarAnulacionResp', 'oReturn', EVENTO));
    expect(await agro.lpg.cgSolicitarAnulacion('330200000099')).toEqual({
      eventos: [{ codigo: '1', descripcion: 'Liquidación registrada' }],
    });
  });
});

// ---------------------------------------------------------------------------
// Errores admitidos (1021), errores sin código, uncertain con COE
// ---------------------------------------------------------------------------

const ERROR_1021 =
  '<errores><error><codigo>1021</codigo><descripcion>Error al generar el archivo pdf.</descripcion></error></errores>';

describe('WSLPG: errores admitidos y uncertain', () => {
  it('liquidacionXCoeConsultar con pdf y 1021 → resultado sin pdf, con advertencias', async () => {
    const { agro } = setup(() => lpgResp('liqConsXCoeResp', 'liqConsReturn', AUTORIZACION + ERROR_1021));
    const r = await agro.lpg.liquidacionXCoeConsultar('330100012345', { pdf: true });
    expect(r.autorizacion.coe).toBe('330100012345');
    expect(r.pdf).toBeUndefined();
    expect(r.advertencias).toEqual([{ code: 1021, msg: 'Error al generar el archivo pdf.' }]);
  });

  it('cgConfirmarAnulacion con 1021 → advertencias', async () => {
    const { agro } = setup(() =>
      lpgResp('cgConfirmarAnulacionResp', 'oReturn', `<estadoCertificado>AN</estadoCertificado>${ERROR_1021}`),
    );
    const r = await agro.lpg.cgConfirmarAnulacion('330200000099', { pdf: true });
    expect(r.estadoCertificado).toBe('AN');
    expect(r.advertencias).toHaveLength(1);
  });

  it('liquidacionAutorizar con errores y autorizacion.coe → uncertain; sin coe → no', async () => {
    const con = setup(() => lpgResp('liquidacionResp', 'liqReturn', AUTORIZACION + ERROR_1));
    const e1: any = await con.agro.lpg.liquidacionAutorizar(liquidacion()).catch((x: any) => x);
    expect(e1).toBeInstanceOf(ArcaAgroServiceError);
    expect(e1.uncertain).toBe(true);
    const sin = setup(() => lpgResp('liquidacionResp', 'liqReturn', ERROR_1));
    const e2: any = await sin.agro.lpg.liquidacionAutorizar(liquidacion()).catch((x: any) => x);
    expect(e2.uncertain).toBe(false);
  });

  it('<error> sin codigo en erroresFormato cuenta como error', async () => {
    const { agro } = setup(() =>
      lpgResp(
        'liqUltNroOrdenResp',
        'liqUltNroOrdenReturn',
        '<erroresFormato><error><descripcion>mal</descripcion></error></erroresFormato>',
      ),
    );
    const e: any = await agro.lpg.liquidacionUltimoNroOrdenConsultar(1).catch((x: any) => x);
    expect(e).toBeInstanceOf(ArcaAgroServiceError);
    expect(e.errors).toEqual([{ code: 0, msg: 'mal' }]);
  });

  it('emisión: un evento sin codigo (must) se descarta, no vuelve incierta la operación', async () => {
    const eventos =
      '<eventos><evento><descripcion>sin código</descripcion></evento>' +
      '<evento><codigo>2</codigo><descripcion>ok</descripcion></evento></eventos>';
    const { agro } = setup(() => lpgResp('liquidacionResp', 'liqReturn', AUTORIZACION + eventos));
    const r = await agro.lpg.liquidacionAutorizar(liquidacion());
    expect(r.autorizacion.coe).toBe('330100012345');
    expect(r.eventos).toEqual([{ codigo: '2', descripcion: 'ok' }]);
  });

  it('emisión: un campo secundario inválido se omite (no uncertain)', async () => {
    const malo = AUTORIZACION.replace('<totalPesoNeto>30000</totalPesoNeto>', '<totalPesoNeto>n/a</totalPesoNeto>');
    const { agro } = setup(() => lpgResp('liquidacionResp', 'liqReturn', malo + EVENTO));
    const r = await agro.lpg.liquidacionAutorizar(liquidacion());
    expect(r.autorizacion.coe).toBe('330100012345');
    expect(r.autorizacion.totalPesoNeto).toBeUndefined();
    expect(r.autorizacion.subTotal).toBe(7500003.69);
    expect(r.autorizacion.deducciones).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Consultas de recuperación y otras consultas
// ---------------------------------------------------------------------------

const AJUSTE_CONS =
  '<ajusteUnificado><ptoEmision>1</ptoEmision><nroOrden>13</nroOrden><coeAjustado>330100012345</coeAjustado>' +
  '<codTipoOperacion>1</codTipoOperacion><coe>330100012346</coe><estado>AC</estado></ajusteUnificado>';

describe('WSLPG: consultas de certificación y ajuste', () => {
  it('cgConsultarXNroOrden: CgConsultarXNroOrdenReq (mayúscula) y oReturn', async () => {
    const { agro, calls } = setup(() => lpgResp('CgConsultarXNroOrdenResp', 'oReturn', CG_CONSULTA));
    const r = await agro.lpg.cgConsultarXNroOrden(1, 3);
    expect(calls[0].element).toBe('ser:CgConsultarXNroOrdenReq');
    expect(calls[0].soapAction).toBe(`"${LPG_NS}cgConsultarXNroOrden"`);
    expect(keys(calls[0].req)).toEqual(['auth', 'ptoEmision', 'nroOrden']);
    expect(r.autorizacion.coe).toBe('330200000099');
    expect(r.cabecera?.cuitCorredor).toBe(0);
    expect(r.retiroTransferencia?.certificadoDeposito).toEqual({
      coeCertificadoDeposito: '330200000001',
      pesoNeto: 10000,
    });
    expect(r.kilosDisponible).toBe(5000.5);
  });

  it('cgConsultarXCoe con pdf', async () => {
    const { agro, calls } = setup(() => lpgResp('cgConsultarXCoeResp', 'oReturn', `${CG_CONSULTA}<pdf>JVBE</pdf>`));
    const r = await agro.lpg.cgConsultarXCoe('330200000099', { pdf: true });
    expect(calls[0].element).toBe('ser:cgConsultarXCoeReq');
    expect(keys(calls[0].req)).toEqual(['auth', 'coe', 'pdf']);
    expect(r.pdf).toBe('JVBE');
  });

  it('cgConsultarXNroOrden sin autorizacion.coe → ArcaAgroResponseError (no uncertain)', async () => {
    const { agro } = setup(() => lpgResp('CgConsultarXNroOrdenResp', 'oReturn', EVENTO));
    const e: any = await agro.lpg.cgConsultarXNroOrden(1, 3).catch((x: any) => x);
    expect(e).toBeInstanceOf(ArcaAgroResponseError);
    expect(e.uncertain).toBe(false);
  });

  it('ajusteXNroOrdenConsultar', async () => {
    const { agro, calls } = setup(() => lpgResp('ajusteXNroOrdenConsResp', 'ajusteXNroOrdenConsReturn', AJUSTE_CONS));
    const r = await agro.lpg.ajusteXNroOrdenConsultar(1, 13);
    expect(calls[0].element).toBe('ser:ajusteXNroOrdenConsReq');
    expect(calls[0].soapAction).toBe(`"${LPG_NS}ajusteXNroOrdenConsultar"`);
    expect(keys(calls[0].req)).toEqual(['auth', 'ptoEmision', 'nroOrden']);
    expect(r.ajusteUnificado.coe).toBe('330100012346');
    expect(r.eventos).toEqual([]);
  });

  it('ajusteXCoeConsultar: respuesta ajusteXcoeConsResp', async () => {
    const { agro, calls } = setup(() =>
      lpgResp('ajusteXcoeConsResp', 'ajusteConsReturn', `${AJUSTE_CONS}<pdf>JVBE</pdf>`),
    );
    const r = await agro.lpg.ajusteXCoeConsultar('330100012346', { pdf: true });
    expect(calls[0].element).toBe('ser:ajusteXCoeConsReq');
    expect(r.ajusteUnificado.coeAjustado).toBe('330100012345');
    expect(r.pdf).toBe('JVBE');
  });

  it('ajustePorContratoConsultar', async () => {
    const { agro, calls } = setup(() => lpgResp('ajustePorContratoConsultarResp', 'ajusteContratoReturn', AJUSTE_CONS));
    const r = await agro.lpg.ajustePorContratoConsultar(123456);
    expect(calls[0].element).toBe('ser:ajustePorContratoConsultarReq');
    expect(keys(calls[0].req)).toEqual(['auth', 'nroContrato']);
    expect(r.ajusteUnificado.coe).toBe('330100012346');
  });

  it('liquidacionPorContratoConsultar → COEs (vacío → [])', async () => {
    const params = { nroContrato: 123456, cuitComprador: CUIT, cuitVendedor: CUIT2, codGrano: 23 };
    const { agro, calls } = setup(() =>
      lpgResp(
        'liquidacionPorContratoConsultarResp',
        'liqPorContratoCons',
        '<coeRelacionados><coe>330100000001</coe><coe>330100000002</coe></coeRelacionados>',
      ),
    );
    expect(await agro.lpg.liquidacionPorContratoConsultar(params)).toEqual(['330100000001', '330100000002']);
    expect(calls[0].element).toBe('ser:liquidacionPorContratoConsultarReq');
    expect(keys(calls[0].req)).toEqual(['auth', 'nroContrato', 'cuitComprador', 'cuitVendedor', 'codGrano']);
    const vacia = setup(() => lpgResp('liquidacionPorContratoConsultarResp', 'liqPorContratoCons', EVENTO));
    expect(await vacia.agro.lpg.liquidacionPorContratoConsultar(params)).toEqual([]);
  });

  it('cgBuscarCtg', async () => {
    const { agro, calls } = setup(() =>
      lpgResp(
        'cgBuscarCtgResp',
        'oReturn',
        '<ctg><campania>2526</campania><nroPlanta>1938</nroPlanta><nroCtg>010100012345</nroCtg><tipoCtg>CPE</tipoCtg>' +
          `<nroCartaPorte>74-1-15</nroCartaPorte><kilosConfirmados>30000</kilosConfirmados><fechaConfirmacionCtg>2026-11-02</fechaConfirmacionCtg>` +
          `<codGrano>23</codGrano><cuitLiquida>${CUIT}</cuitLiquida><cuitCertifica>${CUIT2}</cuitCertifica></ctg>`,
      ),
    );
    const r = await agro.lpg.cgBuscarCtg({
      fechaConfirmacionCtgDes: '2026-11-01',
      campania: 2526,
      codGrano: 23,
      cuitDepositante: CUIT3,
      tipoCertificado: 'P',
    });
    expect(calls[0].element).toBe('ser:cgBuscarCtgReq');
    expect(keys(calls[0].req)).toEqual([
      'auth',
      'tipoCertificado',
      'cuitDepositante',
      'codGrano',
      'campania',
      'fechaConfirmacionCtgDes',
    ]);
    expect(r).toEqual([
      {
        campania: 2526,
        nroPlanta: 1938,
        nroCtg: '010100012345',
        tipoCtg: 'CPE',
        nroCartaPorte: '74-1-15',
        kilosConfirmados: 30000,
        fechaConfirmacionCtg: '2026-11-02',
        codGrano: 23,
        cuitLiquida: Number(CUIT),
        cuitCertifica: Number(CUIT2),
      },
    ]);
  });

  it('cgBuscarCertConSaldoDisponible', async () => {
    const { agro, calls } = setup(() =>
      lpgResp(
        'cgBuscarCertConSaldoDisponibleResp',
        'oReturn',
        '<certificado><coe>330200000001</coe><tipoCertificado>P</tipoCertificado><kilosDisponibles>1000</kilosDisponibles></certificado>',
      ),
    );
    const r = await agro.lpg.cgBuscarCertConSaldoDisponible({ cuitDepositante: CUIT3, codGrano: 23, campania: 2526 });
    expect(calls[0].element).toBe('ser:cgBuscarCertConSaldoDisponibleReq');
    expect(keys(calls[0].req)).toEqual(['auth', 'cuitDepositante', 'codGrano', 'campania']);
    expect(r).toEqual([{ coe: '330200000001', tipoCertificado: 'P', kilosDisponibles: 1000 }]);
  });
});

describe('WSLPG: cgAutorizar cuitCorredor (LpgCuit0Type)', () => {
  const resp = () => lpgResp('cgAutorizarResp', 'oReturn', '<autorizacion><coe>1</coe></autorizacion>');

  it('acepta 0 (sin corredor) y lo envía como 0', async () => {
    const { agro, calls } = setup(resp);
    const p = cg();
    p.cabecera.cuitCorredor = 0;
    await agro.lpg.cgAutorizar(p);
    expect(String(calls[0].req.cabecera.cuitCorredor)).toBe('0');
  });

  it('una CUIT real se valida y normaliza', async () => {
    const { agro, calls, fetchMock } = setup(resp);
    const p = cg();
    p.cabecera.cuitCorredor = '30-71234567-1';
    await agro.lpg.cgAutorizar(p);
    expect(String(calls[0].req.cabecera.cuitCorredor)).toBe(CUIT2);
    p.cabecera.cuitCorredor = '30-71234567-2';
    await expect(agro.lpg.cgAutorizar(p)).rejects.toBeInstanceOf(ArcaValidationError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Error 600 (sin registros, manual WSLPG §1.7)
// ---------------------------------------------------------------------------

const ERROR_600 =
  '<errores><error><codigo>600</codigo><descripcion>No existen datos en las bases de la Administración según los parámetros de búsqueda informados</descripcion></error></errores>';

describe('WSLPG: error 600 (sin registros)', () => {
  const contrato = { nroContrato: 123456, cuitComprador: CUIT, cuitVendedor: CUIT2, codGrano: 23 };

  it.each([
    [
      'liquidacionPorContratoConsultar',
      'liquidacionPorContratoConsultarResp',
      'liqPorContratoCons',
      (a: ArcaAgro) => a.lpg.liquidacionPorContratoConsultar(contrato),
    ],
    [
      'lsgConsultarXContrato',
      'lsgConsultarXContratoResp',
      'liqPorContratoCons',
      (a: ArcaAgro) => a.lpg.lsgConsultarXContrato(contrato),
    ],
    [
      'cgBuscarCtg',
      'cgBuscarCtgResp',
      'oReturn',
      (a: ArcaAgro) =>
        a.lpg.cgBuscarCtg({ tipoCertificado: 'P', cuitDepositante: CUIT3, codGrano: 23, campania: 2526 }),
    ],
    [
      'cgBuscarCertConSaldoDisponible',
      'cgBuscarCertConSaldoDisponibleResp',
      'oReturn',
      (a: ArcaAgro) => a.lpg.cgBuscarCertConSaldoDisponible({ cuitDepositante: CUIT3, codGrano: 23, campania: 2526 }),
    ],
    [
      'localidadXProvinciaConsultar',
      'localidadResp',
      'localidadesReturn',
      (a: ArcaAgro) => a.lpg.localidadXProvinciaConsultar(99),
    ],
  ] as const)('%s: 600 → []', async (_, resp, ret, run) => {
    const { agro } = setup(() => lpgResp(resp, ret, ERROR_600));
    expect(await run(agro)).toEqual([]);
  });

  it('lista: 600 junto con un error admitido (1021) → []', async () => {
    const { agro } = setup(() =>
      lpgResp('cgBuscarCtgResp', 'oReturn', ERROR_600.replace('</errores>', ERROR_1021.replace('<errores>', ''))),
    );
    expect(
      await agro.lpg.cgBuscarCtg({ tipoCertificado: 'P', cuitDepositante: CUIT3, codGrano: 23, campania: 2526 }),
    ).toEqual([]);
  });

  it('lista: 600 con código no numérico (erroresFormato) → lanza', async () => {
    const { agro } = setup(() => lpgResp('tipoGranoResp', 'tipoGranoReturn', ERROR_600 + ERROR_FORMATO));
    await expect(agro.lpg.tipoGranoConsultar()).rejects.toBeInstanceOf(ArcaAgroServiceError);
  });

  it('lista: 600 junto con otro error → lanza con los dos', async () => {
    const { agro } = setup(() =>
      lpgResp(
        'cgBuscarCtgResp',
        'oReturn',
        ERROR_600.replace(
          '</errores>',
          '<error><codigo>1201</codigo><descripcion>CUIT inválida</descripcion></error></errores>',
        ),
      ),
    );
    const e: any = await agro.lpg
      .cgBuscarCtg({ tipoCertificado: 'P', cuitDepositante: CUIT3, codGrano: 23, campania: 2526 })
      .catch((x: any) => x);
    expect(e).toBeInstanceOf(ArcaAgroServiceError);
    expect(e.errors.map((x: { code: number }) => x.code)).toEqual([600, 1201]);
  });

  it('consulta de un único registro: 600 lanza (ej: recuperar por número de orden)', async () => {
    const { agro } = setup(() => lpgResp('liqConsXNroOrdenResp', 'liqConsReturn', ERROR_600));
    const e: any = await agro.lpg.liquidacionXNroOrdenConsultar(1, 99).catch((x: any) => x);
    expect(e).toBeInstanceOf(ArcaAgroServiceError);
    expect(e.errors[0].code).toBe(600);
  });

  it('ajustePorContratoConsultar (un único ajuste): 600 lanza', async () => {
    const { agro } = setup(() => lpgResp('ajustePorContratoConsultarResp', 'ajusteContratoReturn', ERROR_600));
    await expect(agro.lpg.ajustePorContratoConsultar(123456)).rejects.toBeInstanceOf(ArcaAgroServiceError);
  });

  it('emisión: 600 lanza', async () => {
    const { agro } = setup(() => lpgResp('liquidacionResp', 'liqReturn', ERROR_600));
    const e: any = await agro.lpg.liquidacionAutorizar(liquidacion()).catch((x: any) => x);
    expect(e).toBeInstanceOf(ArcaAgroServiceError);
    expect(e.uncertain).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Anulación por contradocumento, anticipos, ajuste por contrato, calidad
// ---------------------------------------------------------------------------

describe('WSLPG: lpgAnularContraDocumento', () => {
  it('anulacionBase en orden XSD (puntoEmision, nroOrden, coeAnular)', async () => {
    const { agro, calls } = setup(() => lpgResp('LpgAnularContraDocumentoResp', 'liqConsReturn', CONTRA_DOCUMENTO));
    await agro.lpg.lpgAnularContraDocumento(contraDocumento());
    expect(keys(calls[0].req.anulacionBase)).toEqual(['puntoEmision', 'nroOrden', 'coeAnular']);
    expect(String(calls[0].req.anulacionBase.coeAnular)).toBe('330100012345');
  });

  it('errores con autorizacion.coe → uncertain; sin coe → ArcaAgroResponseError uncertain', async () => {
    const con = setup(() => lpgResp('LpgAnularContraDocumentoResp', 'liqConsReturn', CONTRA_DOCUMENTO + ERROR_1));
    const e1: any = await con.agro.lpg.lpgAnularContraDocumento(contraDocumento()).catch((x: any) => x);
    expect(e1).toBeInstanceOf(ArcaAgroServiceError);
    expect(e1.uncertain).toBe(true);
    const sin = setup(() => lpgResp('LpgAnularContraDocumentoResp', 'liqConsReturn', EVENTO));
    const e2: any = await sin.agro.lpg.lpgAnularContraDocumento(contraDocumento()).catch((x: any) => x);
    expect(e2).toBeInstanceOf(ArcaAgroResponseError);
    expect(e2.uncertain).toBe(true);
  });

  it('valida anulacionBase antes de enviar', async () => {
    const { agro, fetchMock } = setup(() => '');
    const p = contraDocumento();
    p.anulacionBase.puntoEmision = 0;
    await expect(agro.lpg.lpgAnularContraDocumento(p)).rejects.toBeInstanceOf(ArcaValidationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('WSLPG: requests de las operaciones nuevas', () => {
  it('lpgAutorizarAnticipo: liquidacion, retenciones y deducciones en orden XSD', async () => {
    const { agro, calls } = setup(() => lpgResp('LpgAutorizarAnticipoResp', 'liqReturn', AUTORIZACION));
    await agro.lpg.lpgAutorizarAnticipo(anticipo());
    expect(keys(calls[0].req.anticipo)).toEqual(['liquidacion', 'retenciones', 'deducciones']);
    expect(keys(calls[0].req.anticipo.liquidacion)).toEqual([
      'ptoEmision',
      'nroOrden',
      'cuitComprador',
      'nroActComprador',
      'nroIngBrutoComprador',
      'codTipoOperacion',
      'codPuerto',
      'descPuertoLocalidad',
      'codGrano',
      'pesoNetoSinCertificado',
      'cuitVendedor',
      'nroIngBrutoVendedor',
      'liquidaCorredor',
      'fechaPrecioOperacion',
      'precioRefTn',
      'alicIvaOperacion',
      'campaniaPpal',
      'codLocProcedencia',
      'codProvProcedencia',
    ]);
  });

  it('lpgCancelarAnticipo: pdf obligatorio en el XSD (N por defecto, S con pdf: true)', async () => {
    const { agro, calls } = setup(() => lpgResp('LpgCancelarAnticipoResp', 'liqConsReturn', AUTORIZACION));
    await agro.lpg.lpgCancelarAnticipo({ coe: '330100012300', ptoEmision: 1, nroOrden: 13 });
    await agro.lpg.lpgCancelarAnticipo({ coe: '330100012300', ptoEmision: 1, nroOrden: 13, pdf: true });
    expect(calls.map((c) => c.req.pdf)).toEqual(['N', 'S']);
  });

  it('liquidacionAjustarContrato: orden XSD de ajusteBase; sin crédito ni débito → validación', async () => {
    const { agro, calls, fetchMock } = setup(() =>
      lpgResp('ajustarContratoResp', 'ajusteContratoReturn', '<ajusteContrato><coe>1</coe></ajusteContrato>'),
    );
    await agro.lpg.liquidacionAjustarContrato(ajusteContrato());
    expect(keys(calls[0].req.ajusteBase)).toEqual([
      'ptoEmision',
      'nroOrden',
      'nroContrato',
      'actividad',
      'codGrano',
      'cuitVendedor',
      'cuitComprador',
      'precioRefTn',
      'codGradoEnt',
      'valGradoEnt',
      'precioFleteTn',
      'codPuerto',
      'desPuertoLocalidad',
      'codLocalidad',
      'codProv',
    ]);
    expect(keys(calls[0].req.ajusteCredito)).toEqual(['conceptoImporteIva105', 'importeAjustarIva105']);
    const p = ajusteContrato();
    delete p.ajusteCredito;
    await expect(agro.lpg.liquidacionAjustarContrato(p)).rejects.toBeInstanceOf(ArcaValidationError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('lsgAutorizar: orden XSD de liqSecundariaBase y facturaPapel', async () => {
    const { agro, calls } = setup(() => lpgResp('lsgAutorizarResp', 'oReturn', LSG_AUTORIZACION));
    await agro.lpg.lsgAutorizar(lsg());
    expect(keys(calls[0].req.liqSecundariaBase)).toEqual([
      'ptoEmision',
      'nroOrden',
      'cuitComprador',
      'nroIngBrutoComprador',
      'codPuerto',
      'desPuertoLocalidad',
      'codGrano',
      'cantidadTn',
      'cuitVendedor',
      'nroActVendedor',
      'nroIngBrutoVendedor',
      'actuaCorredor',
      'liquidaCorredor',
      'fechaPrecioOperacion',
      'precioRefTn',
      'precioOperacion',
      'alicIvaOperacion',
      'campaniaPPal',
      'codLocalidad',
      'codProvincia',
      'deduccion',
      'percepcion',
    ]);
    expect(keys(calls[0].req.liqSecundariaBase.percepcion)).toEqual(['detalleAclaratoria', 'baseCalculo', 'alicuota']);
    expect(keys(calls[0].req.facturaPapel)).toEqual(['nroCAI', 'nroFacturaPapel', 'fechaFactura', 'tipoComprobante']);
    expect(calls[0].body).toContain('<cantidadTn>0.010</cantidadTn>');
    expect(calls[0].body).toContain('<precioOperacion>40.500</precioOperacion>');
  });

  it('lsgAjustarXCoe: sin crédito ni débito → validación (error 3010)', async () => {
    const { agro, fetchMock } = setup(() => '');
    const { ajusteDebito: _, ...sinAjuste } = lsgAjuste();
    await expect(agro.lpg.lsgAjustarXCoe({ ...sinAjuste, coe: '331000000537' })).rejects.toBeInstanceOf(
      ArcaValidationError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cgInformarCalidad: coe y calidad en orden XSD', async () => {
    const { agro, calls } = setup(() => lpgResp('CgInformarCalidadResp', 'oReturn', CG_CONSULTA));
    await agro.lpg.cgInformarCalidad(informarCalidad());
    expect(keys(calls[0].req.calidad)).toEqual([
      'analisisMuestra',
      'nroBoletin',
      'codGrado',
      'valorGrado',
      'valorContProteico',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Consultas de liquidación secundaria
// ---------------------------------------------------------------------------

describe('WSLPG: consultas lsg*', () => {
  it('lsgConsultarXCoe: dos liquidaciones (ajuste con crédito y débito), todalPercepciones → totalPercepciones', async () => {
    const { agro, calls } = setup(() => lpgResp('lsgConsultarXCoeResp', 'oReturn', `${LSG_CONSULTA}<pdf>JVBE</pdf>`));
    const r = await agro.lpg.lsgConsultarXCoe('331000000537', { pdf: true });
    expect(calls[0].element).toBe('ser:lsgConsultarXCoeReq');
    expect(calls[0].soapAction).toBe(`"${LPG_NS}lsgConsultarXCoe"`);
    expect(keys(calls[0].req)).toEqual(['auth', 'coe', 'pdf']);
    expect(r.liquidaciones).toHaveLength(2);
    const [original, ajuste] = r.liquidaciones;
    expect(original.liquidacion).toEqual({
      ptoEmision: 331,
      nroOrden: 49,
      cuitComprador: Number(CUIT),
      pesoNetoEnTn: 0.01,
      totalPercepciones: 231.24,
      deduccion: [{ detalleAclaratoria: 'deduccion 1', baseCalculo: 100, alicuotaIVA: 21 }],
      percepcion: [],
      facturaPapel: { nroCAI: 12345678901234, tipoComprobante: '1' },
    });
    expect(original.autorizacion).toEqual({ coe: '331000000537', subtotal: 0.405 });
    expect(ajuste.ajuste).toEqual({
      tipoAjuste: 'C',
      req: { conceptoIva21: 'Dif', importeAjustar21: 10, percepcion: [] },
      totalesUnificados: { importeNeto: -10.5 },
      estado: 'AC',
    });
    expect(r.pdf).toBe('JVBE');
  });

  it('lsgConsultarXCoe sin liquidaciones → ArcaAgroResponseError (no uncertain)', async () => {
    const { agro } = setup(() => lpgResp('lsgConsultarXCoeResp', 'oReturn', EVENTO));
    const e: any = await agro.lpg.lsgConsultarXCoe('331000000537').catch((x: any) => x);
    expect(e).toBeInstanceOf(ArcaAgroResponseError);
    expect(e.uncertain).toBe(false);
  });

  it('lsgConsultarXNroOrden y lsgConsultarUltimoNroOrden', async () => {
    const porOrden = setup(() => lpgResp('lsgConsultarXNroOrdenResp', 'oReturn', LSG_CONSULTA));
    const r = await porOrden.agro.lpg.lsgConsultarXNroOrden(331, 49);
    expect(porOrden.calls[0].element).toBe('ser:lsgConsultarXNroOrdenReq');
    expect(keys(porOrden.calls[0].req)).toEqual(['auth', 'ptoEmision', 'nroOrden']);
    expect(r.liquidaciones[0].autorizacion?.coe).toBe('331000000537');

    const ultimo = setup(() =>
      lpgResp('lsgConsultarUltimoNroOrdenResp', 'liqUltNroOrdenReturn', '<nroOrden>49</nroOrden>'),
    );
    expect(await ultimo.agro.lpg.lsgConsultarUltimoNroOrden(331)).toBe(49);
    expect(ultimo.calls[0].element).toBe('ser:lsgConsultarUltimoNroOrdenReq');
  });

  it('lsgConsultarXContrato → COEs', async () => {
    const { agro, calls } = setup(() =>
      lpgResp(
        'lsgConsultarXContratoResp',
        'liqPorContratoCons',
        '<coeRelacionados><coe>331000000537</coe></coeRelacionados>',
      ),
    );
    const r = await agro.lpg.lsgConsultarXContrato({
      nroContrato: 100001250,
      cuitComprador: CUIT,
      cuitVendedor: CUIT2,
      codGrano: 1,
    });
    expect(r).toEqual(['331000000537']);
    expect(calls[0].element).toBe('ser:lsgConsultarXContratoReq');
    expect(calls[0].soapAction).toBe(`"${LPG_NS}lsgConsultarXContrato"`);
  });
});

// ---------------------------------------------------------------------------
// Validaciones del manual
// ---------------------------------------------------------------------------

describe('WSLPG: validaciones del manual', () => {
  const fields = async (p: Promise<unknown>) =>
    ((await p.catch((e: any) => e)) as ArcaValidationError).details.map((d) => d.field);

  it('cgAutorizar: lleva solo el bloque de su tipoCertificado (§2.4.36.1)', async () => {
    const { agro, fetchMock } = setup(() => '');
    const sinBloque = cg();
    delete sinBloque.retiroTransferencia;
    expect(await fields(agro.lpg.cgAutorizar(sinBloque))).toEqual(['retiroTransferencia']);

    const ajeno = cg();
    ajeno.preexistente = {
      nroPlanta: 1,
      tipoCertificadoDepositoPreexistente: 1,
      nroCertificadoDepositoPreexistente: 1,
      cacCertificadoDepositoPreexistente: 1,
      fechaEmisionCertificadoDepositoPreexistente: '2026-01-01',
      pesoNeto: 1,
    };
    expect(await fields(agro.lpg.cgAutorizar(ajeno))).toEqual(['preexistente']);

    const e = cg();
    e.cabecera.tipoCertificado = 'E';
    const preexistente = ajeno.preexistente;
    delete e.retiroTransferencia;
    e.preexistente = preexistente;
    e.preexistenteFusion = {
      nroPlanta: 1,
      nroCertificadoDepositoPreexistente: 1,
      fechaEmisionCertificadoDepositoPreexistente: '2026-01-01',
      pesoNeto: 1,
    };
    expect(await fields(agro.lpg.cgAutorizar(e))).toEqual(['preexistenteFusion']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cgInformarCalidad: grado y valor de grado (3014, 3015, 3017, 3018)', async () => {
    const { agro, fetchMock } = setup(() => '');
    const run = (calidad: Partial<CgInformarCalidadParams['calidad']>) =>
      fields(agro.lpg.cgInformarCalidad({ coe: 1, calidad: { ...informarCalidad().calidad, ...calidad } }));
    expect(await run({ codGrado: 'G1' })).toEqual(['calidad.valorGrado']); // 3014
    expect(await run({ valorGrado: undefined })).toEqual(['calidad.valorGrado']); // 3015
    expect(await run({ codGrado: undefined })).toEqual(['calidad.codGrado', 'calidad.valorGrado']); // 3018, 3017
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('códigos de grado (G1-G3, FG, F1-F3) y tipo de certificado de depósito ("332") según el manual §3.1', async () => {
    const { agro, fetchMock } = setup(() => '');
    const p = liquidacion();
    (p.liquidacion as { codGradoEnt?: string }).codGradoEnt = 'G4';
    (p.liquidacion.certificados![0] as { tipoCertificadoDeposito: string }).tipoCertificadoDeposito = '5';
    expect(await fields(agro.lpg.liquidacionAutorizar(p))).toEqual([
      'liquidacion.codGradoEnt',
      'liquidacion.certificados[0].tipoCertificadoDeposito',
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('WSLPG: validadores exportados de las operaciones nuevas', () => {
  it('aceptan los datos válidos y lanzan ArcaValidationError con los inválidos', () => {
    expect(() => validateAjusteContrato(ajusteContrato())).not.toThrow();
    expect(() => validateAutorizarAnticipo(anticipo())).not.toThrow();
    expect(() => validateCgInformarCalidad(informarCalidad())).not.toThrow();
    expect(() => validateLsgAutorizar(lsg())).not.toThrow();
    expect(() => validateLsgAjustarXCoe({ ...lsgAjuste(), coe: 1 })).not.toThrow();
    expect(() =>
      validateLsgAjustarXContrato({
        ...lsgAjuste(),
        nroContrato: 1,
        cuitComprador: CUIT,
        cuitVendedor: CUIT2,
        codGrano: 1,
      }),
    ).not.toThrow();

    const sinBloque = cg();
    delete sinBloque.retiroTransferencia;
    expect(() => validateCgAutorizar(sinBloque)).toThrow(ArcaValidationError);
    expect(() =>
      validateCgInformarCalidad({ ...informarCalidad(), calidad: { ...informarCalidad().calidad, codGrado: 'G2' } }),
    ).toThrow(ArcaValidationError);
    const lsgMalo = lsg();
    (lsgMalo.facturaPapel as { tipoComprobante: string }).tipoComprobante = '2';
    expect(() => validateLsgAutorizar(lsgMalo)).toThrow(ArcaValidationError);
    const { ajusteDebito: _, ...sinAjuste } = lsgAjuste();
    expect(() => validateLsgAjustarXCoe({ ...sinAjuste, coe: 1 })).toThrow(ArcaValidationError);
  });
});
