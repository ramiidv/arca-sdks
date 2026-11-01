/**
 * WSFEv1 y WSFEX sobre el DSL de schemas: respuestas pedidas como texto
 * (`parseNumbers: false`) y decodificadas según el WSDL, y requests validados
 * y ordenados con `encodeRequest`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArcaSoapError, ArcaValidationError } from '@ramiidv/arca-common';
import { ArcaResultadoIncierto, ArcaResultadoInciertoExpo } from '../src/errors.js';
import { WsfeClient, buildDetRequest } from '../src/wsfe.js';
import { WsfexClient, buildFexCmp } from '../src/wsfex.js';
import type { InvoiceDetail, WsfexInvoice } from '../src/types.js';
import { mockArcaFetch, orden, wsfeResponse, wsfexResponse } from './helpers.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const AUTH = { token: 'TOKEN', sign: 'SIGN', cuit: 20123456786 };

const DETALLE: InvoiceDetail = {
  concepto: 1,
  docTipo: 80,
  docNro: 30712345671,
  cbteDesde: 12345678,
  cbteHasta: 12345678,
  cbteFch: '20261030',
  impTotal: 121,
  impTotConc: 0,
  impNeto: 100,
  impOpEx: 0,
  impTrib: 0,
  impIva: 21,
  monId: 'PES',
  monCotiz: 1,
  condicionIvaReceptorId: 1,
  iva: [{ id: 5, baseImp: 100, importe: 21 }],
};

const consulta = (extra: string) =>
  wsfeResponse(
    'FECompConsultar',
    '<ResultGet><Concepto>1</Concepto><DocTipo>80</DocTipo><DocNro>30712345671</DocNro>' +
      '<CbteDesde>12345678</CbteDesde><CbteHasta>12345678</CbteHasta><CbteFch>20261030</CbteFch>' +
      '<ImpTotal>121.50</ImpTotal><ImpTotConc>0</ImpTotConc><ImpNeto>100.41</ImpNeto><ImpOpEx>0</ImpOpEx>' +
      '<ImpTrib>0</ImpTrib><ImpIVA>21.09</ImpIVA><FchServDesde/><FchServHasta/><FchVtoPago/>' +
      `<MonId>060</MonId><MonCotiz>1015.500000</MonCotiz>${extra}` +
      '<Resultado>A</Resultado><CodAutorizacion>06123456789012</CodAutorizacion><EmisionTipo>CAE</EmisionTipo>' +
      '<FchVto>20261109</FchVto><FchProceso>20261030120000</FchProceso><PtoVta>1</PtoVta><CbteTipo>1</CbteTipo>' +
      '</ResultGet>',
  );

describe('WSFEv1: respuestas decodificadas con el schema', () => {
  it('xs:string conserva ceros y los long quedan como number', async () => {
    mockArcaFetch({ FECompConsultar: consulta('') });
    const { resultGet: r } = await new WsfeClient(false).consultarComprobante(AUTH, 1, 1, 12345678);
    expect(r.monId).toBe('060');
    expect(r.codAutorizacion).toBe('06123456789012');
    expect(r.docNro).toBe(30712345671);
    expect(r.cbteDesde).toBe(12345678);
    expect(r.impTotal).toBe(121.5);
    expect(r.monCotiz).toBe(1015.5);
    expect(r.cbteFch).toBe('20261030');
  });

  it('las listas son siempre arrays, dentro del contenedor del XML', async () => {
    const obs = (code: number) => `<Obs><Code>${code}</Code><Msg>obs ${code}</Msg></Obs>`;
    mockArcaFetch({
      FECompConsultar: [
        consulta(`<Iva><AlicIva><Id>5</Id><BaseImp>100.41</BaseImp><Importe>21.09</Importe></AlicIva></Iva>`),
        consulta(`<Opcionales><Opcional><Id>2101</Id><Valor>0000003100012345678901</Valor></Opcional></Opcionales>`),
      ],
      FECAESolicitar: wsfeResponse(
        'FECAESolicitar',
        '<FeCabResp><Cuit>20123456786</Cuit><PtoVta>1</PtoVta><CbteTipo>1</CbteTipo><CantReg>1</CantReg>' +
          '<Resultado>R</Resultado></FeCabResp><FeDetResp><FECAEDetResponse><Concepto>1</Concepto>' +
          '<DocTipo>80</DocTipo><DocNro>30712345671</DocNro><CbteDesde>12345678</CbteDesde>' +
          `<CbteHasta>12345678</CbteHasta><Resultado>R</Resultado><Observaciones>${obs(10016)}${obs(10048)}` +
          '</Observaciones></FECAEDetResponse></FeDetResp>',
      ),
    });
    const client = new WsfeClient(false);

    const conIva = await client.consultarComprobante(AUTH, 1, 1, 12345678);
    expect(conIva.resultGet.iva).toEqual([{ id: 5, baseImp: 100.41, importe: 21.09 }]);
    const conOpcional = await client.consultarComprobante(AUTH, 1, 1, 12345678);
    expect(conOpcional.resultGet.opcionales).toEqual([{ id: '2101', valor: '0000003100012345678901' }]);

    const rechazo = await client.solicitarCAE(AUTH, { ptoVta: 1, cbteTipo: 1, invoices: [DETALLE] });
    const [det] = rechazo.feDetResp;
    expect(rechazo.feDetResp).toHaveLength(1);
    expect(det).toMatchObject({
      docNro: 30712345671,
      observaciones: [
        { code: 10016, msg: 'obs 10016' },
        { code: 10048, msg: 'obs 10048' },
      ],
    });
    expect(rechazo.feCabResp.cuit).toBe(20123456786);
  });

  it('tablas: los códigos xs:string conservan el cero', async () => {
    mockArcaFetch({
      FEParamGetTiposMonedas: wsfeResponse(
        'FEParamGetTiposMonedas',
        '<ResultGet><Moneda><Id>060</Id><Desc>Euro</Desc><FchDesde>20090403</FchDesde><FchHasta>NULL</FchHasta></Moneda></ResultGet>',
      ),
    });
    expect(await new WsfeClient(false).getMonedas(AUTH)).toEqual([
      { id: '060', desc: 'Euro', fchDesde: '20090403', fchHasta: 'NULL' },
    ]);
  });

  it('consulta con un campo obligatorio no numérico: ArcaSoapError', async () => {
    mockArcaFetch({
      FECompUltimoAutorizado: wsfeResponse(
        'FECompUltimoAutorizado',
        '<PtoVta>1</PtoVta><CbteTipo>1</CbteTipo><CbteNro>abc</CbteNro>',
      ),
    });
    await expect(new WsfeClient(false).ultimoComprobante(AUTH, 1, 1)).rejects.toThrow(ArcaSoapError);
  });

  it('emisión con una respuesta de forma inválida: ArcaResultadoIncierto', async () => {
    mockArcaFetch({
      FECAESolicitar: wsfeResponse(
        'FECAESolicitar',
        '<FeCabResp><Cuit>20123456786</Cuit><PtoVta>1</PtoVta><CbteTipo>1</CbteTipo><CantReg>1</CantReg>' +
          '<Resultado>A</Resultado></FeCabResp><FeDetResp><FECAEDetResponse><Concepto>1</Concepto>' +
          '<DocTipo>80</DocTipo><DocNro>30712345671</DocNro><CbteDesde>x</CbteDesde><CbteHasta>x</CbteHasta>' +
          '<Resultado>A</Resultado><CAE>76123456789012</CAE></FECAEDetResponse></FeDetResp>',
      ),
    });
    await expect(
      new WsfeClient(false).solicitarCAE(AUTH, { ptoVta: 1, cbteTipo: 1, invoices: [DETALLE] }),
    ).rejects.toThrow(ArcaResultadoIncierto);
  });
});

describe('WSFEv1: requests con encodeRequest', () => {
  it('buildDetRequest ordena según el WSDL y omite los opcionales vacíos', () => {
    const det = buildDetRequest({
      ...DETALLE,
      actividades: [{ id: 620100 }],
      fchServDesde: '',
      tributos: [],
      monId: 'PES',
      cbtesAsoc: [{ tipo: 1, ptoVta: 1, nro: 7, cuit: '', cbteFch: '2026-10-29' }],
    });
    expect(orden(det)).toEqual([
      'Concepto',
      'DocTipo',
      'DocNro',
      'CbteDesde',
      'CbteHasta',
      'CbteFch',
      'ImpTotal',
      'ImpTotConc',
      'ImpNeto',
      'ImpOpEx',
      'ImpTrib',
      'ImpIVA',
      'MonId',
      'MonCotiz',
      'CondicionIVAReceptorId',
      'CbtesAsoc',
      'Iva',
      'Actividades',
    ]);
    expect(det.CbtesAsoc).toEqual({ CbteAsoc: [{ Tipo: 1, PtoVta: 1, Nro: 7, CbteFch: '20261029' }] });
  });

  it('acepta DocNro como string de dígitos (ej: un detalle persistido)', () => {
    expect(buildDetRequest({ ...DETALLE, docNro: '30712345671' as unknown as number }).DocNro).toBe('30712345671');
  });

  it('un tipo inválido lanza ArcaValidationError con la ruta del campo, sin llamar a ARCA', async () => {
    const mock = mockArcaFetch({});
    const bad = { ...DETALLE, docNro: 'abc' as unknown as number, impNeto: Number.NaN };
    const err = await new WsfeClient(false)
      .solicitarCAE(AUTH, { ptoVta: 1, cbteTipo: 1, invoices: [bad] })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ArcaValidationError);
    expect(err.details.map((d: { field: string }) => d.field)).toEqual(['feDetReq[0].docNro', 'feDetReq[0].impNeto']);
    expect(mock.calls).toHaveLength(0);
  });

  it('getCotizacion valida la fecha y la envía como AAAAMMDD', async () => {
    const mock = mockArcaFetch({
      FEParamGetCotizacion: wsfeResponse(
        'FEParamGetCotizacion',
        '<ResultGet><MonId>DOL</MonId><MonCotiz>1015.5</MonCotiz><FchCotiz>20261029</FchCotiz></ResultGet>',
      ),
    });
    const client = new WsfeClient(false);
    await expect(client.getCotizacion(AUTH, 'DOL', { fchCotiz: '2026-10-29' })).resolves.toEqual({
      monId: 'DOL',
      monCotiz: 1015.5,
      fchCotiz: '20261029',
    });
    expect(mock.last('FEParamGetCotizacion').params.FchCotiz).toBe('20261029');
    await expect(client.getCotizacion(AUTH, 'DOL', { fchCotiz: '20261332' })).rejects.toThrow(ArcaValidationError);
  });
});

const CMP_EXPO: WsfexInvoice = {
  id: 1,
  cbteTipo: 19,
  fechaCbte: '20261030',
  puntoVta: 1,
  cbteNro: 1,
  tipoExpo: 2,
  dstCmp: 203,
  cliente: 'Cliente SA',
  cuitPaisCliente: 55000002206,
  domicilioCliente: 'Calle 1',
  idImpositivo: '',
  monedaId: 'DOL',
  monedaCtz: 1015.5,
  impTotal: 100,
  idiomaCbte: 1,
  formaPago: 'Transferencia',
  items: [
    {
      proCodigo: '',
      proDs: 'Servicio',
      proQty: 1,
      proUmed: 7,
      proPrecioUni: 100,
      proBonificacion: 0,
      proTotalItem: 100,
    },
  ],
};

describe('WSFEX sobre el DSL', () => {
  it('buildFexCmp: orden del WSDL, sin opcionales vacíos', () => {
    const cmp = buildFexCmp({ ...CMP_EXPO, permisoExistente: '' });
    expect(orden(cmp)).toEqual([
      'Id',
      'Fecha_cbte',
      'Cbte_Tipo',
      'Punto_vta',
      'Cbte_nro',
      'Tipo_expo',
      'Permiso_existente',
      'Dst_cmp',
      'Cliente',
      'Cuit_pais_cliente',
      'Domicilio_cliente',
      'Moneda_Id',
      'Moneda_ctz',
      'Imp_total',
      'Forma_pago',
      'Idioma_cbte',
      'Items',
    ]);
    expect(cmp.Permiso_existente).toBe('');
    expect(cmp.Items).toEqual({ Item: [expect.not.objectContaining({ Pro_codigo: expect.anything() })] });
  });

  it('FEXGetCMP: CAE con cero inicial, CUIT país como string y listas como arrays', async () => {
    mockArcaFetch({
      FEXGetCMP: wsfexResponse(
        'FEXGetCMP',
        '<FEXResultGet><Id>1</Id><Fecha_cbte>20261030</Fecha_cbte><Cbte_tipo>19</Cbte_tipo><Punto_vta>1</Punto_vta>' +
          '<Cbte_nro>1</Cbte_nro><Tipo_expo>2</Tipo_expo><Dst_cmp>203</Dst_cmp><Cuit_pais_cliente>55000002206</Cuit_pais_cliente>' +
          '<Moneda_Id>DOL</Moneda_Id><Moneda_ctz>1015.500000</Moneda_ctz><Imp_total>100.00</Imp_total><Idioma_cbte>1</Idioma_cbte>' +
          '<Items><Item><Pro_codigo>007</Pro_codigo><Pro_ds>Servicio</Pro_ds><Pro_qty>1</Pro_qty><Pro_umed>7</Pro_umed>' +
          '<Pro_precio_uni>100</Pro_precio_uni><Pro_bonificacion>0</Pro_bonificacion><Pro_total_item>100</Pro_total_item></Item></Items>' +
          '<Cae>06123456789012</Cae><Resultado>A</Resultado></FEXResultGet>' +
          '<FEXErr><ErrCode>0</ErrCode><ErrMsg>OK</ErrMsg></FEXErr>',
      ),
    });
    const { fexResultGet: r } = await new WsfexClient(false).getCmp(AUTH, 19, 1, 1);
    expect(r).toMatchObject({
      cae: '06123456789012',
      cuitPaisCliente: '55000002206',
      monedaCtz: 1015.5,
      impTotal: 100,
      items: [{ proCodigo: '007', proQty: 1, proUmed: 7 }],
    });
  });

  it('FEXAuthorize con una respuesta de forma inválida: ArcaResultadoInciertoExpo', async () => {
    mockArcaFetch({
      FEXAuthorize: wsfexResponse(
        'FEXAuthorize',
        '<FEXResultAuth><Id>1</Id><Cuit>20123456786</Cuit><Cbte_tipo>19</Cbte_tipo><Punto_vta>1</Punto_vta>' +
          '<Cbte_nro>uno</Cbte_nro><Cae>76123456789012</Cae><Resultado>A</Resultado></FEXResultAuth>',
      ),
    });
    await expect(new WsfexClient(false).authorize(AUTH, CMP_EXPO)).rejects.toThrow(ArcaResultadoInciertoExpo);
  });

  it('un Cmp inválido lanza ArcaValidationError sin llamar a ARCA', async () => {
    const mock = mockArcaFetch({});
    await expect(
      new WsfexClient(false).authorize(AUTH, { ...CMP_EXPO, idiomaCbte: 'es' as unknown as number }),
    ).rejects.toThrow(ArcaValidationError);
    expect(mock.calls).toHaveLength(0);
  });
});
