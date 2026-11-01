import { describe, it, expect } from 'vitest';
import { ArcaServiceError, ArcaSoapError, ArcaValidationError, CdcClient, WSCDC_ENDPOINTS } from '../src/index.js';
import type { ConstatarInput } from '../src/index.js';
import { asmxResponse, childOrder, CUIT, makeCdc, mockFetch, NS, requestBody } from './helpers.js';

const input: ConstatarInput = {
  CbteModo: 'CAE',
  CuitEmisor: '30-71234567-1',
  PtoVta: 1,
  CbteTipo: 1,
  CbteNro: 150,
  CbteFch: '2026-03-15',
  ImpTotal: 12100.456,
  CodAutorizacion: '73429843294823',
  DocTipoReceptor: 80,
  DocNroReceptor: CUIT,
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
    expect(req.url).toBe(WSCDC_ENDPOINTS.testing);
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
    const { DocTipoReceptor: _t, DocNroReceptor: _n, ...sinReceptor } = input;
    await makeCdc(fetch).constatar({
      ...sinReceptor,
      CbteTipo: 6,
      Opcionales: [
        { Id: '01', Valor: 'uno' },
        { Id: '2', Valor: 'dos' },
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
      Resultado: 'A',
      FchProceso: '20130724113214',
      Observaciones: [{ Code: 200, Msg: 'Existe CAEA, no fue rendido.' }],
      Events: [
        { Code: 1, Msg: 'evento 1' },
        { Code: 2, Msg: 'evento 2' },
      ],
      CmpResp: {
        CbteModo: 'CAE',
        CuitEmisor: '30712345671',
        PtoVta: 1,
        CbteTipo: 1,
        CbteNro: 150,
        CbteFch: '20260315',
        ImpTotal: 12100.46,
        CodAutorizacion: '73429843294823',
        DocTipoReceptor: '80',
        DocNroReceptor: CUIT,
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
    expect(r.Resultado).toBe('R');
    expect(r.Observaciones.map((o) => o.Code)).toEqual([100, 110]);
    expect(r.Events).toEqual([]);
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

  it('sin Resultado ni Errors lanza (no inventa un resultado)', async () => {
    const fetch = mockFetch(asmxResponse('ComprobanteConstatar', '<FchProceso>20261101</FchProceso>'));
    await expect(makeCdc(fetch).constatar(input)).rejects.toBeInstanceOf(ArcaSoapError);
  });

  it('valida antes de llamar a ARCA', async () => {
    const fetch = mockFetch();
    await expect(makeCdc(fetch).constatar({ ...input, CuitEmisor: 30712345672 })).rejects.toBeInstanceOf(
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
    expect(r.Resultado).toBe('A');
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
    expect(fetch.calls[0].url).toBe(WSCDC_ENDPOINTS.production);
    expect(fetch.calls[0].soapAction).toBe(`${NS}ComprobanteDummy`);
    expect(fetch.calls[0].headers.soapaction).toBe(`"${NS}ComprobanteDummy"`);
    expect(fetch.calls[0].body).toContain(`<ComprobanteDummy xmlns="${NS}"`);
    expect(fetch.calls[0].body).not.toContain('Auth');
  });

  it('lanza si falta un campo de la respuesta', async () => {
    const fetch = mockFetch(asmxResponse('ComprobanteDummy', '<AppServer>OK</AppServer>'));
    await expect(new CdcClient({ endpoint: 'https://x/', fetch }).dummy()).rejects.toBeInstanceOf(ArcaSoapError);
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
    expect(r).toEqual([{ Cod: 'CAE', Desc: 'Autorizado mediante CAE' }]);
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
      { Cod: 'CAE', Desc: 'CAE' },
      { Cod: 'CAI', Desc: 'CAI', FchDesde: '20130101' },
      { Cod: 'CAEA', Desc: 'CAEA', FchDesde: '20130101', FchHasta: 'NULL' },
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
    expect(await cdc.getTiposCbte()).toEqual([{ Id: 1, Desc: 'Factura A' }]);
    expect(await cdc.getTiposCbte()).toEqual([
      { Id: 1, Desc: 'Factura A' },
      { Id: 6, Desc: 'Factura B' },
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
    expect(await cdc.getDocTipos()).toEqual([{ Id: '80', Desc: 'CUIT' }]);
    expect(await cdc.getDocTipos()).toEqual([
      { Id: '80', Desc: 'CUIT' },
      { Id: '96', Desc: 'DNI' },
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
    expect(await cdc.getTiposOpcionales()).toEqual([{ Id: '01', Desc: 'Uno' }]);
    expect(await cdc.getTiposOpcionales()).toEqual([
      { Id: '01', Desc: 'Uno' },
      { Id: '2', Desc: 'Dos' },
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
    expect(await cdc.getTiposOpcionales()).toEqual([{ Id: '0012', Desc: 'Doce' }]);
    expect(await cdc.getDocTipos()).toEqual([{ Id: '080', Desc: 'CUIT' }]);
    const r = await cdc.constatar(input);
    expect(r.CmpResp).toEqual({
      CbteModo: 'CAE',
      CuitEmisor: '30712345671',
      PtoVta: 1,
      CbteTipo: 1,
      CbteNro: 150,
      CbteFch: '20260315',
      ImpTotal: 100.5,
      CodAutorizacion: '07342984329482',
      DocTipoReceptor: '96',
      DocNroReceptor: '0012345678',
      Opcionales: [
        { Id: '01', Valor: '0099' },
        { Id: '2', Valor: '' },
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
    expect(await cdc.getModalidades()).toEqual([{ Cod: 'CAE', Desc: 'CAE' }]);
    expect(await cdc.constatar(input)).toEqual({
      Resultado: 'R',
      FchProceso: '20261101120000',
      Observaciones: [{ Code: 100, Msg: '' }],
      Events: [],
    });
  });

  it('respuestas con forma inválida lanzan ArcaSoapError', async () => {
    const fetch = mockFetch(
      asmxResponse('ComprobantesTipoConsultar', '<ResultGet><CbteTipo><Id>X</Id><Desc>A</Desc></CbteTipo></ResultGet>'),
      asmxResponse('DocumentosTipoConsultar', '<ResultGet><DocTipo><Id>80</Id><Desc /></DocTipo></ResultGet>'),
      asmxResponse('ComprobanteConstatar', '<Resultado>X</Resultado><FchProceso>20261101120000</FchProceso>'),
      asmxResponse(
        'ComprobanteConstatar',
        '<CmpResp><CbteModo>CAE</CbteModo></CmpResp><Resultado>A</Resultado><FchProceso>1</FchProceso>',
      ),
    );
    const cdc = makeCdc(fetch);
    const cases: [() => Promise<unknown>, RegExp][] = [
      [() => cdc.getTiposCbte(), /ComprobantesTipoConsultar\.ResultGet\[0\]\.Id no es numérico/],
      [() => cdc.getDocTipos(), /falta DocumentosTipoConsultar\.ResultGet\[0\]\.Desc/],
      [() => cdc.constatar(input), /Resultado desconocido "X"/],
      [() => cdc.constatar(input), /falta ComprobanteConstatar\.CmpResp\.CuitEmisor/],
    ];
    for (const [call, message] of cases) {
      const err = await call().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ArcaSoapError);
      expect((err as Error).message).toMatch(message);
    }
  });
});
