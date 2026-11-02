import { describe, it, expect } from 'vitest';
import { ArcaResponseError, ArcaServiceError, ArcaSoapError, ArcaValidationError } from '@ramiidv/arca-common';
import {
  AUTH,
  NS,
  childOrder,
  client,
  facturaA,
  hangingFetch,
  mockFetch,
  requestBody,
  soapResponse,
} from './helpers.js';

/** Orden de la secuencia de ComprobanteType en el XSD. */
const COMPROBANTE_ORDER = [
  'codigoTipoComprobante',
  'numeroPuntoVenta',
  'numeroComprobante',
  'fechaEmision',
  'codigoTipoAutorizacion',
  'codigoAutorizacion',
  'fechaVencimiento',
  'codigoTipoDocumento',
  'numeroDocumento',
  'condicionIVAReceptor',
  'importeGravado',
  'importeNoGravado',
  'importeExento',
  'importeSubtotal',
  'importeOtrosTributos',
  'importeTotal',
  'codigoMoneda',
  'cotizacionMoneda',
  'cancelaEnMismaMonedaExtranjera',
  'observaciones',
  'codigoConcepto',
  'fechaServicioDesde',
  'fechaServicioHasta',
  'fechaVencimientoPago',
  'fechaHoraGen',
  'arrayComprobantesAsociados',
  'periodoComprobantesAsociados',
  'arrayOtrosTributos',
  'arrayItems',
  'arraySubtotalesIVA',
  'arrayDatosAdicionales',
  'arrayCompradores',
  'arrayActividades',
];
const ITEM_ORDER = [
  'unidadesMtx',
  'codigoMtx',
  'codigo',
  'descripcion',
  'cantidad',
  'codigoUnidadMedida',
  'precioUnitario',
  'importeBonificacion',
  'codigoCondicionIVA',
  'importeIVA',
  'importeItem',
];

function isSubsequence(actual: string[], order: string[]): boolean {
  let i = 0;
  for (const name of actual) {
    i = order.indexOf(name, i);
    if (i < 0) return false;
    i++;
  }
  return true;
}

const APROBADO = soapResponse(
  'autorizarComprobanteResponse',
  `<resultado>A</resultado><comprobanteResponse><cuit>20123456786</cuit><codigoTipoComprobante>1</codigoTipoComprobante>` +
    `<numeroPuntoVenta>4000</numeroPuntoVenta><numeroComprobante>1</numeroComprobante><fechaEmision>2026-11-01</fechaEmision>` +
    `<CAE>76443051234567</CAE><fechaVencimientoCAE>2026-11-11</fechaVencimientoCAE></comprobanteResponse>`,
);

describe('dummy', () => {
  it('envía el Body vacío con el SOAPAction del WSDL y parsea dummyResponse', async () => {
    const m = mockFetch(
      soapResponse('dummyResponse', '<appserver>OK</appserver><authserver>OK</authserver><dbserver>OK</dbserver>'),
    );
    const status = await client(m.fetch).dummy();
    expect(status).toEqual({ appserver: 'OK', authserver: 'OK', dbserver: 'OK' });
    expect(m.calls[0].headers.soapaction).toBe(`"${NS}dummy"`);
    expect(m.calls[0].body).toContain('<soapenv:Body></soapenv:Body>');
  });

  it('lanza si falta un campo obligatorio', async () => {
    const m = mockFetch(
      soapResponse('dummyResponse', '<appserver>OK</appserver>'),
      soapResponse('dummyResponse', '<appserver>OK</appserver>'),
    );
    await expect(client(m.fetch).dummy()).rejects.toBeInstanceOf(ArcaResponseError);
  });
});

describe('autorizarComprobante', () => {
  it('arma autorizarComprobanteRequest con namespace, SOAPAction, auth y ComprobanteType en orden del XSD', async () => {
    const m = mockFetch(APROBADO);
    const comprobante = facturaA({
      cancelaEnMismaMonedaExtranjera: 'N',
      comprobantesAsociados: [
        {
          codigoTipoComprobante: 1,
          numeroPuntoVenta: 1,
          numeroComprobante: 5,
          cuit: '30000000007',
          fechaEmision: '20261001',
        },
      ],
      datosAdicionales: [{ t: 2, c1: '0' }],
      actividades: [120010, 463300],
    });
    const res = await client(m.fetch).autorizarComprobante(AUTH, comprobante);
    expect(res.resultado).toBe('A');

    const call = m.calls[0];
    expect(call.headers.soapaction).toBe(`"${NS}autorizarComprobante"`);
    const req = requestBody(call);
    expect(req.name).toBe('ser:autorizarComprobanteRequest');
    expect(req.ns).toBe(NS);
    expect(childOrder(req.raw, 'ser:autorizarComprobanteRequest')).toEqual(['authRequest', 'comprobanteCAERequest']);
    expect(childOrder(req.raw, 'authRequest')).toEqual(['token', 'sign', 'cuitRepresentada']);
    expect(req.content['authRequest']).toEqual({ token: 'TOKEN', sign: 'SIGN', cuitRepresentada: '20123456786' });

    const order = childOrder(req.raw, 'comprobanteCAERequest');
    expect(isSubsequence(order, COMPROBANTE_ORDER)).toBe(true);
    for (const required of [
      'codigoTipoComprobante',
      'numeroPuntoVenta',
      'numeroComprobante',
      'importeSubtotal',
      'importeTotal',
      'codigoMoneda',
      'codigoConcepto',
      'arrayItems',
    ]) {
      expect(order).toContain(required);
    }
    expect(order).not.toContain('codigoAutorizacion');
    expect(order).not.toContain('fechaHoraGen');
    expect(isSubsequence(childOrder(req.raw, 'item'), ITEM_ORDER)).toBe(true);
    expect(childOrder(req.raw, 'comprobanteAsociado')).toEqual([
      'codigoTipoComprobante',
      'numeroPuntoVenta',
      'numeroComprobante',
      'cuit',
      'fechaEmision',
    ]);
    expect(childOrder(req.raw, 'otroTributo')).toEqual(['codigo', 'descripcion', 'baseImponible', 'importe']);
    expect(childOrder(req.raw, 'subtotalIVA')).toEqual(['codigo', 'importe']);

    // Fechas xsd:date e importes con los decimales del XSD.
    expect(req.raw).toContain('<fechaEmision>2026-11-01</fechaEmision>');
    expect(req.raw).toContain('<fechaEmision>2026-10-01</fechaEmision>');
    expect(req.raw).toContain('<importeTotal>122.00</importeTotal>');
    expect(req.raw).toContain('<cantidad>1.000000</cantidad>');
    expect(req.raw).toContain('<codigoUnidadMedida>7</codigoUnidadMedida>');
    expect(req.raw).not.toContain('unidadMedida>7</unidadMedida');
    expect(req.raw).toContain('<condicionIVAReceptor>1</condicionIVAReceptor>');
    expect(req.raw.match(/<actividad>/g)).toHaveLength(2);
  });

  it('redondea importes a 2 decimales y cantidad/precio a 6', async () => {
    const m = mockFetch(APROBADO);
    await client(m.fetch).autorizarComprobante(
      AUTH,
      facturaA({
        importeTotal: 122.004999,
        importeGravado: 100.005,
        cotizacionMoneda: 1.0000001,
        items: [
          {
            ...facturaA().items[0],
            cantidad: 1.23456789,
            precioUnitario: 0.1 + 0.2,
            importeIVA: 21.004,
            importeItem: 1.005,
          },
        ],
      }),
    );
    const raw = m.calls[0].body;
    expect(raw).toContain('<importeTotal>122.00</importeTotal>');
    expect(raw).toContain('<importeGravado>100.01</importeGravado>');
    expect(raw).toContain('<cotizacionMoneda>1.000000</cotizacionMoneda>');
    expect(raw).toContain('<cantidad>1.234568</cantidad>');
    expect(raw).toContain('<precioUnitario>0.300000</precioUnitario>');
    expect(raw).toContain('<importeIVA>21.00</importeIVA>');
    expect(raw).toContain('<importeItem>1.01</importeItem>');
  });

  it('rechaza localmente importes no finitos, negativos donde el XSD no los admite y fechas inválidas', async () => {
    const m = mockFetch();
    const bad = facturaA({ importeTotal: Number.NaN, importeOtrosTributos: -1, fechaEmision: '2026-02-30' });
    const err = await client(m.fetch)
      .autorizarComprobante(AUTH, bad)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ArcaValidationError);
    const fields = (err as ArcaValidationError).details.map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['importeTotal', 'importeOtrosTributos', 'fechaEmision']));
    expect(m.fn).not.toHaveBeenCalled();
  });

  it('acepta un ítem de bonificación (99) sin cantidad ni precio y lo envía así', async () => {
    const m = mockFetch(APROBADO);
    const base = facturaA();
    await client(m.fetch).autorizarComprobante(AUTH, {
      ...base,
      items: [
        ...base.items,
        {
          descripcion: 'Bonificación',
          codigoUnidadMedida: 99,
          codigoCondicionIVA: 5,
          importeIVA: -2.1,
          importeItem: -12.1,
        },
      ],
    });
    const raw = m.calls[0].body;
    const bonif = raw.slice(raw.lastIndexOf('<item>'), raw.lastIndexOf('</item>'));
    expect(bonif).not.toContain('<cantidad>');
    expect(bonif).not.toContain('<precioUnitario>');
    expect(bonif).toContain('<importeItem>-12.10</importeItem>');
  });

  it('parsea un rechazo (R) con arrayErrores y observaciones de 1 y N elementos sin lanzar', async () => {
    const m = mockFetch(
      soapResponse(
        'autorizarComprobanteResponse',
        `<resultado>R</resultado>` +
          `<arrayObservaciones><codigoDescripcion><codigo>190</codigo><descripcion>Falta condicion IVA receptor</descripcion></codigoDescripcion></arrayObservaciones>` +
          `<arrayErrores><codigoDescripcion><codigo>102</codigo><descripcion>Numero no correlativo</descripcion></codigoDescripcion>` +
          `<codigoDescripcion><codigo>115</codigo><descripcion>Total incorrecto</descripcion></codigoDescripcion></arrayErrores>` +
          `<evento><codigo>1</codigo><descripcion>Mantenimiento programado</descripcion></evento>`,
      ),
    );
    const res = await client(m.fetch).autorizarComprobante(AUTH, facturaA());
    expect(res.resultado).toBe('R');
    expect(res.comprobante).toBeUndefined();
    expect(res.errores).toEqual([
      { codigo: 102, descripcion: 'Numero no correlativo' },
      { codigo: 115, descripcion: 'Total incorrecto' },
    ]);
    expect(res.observaciones).toEqual([{ codigo: 190, descripcion: 'Falta condicion IVA receptor' }]);
    expect(res.evento).toEqual({ codigo: 1, descripcion: 'Mantenimiento programado' });
  });

  it('parsea O (aprobado con observaciones) con CAE como string', async () => {
    const m = mockFetch(
      APROBADO.replace('<resultado>A</resultado>', '<resultado>O</resultado>').replace(
        '</comprobanteResponse>',
        '</comprobanteResponse><arrayObservaciones><codigoDescripcion><codigo>504</codigo><descripcion>GTIN no registrado</descripcion></codigoDescripcion></arrayObservaciones>',
      ),
    );
    const res = await client(m.fetch).autorizarComprobante(AUTH, facturaA());
    expect(res.resultado).toBe('O');
    if (res.resultado === 'R') throw new Error('esperaba aprobado');
    expect(res.comprobante).toEqual({
      cuit: '20123456786',
      codigoTipoComprobante: 1,
      numeroPuntoVenta: 4000,
      numeroComprobante: 1,
      fechaEmision: '2026-11-01',
      cae: '76443051234567',
      fechaVencimientoCAE: '2026-11-11',
    });
    expect(res.observaciones).toEqual([{ codigo: 504, descripcion: 'GTIN no registrado' }]);
  });

  it('A sin comprobanteResponse es una respuesta inválida incierta', async () => {
    const m = mockFetch(soapResponse('autorizarComprobanteResponse', '<resultado>A</resultado>'));
    const err = await client(m.fetch)
      .autorizarComprobante(AUTH, facturaA())
      .catch((e) => e);
    expect(err).toBeInstanceOf(ArcaSoapError);
    expect((err as ArcaSoapError).uncertain).toBe(true);
  });

  it('sin resultado pero con arrayErrores lanza ArcaServiceError', async () => {
    const m = mockFetch(
      soapResponse(
        'autorizarComprobanteResponse',
        '<arrayErrores><codigoDescripcion><codigo>10010</codigo><descripcion>No empadronado</descripcion></codigoDescripcion></arrayErrores>',
      ),
    );
    const err = await client(m.fetch)
      .autorizarComprobante(AUTH, facturaA())
      .catch((e) => e);
    expect(err).toBeInstanceOf(ArcaServiceError);
    expect((err as ArcaServiceError).errors[0].code).toBe(10010);
  });

  it('timeout: hace exactamente 1 fetch y el error es uncertain', async () => {
    const h = hangingFetch();
    const err = await client(h.fetch, { timeout: 20, retries: 3 })
      .autorizarComprobante(AUTH, facturaA())
      .catch((e) => e);
    expect(err).toBeInstanceOf(ArcaSoapError);
    expect((err as ArcaSoapError).uncertain).toBe(true);
    expect(h.fn).toHaveBeenCalledTimes(1);
  });

  it('HTTP 503: hace exactamente 1 fetch y el error es uncertain', async () => {
    const m = mockFetch({ status: 503, body: 'Service Unavailable' }, { status: 503, body: 'Service Unavailable' });
    const err = await client(m.fetch, { retries: 3 })
      .autorizarComprobante(AUTH, facturaA())
      .catch((e) => e);
    expect(err).toBeInstanceOf(ArcaSoapError);
    expect((err as ArcaSoapError).uncertain).toBe(true);
    expect(m.fn).toHaveBeenCalledTimes(1);
  });

  it('autorizarAjusteIVA usa su propio wrapper y es emisión', async () => {
    const h = hangingFetch();
    const err = await client(h.fetch, { timeout: 20, retries: 3 })
      .autorizarAjusteIVA(AUTH, facturaA({ codigoTipoComprobante: 2 }))
      .catch((e) => e);
    expect((err as ArcaSoapError).uncertain).toBe(true);
    expect(h.fn).toHaveBeenCalledTimes(1);
    const body = String((h.fn.mock.calls[0][1] as RequestInit).body);
    expect(body).toContain('<ser:autorizarAjusteIVARequest');
  });
});

describe('consultarUltimoComprobanteAutorizado', () => {
  it('envía el request en orden del XSD y devuelve el número', async () => {
    const m = mockFetch(
      soapResponse('consultarUltimoComprobanteAutorizadoResponse', '<numeroComprobante>41</numeroComprobante>'),
    );
    expect(await client(m.fetch).consultarUltimoComprobanteAutorizado(AUTH, 4000, 1)).toBe(41);
    const req = requestBody(m.calls[0]);
    expect(req.name).toBe('ser:consultarUltimoComprobanteAutorizadoRequest');
    expect(m.calls[0].headers.soapaction).toBe(`"${NS}consultarUltimoComprobanteAutorizado"`);
    expect(childOrder(req.raw, 'consultaUltimoComprobanteAutorizadoRequest')).toEqual([
      'codigoTipoComprobante',
      'numeroPuntoVenta',
    ]);
  });

  it('arrayErrores lanza ArcaServiceError (no devuelve 0)', async () => {
    const m = mockFetch(
      soapResponse(
        'consultarUltimoComprobanteAutorizadoResponse',
        '<arrayErrores><codigoDescripcion><codigo>1501</codigo><descripcion>Punto de venta no habilitado</descripcion></codigoDescripcion></arrayErrores>',
      ),
    );
    const err = await client(m.fetch)
      .consultarUltimoComprobanteAutorizado(AUTH, 4000, 1)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ArcaServiceError);
    expect((err as ArcaServiceError).errors).toEqual([{ code: 1501, msg: 'Punto de venta no habilitado' }]);
  });

  it('respuesta sin número ni errores lanza', async () => {
    const m = mockFetch(
      soapResponse('consultarUltimoComprobanteAutorizadoResponse', ''),
      soapResponse('consultarUltimoComprobanteAutorizadoResponse', ''),
    );
    await expect(client(m.fetch).consultarUltimoComprobanteAutorizado(AUTH, 4000, 1)).rejects.toBeInstanceOf(
      ArcaSoapError,
    );
  });

  it('una consulta sí se reintenta ante 503', async () => {
    const m = mockFetch(
      { status: 503, body: 'x' },
      soapResponse('consultarUltimoComprobanteAutorizadoResponse', '<numeroComprobante>7</numeroComprobante>'),
    );
    expect(await client(m.fetch).consultarUltimoComprobanteAutorizado(AUTH, 1, 6)).toBe(7);
    expect(m.fn).toHaveBeenCalledTimes(2);
  });
});

describe('consultarComprobante', () => {
  const item = (n: number) =>
    `<item><unidadesMtx>1</unidadesMtx><codigoMtx>0123456789913</codigoMtx><codigo>P${n}</codigo><descripcion>Producto ${n}</descripcion>` +
    `<cantidad>1.00</cantidad><codigoUnidadMedida>7</codigoUnidadMedida><precioUnitario>100.00</precioUnitario>` +
    `<codigoCondicionIVA>5</codigoCondicionIVA><importeIVA>21.00</importeIVA><importeItem>121.00</importeItem></item>`;
  const comprobante = (items: string, subtotales: string) =>
    soapResponse(
      'consultarComprobanteResponse',
      `<comprobante><codigoTipoComprobante>1</codigoTipoComprobante><numeroPuntoVenta>4000</numeroPuntoVenta>` +
        `<numeroComprobante>12345678</numeroComprobante><fechaEmision>2026-11-01</fechaEmision><codigoTipoAutorizacion>E</codigoTipoAutorizacion>` +
        `<codigoAutorizacion>76443051234567</codigoAutorizacion><fechaVencimiento>2026-11-11</fechaVencimiento>` +
        `<codigoTipoDocumento>80</codigoTipoDocumento><numeroDocumento>30000000007</numeroDocumento><condicionIVAReceptor>1</condicionIVAReceptor>` +
        `<importeGravado>100.00</importeGravado><importeSubtotal>100.00</importeSubtotal><importeTotal>121.00</importeTotal>` +
        `<codigoMoneda>PES</codigoMoneda><cotizacionMoneda>1</cotizacionMoneda><codigoConcepto>1</codigoConcepto>` +
        `<arrayItems>${items}</arrayItems><arraySubtotalesIVA>${subtotales}</arraySubtotalesIVA></comprobante>`,
    );

  it('parsea un comprobante con 1 ítem y 1 subtotal', async () => {
    const m = mockFetch(comprobante(item(1), '<subtotalIVA><codigo>5</codigo><importe>21.00</importe></subtotalIVA>'));
    const { comprobante: c } = await client(m.fetch).consultarComprobante(AUTH, 1, 4000, 12345678);
    expect(c.numeroComprobante).toBe(12345678);
    expect(c.codigoAutorizacion).toBe('76443051234567');
    expect(c.numeroDocumento).toBe('30000000007');
    expect(c.items).toHaveLength(1);
    expect(c.items[0]).toMatchObject({
      codigo: 'P1',
      codigoUnidadMedida: 7,
      importeItem: 121,
      codigoMtx: '0123456789913',
    });
    expect(c.subtotalesIVA).toEqual([{ codigo: 5, importe: 21 }]);
    expect(c.otrosTributos).toEqual([]);
    const req = requestBody(m.calls[0]);
    expect(req.name).toBe('ser:consultarComprobanteRequest');
    expect(childOrder(req.raw, 'consultaComprobanteRequest')).toEqual([
      'codigoTipoComprobante',
      'numeroPuntoVenta',
      'numeroComprobante',
    ]);
  });

  it('parsea N ítems y N subtotales', async () => {
    const m = mockFetch(
      comprobante(
        item(1) + item(2) + item(3),
        '<subtotalIVA><codigo>4</codigo><importe>10.50</importe></subtotalIVA><subtotalIVA><codigo>5</codigo><importe>42.00</importe></subtotalIVA>',
      ),
    );
    const { comprobante: c } = await client(m.fetch).consultarComprobante(AUTH, 1, 4000, 1);
    expect(c.items.map((i) => i.codigo)).toEqual(['P1', 'P2', 'P3']);
    expect(c.subtotalesIVA).toEqual([
      { codigo: 4, importe: 10.5 },
      { codigo: 5, importe: 42 },
    ]);
  });

  it('comprobante inexistente: lanza ArcaServiceError, no un objeto de ceros', async () => {
    const m = mockFetch(
      soapResponse(
        'consultarComprobanteResponse',
        '<arrayErrores><codigoDescripcion><codigo>1602</codigo><descripcion>No existe el comprobante</descripcion></codigoDescripcion></arrayErrores>',
      ),
    );
    await expect(client(m.fetch).consultarComprobante(AUTH, 1, 4000, 99)).rejects.toBeInstanceOf(ArcaServiceError);
  });
});

describe('consultarCotizacionMoneda', () => {
  it('envía codigoMoneda y fechaCotizacion (xsd:date) y parsea cotizacionMoneda', async () => {
    const m = mockFetch(
      soapResponse('consultarCotizacionMonedaResponse', '<cotizacionMoneda>1043.250000</cotizacionMoneda>'),
    );
    const res = await client(m.fetch).consultarCotizacionMoneda(AUTH, 'DOL', '20261030');
    expect(res).toEqual({ codigoMoneda: 'DOL', fechaCotizacion: '2026-10-30', cotizacion: 1043.25 });
    const req = requestBody(m.calls[0]);
    expect(req.name).toBe('ser:consultarCotizacionMonedaRequest');
    expect(childOrder(req.raw, 'ser:consultarCotizacionMonedaRequest')).toEqual([
      'authRequest',
      'codigoMoneda',
      'fechaCotizacion',
    ]);
    expect(req.raw).toContain('<fechaCotizacion>2026-10-30</fechaCotizacion>');
  });

  it('sin cotización ni errores devuelve null; con error lanza', async () => {
    const m = mockFetch(
      soapResponse('consultarCotizacionMonedaResponse', ''),
      soapResponse(
        'consultarCotizacionMonedaResponse',
        '<arrayErrores><codigoDescripcion><codigo>1600</codigo><descripcion>Moneda inexistente</descripcion></codigoDescripcion></arrayErrores>',
      ),
    );
    const c = client(m.fetch);
    expect((await c.consultarCotizacionMoneda(AUTH, 'DOL', '2026-10-30')).cotizacion).toBeNull();
    await expect(c.consultarCotizacionMoneda(AUTH, 'XXX', '2026-10-30')).rejects.toBeInstanceOf(ArcaServiceError);
  });
});

describe('parámetros', () => {
  it('consultarMonedas: 1 y N elementos, códigos como string', async () => {
    const one = '<codigoDescripcion><codigo>PES</codigo><descripcion>Pesos</descripcion></codigoDescripcion>';
    const two = `${one}<codigoDescripcion><codigo>060</codigo><descripcion>Euro</descripcion></codigoDescripcion>`;
    const m = mockFetch(
      soapResponse('consultarMonedasResponse', `<arrayMonedas>${one}</arrayMonedas>`),
      soapResponse('consultarMonedasResponse', `<arrayMonedas>${two}</arrayMonedas>`),
    );
    const c = client(m.fetch);
    expect(await c.consultarMonedas(AUTH)).toEqual([{ codigo: 'PES', descripcion: 'Pesos' }]);
    expect(await c.consultarMonedas(AUTH)).toEqual([
      { codigo: 'PES', descripcion: 'Pesos' },
      { codigo: '060', descripcion: 'Euro' },
    ]);
    expect(requestBody(m.calls[0]).name).toBe('ser:consultarMonedasRequest');
  });

  it('consultarPuntosVenta: parsea PuntoVentaType (sin campos inventados)', async () => {
    const m = mockFetch(
      soapResponse(
        'consultarPuntosVentaResponse',
        '<arrayPuntosVenta><puntoVenta><numeroPuntoVenta>4000</numeroPuntoVenta><bloqueado>N</bloqueado></puntoVenta>' +
          '<puntoVenta><numeroPuntoVenta>4001</numeroPuntoVenta><bloqueado>S</bloqueado><fechaBaja>2026-01-31</fechaBaja></puntoVenta></arrayPuntosVenta>',
      ),
    );
    expect(await client(m.fetch).consultarPuntosVenta(AUTH)).toEqual([
      { numeroPuntoVenta: 4000, bloqueado: 'N', fechaBaja: undefined },
      { numeroPuntoVenta: 4001, bloqueado: 'S', fechaBaja: '2026-01-31' },
    ]);
  });

  it('consultarCondicionesIVAReceptor envía el tipo de comprobante', async () => {
    const m = mockFetch(
      soapResponse(
        'consultarCondicionesIVAReceptorResponse',
        '<arrayCondicionesIVAReceptor><codigoDescripcion><codigo>5</codigo><descripcion>Consumidor Final</descripcion></codigoDescripcion></arrayCondicionesIVAReceptor>',
      ),
    );
    expect(await client(m.fetch).consultarCondicionesIVAReceptor(AUTH, 6)).toEqual([
      { codigo: 5, descripcion: 'Consumidor Final' },
    ]);
    expect(childOrder(m.calls[0].body, 'consultaCondicionesIVAReceptorRequest')).toEqual(['codigoTipoComprobante']);
  });

  it('consultarTiposTributo y consultarActividadesVigentes', async () => {
    const m = mockFetch(
      soapResponse(
        'consultarTiposTributoResponse',
        '<arrayTiposTributo><codigoDescripcion><codigo>99</codigo><descripcion>Otro</descripcion></codigoDescripcion></arrayTiposTributo>',
      ),
      soapResponse(
        'consultarActividadesVigentesResponse',
        '<arrayActividades><actividad><codigo>620100</codigo><orden>1</orden><descripcion>Servicios informáticos</descripcion></actividad></arrayActividades>',
      ),
    );
    const c = client(m.fetch);
    expect(await c.consultarTiposTributo(AUTH)).toEqual([{ codigo: 99, descripcion: 'Otro' }]);
    expect(await c.consultarActividadesVigentes(AUTH)).toEqual([
      { codigo: 620100, orden: 1, descripcion: 'Servicios informáticos' },
    ]);
  });

  it('una respuesta sin el array obligatorio lanza', async () => {
    const m = mockFetch(
      soapResponse('consultarTiposDocumentoResponse', ''),
      soapResponse('consultarTiposDocumentoResponse', ''),
    );
    await expect(client(m.fetch).consultarTiposDocumento(AUTH)).rejects.toBeInstanceOf(ArcaSoapError);
  });
});

describe('CAEA', () => {
  const caeaResponse = (element: string) =>
    soapResponse(
      element,
      '<CAEAResponse><fechaProceso>2026-10-27</fechaProceso><CAEA>36434058476543</CAEA><periodo>202611</periodo><orden>1</orden>' +
        '<fechaDesde>2026-11-01</fechaDesde><fechaHasta>2026-11-15</fechaHasta><fechaTopeInforme>2026-11-23</fechaTopeInforme></CAEAResponse>',
    );

  it('solicitarCAEA: request en orden del XSD, emisión y parseo', async () => {
    const m = mockFetch(caeaResponse('solicitarCAEAResponse'));
    const caea = await client(m.fetch).solicitarCAEA(AUTH, 202611, 1);
    expect(caea).toEqual({
      fechaProceso: '2026-10-27',
      caea: '36434058476543',
      periodo: 202611,
      orden: 1,
      fechaDesde: '2026-11-01',
      fechaHasta: '2026-11-15',
      fechaTopeInforme: '2026-11-23',
      observaciones: [],
    });
    const req = requestBody(m.calls[0]);
    expect(req.name).toBe('ser:solicitarCAEARequest');
    expect(m.calls[0].headers.soapaction).toBe(`"${NS}solicitarCAEA"`);
    expect(childOrder(req.raw, 'solicitudCAEA')).toEqual(['periodo', 'orden']);
  });

  it('solicitarCAEA: rechazo lanza; timeout hace 1 fetch y es uncertain', async () => {
    const m = mockFetch(
      soapResponse(
        'solicitarCAEAResponse',
        '<arrayErrores><codigoDescripcion><codigo>1300</codigo><descripcion>Fuera de plazo</descripcion></codigoDescripcion></arrayErrores>',
      ),
    );
    await expect(client(m.fetch).solicitarCAEA(AUTH, 202611, 2)).rejects.toBeInstanceOf(ArcaServiceError);
    const h = hangingFetch();
    const err = await client(h.fetch, { timeout: 20 })
      .solicitarCAEA(AUTH, 202611, 2)
      .catch((e) => e);
    expect((err as ArcaSoapError).uncertain).toBe(true);
    expect(h.fn).toHaveBeenCalledTimes(1);
  });

  it('solicitarCAEA valida periodo y orden', async () => {
    const m = mockFetch();
    await expect(client(m.fetch).solicitarCAEA(AUTH, 202613, 3)).rejects.toBeInstanceOf(ArcaValidationError);
    expect(m.fn).not.toHaveBeenCalled();
  });

  it('consultarCAEAEntreFechas: 1 y N CAEAs', async () => {
    const one =
      '<CAEAResponse><fechaProceso>2026-10-27</fechaProceso><CAEA>36434058476543</CAEA><periodo>202611</periodo><orden>1</orden><fechaDesde>2026-11-01</fechaDesde><fechaHasta>2026-11-15</fechaHasta><fechaTopeInforme>2026-11-23</fechaTopeInforme></CAEAResponse>';
    const m = mockFetch(
      soapResponse('consultarCAEAEntreFechasResponse', `<arrayCAEAResponse>${one}</arrayCAEAResponse>`),
      soapResponse(
        'consultarCAEAEntreFechasResponse',
        `<arrayCAEAResponse>${one}${one.replace('36434058476543', '36434058476544')}</arrayCAEAResponse>`,
      ),
    );
    const c = client(m.fetch);
    expect(await c.consultarCAEAEntreFechas(AUTH, '2026-11-01', '2026-11-30')).toHaveLength(1);
    expect((await c.consultarCAEAEntreFechas(AUTH, '2026-11-01', '2026-11-30')).map((x) => x.caea)).toEqual([
      '36434058476543',
      '36434058476544',
    ]);
    expect(childOrder(m.calls[0].body, 'ser:consultarCAEAEntreFechasRequest')).toEqual([
      'authRequest',
      'fechaDesde',
      'fechaHasta',
    ]);
  });

  it('informarComprobanteCAEA: envía codigoAutorizacion y fechaHoraGen en orden y parsea', async () => {
    const m = mockFetch(
      soapResponse(
        'informarComprobanteCAEAResponse',
        '<resultado>A</resultado><fechaProceso>2026-11-02</fechaProceso><comprobanteCAEAResponse><CAEA>36434058476543</CAEA>' +
          '<codigoTipoComprobante>1</codigoTipoComprobante><numeroPuntoVenta>4000</numeroPuntoVenta><numeroComprobante>1</numeroComprobante></comprobanteCAEAResponse>',
      ),
    );
    const res = await client(m.fetch).informarComprobanteCAEA(AUTH, {
      ...facturaA(),
      caea: '36434058476543',
      codigoTipoAutorizacion: 'A',
      fechaHoraGen: '2026-11-01T10:30:00',
    });
    expect(res.resultado).toBe('A');
    if (res.resultado === 'R') throw new Error('esperaba aprobado');
    expect(res.comprobante).toEqual({
      caea: '36434058476543',
      codigoTipoComprobante: 1,
      numeroPuntoVenta: 4000,
      numeroComprobante: 1,
    });
    const req = requestBody(m.calls[0]);
    expect(req.name).toBe('ser:informarComprobanteCAEARequest');
    expect(childOrder(req.raw, 'ser:informarComprobanteCAEARequest')).toEqual([
      'authRequest',
      'comprobanteCAEARequest',
    ]);
    const order = childOrder(req.raw, 'comprobanteCAEARequest');
    expect(isSubsequence(order, COMPROBANTE_ORDER)).toBe(true);
    expect(order).toEqual(expect.arrayContaining(['codigoTipoAutorizacion', 'codigoAutorizacion', 'fechaHoraGen']));
    expect(req.raw).toContain('<codigoAutorizacion>36434058476543</codigoAutorizacion>');
  });

  it('informarComprobanteCAEA: timeout hace 1 fetch y es uncertain', async () => {
    const h = hangingFetch();
    const err = await client(h.fetch, { timeout: 20 })
      .informarComprobanteCAEA(AUTH, { ...facturaA(), caea: '36434058476543' })
      .catch((e) => e);
    expect((err as ArcaSoapError).uncertain).toBe(true);
    expect(h.fn).toHaveBeenCalledTimes(1);
  });

  it('informarCAEANoUtilizadoPtoVta: orden del request y rechazo devuelto', async () => {
    const m = mockFetch(
      soapResponse(
        'informarCAEANoUtilizadoPtoVtaResponse',
        '<resultado>R</resultado><fechaProceso>2026-11-16</fechaProceso><CAEA>36434058476543</CAEA><numeroPuntoVenta>4000</numeroPuntoVenta>' +
          '<arrayErrores><codigoDescripcion><codigo>1400</codigo><descripcion>El CAEA tiene comprobantes informados</descripcion></codigoDescripcion></arrayErrores>',
      ),
    );
    const res = await client(m.fetch).informarCAEANoUtilizadoPtoVta(AUTH, '36434058476543', 4000);
    expect(res).toMatchObject({ resultado: 'R', caea: '36434058476543', numeroPuntoVenta: 4000 });
    expect(res.errores).toEqual([{ codigo: 1400, descripcion: 'El CAEA tiene comprobantes informados' }]);
    expect(childOrder(m.calls[0].body, 'ser:informarCAEANoUtilizadoPtoVtaRequest')).toEqual([
      'authRequest',
      'CAEA',
      'numeroPuntoVenta',
    ]);
  });

  it('informarCAEANoUtilizadoPtoVta: valida CAEA y punto de venta juntos, sin llamar', async () => {
    const m = mockFetch();
    const err = await client(m.fetch)
      .informarCAEANoUtilizadoPtoVta(AUTH, '123', 0)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ArcaValidationError);
    expect((err as ArcaValidationError).details.map((d) => d.field)).toEqual(['caea', 'numeroPuntoVenta']);
    expect(m.calls).toHaveLength(0);
  });

  it('consultarPtosVtaCAEANoInformados: lista vacía sin errores, error lanza', async () => {
    const m = mockFetch(
      soapResponse('consultarPtosVtaCAEANoInformadosResponse', '<arrayPuntosVenta/>'),
      soapResponse(
        'consultarPtosVtaCAEANoInformadosResponse',
        '<arrayErrores><codigoDescripcion><codigo>1700</codigo><descripcion>CAEA inexistente</descripcion></codigoDescripcion></arrayErrores>',
      ),
    );
    const c = client(m.fetch);
    expect(await c.consultarPtosVtaCAEANoInformados(AUTH, '36434058476543')).toEqual([]);
    await expect(c.consultarPtosVtaCAEANoInformados(AUTH, '36434058476543')).rejects.toBeInstanceOf(ArcaServiceError);
  });
});

describe('schemas del XSD (DSL de common)', () => {
  const consultado = (inner: string) =>
    soapResponse(
      'consultarComprobanteResponse',
      `<comprobante><codigoTipoComprobante>1</codigoTipoComprobante><numeroPuntoVenta>4000</numeroPuntoVenta>` +
        `<numeroComprobante>1</numeroComprobante><importeSubtotal>100.00</importeSubtotal><importeTotal>121.00</importeTotal>` +
        `<codigoMoneda>PES</codigoMoneda><codigoConcepto>1</codigoConcepto>${inner}</comprobante>`,
    );

  it('preserva los xs:string que parecen números (decimales y ceros)', async () => {
    const m = mockFetch(
      consultado(
        `<observaciones>1.50</observaciones><arrayItems><item><codigoMtx>0012</codigoMtx><codigo>1.50</codigo><descripcion>10.0</descripcion>` +
          `<codigoUnidadMedida>7</codigoUnidadMedida><codigoCondicionIVA>5</codigoCondicionIVA><importeItem>121.00</importeItem></item></arrayItems>` +
          `<arrayDatosAdicionales><datoAdicional><t>2</t><c1>0012</c1><c2>2.10</c2></datoAdicional></arrayDatosAdicionales>` +
          `<arrayCompradores><comprador><codigoTipoDocumento>96</codigoTipoDocumento><numeroDocumento>00012345</numeroDocumento><porcentaje>100.00</porcentaje></comprador></arrayCompradores>` +
          `<arrayActividades><actividad><codigo>620100</codigo></actividad></arrayActividades>`,
      ),
    );
    const { comprobante: c } = await client(m.fetch).consultarComprobante(AUTH, 1, 4000, 1);
    expect(c.observaciones).toBe('1.50');
    expect(c.items[0]).toMatchObject({ codigoMtx: '0012', codigo: '1.50', descripcion: '10.0', importeItem: 121 });
    expect(c.datosAdicionales).toEqual([{ t: 2, c1: '0012', c2: '2.10' }]);
    expect(c.compradores).toEqual([{ codigoTipoDocumento: 96, numeroDocumento: '00012345', porcentaje: 100 }]);
    expect(c.actividades).toEqual([620100]);
    expect(c.comprobantesAsociados).toEqual([]);
  });

  it('consultarComprobante sin arrayItems (obligatorio) es una respuesta inválida', async () => {
    const m = mockFetch(consultado(''), consultado(''));
    await expect(client(m.fetch).consultarComprobante(AUTH, 1, 4000, 1)).rejects.toBeInstanceOf(ArcaSoapError);
  });

  it('comprobanteResponse vacío en un aprobado es inválido e incierto', async () => {
    const m = mockFetch(soapResponse('autorizarComprobanteResponse', '<resultado>A</resultado><comprobanteResponse/>'));
    const err = await client(m.fetch)
      .autorizarComprobante(AUTH, facturaA())
      .catch((e) => e);
    expect(err).toBeInstanceOf(ArcaSoapError);
    expect((err as ArcaSoapError).uncertain).toBe(true);
  });

  it('redondea mitad hacia afuera sobre el decimal (8.575 → 8.58, como roundImporte)', async () => {
    const m = mockFetch(APROBADO);
    await client(m.fetch).autorizarComprobante(AUTH, facturaA({ importeOtrosTributos: 8.575 }));
    expect(m.calls[0].body).toContain('<importeOtrosTributos>8.58</importeOtrosTributos>');
  });

  it('numeroDocumento: acepta number, 0 y guiones; con tipo 80 valida el dígito verificador', async () => {
    const m = mockFetch(APROBADO, APROBADO);
    const c = client(m.fetch);
    await c.autorizarComprobante(AUTH, facturaA({ codigoTipoDocumento: 80, numeroDocumento: '30-00000000-7' }));
    expect(m.calls[0].body).toContain('<numeroDocumento>30000000007</numeroDocumento>');
    await c.autorizarComprobante(AUTH, facturaA({ codigoTipoDocumento: 99, numeroDocumento: 0 }));
    expect(m.calls[1].body).toContain('<numeroDocumento>0</numeroDocumento>');

    const err = await c
      .autorizarComprobante(
        AUTH,
        facturaA({
          numeroDocumento: '30000000008',
          compradores: [{ codigoTipoDocumento: 80, numeroDocumento: 20123456780, porcentaje: 100 }],
        }),
      )
      .catch((e) => e);
    expect(err).toBeInstanceOf(ArcaValidationError);
    expect((err as ArcaValidationError).details.map((d) => d.field)).toEqual([
      'numeroDocumento',
      'compradores[0].numeroDocumento',
    ]);
    expect(m.fn).toHaveBeenCalledTimes(2);
  });

  it('rechaza campos que no existen en el XSD (ej. datos de CAEA en un CAE) y omite arrays opcionales vacíos', async () => {
    const m = mockFetch(APROBADO);
    const c = client(m.fetch);
    const err = await c.autorizarComprobante(AUTH, { ...facturaA(), caea: '36434058476543' } as never).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaValidationError);
    expect((err as ArcaValidationError).field).toBe('caea');

    await c.autorizarComprobante(AUTH, facturaA({ comprobantesAsociados: [], datosAdicionales: [] }));
    expect(m.calls[0].body).not.toContain('arrayComprobantesAsociados');
    expect(m.calls[0].body).not.toContain('arrayDatosAdicionales');
    await expect(c.autorizarComprobante(AUTH, facturaA({ items: [] }))).rejects.toMatchObject({ field: 'items' });
  });

  it('fechaHoraGen como Date se envía en hora de Argentina sin offset (formato del manual)', async () => {
    const h = hangingFetch();
    await client(h.fetch, { timeout: 20 })
      .informarComprobanteCAEA(AUTH, {
        ...facturaA(),
        caea: '36434058476543',
        fechaHoraGen: new Date('2026-11-01T13:30:05Z'),
      })
      .catch(() => undefined);
    const body = String((h.fn.mock.calls[0][1] as RequestInit).body);
    expect(body).toContain('<fechaHoraGen>2026-11-01T10:30:05</fechaHoraGen>');
  });

  it('valida el CAEA de las consultas (14 dígitos, number o string)', async () => {
    const m = mockFetch(soapResponse('consultarPtosVtaCAEANoInformadosResponse', '<arrayPuntosVenta/>'));
    const c = client(m.fetch);
    await expect(c.consultarCAEA(AUTH, '123')).rejects.toMatchObject({ field: 'caea' });
    expect(await c.consultarPtosVtaCAEANoInformados(AUTH, 36434058476543 as unknown as string)).toEqual([]);
    expect(m.calls[0].body).toContain('<CAEA>36434058476543</CAEA>');
  });
});
