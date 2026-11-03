import { describe, it, expect, vi } from 'vitest';
import { ArcaResponseError } from '@ramiidv/arca-common';
import { ArcaServiceError, ArcaSoapError, ArcaValidationError, CdcClient, ENDPOINTS } from '../src/index.js';
import type { ConstatarInput } from '../src/index.js';
import * as validation from '../src/validation.js';
import { asmxResponse, childOrder, CUIT, makeCdc, mockFetch, NS, requestBody } from './helpers.js';

const input: ConstatarInput = {
  cbteModo: 'CAE',
  cuitEmisor: '30-71234567-1',
  ptoVta: 1,
  cbteTipo: 1,
  cbteNro: 150,
  cbteFch: '2026-03-15',
  impTotal: 12100.456,
  codAutorizacion: '73429843294823',
  docTipoReceptor: 80,
  docNroReceptor: CUIT,
};

const CMP_RESP =
  '<CmpResp><CbteModo>CAE</CbteModo><CuitEmisor>30712345671</CuitEmisor><PtoVta>1</PtoVta>' +
  '<CbteTipo>1</CbteTipo><CbteNro>150</CbteNro><CbteFch>20260315</CbteFch><ImpTotal>12100.46</ImpTotal>' +
  `<CodAutorizacion>73429843294823</CodAutorizacion><DocTipoReceptor>80</DocTipoReceptor>` +
  `<DocNroReceptor>${CUIT}</DocNroReceptor></CmpResp>`;

describe('ComprobanteConstatar', () => {
  it('envía Auth + CmpReq calificados en el namespace del WSDL, en orden y con SOAPAction', async () => {
    const fetch = mockFetch(
      asmxResponse(
        'ComprobanteConstatar',
        `${CMP_RESP}<Resultado>A</Resultado><FchProceso>20261101120000</FchProceso>`,
      ),
    );
    await makeCdc(fetch).constatar(input);

    expect(fetch.calls).toHaveLength(1);
    const req = fetch.calls[0];
    expect(req.url).toBe(ENDPOINTS.wscdc.testing);
    expect(req.soapAction).toBe(`${NS}ComprobanteConstatar`);
    expect(req.headers.soapaction).toBe(`"${NS}ComprobanteConstatar"`);
    // Wrapper calificado con namespace por defecto; hijos sin prefijo (heredan el ns).
    expect(req.body).toContain(`<ComprobanteConstatar xmlns="${NS}">`);
    expect(req.body).not.toMatch(/<\w+:(Auth|CmpReq|CbteModo)/);
    expect(req.body).not.toContain('xmlns=""');

    expect(childOrder(req.body, 'ComprobanteConstatar')).toEqual(['Auth', 'CmpReq']);
    expect(childOrder(req.body, 'Auth')).toEqual(['Token', 'Sign', 'Cuit']);
    expect(childOrder(req.body, 'CmpReq')).toEqual([
      'CbteModo',
      'CuitEmisor',
      'PtoVta',
      'CbteTipo',
      'CbteNro',
      'CbteFch',
      'ImpTotal',
      'CodAutorizacion',
      'DocTipoReceptor',
      'DocNroReceptor',
    ]);

    const body = requestBody(req.body);
    const op = body['ComprobanteConstatar'] as Record<string, Record<string, unknown>>;
    expect(op['@_xmlns']).toBe(NS);
    expect(op.Auth).toEqual({ Token: 'TOKEN', Sign: 'SIGN', Cuit: CUIT });
    expect(op.CmpReq).toEqual({
      CbteModo: 'CAE',
      CuitEmisor: '30712345671',
      PtoVta: 1,
      CbteTipo: 1,
      CbteNro: 150,
      CbteFch: '20260315',
      ImpTotal: 12100.46,
      CodAutorizacion: '73429843294823',
      DocTipoReceptor: 80,
      DocNroReceptor: CUIT,
    });
  });

  it('omite el receptor si no se informa y envía Opcionales al final', async () => {
    const fetch = mockFetch(
      asmxResponse('ComprobanteConstatar', `<Resultado>A</Resultado><FchProceso>20261101120000</FchProceso>`),
    );
    const { docTipoReceptor: _t, docNroReceptor: _n, ...sinReceptor } = input;
    await makeCdc(fetch).constatar({
      ...sinReceptor,
      cbteTipo: 6,
      opcionales: [
        { id: '01', valor: 'uno' },
        { id: '2', valor: 'dos' },
      ],
    });
    const xml = fetch.calls[0].body;
    expect(childOrder(xml, 'CmpReq')).toEqual([
      'CbteModo',
      'CuitEmisor',
      'PtoVta',
      'CbteTipo',
      'CbteNro',
      'CbteFch',
      'ImpTotal',
      'CodAutorizacion',
      'Opcionales',
    ]);
    expect(childOrder(xml, 'Opcionales')).toEqual(['Opcional', 'Opcional']);
    expect(xml).toContain('<Id>01</Id>');
  });

  it('parsea una respuesta aprobada con CmpResp, FchProceso, observaciones y eventos', async () => {
    const fetch = mockFetch(
      asmxResponse(
        'ComprobanteConstatar',
        `${CMP_RESP}<Resultado>A</Resultado>` +
          '<Observaciones><Obs><Code>200</Code><Msg>Existe CAEA, no fue rendido.</Msg></Obs></Observaciones>' +
          '<FchProceso>20130724113214</FchProceso>' +
          '<Events><Evt><Code>1</Code><Msg>evento 1</Msg></Evt><Evt><Code>2</Code><Msg>evento 2</Msg></Evt></Events>',
      ),
    );
    const r = await makeCdc(fetch).constatar(input);
    expect(r).toEqual({
      resultado: 'A',
      fchProceso: '20130724113214',
      observaciones: [{ code: 200, msg: 'Existe CAEA, no fue rendido.' }],
      eventos: [
        { code: 1, msg: 'evento 1' },
        { code: 2, msg: 'evento 2' },
      ],
      cmpResp: {
        cbteModo: 'CAE',
        cuitEmisor: '30712345671',
        ptoVta: 1,
        cbteTipo: 1,
        cbteNro: 150,
        cbteFch: '20260315',
        impTotal: 12100.46,
        codAutorizacion: '73429843294823',
        docTipoReceptor: '80',
        docNroReceptor: CUIT,
      },
    });
  });

  it('un rechazo funcional devuelve R con varias observaciones (no lanza)', async () => {
    const fetch = mockFetch(
      asmxResponse(
        'ComprobanteConstatar',
        `${CMP_RESP}<Resultado>R</Resultado><Observaciones>` +
          '<Obs><Code>100</Code><Msg>No existe</Msg></Obs><Obs><Code>110</Code><Msg>Importe</Msg></Obs>' +
          '</Observaciones><FchProceso>20130912110834</FchProceso>',
      ),
    );
    const r = await makeCdc(fetch).constatar(input);
    expect(r.resultado).toBe('R');
    expect(r.observaciones.map((o) => o.code)).toEqual([100, 110]);
    expect(r.eventos).toEqual([]);
  });

  it('Resultado R con Errors (respuesta real ante token inválido) lanza ArcaServiceError', async () => {
    const fetch = mockFetch(
      asmxResponse(
        'ComprobanteConstatar',
        `${CMP_RESP}<Resultado>R</Resultado><Events><Evt><Code>0</Code></Evt></Events>` +
          '<Errors><Err><Code>600</Code><Msg>ValidacionDeToken: Error al verificar hash</Msg></Err></Errors>',
      ),
    );
    const err = await makeCdc(fetch)
      .constatar(input)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ArcaServiceError);
    expect((err as ArcaServiceError).errors).toEqual([
      { code: 600, msg: 'ValidacionDeToken: Error al verificar hash' },
    ]);
  });

  it('solo Errors (sin Resultado) lanza ArcaServiceError con todos los errores', async () => {
    const fetch = mockFetch(
      asmxResponse(
        'ComprobanteConstatar',
        '<Errors><Err><Code>2</Code><Msg>El campo CuitEmisor es invalido.</Msg></Err>' +
          '<Err><Code>10</Code><Msg>CodAutorizacion invalido</Msg></Err></Errors>',
      ),
    );
    const err = (await makeCdc(fetch)
      .constatar(input)
      .catch((e: unknown) => e)) as ArcaServiceError;
    expect(err).toBeInstanceOf(ArcaServiceError);
    expect(err.errors.map((e) => e.code)).toEqual([2, 10]);
  });

  it('sin Resultado ni Errors lanza ArcaResponseError (no inventa un resultado)', async () => {
    const fetch = mockFetch(asmxResponse('ComprobanteConstatar', '<FchProceso>20261101</FchProceso>'));
    const err = await makeCdc(fetch)
      .constatar(input)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ArcaResponseError);
    expect((err as ArcaResponseError).uncertain).toBe(false);
  });

  it('valida antes de llamar a ARCA', async () => {
    const fetch = mockFetch();
    await expect(makeCdc(fetch).constatar({ ...input, cuitEmisor: 30712345672 })).rejects.toBeInstanceOf(
      ArcaValidationError,
    );
    expect(fetch.calls).toHaveLength(0);
  });

  it('es una consulta: reintenta ante un 503', async () => {
    const fetch = mockFetch(
      new Response('Service Unavailable', { status: 503 }),
      asmxResponse('ComprobanteConstatar', '<Resultado>A</Resultado><FchProceso>20261101120000</FchProceso>'),
    );
    const r = await makeCdc(fetch, { retries: 1 }).constatar(input);
    expect(r.resultado).toBe('A');
    expect(fetch.calls).toHaveLength(2);
  });
});

describe('ComprobanteDummy', () => {
  it('envía el wrapper calificado vacío con su SOAPAction y no requiere auth', async () => {
    const fetch = mockFetch(
      asmxResponse('ComprobanteDummy', '<AppServer>OK</AppServer><DbServer>OK</DbServer><AuthServer>OK</AuthServer>'),
    );
    const status = await makeCdc(fetch, { production: true }).status();
    expect(status).toEqual({ appserver: 'OK', dbserver: 'OK', authserver: 'OK' });
    expect(fetch.calls[0].url).toBe(ENDPOINTS.wscdc.production);
    expect(fetch.calls[0].soapAction).toBe(`${NS}ComprobanteDummy`);
    expect(fetch.calls[0].headers.soapaction).toBe(`"${NS}ComprobanteDummy"`);
    expect(fetch.calls[0].body).toContain(`<ComprobanteDummy xmlns="${NS}"`);
    expect(fetch.calls[0].body).not.toContain('Auth');
  });

  it('lanza si falta un campo de la respuesta', async () => {
    const fetch = mockFetch(asmxResponse('ComprobanteDummy', '<AppServer>OK</AppServer>'));
    await expect(new CdcClient({ endpoint: 'https://x/', transport: { fetch } }).dummy()).rejects.toBeInstanceOf(
      ArcaResponseError,
    );
  });
});

describe('CdcClient y ENDPOINTS', () => {
  it('ENDPOINTS tiene la forma { wscdc: { testing, production } }', () => {
    expect(Object.keys(ENDPOINTS)).toEqual(['wscdc']);
    expect(ENDPOINTS.wscdc).toEqual({
      testing: 'https://wswhomo.afip.gov.ar/WSCDC/service.asmx',
      production: 'https://servicios1.afip.gov.ar/WSCDC/service.asmx',
    });
  });

  it('CdcClient recibe { endpoint, transport } y usa el transporte (fetch, onEvent)', async () => {
    const fetch = mockFetch(
      asmxResponse('ComprobanteDummy', '<AppServer>OK</AppServer><DbServer>OK</DbServer><AuthServer>OK</AuthServer>'),
    );
    const onEvent = vi.fn();
    const client = new CdcClient({ endpoint: 'https://proxy.local/wscdc', transport: { fetch, onEvent } });
    expect(client.endpoint).toBe('https://proxy.local/wscdc');
    expect(client.namespace).toBe(NS);
    await client.dummy();
    expect(fetch.calls[0].url).toBe('https://proxy.local/wscdc');
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'request:start' }));
  });

  it('config.endpoints.wscdc tiene prioridad sobre production', async () => {
    const fetch = mockFetch(
      asmxResponse('ComprobanteDummy', '<AppServer>OK</AppServer><DbServer>OK</DbServer><AuthServer>OK</AuthServer>'),
    );
    const cdc = makeCdc(fetch, { production: true, endpoints: { wscdc: 'https://proxy.local/wscdc' } });
    expect(cdc.client.endpoint).toBe('https://proxy.local/wscdc');
  });
});

describe('ComprobantesModalidadConsultar', () => {
  it('envía Auth y parsea un solo FacModTipo', async () => {
    const fetch = mockFetch(
      asmxResponse(
        'ComprobantesModalidadConsultar',
        '<ResultGet><FacModTipo><Cod>CAE</Cod><Desc>Autorizado mediante CAE</Desc></FacModTipo></ResultGet>',
      ),
    );
    const r = await makeCdc(fetch).getModalidades();
    expect(r).toEqual([{ cod: 'CAE', desc: 'Autorizado mediante CAE' }]);
    expect(fetch.calls[0].soapAction).toBe(`${NS}ComprobantesModalidadConsultar`);
    expect(fetch.calls[0].headers.soapaction).toBe(`"${NS}ComprobantesModalidadConsultar"`);
    expect(fetch.calls[0].body).toContain(`<ComprobantesModalidadConsultar xmlns="${NS}">`);
    expect(childOrder(fetch.calls[0].body, 'ComprobantesModalidadConsultar')).toEqual(['Auth']);
    expect(childOrder(fetch.calls[0].body, 'Auth')).toEqual(['Token', 'Sign', 'Cuit']);
  });

  it('parsea N FacModTipo', async () => {
    const fetch = mockFetch(
      asmxResponse(
        'ComprobantesModalidadConsultar',
        '<ResultGet>' +
          '<FacModTipo><Cod>CAE</Cod><Desc>CAE</Desc></FacModTipo>' +
          '<FacModTipo><Cod>CAI</Cod><Desc>CAI</Desc><FchDesde>20130101</FchDesde></FacModTipo>' +
          '<FacModTipo><Cod>CAEA</Cod><Desc>CAEA</Desc><FchDesde>20130101</FchDesde><FchHasta>NULL</FchHasta></FacModTipo>' +
          '</ResultGet><Events><Evt><Code>0</Code></Evt></Events>',
      ),
    );
    const r = await makeCdc(fetch).getModalidades();
    expect(r).toEqual([
      { cod: 'CAE', desc: 'CAE' },
      { cod: 'CAI', desc: 'CAI', fchDesde: '20130101' },
      { cod: 'CAEA', desc: 'CAEA', fchDesde: '20130101', fchHasta: 'NULL' },
    ]);
  });

  it('Errors lanza ArcaServiceError (nunca lista vacía)', async () => {
    const fetch = mockFetch(
      asmxResponse(
        'ComprobantesModalidadConsultar',
        '<Errors><Err><Code>600</Code><Msg>Token invalido</Msg></Err></Errors>',
      ),
    );
    await expect(makeCdc(fetch).getModalidades()).rejects.toBeInstanceOf(ArcaServiceError);
  });
});

describe('Tablas de parámetros', () => {
  it('ComprobantesTipoConsultar: 1 y N tipos (Id numérico)', async () => {
    const fetch = mockFetch(
      asmxResponse(
        'ComprobantesTipoConsultar',
        '<ResultGet><CbteTipo><Id>1</Id><Desc>Factura A</Desc></CbteTipo></ResultGet>',
      ),
      asmxResponse(
        'ComprobantesTipoConsultar',
        '<ResultGet><CbteTipo><Id>1</Id><Desc>Factura A</Desc></CbteTipo><CbteTipo><Id>6</Id><Desc>Factura B</Desc></CbteTipo></ResultGet>',
      ),
    );
    const cdc = makeCdc(fetch);
    expect(await cdc.getTiposCbte()).toEqual([{ id: 1, desc: 'Factura A' }]);
    expect(await cdc.getTiposCbte()).toEqual([
      { id: 1, desc: 'Factura A' },
      { id: 6, desc: 'Factura B' },
    ]);
    expect(fetch.calls[0].soapAction).toBe(`${NS}ComprobantesTipoConsultar`);
    expect(fetch.calls[0].headers.soapaction).toBe(`"${NS}ComprobantesTipoConsultar"`);
  });

  it('DocumentosTipoConsultar: Id string, 1 y N', async () => {
    const fetch = mockFetch(
      asmxResponse('DocumentosTipoConsultar', '<ResultGet><DocTipo><Id>80</Id><Desc>CUIT</Desc></DocTipo></ResultGet>'),
      asmxResponse(
        'DocumentosTipoConsultar',
        '<ResultGet><DocTipo><Id>80</Id><Desc>CUIT</Desc></DocTipo><DocTipo><Id>96</Id><Desc>DNI</Desc></DocTipo></ResultGet>',
      ),
    );
    const cdc = makeCdc(fetch);
    expect(await cdc.getDocTipos()).toEqual([{ id: '80', desc: 'CUIT' }]);
    expect(await cdc.getDocTipos()).toEqual([
      { id: '80', desc: 'CUIT' },
      { id: '96', desc: 'DNI' },
    ]);
    expect(fetch.calls[0].soapAction).toBe(`${NS}DocumentosTipoConsultar`);
    expect(fetch.calls[0].headers.soapaction).toBe(`"${NS}DocumentosTipoConsultar"`);
  });

  it('OpcionalesTipoConsultar: 1 y N, envía Auth y SOAPAction', async () => {
    const fetch = mockFetch(
      asmxResponse(
        'OpcionalesTipoConsultar',
        '<ResultGet><OpcionalTipo><Id>01</Id><Desc>Uno</Desc></OpcionalTipo></ResultGet>',
      ),
      asmxResponse(
        'OpcionalesTipoConsultar',
        '<ResultGet><OpcionalTipo><Id>01</Id><Desc>Uno</Desc></OpcionalTipo><OpcionalTipo><Id>2</Id><Desc>Dos</Desc></OpcionalTipo></ResultGet>',
      ),
    );
    const cdc = makeCdc(fetch);
    expect(await cdc.getTiposOpcionales()).toEqual([{ id: '01', desc: 'Uno' }]);
    expect(await cdc.getTiposOpcionales()).toEqual([
      { id: '01', desc: 'Uno' },
      { id: '2', desc: 'Dos' },
    ]);
    expect(fetch.calls[0].soapAction).toBe(`${NS}OpcionalesTipoConsultar`);
    expect(fetch.calls[0].headers.soapaction).toBe(`"${NS}OpcionalesTipoConsultar"`);
    expect(fetch.calls[0].body).toContain(`<OpcionalesTipoConsultar xmlns="${NS}">`);
    expect(childOrder(fetch.calls[0].body, 'Auth')).toEqual(['Token', 'Sign', 'Cuit']);
  });

  it('ResultGet vacío sin errores devuelve []', async () => {
    const fetch = mockFetch(asmxResponse('DocumentosTipoConsultar', '<ResultGet />'));
    expect(await makeCdc(fetch).getDocTipos()).toEqual([]);
  });

  it('Errors lanza ArcaServiceError', async () => {
    const fetch = mockFetch(
      asmxResponse('ComprobantesTipoConsultar', '<Errors><Err><Code>500</Code><Msg>Error interno</Msg></Err></Errors>'),
    );
    await expect(makeCdc(fetch).getTiposCbte()).rejects.toMatchObject({
      errors: [{ code: 500, msg: 'Error interno' }],
    });
  });
});

describe('ArcaCdc', () => {
  it('valida el CUIT de la config', () => {
    const fetch = mockFetch();
    expect(() => makeCdc(fetch, { cuit: 20123456789 })).toThrow(ArcaValidationError);
  });

  it('usa endpoints propios', async () => {
    const fetch = mockFetch(
      asmxResponse('ComprobanteDummy', '<AppServer>OK</AppServer><DbServer>OK</DbServer><AuthServer>OK</AuthServer>'),
    );
    await makeCdc(fetch, { endpoints: { wscdc: 'https://proxy.local/cdc' } }).status();
    expect(fetch.calls[0].url).toBe('https://proxy.local/cdc');
  });

  it('clearAuthCache es async', async () => {
    const fetch = mockFetch();
    await expect(makeCdc(fetch).clearAuthCache()).resolves.toBeUndefined();
  });

  it('config.signal cancela las llamadas de la instancia', async () => {
    const fetch = mockFetch();
    const ac = new AbortController();
    ac.abort();
    await expect(makeCdc(fetch, { signal: ac.signal }).status()).rejects.toBeInstanceOf(ArcaSoapError);
    expect(fetch.calls).toHaveLength(0);
  });

  it('emite eventos de request a on() y a config.onEvent', async () => {
    const fetch = mockFetch(
      asmxResponse('ComprobanteDummy', '<AppServer>OK</AppServer><DbServer>OK</DbServer><AuthServer>OK</AuthServer>'),
    );
    const fromConfig: string[] = [];
    const fromOn: string[] = [];
    const cdc = makeCdc(fetch, { onEvent: (e) => fromConfig.push(e.type) });
    cdc.on('request:end', (e) => fromOn.push(e.type));
    await cdc.status();
    expect(fromOn).toEqual(['request:end']);
    expect(fromConfig).toContain('request:end');
  });

  it('acepta un AbortSignal', async () => {
    const fetch = mockFetch();
    const ac = new AbortController();
    ac.abort();
    await expect(makeCdc(fetch).status({ signal: ac.signal })).rejects.toBeInstanceOf(ArcaSoapError);
  });
});

describe('Decodificación de respuestas (texto, sin perder ceros)', () => {
  it('preserva ceros a la izquierda de los xs:string (Id de tablas, documento, CAE)', async () => {
    const fetch = mockFetch(
      asmxResponse(
        'OpcionalesTipoConsultar',
        '<ResultGet><OpcionalTipo><Id>0012</Id><Desc>Doce</Desc></OpcionalTipo></ResultGet>',
      ),
      asmxResponse(
        'DocumentosTipoConsultar',
        '<ResultGet><DocTipo><Id>080</Id><Desc>CUIT</Desc></DocTipo></ResultGet>',
      ),
      asmxResponse(
        'ComprobanteConstatar',
        '<CmpResp><CbteModo>CAE</CbteModo><CuitEmisor>30712345671</CuitEmisor><PtoVta>00001</PtoVta>' +
          '<CbteTipo>1</CbteTipo><CbteNro>150</CbteNro><CbteFch>20260315</CbteFch><ImpTotal>100.50</ImpTotal>' +
          '<CodAutorizacion>07342984329482</CodAutorizacion><DocTipoReceptor>96</DocTipoReceptor>' +
          '<DocNroReceptor>0012345678</DocNroReceptor>' +
          '<Opcionales><Opcional><Id>01</Id><Valor>0099</Valor></Opcional><Opcional><Id>2</Id></Opcional></Opcionales>' +
          '</CmpResp><Resultado>A</Resultado><FchProceso>20261101120000</FchProceso>',
      ),
    );
    const cdc = makeCdc(fetch);
    expect(await cdc.getTiposOpcionales()).toEqual([{ id: '0012', desc: 'Doce' }]);
    expect(await cdc.getDocTipos()).toEqual([{ id: '080', desc: 'CUIT' }]);
    const r = await cdc.constatar(input);
    expect(r.cmpResp).toEqual({
      cbteModo: 'CAE',
      cuitEmisor: '30712345671',
      ptoVta: 1,
      cbteTipo: 1,
      cbteNro: 150,
      cbteFch: '20260315',
      impTotal: 100.5,
      codAutorizacion: '07342984329482',
      docTipoReceptor: '96',
      docNroReceptor: '0012345678',
      opcionales: [
        { id: '01', valor: '0099' },
        { id: '2', valor: '' },
      ],
    });
  });

  it('ignora elementos vacíos e ítems nil; Msg ausente es ""', async () => {
    const fetch = mockFetch(
      asmxResponse(
        'ComprobantesModalidadConsultar',
        '<ResultGet><FacModTipo><Cod>CAE</Cod><Desc>CAE</Desc><FchDesde /><FchHasta></FchHasta></FacModTipo><FacModTipo /></ResultGet>',
      ),
      asmxResponse(
        'ComprobanteConstatar',
        '<CmpResp /><Resultado>R</Resultado><Observaciones><Obs /><Obs><Code>100</Code></Obs></Observaciones>' +
          '<FchProceso>20261101120000</FchProceso><Events><Evt /></Events>',
      ),
    );
    const cdc = makeCdc(fetch);
    expect(await cdc.getModalidades()).toEqual([{ cod: 'CAE', desc: 'CAE' }]);
    expect(await cdc.constatar(input)).toEqual({
      resultado: 'R',
      fchProceso: '20261101120000',
      observaciones: [{ code: 100, msg: '' }],
      eventos: [],
    });
  });

  it('respuestas con forma inválida lanzan ArcaResponseError (no incierto: son consultas)', async () => {
    const fetch = mockFetch(
      asmxResponse('ComprobantesTipoConsultar', '<ResultGet><CbteTipo><Id>X</Id><Desc>A</Desc></CbteTipo></ResultGet>'),
      asmxResponse('DocumentosTipoConsultar', '<ResultGet><DocTipo><Desc>CUIT</Desc></DocTipo></ResultGet>'),
      asmxResponse('ComprobanteConstatar', '<Resultado>X</Resultado><FchProceso>20261101120000</FchProceso>'),
      asmxResponse(
        'ComprobanteConstatar',
        '<CmpResp><CbteModo>CAE</CbteModo></CmpResp><Resultado>A</Resultado><FchProceso>1</FchProceso>',
      ),
    );
    const cdc = makeCdc(fetch);
    const cases: [() => Promise<unknown>, RegExp][] = [
      [() => cdc.getTiposCbte(), /ComprobantesTipoConsultar\.resultGet\[0\]\.id no es numérico/],
      [() => cdc.getDocTipos(), /falta DocumentosTipoConsultar\.resultGet\[0\]\.id/],
      [() => cdc.constatar(input), /Resultado desconocido "X"/],
      [() => cdc.constatar(input), /falta ComprobanteConstatar\.CmpResp\.cuitEmisor/],
    ];
    for (const [call, message] of cases) {
      const err = await call().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ArcaResponseError);
      expect(err).not.toBeInstanceOf(ArcaSoapError);
      expect((err as ArcaResponseError).uncertain).toBe(false);
      expect((err as Error).message).toMatch(message);
    }
  });
});

describe('Casos borde de las respuestas', () => {
  it('R con CmpResp incompleto devuelve resultado y observaciones sin cmpResp', async () => {
    const fetch = mockFetch(
      asmxResponse(
        'ComprobanteConstatar',
        '<CmpResp><CuitEmisor>30712345671</CuitEmisor><PtoVta>1</PtoVta><CbteTipo>1</CbteTipo><CbteNro>150</CbteNro>' +
          '<ImpTotal>0</ImpTotal></CmpResp><Resultado>R</Resultado>' +
          '<Observaciones><Obs><Code>100</Code><Msg>El codigo de autorizacion no existe</Msg></Obs></Observaciones>' +
          '<FchProceso>20261101120000</FchProceso>',
      ),
    );
    const r = await makeCdc(fetch).constatar(input);
    expect(r).toEqual({
      resultado: 'R',
      fchProceso: '20261101120000',
      observaciones: [{ code: 100, msg: 'El codigo de autorizacion no existe' }],
      eventos: [],
    });
  });

  it('A con CmpResp incompleto sigue lanzando ArcaResponseError', async () => {
    const fetch = mockFetch(
      asmxResponse(
        'ComprobanteConstatar',
        '<CmpResp><CuitEmisor>30712345671</CuitEmisor></CmpResp><Resultado>A</Resultado><FchProceso>1</FchProceso>',
      ),
    );
    await expect(makeCdc(fetch).constatar(input)).rejects.toBeInstanceOf(ArcaResponseError);
  });

  it('tablas: Desc ausente o vacío queda como ""', async () => {
    const fetch = mockFetch(
      asmxResponse(
        'DocumentosTipoConsultar',
        '<ResultGet><DocTipo><Id>80</Id><Desc /></DocTipo><DocTipo><Id>96</Id></DocTipo></ResultGet>',
      ),
      asmxResponse('ComprobantesModalidadConsultar', '<ResultGet><FacModTipo><Cod>CAE</Cod></FacModTipo></ResultGet>'),
    );
    const cdc = makeCdc(fetch);
    expect(await cdc.getDocTipos()).toEqual([
      { id: '80', desc: '' },
      { id: '96', desc: '' },
    ]);
    expect(await cdc.getModalidades()).toEqual([{ cod: 'CAE', desc: '' }]);
  });

  it('tablas: los Events quedan en lista.eventos (no enumerable)', async () => {
    const fetch = mockFetch(
      asmxResponse(
        'ComprobantesTipoConsultar',
        '<ResultGet><CbteTipo><Id>1</Id><Desc>Factura A</Desc></CbteTipo></ResultGet>' +
          '<Events><Evt><Code>10</Code><Msg>Mantenimiento programado</Msg></Evt></Events>',
      ),
      asmxResponse(
        'ComprobantesTipoConsultar',
        '<ResultGet><CbteTipo><Id>1</Id><Desc>Factura A</Desc></CbteTipo></ResultGet>',
      ),
    );
    const cdc = makeCdc(fetch);
    const tipos = await cdc.getTiposCbte();
    expect(tipos).toEqual([{ id: 1, desc: 'Factura A' }]);
    expect(tipos.eventos).toEqual([{ code: 10, msg: 'Mantenimiento programado' }]);
    expect(Object.keys(tipos)).toEqual(['0']);
    expect(JSON.stringify(tipos)).not.toContain('eventos');
    const sinEventos = await cdc.getTiposCbte();
    expect(sinEventos.eventos).toBeUndefined();
  });

  it('Errors con todos los códigos en 0 no lanza', async () => {
    const fetch = mockFetch(
      asmxResponse(
        'ComprobanteConstatar',
        `${CMP_RESP}<Resultado>A</Resultado><FchProceso>20261101120000</FchProceso>` +
          '<Errors><Err><Code>0</Code><Msg>OK</Msg></Err></Errors>',
      ),
      asmxResponse(
        'DocumentosTipoConsultar',
        '<ResultGet><DocTipo><Id>80</Id><Desc>CUIT</Desc></DocTipo></ResultGet><Errors><Err><Code>0</Code></Err></Errors>',
      ),
    );
    const cdc = makeCdc(fetch);
    expect((await cdc.constatar(input)).resultado).toBe('A');
    expect(await cdc.getDocTipos()).toEqual([{ id: '80', desc: 'CUIT' }]);
  });

  it('error 503 ("No existen datos en nuestros registros") lanza ArcaServiceError', async () => {
    const fetch = mockFetch(
      asmxResponse(
        'ComprobanteConstatar',
        '<Resultado>R</Resultado><Errors><Err><Code>503</Code><Msg>No existen datos en nuestros registros.</Msg></Err></Errors>',
      ),
    );
    await expect(makeCdc(fetch).constatar(input)).rejects.toMatchObject({
      name: 'ArcaServiceError',
      errors: [{ code: 503, msg: 'No existen datos en nuestros registros.' }],
    });
  });
});

describe('Validación del input y de Auth', () => {
  it('docTipoReceptor distinto de 80 acepta un docNro que no es CUIT', async () => {
    const fetch = mockFetch(
      asmxResponse('ComprobanteConstatar', '<Resultado>A</Resultado><FchProceso>20261101120000</FchProceso>'),
    );
    await makeCdc(fetch).constatar({ ...input, cbteTipo: 6, docTipoReceptor: 96, docNroReceptor: '12345678' });
    const op = requestBody(fetch.calls[0].body)['ComprobanteConstatar'] as Record<string, Record<string, unknown>>;
    expect(op.CmpReq.DocTipoReceptor).toBe(96);
    expect(String(op.CmpReq.DocNroReceptor)).toBe('12345678');
  });

  it('docTipoReceptor 80 valida el dígito verificador del docNro', async () => {
    const fetch = mockFetch();
    await expect(makeCdc(fetch).constatar({ ...input, docNroReceptor: '20123456789' })).rejects.toBeInstanceOf(
      ArcaValidationError,
    );
    expect(fetch.calls).toHaveLength(0);
  });

  it('CdcClient valida la CUIT de Auth y la envía normalizada', async () => {
    const fetch = mockFetch(
      asmxResponse('DocumentosTipoConsultar', '<ResultGet><DocTipo><Id>80</Id><Desc>CUIT</Desc></DocTipo></ResultGet>'),
    );
    const client = new CdcClient({ endpoint: 'https://x/', transport: { fetch } });
    await expect(client.getDocTipos({ token: 'T', sign: 'S', cuit: '20123456789' })).rejects.toBeInstanceOf(
      ArcaValidationError,
    );
    await expect(client.constatar({ token: 'T', sign: 'S', cuit: 'abc' }, input)).rejects.toBeInstanceOf(
      ArcaValidationError,
    );
    expect(fetch.calls).toHaveLength(0);

    await client.getDocTipos({ token: 'T', sign: 'S', cuit: '20-12345678-6' });
    const op = requestBody(fetch.calls[0].body)['DocumentosTipoConsultar'] as Record<string, Record<string, unknown>>;
    expect(op.Auth.Cuit).toBe(CUIT);
  });

  it('ArcaCdc valida una sola vez y antes de autenticarse', async () => {
    const fetch = mockFetch(
      asmxResponse('ComprobanteConstatar', '<Resultado>A</Resultado><FchProceso>20261101120000</FchProceso>'),
    );
    const cdc = makeCdc(fetch);
    const validar = vi.spyOn(validation, 'buildCmpReq');
    await cdc.constatar(input);
    expect(validar).toHaveBeenCalledTimes(1);
    validar.mockRestore();
  });
});

/** Respuestas reales de WSCDC en homologación. */
describe('comportamiento de ARCA en homologación', () => {
  const SIN_EVENTOS = '<Events><Evt><Code>0</Code></Evt></Events>';
  const sinResultados = (method: string) =>
    asmxResponse(
      method,
      `<Errors><Err><Code>503</Code><Msg>Sin Resultados: - Metodo ${method}</Msg></Err></Errors>${SIN_EVENTOS}`,
    );

  it('tablas: 503 "Sin Resultados" devuelve [] (OpcionalesTipoConsultar en homologación)', async () => {
    const fetch = mockFetch(
      sinResultados('OpcionalesTipoConsultar'),
      sinResultados('DocumentosTipoConsultar'),
      asmxResponse(
        'ComprobantesModalidadConsultar',
        '<Errors><Err><Code>503</Code><Msg>Sin Resultados: - Metodo ComprobantesModalidadConsultar</Msg></Err></Errors>' +
          '<Events><Evt><Code>10</Code><Msg>Mantenimiento programado</Msg></Evt></Events>',
      ),
    );
    const cdc = makeCdc(fetch);
    const opcionales = await cdc.getTiposOpcionales();
    expect(opcionales).toEqual([]);
    expect(opcionales.eventos).toBeUndefined();
    expect(await cdc.getDocTipos()).toEqual([]);
    const modalidades = await cdc.getModalidades();
    expect(modalidades).toEqual([]);
    expect(modalidades.eventos).toEqual([{ code: 10, msg: 'Mantenimiento programado' }]);
    expect(fetch.calls).toHaveLength(3);
  });

  it('tablas: otros 503, o 503 "Sin Resultados" junto a otro error, siguen lanzando ArcaServiceError', async () => {
    const fetch = mockFetch(
      asmxResponse(
        'OpcionalesTipoConsultar',
        '<Errors><Err><Code>503</Code><Msg>No existen datos en nuestros registros.</Msg></Err></Errors>',
      ),
      asmxResponse(
        'OpcionalesTipoConsultar',
        '<Errors><Err><Code>503</Code><Msg>Sin Resultados</Msg></Err><Err><Code>600</Code><Msg>Token invalido</Msg></Err></Errors>',
      ),
      asmxResponse('OpcionalesTipoConsultar', '<Errors><Err><Code>502</Code><Msg>Sin Resultados</Msg></Err></Errors>'),
    );
    const cdc = makeCdc(fetch);
    await expect(cdc.getTiposOpcionales()).rejects.toMatchObject({ name: 'ArcaServiceError', errors: [{ code: 503 }] });
    await expect(cdc.getTiposOpcionales()).rejects.toBeInstanceOf(ArcaServiceError);
    await expect(cdc.getTiposOpcionales()).rejects.toMatchObject({ errors: [{ code: 502 }] });
  });

  it('constatar: 503 "Sin Resultados" lanza (solo las tablas lo toman como vacío)', async () => {
    const fetch = mockFetch(
      asmxResponse(
        'ComprobanteConstatar',
        '<Resultado>R</Resultado><Errors><Err><Code>503</Code><Msg>Sin Resultados</Msg></Err></Errors>',
      ),
    );
    await expect(makeCdc(fetch).constatar(input)).rejects.toBeInstanceOf(ArcaServiceError);
  });

  it('Events con código 0 (sin Msg) no son eventos: tablas sin lista.eventos y constatar con eventos []', async () => {
    const fetch = mockFetch(
      asmxResponse(
        'DocumentosTipoConsultar',
        `<ResultGet><DocTipo><Id>80</Id><Desc>CUIT</Desc></DocTipo><DocTipo><Id>96</Id><Desc>DNI</Desc></DocTipo></ResultGet>${SIN_EVENTOS}`,
      ),
      asmxResponse(
        'ComprobanteConstatar',
        `${CMP_RESP}<Resultado>A</Resultado><FchProceso>20261103181118</FchProceso>${SIN_EVENTOS}`,
      ),
      asmxResponse(
        'ComprobanteConstatar',
        `${CMP_RESP}<Resultado>A</Resultado><FchProceso>20261103181118</FchProceso>` +
          '<Events><Evt><Code>0</Code></Evt><Evt><Code>7</Code><Msg>Aviso</Msg></Evt></Events>',
      ),
    );
    const cdc = makeCdc(fetch);
    const docs = await cdc.getDocTipos();
    expect(docs).toEqual([
      { id: '80', desc: 'CUIT' },
      { id: '96', desc: 'DNI' },
    ]);
    expect(docs.eventos).toBeUndefined();
    const r = await cdc.constatar(input);
    expect(r.resultado).toBe('A');
    expect(r.eventos).toEqual([]);
    expect((await cdc.constatar(input)).eventos).toEqual([{ code: 7, msg: 'Aviso' }]);
  });
});
