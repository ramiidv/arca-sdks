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

const AUTH = { Token: 'TOKEN', Sign: 'SIGN', Cuit: 20123456786 };

const DETALLE: InvoiceDetail = {
  Concepto: 1,
  DocTipo: 80,
  DocNro: 30712345671,
  CbteDesde: 12345678,
  CbteHasta: 12345678,
  CbteFch: '20261030',
  ImpTotal: 121,
  ImpTotConc: 0,
  ImpNeto: 100,
  ImpOpEx: 0,
  ImpTrib: 0,
  ImpIVA: 21,
  MonId: 'PES',
  MonCotiz: 1,
  CondicionIVAReceptorId: 1,
  Iva: [{ Id: 5, BaseImp: 100, Importe: 21 }],
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
    const { ResultGet: r } = await new WsfeClient(false).consultarComprobante(AUTH, 1, 1, 12345678);
    expect(r.MonId).toBe('060');
    expect(r.CodAutorizacion).toBe('06123456789012');
    expect(r.DocNro).toBe(30712345671);
    expect(r.CbteDesde).toBe(12345678);
    expect(r.ImpTotal).toBe(121.5);
    expect(r.MonCotiz).toBe(1015.5);
    expect(r.CbteFch).toBe('20261030');
  });

  it('las listas conservan la cardinalidad del XML (X | X[])', async () => {
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
    expect(conIva.ResultGet.Iva).toEqual({ AlicIva: { Id: 5, BaseImp: 100.41, Importe: 21.09 } });
    const conOpcional = await client.consultarComprobante(AUTH, 1, 1, 12345678);
    expect(conOpcional.ResultGet.Opcionales).toEqual({ Opcional: { Id: '2101', Valor: '0000003100012345678901' } });

    const rechazo = await client.solicitarCAE(AUTH, { PtoVta: 1, CbteTipo: 1, invoices: [DETALLE] });
    const det = rechazo.FeDetResp.FECAEDetResponse;
    expect(Array.isArray(det)).toBe(false);
    expect(det).toMatchObject({
      DocNro: 30712345671,
      Observaciones: {
        Obs: [
          { Code: 10016, Msg: 'obs 10016' },
          { Code: 10048, Msg: 'obs 10048' },
        ],
      },
    });
    expect(rechazo.FeCabResp.Cuit).toBe(20123456786);
  });

  it('tablas: los códigos xs:string conservan el cero', async () => {
    mockArcaFetch({
      FEParamGetTiposMonedas: wsfeResponse(
        'FEParamGetTiposMonedas',
        '<ResultGet><Moneda><Id>060</Id><Desc>Euro</Desc><FchDesde>20090403</FchDesde><FchHasta>NULL</FchHasta></Moneda></ResultGet>',
      ),
    });
    expect(await new WsfeClient(false).getMonedas(AUTH)).toEqual([
      { Id: '060', Desc: 'Euro', FchDesde: '20090403', FchHasta: 'NULL' },
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
      new WsfeClient(false).solicitarCAE(AUTH, { PtoVta: 1, CbteTipo: 1, invoices: [DETALLE] }),
    ).rejects.toThrow(ArcaResultadoIncierto);
  });
});

describe('WSFEv1: requests con encodeRequest', () => {
  it('buildDetRequest ordena según el WSDL y omite los opcionales vacíos', () => {
    const det = buildDetRequest({
      ...DETALLE,
      Actividades: [{ Id: 620100 }],
      FchServDesde: '',
      Tributos: [],
      MonId: 'PES',
      CbtesAsoc: [{ Tipo: 1, PtoVta: 1, Nro: 7, Cuit: '', CbteFch: '2026-10-29' }],
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
    expect(buildDetRequest({ ...DETALLE, DocNro: '30712345671' as unknown as number }).DocNro).toBe('30712345671');
  });

  it('un tipo inválido lanza ArcaValidationError con la ruta del campo, sin llamar a ARCA', async () => {
    const mock = mockArcaFetch({});
    const bad = { ...DETALLE, DocNro: 'abc' as unknown as number, ImpNeto: Number.NaN };
    const err = await new WsfeClient(false)
      .solicitarCAE(AUTH, { PtoVta: 1, CbteTipo: 1, invoices: [bad] })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ArcaValidationError);
    expect(err.details.map((d: { field: string }) => d.field)).toEqual(['FeDetReq[0].DocNro', 'FeDetReq[0].ImpNeto']);
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
      MonId: 'DOL',
      MonCotiz: 1015.5,
      FchCotiz: '20261029',
    });
    expect(mock.last('FEParamGetCotizacion').params.FchCotiz).toBe('20261029');
    await expect(client.getCotizacion(AUTH, 'DOL', { fchCotiz: '20261332' })).rejects.toThrow(ArcaValidationError);
  });
});

const CMP_EXPO: WsfexInvoice = {
  Id: 1,
  Cbte_Tipo: 19,
  Fecha_cbte: '20261030',
  Punto_vta: 1,
  Cbte_nro: 1,
  Tipo_expo: 2,
  Dst_cmp: 203,
  Cliente: 'Cliente SA',
  Cuit_pais_cliente: 55000002206,
  Domicilio_cliente: 'Calle 1',
  Id_impositivo: '',
  Moneda_Id: 'DOL',
  Moneda_ctz: 1015.5,
  Imp_total: 100,
  Idioma_cbte: 1,
  Forma_pago: 'Transferencia',
  Items: [
    {
      Pro_codigo: '',
      Pro_ds: 'Servicio',
      Pro_qty: 1,
      Pro_umed: 7,
      Pro_precio_uni: 100,
      Pro_bonificacion: 0,
      Pro_total_item: 100,
    },
  ],
};

describe('WSFEX sobre el DSL', () => {
  it('buildFexCmp: orden del WSDL, sin opcionales vacíos', () => {
    const cmp = buildFexCmp({ ...CMP_EXPO, Permiso_existente: '' });
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

  it('FEXGetCMP: CAE con cero inicial, CUIT país como string y listas con su cardinalidad', async () => {
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
    const { FEXResultGet: r } = await new WsfexClient(false).getCmp(AUTH, 19, 1, 1);
    expect(r).toMatchObject({
      Cae: '06123456789012',
      Cuit_pais_cliente: '55000002206',
      Moneda_ctz: 1015.5,
      Imp_total: 100,
      Items: { Item: { Pro_codigo: '007', Pro_qty: 1, Pro_umed: 7 } },
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
      new WsfexClient(false).authorize(AUTH, { ...CMP_EXPO, Idioma_cbte: 'es' as unknown as number }),
    ).rejects.toThrow(ArcaValidationError);
    expect(mock.calls).toHaveLength(0);
  });
});
