/**
 * Casos borde de las respuestas: CUIT inexistente en la constancia, consultas
 * por lote con CUITs inválidas, `metadata`, Faults de negocio y `status`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArcaSoapError, ArcaValidationError } from '@ramiidv/arca-common';
import { ENDPOINTS, NAMESPACES } from '../src/constants.js';
import { ArcaPadronError, ArcaPadronServiceError } from '../src/errors.js';
import { normalizarDocumento } from '../src/padron-a13.js';
import { fault, mockFetch, namespaceDe, padron, requestBody, respuesta } from './helpers.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const A5 = NAMESPACES.a5;
const METADATA = '<metadata><fechaHora>2026-02-26T15:52:37.653-03:00</fechaHora><servidor>qa</servidor></metadata>';
const persona = (cuit: string) =>
  `<persona><datosGenerales><idPersona>${cuit}</idPersona><tipoPersona>FISICA</tipoPersona></datosGenerales></persona>`;

describe('constancia: CUIT inexistente informada en errorConstancia', () => {
  it('getConstanciaInscripcion lanza ArcaPadronServiceError inexistente', async () => {
    const client = await padron();
    mockFetch(
      respuesta(
        A5,
        'getPersona_v2',
        '<personaReturn><errorConstancia><error>No existe persona con ese Id</error>' +
          `<idPersona>20111111112</idPersona></errorConstancia>${METADATA}</personaReturn>`,
      ),
    );
    const err = await client.getConstanciaInscripcion('20111111112').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ArcaPadronServiceError);
    expect(err).toMatchObject({
      reason: 'inexistente',
      errors: [{ code: 0, msg: 'No existe persona con ese Id' }],
    });
  });

  it('otros errorConstancia (CUIT limitada) se devuelven, no se lanzan', async () => {
    const client = await padron();
    mockFetch(
      respuesta(
        A5,
        'getPersona_v2',
        '<personaReturn><datosGenerales><estadoClave>ACTIVO</estadoClave><idPersona>20111111112</idPersona>' +
          '<tipoPersona>FISICA</tipoPersona></datosGenerales>' +
          '<errorConstancia><error>La CUIT del contribuyente fue limitada en los términos de la RG AFIP 3832/16.</error>' +
          '</errorConstancia></personaReturn>',
      ),
    );
    const p = await client.getConstanciaInscripcion('20111111112');
    expect(p.errorConstancia?.error[0]).toMatch(/RG AFIP 3832/);
  });

  it('getPersona_v2Response vacío → ArcaPadronError', async () => {
    const client = await padron();
    mockFetch(respuesta(A5, 'getPersona_v2', ''));
    await expect(client.getConstanciaInscripcion('20111111112')).rejects.toBeInstanceOf(ArcaPadronError);
  });
});

describe('getPersonaList_v2: una CUIT no hace fallar el lote', () => {
  it('las CUITs inválidas no se envían y vuelven con errorConstancia, en el orden pedido', async () => {
    const client = await padron();
    const cap = mockFetch(
      respuesta(
        A5,
        'getPersonaList_v2',
        `<personaListReturn>${METADATA}${persona('20224107030')}${persona('20111111112')}</personaListReturn>`,
      ),
    );
    const list = await client.getConstanciasInscripcion(['20111111112', '20-11111111-3', 'abc', '20224107030']);

    expect(requestBody(cap.bodies[0], 'getPersonaList_v2')['idPersona']).toEqual(['20111111112', '20224107030']);
    expect(list.map((p) => p.idPersona)).toEqual(['20111111112', '20-11111111-3', 'abc', '20224107030']);
    expect(list[0].errorConstancia).toBeUndefined();
    expect(list[1].errorConstancia?.error[0]).toMatch(/Dígito verificador incorrecto.*No se consultó a ARCA\.$/);
    expect(list[2].errorConstancia?.error[0]).toMatch(/11 dígitos/);
    expect(list[1].impuestos).toEqual([]);
  });

  it('si todas son inválidas no llama a ARCA', async () => {
    const client = await padron();
    const cap = mockFetch(respuesta(A5, 'getPersonaList_v2', '<personaListReturn/>'));
    const list = await client.getConstanciasInscripcion(['20111111113']);
    expect(list).toHaveLength(1);
    expect(list[0].errorConstancia?.error[0]).toMatch(/CUIT inválido/);
    expect(cap.fn).not.toHaveBeenCalled();
  });

  it('una persona con datos inválidos vuelve con el error; sin ninguna CUIT se omite', async () => {
    const client = await padron();
    mockFetch(
      respuesta(
        A5,
        'getPersonaList_v2',
        '<personaListReturn>' +
          // sin idImpuesto (obligatorio para el SDK)
          '<persona><datosGenerales><idPersona>20224107030</idPersona></datosGenerales>' +
          '<datosRegimenGeneral><impuesto><descripcionImpuesto>IVA</descripcionImpuesto></impuesto></datosRegimenGeneral></persona>' +
          // sin idPersona: no se puede atribuir
          '<persona><datosGenerales><tipoPersona>FISICA</tipoPersona></datosGenerales></persona>' +
          persona('27111111117') +
          '</personaListReturn>',
      ),
    );
    const list = await client.getConstanciasInscripcion(['20224107030', '20111111112', '27111111117']);
    expect(list.map((p) => p.idPersona)).toEqual(['20224107030', '27111111117']);
    expect(list[0].errorConstancia?.error[0]).toMatch(
      /Respuesta inválida de ARCA: falta getPersonaList_v2\.personaListReturn\.persona\[0\]\.datosRegimenGeneral\.impuesto\[0\]\.idImpuesto/,
    );
    expect(list[1].errorConstancia).toBeUndefined();
  });
});

describe('metadata de las respuestas', () => {
  it('constancia y A4: metadata en la persona', async () => {
    const client = await padron();
    mockFetch(
      respuesta(
        A5,
        'getPersona_v2',
        `<personaReturn><datosGenerales><idPersona>20111111112</idPersona></datosGenerales>${METADATA}</personaReturn>`,
      ),
    );
    const c = await client.getConstanciaInscripcion('20111111112');
    expect(c.metadata).toEqual({ fechaHora: '2026-02-26T15:52:37.653-03:00', servidor: 'qa' });

    mockFetch(
      respuesta(
        NAMESPACES.a4,
        'getPersona',
        `<personaReturn>${METADATA}<persona><idPersona>20111111112</idPersona><tipoPersona>FISICA</tipoPersona></persona></personaReturn>`,
      ),
    );
    expect((await client.getPersona('20111111112')).metadata?.servidor).toBe('qa');
  });

  it('sin metadata no agrega la propiedad', async () => {
    const client = await padron();
    mockFetch(
      respuesta(
        NAMESPACES.a10,
        'getPersona',
        '<personaReturn><persona><idPersona>20111111112</idPersona><tipoPersona>FISICA</tipoPersona></persona></personaReturn>',
      ),
    );
    expect('metadata' in (await client.getPersonaBasic('20111111112'))).toBe(false);
  });

  it('listas: metadata no enumerable en el array (lote, A13 por documento, A100)', async () => {
    const client = await padron();
    mockFetch(
      respuesta(A5, 'getPersonaList_v2', `<personaListReturn>${METADATA}${persona('20111111112')}</personaListReturn>`),
    );
    const lote = await client.getConstanciasInscripcion(['20111111112']);
    expect(lote.metadata?.servidor).toBe('qa');
    expect(Object.keys(lote)).toEqual(['0']);
    expect(JSON.stringify(lote)).not.toContain('metadata');

    mockFetch(
      respuesta(
        NAMESPACES.a13,
        'getIdPersonaListByDocumento',
        `<idPersonaListReturn><idPersona>20111111112</idPersona>${METADATA}</idPersonaListReturn>`,
      ),
    );
    const ids = await client.getIdPersonaListByDocumento('11111111');
    expect(ids).toEqual(['20111111112']);
    expect(ids.metadata?.fechaHora).toBe('2026-02-26T15:52:37.653-03:00');

    mockFetch(
      respuesta(
        NAMESPACES.a100,
        'getParameterCollectionByName',
        `<parameterCollectionReturn>${METADATA}<parameterCollection><parameterList><description>X</description><id>1</id>` +
          '</parameterList></parameterCollection></parameterCollectionReturn>',
      ),
    );
    const tabla = await client.getParametros('SUPA.X');
    expect(tabla).toEqual([{ id: '1', descripcion: 'X', atributos: undefined }]);
    expect(tabla.metadata?.servidor).toBe('qa');
  });
});

describe('Faults de negocio: textos de los manuales', () => {
  it.each([
    'Debe enviar la CUIT representada',
    'Este token no le permite actuar en representacion de la CUIT 20123456786',
    'Falta token y/o sign.',
    'No autorizado, par token/sign invalido.',
  ])('"%s" → no_autorizado', async (msg) => {
    const client = await padron();
    mockFetch(fault(msg));
    await expect(client.getPersonaA13('20111111112')).rejects.toMatchObject({
      name: 'ArcaPadronServiceError',
      reason: 'no_autorizado',
    });
  });

  it('"El Id de la persona no es valido" → id_invalido', async () => {
    const client = await padron();
    mockFetch(fault('El Id de la persona no es valido'));
    await expect(client.getPersona('20111111112')).rejects.toMatchObject({ reason: 'id_invalido' });
  });

  it('getPersonaV2 (A13) con CUIT inexistente → inexistente', async () => {
    const client = await padron();
    mockFetch(fault('La Clave (CUIT/CUIL) consultada es inexistente'));
    await expect(client.getPersonaA13V2('20111111112')).rejects.toMatchObject({ reason: 'inexistente' });
  });
});

describe('validaciones locales', () => {
  it('normalizarDocumento: más de 11 dígitos o vacío → ArcaValidationError', () => {
    expect(normalizarDocumento('11.709.676')).toBe('11709676');
    expect(() => normalizarDocumento('123456789012')).toThrow(ArcaValidationError);
    expect(() => normalizarDocumento('')).toThrow(ArcaValidationError);
  });

  it('getParametros con collectionName vacío no llama a ARCA', async () => {
    const client = await padron();
    const cap = mockFetch(respuesta(NAMESPACES.a100, 'getParameterCollectionByName', ''));
    await expect(client.getParametros('')).rejects.toBeInstanceOf(ArcaValidationError);
    await expect(client.getParametros('   ')).rejects.toBeInstanceOf(ArcaValidationError);
    expect(cap.fn).not.toHaveBeenCalled();
  });
});

describe('status: un servidor en ERROR', () => {
  it('ok: false con el status informado por ARCA', async () => {
    const client = await padron({ retries: 0 });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const ns = namespaceDe(url);
        const db = url === ENDPOINTS.a13.testing ? 'ERROR' : 'OK';
        return respuesta(
          ns,
          'dummy',
          `<return><appserver>OK</appserver><authserver>OK</authserver><dbserver>${db}</dbserver></return>`,
        );
      }),
    );
    const s = await client.status();
    expect(s.a4.ok).toBe(true);
    expect(s.a13.ok).toBe(false);
    if (!s.a13.ok) {
      expect(s.a13.status).toEqual({ appserver: 'OK', authserver: 'OK', dbserver: 'ERROR' });
      expect(s.a13.error).toBeInstanceOf(Error);
      expect(s.a13.error).not.toBeInstanceOf(ArcaSoapError);
    }
  });
});
