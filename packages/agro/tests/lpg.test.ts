import { describe, it, expect } from 'vitest';
import {
  ArcaAgroResponseError,
  ArcaAgroServiceError,
  ArcaServiceError,
  ArcaSoapError,
  ArcaValidationError,
  LPG_ENDPOINTS,
} from '../src/index.js';
import type { ArcaAgro, AjusteUnificadoParams, CgAutorizarParams, LiquidacionAutorizarParams } from '../src/index.js';
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
          tipoCertificadoDeposito: '5',
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
    expect(c.url).toBe(LPG_ENDPOINTS.testing);
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
    const e1 = await one.agro.lpg.liquidacionAutorizar(liquidacion()).catch((e) => e);
    expect(e1).toBeInstanceOf(ArcaAgroServiceError);
    expect(e1).toBeInstanceOf(ArcaServiceError);
    expect(e1.service).toBe('WSLPG');
    expect(e1.errors).toEqual([{ code: 1105, msg: 'El número de orden ya fue utilizado.' }]);

    const many = setup(() => lpgResp('liquidacionResp', 'liqReturn', ERROR_N));
    const eN = await many.agro.lpg.liquidacionAutorizar(liquidacion()).catch((e) => e);
    expect(eN.errors.map((e: { code: number }) => e.code)).toEqual([1105, 1201]);
  });

  it('erroresFormato también se detectan (código no numérico en rawCode)', async () => {
    const { agro } = setup(() => lpgResp('liquidacionResp', 'liqReturn', ERROR_FORMATO));
    const e = await agro.lpg.liquidacionAutorizar(liquidacion()).catch((err) => err);
    expect(e).toBeInstanceOf(ArcaAgroServiceError);
    expect(e.errors).toEqual([{ code: 0, msg: 'Campo precioRefTn mal formado', rawCode: 'CTG01' }]);
  });

  it('sin autorizacion.coe → ArcaAgroResponseError uncertain', async () => {
    const { agro } = setup(() => lpgResp('liquidacionResp', 'liqReturn', EVENTO));
    const e = await agro.lpg.liquidacionAutorizar(liquidacion()).catch((err) => err);
    expect(e).toBeInstanceOf(ArcaAgroResponseError);
    expect(e.uncertain).toBe(true);
  });

  it('timeout → 1 fetch, uncertain', async () => {
    const { agro, fetchMock } = setup(hang, { timeout: 30 });
    const e = await agro.lpg.liquidacionAutorizar(liquidacion()).catch((err) => err);
    expect(e).toBeInstanceOf(ArcaSoapError);
    expect(e.uncertain).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('SOAP Fault en emisión → uncertain', async () => {
    const { agro, fetchMock } = setup(() => soapFaultResponse('S:Server', 'Error interno'));
    const e = await agro.lpg.liquidacionAutorizar(liquidacion()).catch((err) => err);
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
    const e = await agro.lpg.liquidacionAutorizar(p).catch((err) => err);
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

interface EmisionCase {
  name: string;
  req: string;
  resp: string;
  ret: string;
  ok: string;
  order: string[];
  run: (a: ArcaAgro) => Promise<unknown>;
  check: (r: any) => void;
}

const EMISIONES: EmisionCase[] = [
  {
    name: 'liquidacionAnular',
    req: 'anulacionReq',
    resp: 'anulacionResp',
    ret: 'anulacionReturn',
    ok: '<coe>330100012345</coe><resultado>A</resultado>',
    order: ['auth', 'coe'],
    run: (a) => a.lpg.liquidacionAnular('330100012345'),
    check: (r) => expect(r).toEqual({ coe: '330100012345', resultado: 'A', eventos: [] }),
  },
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
  },
];

describe.each(EMISIONES)('WSLPG $name (emisión)', ({ name, req, resp, ret, ok, order, run, check }) => {
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
    expect((await run(one.agro).catch((e) => e)).errors).toHaveLength(1);
    const many = setup(() => lpgResp(resp, ret, ERROR_N));
    const e = await run(many.agro).catch((err) => err);
    expect(e).toBeInstanceOf(ArcaAgroServiceError);
    expect(e.errors).toHaveLength(2);
  });

  it('503 → 1 fetch, uncertain', async () => {
    const { agro, fetchMock } = setup(http503);
    const e = await run(agro).catch((err) => err);
    expect(e).toBeInstanceOf(ArcaSoapError);
    expect(e.uncertain).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
