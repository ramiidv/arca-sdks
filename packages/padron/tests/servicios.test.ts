import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArcaSoapError, MemoryTicketStorage, CondicionIva } from '@ramiidv/arca-common';
import { ArcaPadron } from '../src/arca-padron.js';
import { mockFetch, padron, respuesta } from './helpers.js';
import { condicionIvaDesdePadron } from '../src/condicion-iva.js';
import { ENDPOINTS } from '../src/constants.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const CONSTANCIA_RI = `<personaReturn>
  <datosGenerales>
    <domicilioFiscal><codPostal>5000</codPostal><descripcionProvincia>CORDOBA</descripcionProvincia>
      <direccion>SAN MARTIN 100</direccion><idProvincia>3</idProvincia><localidad>CORDOBA</localidad>
      <tipoDomicilio>FISCAL</tipoDomicilio></domicilioFiscal>
    <estadoClave>ACTIVO</estadoClave><idPersona>30712345671</idPersona><mesCierre>12</mesCierre>
    <razonSocial>RESTO SA</razonSocial><tipoClave>CUIT</tipoClave><tipoPersona>JURIDICA</tipoPersona>
  </datosGenerales>
  <datosRegimenGeneral>
    <actividad><descripcionActividad>SERVICIOS DE RESTAURANTES Y CANTINAS SIN ESPECTACULO</descripcionActividad>
      <idActividad>561011</idActividad><nomenclador>883</nomenclador><orden>1</orden><periodo>201311</periodo></actividad>
    <impuesto><descripcionImpuesto>GANANCIAS SOCIEDADES</descripcionImpuesto><estadoImpuesto>AC</estadoImpuesto>
      <idImpuesto>10</idImpuesto><motivo>INSCRIPCIÓN TRAMITADA EN AGENCIA</motivo><periodo>201311</periodo></impuesto>
    <impuesto><descripcionImpuesto>IVA</descripcionImpuesto><estadoImpuesto>AC</estadoImpuesto>
      <idImpuesto>30</idImpuesto><periodo>201311</periodo></impuesto>
    <regimen><descripcionRegimen>RETENCIONES</descripcionRegimen><idImpuesto>30</idImpuesto><idRegimen>214</idRegimen>
      <periodo>201311</periodo><tipoRegimen>RETENCION</tipoRegimen></regimen>
  </datosRegimenGeneral>
  <metadata><fechaHora>2026-10-30T12:00:00.000-03:00</fechaHora><servidor>linux11b</servidor></metadata>
</personaReturn>`;

const CONSTANCIA_MONO = `<personaReturn>
  <datosGenerales>
    <apellido>PEREZ</apellido><estadoClave>ACTIVO</estadoClave><idPersona>20111111112</idPersona>
    <nombre>JUAN</nombre><tipoClave>CUIT</tipoClave><tipoPersona>FISICA</tipoPersona>
  </datosGenerales>
  <datosMonotributo>
    <actividadMonotributista><descripcionActividad>PREST. DE SERVICIO O LOCACIÓN</descripcionActividad>
      <idActividad>8</idActividad><nomenclador>1</nomenclador><orden>0</orden><periodo>201803</periodo></actividadMonotributista>
    <categoriaMonotributo><descripcionCategoria>B LOCACIONES DE SERVICIO</descripcionCategoria>
      <idCategoria>36</idCategoria><idImpuesto>20</idImpuesto><periodo>201804</periodo></categoriaMonotributo>
    <impuesto><descripcionImpuesto>MONOTRIBUTO</descripcionImpuesto><estadoImpuesto>AC</estadoImpuesto>
      <idImpuesto>20</idImpuesto><motivo>Recategorización</motivo><periodo>201803</periodo></impuesto>
  </datosMonotributo>
  <metadata><fechaHora>2026-10-30T12:00:00.000-03:00</fechaHora><servidor>linux11b</servidor></metadata>
</personaReturn>`;

describe('constancia de inscripción (ex A5)', () => {
  it('usa getPersona_v2, parámetros sin namespace y en orden del WSDL', async () => {
    const client = await padron();
    const { bodies } = mockFetch(respuesta(ENDPOINTS.a5.namespace, 'getPersona_v2', CONSTANCIA_RI));
    await client.getConstanciaInscripcion('30712345671');
    expect(bodies[0]).toContain('<ser:getPersona_v2 xmlns:ser="http://a5.soap.ws.server.puc.sr/">');
    expect(bodies[0]).toMatch(
      /<token>TOKEN<\/token>\s*<sign>SIGN<\/sign>\s*<cuitRepresentada>20123456786<\/cuitRepresentada>\s*<idPersona>30712345671<\/idPersona>/,
    );
  });

  it('mapea datos generales, domicilio fiscal, impuestos y actividades', async () => {
    const client = await padron();
    mockFetch(respuesta(ENDPOINTS.a5.namespace, 'getPersona_v2', CONSTANCIA_RI));
    const p = await client.getConstanciaInscripcion('30712345671');
    expect(p).toMatchObject({
      idPersona: '30712345671',
      tipoPersona: 'JURIDICA',
      razonSocial: 'RESTO SA',
      mesCierre: 12,
      domicilioFiscal: { direccion: 'SAN MARTIN 100', codPostal: '5000', idProvincia: 3, localidad: 'CORDOBA' },
    });
    expect(p.impuestos.map((i) => i.idImpuesto)).toEqual([10, 30]);
    expect(p.regimenGeneral?.actividades[0]).toMatchObject({ idActividad: '561011', nomenclador: 883 });
    expect(p.regimenGeneral?.regimenes[0]).toMatchObject({ idRegimen: 214, tipoRegimen: 'RETENCION' });
    expect(p.monotributo).toBeUndefined();
  });

  it('mapea monotributo: categoría e impuesto', async () => {
    const client = await padron();
    mockFetch(respuesta(ENDPOINTS.a5.namespace, 'getPersona_v2', CONSTANCIA_MONO));
    const p = await client.getConstanciaInscripcion('20111111112');
    expect(p.monotributo?.categoria).toEqual({
      idCategoria: 36,
      descripcionCategoria: 'B LOCACIONES DE SERVICIO',
      idImpuesto: 20,
      periodo: 201804,
    });
    expect(p.monotributo?.actividadMonotributista?.idActividad).toBe('8');
    expect(p.impuestos).toEqual([
      { idImpuesto: 20, descripcionImpuesto: 'MONOTRIBUTO', estadoImpuesto: 'AC', motivo: 'Recategorización', periodo: 201803 },
    ]);
  });

  it('mapea errorConstancia', async () => {
    const client = await padron();
    mockFetch(
      respuesta(
        ENDPOINTS.a5.namespace,
        'getPersona_v2',
        '<personaReturn><errorConstancia><apellido>PEREZ</apellido><error>Tu Constancia se encuentra bloqueada.</error>' +
          '<idPersona>20111111112</idPersona><nombre>JUAN</nombre></errorConstancia></personaReturn>',
      ),
    );
    const p = await client.getConstanciaInscripcion('20111111112');
    expect(p.idPersona).toBe('20111111112');
    expect(p.errorConstancia?.error).toEqual(['Tu Constancia se encuentra bloqueada.']);
    expect(condicionIvaDesdePadron(p)).toEqual({
      condicionIva: null,
      motivo: 'ARCA no emitió la constancia: Tu Constancia se encuentra bloqueada..',
    });
  });

  it('pide el ticket de ws_sr_constancia_inscripcion', async () => {
    const client = await padron();
    mockFetch(respuesta(ENDPOINTS.a5.namespace, 'getPersona_v2', CONSTANCIA_RI));
    const spy = vi.spyOn(client.wsaa, 'getAccessTicket');
    await client.getConstanciaInscripcion('30712345671');
    expect(spy).toHaveBeenCalledWith('ws_sr_constancia_inscripcion', expect.anything());
  });
});

describe('A4, A10, A13 y A100 con respuestas reales (personaReturn)', () => {
  it('A4 desenvuelve personaReturn', async () => {
    const client = await padron();
    mockFetch(
      respuesta(
        ENDPOINTS.a4.namespace,
        'getPersona',
        '<personaReturn><metadata><servidor>x</servidor></metadata><persona>' +
          '<estadoClave>ACTIVO</estadoClave><idPersona>30712345671</idPersona><razonSocial>RESTO SA</razonSocial>' +
          '<tipoPersona>JURIDICA</tipoPersona>' +
          '<impuesto><descripcionImpuesto>IVA</descripcionImpuesto><estado>ACTIVO</estado><idImpuesto>30</idImpuesto><periodo>201311</periodo></impuesto>' +
          '</persona></personaReturn>',
      ),
    );
    const p = await client.getPersona('30712345671');
    expect(p.idPersona).toBe('30712345671');
    expect(p.razonSocial).toBe('RESTO SA');
    expect(p.impuesto).toEqual([expect.objectContaining({ idImpuesto: 30, estado: 'ACTIVO' })]);
    expect(condicionIvaDesdePadron(p).condicionIva).toBe(CondicionIva.RESPONSABLE_INSCRIPTO);
  });

  it('A10 desenvuelve personaReturn', async () => {
    const client = await padron();
    mockFetch(
      respuesta(
        ENDPOINTS.a10.namespace,
        'getPersona',
        '<personaReturn><persona><apellido>PEREZ</apellido><idPersona>20111111112</idPersona><nombre>JUAN</nombre>' +
          '<tipoPersona>FISICA</tipoPersona></persona></personaReturn>',
      ),
    );
    const p = await client.getPersonaBasic('20111111112');
    expect(p).toMatchObject({ idPersona: '20111111112', apellido: 'PEREZ', nombre: 'JUAN' });
  });

  it('A13: persona con domicilios', async () => {
    const client = await padron();
    const { bodies } = mockFetch(
      respuesta(
        ENDPOINTS.a13.namespace,
        'getPersona',
        '<personaReturn><persona><apellido>PEREZ</apellido>' +
          '<domicilio><codigoPostal>1414</codigoPostal><direccion>AV SCALABRINI ORTIZ 500</direccion><idProvincia>0</idProvincia>' +
          '<numero>500</numero><tipoDomicilio>FISCAL</tipoDomicilio></domicilio>' +
          '<estadoClave>ACTIVO</estadoClave><idActividadPrincipal>561011</idActividadPrincipal><idPersona>20111111112</idPersona>' +
          '<nombre>JUAN</nombre><tipoPersona>FISICA</tipoPersona></persona></personaReturn>',
      ),
    );
    const p = await client.getPersonaA13('20111111112');
    expect(bodies[0]).toContain('<ser:getPersona xmlns:ser="http://a13.soap.ws.server.puc.sr/">');
    expect(p).toMatchObject({ idPersona: '20111111112', idActividadPrincipal: '561011' });
    expect(p.domicilio).toEqual([
      expect.objectContaining({ codigoPostal: '1414', numero: 500, idProvincia: 0, tipoDomicilio: 'FISCAL' }),
    ]);
  });

  it('A13: CUITs por documento', async () => {
    const client = await padron();
    mockFetch(
      respuesta(
        ENDPOINTS.a13.namespace,
        'getIdPersonaListByDocumento',
        '<idPersonaListReturn><idPersona>20111111112</idPersona><idPersona>27111111117</idPersona>' +
          '<metadata><servidor>x</servidor></metadata></idPersonaListReturn>',
      ),
    );
    expect(await client.getIdPersonaListByDocumento('11111111')).toEqual(['20111111112', '27111111117']);
  });

  it('A100 desenvuelve parameterCollectionReturn (antes devolvía [])', async () => {
    const client = await padron();
    mockFetch(
      respuesta(
        ENDPOINTS.a100.namespace,
        'getParameterCollectionByName',
        '<parameterCollectionReturn><metadata><servidor>x</servidor></metadata><parameterCollection>' +
          '<name>SUPA.E_PROVINCIA</name>' +
          '<parameterList><description>CORDOBA</description><id>3</id></parameterList>' +
          '<parameterList><description>SANTA FE</description><id>12</id></parameterList>' +
          '</parameterCollection></parameterCollectionReturn>',
      ),
    );
    const params = await client.getParametros('SUPA.E_PROVINCIA');
    expect(params).toEqual([
      { id: '3', descripcion: 'CORDOBA', atributos: undefined },
      { id: '12', descripcion: 'SANTA FE', atributos: undefined },
    ]);
  });

  it('el signal global de la config cancela las consultas', async () => {
    const controller = new AbortController();
    const storage = new MemoryTicketStorage();
    const client = new ArcaPadron({ cert: 'C', key: 'K', cuit: '20123456786', ticketStorage: storage, signal: controller.signal });
    await storage.set(client.wsaa.ticketKey('ws_sr_padron_a13'), {
      token: 'T',
      sign: 'S',
      expirationTime: new Date(Date.now() + 3_600_000).toISOString(),
    });
    const { fn } = mockFetch(respuesta(ENDPOINTS.a13.namespace, 'getPersona', '<personaReturn/>'));
    controller.abort();
    const err = await client.getPersonaA13('20111111112').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ArcaSoapError);
    expect((err as ArcaSoapError).aborted).toBe(true);
    expect((err as ArcaSoapError).uncertain).toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });
});
