/**
 * Opciones de transporte que cada servicio le pasa a `afipSoapCall` de
 * arca-common (vía `SoapServiceClient.soapCall`): el A100 (y el resto) ya no
 * inyecta un `fetch` propio, así que conserva el fallback TLS legacy de
 * arca-common.
 */
import { SoapServiceClient } from '@ramiidv/arca-common';
import type { AfipSoapCallOptions } from '@ramiidv/arca-common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENDPOINTS } from '../src/constants.js';
import { mockFetch, padron, respuesta } from './helpers.js';

type SoapCall = (method: string, params: Record<string, unknown>, opts?: object) => Promise<Record<string, unknown>>;
const proto = SoapServiceClient.prototype as unknown as { soapCall: SoapCall };
const spy = vi.spyOn(proto, 'soapCall');

/** Opciones con las que `soapCall` llama a `afipSoapCall`: transporte del cliente + opciones de la llamada. */
function afipOpts(i: number): AfipSoapCallOptions {
  const ctx = spy.mock.contexts[i] as unknown as { transport: object };
  return { ...ctx.transport, ...spy.mock.calls[i][2] } as AfipSoapCallOptions;
}

afterEach(() => {
  vi.unstubAllGlobals();
  spy.mockClear();
});

const COLECCION =
  '<parameterCollectionReturn><parameterCollection><name>SUPA.X</name>' +
  '<parameterList><attributeList><name>ALICUOTA</name><value>10.50</value></attributeList>' +
  '<description>ALICUOTA</description><id>1E3</id></parameterList></parameterCollection></parameterCollectionReturn>';

describe('transporte: sin fetch propio y parseNumbers: false', () => {
  it('A100 no inyecta fetch (conserva el fallback TLS legacy) y pide parseNumbers: false', async () => {
    const client = await padron();
    const { fn } = mockFetch(respuesta(ENDPOINTS.a100.namespace, 'getParameterCollectionByName', COLECCION));
    const params = await client.getParametros('SUPA.X');

    expect(params).toEqual([{ id: '1E3', descripcion: 'ALICUOTA', atributos: [{ name: 'ALICUOTA', value: '10.50' }] }]);
    expect(spy).toHaveBeenCalledTimes(1);
    const opts = afipOpts(0);
    expect(opts?.fetch).toBeUndefined();
    expect(opts?.parseNumbers).toBe(false);
    // El request sale por globalThis.fetch sin envoltorio.
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("A100 con legacyTls: 'always' pasa la opción tal cual y sin fetch", async () => {
    const client = await padron({ legacyTls: 'always' });
    spy.mockResolvedValueOnce({
      parameterCollection: { name: 'SUPA.X', parameterList: { description: 'X', id: '007' } },
    });
    expect(await client.getParametros('SUPA.X')).toEqual([{ id: '007', descripcion: 'X', atributos: undefined }]);
    const opts = afipOpts(0);
    expect(opts?.legacyTls).toBe('always');
    expect(opts?.fetch).toBeUndefined();
    expect(opts?.parseNumbers).toBe(false);
  });

  it('con un fetch en la config, se usa ese (no uno envuelto)', async () => {
    const fetch = vi.fn(async () => respuesta(ENDPOINTS.a100.namespace, 'getParameterCollectionByName', COLECCION));
    const client = await padron({ fetch });
    await client.getParametros('SUPA.X');
    expect(afipOpts(0).fetch).toBe(fetch);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('el resto de los servicios (BasePadronClient.call) también pide parseNumbers: false', async () => {
    const client = await padron();
    mockFetch(
      respuesta(
        ENDPOINTS.a10.namespace,
        'getPersona',
        '<personaReturn><persona><idPersona>20000000516</idPersona><tipoPersona>FISICA</tipoPersona></persona></personaReturn>',
      ),
    );
    await client.getPersonaBasic('20000000516');
    expect(afipOpts(spy.mock.calls.length - 1).parseNumbers).toBe(false);
  });
});
