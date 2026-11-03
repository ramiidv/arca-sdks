import { describe, expect, it } from 'vitest';
import {
  ArcaAgroServiceError,
  ArcaSoapError,
  ArcaValidationError,
  TIPO_CPE,
  validateAutorizarCPEAutomotorDG,
  validateAutorizarCPEEmisionDestinoDG,
  validateAutorizarCPEFerroviariaDG,
} from '../src/index.js';
import type {
  ArcaAgro,
  AutorizarCPEAutomotorDGParams,
  AutorizarCPEEmisionDestinoDGParams,
  AutorizarCPEFerroviariaDGParams,
} from '../src/index.js';
import { CPE_NS, CUIT, CUIT2, CUIT3, CUIT4, CUIT5, cpeResp, hang, http503, keys, setup } from './helpers.js';

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------

const capital = (m: string) => m.charAt(0).toUpperCase() + m.slice(1);

const cpAutomotor = { tipoCPE: TIPO_CPE.AUTOMOTOR_DG, sucursal: 1, nroOrden: 20 };
const cpFerroviaria = { tipoCPE: TIPO_CPE.FERROVIARIA_DG, sucursal: 1, nroOrden: 21 };
const cpEmisionDestino = { tipoCPE: TIPO_CPE.EMISION_DESTINO_DG, sucursal: 1, nroOrden: 22 };
const cpDuctos = { tipoCPE: TIPO_CPE.DUCTOS_DG, sucursal: 1, nroOrden: 23 };

const domicilio = { orden: 1, tipo: 3 };
const destinoDG = { domicilioDestino: domicilio, planta: 1938, cuit: CUIT4 };
const modificaDG = { kmRecorrer: 120, fechaHoraPartida: '2026-11-02T09:00:00-03:00' };
const modificaTren = { kmRecorrer: 300, fechaHoraPartidaTren: '2026-11-02T09:00:00-03:00', ramal: { codigo: 3 } };

const datosCarga = {
  // Claves en otro orden que el XSD: el SDK las reordena.
  unidadMedida: 1,
  tipoEmbalaje: 1,
  pesoTara: 12000,
  pesoBruto: 40000,
  codDerivadoGranario: 101,
  codGrano: 23,
  lote: 'L-15',
  fechaLote: '2026-10-30T00:00:00-03:00',
};

function autorizarAutomotorDG(): AutorizarCPEAutomotorDGParams {
  return {
    observaciones: 'Harina de soja',
    transporte: {
      cuitPagadorFlete: CUIT2,
      cuitChofer: CUIT5,
      kmRecorrer: 250,
      fechaHoraPartida: '2026-11-01T08:30:00-03:00',
      dominio: ['AB123CD'],
      cuitTransportista: CUIT3,
    },
    destinatario: { cuit: CUIT4 },
    destino: destinoDG,
    datosCarga,
    intervinientes: { cuitCorredor: CUIT2 },
    origen: { domicilioOrigen: { tipo: 1, orden: 1 }, planta: 500, esUsuarioIndustria: false },
    cabecera: { nroOrden: 20, sucursal: 1, tipoCP: TIPO_CPE.AUTOMOTOR_DG },
  };
}

function autorizarFerroviariaDG(): AutorizarCPEFerroviariaDGParams {
  return {
    cabecera: { sucursal: 1, nroOrden: 21 },
    origen: { esUsuarioIndustria: true, planta: 500, cuitTitularPlanta: CUIT, domicilioOrigen: domicilio },
    intervinientes: { cuitMercadoATermino: CUIT2, cuitRemitenteComercial: CUIT3 },
    datosCarga: { ...datosCarga, tipoEmbalaje: 2, cantidadUnidades: 800, kgLitroM3: 50 },
    destino: destinoDG,
    destinatario: { cuit: CUIT4 },
    transporte: {
      cuitPagadorFlete: CUIT2,
      cuitConductor: CUIT5,
      kmRecorrer: 400,
      fechaHoraPartidaTren: '2026-11-01T08:00:00-03:00',
      ramal: { codigo: 3 },
      nroOperativo: 9876543210,
      nroPrecinto: ['P-1', 'P-2'],
      nroVagon: 123456,
      cuitTransportista: CUIT3,
    },
  };
}

function autorizarEmisionDestinoDG(): AutorizarCPEEmisionDestinoDGParams {
  return {
    ...autorizarAutomotorDG(),
    cabecera: { tipoCP: TIPO_CPE.EMISION_DESTINO_DG, sucursal: 1, nroOrden: 22 },
    origen: { domicilioOrigen: domicilio, planta: 500, cuitOrigen: CUIT2 },
    destino: destinoDG,
  };
}

const CABECERA_DG = (ctg: string, tipo: number) =>
  `<cabecera><tipoCartaPorte>${tipo}</tipoCartaPorte><sucursal>1</sucursal><nroOrden>20</nroOrden><nroCTG>${ctg}</nroCTG>` +
  `<fechaEmision>2026-11-01T08:31:12-03:00</fechaEmision><estado>AC</estado></cabecera>`;

const METADATA = '<metadata><servidor>cpea-ws-1</servidor><fechaHora>2026-11-01T08:31:12-03:00</fechaHora></metadata>';
const CARTA_PORTE_RESP = CABECERA_DG('030000012345', TIPO_CPE.AUTOMOTOR_DG) + METADATA;

const DETALLE_AUTOMOTOR_DG =
  CABECERA_DG('030000012345', TIPO_CPE.AUTOMOTOR_DG) +
  `<origen><esUsuarioIndustria>false</esUsuarioIndustria><planta>500</planta>` +
  `<domicilioOrigen>Ruta 9 km 300</domicilioOrigen><cuitOrigen>${CUIT}</cuitOrigen></origen>` +
  `<intervinientes><cuitCorredor>${CUIT2}</cuitCorredor></intervinientes>` +
  `<datosCarga><codGrano>23</codGrano><codDerivadoGranario>101</codDerivadoGranario><pesoBruto>40000</pesoBruto>` +
  `<pesoTara>12000</pesoTara><tipoEmbalaje>1</tipoEmbalaje><unidadMedida>1</unidadMedida><lote>L-15</lote>` +
  `<fechaLote>2026-10-30T00:00:00-03:00</fechaLote></datosCarga>` +
  `<destino><cuit>${CUIT4}</cuit><planta>1938</planta><domicilioDestino>Puerto</domicilioDestino></destino>` +
  `<destinatario><cuit>${CUIT4}</cuit></destinatario>` +
  `<transporte><cuitTransportista>${CUIT3}</cuitTransportista><dominio>AB123CD</dominio><dominio>AC456EF</dominio>` +
  `<fechaHoraPartida>2026-11-01T08:30:00-03:00</fechaHoraPartida><kmRecorrer>250</kmRecorrer>` +
  `<cuitChofer>${CUIT5}</cuitChofer><tarifa>1500.50</tarifa><tarifaReferencia>1400.00</tarifaReferencia>` +
  `<cuitPagadorFlete>${CUIT2}</cuitPagadorFlete></transporte>` +
  `<pdf>JVBERi0xLjQ=</pdf>` +
  METADATA;

const ERROR_1 =
  '<errores><error><codigo>2210</codigo><descripcion>El Tipo de Embalaje indicado no existe.</descripcion></error></errores>';

// ---------------------------------------------------------------------------
// Operaciones que responden CartaPorteRespuesta
// ---------------------------------------------------------------------------

interface OpCase {
  method: string;
  /** Elemento del Req/Resp si no es `<Operacion>` (WSDL). */
  element?: string;
  run: (agro: ArcaAgro) => Promise<unknown>;
  order: string[];
}

const OPERACIONES_DG: OpCase[] = [
  // Automotor DG
  {
    method: 'editarCPEDGAutomotor',
    run: (a) =>
      a.cpe.editarCPEDGAutomotor({
        observaciones: 'Cambio de chofer',
        dominio: ['AB123CD'],
        kmRecorrer: 260,
        cuitPagadorFlete: CUIT2,
        destino: destinoDG,
        tipoEmbalaje: 1,
        cuitChofer: CUIT5,
        nroCTG: '030000012345',
      }),
    order: [
      'nroCTG',
      'cuitChofer',
      'tipoEmbalaje',
      'destino',
      'cuitPagadorFlete',
      'kmRecorrer',
      'dominio',
      'observaciones',
    ],
  },
  {
    method: 'editarCPEDGConfirmadaAutomotor',
    element: 'EditarCPEConfirmadaAutomotorDg',
    run: (a) =>
      a.cpe.editarCPEDGConfirmadaAutomotor({
        observaciones: 'x',
        intervinientes: { cuitCorredor: CUIT2 },
        nroCTG: '030000012345',
      }),
    order: ['nroCTG', 'intervinientes', 'observaciones'],
  },
  {
    method: 'confirmacionDefinitivaCPEAutomotorDG',
    run: (a) =>
      a.cpe.confirmacionDefinitivaCPEAutomotorDG({
        pesoTaraDescarga: 12000,
        pesoBrutoDescarga: 39900,
        cartaPorte: cpAutomotor,
        cuitSolicitante: CUIT,
      }),
    order: ['cuitSolicitante', 'cartaPorte', 'pesoBrutoDescarga', 'pesoTaraDescarga'],
  },
  {
    method: 'desvioCPEAutomotorDG',
    run: (a) =>
      a.cpe.desvioCPEAutomotorDG({
        transporte: modificaDG,
        destino: destinoDG,
        cartaPorte: cpAutomotor,
        cuitSolicitante: CUIT,
      }),
    order: ['cuitSolicitante', 'cartaPorte', 'destino', 'transporte'],
  },
  {
    method: 'nuevoDestinoDestinatarioCPEAutomotorDG',
    run: (a) =>
      a.cpe.nuevoDestinoDestinatarioCPEAutomotorDG({
        transporte: modificaDG,
        destinatario: { cuit: CUIT2 },
        destino: destinoDG,
        cartaPorte: cpAutomotor,
      }),
    order: ['cartaPorte', 'destino', 'destinatario', 'transporte'],
  },
  {
    method: 'regresoOrigenCPEAutomotorDG',
    run: (a) =>
      a.cpe.regresoOrigenCPEAutomotorDG({
        cuitDestinatario: CUIT,
        domicilioDestino: domicilio,
        planta: 500,
        transporte: modificaDG,
        cartaPorte: cpAutomotor,
      }),
    order: ['cartaPorte', 'transporte', 'planta', 'domicilioDestino', 'cuitDestinatario'],
  },
  // Ferroviaria DG
  {
    method: 'editarCPEDGFerroviaria',
    run: (a) =>
      a.cpe.editarCPEDGFerroviaria({
        pesoBruto: 70000,
        kmRecorrer: 410,
        cuitPagadorFlete: CUIT2,
        intervinientes: { cuitCorredor: CUIT3 },
        codDerivadoGranario: 101,
        ramal: { codigo: 1 },
        nroOperativo: 1234,
        nroPrecinto: ['P-1'],
        cuitConductor: CUIT5,
        nroCTG: '040000012345',
      }),
    order: [
      'nroCTG',
      'cuitConductor',
      'nroPrecinto',
      'nroOperativo',
      'ramal',
      'codDerivadoGranario',
      'intervinientes',
      'cuitPagadorFlete',
      'kmRecorrer',
      'pesoBruto',
    ],
  },
  {
    method: 'editarCPEDGConfirmadaFerroviaria',
    element: 'EditarCPEConfirmadaFerroviariaDg',
    run: (a) => a.cpe.editarCPEDGConfirmadaFerroviaria({ intervinientes: {}, nroCTG: '040000012345' }),
    order: ['nroCTG', 'intervinientes'],
  },
  {
    method: 'confirmacionDefinitivaCPEFerroviariaDG',
    run: (a) =>
      a.cpe.confirmacionDefinitivaCPEFerroviariaDG({
        ramalDescarga: { codigo: 1 },
        pesoTaraDescarga: 25000,
        pesoBrutoDescarga: 79000,
        cartaPorte: cpFerroviaria,
        cuitSolicitante: CUIT,
      }),
    order: ['cuitSolicitante', 'cartaPorte', 'pesoBrutoDescarga', 'pesoTaraDescarga', 'ramalDescarga'],
  },
  {
    method: 'desvioCPEFerroviariaDG',
    run: (a) =>
      a.cpe.desvioCPEFerroviariaDG({
        transporte: modificaTren,
        destino: destinoDG,
        cartaPorte: cpFerroviaria,
        cuitSolicitante: CUIT,
      }),
    order: ['cuitSolicitante', 'cartaPorte', 'destino', 'transporte'],
  },
  {
    method: 'nuevoDestinoDestinatarioCPEFerroviariaDG',
    run: (a) =>
      a.cpe.nuevoDestinoDestinatarioCPEFerroviariaDG({
        transporte: modificaTren,
        destino: destinoDG,
        cartaPorte: cpFerroviaria,
      }),
    order: ['cartaPorte', 'destino', 'transporte'],
  },
  {
    method: 'regresoOrigenCPEFerroviariaDG',
    run: (a) =>
      a.cpe.regresoOrigenCPEFerroviariaDG({
        cuitDestinatario: CUIT,
        transporte: modificaTren,
        cartaPorte: cpFerroviaria,
      }),
    order: ['cartaPorte', 'transporte', 'cuitDestinatario'],
  },
  // Pendientes de emisión (PE)
  {
    method: 'aceptarEmisionDG',
    run: (a) => a.cpe.aceptarEmisionDG({ cartaPorte: cpAutomotor, cuitSolicitante: CUIT }),
    order: ['cuitSolicitante', 'cartaPorte'],
  },
  {
    method: 'rechazarEmisionDG',
    run: (a) => a.cpe.rechazarEmisionDG({ cartaPorte: cpFerroviaria, cuitSolicitante: CUIT }),
    order: ['cuitSolicitante', 'cartaPorte'],
  },
  // Emitida en destino
  {
    method: 'aceptarEmisionDestinoDG',
    run: (a) =>
      a.cpe.aceptarEmisionDestinoDG({ cartaPorte: cpEmisionDestino, cuitDestino: CUIT4, cuitSolicitante: CUIT }),
    order: ['cuitSolicitante', 'cuitDestino', 'cartaPorte'],
  },
  {
    method: 'rechazarEmisionDestinoDG',
    run: (a) =>
      a.cpe.rechazarEmisionDestinoDG({ cartaPorte: cpEmisionDestino, cuitDestino: CUIT4, cuitSolicitante: CUIT }),
    order: ['cuitSolicitante', 'cuitDestino', 'cartaPorte'],
  },
  {
    method: 'descargadoDestinoCPEEmisionDestinoDG',
    run: (a) =>
      a.cpe.descargadoDestinoCPEEmisionDestinoDG({
        cartaPorte: cpEmisionDestino,
        cuitDestino: CUIT4,
        cuitSolicitante: CUIT4,
      }),
    order: ['cuitSolicitante', 'cuitDestino', 'cartaPorte'],
  },
  {
    method: 'anularCPEEmisionDestinoDG',
    run: (a) =>
      a.cpe.anularCPEEmisionDestinoDG({
        anulacionObservaciones: 'Error',
        anulacionMotivo: 3,
        cuitDestino: CUIT4,
        cartaPorte: cpEmisionDestino,
      }),
    order: ['cartaPorte', 'cuitDestino', 'anulacionMotivo', 'anulacionObservaciones'],
  },
  {
    method: 'informarContingenciaEmisionDestinoDG',
    run: (a) =>
      a.cpe.informarContingenciaEmisionDestinoDG({
        contingencia: { concepto: 'C' },
        cuitDestino: CUIT4,
        cartaPorte: cpEmisionDestino,
      }),
    order: ['cartaPorte', 'cuitDestino', 'contingencia'],
  },
  {
    method: 'cerrarContingenciaCPEEmisionDestinoDG',
    run: (a) =>
      a.cpe.cerrarContingenciaCPEEmisionDestinoDG({
        reactivacionDestino: { cuitTransportista: CUIT3 },
        concepto: 'A',
        cuitDestino: CUIT4,
        cartaPorte: cpEmisionDestino,
      }),
    order: ['cartaPorte', 'cuitDestino', 'concepto', 'reactivacionDestino'],
  },
  {
    method: 'nuevoDestinoDestinatarioCPEEmisionDestinoDG',
    run: (a) =>
      a.cpe.nuevoDestinoDestinatarioCPEEmisionDestinoDG({
        transporte: modificaDG,
        destino: destinoDG,
        cuitDestino: CUIT4,
        cartaPorte: cpEmisionDestino,
      }),
    order: ['cartaPorte', 'cuitDestino', 'destino', 'transporte'],
  },
  {
    method: 'regresoOrigenCPEEmisionDestinoDG',
    run: (a) =>
      a.cpe.regresoOrigenCPEEmisionDestinoDG({
        planta: 500,
        transporte: modificaDG,
        cuitDestino: CUIT4,
        cartaPorte: cpEmisionDestino,
      }),
    order: ['cartaPorte', 'cuitDestino', 'transporte', 'planta'],
  },
  // Ductos
  {
    method: 'editarCPEDGDuctos',
    run: (a) =>
      a.cpe.editarCPEDGDuctos({ observaciones: 'x', cuitDestinatario: CUIT4, codGrano: 23, nroCTG: '060000012345' }),
    order: ['nroCTG', 'codGrano', 'cuitDestinatario', 'observaciones'],
  },
  {
    method: 'editarCPEConfirmadaDuctos',
    run: (a) =>
      a.cpe.editarCPEConfirmadaDuctos({ intervinientes: { cuitComisionista: CUIT2 }, nroCTG: '060000012345' }),
    order: ['nroCTG', 'intervinientes'],
  },
  {
    method: 'confirmacionDefinitivaCPEDuctosDG',
    run: (a) =>
      a.cpe.confirmacionDefinitivaCPEDuctosDG({
        pesoBrutoDescarga: 2500000,
        cartaPorte: cpDuctos,
        cuitSolicitante: CUIT,
      }),
    order: ['cuitSolicitante', 'cartaPorte', 'pesoBrutoDescarga'],
  },
];

describe.each(OPERACIONES_DG)('WSCPE DG $method (emisión)', ({ method, element, run, order }) => {
  const base = element ?? capital(method);

  it('envía el Req del WSDL con auth y la solicitud en orden XSD; parsea el Resp', async () => {
    const { agro, calls } = setup(() => cpeResp(`${base}Resp`, CARTA_PORTE_RESP));
    const r = (await run(agro)) as { cabecera?: { nroCTG?: string } };
    const c = calls[0];
    expect(c.element).toBe(`ser:${base}Req`);
    expect(c.ns).toBe(CPE_NS);
    expect(c.soapAction).toBe(`"${CPE_NS}${method}"`);
    expect(keys(c.req)).toEqual(['auth', 'solicitud']);
    expect(keys(c.req.solicitud)).toEqual(order);
    expect(r.cabecera?.nroCTG).toBe('030000012345');
  });

  it('errores de negocio lanzan ArcaAgroServiceError', async () => {
    const { agro } = setup(() => cpeResp(`${base}Resp`, ERROR_1));
    const e: any = await run(agro).catch((err: any) => err);
    expect(e).toBeInstanceOf(ArcaAgroServiceError);
    expect(e.errors).toEqual([{ code: 2210, msg: 'El Tipo de Embalaje indicado no existe.' }]);
    expect(e.method).toBe(method);
  });

  it('no reintenta ante un 503 y el error es uncertain', async () => {
    const { agro, fetchMock } = setup(http503);
    const e: any = await run(agro).catch((err: any) => err);
    expect(e).toBeInstanceOf(ArcaSoapError);
    expect(e.uncertain).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Autorizaciones y consultas de detalle
// ---------------------------------------------------------------------------

describe('WSCPE DG: autorizaciones', () => {
  it('autorizarCPEAutomotorDG: orden XSD, DomicilioPUC y detalle decodificado', async () => {
    const { agro, calls } = setup(() => cpeResp('AutorizarCPEAutomotorDGResp', DETALLE_AUTOMOTOR_DG));
    const r = await agro.cpe.autorizarCPEAutomotorDG(autorizarAutomotorDG());
    const s = calls[0].req.solicitud;
    expect(calls[0].element).toBe('ser:AutorizarCPEAutomotorDGReq');
    expect(keys(s)).toEqual([
      'cabecera',
      'origen',
      'intervinientes',
      'datosCarga',
      'destino',
      'destinatario',
      'transporte',
      'observaciones',
    ]);
    expect(keys(s.cabecera)).toEqual(['tipoCP', 'sucursal', 'nroOrden']);
    expect(keys(s.origen)).toEqual(['esUsuarioIndustria', 'planta', 'domicilioOrigen']);
    expect(keys(s.datosCarga)).toEqual([
      'codGrano',
      'codDerivadoGranario',
      'pesoBruto',
      'pesoTara',
      'tipoEmbalaje',
      'unidadMedida',
      'lote',
      'fechaLote',
    ]);
    expect(keys(s.destino)).toEqual(['cuit', 'planta', 'domicilioDestino']);
    expect(keys(s.destino.domicilioDestino)).toEqual(['tipo', 'orden']);

    expect(r.cabecera.nroCTG).toBe('030000012345');
    expect(r.cabecera.tipoCartaPorte).toBe(TIPO_CPE.AUTOMOTOR_DG);
    expect(r.origen).toEqual({
      esUsuarioIndustria: false,
      planta: 500,
      domicilioOrigen: 'Ruta 9 km 300',
      cuitOrigen: Number(CUIT),
    });
    expect(r.intervinientes).toEqual({ cuitCorredor: Number(CUIT2) });
    expect(r.datosCarga?.codDerivadoGranario).toBe(101);
    expect(r.datosCarga?.lote).toBe('L-15');
    expect(r.destino).toEqual({ cuit: Number(CUIT4), planta: 1938, domicilioDestino: 'Puerto' });
    expect(r.transporte?.dominio).toEqual(['AB123CD', 'AC456EF']);
    expect(r.transporte?.tarifa).toBe(1500.5);
    expect(r.transporte?.tarifaReferencia).toBe(1400);
    expect(r.pdf).toBe('JVBERi0xLjQ=');
  });

  it('autorizarCPEFerroviariaDG: intervinientes y transporte en el orden ferroviario', async () => {
    const resp =
      CABECERA_DG('040000012345', TIPO_CPE.FERROVIARIA_DG) +
      '<origen><cuit>20123456786</cuit><esUsuarioIndustria>true</esUsuarioIndustria><planta>500</planta></origen>' +
      '<transporte><nroVagon>123456</nroVagon><nroPrecinto>P-1</nroPrecinto><nroPrecinto>P-2</nroPrecinto>' +
      '<nroOperativo>9876543210</nroOperativo></transporte>';
    const { agro, calls } = setup(() => cpeResp('AutorizarCPEFerroviariaDGResp', resp));
    const r = await agro.cpe.autorizarCPEFerroviariaDG(autorizarFerroviariaDG());
    const s = calls[0].req.solicitud;
    expect(keys(s.cabecera)).toEqual(['sucursal', 'nroOrden']);
    expect(keys(s.origen)).toEqual(['esUsuarioIndustria', 'planta', 'cuitTitularPlanta', 'domicilioOrigen']);
    expect(keys(s.intervinientes)).toEqual(['cuitRemitenteComercial', 'cuitMercadoATermino']);
    expect(keys(s.transporte)).toEqual([
      'cuitTransportista',
      'nroVagon',
      'nroPrecinto',
      'nroOperativo',
      'ramal',
      'fechaHoraPartidaTren',
      'kmRecorrer',
      'cuitConductor',
      'cuitPagadorFlete',
    ]);
    expect(r.cabecera.nroCTG).toBe('040000012345');
    expect(r.origen?.esUsuarioIndustria).toBe(true);
    expect(r.transporte?.nroPrecinto).toEqual(['P-1', 'P-2']);
    expect('correspondeRetiroProductor' in r).toBe(false);
  });

  it('autorizarCPEEmisionDestinoDG: origen con cuitOrigen y detalle de emisión en destino', async () => {
    const resp =
      CABECERA_DG('050000012345', TIPO_CPE.EMISION_DESTINO_DG) +
      `<origen><planta>500</planta><domicilioOrigen>Planta origen</domicilioOrigen><cuitOrigen>${CUIT2}</cuitOrigen></origen>` +
      `<destino><cuit>${CUIT4}</cuit><planta>1938</planta><cuitTitularPlanta>${CUIT4}</cuitTitularPlanta></destino>`;
    const { agro, calls } = setup(() => cpeResp('AutorizarCPEEmisionDestinoDGResp', resp));
    const r = await agro.cpe.autorizarCPEEmisionDestinoDG(autorizarEmisionDestinoDG());
    expect(calls[0].element).toBe('ser:AutorizarCPEEmisionDestinoDGReq');
    expect(keys(calls[0].req.solicitud.origen)).toEqual(['cuitOrigen', 'planta', 'domicilioOrigen']);
    expect(r.origen).toEqual({ planta: 500, domicilioOrigen: 'Planta origen', cuitOrigen: Number(CUIT2) });
    expect(r.destino).toEqual({ cuit: Number(CUIT4), planta: 1938, cuitTitularPlanta: Number(CUIT4) });
  });

  it('autorizar DG: timeout → 1 fetch, uncertain', async () => {
    for (const run of [
      (a: ArcaAgro) => a.cpe.autorizarCPEAutomotorDG(autorizarAutomotorDG()),
      (a: ArcaAgro) => a.cpe.autorizarCPEFerroviariaDG(autorizarFerroviariaDG()),
      (a: ArcaAgro) => a.cpe.autorizarCPEEmisionDestinoDG(autorizarEmisionDestinoDG()),
    ]) {
      const { agro, fetchMock } = setup(hang, { timeout: 30 });
      const e: any = await run(agro).catch((err: any) => err);
      expect(e).toBeInstanceOf(ArcaSoapError);
      expect(e.uncertain).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });
});

describe('WSCPE DG: consultas', () => {
  it('consultarCPEAutomotorDG / FerroviariaDG / EmisionDestinoDG: cartaPorte primero y cuitTitularPlanta', async () => {
    for (const [method, run] of [
      [
        'consultarCPEAutomotorDG',
        (a: ArcaAgro) =>
          a.cpe.consultarCPEAutomotorDG({ nroCTG: 30000012345, cuitTitularPlanta: CUIT, cartaPorte: cpAutomotor }),
      ],
      [
        'consultarCPEFerroviariaDG',
        (a: ArcaAgro) =>
          a.cpe.consultarCPEFerroviariaDG({ nroCTG: 30000012345, cuitTitularPlanta: CUIT, cartaPorte: cpAutomotor }),
      ],
      [
        'consultarCPEEmisionDestinoDG',
        (a: ArcaAgro) =>
          a.cpe.consultarCPEEmisionDestinoDG({ nroCTG: 30000012345, cuitTitularPlanta: CUIT, cartaPorte: cpAutomotor }),
      ],
    ] as const) {
      const { agro, calls } = setup(() => cpeResp(`${capital(method)}Resp`, CARTA_PORTE_RESP));
      const r = await run(agro);
      expect(calls[0].element).toBe(`ser:${capital(method)}Req`);
      expect(keys(calls[0].req.solicitud)).toEqual(['cartaPorte', 'cuitTitularPlanta', 'nroCTG']);
      expect(r.cabecera.nroCTG).toBe('030000012345');
    }
  });

  it('consultarCPEDuctos: detalle con fechas de envío', async () => {
    const resp =
      CABECERA_DG('060000012345', TIPO_CPE.DUCTOS_DG) +
      `<datosCarga><codGrano>23</codGrano><pesoBruto>2500000</pesoBruto></datosCarga>` +
      `<destino><cuit>${CUIT4}</cuit><fechaHoraInicioEnvio>2026-11-01T08:00:00-03:00</fechaHoraInicioEnvio>` +
      `<fechaHoraFinEnvio>2026-11-01T20:00:00-03:00</fechaHoraFinEnvio></destino>`;
    const { agro, calls } = setup(() => cpeResp('ConsultarCPEDuctosResp', resp));
    const r = await agro.cpe.consultarCPEDuctos({ nroCTG: '060000012345' });
    expect(keys(calls[0].req.solicitud)).toEqual(['nroCTG']);
    expect(r.cabecera.tipoCartaPorte).toBe(TIPO_CPE.DUCTOS_DG);
    expect(r.datosCarga?.pesoBruto).toBe(2500000);
    expect(r.destino?.fechaHoraFinEnvio).toBe('2026-11-01T20:00:00-03:00');
  });

  it('consultar DG sin cartaPorte ni nroCTG → ArcaValidationError sin llamar', async () => {
    const { agro, fetchMock } = setup(() => '');
    await expect(agro.cpe.consultarCPEAutomotorDG({ cuitTitularPlanta: CUIT })).rejects.toBeInstanceOf(
      ArcaValidationError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('pendientes de activación (PE y PO): planta; listas vacía y N', async () => {
    const item = (n: number) =>
      `<cartaPorte><tipoCartaPorte>284</tipoCartaPorte><sucursal>1</sucursal><nroOrden>${n}</nroOrden>` +
      `<cuitSolicitante>${CUIT}</cuitSolicitante><fechaPartida>2026-11-01T08:00:00-03:00</fechaPartida></cartaPorte>`;
    const pe = setup(() => cpeResp('ConsultarCPEDGPendienteActivacionResp', item(1) + item(2)));
    const r = await pe.agro.cpe.consultarCPEDGPendienteActivacion(500);
    expect(pe.calls[0].req.solicitud).toEqual({ planta: 500 });
    expect(r).toEqual(
      [1, 2].map((n) => ({
        tipoCartaPorte: TIPO_CPE.AUTOMOTOR_DG,
        sucursal: 1,
        nroOrden: n,
        cuitSolicitante: Number(CUIT),
        fechaPartida: '2026-11-01T08:00:00-03:00',
      })),
    );

    const po = setup(() => cpeResp('ConsultarCPEEmitidasDestinoDGPendientesActivacionResp', ''));
    expect(await po.agro.cpe.consultarCPEEmitidasDestinoDGPendientesActivacion(500)).toEqual([]);
    expect(po.calls[0].element).toBe('ser:ConsultarCPEEmitidasDestinoDGPendientesActivacionReq');
  });

  it('consultarDerivadosGranarios (solo auth) y consultarPlantasDG', async () => {
    const dg = setup(() =>
      cpeResp(
        'ConsultarDerivadosGranariosResp',
        '<derivadoGranario><granoPadre>23</granoPadre><granoPadreDescripcion>Soja</granoPadreDescripcion>' +
          '<codigo>101</codigo><descripcion>Harina de soja</descripcion></derivadoGranario>',
      ),
    );
    expect(await dg.agro.cpe.consultarDerivadosGranarios()).toEqual([
      { granoPadre: 23, granoPadreDescripcion: 'Soja', codigo: 101, descripcion: 'Harina de soja' },
    ]);
    expect(keys(dg.calls[0].req)).toEqual(['auth']);

    const pl = setup(() =>
      cpeResp(
        'ConsultarPlantasDGResp',
        '<planta><nroPlanta>500</nroPlanta><actividad>7</actividad><conPlantaDG>S</conPlantaDG></planta>',
      ),
    );
    expect(await pl.agro.cpe.consultarPlantasDG('20-12345678-6')).toEqual([
      { nroPlanta: 500, actividad: 7, conPlantaDG: 'S' },
    ]);
    expect(pl.calls[0].req.solicitud).toEqual({ cuit: CUIT });
  });
});

// ---------------------------------------------------------------------------
// Validación local
// ---------------------------------------------------------------------------

describe('WSCPE DG: validación local (no llama a ARCA)', () => {
  const campos = (f: () => unknown) => {
    try {
      f();
    } catch (e) {
      return (e as ArcaValidationError).details.map((d) => d.field);
    }
    return [];
  };

  it('reglas "solo si" del manual: cuitTitularPlanta, embalaje a granel y fechaLote', () => {
    const p = autorizarAutomotorDG();
    expect(campos(() => validateAutorizarCPEAutomotorDG(p))).toEqual([]);
    expect(
      campos(() =>
        validateAutorizarCPEAutomotorDG({
          ...p,
          origen: { ...p.origen, cuitTitularPlanta: CUIT },
          datosCarga: { ...p.datosCarga, cantidadUnidades: 10, kgLitroM3: 5, lote: undefined },
        }),
      ),
    ).toEqual([
      'origen.cuitTitularPlanta',
      'datosCarga.cantidadUnidades',
      'datosCarga.kgLitroM3',
      'datosCarga.fechaLote',
    ]);
  });

  it('reglas "solo si" en ferroviaria DG y emitida en destino', () => {
    const f = autorizarFerroviariaDG();
    // esUsuarioIndustria true con cuitTitularPlanta y embalaje no a granel con unidades: válido.
    expect(campos(() => validateAutorizarCPEFerroviariaDG(f))).toEqual([]);
    expect(
      campos(() =>
        validateAutorizarCPEFerroviariaDG({
          ...f,
          origen: { ...f.origen, esUsuarioIndustria: false },
          datosCarga: { ...f.datosCarga, tipoEmbalaje: 1 },
        }),
      ),
    ).toEqual(['origen.cuitTitularPlanta', 'datosCarga.cantidadUnidades', 'datosCarga.kgLitroM3']);
    const e = autorizarEmisionDestinoDG();
    expect(campos(() => validateAutorizarCPEEmisionDestinoDG(e))).toEqual([]);
    expect(
      campos(() =>
        validateAutorizarCPEEmisionDestinoDG({ ...e, datosCarga: { ...e.datosCarga, lote: undefined, kgLitroM3: 5 } }),
      ),
    ).toEqual(['datosCarga.kgLitroM3', 'datosCarga.fechaLote']);
  });

  it('DomicilioPUC: tipo 1 o 3 (errores 2223 y 2224); hasta 10 precintos (2212)', async () => {
    const { agro, fetchMock } = setup(() => '');
    const p = autorizarFerroviariaDG();
    const e = await agro.cpe
      .autorizarCPEFerroviariaDG({
        ...p,
        destino: { ...p.destino, domicilioDestino: { tipo: 2, orden: 1 } },
        transporte: { ...p.transporte, nroPrecinto: Array.from({ length: 11 }, (_, i) => `P-${i}`) },
      })
      .catch((err: ArcaValidationError) => err);
    expect(e).toBeInstanceOf(ArcaValidationError);
    expect((e as ArcaValidationError).details.map((d) => d.field)).toEqual([
      'destino.domicilioDestino.tipo',
      'transporte.nroPrecinto',
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('motivo de contingencia según el tipo: G en ferroviaria DG, sin B ni G en ductos, A a F en emitida en destino', async () => {
    const { agro, fetchMock } = setup(() => cpeResp('InformarContingenciaResp', CARTA_PORTE_RESP));
    const campo = (p: Promise<unknown>) =>
      p.then(
        () => 'ok',
        (e: ArcaValidationError) => e.details[0].field,
      );
    expect(
      await campo(agro.cpe.informarContingencia({ cartaPorte: cpFerroviaria, contingencia: { concepto: 'G' } })),
    ).toBe('ok');
    expect(await campo(agro.cpe.informarContingencia({ cartaPorte: cpDuctos, contingencia: { concepto: 'B' } }))).toBe(
      'contingencia.concepto',
    );
    expect(await campo(agro.cpe.informarContingencia({ cartaPorte: cpDuctos, contingencia: { concepto: 'G' } }))).toBe(
      'contingencia.concepto',
    );
    expect(await campo(agro.cpe.informarContingencia({ cartaPorte: cpDuctos, contingencia: { concepto: 'C' } }))).toBe(
      'ok',
    );
    expect(
      await campo(
        agro.cpe.informarContingenciaEmisionDestinoDG({
          cartaPorte: cpEmisionDestino,
          cuitDestino: CUIT4,
          contingencia: { concepto: 'G' },
        }),
      ),
    ).toBe('contingencia.concepto');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
