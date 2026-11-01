/**
 * Respuestas XML realistas (armadas según los WSDL de ARCA) que pasan por
 * `fetch` mockeado y por el parser real de arca-common.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArcaSoapError, ArcaValidationError, CondicionIva } from '@ramiidv/arca-common';
import { ArcaPadron } from '../src/arca-padron.js';
import { condicionIvaDesdePadron } from '../src/condicion-iva.js';
import { ENDPOINTS } from '../src/constants.js';
import { ArcaPadronError, ArcaPadronServiceError } from '../src/errors.js';
import { CUIT_REPRESENTADA, fault, mockFetch, padron, requestBody, respuesta } from './helpers.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const AUTH_KEYS = ['token', 'sign', 'cuitRepresentada'];

// ---------------------------------------------------------------------------
// (a) XML enviado
// ---------------------------------------------------------------------------

describe('request: wrapper, namespace, SOAPAction, auth y orden del XSD', () => {
  const casos: Array<{
    nombre: string;
    svc: keyof typeof ENDPOINTS & ('a4' | 'a5' | 'a10' | 'a13' | 'a100');
    method: string;
    inner: string;
    run: (p: Awaited<ReturnType<typeof padron>>) => Promise<unknown>;
    campos: Record<string, unknown>;
  }> = [
    {
      nombre: 'A4 getPersona',
      svc: 'a4',
      method: 'getPersona',
      inner: '<personaReturn><persona><idPersona>20111111112</idPersona><tipoPersona>FISICA</tipoPersona></persona></personaReturn>',
      run: (p) => p.getPersona('20-11111111-2'),
      campos: { idPersona: '20111111112' },
    },
    {
      nombre: 'A10 getPersona',
      svc: 'a10',
      method: 'getPersona',
      inner: '<personaReturn><persona><idPersona>20111111112</idPersona><tipoPersona>FISICA</tipoPersona></persona></personaReturn>',
      run: (p) => p.getPersonaBasic(20111111112),
      campos: { idPersona: '20111111112' },
    },
    {
      nombre: 'A13 getPersonaV2',
      svc: 'a13',
      method: 'getPersonaV2',
      inner: '<personaReturn><persona><idPersona>20111111112</idPersona><tipoPersona>FISICA</tipoPersona></persona></personaReturn>',
      run: (p) => p.getPersonaA13V2('20111111112'),
      campos: { idPersona: '20111111112' },
    },
    {
      nombre: 'A13 getIdPersonaListByDocumento',
      svc: 'a13',
      method: 'getIdPersonaListByDocumento',
      inner: '<idPersonaListReturn/>',
      run: (p) => p.getIdPersonaListByDocumento('11.709.676'),
      campos: { documento: '11709676' },
    },
    {
      nombre: 'constancia getPersona_v2',
      svc: 'a5',
      method: 'getPersona_v2',
      inner:
        '<personaReturn><datosGenerales><idPersona>20111111112</idPersona><tipoPersona>FISICA</tipoPersona></datosGenerales></personaReturn>',
      run: (p) => p.getConstanciaInscripcion('20111111112'),
      campos: { idPersona: '20111111112' },
    },
    {
      nombre: 'A100 getParameterCollectionByName',
      svc: 'a100',
      method: 'getParameterCollectionByName',
      inner: '<parameterCollectionReturn><parameterCollection><name>SUPA.E_PROVINCIA</name></parameterCollection></parameterCollectionReturn>',
      run: (p) => p.getParametros('SUPA.E_PROVINCIA'),
      campos: { collectionName: 'SUPA.E_PROVINCIA' },
    },
  ];

  for (const c of casos) {
    it(c.nombre, async () => {
      const client = await padron();
      const cap = mockFetch(respuesta(ENDPOINTS[c.svc].namespace, c.method, c.inner));
      await c.run(client);
      expect(cap.urls[0]).toBe(ENDPOINTS[c.svc].testing);
      expect(cap.headers[0]['SOAPAction']).toBe('""');
      expect(cap.bodies[0]).toContain(`<ser:${c.method} xmlns:ser="${ENDPOINTS[c.svc].namespace}">`);
      const body = requestBody(cap.bodies[0], c.method);
      expect(Object.keys(body).filter((k) => !k.startsWith('@_'))).toEqual([...AUTH_KEYS, ...Object.keys(c.campos)]);
      expect(body).toMatchObject({ token: 'TOKEN', sign: 'SIGN', cuitRepresentada: CUIT_REPRESENTADA, ...c.campos });
    });
  }

  it('getPersonaList_v2 repite idPersona por cada CUIT', async () => {
    const client = await padron();
    const cap = mockFetch(respuesta(ENDPOINTS.a5.namespace, 'getPersonaList_v2', '<personaListReturn/>'));
    await client.getConstanciasInscripcion(['20111111112', '27-11111111-7']);
    const body = requestBody(cap.bodies[0], 'getPersonaList_v2');
    expect(body['idPersona']).toEqual(['20111111112', '27111111117']);
  });

  it('dummy sin auth', async () => {
    const client = await padron();
    const cap = mockFetch(
      respuesta(ENDPOINTS.a4.namespace, 'dummy', '<return><appserver>OK</appserver><authserver>OK</authserver><dbserver>OK</dbserver></return>'),
    );
    expect(await client.a4.dummy()).toEqual({ appserver: 'OK', authserver: 'OK', dbserver: 'OK' });
    expect(cap.bodies[0]).toMatch(/<ser:dummy xmlns:ser="http:\/\/a4\.soap\.ws\.server\.puc\.sr\/"\s*(\/>|><\/ser:dummy>)/);
  });

  it('valida la CUIT localmente (dígito verificador) sin llamar a ARCA', async () => {
    const client = await padron();
    const cap = mockFetch(respuesta(ENDPOINTS.a4.namespace, 'getPersona', '<personaReturn/>'));
    await expect(client.getPersona('20-11111111-3')).rejects.toBeInstanceOf(ArcaValidationError);
    await expect(client.getIdPersonaListByDocumento('ABC123')).rejects.toBeInstanceOf(ArcaValidationError);
    await expect(client.getConstanciasInscripcion([])).rejects.toBeInstanceOf(ArcaValidationError);
    await expect(
      client.getConstanciasInscripcion(Array.from({ length: 251 }, () => '20111111112')),
    ).rejects.toBeInstanceOf(ArcaValidationError);
    expect(cap.fn).not.toHaveBeenCalled();
  });

  it('valida la CUIT representada de la config', () => {
    expect(() => padronSinTickets('20123456789')).toThrow(ArcaValidationError);
  });

  it('endpoints sobrescribibles y fetch de la config', async () => {
    const fetch = vi.fn(async () =>
      respuesta(
        ENDPOINTS.a10.namespace,
        'getPersona',
        '<personaReturn><persona><idPersona>20111111112</idPersona><tipoPersona>FISICA</tipoPersona></persona></personaReturn>',
      ),
    );
    const client = await padron({ endpoints: { a10: 'https://proxy.local/a10' }, fetch });
    await client.getPersonaBasic('20111111112');
    expect(fetch).toHaveBeenCalledWith('https://proxy.local/a10', expect.anything());
  });
});

function padronSinTickets(cuit: string) {
  return new ArcaPadron({ cert: 'C', key: 'K', cuit });
}

// ---------------------------------------------------------------------------
// (c) Errores de negocio
// ---------------------------------------------------------------------------

describe('Faults de negocio → ArcaPadronServiceError', () => {
  it('CUIT inexistente: reason inexistente, cause ArcaSoapError, sin reintento', async () => {
    const client = await padron({ retries: 3 });
    const cap = mockFetch(fault('La Clave (CUIT/CUIL) consultada es inexistente'));
    const err = await client.getPersonaA13('20111111112').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ArcaPadronServiceError);
    const e = err as ArcaPadronServiceError;
    expect(e.reason).toBe('inexistente');
    expect(e.code).toBe('ARCA_PADRON_SERVICE_ERROR');
    expect(e.errors).toEqual([{ code: 0, msg: 'La Clave (CUIT/CUIL) consultada es inexistente', rawCode: 'soap:Server' }]);
    expect(e.cause).toBeInstanceOf(ArcaSoapError);
    expect(cap.fn).toHaveBeenCalledTimes(1);
  });

  it('clave INACTIVA: reason inactiva', async () => {
    const client = await padron();
    mockFetch(fault('La clave (CUIT/CUIL) consultada se encuentra INACTIVA'));
    await expect(client.getPersona('20111111112')).rejects.toMatchObject({ reason: 'inactiva' });
  });

  it('"No existe persona con ese Id" en la constancia: reason inexistente', async () => {
    const client = await padron();
    mockFetch(fault('No existe persona con ese Id'));
    await expect(client.getConstanciaInscripcion('20111111112')).rejects.toMatchObject({
      name: 'ArcaPadronServiceError',
      reason: 'inexistente',
    });
  });

  it('token no autorizado: reason no_autorizado', async () => {
    const client = await padron();
    mockFetch(fault('Este token no le permite actuar en representacion de la CUIT 20123456786'));
    await expect(client.getPersonaBasic('20111111112')).rejects.toMatchObject({ reason: 'no_autorizado' });
  });

  it('un Fault desconocido queda como ArcaSoapError', async () => {
    const client = await padron();
    mockFetch(fault('java.lang.NullPointerException'));
    const err = await client.getPersona('20111111112').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ArcaSoapError);
    expect(err).not.toBeInstanceOf(ArcaPadronServiceError);
  });

  it('personaReturn sin persona → ArcaPadronError (A4, A10, A13)', async () => {
    const client = await padron();
    mockFetch(respuesta(ENDPOINTS.a4.namespace, 'getPersona', '<personaReturn><metadata><servidor>x</servidor></metadata></personaReturn>'));
    await expect(client.getPersona('20111111112')).rejects.toBeInstanceOf(ArcaPadronError);
    await expect(client.getPersonaBasic('20111111112')).rejects.toBeInstanceOf(ArcaPadronError);
    await expect(client.getPersonaA13('20111111112')).rejects.toBeInstanceOf(ArcaPadronError);
  });

  it('constancia sin datosGenerales ni errorConstancia → ArcaPadronError', async () => {
    const client = await padron();
    mockFetch(respuesta(ENDPOINTS.a5.namespace, 'getPersona_v2', '<personaReturn><metadata><servidor>x</servidor></metadata></personaReturn>'));
    await expect(client.getConstanciaInscripcion('20111111112')).rejects.toBeInstanceOf(ArcaPadronError);
  });
});

// ---------------------------------------------------------------------------
// (b) Constancia de inscripción
// ---------------------------------------------------------------------------

const CONSTANCIA_COMPLETA = `<personaReturn>
  <datosGenerales>
    <apellido>SKIOGEK OGIUPE</apellido>
    <caracterizacion><descripcionCaracterizacion>IVA ANUAL AGROPECUARIO</descripcionCaracterizacion>
      <fechaSolicitud>20030316</fechaSolicitud><idCaracterizacion>17</idCaracterizacion><periodo>19010101</periodo></caracterizacion>
    <caracterizacion xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true"/>
    <caracterizacion><descripcionCaracterizacion>GANANCIAS SIMPLIFICADA LEY 27.779</descripcionCaracterizacion>
      <fechaSolicitud>20260220</fechaSolicitud><idCaracterizacion>639</idCaracterizacion><periodo>20250101</periodo></caracterizacion>
    <dependencia><codPostal>7000</codPostal><descripcionDependencia>AGENCIA TANDIL</descripcionDependencia>
      <descripcionProvincia>BUENOS AIRES</descripcionProvincia><direccion>PINTO 500</direccion><idDependencia>45</idDependencia>
      <idProvincia>1</idProvincia><localidad>TANDIL</localidad></dependencia>
    <domicilioFiscal><codPostal>7007</codPostal><datoAdicional>123</datoAdicional><descripcionProvincia>BUENOS AIRES</descripcionProvincia>
      <direccion>SAN MANUEL 9</direccion><idProvincia>1</idProvincia><localidad>SAN MANUEL</localidad>
      <tipoDatoAdicional>BARRIO</tipoDatoAdicional><tipoDomicilio>FISCAL</tipoDomicilio></domicilioFiscal>
    <esSucesion>NO</esSucesion><estadoClave>ACTIVO</estadoClave><idPersona>20164755100</idPersona><mesCierre>12</mesCierre>
    <nombre>OGIEK KPSGR</nombre><tipoClave>CUIT</tipoClave><tipoPersona>FISICA</tipoPersona>
  </datosGenerales>
  <datosRegimenGeneral>
    <actividad><descripcionActividad>CULTIVO DE CEREALES</descripcionActividad><idActividad>11119</idActividad>
      <nomenclador>883</nomenclador><orden>1</orden><periodo>201311</periodo></actividad>
    <actividad><descripcionActividad>CULTIVO DE SOJA</descripcionActividad><idActividad>11211</idActividad>
      <nomenclador>883</nomenclador><orden>2</orden><periodo>201311</periodo></actividad>
    <categoriaAutonomo><descripcionCategoria>T3 CAT II INGRESOS DESDE $25.001</descripcionCategoria>
      <idCategoria>302</idCategoria><idImpuesto>308</idImpuesto><periodo>200703</periodo></categoriaAutonomo>
    <impuesto><descripcionImpuesto>GANANCIAS PERSONAS FISICAS</descripcionImpuesto><estadoImpuesto>AC</estadoImpuesto>
      <idImpuesto>11</idImpuesto><motivo>INSCRIPCIÓN TRAMITADA EN AGENCIA</motivo><periodo>199203</periodo></impuesto>
    <impuesto><descripcionImpuesto>IVA</descripcionImpuesto><estadoImpuesto>AC</estadoImpuesto>
      <idImpuesto>30</idImpuesto><motivo>INSCRIPCIÓN TRAMITADA EN AGENCIA</motivo><periodo>199911</periodo></impuesto>
    <impuesto><descripcionImpuesto>APORTES SEG.SOCIAL AUTONOMOS</descripcionImpuesto><estadoImpuesto>AC</estadoImpuesto>
      <idImpuesto>308</idImpuesto><periodo>200703</periodo></impuesto>
  </datosRegimenGeneral>
  <metadata><fechaHora>2026-02-26T15:52:37.653-03:00</fechaHora><servidor>qa</servidor></metadata>
</personaReturn>`;

describe('constancia de inscripción: respuestas realistas', () => {
  it('caracterizaciones (con nil), dependencia, categoriaAutonomo, N actividades e impuestos', async () => {
    const client = await padron();
    mockFetch(respuesta(ENDPOINTS.a5.namespace, 'getPersona_v2', CONSTANCIA_COMPLETA));
    const p = await client.getConstanciaInscripcion('20164755100');
    expect(p.caracterizacion).toEqual([
      { idCaracterizacion: 17, descripcionCaracterizacion: 'IVA ANUAL AGROPECUARIO', periodo: 19010101, fechaSolicitud: 20030316 },
      {
        idCaracterizacion: 639,
        descripcionCaracterizacion: 'GANANCIAS SIMPLIFICADA LEY 27.779',
        periodo: 20250101,
        fechaSolicitud: 20260220,
      },
    ]);
    expect(p.dependencia).toEqual({
      idDependencia: 45,
      descripcionDependencia: 'AGENCIA TANDIL',
      direccion: 'PINTO 500',
      localidad: 'TANDIL',
      codPostal: '7000',
      idProvincia: 1,
      descripcionProvincia: 'BUENOS AIRES',
    });
    expect(p.domicilioFiscal).toMatchObject({ codPostal: '7007', datoAdicional: '123', idProvincia: 1 });
    expect(p.regimenGeneral?.categoriaAutonomo).toEqual({
      idCategoria: 302,
      descripcionCategoria: 'T3 CAT II INGRESOS DESDE $25.001',
      idImpuesto: 308,
      periodo: 200703,
    });
    expect(p.regimenGeneral?.actividades.map((a) => a.idActividad)).toEqual(['11119', '11211']);
    expect(p.impuestos.map((i) => i.idImpuesto)).toEqual([11, 30, 308]);
    expect(condicionIvaDesdePadron(p).condicionIva).toBe(CondicionIva.RESPONSABLE_INSCRIPTO);
  });

  it('monotributo con componenteDeSociedad', async () => {
    const client = await padron();
    mockFetch(
      respuesta(
        ENDPOINTS.a5.namespace,
        'getPersona_v2',
        `<personaReturn><datosGenerales><idPersona>30712345671</idPersona><razonSocial>SOC SH</razonSocial>
          <tipoPersona>JURIDICA</tipoPersona></datosGenerales>
          <datosMonotributo>
            <categoriaMonotributo><descripcionCategoria>B LOCACIONES DE SERVICIO</descripcionCategoria>
              <idCategoria>36</idCategoria><idImpuesto>20</idImpuesto><periodo>201804</periodo></categoriaMonotributo>
            <componenteDeSociedad><apellidoPersonaAsociada>PEREZ</apellidoPersonaAsociada><ffRelacion>2018-04-01T00:00:00-03:00</ffRelacion>
              <idPersonaAsociada>20111111112</idPersonaAsociada><nombrePersonaAsociada>JUAN</nombrePersonaAsociada>
              <tipoComponente>SOCIO</tipoComponente></componenteDeSociedad>
            <impuesto><descripcionImpuesto>MONOTRIBUTO</descripcionImpuesto><estadoImpuesto>AC</estadoImpuesto>
              <idImpuesto>20</idImpuesto><periodo>201803</periodo></impuesto>
          </datosMonotributo></personaReturn>`,
      ),
    );
    const p = await client.getConstanciaInscripcion('30712345671');
    expect(p.monotributo?.componenteDeSociedad).toEqual([
      {
        idPersonaAsociada: '20111111112',
        apellidoPersonaAsociada: 'PEREZ',
        nombrePersonaAsociada: 'JUAN',
        razonSocialPersonaAsociada: undefined,
        tipoComponente: 'SOCIO',
        ffRelacion: '2018-04-01T00:00:00-03:00',
        ffVencimiento: undefined,
      },
    ]);
  });

  it('errorRegimenGeneral y errorMonotributo: se devuelven y van al motivo', async () => {
    const client = await padron();
    mockFetch(
      respuesta(
        ENDPOINTS.a5.namespace,
        'getPersona_v2',
        `<personaReturn><datosGenerales><estadoClave>ACTIVO</estadoClave><idPersona>20111111112</idPersona>
            <tipoPersona>FISICA</tipoPersona></datosGenerales>
          <errorMonotributo><error>Datos de monotributo incompletos- no posee categoría.</error>
            <mensaje>No cumple con las condiciones para enviar datos monotributo</mensaje></errorMonotributo>
          <errorRegimenGeneral><error>Actividad económica principal inexistente</error><error>Domicilio Incompleto</error>
            <mensaje>No cumple con las condiciones para enviar datos del regimen general</mensaje></errorRegimenGeneral>
        </personaReturn>`,
      ),
    );
    const p = await client.getConstanciaInscripcion('20111111112');
    expect(p.errorRegimenGeneral).toEqual({
      error: ['Actividad económica principal inexistente', 'Domicilio Incompleto'],
      mensaje: 'No cumple con las condiciones para enviar datos del regimen general',
    });
    expect(p.errorMonotributo?.error).toEqual(['Datos de monotributo incompletos- no posee categoría.']);
    const r = condicionIvaDesdePadron(p);
    expect(r.condicionIva).toBeNull();
    expect(r.motivo).not.toMatch(/No figura inscripto/);
    expect(r.motivo).toContain('Actividad económica principal inexistente');
    expect(r.motivo).toContain('no posee categoría');
  });

  it('getPersonaList_v2: la CUIT inexistente vuelve con errorConstancia', async () => {
    const client = await padron();
    mockFetch(
      respuesta(
        ENDPOINTS.a5.namespace,
        'getPersonaList_v2',
        `<personaListReturn><metadata><servidor>x</servidor></metadata>
          <persona><datosGenerales><idPersona>20224107030</idPersona><tipoPersona>FISICA</tipoPersona></datosGenerales></persona>
          <persona><errorConstancia><error>No existe persona con ese Id</error><idPersona>20111111112</idPersona></errorConstancia></persona>
        </personaListReturn>`,
      ),
    );
    const list = await client.getConstanciasInscripcion(['20224107030', '20111111112']);
    expect(list.map((p) => p.idPersona)).toEqual(['20224107030', '20111111112']);
    expect(list[1].errorConstancia?.error).toEqual(['No existe persona con ese Id']);
  });
});

// ---------------------------------------------------------------------------
// A4 / A10
// ---------------------------------------------------------------------------

function personaA4(impuestos: string, extra = ''): string {
  return (
    '<personaReturn><persona>' +
    '<domicilio><codPostal>1425</codPostal><datoAdicional>12</datoAdicional><descripcionProvincia>CIUDAD AUTONOMA BUENOS AIRES</descripcionProvincia>' +
    '<direccion>CHARCAS 4321</direccion><idProvincia>0</idProvincia><localidad>0123</localidad><orden>1</orden>' +
    '<tipoDomicilio>FISCAL</tipoDomicilio></domicilio>' +
    '<domicilio xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true"/>' +
    `<estadoClave>ACTIVO</estadoClave><idPersona>20000000516</idPersona>${impuestos}` +
    `<numeroDocumento>51</numeroDocumento><numeroInscripcion>12345</numeroInscripcion>${extra}` +
    '<telefono><numero>1144445555</numero><tipoTelefono>PARTICULAR</tipoTelefono></telefono>' +
    '<tipoPersona>FISICA</tipoPersona></persona></personaReturn>'
  );
}
const imp4 = (id: number, estado: string, desc = 'IVA') =>
  `<impuesto><descripcionImpuesto>${desc}</descripcionImpuesto><estado>${estado}</estado><idImpuesto>${id}</idImpuesto><periodo>200611</periodo></impuesto>`;

describe('A4: respuestas realistas', () => {
  it('campos xs:string numéricos quedan como string (codPostal, datoAdicional, localidad, numeroInscripcion)', async () => {
    const client = await padron();
    mockFetch(respuesta(ENDPOINTS.a4.namespace, 'getPersona', personaA4(imp4(30, 'ACTIVO'))));
    const p = await client.getPersona('20000000516');
    expect(p.domicilio).toEqual([
      {
        codPostal: '1425',
        datoAdicional: '12',
        descripcionProvincia: 'CIUDAD AUTONOMA BUENOS AIRES',
        direccion: 'CHARCAS 4321',
        idProvincia: 0,
        localidad: '0123',
        orden: 1,
        tipoDomicilio: 'FISCAL',
        tipoDatoAdicional: undefined,
      },
    ]);
    expect(p.numeroInscripcion).toBe('12345');
    expect(p.numeroDocumento).toBe('51');
    expect(p.telefono).toEqual([{ numero: '1144445555', tipoTelefono: 'PARTICULAR', tipoLinea: undefined }]);
  });

  it('xs:string con decimales o exponente se preservan; los numéricos del WSDL siguen siendo number', async () => {
    const client = await padron();
    const xml = personaA4(imp4(30, 'ACTIVO'), '<mesCierre>12</mesCierre><porcentajeCapitalNacional>10.50</porcentajeCapitalNacional>')
      .replace('<datoAdicional>12</datoAdicional>', '<datoAdicional>1.50</datoAdicional>')
      .replace('<numeroInscripcion>12345</numeroInscripcion>', '<numeroInscripcion>1E3</numeroInscripcion>');
    mockFetch(respuesta(ENDPOINTS.a4.namespace, 'getPersona', xml));
    const p = await client.getPersona('20000000516');
    expect(p.domicilio?.[0]).toMatchObject({ datoAdicional: '1.50', idProvincia: 0, orden: 1, localidad: '0123' });
    expect(p.numeroInscripcion).toBe('1E3');
    expect(p.mesCierre).toBe(12);
    expect(p.porcentajeCapitalNacional).toBe(10.5);
    expect(p.impuesto).toEqual([
      { idImpuesto: 30, descripcionImpuesto: 'IVA', estado: 'ACTIVO', periodo: 200611, diaPeriodo: undefined, ffInscripcion: undefined },
    ]);
  });

  it('IVA (30) EXENTO → Exento', async () => {
    const client = await padron();
    mockFetch(respuesta(ENDPOINTS.a4.namespace, 'getPersona', personaA4(imp4(30, 'EXENTO'))));
    const r = condicionIvaDesdePadron(await client.getPersona('20000000516'));
    expect(r.condicionIva).toBe(CondicionIva.EXENTO);
  });

  it('IVA (30) ACTIVO EN TRAMITE → Responsable Inscripto', async () => {
    const client = await padron();
    mockFetch(respuesta(ENDPOINTS.a4.namespace, 'getPersona', personaA4(imp4(30, 'ACTIVO EN TRAMITE'))));
    expect(condicionIvaDesdePadron(await client.getPersona('20000000516')).condicionIva).toBe(
      CondicionIva.RESPONSABLE_INSCRIPTO,
    );
  });

  it('BAJA DEFINITIVA no cuenta: IVA y monotributo (aunque haya categoría)', async () => {
    const client = await padron();
    const categoria =
      '<categoria><descripcionCategoria>B LOCACIONES DE SERVICIO</descripcionCategoria><estado>ACTIVO</estado>' +
      '<idCategoria>36</idCategoria><idImpuesto>20</idImpuesto><periodo>200406</periodo></categoria>';
    mockFetch(
      respuesta(
        ENDPOINTS.a4.namespace,
        'getPersona',
        personaA4(imp4(20, 'BAJA DEFINITIVA', 'MONOTRIBUTO') + imp4(30, 'BAJA DEFINITIVA'), '').replace(
          '<domicilio>',
          categoria + '<domicilio>',
        ),
      ),
    );
    const p = await client.getPersona('20000000516');
    expect(p.categoria).toHaveLength(1);
    const r = condicionIvaDesdePadron(p);
    expect(r.condicionIva).toBeNull();
    expect(r.motivo).toMatch(/No figura inscripto/);
  });

  it('NO APORTANTE no se interpreta como IVA no alcanzado', async () => {
    const client = await padron();
    mockFetch(respuesta(ENDPOINTS.a4.namespace, 'getPersona', personaA4(imp4(30, 'NO APORTANTE'))));
    expect(condicionIvaDesdePadron(await client.getPersona('20000000516')).condicionIva).toBeNull();
  });
});

describe('A10: respuestas realistas', () => {
  it('codPostal y datoAdicional numéricos quedan como string; dependencia y claves inactivas', async () => {
    const client = await padron();
    mockFetch(
      respuesta(
        ENDPOINTS.a10.namespace,
        'getPersona',
        '<personaReturn><persona><apellido>PEREZ</apellido><claveInactivaAsociada>20999999996</claveInactivaAsociada>' +
          '<dependencia><descripcionDependencia>AGENCIA 10</descripcionDependencia><idDependencia>10</idDependencia></dependencia>' +
          '<domicilio><codPostal>5000</codPostal><datoAdicional>7</datoAdicional><direccion>SAN MARTIN 1</direccion>' +
          '<idProvincia>3</idProvincia><localidad>CORDOBA</localidad><tipoDomicilio>FISCAL</tipoDomicilio></domicilio>' +
          '<idActividadPrincipal>620100</idActividadPrincipal><idPersona>20111111112</idPersona>' +
          '<tipoPersona>FISICA</tipoPersona></persona></personaReturn>',
      ),
    );
    const p = await client.getPersonaBasic('20111111112');
    expect(p.domicilio?.[0]).toMatchObject({ codPostal: '5000', datoAdicional: '7', idProvincia: 3 });
    expect(p.dependencia).toEqual({ idDependencia: 10, descripcionDependencia: 'AGENCIA 10' });
    expect(p.claveInactivaAsociada).toEqual(['20999999996']);
    expect(p.idActividadPrincipal).toBe('620100');
  });
});

// ---------------------------------------------------------------------------
// A13
// ---------------------------------------------------------------------------

describe('A13', () => {
  it('getPersonaV2 devuelve personas con clave INACTIVA', async () => {
    const client = await padron();
    mockFetch(
      respuesta(
        ENDPOINTS.a13.namespace,
        'getPersonaV2',
        '<personaReturn><metadata><servidor>127.0.0.1</servidor></metadata><persona><apellido>GEOFFREY WILLIAM</apellido>' +
          '<domicilio><calle>SAN RAMON</calle><codigoPostal>4600</codigoPostal><direccion>SAN RAMON 415</direccion>' +
          '<estadoDomicilio>DECLARADO</estadoDomicilio><idProvincia>6</idProvincia><numero>415</numero><tipoDomicilio>FISCAL</tipoDomicilio></domicilio>' +
          '<domicilio><codigoPostal>4600</codigoPostal><tipoDomicilio>LEGAL/REAL</tipoDomicilio></domicilio>' +
          '<estadoClave>INACTIVO</estadoClave><idPersona>20002444233</idPersona><numeroDocumento>265181</numeroDocumento>' +
          '<tipoDocumento>DNI</tipoDocumento><tipoPersona>FISICA</tipoPersona></persona></personaReturn>',
      ),
    );
    const p = await client.getPersonaA13V2('20002444233');
    expect(p.estadoClave).toBe('INACTIVO');
    expect(p.domicilio?.map((d) => d.tipoDomicilio)).toEqual(['FISCAL', 'LEGAL/REAL']);
    expect(p.domicilio?.[0]).toMatchObject({ codigoPostal: '4600', numero: 415, estadoDomicilio: 'DECLARADO' });
  });

  it('domicilio: piso/datoAdicional con decimales quedan como string; numero e idProvincia son number', async () => {
    const client = await padron();
    mockFetch(
      respuesta(
        ENDPOINTS.a13.namespace,
        'getPersona',
        '<personaReturn><persona><domicilio><datoAdicional>2.10</datoAdicional><idProvincia>6</idProvincia>' +
          '<numero>415</numero><piso>01</piso></domicilio><idPersona>20002444233</idPersona>' +
          '<numeroDocumento>0265181</numeroDocumento><periodoActividadPrincipal>201311</periodoActividadPrincipal>' +
          '<tipoPersona>FISICA</tipoPersona></persona></personaReturn>',
      ),
    );
    const p = await client.getPersonaA13('20002444233');
    expect(p.domicilio?.[0]).toMatchObject({ datoAdicional: '2.10', piso: '01', numero: 415, idProvincia: 6 });
    expect(p.numeroDocumento).toBe('0265181');
    expect(p.periodoActividadPrincipal).toBe(201311);
  });

  it.each([
    ['0 claves', '<idPersonaListReturn><metadata><servidor>x</servidor></metadata></idPersonaListReturn>', []],
    ['1 clave', '<idPersonaListReturn><idPersona>23117096769</idPersona></idPersonaListReturn>', ['23117096769']],
    [
      'N claves',
      '<idPersonaListReturn><idPersona>23117096769</idPersona><idPersona>27117096764</idPersona></idPersonaListReturn>',
      ['23117096769', '27117096764'],
    ],
  ])('getIdPersonaListByDocumento con %s', async (_n, inner, esperado) => {
    const client = await padron();
    mockFetch(respuesta(ENDPOINTS.a13.namespace, 'getIdPersonaListByDocumento', inner));
    expect(await client.getIdPersonaListByDocumento('11709676')).toEqual(esperado);
  });
});

// ---------------------------------------------------------------------------
// A100
// ---------------------------------------------------------------------------

describe('A100', () => {
  const coleccion = (params: string) =>
    '<parameterCollectionReturn><metadata><fechaHora>2017-05-05T10:54:45.034-03:00</fechaHora><servidor>x</servidor></metadata>' +
    `<parameterCollection><name>SUPA.X</name>${params}</parameterCollection></parameterCollectionReturn>`;

  it('1 atributo y value "10.50" preservado como string', async () => {
    const client = await padron();
    mockFetch(
      respuesta(
        ENDPOINTS.a100.namespace,
        'getParameterCollectionByName',
        coleccion('<parameterList><attributeList><name>ALICUOTA</name><value>10.50</value></attributeList>' +
          '<description>ALICUOTA GENERAL</description><id>007</id></parameterList>'),
      ),
    );
    expect(await client.getParametros('SUPA.X')).toEqual([
      { id: '007', descripcion: 'ALICUOTA GENERAL', atributos: [{ name: 'ALICUOTA', value: '10.50' }] },
    ]);
  });

  it('N atributos, ids tipo "1E3" y valores vacíos', async () => {
    const client = await padron();
    mockFetch(
      respuesta(
        ENDPOINTS.a100.namespace,
        'getParameterCollectionByName',
        coleccion(
          '<parameterList><attributeList><name>NOMBRE_PROVINCIA</name><value>MISIONES</value></attributeList>' +
            '<attributeList><name>COD_PROVINCIA</name><value>19</value></attributeList>' +
            '<attributeList><name>CODIGO_SIM_PROVINCIA</name><value>MI</value></attributeList>' +
            '<attributeList><name>VACIO</name><value></value></attributeList>' +
            '<description>MISIONES</description><id>19</id></parameterList>' +
            '<parameterList><description>R &amp; D</description><id>1E3</id></parameterList>',
        ),
      ),
    );
    const params = await client.getParametros('SUPA.X');
    expect(params[0].atributos).toEqual([
      { name: 'NOMBRE_PROVINCIA', value: 'MISIONES' },
      { name: 'COD_PROVINCIA', value: '19' },
      { name: 'CODIGO_SIM_PROVINCIA', value: 'MI' },
      { name: 'VACIO', value: '' },
    ]);
    expect(params[1]).toEqual({ id: '1E3', descripcion: 'R & D', atributos: undefined });
  });

  it('colección vacía → []; sin parameterCollection → ArcaPadronError', async () => {
    const client = await padron();
    mockFetch(respuesta(ENDPOINTS.a100.namespace, 'getParameterCollectionByName', coleccion('')));
    expect(await client.getParametros('SUPA.X')).toEqual([]);
    mockFetch(respuesta(ENDPOINTS.a100.namespace, 'getParameterCollectionByName', '<parameterCollectionReturn/>'));
    await expect(client.getParametros('SUPA.X')).rejects.toBeInstanceOf(ArcaPadronError);
  });
});

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

describe('status', () => {
  it('un servicio caído no oculta a los demás (Promise.allSettled)', async () => {
    const client = await padron({ retries: 0 });
    const fn = vi.fn(async (url: string) => {
      if (url === ENDPOINTS.a10.testing) return new Response('Service Unavailable', { status: 503 });
      const ns = Object.values(ENDPOINTS).find((e) => 'testing' in e && e.testing === url) as { namespace: string };
      return respuesta(
        ns.namespace,
        'dummy',
        '<return><appserver>OK</appserver><authserver>OK</authserver><dbserver>OK</dbserver></return>',
      );
    });
    vi.stubGlobal('fetch', fn);
    const s = await client.status();
    expect(s.a4).toEqual({ status: 'fulfilled', value: { appserver: 'OK', authserver: 'OK', dbserver: 'OK' } });
    expect(s.a10.status).toBe('rejected');
    expect((s.a10 as PromiseRejectedResult).reason).toBeInstanceOf(ArcaSoapError);
    expect(s.a5.status).toBe('fulfilled');
    expect(s.a13.status).toBe('fulfilled');
    expect(s.a100.status).toBe('fulfilled');
  });
});
