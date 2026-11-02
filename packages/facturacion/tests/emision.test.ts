import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArcaResultadoIncierto, ArcaWSFEError } from '../src/errors.js';
import { ArcaAuthError, ArcaSoapError, ArcaValidationError } from '@ramiidv/arca-common';
import { CbteTipo, CondicionIva, DocTipo, IvaTipo } from '../src/constants.js';
import { requiereRecuperacion } from '../src/facturacion.js';
import {
  arcaDePrueba,
  caeAprobado,
  mockArcaFetch,
  networkError,
  ultimoAutorizado,
  wsfeErrores,
  wsfeResponse,
} from './helpers.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const B = { ptoVta: 1, cbteTipo: CbteTipo.FACTURA_B, fecha: '20261030', items: [{ total: 1210, iva: IvaTipo.IVA_21 }] };

describe('facturar con cbteNro explícito', () => {
  it('no consulta ultimoComprobante y usa el número indicado', async () => {
    const arca = await arcaDePrueba();
    const mock = mockArcaFetch({ FECAESolicitar: caeAprobado({ ptoVta: 1, cbteTipo: 6, cbteNro: 151 }) });

    const res = await arca.facturar({ ...B, cbteNro: 151 });

    expect(mock.count('FECompUltimoAutorizado')).toBe(0);
    expect(mock.calls[0].body).toContain('<CbteDesde>151</CbteDesde>');
    expect(res.aprobada).toBe(true);
    expect(res.cae).toBe('76123456789012');
    expect(res.cbteNro).toBe(151);
  });

  it('sin cbteNro usa último + 1', async () => {
    const arca = await arcaDePrueba();
    const mock = mockArcaFetch({
      FECompUltimoAutorizado: ultimoAutorizado(1, 6, 150),
      FECAESolicitar: caeAprobado({ ptoVta: 1, cbteTipo: 6, cbteNro: 151 }),
    });
    await arca.facturar(B);
    expect(mock.calls[1].body).toContain('<CbteDesde>151</CbteDesde>');
  });
});

describe('emisiones: nunca se reintentan', () => {
  it('timeout → ArcaResultadoIncierto con el intento, y una sola llamada', async () => {
    const arca = await arcaDePrueba({ timeout: 20, retries: 5 });
    const mock = mockArcaFetch({
      FECAESolicitar: () =>
        new Promise<Response>((_, reject) => setTimeout(() => reject(new DOMException('aborted', 'AbortError')), 60)),
    });

    const err = await arca.facturar({ ...B, cbteNro: 151 }).catch((e) => e);

    expect(err).toBeInstanceOf(ArcaResultadoIncierto);
    expect(err.code).toBe('ARCA_RESULTADO_INCIERTO');
    expect(err.operacion).toBe('FECAESolicitar');
    expect(err.intento).toEqual({
      ptoVta: 1,
      cbteTipo: 6,
      cbteNro: 151,
      importeTotal: 1210,
      docTipo: 99,
      docNro: 0,
      fecha: '20261030',
    });
    expect(mock.count('FECAESolicitar')).toBe(1);
  });

  it('conexión cortada después de enviar → incierto', async () => {
    const arca = await arcaDePrueba();
    const mock = mockArcaFetch({ FECAESolicitar: networkError('ECONNRESET') });
    await expect(arca.facturar({ ...B, cbteNro: 151 })).rejects.toBeInstanceOf(ArcaResultadoIncierto);
    expect(mock.count('FECAESolicitar')).toBe(1);
  });

  it('HTTP 500 → incierto', async () => {
    const arca = await arcaDePrueba();
    mockArcaFetch({ FECAESolicitar: new Response('Internal Server Error', { status: 500 }) });
    await expect(arca.facturar({ ...B, cbteNro: 151 })).rejects.toBeInstanceOf(ArcaResultadoIncierto);
  });

  it('respuesta 200 sin FeDetResp → incierto', async () => {
    const arca = await arcaDePrueba();
    mockArcaFetch({ FECAESolicitar: wsfeResponse('FECAESolicitar', '') });
    await expect(arca.facturar({ ...B, cbteNro: 151 })).rejects.toBeInstanceOf(ArcaResultadoIncierto);
  });

  it('sin conexión (DNS) → no es incierto: no se envió', async () => {
    const arca = await arcaDePrueba();
    mockArcaFetch({ FECAESolicitar: networkError('ENOTFOUND') });
    const err = await arca.facturar({ ...B, cbteNro: 151 }).catch((e) => e);
    expect(err).not.toBeInstanceOf(ArcaResultadoIncierto);
    expect(err).toBeInstanceOf(ArcaSoapError);
    expect(err.uncertain).toBe(false);
  });

  it('Errors de ARCA → ArcaWSFEError (no se emitió)', async () => {
    const arca = await arcaDePrueba();
    mockArcaFetch({
      FECAESolicitar: wsfeErrores('FECAESolicitar', [{ code: 10015, msg: 'DocTipo invalido' }]),
    });
    const err = await arca.facturar({ ...B, cbteNro: 151 }).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaWSFEError);
    expect(err.tieneCodigo(10015)).toBe(true);
    expect(requiereRecuperacion(err)).toBe(false);
  });

  it.each([
    [600, 'ValidacionDeToken: No aparecio CUIT en lista de relaciones'],
    [601, 'CUIT representada no incluida en token'],
  ])('error de autenticación %i → ArcaAuthError no reintentable, sin borrar el ticket', async (code, msg) => {
    const arca = await arcaDePrueba();
    const clear = vi.spyOn(arca.wsaa, 'clearTicket');
    mockArcaFetch({ FECAESolicitar: wsfeErrores('FECAESolicitar', [{ code, msg }]) });
    const err = await arca.facturar({ ...B, cbteNro: 151 }).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaAuthError);
    expect(err).not.toBeInstanceOf(ArcaResultadoIncierto);
    expect(err.faultCode).toBe(String(code));
    expect(err.retryable).toBe(false);
    expect(err.cause).toBeInstanceOf(ArcaWSFEError);
    expect(clear).not.toHaveBeenCalled();
  });

  it('602 (no existen datos) no es de autenticación: ArcaWSFEError', async () => {
    const arca = await arcaDePrueba();
    mockArcaFetch({ FECompConsultar: wsfeErrores('FECompConsultar', [{ code: 602, msg: 'No existen datos' }]) });
    const err = await arca.consultarComprobante(6, 1, 999).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaWSFEError);
    expect(err).not.toBeInstanceOf(ArcaAuthError);
  });

  it('error interno de ARCA (501) → incierto, no rechazo', async () => {
    const arca = await arcaDePrueba();
    mockArcaFetch({
      FECAESolicitar: wsfeErrores('FECAESolicitar', [{ code: 501, msg: 'Error interno de base de datos' }]),
    });
    const err = await arca.facturar({ ...B, cbteNro: 151 }).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaResultadoIncierto);
    expect(err.cause).toBeInstanceOf(ArcaWSFEError);
  });

  it('10016 llega como observación con Resultado R → requiereRecuperacion', async () => {
    const arca = await arcaDePrueba();
    mockArcaFetch({
      FECAESolicitar: wsfeResponse(
        'FECAESolicitar',
        '<FeCabResp><Cuit>20123456786</Cuit><PtoVta>1</PtoVta><CbteTipo>6</CbteTipo><FchProceso>20261030120000</FchProceso>' +
          '<CantReg>1</CantReg><Resultado>R</Resultado><Reproceso>N</Reproceso></FeCabResp>' +
          '<FeDetResp><FECAEDetResponse><Concepto>1</Concepto><DocTipo>99</DocTipo><DocNro>0</DocNro>' +
          '<CbteDesde>151</CbteDesde><CbteHasta>151</CbteHasta><CbteFch>20261030</CbteFch><Resultado>R</Resultado>' +
          '<Observaciones><Obs><Code>10016</Code><Msg>El numero o fecha del comprobante no se corresponde con el proximo a autorizar.</Msg></Obs></Observaciones>' +
          '</FECAEDetResponse></FeDetResp>',
      ),
    });
    const res = await arca.facturar({ ...B, cbteNro: 151 });
    expect(res.aprobada).toBe(false);
    expect(res.cae).toBeUndefined();
    expect(requiereRecuperacion(res)).toBe(true);
  });

  it('un listener que lanza no convierte un CAE otorgado en error', async () => {
    const arca = await arcaDePrueba({
      onEvent: () => {
        throw new Error('logger roto');
      },
    });
    arca.on('request:end', () => {
      throw new Error('otro listener roto');
    });
    mockArcaFetch({ FECAESolicitar: caeAprobado({ ptoVta: 1, cbteTipo: 6, cbteNro: 151 }) });
    const res = await arca.facturar({ ...B, cbteNro: 151 });
    expect(res.cae).toBe('76123456789012');
  });

  it('las consultas sí se reintentan', async () => {
    const arca = await arcaDePrueba();
    const mock = mockArcaFetch({
      FECompUltimoAutorizado: [networkError('ECONNRESET'), ultimoAutorizado(1, 6, 150)],
    });
    expect(await arca.ultimoComprobante(1, 6)).toBe(150);
    expect(mock.count('FECompUltimoAutorizado')).toBe(2);
  });

  it('signal abortado antes de llamar: no se envía nada', async () => {
    const arca = await arcaDePrueba();
    const mock = mockArcaFetch({ FECAESolicitar: caeAprobado({ ptoVta: 1, cbteTipo: 6, cbteNro: 151 }) });
    const controller = new AbortController();
    controller.abort();
    const err = await arca.facturar({ ...B, cbteNro: 151 }, { signal: controller.signal }).catch((e) => e);
    expect(err).not.toBeInstanceOf(ArcaResultadoIncierto);
    expect(mock.count('FECAESolicitar')).toBe(0);
  });

  it('el signal global de la config también cancela', async () => {
    const controller = new AbortController();
    const arca = await arcaDePrueba({ signal: controller.signal });
    const mock = mockArcaFetch({ FECompUltimoAutorizado: ultimoAutorizado(1, 6, 150) });
    controller.abort();
    await expect(arca.ultimoComprobante(1, 6)).rejects.toThrow();
    expect(mock.count('FECompUltimoAutorizado')).toBe(0);
  });
});

describe('notas de crédito', () => {
  it('validan condicionIva cuando el receptor está identificado', async () => {
    const arca = await arcaDePrueba();
    const mock = mockArcaFetch({});
    const err = await arca
      .notaCredito({
        ptoVta: 1,
        docTipo: DocTipo.CUIT,
        docNro: 20111111112,
        items: [{ neto: 100, iva: IvaTipo.IVA_21 }],
        comprobanteOriginal: { tipo: CbteTipo.FACTURA_A, ptoVta: 1, nro: 10 },
      })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ArcaValidationError);
    expect(err.field).toBe('condicionIva');
    expect(mock.fn).not.toHaveBeenCalled();
  });

  it('aceptan cbteNro y asocian el comprobante original', async () => {
    const arca = await arcaDePrueba();
    const mock = mockArcaFetch({
      FECAESolicitar: caeAprobado({ ptoVta: 1, cbteTipo: 3, cbteNro: 7, docTipo: 80, docNro: '20111111112' }),
    });
    const res = await arca.notaCredito({
      ptoVta: 1,
      cbteNro: 7,
      fecha: '20261030',
      docTipo: DocTipo.CUIT,
      docNro: 20111111112,
      condicionIva: CondicionIva.RESPONSABLE_INSCRIPTO,
      items: [{ neto: 100, iva: IvaTipo.IVA_21 }],
      comprobanteOriginal: { tipo: CbteTipo.FACTURA_A, ptoVta: 1, nro: 10, fecha: '20261029' },
    });
    expect(res.cbteTipo).toBe(CbteTipo.NOTA_CREDITO_A);
    const body = mock.calls[0].body;
    expect(body).toMatch(
      /<CbteAsoc>\s*<Tipo>1<\/Tipo>\s*<PtoVta>1<\/PtoVta>\s*<Nro>10<\/Nro>\s*<CbteFch>20261029<\/CbteFch>/,
    );
    expect(mock.count('FECompUltimoAutorizado')).toBe(0);
  });
});

describe('CAEA', () => {
  it('registrarFacturaCAEA devuelve el CAEA como código (no el texto "undefined")', async () => {
    const arca = await arcaDePrueba();
    mockArcaFetch({
      FECAEARegInformativo: wsfeResponse(
        'FECAEARegInformativo',
        '<FeCabResp><Cuit>20123456786</Cuit><PtoVta>5</PtoVta><CbteTipo>6</CbteTipo><FchProceso>20261030120000</FchProceso>' +
          '<CantReg>1</CantReg><Resultado>A</Resultado><Reproceso>N</Reproceso></FeCabResp>' +
          '<FeDetResp><FECAEADetResponse><Concepto>1</Concepto><DocTipo>99</DocTipo><DocNro>0</DocNro>' +
          '<CbteDesde>10</CbteDesde><CbteHasta>10</CbteHasta><CbteFch>20261030</CbteFch><Resultado>A</Resultado>' +
          '<CAEA>36123456789012</CAEA></FECAEADetResponse></FeDetResp>',
      ),
    });
    const res = await arca.registrarFacturaCAEA('36123456789012', {
      ...B,
      ptoVta: 5,
      cbteNro: 10,
      fechaHoraGeneracion: '20261030101500',
    });
    expect(res.aprobada).toBe(true);
    expect(res.cae).toBe('36123456789012');
    expect(res.caeVencimiento).toBeUndefined();
  });

  it('registrarCAEA raw valida el request', async () => {
    const arca = await arcaDePrueba();
    const mock = mockArcaFetch({});
    await expect(arca.registrarCAEA({ ptoVta: 5, cbteTipo: 6, invoices: [] })).rejects.toBeInstanceOf(
      ArcaValidationError,
    );
    expect(mock.fn).not.toHaveBeenCalled();
  });
});

describe('FCE MiPyME con concepto 1 (productos)', () => {
  it('envía FchVtoPago sin FchServDesde/FchServHasta (validación 10163)', async () => {
    const arca = await arcaDePrueba();
    const mock = mockArcaFetch({
      FECAESolicitar: caeAprobado({ ptoVta: 1, cbteTipo: 201, cbteNro: 5, docTipo: 80, docNro: '30712345671' }),
    });
    const res = await arca.facturar({
      ptoVta: 1,
      cbteTipo: CbteTipo.FCE_FACTURA_A,
      cbteNro: 5,
      fecha: '20261030',
      docTipo: DocTipo.CUIT,
      docNro: 30712345671,
      condicionIva: CondicionIva.RESPONSABLE_INSCRIPTO,
      vtoPago: '2026-11-29',
      items: [{ neto: 1000, iva: IvaTipo.IVA_21 }],
      opcionales: [{ id: '2101', valor: '0110599500000041817221' }],
    });
    const det = mock.last('FECAESolicitar').params.FeCAEReq.FeDetReq.FECAEDetRequest;
    expect(det.Concepto).toBe(1);
    expect(String(det.FchVtoPago)).toBe('20261129');
    expect(det).not.toHaveProperty('FchServDesde');
    expect(det).not.toHaveProperty('FchServHasta');
    expect(res.aprobada).toBe(true);
  });
});

describe('lote con resultado parcial ("P")', () => {
  it('crearFactura devuelve el detalle de cada comprobante; los rechazados con sus observaciones', async () => {
    const arca = await arcaDePrueba();
    const det = (nro: number, resultado: 'A' | 'R') =>
      '<FECAEDetResponse><Concepto>1</Concepto><DocTipo>99</DocTipo><DocNro>0</DocNro>' +
      `<CbteDesde>${nro}</CbteDesde><CbteHasta>${nro}</CbteHasta><CbteFch>20261030</CbteFch><Resultado>${resultado}</Resultado>` +
      (resultado === 'A'
        ? '<CAE>76123456789012</CAE><CAEFchVto>20261109</CAEFchVto>'
        : '<Observaciones><Obs><Code>10016</Code><Msg>El numero o fecha del comprobante no se corresponde con el proximo a autorizar</Msg></Obs></Observaciones>') +
      '</FECAEDetResponse>';
    mockArcaFetch({
      FECAESolicitar: wsfeResponse(
        'FECAESolicitar',
        '<FeCabResp><Cuit>20123456786</Cuit><PtoVta>1</PtoVta><CbteTipo>6</CbteTipo><FchProceso>20261030120000</FchProceso>' +
          '<CantReg>2</CantReg><Resultado>P</Resultado><Reproceso>N</Reproceso></FeCabResp>' +
          `<FeDetResp>${det(151, 'A')}${det(152, 'R')}</FeDetResp>`,
      ),
    });
    const inv = (nro: number) => ({
      concepto: 1,
      docTipo: 99,
      docNro: 0,
      cbteDesde: nro,
      cbteHasta: nro,
      cbteFch: '20261030',
      impTotal: 121,
      impTotConc: 0,
      impNeto: 100,
      impOpEx: 0,
      impTrib: 0,
      impIva: 21,
      monId: 'PES',
      monCotiz: 1,
      condicionIvaReceptorId: 5,
      iva: [{ id: 5, baseImp: 100, importe: 21 }],
    });
    const res = await arca.crearFactura({ ptoVta: 1, cbteTipo: 6, invoices: [inv(151), inv(152)] });
    expect(res.feCabResp.resultado).toBe('P');
    expect(res.feDetResp.map((d) => [d.cbteDesde, d.resultado, d.cae])).toEqual([
      [151, 'A', '76123456789012'],
      [152, 'R', undefined],
    ]);
    expect(res.feDetResp[1].observaciones?.[0].code).toBe(10016);
  });
});
