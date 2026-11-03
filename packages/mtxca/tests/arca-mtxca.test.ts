import { testCert } from '@ramiidv/arca-common/testing';
import { describe, it, expect, vi } from 'vitest';
import { ArcaRechazoError, ArcaSoapError, ArcaValidationError, ArcaServiceError } from '@ramiidv/arca-common';
import { ArcaMtxca } from '../src/arca-mtxca.js';
import { ENDPOINTS } from '../src/constants.js';
import type { ArcaMtxcaConfig } from '../src/types.js';
import { facturaA, hangingFetch, mockFetch, soapResponse } from './helpers.js';

function mtxca(fetchImpl: typeof fetch, extra: Partial<ArcaMtxcaConfig> = {}): ArcaMtxca {
  const m = new ArcaMtxca({
    ...testCert(),
    cuit: '20-12345678-6',
    fetch: fetchImpl,
    retryDelayMs: 1,
    ...extra,
  });
  vi.spyOn(m.wsaa, 'getAccessTicket').mockResolvedValue({
    token: 'T',
    sign: 'S',
    expirationTime: '2099-01-01T00:00:00Z',
  });
  return m;
}

const ultimo = (n: number) =>
  soapResponse('consultarUltimoComprobanteAutorizadoResponse', `<numeroComprobante>${n}</numeroComprobante>`);
const sinComprobantes = soapResponse(
  'consultarUltimoComprobanteAutorizadoResponse',
  '<arrayErrores><codigoDescripcion><codigo>1502</codigo><descripcion>No existen comprobantes</descripcion></codigoDescripcion></arrayErrores>',
);
const aprobado = (n: number) =>
  soapResponse(
    'autorizarComprobanteResponse',
    `<resultado>A</resultado><comprobanteResponse><cuit>20123456786</cuit><codigoTipoComprobante>1</codigoTipoComprobante>` +
      `<numeroPuntoVenta>4000</numeroPuntoVenta><numeroComprobante>${n}</numeroComprobante><fechaEmision>2026-11-01</fechaEmision>` +
      `<CAE>76443051234567</CAE><fechaVencimientoCAE>2026-11-11</fechaVencimientoCAE></comprobanteResponse>`,
  );

function sinNumero() {
  const { numeroComprobante: _n, ...rest } = facturaA();
  return rest;
}

describe('ArcaMtxca', () => {
  it('normaliza y valida el CUIT y usa el endpoint de homologación por defecto', async () => {
    expect(() => new ArcaMtxca({ ...testCert(), cuit: '20123456780' })).toThrow(ArcaValidationError);
    const m = mockFetch(ultimo(1));
    const a = mtxca(m.fetch);
    expect(a.cuit).toBe('20123456786');
    await a.ultimoComprobante(4000, 1);
    expect(m.calls[0].url).toBe(ENDPOINTS.wsmtxca.testing);
    expect(m.calls[0].body).toContain('<cuitRepresentada>20123456786</cuitRepresentada>');
  });

  it('endpoints.wsmtxca y endpoints.wsaa reemplazan los oficiales', async () => {
    const m = mockFetch(ultimo(1));
    await mtxca(m.fetch, { endpoints: { wsmtxca: 'https://proxy.local/mtxca' } }).ultimoComprobante(4000, 1);
    expect(m.calls[0].url).toBe('https://proxy.local/mtxca');
    const a = new ArcaMtxca({
      ...testCert(),
      cuit: '20123456786',
      endpoints: { wsaa: 'https://proxy.local/wsaa' },
    });
    // `endpoint` es privado en WsaaClient: se lee en runtime.
    expect((a.wsaa as unknown as { endpoint: string }).endpoint).toBe('https://proxy.local/wsaa');
  });

  it('config.signal cancela las llamadas', async () => {
    const m = mockFetch(ultimo(1));
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(mtxca(m.fetch, { signal: ctrl.signal }).ultimoComprobante(4000, 1)).rejects.toBeInstanceOf(
      ArcaSoapError,
    );
    expect(m.fn).not.toHaveBeenCalled();
  });

  it('ultimoComprobante: 1502 (sin comprobantes) es 0; otros errores lanzan', async () => {
    const m = mockFetch(
      sinComprobantes,
      soapResponse(
        'consultarUltimoComprobanteAutorizadoResponse',
        '<arrayErrores><codigoDescripcion><codigo>1501</codigo><descripcion>PV no habilitado</descripcion></codigoDescripcion></arrayErrores>',
      ),
    );
    const a = mtxca(m.fetch);
    expect(await a.ultimoComprobante(4000, 1)).toBe(0);
    await expect(a.ultimoComprobante(4000, 1)).rejects.toBeInstanceOf(ArcaServiceError);
  });

  it('autorizar sin número: usa último + 1', async () => {
    const m = mockFetch(ultimo(41), aprobado(42));
    const res = await mtxca(m.fetch).autorizar(sinNumero());
    expect(res.resultado).toBe('A');
    expect(m.calls).toHaveLength(2);
    expect(m.calls[1].body).toContain('<numeroComprobante>42</numeroComprobante>');
  });

  it('autorizar sin número y sin comprobantes previos: número 1', async () => {
    const m = mockFetch(sinComprobantes, aprobado(1));
    await mtxca(m.fetch).autorizar(sinNumero());
    expect(m.calls[1].body).toContain('<numeroComprobante>1</numeroComprobante>');
  });

  it('autorizar con número explícito no consulta el último', async () => {
    const m = mockFetch(aprobado(7));
    await mtxca(m.fetch).autorizar({ ...facturaA(), numeroComprobante: 7 });
    expect(m.calls).toHaveLength(1);
  });

  it('autorizar valida importes antes de hacer requests (y se puede desactivar)', async () => {
    const m = mockFetch(aprobado(1));
    const a = mtxca(m.fetch);
    await expect(a.autorizar({ ...facturaA(), importeTotal: 500 })).rejects.toBeInstanceOf(ArcaValidationError);
    expect(m.fn).not.toHaveBeenCalled();
    await a.autorizar({ ...facturaA(), importeTotal: 500 }, { validarImportes: false });
    expect(m.fn).toHaveBeenCalledTimes(1);
  });

  it('autorizar con condición de IVA 8 (5%): pasa la validación local y devuelve el CAE (respuesta de homologación)', async () => {
    const m = mockFetch(
      soapResponse(
        'autorizarComprobanteResponse',
        '<resultado>O</resultado><comprobanteResponse><cuit>20123456786</cuit><codigoTipoComprobante>1</codigoTipoComprobante>' +
          '<numeroPuntoVenta>3</numeroPuntoVenta><numeroComprobante>2</numeroComprobante><fechaEmision>2026-11-03</fechaEmision>' +
          '<CAE>86441046318277</CAE><fechaVencimientoCAE>2026-11-13</fechaVencimientoCAE></comprobanteResponse>' +
          '<arrayObservaciones><codigoDescripcion><codigo>504</codigo><descripcion>Ítem 1: El campo Código de Producto/Servicio' +
          ' no es un código GS1 válido (GTIN-8, GTIN-12 o GTIN-13)</descripcion></codigoDescripcion></arrayObservaciones>',
      ),
    );
    const base = facturaA();
    const res = await mtxca(m.fetch).autorizar({
      ...base,
      numeroPuntoVenta: 3,
      numeroComprobante: 2,
      importeOtrosTributos: 0,
      importeTotal: 105,
      otrosTributos: undefined,
      items: [{ ...base.items[0], codigoCondicionIVA: 8, importeIVA: 5, importeItem: 105 }],
      subtotalesIVA: [{ codigo: 8, importe: 5 }],
    });
    expect(res.resultado).toBe('O');
    expect(res.comprobante?.cae).toBe('86441046318277');
    expect(m.calls[0].body).toContain('<codigoCondicionIVA>8</codigoCondicionIVA>');
  });

  it('autorizar: un rechazo de ARCA lanza ArcaRechazoError (no devuelve resultado R)', async () => {
    const m = mockFetch(
      soapResponse(
        'autorizarComprobanteResponse',
        '<resultado>R</resultado><arrayErrores><codigoDescripcion><codigo>102</codigo>' +
          '<descripcion>Numero no correlativo</descripcion></codigoDescripcion></arrayErrores>',
      ),
    );
    const err = await mtxca(m.fetch)
      .autorizar(facturaA())
      .catch((e) => e);
    expect(err).toBeInstanceOf(ArcaRechazoError);
    expect(err).toMatchObject({ operacion: 'autorizarComprobante', errors: [{ code: 102 }] });
  });

  it('solicitarCAEA con arrayErrores lanza ArcaServiceError; informarCAEANoUtilizado R lanza ArcaRechazoError', async () => {
    const errores =
      '<arrayErrores><codigoDescripcion><codigo>1300</codigo><descripcion>Fuera de plazo</descripcion></codigoDescripcion></arrayErrores>';
    const m = mockFetch(
      soapResponse('solicitarCAEAResponse', errores),
      soapResponse('informarCAEANoUtilizadoResponse', `<resultado>R</resultado>${errores}`),
    );
    const a = mtxca(m.fetch);
    const err = await a.solicitarCAEA(202611, 1).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaServiceError);
    expect(err).not.toBeInstanceOf(ArcaRechazoError);
    await expect(a.informarCAEANoUtilizado('36434058476543')).rejects.toMatchObject({
      operacion: 'informarCAEANoUtilizado',
      errors: [{ code: 1300, msg: 'Fuera de plazo' }],
    });
  });

  it('autorizar con timeout: 1 solo fetch de autorización y error uncertain', async () => {
    const h = hangingFetch();
    const err = await mtxca(h.fetch, { timeout: 20, retries: 3 })
      .autorizar(facturaA())
      .catch((e) => e);
    expect(err).toBeInstanceOf(ArcaSoapError);
    expect((err as ArcaSoapError).uncertain).toBe(true);
    expect(h.fn).toHaveBeenCalledTimes(1);
  });

  it('el signal llega al request', async () => {
    const m = mockFetch(ultimo(1));
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(mtxca(m.fetch).ultimoComprobante(4000, 1, { signal: ctrl.signal })).rejects.toBeInstanceOf(
      ArcaSoapError,
    );
    expect(m.fn).not.toHaveBeenCalled();
  });

  it('getCotizacionMoneda envía la fecha de hoy por defecto', async () => {
    const m = mockFetch(soapResponse('consultarCotizacionMonedaResponse', '<cotizacionMoneda>1000</cotizacionMoneda>'));
    const res = await mtxca(m.fetch).getCotizacionMoneda('DOL');
    expect(res.fechaCotizacion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(m.calls[0].body).toContain(`<fechaCotizacion>${res.fechaCotizacion}</fechaCotizacion>`);
  });

  it('informarComprobanteCAEA valida los ítems antes de enviar', async () => {
    const m = mockFetch();
    const a = facturaA();
    await expect(
      mtxca(m.fetch).informarComprobanteCAEA({
        ...a,
        caea: '36434058476543',
        items: [{ ...a.items[0], cantidad: undefined }],
      }),
    ).rejects.toBeInstanceOf(ArcaValidationError);
    expect(m.fn).not.toHaveBeenCalled();
  });

  it('clearAuthCache espera a clearTicket', async () => {
    const a = mtxca(mockFetch().fetch);
    let done = false;
    vi.spyOn(a.wsaa, 'clearTicket').mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 5));
      done = true;
    });
    await a.clearAuthCache();
    expect(done).toBe(true);
  });

  it('pide y limpia el ticket del servicio wsmtxca', async () => {
    const m = mockFetch(ultimo(1));
    const a = mtxca(m.fetch);
    const clear = vi.spyOn(a.wsaa, 'clearTicket').mockResolvedValue();
    await a.ultimoComprobante(4000, 1);
    expect(a.wsaa.getAccessTicket).toHaveBeenCalledWith('wsmtxca', expect.anything());
    await a.clearAuthCache();
    expect(clear).toHaveBeenCalledWith('wsmtxca');
  });
});

describe('ArcaMtxca: CAEA, QR y eventos', () => {
  const CAEA = '36434058476543';

  it('informarComprobanteCAEA exige condicionIVAReceptor (390) antes de enviar', async () => {
    const m = mockFetch();
    const err = await mtxca(m.fetch)
      .informarComprobanteCAEA({
        ...facturaA({ condicionIVAReceptor: undefined }),
        caea: CAEA,
        fechaHoraGen: '2026-11-01T10:30:00',
      })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ArcaValidationError);
    expect((err as ArcaValidationError).details.map((d) => d.message)).toEqual([
      expect.stringMatching(/^condicionIVAReceptor: .*\(390\)$/),
    ]);
    expect(m.fn).not.toHaveBeenCalled();
  });

  it('informarAjusteIVACAEA usa el ticket y el wrapper propio; valida el XSD y fechaHoraGen (754)', async () => {
    const m = mockFetch(
      soapResponse(
        'informarAjusteIVACAEAResponse',
        `<resultado>A</resultado><fechaProceso>2026-11-02</fechaProceso><comprobanteCAEAResponse><CAEA>${CAEA}</CAEA>` +
          '<codigoTipoComprobante>2</codigoTipoComprobante><numeroPuntoVenta>4000</numeroPuntoVenta><numeroComprobante>1</numeroComprobante></comprobanteCAEAResponse>',
      ),
    );
    const res = await mtxca(m.fetch).informarAjusteIVACAEA({
      ...facturaA({ codigoTipoComprobante: 2, condicionIVAReceptor: undefined }),
      caea: CAEA,
      fechaHoraGen: '2026-11-01T10:00:00-03:00',
    });
    expect(res).toMatchObject({ resultado: 'A', comprobante: { caea: CAEA, codigoTipoComprobante: 2 } });
    expect(m.calls[0].body).toContain('<ser:informarAjusteIVACAEARequest');
    expect(m.calls[0].body).toContain('<token>T</token>');
  });

  it('urlQR usa la CUIT de la instancia', async () => {
    const m = mockFetch(aprobado(7));
    const a = mtxca(m.fetch);
    const req = facturaA({ numeroComprobante: 7 });
    const res = await a.autorizar(req);
    const url = a.urlQR(req, res);
    const p = JSON.parse(Buffer.from(url.split('?p=')[1], 'base64').toString());
    expect(p).toMatchObject({ cuit: 20123456786, nroCmp: 7, codAut: 76443051234567, tipoCodAut: 'E' });
  });

  it('onEvento de la config recibe los eventos de ARCA', async () => {
    const m = mockFetch(
      soapResponse(
        'consultarPuntosVentaCAEAResponse',
        '<arrayPuntosVenta/><evento><codigo>3</codigo><descripcion>Aviso</descripcion></evento>',
      ),
    );
    const onEvento = vi.fn();
    expect(await mtxca(m.fetch, { onEvento }).getPuntosVentaCAEA()).toEqual([]);
    expect(onEvento).toHaveBeenCalledWith({ codigo: 3, descripcion: 'Aviso' }, 'consultarPuntosVentaCAEA');
  });
});

describe('ArcaMtxca: validación en un solo error', () => {
  it('autorizar reporta las reglas de importes con el campo como prefijo del mensaje', async () => {
    const m = mockFetch();
    const err = await mtxca(m.fetch)
      .autorizar({ ...facturaA(), importeTotal: 500 })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ArcaValidationError);
    const detail = (err as ArcaValidationError).details.find((d) => d.field === 'importeTotal');
    expect(detail?.message).toMatch(/^importeTotal: debe ser/);
    expect(m.fn).not.toHaveBeenCalled();
  });

  it('si el XSD falla, no evalúa las reglas de importes', async () => {
    const m = mockFetch();
    const err = await mtxca(m.fetch)
      .autorizar({ ...facturaA(), importeTotal: 500, codigoMoneda: 'PESOS' })
      .catch((e) => e);
    expect((err as ArcaValidationError).details.map((d) => d.field)).toEqual(['codigoMoneda']);
  });
});
