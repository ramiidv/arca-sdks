import { describe, it, expect } from 'vitest';
import {
  ArcaAgroResponseError,
  ArcaAgroServiceError,
  ArcaServiceError,
  ArcaSoapError,
  ArcaValidationError,
  CPE_ENDPOINTS,
  TIPO_CPE,
  cpeFaultException,
} from '../src/index.js';
import type { ArcaAgro, AutorizarCPEAutomotorParams, AutorizarCPEFerroviariaParams } from '../src/index.js';
import { CPE_NS, CUIT, CUIT2, CUIT3, CUIT4, CUIT5, cpeResp, envelope, hang, http503, keys, setup } from './helpers.js';

const cartaPorte = { tipoCPE: TIPO_CPE.AUTOMOTOR, sucursal: 1, nroOrden: 15 };

function autorizarAutomotor(): AutorizarCPEAutomotorParams {
  // Claves a propósito en un orden distinto al del XSD: el SDK las reordena.
  return {
    observaciones: 'Soja a puerto',
    transporte: {
      mercaderiaFumigada: false,
      cuitPagadorFlete: CUIT2,
      tarifa: 1500.499,
      cuitChofer: CUIT5,
      kmRecorrer: 250,
      fechaHoraPartida: new Date('2026-11-01T11:30:00Z'),
      dominio: ['AB123CD', 'AC456EF'],
      cuitTransportista: CUIT3,
    },
    destinatario: { cuit: CUIT4 },
    destino: { planta: 1938, codLocalidad: 5244, codProvincia: 12, esDestinoCampo: false, cuit: CUIT4 },
    datosCarga: { pesoTara: 12000, pesoBruto: 42000, cosecha: 2526, codGrano: 23 },
    esSolicitanteCampo: true,
    correspondeRetiroProductor: false,
    origen: { productor: { codLocalidad: 10270, codProvincia: 1 } },
    cabecera: { nroOrden: 15, sucursal: 1, cuitSolicitante: '20-12345678-6', tipoCP: TIPO_CPE.AUTOMOTOR },
  };
}

function autorizarFerroviaria(): AutorizarCPEFerroviariaParams {
  return {
    cabecera: { sucursal: 1, nroOrden: 7, planta: 1938 },
    correspondeRetiroProductor: false,
    datosCarga: { codGrano: 23, cosecha: 2526, pesoBruto: 80000, pesoTara: 25000 },
    destino: { cuit: CUIT4, esDestinoCampo: false, codProvincia: 12, codLocalidad: 5244, planta: 2000 },
    destinatario: { cuit: CUIT4 },
    transporte: {
      cuitTransportista: CUIT3,
      nroVagon: 123456,
      nroPrecinto: ['P-0001'],
      nroOperativo: 9876543210,
      ramal: { codigo: 3 },
      fechaHoraPartidaTren: '2026-11-01T08:00:00-03:00',
      kmRecorrer: 400,
      mercaderiaFumigada: true,
    },
  };
}

const CABECERA = (ctg = '010100012345') =>
  `<cabecera><tipoCartaPorte>74</tipoCartaPorte><sucursal>1</sucursal><nroOrden>15</nroOrden><nroCTG>${ctg}</nroCTG>` +
  `<fechaEmision>2026-11-01T08:31:12-03:00</fechaEmision><estado>AC</estado>` +
  `<fechaInicioEstado>2026-11-01T08:31:12-03:00</fechaInicioEstado><fechaVencimiento>2026-11-06T00:00:00-03:00</fechaVencimiento></cabecera>`;

const METADATA = '<metadata><servidor>cpea-ws-1</servidor><fechaHora>2026-11-01T08:31:12-03:00</fechaHora></metadata>';

const DETALLE_AUTOMOTOR =
  CABECERA() +
  `<origen><cuit>${CUIT}</cuit><codProvincia>1</codProvincia><codLocalidad>10270</codLocalidad></origen>` +
  `<correspondeRetiroProductor>false</correspondeRetiroProductor>` +
  `<datosCarga><codGrano>23</codGrano><pesoBruto>42000</pesoBruto><pesoTara>12000</pesoTara><cosecha>2526</cosecha></datosCarga>` +
  `<destino><cuit>${CUIT4}</cuit><codProvincia>12</codProvincia><codLocalidad>5244</codLocalidad><planta>1938</planta></destino>` +
  `<destinatario><cuit>${CUIT4}</cuit></destinatario>` +
  `<transporte><cuitTransportista>${CUIT3}</cuitTransportista><dominio>AB123CD</dominio>` +
  `<fechaHoraPartida>2026-11-01T08:30:00-03:00</fechaHoraPartida><kmRecorrer>250</kmRecorrer><cuitChofer>${CUIT5}</cuitChofer>` +
  `<tarifaReferencia>1400.00</tarifaReferencia><tarifa>1500.50</tarifa><cuitPagadorFlete>${CUIT2}</cuitPagadorFlete>` +
  `<mercaderiaFumigada>false</mercaderiaFumigada></transporte>` +
  `<pdf>JVBERi0xLjQ=</pdf>` +
  METADATA;

const ERROR_1 =
  '<errores><error><codigo>1501</codigo><descripcion>El número de orden ya fue utilizado.</descripcion></error></errores>';
const ERROR_N =
  '<errores><error><codigo>1501</codigo><descripcion>El número de orden ya fue utilizado.</descripcion></error>' +
  '<error><codigo>2104</codigo><descripcion>El CUIT del destino no es válido.</descripcion></error></errores>';

const CARTA_PORTE_RESP = CABECERA() + METADATA;

describe('WSCPE: transporte y forma del request', () => {
  it('autorizarCPEAutomotor: wrapper, namespace, SOAPAction, auth y orden XSD', async () => {
    const { agro, calls } = setup(() => cpeResp('AutorizarCPEAutomotorResp', DETALLE_AUTOMOTOR));
    await agro.cpe.autorizarCPEAutomotor(autorizarAutomotor());

    expect(calls).toHaveLength(1);
    const c = calls[0];
    expect(c.url).toBe(CPE_ENDPOINTS.testing);
    expect(c.url).toBe('https://cpea-ws-qaext.afip.gob.ar/wscpe/services/soap');
    expect(c.element).toBe('ser:AutorizarCPEAutomotorReq');
    expect(c.ns).toBe(CPE_NS);
    expect(c.soapAction).toBe('"https://serviciosjava.afip.gob.ar/wscpe/autorizarCPEAutomotor"');
    expect(keys(c.req)).toEqual(['auth', 'solicitud']);
    expect(keys(c.req.auth)).toEqual(['token', 'sign', 'cuitRepresentada']);
    expect(c.req.auth).toEqual({ token: 'TOKEN', sign: 'SIGN', cuitRepresentada: CUIT });

    const s = c.req.solicitud;
    expect(keys(s)).toEqual([
      'cabecera',
      'origen',
      'correspondeRetiroProductor',
      'esSolicitanteCampo',
      'datosCarga',
      'destino',
      'destinatario',
      'transporte',
      'observaciones',
    ]);
    expect(keys(s.cabecera)).toEqual(['tipoCP', 'cuitSolicitante', 'sucursal', 'nroOrden']);
    expect(s.cabecera.cuitSolicitante).toBe(CUIT); // normalizado sin guiones
    expect(keys(s.origen.productor)).toEqual(['codProvincia', 'codLocalidad']);
    expect(keys(s.datosCarga)).toEqual(['codGrano', 'cosecha', 'pesoBruto', 'pesoTara']);
    expect(keys(s.destino)).toEqual(['cuit', 'esDestinoCampo', 'codProvincia', 'codLocalidad', 'planta']);
    expect(keys(s.transporte)).toEqual([
      'cuitTransportista',
      'dominio',
      'fechaHoraPartida',
      'kmRecorrer',
      'cuitChofer',
      'tarifa',
      'cuitPagadorFlete',
      'mercaderiaFumigada',
    ]);
    expect(s.transporte.dominio).toEqual(['AB123CD', 'AC456EF']);
    expect(s.transporte.fechaHoraPartida).toBe('2026-11-01T08:30:00-03:00');
    expect(c.body).toContain('<tarifa>1500.50</tarifa>');
    expect(c.body).toContain('<esSolicitanteCampo>true</esSolicitanteCampo>');
    expect(c.body).toContain('<mercaderiaFumigada>false</mercaderiaFumigada>');
  });

  it('autorizarCPEAutomotor: parsea la respuesta (nroCTG string, CUIT number, dominio array)', async () => {
    const { agro } = setup(() => cpeResp('AutorizarCPEAutomotorResp', DETALLE_AUTOMOTOR));
    const r = await agro.cpe.autorizarCPEAutomotor(autorizarAutomotor());
    expect(r.cabecera).toEqual({
      tipoCartaPorte: 74,
      sucursal: 1,
      nroOrden: 15,
      nroCTG: '010100012345',
      fechaEmision: '2026-11-01T08:31:12-03:00',
      estado: 'AC',
      fechaInicioEstado: '2026-11-01T08:31:12-03:00',
      fechaVencimiento: '2026-11-06T00:00:00-03:00',
    });
    expect(r.origen).toEqual({ cuit: Number(CUIT), codProvincia: 1, codLocalidad: 10270 });
    expect(r.correspondeRetiroProductor).toBe(false);
    expect(r.transporte?.dominio).toEqual(['AB123CD']);
    expect(r.transporte?.tarifa).toBe(1500.5);
    expect(r.transporte?.tarifaReferencia).toBe(1400);
    expect(r.pdf).toBe('JVBERi0xLjQ=');
    expect(r.metadata?.servidor).toBe('cpea-ws-1');
  });

  it('autorizarCPEFerroviaria: wrapper, orden XSD y precintos', async () => {
    const resp =
      CABECERA('020200012345').replace('<tipoCartaPorte>74', '<tipoCartaPorte>75') +
      `<transporte><nroVagon>123456</nroVagon><nroPrecinto>P-0001</nroPrecinto><nroPrecinto>P-0002</nroPrecinto>` +
      `<nroOperativo>9876543210</nroOperativo><ramal><codigo>3</codigo><descripcion>Mitre</descripcion></ramal></transporte>`;
    const { agro, calls } = setup(() => cpeResp('AutorizarCPEFerroviariaResp', resp));
    const r = await agro.cpe.autorizarCPEFerroviaria(autorizarFerroviaria());
    const c = calls[0];
    expect(c.element).toBe('ser:AutorizarCPEFerroviariaReq');
    expect(c.soapAction).toBe(`"${CPE_NS}autorizarCPEFerroviaria"`);
    expect(keys(c.req.solicitud)).toEqual([
      'cabecera',
      'correspondeRetiroProductor',
      'datosCarga',
      'destino',
      'destinatario',
      'transporte',
    ]);
    expect(keys(c.req.solicitud.cabecera)).toEqual(['sucursal', 'nroOrden', 'planta']);
    expect(keys(c.req.solicitud.transporte)).toEqual([
      'cuitTransportista',
      'nroVagon',
      'nroPrecinto',
      'nroOperativo',
      'ramal',
      'fechaHoraPartidaTren',
      'kmRecorrer',
      'mercaderiaFumigada',
    ]);
    expect(c.req.solicitud.transporte.fechaHoraPartidaTren).toBe('2026-11-01T08:00:00-03:00');
    expect(r.cabecera.nroCTG).toBe('020200012345');
    expect(r.cabecera.tipoCartaPorte).toBe(75);
    expect(r.transporte?.nroPrecinto).toEqual(['P-0001', 'P-0002']);
    expect(r.transporte?.nroOperativo).toBe(9876543210);
    expect(r.transporte?.ramal).toEqual({ codigo: 3, descripcion: 'Mitre' });
  });

  it('usa el endpoint de producción y permite sobrescribirlo', async () => {
    const prod = setup(
      () => cpeResp('DummyResp', '<appserver>Ok</appserver><authserver>Ok</authserver><dbserver>Ok</dbserver>'),
      {
        production: true,
      },
    );
    await prod.agro.cpe.dummy();
    expect(prod.calls[0].url).toBe('https://cpea-ws.afip.gob.ar/wscpe/services/soap');

    const custom = setup(
      () => cpeResp('DummyResp', '<appserver>Ok</appserver><authserver>Ok</authserver><dbserver>Ok</dbserver>'),
      {
        endpoints: { cpe: 'https://proxy.local/wscpe' },
      },
    );
    await custom.agro.cpe.dummy();
    expect(custom.calls[0].url).toBe('https://proxy.local/wscpe');
  });

  it('dummy: Body vacío, sin auth, parsea DummyResp', async () => {
    const { agro, calls } = setup(() =>
      cpeResp('DummyResp', '<appserver>Ok</appserver><authserver>Ok</authserver><dbserver>Ok</dbserver>'),
    );
    expect(await agro.cpe.dummy()).toEqual({ appserver: 'Ok', authserver: 'Ok', dbserver: 'Ok' });
    expect(calls[0].element).toBe('');
    expect(calls[0].body).not.toContain('<auth>');
    expect(calls[0].soapAction).toBe(`"${CPE_NS}dummy"`);
  });
});

// ---------------------------------------------------------------------------
// Todas las operaciones de modificación (CartaPorteRespuesta)
// ---------------------------------------------------------------------------

interface OpCase {
  method: string;
  run: (agro: ArcaAgro) => Promise<unknown>;
  order: string[];
}

const modifica = { fechaHoraPartida: '2026-11-02T09:00:00-03:00', kmRecorrer: 120 };
const modificaTren = {
  ramal: { codigo: 99, descripcion: 'Otro' },
  fechaHoraPartidaTren: '2026-11-02T09:00:00-03:00',
  kmRecorrer: 300,
};
const destino = { cuit: CUIT4, esDestinoCampo: false, codProvincia: 12, codLocalidad: 5244, planta: 1938 };

const OPERACIONES: OpCase[] = [
  {
    method: 'editarCPEAutomotor',
    run: (a) =>
      a.cpe.editarCPEAutomotor({
        nroCTG: '010100012345',
        cuitDestinatario: CUIT4,
        cuitChofer: CUIT5,
        cuitTransportista: CUIT3,
        destino,
        pesoBruto: 41000,
        codGrano: 23,
        dominio: ['AB123CD'],
      }),
    order: [
      'nroCTG',
      'cuitDestinatario',
      'cuitChofer',
      'cuitTransportista',
      'destino',
      'pesoBruto',
      'codGrano',
      'dominio',
    ],
  },
  {
    method: 'editarCPEConfirmadaAutomotor',
    run: (a) =>
      a.cpe.editarCPEConfirmadaAutomotor({ nroCTG: 10100012345, intervinientes: { cuitCorredorVentaPrimaria: CUIT2 } }),
    order: ['nroCTG', 'intervinientes'],
  },
  {
    method: 'confirmarArriboCPE',
    run: (a) => a.cpe.confirmarArriboCPE({ cuitSolicitante: CUIT, cartaPorte }),
    order: ['cuitSolicitante', 'cartaPorte'],
  },
  {
    method: 'confirmacionDefinitivaCPEAutomotor',
    run: (a) =>
      a.cpe.confirmacionDefinitivaCPEAutomotor({
        pesoTaraDescarga: 12000,
        pesoBrutoDescarga: 41800,
        cartaPorte,
        cuitSolicitante: CUIT,
      }),
    order: ['cuitSolicitante', 'cartaPorte', 'pesoBrutoDescarga', 'pesoTaraDescarga'],
  },
  {
    method: 'descargadoDestinoCPE',
    run: (a) => a.cpe.descargadoDestinoCPE({ cuitSolicitante: CUIT, cartaPorte }),
    order: ['cuitSolicitante', 'cartaPorte'],
  },
  {
    method: 'rechazoCPE',
    run: (a) =>
      a.cpe.rechazoCPE({ cuitSolicitante: CUIT, cartaPorte, rechazoMotivo: 2, rechazoObservaciones: 'Humedad' }),
    order: ['cuitSolicitante', 'cartaPorte', 'rechazoMotivo', 'rechazoObservaciones'],
  },
  {
    method: 'anularCPE',
    run: (a) => a.cpe.anularCPE({ anulacionObservaciones: 'Error de carga', anulacionMotivo: 3, cartaPorte }),
    order: ['cartaPorte', 'anulacionMotivo', 'anulacionObservaciones'],
  },
  {
    method: 'nuevoDestinoDestinatarioCPEAutomotor',
    run: (a) =>
      a.cpe.nuevoDestinoDestinatarioCPEAutomotor({
        transporte: modifica,
        destinatario: { cuit: CUIT2 },
        destino,
        cartaPorte,
      }),
    order: ['cartaPorte', 'destino', 'destinatario', 'transporte'],
  },
  {
    method: 'regresoOrigenCPEAutomotor',
    run: (a) => a.cpe.regresoOrigenCPEAutomotor({ transporte: modifica, cartaPorte }),
    order: ['cartaPorte', 'transporte'],
  },
  {
    method: 'desvioCPEAutomotor',
    run: (a) => a.cpe.desvioCPEAutomotor({ transporte: modifica, destino, cartaPorte, cuitSolicitante: CUIT }),
    order: ['cuitSolicitante', 'cartaPorte', 'destino', 'transporte'],
  },
  {
    method: 'informarContingencia',
    run: (a) => a.cpe.informarContingencia({ contingencia: { descripcion: 'Rotura', concepto: 'C' }, cartaPorte }),
    order: ['cartaPorte', 'contingencia'],
  },
  {
    method: 'cerrarContingenciaCPE',
    run: (a) =>
      a.cpe.cerrarContingenciaCPE({
        motivoDesactivacionCP: { concepto: 'B' },
        concepto: 'C',
        cartaPorte,
      }),
    order: ['cartaPorte', 'concepto', 'motivoDesactivacionCP'],
  },
  {
    method: 'editarCPEFerroviaria',
    run: (a) => a.cpe.editarCPEFerroviaria({ codGrano: 23, pesoBruto: 70000, nroVagon: 5, nroCTG: '020200012345' }),
    order: ['nroCTG', 'nroVagon', 'pesoBruto', 'codGrano'],
  },
  {
    method: 'editarCPEConfirmadaFerroviaria',
    run: (a) => a.cpe.editarCPEConfirmadaFerroviaria({ nroCTG: '020200012345', intervinientes: {} }),
    order: ['nroCTG', 'intervinientes'],
  },
  {
    method: 'confirmacionDefinitivaCPEFerroviaria',
    run: (a) =>
      a.cpe.confirmacionDefinitivaCPEFerroviaria({
        ramalDescarga: { codigo: 1 },
        pesoTaraDescarga: 25000,
        pesoBrutoDescarga: 79000,
        cartaPorte: { ...cartaPorte, tipoCPE: TIPO_CPE.FERROVIARIA },
        cuitSolicitante: CUIT,
      }),
    order: ['cuitSolicitante', 'cartaPorte', 'pesoBrutoDescarga', 'pesoTaraDescarga', 'ramalDescarga'],
  },
  {
    method: 'nuevoDestinoDestinatarioCPEFerroviaria',
    run: (a) =>
      a.cpe.nuevoDestinoDestinatarioCPEFerroviaria({
        transporte: modificaTren,
        destino,
        cartaPorte: { ...cartaPorte, tipoCPE: 75 },
      }),
    order: ['cartaPorte', 'destino', 'transporte'],
  },
  {
    method: 'regresoOrigenCPEFerroviaria',
    run: (a) =>
      a.cpe.regresoOrigenCPEFerroviaria({ transporte: modificaTren, cartaPorte: { ...cartaPorte, tipoCPE: 75 } }),
    order: ['cartaPorte', 'transporte'],
  },
  {
    method: 'desvioCPEFerroviaria',
    run: (a) =>
      a.cpe.desvioCPEFerroviaria({
        transporte: modificaTren,
        destino: { planta: 10, codLocalidad: 1, codProvincia: 1, cuit: CUIT4 },
        cartaPorte: { ...cartaPorte, tipoCPE: 75 },
      }),
    order: ['cartaPorte', 'destino', 'transporte'],
  },
];

const capital = (m: string) => m.charAt(0).toUpperCase() + m.slice(1);

describe.each(OPERACIONES)('WSCPE $method (emisión)', ({ method, run, order }) => {
  it('envía <Op>Req con auth y la solicitud en orden XSD; parsea <Op>Resp', async () => {
    const { agro, calls } = setup(() => cpeResp(`${capital(method)}Resp`, CARTA_PORTE_RESP));
    const r = (await run(agro)) as { cabecera?: { nroCTG?: string; estado?: string } };
    const c = calls[0];
    expect(c.element).toBe(`ser:${capital(method)}Req`);
    expect(c.ns).toBe(CPE_NS);
    expect(c.soapAction).toBe(`"${CPE_NS}${method}"`);
    expect(keys(c.req)).toEqual(['auth', 'solicitud']);
    expect(c.req.auth.cuitRepresentada).toBe(CUIT);
    expect(keys(c.req.solicitud)).toEqual(order);
    expect(r.cabecera?.nroCTG).toBe('010100012345');
    expect(r.cabecera?.estado).toBe('AC');
  });

  it('errores de negocio (1 y N) lanzan ArcaAgroServiceError', async () => {
    const one = setup(() => cpeResp(`${capital(method)}Resp`, ERROR_1));
    const e1: any = await run(one.agro).catch((e: any) => e);
    expect(e1).toBeInstanceOf(ArcaAgroServiceError);
    expect(e1).toBeInstanceOf(ArcaServiceError);
    expect(e1.errors).toEqual([{ code: 1501, msg: 'El número de orden ya fue utilizado.' }]);
    expect(e1.method).toBe(method);

    const many = setup(() => cpeResp(`${capital(method)}Resp`, ERROR_N));
    const eN: any = await run(many.agro).catch((e: any) => e);
    expect(eN).toBeInstanceOf(ArcaAgroServiceError);
    expect(eN.errors.map((e: { code: number }) => e.code)).toEqual([1501, 2104]);
  });

  it('no reintenta ante un 503 y el error es uncertain', async () => {
    const { agro, fetchMock } = setup(http503);
    const e: any = await run(agro).catch((err: any) => err);
    expect(e).toBeInstanceOf(ArcaSoapError);
    expect(e.uncertain).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('WSCPE: emisiones sin reintento', () => {
  it('autorizarCPEAutomotor: timeout → 1 fetch, uncertain', async () => {
    const { agro, fetchMock } = setup(hang, { timeout: 30 });
    const e = await agro.cpe.autorizarCPEAutomotor(autorizarAutomotor()).catch((err: any) => err);
    expect(e).toBeInstanceOf(ArcaSoapError);
    expect(e.uncertain).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('autorizarCPEAutomotor y autorizarCPEFerroviaria: 503 → 1 fetch, uncertain', async () => {
    for (const run of [
      (a: ArcaAgro) => a.cpe.autorizarCPEAutomotor(autorizarAutomotor()),
      (a: ArcaAgro) => a.cpe.autorizarCPEFerroviaria(autorizarFerroviaria()),
    ]) {
      const { agro, fetchMock } = setup(http503);
      const e: any = await run(agro).catch((err: any) => err);
      expect(e.uncertain).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it('las consultas sí se reintentan', async () => {
    const { agro, fetchMock } = setup(http503);
    await expect(agro.cpe.consultarProvincias()).rejects.toBeInstanceOf(ArcaSoapError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('autorizar sin cabecera.nroCTG → ArcaAgroResponseError uncertain', async () => {
    const { agro } = setup(() => cpeResp('AutorizarCPEAutomotorResp', METADATA));
    const e = await agro.cpe.autorizarCPEAutomotor(autorizarAutomotor()).catch((err: any) => err);
    expect(e).toBeInstanceOf(ArcaAgroResponseError);
    expect(e.uncertain).toBe(true);
  });

  it('autorizar con errores y cabecera → ArcaAgroServiceError uncertain, conserva la respuesta', async () => {
    const { agro } = setup(() => cpeResp('AutorizarCPEAutomotorResp', CABECERA() + ERROR_1));
    const e = await agro.cpe.autorizarCPEAutomotor(autorizarAutomotor()).catch((err: any) => err);
    expect(e).toBeInstanceOf(ArcaAgroServiceError);
    expect(e.uncertain).toBe(true);
    expect(e.response.cabecera.nroCTG).toBe('010100012345');
  });

  it('autorizar con errores sin cabecera → rechazo cierto (uncertain false)', async () => {
    const { agro } = setup(() => cpeResp('AutorizarCPEAutomotorResp', ERROR_1 + METADATA));
    const e = await agro.cpe.autorizarCPEAutomotor(autorizarAutomotor()).catch((err: any) => err);
    expect(e).toBeInstanceOf(ArcaAgroServiceError);
    expect(e.uncertain).toBe(false);
  });

  it('un error de consulta con cabecera no es uncertain', async () => {
    const { agro } = setup(() => cpeResp('ConsultarCPEAutomotorResp', CABECERA() + ERROR_1));
    const e = await agro.cpe.consultarCPEAutomotor({ nroCTG: '010100012345' }).catch((err: any) => err);
    expect(e).toBeInstanceOf(ArcaAgroServiceError);
    expect(e.uncertain).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

describe('WSCPE: consultas', () => {
  it('consultarCPEAutomotor por cartaPorte', async () => {
    const { agro, calls } = setup(() => cpeResp('ConsultarCPEAutomotorResp', DETALLE_AUTOMOTOR));
    const r = await agro.cpe.consultarCPEAutomotor({ cartaPorte, cuitSolicitante: CUIT });
    expect(calls[0].element).toBe('ser:ConsultarCPEAutomotorReq');
    expect(keys(calls[0].req.solicitud)).toEqual(['cuitSolicitante', 'cartaPorte']);
    expect(keys(calls[0].req.solicitud.cartaPorte)).toEqual(['tipoCPE', 'sucursal', 'nroOrden']);
    expect(r.cabecera.nroCTG).toBe('010100012345');
  });

  it('consultarCPEFerroviaria por nroCTG (enviado como string)', async () => {
    const { agro, calls } = setup(() => cpeResp('ConsultarCPEFerroviariaResp', CABECERA('020200012345')));
    const r = await agro.cpe.consultarCPEFerroviaria({ nroCTG: '020200012345' });
    expect(calls[0].element).toBe('ser:ConsultarCPEFerroviariaReq');
    expect(calls[0].body).toContain('<nroCTG>020200012345</nroCTG>');
    expect(r.cabecera.nroCTG).toBe('020200012345');
    expect(r.transporte).toBeUndefined();
  });

  it('consultar sin cartaPorte ni nroCTG → ArcaValidationError sin llamar', async () => {
    const { agro, fetchMock } = setup(() => '');
    await expect(agro.cpe.consultarCPEAutomotor({})).rejects.toBeInstanceOf(ArcaValidationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('consultarCPEPorDestino: fechas xsd:date y listas vacía / 1 / N', async () => {
    const item = (ctg: string) =>
      `<cartaPorte><tipoCartaPorte>74</tipoCartaPorte><nroCTG>${ctg}</nroCTG><fechaPartida>2026-11-01T08:30:00-03:00</fechaPartida><estado>CN</estado></cartaPorte>`;
    const params = { planta: 1938, fechaPartidaDesde: '20261101', fechaPartidaHasta: new Date('2026-11-05T12:00:00Z') };

    const vacia = setup(() => cpeResp('ConsultarCPEPorDestinoResp', METADATA));
    expect(await vacia.agro.cpe.consultarCPEPorDestino(params)).toEqual([]);
    expect(vacia.calls[0].element).toBe('ser:ConsultarCPEPorDestinoReq');
    expect(keys(vacia.calls[0].req.solicitud)).toEqual(['planta', 'fechaPartidaDesde', 'fechaPartidaHasta']);
    expect(vacia.calls[0].req.solicitud.fechaPartidaDesde).toBe('2026-11-01');
    expect(vacia.calls[0].req.solicitud.fechaPartidaHasta).toBe('2026-11-05');

    const una = setup(() => cpeResp('ConsultarCPEPorDestinoResp', item('010100000001')));
    expect(await una.agro.cpe.consultarCPEPorDestino(params)).toEqual([
      { tipoCartaPorte: 74, nroCTG: '010100000001', fechaPartida: '2026-11-01T08:30:00-03:00', estado: 'CN' },
    ]);

    const varias = setup(() => cpeResp('ConsultarCPEPorDestinoResp', item('010100000001') + item('010200000002')));
    const r = await varias.agro.cpe.consultarCPEPorDestino(params);
    expect(r.map((x) => x.nroCTG)).toEqual(['010100000001', '010200000002']);
  });

  it('consultarCPEPorDestino con errores → lanza (no devuelve [])', async () => {
    const { agro } = setup(() => cpeResp('ConsultarCPEPorDestinoResp', ERROR_1));
    await expect(
      agro.cpe.consultarCPEPorDestino({ planta: 1, fechaPartidaDesde: '2026-11-01', fechaPartidaHasta: '2026-11-02' }),
    ).rejects.toBeInstanceOf(ArcaAgroServiceError);
  });

  it('consultarCPEPPendientesDeResolucion', async () => {
    const { agro, calls } = setup(() =>
      cpeResp(
        'ConsultarCPEPPendientesDeResolucionResp',
        '<cartaPorte><nroCTG>010100000009</nroCTG><estado>PA</estado></cartaPorte>',
      ),
    );
    const r = await agro.cpe.consultarCPEPPendientesDeResolucion({ perfil: 'D', planta: 1938 });
    expect(calls[0].element).toBe('ser:ConsultarCPEPPendientesDeResolucionReq');
    expect(keys(calls[0].req.solicitud)).toEqual(['perfil', 'planta']);
    expect(r).toEqual([{ nroCTG: '010100000009', estado: 'PA' }]);
  });

  it('consultaCPEFerroviariaPorNroOperativo', async () => {
    const { agro, calls } = setup(() =>
      cpeResp(
        'ConsultaCPEFerroviariaPorNroOperativoResp',
        `<nroOperativo>9876543210</nroOperativo><cartaPorte><nroCTG>020200000001</nroCTG><nroVagon>00012345</nroVagon><grano>23</grano><nroPrecinto>1</nroPrecinto></cartaPorte>`,
      ),
    );
    const r = await agro.cpe.consultaCPEFerroviariaPorNroOperativo(9876543210);
    expect(calls[0].element).toBe('ser:ConsultaCPEFerroviariaPorNroOperativoReq');
    expect(r.nroOperativo).toBe(9876543210);
    expect(r.cartaPorte).toEqual([{ nroCTG: '020200000001', nroVagon: '00012345', grano: 23, nroPrecinto: ['1'] }]);
  });

  it('consultarUltNroOrden / siguienteNroOrden', async () => {
    const { agro, calls } = setup(() => cpeResp('ConsultarUltNroOrdenResp', `<nroOrden>41</nroOrden>${METADATA}`));
    expect(await agro.cpe.consultarUltNroOrden(1, TIPO_CPE.AUTOMOTOR)).toBe(41);
    expect(await agro.cpe.siguienteNroOrden(1, TIPO_CPE.AUTOMOTOR)).toBe(42);
    expect(calls[0].element).toBe('ser:ConsultarUltNroOrdenReq');
    expect(calls[0].req.solicitud).toEqual({ sucursal: 1, tipoCPE: 74 });
    expect(keys(calls[0].req.solicitud)).toEqual(['sucursal', 'tipoCPE']);
  });

  it('consultarUltNroOrden sin nroOrden → error (no 0)', async () => {
    const { agro } = setup(() => cpeResp('ConsultarUltNroOrdenResp', METADATA));
    await expect(agro.cpe.consultarUltNroOrden(1, 74)).rejects.toBeInstanceOf(ArcaAgroResponseError);
    await expect(agro.cpe.siguienteNroOrden(1, 74)).rejects.toBeInstanceOf(ArcaAgroResponseError);
  });

  it('respuesta sin <respuesta> → ArcaAgroResponseError', async () => {
    const { agro } = setup(
      () =>
        `<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Body><ns2:ConsultarUltNroOrdenResp xmlns:ns2="${CPE_NS}"/></S:Body></S:Envelope>`,
    );
    await expect(agro.cpe.consultarUltNroOrden(1, 74)).rejects.toBeInstanceOf(ArcaAgroResponseError);
  });
});

// ---------------------------------------------------------------------------
// Paramétricas
// ---------------------------------------------------------------------------

describe('WSCPE: paramétricas', () => {
  it('consultarProvincias: solo auth; codigo como string; 1 y N', async () => {
    const una = setup(() =>
      cpeResp(
        'ConsultarProvinciasResp',
        '<provincia><codigo>1</codigo><descripcion>BUENOS AIRES</descripcion></provincia>',
      ),
    );
    expect(await una.agro.cpe.consultarProvincias()).toEqual([{ codigo: '1', descripcion: 'BUENOS AIRES' }]);
    expect(una.calls[0].element).toBe('ser:ConsultarProvinciasReq');
    expect(keys(una.calls[0].req)).toEqual(['auth']);

    const varias = setup(() =>
      cpeResp(
        'ConsultarProvinciasResp',
        '<provincia><codigo>0</codigo><descripcion>CABA</descripcion></provincia><provincia><codigo>12</codigo><descripcion>SANTA FE</descripcion></provincia>',
      ),
    );
    expect(await varias.agro.cpe.consultarProvincias()).toEqual([
      { codigo: '0', descripcion: 'CABA' },
      { codigo: '12', descripcion: 'SANTA FE' },
    ]);
  });

  it('consultarProvincias vacía → []', async () => {
    const { agro } = setup(() => cpeResp('ConsultarProvinciasResp', ''));
    expect(await agro.cpe.consultarProvincias()).toEqual([]);
  });

  it('consultarLocalidadesPorProvincia', async () => {
    const { agro, calls } = setup(() =>
      cpeResp(
        'ConsultarLocalidadesPorProvinciaResp',
        '<localidad><codigo>5244</codigo><descripcion>ROSARIO</descripcion></localidad>',
      ),
    );
    expect(await agro.cpe.consultarLocalidadesPorProvincia(12)).toEqual([{ codigo: '5244', descripcion: 'ROSARIO' }]);
    expect(calls[0].req.solicitud).toEqual({ codProvincia: 12 });
  });

  it('consultarTiposGrano', async () => {
    const { agro, calls } = setup(() =>
      cpeResp('ConsultarTiposGranoResp', '<grano><codigo>23</codigo><descripcion>SOJA</descripcion></grano>'),
    );
    expect(await agro.cpe.consultarTiposGrano()).toEqual([{ codigo: '23', descripcion: 'SOJA' }]);
    expect(calls[0].soapAction).toBe(`"${CPE_NS}consultarTiposGrano"`);
  });

  it('consultarPlantas: CUIT validado y normalizado', async () => {
    const { agro, calls } = setup(() =>
      cpeResp(
        'ConsultarPlantasResp',
        '<planta><nroPlanta>1938</nroPlanta><codProvincia>12</codProvincia><codLocalidad>5244</codLocalidad></planta>',
      ),
    );
    expect(await agro.cpe.consultarPlantas('30-71234567-1')).toEqual([
      { nroPlanta: 1938, codProvincia: 12, codLocalidad: 5244 },
    ]);
    expect(calls[0].req.solicitud).toEqual({ cuit: CUIT2 });
    await expect(agro.cpe.consultarPlantas('30712345670')).rejects.toBeInstanceOf(ArcaValidationError);
  });

  it('consultarLocalidadesProductor, categorías y variedades de semillas', async () => {
    const loc = setup(() =>
      cpeResp(
        'ConsultarLocalidadesProductorResp',
        '<localidad><codigo>10270</codigo><descripcion>PERGAMINO</descripcion><coordenadas><latitud><grados>33</grados><minutos>53</minutos><segundos>20</segundos></latitud><ubicacionGeoreferencial>Lote 4</ubicacionGeoreferencial></coordenadas></localidad>',
      ),
    );
    expect(await loc.agro.cpe.consultarLocalidadesProductor(CUIT)).toEqual([
      {
        codigo: '10270',
        descripcion: 'PERGAMINO',
        coordenadas: [{ latitud: { grados: '33', minutos: '53', segundos: '20' }, ubicacionGeoreferencial: 'Lote 4' }],
      },
    ]);

    const cat = setup(() =>
      cpeResp(
        'ConsultarCategoriasSemillasResp',
        '<categoria><codigo>1</codigo><descripcion>ORIGINAL</descripcion></categoria>',
      ),
    );
    expect(await cat.agro.cpe.consultarCategoriasSemillas()).toEqual([{ codigo: '1', descripcion: 'ORIGINAL' }]);

    const varie = setup(() =>
      cpeResp(
        'ConsultarVariedadesSemillasResp',
        '<variedad><codigo>7</codigo><descripcion>DM 46i20</descripcion><grano>23</grano></variedad>',
      ),
    );
    expect(await varie.agro.cpe.consultarVariedadesSemillas(23)).toEqual([
      { codigo: '7', descripcion: 'DM 46i20', grano: 23 },
    ]);
    expect(keys(varie.calls[0].req)).toEqual(['auth', 'codGrano']);
  });
});

// ---------------------------------------------------------------------------
// Validación local
// ---------------------------------------------------------------------------

describe('WSCPE: validación local (no llama a ARCA)', () => {
  async function invalid(mutate: (p: AutorizarCPEAutomotorParams) => void): Promise<ArcaValidationError> {
    const { agro, fetchMock } = setup(() => '');
    const p = autorizarAutomotor();
    mutate(p);
    const e = await agro.cpe.autorizarCPEAutomotor(p).catch((err: any) => err);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(e).toBeInstanceOf(ArcaValidationError);
    return e;
  }

  it('CUIT con dígito verificador inválido', async () => {
    const e = await invalid((p) => (p.destino.cuit = '30500011120'));
    expect(e.details[0].field).toBe('destino.cuit');
  });

  it('NaN, Infinity y fuera de rango', async () => {
    expect((await invalid((p) => (p.datosCarga.pesoBruto = NaN))).details[0].field).toBe('datosCarga.pesoBruto');
    expect((await invalid((p) => (p.transporte.tarifa = Infinity))).details[0].field).toBe('transporte.tarifa');
    expect((await invalid((p) => (p.datosCarga.pesoBruto = 90000))).details[0].field).toBe('datosCarga.pesoBruto');
    expect((await invalid((p) => (p.cabecera.nroOrden = 0))).details[0].field).toBe('cabecera.nroOrden');
  });

  it('campo requerido faltante y campo desconocido (API vieja)', async () => {
    const e = await invalid((p) => {
      delete (p as Partial<AutorizarCPEAutomotorParams>).destinatario;
      (p as unknown as Record<string, unknown>).codTipoCartaPorte = 1;
    });
    const fields = e.details.map((d) => d.field);
    expect(fields).toContain('destinatario');
    expect(fields).toContain('codTipoCartaPorte');
  });

  it('dominio vacío, patente de largo inválido y fecha inválida', async () => {
    expect((await invalid((p) => (p.transporte.dominio = []))).details[0].field).toBe('transporte.dominio');
    expect((await invalid((p) => (p.transporte.dominio = ['AB1']))).details[0].field).toBe('transporte.dominio[0]');
    expect((await invalid((p) => (p.transporte.fechaHoraPartida = '01/11/2026'))).details[0].field).toBe(
      'transporte.fechaHoraPartida',
    );
  });

  it('origen sin operador ni productor', async () => {
    const e = await invalid((p) => (p.origen = {}));
    expect(e.details.map((d) => d.field)).toContain('origen');
  });
});

// ---------------------------------------------------------------------------
// Errores admitidos (550), errores sin código y decodificación tolerante
// ---------------------------------------------------------------------------

const ERROR_550 =
  '<errores><error><codigo>550</codigo><descripcion>Error al generar el archivo pdf.</descripcion></error></errores>';
const ADVERTENCIA_550 = [{ code: 550, msg: 'Error al generar el archivo pdf.' }];

describe('WSCPE: error 550 (operación aceptada sin PDF)', () => {
  it('autorizarCPEAutomotor: cabecera + 550 sin pdf → devuelve la CPE con advertencias', async () => {
    const sinPdf = DETALLE_AUTOMOTOR.replace('<pdf>JVBERi0xLjQ=</pdf>', '');
    const { agro } = setup(() => cpeResp('AutorizarCPEAutomotorResp', sinPdf + ERROR_550));
    const r = await agro.cpe.autorizarCPEAutomotor(autorizarAutomotor());
    expect(r.cabecera.nroCTG).toBe('010100012345');
    expect(r.pdf).toBeUndefined();
    expect(r.advertencias).toEqual(ADVERTENCIA_550);
  });

  it('autorizarCPEFerroviaria y consultarCPEFerroviaria con 550 → advertencias', async () => {
    const aut = setup(() => cpeResp('AutorizarCPEFerroviariaResp', CABECERA('020200012345') + ERROR_550));
    expect((await aut.agro.cpe.autorizarCPEFerroviaria(autorizarFerroviaria())).advertencias).toEqual(ADVERTENCIA_550);
    const cons = setup(() => cpeResp('ConsultarCPEFerroviariaResp', CABECERA('020200012345') + ERROR_550));
    expect((await cons.agro.cpe.consultarCPEFerroviaria({ nroCTG: '020200012345' })).advertencias).toEqual(
      ADVERTENCIA_550,
    );
  });

  it('consultarCPEAutomotor con 550 → devuelve la CPE con advertencias', async () => {
    const { agro } = setup(() => cpeResp('ConsultarCPEAutomotorResp', CABECERA() + ERROR_550 + METADATA));
    const r = await agro.cpe.consultarCPEAutomotor({ nroCTG: '010100012345' });
    expect(r.cabecera.nroCTG).toBe('010100012345');
    expect(r.advertencias).toEqual(ADVERTENCIA_550);
  });

  it.each(OPERACIONES)('$method con 550 → resultado con advertencias', async ({ method, run }) => {
    const { agro } = setup(() => cpeResp(`${capital(method)}Resp`, CABECERA() + ERROR_550));
    const r = (await run(agro)) as { cabecera?: { nroCTG?: string }; advertencias?: unknown };
    expect(r.cabecera?.nroCTG).toBe('010100012345');
    expect(r.advertencias).toEqual(ADVERTENCIA_550);
  });

  it('sin errores no agrega advertencias', async () => {
    const { agro } = setup(() => cpeResp('AutorizarCPEAutomotorResp', DETALLE_AUTOMOTOR));
    const r = await agro.cpe.autorizarCPEAutomotor(autorizarAutomotor());
    expect(r).not.toHaveProperty('advertencias');
  });

  it('550 junto con otro error → lanza con los dos (uncertain si vino la cabecera)', async () => {
    const both =
      '<errores><error><codigo>550</codigo><descripcion>pdf</descripcion></error>' +
      '<error><codigo>1501</codigo><descripcion>orden</descripcion></error></errores>';
    const { agro } = setup(() => cpeResp('AutorizarCPEAutomotorResp', CABECERA() + both));
    const e: any = await agro.cpe.autorizarCPEAutomotor(autorizarAutomotor()).catch((err: any) => err);
    expect(e).toBeInstanceOf(ArcaAgroServiceError);
    expect(e.errors.map((x: { code: number }) => x.code)).toEqual([550, 1501]);
    expect(e.uncertain).toBe(true);
  });
});

describe('WSCPE: errores sin código', () => {
  it('<error> sin codigo (o vacío) cuenta como error', async () => {
    for (const err of [
      '<errores><error><descripcion>Falla sin código</descripcion></error></errores>',
      '<errores><error><codigo/><descripcion>Falla sin código</descripcion></error></errores>',
    ]) {
      const { agro } = setup(() => cpeResp('ConsultarProvinciasResp', err));
      const e: any = await agro.cpe.consultarProvincias().catch((x: any) => x);
      expect(e).toBeInstanceOf(ArcaAgroServiceError);
      expect(e.errors).toEqual([{ code: 0, msg: 'Falla sin código' }]);
    }
  });

  it('<error> con código explícito 0 se ignora', async () => {
    const { agro } = setup(() =>
      cpeResp(
        'ConsultarProvinciasResp',
        '<errores><error><codigo>0</codigo><descripcion>OK</descripcion></error></errores>',
      ),
    );
    expect(await agro.cpe.consultarProvincias()).toEqual([]);
  });
});

describe('WSCPE: decodificación de emisiones', () => {
  it('un campo secundario inválido se omite y no vuelve incierta la emisión', async () => {
    const malo = DETALLE_AUTOMOTOR.replace('<kmRecorrer>250</kmRecorrer>', '<kmRecorrer>abc</kmRecorrer>').replace(
      '<sucursal>1</sucursal>',
      '<sucursal>x</sucursal>',
    );
    const { agro } = setup(() => cpeResp('AutorizarCPEAutomotorResp', malo));
    const r = await agro.cpe.autorizarCPEAutomotor(autorizarAutomotor());
    expect(r.cabecera.nroCTG).toBe('010100012345');
    expect(r.cabecera.sucursal).toBeUndefined();
    expect(r.cabecera.estado).toBe('AC');
    expect(r.transporte?.kmRecorrer).toBeUndefined();
    expect(r.transporte?.dominio).toEqual(['AB123CD']);
    expect(r.transporte?.cuitChofer).toBe(Number(CUIT5));
  });

  it('en #operar también (cabecera con fecha inválida)', async () => {
    const { agro } = setup(() =>
      cpeResp('AnularCPEResp', CABECERA().replace('<nroOrden>15</nroOrden>', '<nroOrden>1.5</nroOrden>')),
    );
    const r = await agro.cpe.anularCPE({ cartaPorte });
    expect(r.cabecera?.nroCTG).toBe('010100012345');
    expect(r.cabecera?.nroOrden).toBeUndefined();
  });

  it('en una consulta el mismo campo inválido lanza (no uncertain)', async () => {
    const malo = DETALLE_AUTOMOTOR.replace('<kmRecorrer>250</kmRecorrer>', '<kmRecorrer>abc</kmRecorrer>');
    const { agro } = setup(() => cpeResp('ConsultarCPEAutomotorResp', malo));
    const e: any = await agro.cpe.consultarCPEAutomotor({ nroCTG: '010100012345' }).catch((x: any) => x);
    expect(e).toBeInstanceOf(ArcaAgroResponseError);
    expect(e.uncertain).toBe(false);
  });
});

describe('WSCPE: consultas fuera de DG', () => {
  it('consultarRenspa: cuit y codProvincia bajo el Req; respuesta ConsultarRenspaRes', async () => {
    const { agro, calls } = setup(() =>
      envelope(
        'ConsultarRenspaRes',
        CPE_NS,
        '<respuesta><renspa><nroRenspa>01.001.0.00001/00</nroRenspa><descripcion>Campo</descripcion></renspa></respuesta>',
      ),
    );
    const r = await agro.cpe.consultarRenspa('20-12345678-6', 1);
    expect(calls[0].element).toBe('ser:ConsultarRenspaReq');
    expect(calls[0].soapAction).toBe(`"${CPE_NS}consultarRenspa"`);
    expect(keys(calls[0].req)).toEqual(['auth', 'cuit', 'codProvincia']);
    expect(String(calls[0].req.cuit)).toBe(CUIT);
    expect(r).toEqual([{ nroRenspa: '01.001.0.00001/00', descripcion: 'Campo' }]);
  });

  it('consultarDomiciliosPorCUIT', async () => {
    const { agro, calls } = setup(() =>
      cpeResp(
        'ConsultarDomiciliosPorCUITResp',
        '<domicilio><tipo>1</tipo><orden>2</orden><descripcion>Ruta 9 km 300</descripcion></domicilio>',
      ),
    );
    const r = await agro.cpe.consultarDomiciliosPorCUIT(CUIT2);
    expect(calls[0].element).toBe('ser:ConsultarDomiciliosPorCUITReq');
    expect(keys(calls[0].req)).toEqual(['auth', 'cuit']);
    expect(r).toEqual([{ tipo: 1, orden: 2, descripcion: 'Ruta 9 km 300' }]);
  });

  it('consultarTiposEmbalaje (con unidades de medida) y consultarUnidadesMedida', async () => {
    const emb = setup(() =>
      cpeResp(
        'ConsultarTiposEmbalajeResp',
        '<tipoEmbalaje><codigo>1</codigo><descripcion>Granel</descripcion>' +
          '<unidadMedida><codigo>1</codigo><descripcion>Kg</descripcion></unidadMedida></tipoEmbalaje>' +
          '<tipoEmbalaje><codigo>2</codigo><descripcion>Bolsa</descripcion></tipoEmbalaje>',
      ),
    );
    expect(await emb.agro.cpe.consultarTiposEmbalaje()).toEqual([
      { codigo: '1', descripcion: 'Granel', unidadMedida: [{ codigo: '1', descripcion: 'Kg' }] },
      { codigo: '2', descripcion: 'Bolsa', unidadMedida: [] },
    ]);
    expect(emb.calls[0].element).toBe('ser:ConsultarTiposEmbalajeReq');
    expect(keys(emb.calls[0].req)).toEqual(['auth']);

    const um = setup(() =>
      cpeResp(
        'ConsultarUnidadesMedidaResp',
        '<unidadMedida><codigo>2</codigo><descripcion>Litros</descripcion></unidadMedida>',
      ),
    );
    expect(await um.agro.cpe.consultarUnidadesMedida()).toEqual([{ codigo: '2', descripcion: 'Litros' }]);
    expect(um.calls[0].element).toBe('ser:ConsultarUnidadesMedidaReq');
  });
});

describe('WSCPE: SOAP Fault Exception', () => {
  it('cpeFaultException lee businessErrorId de ArcaSoapError.faultDetail', async () => {
    const fault =
      `<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Body><S:Fault>` +
      `<faultcode>S:Server</faultcode><faultstring>Error de negocio</faultstring><detail>` +
      `<ns2:Exception xmlns:ns2="${CPE_NS}"><uuid>abc-123</uuid><timestamp>2026-11-01T08:00:00-03:00</timestamp>` +
      `<businessErrorId>CPE-0042</businessErrorId><exceptionDetails>detalle</exceptionDetails><serverName>cpea-1</serverName>` +
      `</ns2:Exception></detail></S:Fault></S:Body></S:Envelope>`;
    const { agro } = setup(() => new Response(fault, { status: 500, headers: { 'content-type': 'text/xml' } }));
    const e = await agro.cpe.consultarProvincias().catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ArcaSoapError);
    expect(cpeFaultException(e)).toEqual({
      uuid: 'abc-123',
      timestamp: '2026-11-01T08:00:00-03:00',
      businessErrorId: 'CPE-0042',
      exceptionDetails: 'detalle',
      serverName: 'cpea-1',
    });
    expect(cpeFaultException(new Error('x'))).toBeUndefined();
  });
});
