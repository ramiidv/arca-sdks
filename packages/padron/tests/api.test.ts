/**
 * Superficie pública de la API uniforme: forma de `ENDPOINTS`, `NAMESPACES` y
 * `SERVICE_IDS`, configuración de los clientes de bajo nivel
 * (`{ endpoint, transport? }`) y exports quitados.
 */
import type { ArcaEvent, ServiceEndpoints } from '@ramiidv/arca-common';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import * as api from '../src/index.js';
import {
  ENDPOINTS,
  EstadoClave,
  NAMESPACES,
  PadronA4Client,
  PadronA5Client,
  PadronA10Client,
  PadronA13Client,
  PadronA100Client,
  SERVICE_IDS,
  TipoDomicilio,
} from '../src/index.js';
import type { ArcaPadronConfig, PadronClientConfig, PadronServicio } from '../src/index.js';
import { mockFetch, padron, respuesta } from './helpers.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const SERVICIOS: PadronServicio[] = ['a5', 'a4', 'a10', 'a13', 'a100'];
const DUMMY_OK = '<return><appserver>OK</appserver><authserver>OK</authserver><dbserver>OK</dbserver></return>';

describe('ENDPOINTS', () => {
  it('tiene un ServiceEndpoints (solo URLs) por servicio y no incluye wsaa', () => {
    expect(Object.keys(ENDPOINTS).sort()).toEqual([...SERVICIOS].sort());
    for (const svc of SERVICIOS) {
      const e: ServiceEndpoints = ENDPOINTS[svc];
      expect(Object.keys(e).sort()).toEqual(['production', 'testing']);
      expect(e.testing).toMatch(/^https:\/\/awshomo\.afip\.gov\.ar\//);
      expect(e.production).toMatch(/^https:\/\/aws\.afip\.gov\.ar\//);
    }
    expect('wsaa' in ENDPOINTS).toBe(false);
  });

  it('NAMESPACES y SERVICE_IDS tienen las mismas claves que ENDPOINTS', () => {
    expect(Object.keys(NAMESPACES).sort()).toEqual(Object.keys(ENDPOINTS).sort());
    expect(Object.keys(SERVICE_IDS).sort()).toEqual(Object.keys(ENDPOINTS).sort());
    expect(SERVICE_IDS.a5).toBe('ws_sr_constancia_inscripcion');
    expect(NAMESPACES.a100).toBe('http://a100.soap.ws.server.pucParam.sr/');
  });

  it('PadronServicio son las claves de ENDPOINTS', () => {
    expectTypeOf<PadronServicio>().toEqualTypeOf<'a5' | 'a4' | 'a10' | 'a13' | 'a100'>();
  });

  it('las claves de config.endpoints son las de ENDPOINTS (más wsaa)', () => {
    type Claves = keyof NonNullable<ArcaPadronConfig['endpoints']>;
    expectTypeOf<Claves>().toEqualTypeOf<keyof typeof ENDPOINTS | 'wsaa'>();
  });
});

describe('clientes de bajo nivel: { endpoint, transport? }', () => {
  const clientes = [
    ['a5', PadronA5Client],
    ['a4', PadronA4Client],
    ['a10', PadronA10Client],
    ['a13', PadronA13Client],
    ['a100', PadronA100Client],
  ] as const;

  it.each(clientes)('%s fija su namespace y usa el endpoint indicado', (svc, Cliente) => {
    const client = new Cliente({ endpoint: 'https://proxy.local/padron' });
    expect(client.endpoint).toBe('https://proxy.local/padron');
    expect(client.namespace).toBe(NAMESPACES[svc]);
  });

  it('la config es ServiceClientConfig (sin namespace, soapOptions ni onEvent)', () => {
    expectTypeOf<PadronClientConfig>().toEqualTypeOf<import('@ramiidv/arca-common').ServiceClientConfig>();
    expectTypeOf<api.ServiceClientConfig>().toEqualTypeOf<import('@ramiidv/arca-common').ServiceClientConfig>();
    expectTypeOf<api.ServiceTransport>().toEqualTypeOf<import('@ramiidv/arca-common').ServiceTransport>();
    expectTypeOf<api.ServiceEndpoints>().toEqualTypeOf<ServiceEndpoints>();
    // @ts-expect-error: el namespace lo fija cada cliente
    new PadronA4Client({ endpoint: 'https://x', namespace: 'http://otro/' });
    // @ts-expect-error: soapOptions se reemplazó por transport
    new PadronA4Client({ endpoint: 'https://x', soapOptions: { timeout: 1 } });
  });

  it('usa el transport (eventos, fetch) en cada llamada', async () => {
    const eventos: ArcaEvent[] = [];
    const fetch = vi.fn(async () => respuesta(NAMESPACES.a13, 'dummy', DUMMY_OK));
    const client = new PadronA13Client({
      endpoint: 'https://proxy.local/a13',
      transport: { fetch, retries: 0, onEvent: (e) => eventos.push(e) },
    });
    const status = await client.dummy();
    expect(status).toEqual({ appserver: 'OK', dbserver: 'OK', authserver: 'OK' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]).toContain('https://proxy.local/a13');
    expect(eventos.map((e) => e.type)).toContain('request:end');
  });
});

describe('ArcaPadron arma los clientes con ENDPOINTS y config.endpoints', () => {
  it('usa los de homologación por defecto y los propios si se indican', async () => {
    const client = await padron({ endpoints: { a4: 'https://proxy.local/a4' } });
    expect(client.a4.endpoint).toBe('https://proxy.local/a4');
    expect(client.a5.endpoint).toBe(ENDPOINTS.a5.testing);
    for (const svc of SERVICIOS) expect(client[svc].namespace).toBe(NAMESPACES[svc]);
  });

  it('en producción usa los endpoints de producción', async () => {
    const client = await padron({ production: true });
    for (const svc of SERVICIOS) expect(client[svc].endpoint).toBe(ENDPOINTS[svc].production);
  });

  it('los clientes reciben el transporte de la config (onEvent incluido)', async () => {
    const eventos: ArcaEvent[] = [];
    const client = await padron({ onEvent: (e) => eventos.push(e), retries: 0 });
    mockFetch(respuesta(NAMESPACES.a10, 'dummy', DUMMY_OK));
    await client.a10.dummy();
    expect(eventos.some((e) => e.type === 'request:end')).toBe(true);
  });
});

describe('exports quitados', () => {
  it('ya no re-exporta ensureArray, parseXml ni buildXml (importarlos de arca-common)', () => {
    expect('ensureArray' in api).toBe(false);
    expect('parseXml' in api).toBe(false);
    expect('buildXml' in api).toBe(false);
  });

  it('TipoDomicilio sin LEGAL/REAL sueltos y EstadoClave sin LIMITADO', () => {
    expect(Object.values(TipoDomicilio)).toEqual(['FISCAL', 'LEGAL/REAL', 'LOCALES Y ESTABLECIMIENTOS']);
    expect(Object.values(EstadoClave)).toEqual(['ACTIVO', 'INACTIVO']);
  });
});

describe('respuesta inválida', () => {
  it('ArcaPadronError es un ArcaResponseError (uncertain: false)', async () => {
    const client = await padron({ retries: 0 });
    mockFetch(respuesta(NAMESPACES.a4, 'getPersona', '<personaReturn/>'));
    const err = await client.getPersona('20111111112').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(api.ArcaPadronError);
    expect(err).toBeInstanceOf(api.ArcaResponseError);
    expect((err as InstanceType<typeof api.ArcaResponseError>).uncertain).toBe(false);
  });
});
