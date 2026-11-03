import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ArcaAuthError,
  ArcaRechazoError,
  ArcaResponseError,
  ArcaSoapError,
  ArcaValidationError,
} from '@ramiidv/arca-common';
import { ArcaConflictoExpo, ArcaResultadoInciertoExpo, ArcaWSFEError } from '../src/errors.js';
import { CbteTipo, TipoExpo } from '../src/constants.js';
import type { FacturarExpoOpts } from '../src/types.js';
import { arcaDePrueba, colgado, mockArcaFetch, networkError, orden, wsfeResponse, wsfexResponse } from './helpers.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const OK_ERR = '<FEXErr><ErrCode>0</ErrCode><ErrMsg>OK</ErrMsg></FEXErr>';
const OK_EVT = '<FEXEvents><EventCode>0</EventCode><EventMsg>OK</EventMsg></FEXEvents>';

const lastId = (id: number) =>
  wsfexResponse('FEXGetLast_ID', `<FEXResultGet><Id>${id}</Id></FEXResultGet>${OK_ERR}${OK_EVT}`);
const lastCmp = (nro: number) =>
  wsfexResponse(
    'FEXGetLast_CMP',
    `<FEXResult_LastCMP><Cbte_nro>${nro}</Cbte_nro><Cbte_fecha>20261029</Cbte_fecha></FEXResult_LastCMP>${OK_ERR}${OK_EVT}`,
  );
const autorizado = (o: {
  id: number;
  nro: number;
  tipo?: number;
  ptoVta?: number;
  reproceso?: string;
  resultado?: string;
  obs?: string;
  events?: string;
  sinCae?: boolean;
}) =>
  wsfexResponse(
    'FEXAuthorize',
    `<FEXResultAuth><Id>${o.id}</Id><Cuit>20123456786</Cuit><Cbte_tipo>${o.tipo ?? 19}</Cbte_tipo><Punto_vta>${o.ptoVta ?? 3}</Punto_vta>` +
      `<Cbte_nro>${o.nro}</Cbte_nro>` +
      ((o.resultado ?? 'A') === 'A' && !o.sinCae
        ? '<Cae>76123456789099</Cae><Fch_venc_Cae>20261109</Fch_venc_Cae>'
        : '') +
      `<Fch_cbte>20261030</Fch_cbte><Resultado>${o.resultado ?? 'A'}</Resultado><Reproceso>${o.reproceso ?? 'N'}</Reproceso>` +
      (o.obs ? `<Motivos_Obs>${o.obs}</Motivos_Obs>` : '') +
      `</FEXResultAuth>${OK_ERR}${o.events ?? OK_EVT}`,
  );
const fexErr = (method: string, code: number, msg: string) =>
  wsfexResponse(method, `<FEXErr><ErrCode>${code}</ErrCode><ErrMsg>${msg}</ErrMsg></FEXErr>${OK_EVT}`);

const BIENES: FacturarExpoOpts = {
  ptoVta: 3,
  cbteTipo: CbteTipo.FACTURA_E,
  tipoExpo: TipoExpo.BIENES,
  pais: 203,
  cliente: {
    nombre: 'ACME LTDA',
    cuitPais: 50000000059,
    domicilio: 'Rua 1, São Paulo',
    idImpositivo: '12.345.678/0001-90',
  },
  moneda: 'DOL',
  cotizacion: 1015.5,
  formaPago: 'Transferencia',
  incoterms: 'FOB',
  fecha: '20261030',
  items: [
    { codigo: 'A1', descripcion: 'Vino tinto', cantidad: 3, unidad: 7, precioUnitario: 10.1 },
    { codigo: 'A2', descripcion: 'Vino blanco', cantidad: 1, unidad: 7, precioUnitario: 5, bonificacion: 0.5 },
  ],
};

describe('facturarExpo: request', () => {
  it('Cmp en el orden del WSDL, Id y número = último + 1, Permiso_existente N por defecto', async () => {
    const arca = await arcaDePrueba();
    const mock = mockArcaFetch({
      FEXGetLast_ID: lastId(41),
      FEXGetLast_CMP: lastCmp(9),
      FEXAuthorize: autorizado({ id: 42, nro: 10 }),
    });
    const res = await arca.facturarExpo(BIENES);

    const lc = mock.last('FEXGetLast_CMP').params;
    expect(lc.Auth).toEqual({ Token: 'TOKEN', Sign: 'SIGN', Cuit: '20123456786', Pto_venta: 3, Cbte_Tipo: 19 });

    const { params } = mock.last('FEXAuthorize');
    expect(orden(params)).toEqual(['Auth', 'Cmp']);
    const cmp = params.Cmp;
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
      'Id_impositivo',
      'Moneda_Id',
      'Moneda_ctz',
      'Imp_total',
      'Forma_pago',
      'Incoterms',
      'Idioma_cbte',
      'Items',
    ]);
    expect(cmp).toMatchObject({
      Id: 42,
      Cbte_nro: 10,
      Fecha_cbte: '20261030',
      Permiso_existente: 'N',
      Imp_total: 34.8,
    });
    expect(cmp.Items.Item).toHaveLength(2);
    expect(cmp.Items.Item[0]).toEqual({
      Pro_codigo: 'A1',
      Pro_ds: 'Vino tinto',
      Pro_qty: 3,
      Pro_umed: 7,
      Pro_precio_uni: 10.1,
      Pro_bonificacion: 0,
      Pro_total_item: 30.3,
    });
    expect(cmp).not.toHaveProperty('Fecha_pago');

    expect(res).not.toHaveProperty('aprobada');
    expect(res).toMatchObject({
      id: 42,
      reproceso: false,
      cae: '76123456789099',
      caeVencimiento: '20261109',
      cbteNro: 10,
      ptoVta: 3,
      cbteTipo: 19,
      fecha: '20261030',
      eventos: [],
    });
  });

  it('canMisMonExt S sin cotización: no se envía Moneda_ctz (ARCA usa la oficial, 1602)', async () => {
    const arca = await arcaDePrueba();
    const mock = mockArcaFetch({ FEXAuthorize: autorizado({ id: 7, nro: 2 }) });
    await arca.facturarExpo({ ...BIENES, cotizacion: undefined, canMisMonExt: 'S', id: 7, cbteNro: 2 });
    const cmp = mock.last('FEXAuthorize').params.Cmp;
    expect(cmp).not.toHaveProperty('Moneda_ctz');
    expect(cmp.CanMisMonExt).toBe('S');
    expect(cmp.Moneda_Id).toBe('DOL');
  });

  it('servicios: Permiso_existente vacío y Fecha_pago obligatoria (default fecha del comprobante)', async () => {
    const arca = await arcaDePrueba();
    const mock = mockArcaFetch({ FEXAuthorize: autorizado({ id: 7, nro: 2 }) });
    await arca.facturarExpo({ ...BIENES, tipoExpo: TipoExpo.SERVICIOS, incoterms: undefined, id: 7, cbteNro: 2 });
    const cmp = mock.last('FEXAuthorize').params.Cmp;
    expect(cmp.Permiso_existente).toBe('');
    expect(cmp.Fecha_pago).toBe('20261030');
    expect(mock.count('FEXGetLast_ID')).toBe(0);
  });

  it('NC E de bienes (tipo 21): Permiso_existente vacío, sin Fecha_pago, con Cmps_asoc', async () => {
    const arca = await arcaDePrueba();
    const mock = mockArcaFetch({ FEXAuthorize: autorizado({ id: 8, nro: 1, tipo: 21 }) });
    await arca.facturarExpo({
      ...BIENES,
      cbteTipo: CbteTipo.NOTA_CREDITO_E,
      id: 8,
      cbteNro: 1,
      cbtesAsoc: [{ cbteTipo: 19, cbtePuntoVta: 3, cbteNro: 10, cbteCuit: 20123456786 }],
    });
    const cmp = mock.last('FEXAuthorize').params.Cmp;
    expect(cmp.Permiso_existente).toBe('');
    expect(cmp).not.toHaveProperty('Fecha_pago');
    expect(cmp.Cmps_asoc.Cmp_asoc).toEqual({
      Cbte_tipo: 19,
      Cbte_punto_vta: 3,
      Cbte_nro: 10,
      Cbte_cuit: '20123456786',
    });
  });

  it('permiso S con permisos', async () => {
    const arca = await arcaDePrueba();
    const mock = mockArcaFetch({ FEXAuthorize: autorizado({ id: 9, nro: 1 }) });
    await arca.facturarExpo({
      ...BIENES,
      id: 9,
      cbteNro: 1,
      permisoExistente: 'S',
      permisos: [
        { idPermiso: '26001EC01000001A', dstMerc: 203 },
        { idPermiso: '26001EC01000002B', dstMerc: 203 },
      ],
    });
    const cmp = mock.last('FEXAuthorize').params.Cmp;
    expect(orden(cmp).slice(5, 8)).toEqual(['Tipo_expo', 'Permiso_existente', 'Permisos']);
    expect(cmp.Permisos.Permiso).toHaveLength(2);
  });

  it.each([
    [
      'permisoExistente en una NC E',
      { cbteTipo: CbteTipo.NOTA_CREDITO_E, permisoExistente: 'N' as const },
      'permisoExistente',
    ],
    [
      'permisoExistente en servicios',
      { tipoExpo: TipoExpo.SERVICIOS, permisoExistente: 'N' as const },
      'permisoExistente',
    ],
    ['permiso S sin permisos', { permisoExistente: 'S' as const }, 'permisos'],
    ['permisos con permiso N', { permisos: [{ Id_permiso: 'X', Dst_merc: 203 }] }, 'permisos'],
    ['fechaPago en una ND E (1673)', { cbteTipo: CbteTipo.NOTA_DEBITO_E, fechaPago: '20261030' }, 'fechaPago'],
    [
      'fechaPago anterior a la fecha en servicios (1674)',
      { tipoExpo: TipoExpo.SERVICIOS, fechaPago: '20261001' },
      'fechaPago',
    ],
    ['fecha inexistente', { fecha: '20261340' }, 'fecha'],
    ['cbteTipo no E', { cbteTipo: CbteTipo.FACTURA_B }, 'cbteTipo'],
    ['cotización 0', { cotizacion: 0 }, 'cotizacion'],
  ])('valida: %s', async (_, extra, field) => {
    const arca = await arcaDePrueba();
    const mock = mockArcaFetch({});
    const err = await arca.facturarExpo({ ...BIENES, ...extra } as FacturarExpoOpts).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaValidationError);
    expect(err.field).toBe(field);
    expect(mock.fn).not.toHaveBeenCalled();
  });
});

describe('facturarExpo: respuesta y errores', () => {
  it('FEXErr distinto de 0 → ArcaWSFEError (rechazado)', async () => {
    const arca = await arcaDePrueba();
    mockArcaFetch({ FEXAuthorize: fexErr('FEXAuthorize', 1720, 'Permisos: no debe enviarse') });
    const err = await arca.facturarExpo({ ...BIENES, id: 1, cbteNro: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaWSFEError);
    expect(err.tieneCodigo(1720)).toBe(true);
    expect(err.message).toMatch(/^WSFEX Error/);
  });

  it('rechazo (Resultado R) → ArcaRechazoError (FEXAuthorize) con Motivos_Obs en observaciones', async () => {
    const arca = await arcaDePrueba();
    mockArcaFetch({
      FEXAuthorize: autorizado({
        id: 1,
        nro: 1,
        resultado: 'R',
        obs: 'Cotizacion fuera de rango',
        events: '<FEXEvents><EventCode>12</EventCode><EventMsg>Aviso</EventMsg></FEXEvents>',
      }),
    });
    const err = await arca.facturarExpo({ ...BIENES, id: 1, cbteNro: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaRechazoError);
    expect(err).not.toBeInstanceOf(ArcaWSFEError);
    expect(err.code).toBe('ARCA_RECHAZO');
    expect(err.operacion).toBe('FEXAuthorize');
    expect(err.errors).toEqual([]);
    expect(err.observaciones).toEqual([{ code: 0, msg: 'Cotizacion fuera de rango' }]);
    expect(err.message).toContain('19-3-1');
    expect(err.message).toContain('Cotizacion fuera de rango');
  });

  it('rechazo sin Motivos_Obs → ArcaRechazoError sin observaciones', async () => {
    const arca = await arcaDePrueba();
    mockArcaFetch({ FEXAuthorize: autorizado({ id: 1, nro: 1, resultado: 'R' }) });
    const err = await arca.facturarExpo({ ...BIENES, id: 1, cbteNro: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaRechazoError);
    expect(err.observaciones).toEqual([]);
  });

  it('aprobado sin CAE → ArcaResultadoInciertoExpo con el intento (no un resultado sin CAE)', async () => {
    const arca = await arcaDePrueba();
    mockArcaFetch({ FEXAuthorize: autorizado({ id: 1, nro: 1, sinCae: true }) });
    const err = await arca.facturarExpo({ ...BIENES, id: 1, cbteNro: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaResultadoInciertoExpo);
    expect(err.intento).toMatchObject({ id: 1, cbteNro: 1, fecha: '20261030' });
    expect(err.cause).toBeInstanceOf(ArcaResponseError);
  });

  it('aprobado con observaciones: obs y eventos en el resultado', async () => {
    const arca = await arcaDePrueba();
    mockArcaFetch({
      FEXAuthorize: autorizado({
        id: 1,
        nro: 1,
        obs: 'Aviso de prueba',
        events: '<FEXEvents><EventCode>12</EventCode><EventMsg>Aviso</EventMsg></FEXEvents>',
      }),
    });
    const res = await arca.facturarExpo({ ...BIENES, id: 1, cbteNro: 1 });
    expect(res.cae).toBe('76123456789099');
    expect(res.obs).toBe('Aviso de prueba');
    expect(res.eventos).toEqual([{ code: 12, msg: 'Aviso' }]);
  });

  it('raw crearFacturaExportacion: Resultado R se devuelve tal cual (no lanza)', async () => {
    const arca = await arcaDePrueba();
    mockArcaFetch({ FEXAuthorize: autorizado({ id: 1, nro: 1, resultado: 'R', obs: 'x' }) });
    const res = await arca.crearFacturaExportacion({
      id: 1,
      cbteTipo: 19,
      fechaCbte: '20261030',
      puntoVta: 3,
      cbteNro: 1,
      tipoExpo: 2,
      dstCmp: 203,
      cliente: 'X',
      cuitPaisCliente: 50000000059,
      domicilioCliente: 'Y',
      monedaId: 'DOL',
      monedaCtz: 1000,
      impTotal: 10,
      idiomaCbte: 1,
      fechaPago: '20261030',
      items: [
        {
          proCodigo: 'S',
          proDs: 'Servicio',
          proQty: 1,
          proUmed: 7,
          proPrecioUni: 10,
          proBonificacion: 0,
          proTotalItem: 10,
        },
      ],
    });
    expect(res.fexResultAuth?.resultado).toBe('R');
  });

  it('timeout → ArcaResultadoInciertoExpo con Id y número; el reenvío con el mismo Id devuelve reproceso', async () => {
    const arca = await arcaDePrueba({ timeout: 20 });
    const mock = mockArcaFetch({
      FEXGetLast_ID: lastId(41),
      FEXGetLast_CMP: lastCmp(9),
      FEXAuthorize: [colgado(60), autorizado({ id: 42, nro: 10, reproceso: 'S' })],
    });
    const { fecha: _, ...sinFecha } = BIENES;
    const err = await arca.facturarExpo(sinFecha).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaResultadoInciertoExpo);
    expect(err.code).toBe('ARCA_RESULTADO_INCIERTO_EXPO');
    expect(err).toMatchObject({ id: 42, cbteTipo: 19, ptoVta: 3, cbteNro: 10 });
    expect(err.intento).toEqual({ id: 42, cbteNro: 10, fecha: err.request.fechaCbte });
    expect(err.cause).toBeInstanceOf(ArcaSoapError);
    expect(mock.count('FEXAuthorize')).toBe(1);

    const res = await arca.facturarExpo({ ...sinFecha, ...err.intento });
    expect(res.reproceso).toBe(true);
    expect(res.cae).toBe('76123456789099');
    // El reenvío no vuelve a pedir Id ni número.
    expect(mock.count('FEXGetLast_ID')).toBe(1);
    const reenviado = mock.last('FEXAuthorize').params.Cmp;
    expect(reenviado.Id).toBe(42);
    expect(reenviado.Cbte_nro).toBe(10);
    expect(reenviado.Fecha_cbte).toBe(err.request.fechaCbte);
  });

  it('503 → incierto con un solo fetch', async () => {
    const arca = await arcaDePrueba();
    const mock = mockArcaFetch({ FEXAuthorize: new Response('', { status: 503 }) });
    await expect(arca.facturarExpo({ ...BIENES, id: 1, cbteNro: 1 })).rejects.toBeInstanceOf(ArcaResultadoInciertoExpo);
    expect(mock.count('FEXAuthorize')).toBe(1);
  });

  it('error interno de WSFEX (501) → incierto, no rechazo', async () => {
    const arca = await arcaDePrueba();
    mockArcaFetch({ FEXAuthorize: fexErr('FEXAuthorize', 501, 'Error interno de base de datos') });
    const err = await arca.facturarExpo({ ...BIENES, id: 1, cbteNro: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaResultadoInciertoExpo);
    expect(err.cause).toBeInstanceOf(ArcaWSFEError);
  });

  it('sin FEXResultAuth y ErrCode 0 → incierto (no un rechazo con número inventado)', async () => {
    const arca = await arcaDePrueba();
    mockArcaFetch({ FEXAuthorize: wsfexResponse('FEXAuthorize', OK_ERR + OK_EVT) });
    await expect(arca.facturarExpo({ ...BIENES, id: 1, cbteNro: 1 })).rejects.toBeInstanceOf(ArcaResultadoInciertoExpo);
  });

  it('raw crearFacturaExportacion: incierto con el request para reenviar', async () => {
    const arca = await arcaDePrueba();
    mockArcaFetch({ FEXAuthorize: networkError('ECONNRESET') });
    const invoice = {
      id: 5,
      cbteTipo: 19,
      fechaCbte: '20261030',
      puntoVta: 3,
      cbteNro: 4,
      tipoExpo: 2,
      dstCmp: 203,
      cliente: 'X',
      cuitPaisCliente: 50000000059,
      domicilioCliente: 'Y',
      idImpositivo: 'Z',
      monedaId: 'DOL',
      monedaCtz: 1000,
      impTotal: 10,
      idiomaCbte: 1,
      formaPago: 'T',
      fechaPago: '20261030',
      items: [
        {
          proCodigo: 'S',
          proDs: 'Servicio',
          proQty: 1,
          proUmed: 7,
          proPrecioUni: 10,
          proBonificacion: 0,
          proTotalItem: 10,
        },
      ],
    };
    const err = await arca.crearFacturaExportacion(invoice).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaResultadoInciertoExpo);
    expect(err.request).toEqual(invoice);
  });
});

describe('facturarExpo: Id repetido (único por CUIT)', () => {
  it('Id calculado y WSFEX devuelve otro comprobante → ArcaConflictoExpo, no se autorizó', async () => {
    const arca = await arcaDePrueba();
    // Otra emisión (ptoVta 4) usó el Id 42 mientras tanto.
    mockArcaFetch({
      FEXGetLast_ID: lastId(41),
      FEXGetLast_CMP: lastCmp(9),
      FEXAuthorize: autorizado({ id: 42, nro: 77, ptoVta: 4, reproceso: 'S' }),
    });
    const err = await arca.facturarExpo(BIENES).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaConflictoExpo);
    expect(err.code).toBe('ARCA_CONFLICTO_EXPO');
    expect(err.id).toBe(42);
    expect(err.request.cbteNro).toBe(10);
    expect(err.respuesta.fexResultAuth.cbteNro).toBe(77);
  });

  it('Id calculado con Reproceso "S" para el mismo número → ArcaConflictoExpo', async () => {
    const arca = await arcaDePrueba();
    mockArcaFetch({
      FEXGetLast_ID: lastId(41),
      FEXGetLast_CMP: lastCmp(9),
      FEXAuthorize: autorizado({ id: 42, nro: 10, reproceso: 'S' }),
    });
    await expect(arca.facturarExpo(BIENES)).rejects.toBeInstanceOf(ArcaConflictoExpo);
  });

  it('Id explícito (reenvío) con Reproceso "S" del mismo comprobante → resultado original', async () => {
    const arca = await arcaDePrueba();
    mockArcaFetch({ FEXAuthorize: autorizado({ id: 42, nro: 10, reproceso: 'S' }) });
    const res = await arca.facturarExpo({ ...BIENES, id: 42, cbteNro: 10 });
    expect(res).toMatchObject({ reproceso: true, cbteNro: 10, cae: '76123456789099' });
  });

  it('API raw: respuesta de otro comprobante → ArcaConflictoExpo', async () => {
    const arca = await arcaDePrueba();
    mockArcaFetch({
      FEXGetLast_ID: lastId(41),
      FEXGetLast_CMP: lastCmp(9),
      FEXAuthorize: [autorizado({ id: 42, nro: 10 }), autorizado({ id: 42, nro: 11, reproceso: 'S' })],
    });
    await arca.facturarExpo(BIENES);
    const err = await arca.facturarExpo({ ...BIENES, id: 42, cbteNro: 12 }).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaConflictoExpo);
  });
});

describe('facturarExpo: cliente e items especiales', () => {
  it('solo Id_impositivo: Cuit_pais_cliente va en 0 (1580)', async () => {
    const arca = await arcaDePrueba();
    const mock = mockArcaFetch({ FEXAuthorize: autorizado({ id: 42, nro: 10 }) });
    await arca.facturarExpo({
      ...BIENES,
      id: 42,
      cbteNro: 10,
      cliente: { nombre: 'ACME LTDA', domicilio: 'Rua 1', idImpositivo: 'PJ54482221-l' },
    });
    const cmp = mock.last('FEXAuthorize').params.Cmp;
    expect(cmp.Cuit_pais_cliente).toBe(0);
    expect(cmp.Id_impositivo).toBe('PJ54482221-l');
  });

  it('sin cuitPais ni idImpositivo → ArcaValidationError (1580)', async () => {
    const arca = await arcaDePrueba();
    const mock = mockArcaFetch({});
    const err = await arca.facturarExpo({ ...BIENES, cliente: { nombre: 'ACME', domicilio: 'Rua 1' } }).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaValidationError);
    expect(err.message).toContain('1580');
    expect(mock.fn).not.toHaveBeenCalled();
  });

  it('items con unidad 97 (seña) y 99 (bonificación): cantidad y precio 0, total explícito', async () => {
    const arca = await arcaDePrueba();
    const mock = mockArcaFetch({ FEXAuthorize: autorizado({ id: 42, nro: 10 }) });
    await arca.facturarExpo({
      ...BIENES,
      id: 42,
      cbteNro: 10,
      items: [
        { codigo: 'A1', descripcion: 'Vino', cantidad: 10, unidad: 7, precioUnitario: 10 },
        { codigo: 'S', descripcion: 'Seña recibida', cantidad: 0, unidad: 97, precioUnitario: 0, total: -20 },
        { codigo: 'B', descripcion: 'Bonificación', cantidad: 0, unidad: 99, precioUnitario: 0, total: -5.5 },
      ],
    });
    const cmp = mock.last('FEXAuthorize').params.Cmp;
    expect(cmp.Items.Item[1]).toMatchObject({ Pro_umed: 97, Pro_qty: 0, Pro_precio_uni: 0, Pro_total_item: -20 });
    expect(cmp.Items.Item[2]).toMatchObject({ Pro_umed: 99, Pro_total_item: -5.5 });
    expect(cmp.Imp_total).toBe(74.5);
  });

  it.each([
    ['99 con total >= 0', { unidad: 99, cantidad: 0, precioUnitario: 0, total: 5 }],
    ['97 sin total', { unidad: 97, cantidad: 0, precioUnitario: 0 }],
    ['97 con cantidad', { unidad: 97, cantidad: 1, precioUnitario: 0, total: 5 }],
    ['total en una unidad común', { unidad: 7, cantidad: 1, precioUnitario: 5, total: 5 }],
  ])('rechaza item %s', async (_, item) => {
    const arca = await arcaDePrueba();
    const mock = mockArcaFetch({});
    const err = await arca
      .facturarExpo({ ...BIENES, items: [{ codigo: 'X', descripcion: 'X', ...item }] })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ArcaValidationError);
    expect(mock.fn).not.toHaveBeenCalled();
  });

  it('formaPago es obligatoria solo en Factura E (1620)', async () => {
    const arca = await arcaDePrueba();
    const mock = mockArcaFetch({ FEXAuthorize: autorizado({ id: 42, nro: 10, tipo: 21 }) });
    await expect(arca.facturarExpo({ ...BIENES, formaPago: undefined })).rejects.toThrow('1620');
    await arca.facturarExpo({
      ...BIENES,
      cbteTipo: CbteTipo.NOTA_CREDITO_E,
      formaPago: undefined,
      id: 42,
      cbteNro: 10,
      cbtesAsoc: [{ cbteTipo: 19, cbtePuntoVta: 3, cbteNro: 9, cbteCuit: 20123456786 }],
    });
    expect(mock.last('FEXAuthorize').params.Cmp).not.toHaveProperty('Forma_pago');
  });
});

describe('WSFEX: consultas', () => {
  it('getLastCmp con FEXErr → ArcaWSFEError; sin resultado → error', async () => {
    const arca = await arcaDePrueba();
    mockArcaFetch({
      FEXGetLast_CMP: [
        fexErr('FEXGetLast_CMP', 1520, 'Punto de venta invalido'),
        wsfexResponse('FEXGetLast_CMP', OK_ERR),
      ],
    });
    await expect(arca.ultimoComprobanteExpo(3, 19)).rejects.toBeInstanceOf(ArcaWSFEError);
    await expect(arca.ultimoComprobanteExpo(3, 19)).rejects.toBeInstanceOf(ArcaResponseError);
  });

  it.each([
    [1000, 'Usuario no autorizado a realizar esta operacion'],
    [1001, 'Cuit solicitante no se encuentra entre sus relaciones'],
  ])('FEXErr de autenticación %i → ArcaAuthError no reintentable', async (code, msg) => {
    const arca = await arcaDePrueba();
    mockArcaFetch({ FEXGetLast_CMP: fexErr('FEXGetLast_CMP', code, msg) });
    const err = await arca.ultimoComprobanteExpo(3, 19).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaAuthError);
    expect(err.faultCode).toBe(String(code));
    expect(err.retryable).toBe(false);
    expect(err.cause).toBeInstanceOf(ArcaWSFEError);
  });

  it('siguienteComprobanteExpo acepta CallOptions', async () => {
    const arca = await arcaDePrueba();
    const mock = mockArcaFetch({ FEXGetLast_CMP: lastCmp(9) });
    const controller = new AbortController();
    controller.abort();
    await expect(arca.siguienteComprobanteExpo(3, 19, { signal: controller.signal })).rejects.toThrow();
    expect(mock.count('FEXGetLast_CMP')).toBe(0);
  });

  it('getCmp: campos del WSDL (Fecha_cbte_cae, Motivos_Obs)', async () => {
    const arca = await arcaDePrueba();
    const mock = mockArcaFetch({
      FEXGetCMP: wsfexResponse(
        'FEXGetCMP',
        '<FEXResultGet><Id>42</Id><Fecha_cbte>20261030</Fecha_cbte><Cbte_tipo>19</Cbte_tipo><Punto_vta>3</Punto_vta><Cbte_nro>10</Cbte_nro>' +
          '<Tipo_expo>1</Tipo_expo><Permiso_existente>N</Permiso_existente><Dst_cmp>203</Dst_cmp><Cliente>ACME</Cliente>' +
          '<Cuit_pais_cliente>50000000059</Cuit_pais_cliente><Moneda_Id>DOL</Moneda_Id><Moneda_ctz>1015.5</Moneda_ctz>' +
          '<Imp_total>34.8</Imp_total><Idioma_cbte>1</Idioma_cbte><Fecha_cbte_cae>20261030</Fecha_cbte_cae>' +
          '<Fch_venc_Cae>20261109</Fch_venc_Cae><Cae>76123456789099</Cae><Resultado>A</Resultado><Motivos_Obs>Obs X</Motivos_Obs>' +
          `</FEXResultGet>${OK_ERR}`,
      ),
    });
    const res = await arca.consultarComprobanteExpo(19, 3, 10);
    expect(mock.last('FEXGetCMP').params.Cmp).toEqual({ Cbte_tipo: 19, Punto_vta: 3, Cbte_nro: 10 });
    expect(res.fexResultGet).toMatchObject({
      cae: '76123456789099',
      fechaCbteCae: '20261030',
      motivosObs: 'Obs X',
      impTotal: 34.8,
    });
  });

  it('parámetros: países (FEXGetPARAM_DST_pais), puntos de venta, opcionales, actividades', async () => {
    const arca = await arcaDePrueba();
    mockArcaFetch({
      FEXGetPARAM_DST_pais: wsfexResponse(
        'FEXGetPARAM_DST_pais',
        '<FEXResultGet><ClsFEXResponse_DST_pais><DST_Codigo>203</DST_Codigo><DST_Ds>BRASIL</DST_Ds></ClsFEXResponse_DST_pais></FEXResultGet>' +
          OK_ERR,
      ),
      FEXGetPARAM_PtoVenta: wsfexResponse(
        'FEXGetPARAM_PtoVenta',
        '<FEXResultGet><ClsFEXResponse_PtoVenta><Pve_Nro>3</Pve_Nro><Pve_Bloqueado>N</Pve_Bloqueado><Pve_FchBaja>NULL</Pve_FchBaja></ClsFEXResponse_PtoVenta>' +
          '<ClsFEXResponse_PtoVenta><Pve_Nro>4</Pve_Nro><Pve_Bloqueado>S</Pve_Bloqueado></ClsFEXResponse_PtoVenta></FEXResultGet>' +
          OK_ERR,
      ),
      FEXGetPARAM_Opcionales: wsfexResponse(
        'FEXGetPARAM_Opcionales',
        '<FEXResultGet><ClsFEXResponse_Opc><Opc_Id>1</Opc_Id><Opc_Ds>Opcional</Opc_Ds></ClsFEXResponse_Opc></FEXResultGet>' +
          OK_ERR,
      ),
      FEXGetPARAM_Actividades: wsfexResponse(
        'FEXGetPARAM_Actividades',
        '<FEXResultGet><ClsFEXResponse_ActividadTipo><Id>620100</Id><Orden>1</Orden><Desc>Consultoría</Desc></ClsFEXResponse_ActividadTipo></FEXResultGet>' +
          OK_ERR,
      ),
    });
    expect(await arca.getPaisesExpo()).toEqual([{ dstCodigo: 203, dstDs: 'BRASIL' }]);
    expect((await arca.getPuntosVentaExpo()).map((p) => p.pveNro)).toEqual([3, 4]);
    expect(await arca.getOpcionalesExpo()).toEqual([{ opcId: 1, opcDs: 'Opcional' }]);
    expect(await arca.getActividadesExpo()).toEqual([{ id: 620100, orden: 1, desc: 'Consultoría' }]);
  });

  it('FEXGetPARAM_Ctz y FEXCheck_Permiso', async () => {
    const arca = await arcaDePrueba();
    const mock = mockArcaFetch({
      FEXGetPARAM_Ctz: wsfexResponse(
        'FEXGetPARAM_Ctz',
        `<FEXResultGet><Mon_ctz>1015.5</Mon_ctz><Mon_fecha>20261029</Mon_fecha></FEXResultGet>${OK_ERR}`,
      ),
      FEXCheck_Permiso: wsfexResponse('FEXCheck_Permiso', `<FEXResultGet><Status>OK</Status></FEXResultGet>${OK_ERR}`),
    });
    expect(await arca.getCotizacionExpo('DOL', { fecha: '20261029' })).toEqual({
      monCtz: 1015.5,
      monFecha: '20261029',
    });
    expect(orden(mock.last('FEXGetPARAM_Ctz').params)).toEqual(['Auth', 'Mon_id', 'FchCotiz']);
    expect(await arca.checkPermisoExpo('26001EC01000001A', 203)).toBe('OK');
    expect(orden(mock.last('FEXCheck_Permiso').params)).toEqual(['Auth', 'ID_Permiso', 'Dst_merc']);
  });
});

describe('endpoints.wsfex', () => {
  it('lo usa status()', async () => {
    const urls: string[] = [];
    const ok = '<AppServer>OK</AppServer><DbServer>OK</DbServer><AuthServer>OK</AuthServer>';
    const fetchPropio = vi.fn(async (url: string) => {
      urls.push(url);
      return url.includes('wsfex') ? wsfexResponse('FEXDummy', ok) : wsfeResponse('FEDummy', ok);
    }) as unknown as typeof fetch;
    const arca = await arcaDePrueba({ fetch: fetchPropio, endpoints: { wsfex: 'https://proxy.local/wsfex' } });
    await arca.status();
    expect(urls).toContain('https://proxy.local/wsfex');
  });
});
