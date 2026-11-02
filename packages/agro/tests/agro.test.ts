import { testCert } from '@ramiidv/arca-common/testing';
import { describe, it, expect, vi } from 'vitest';
import { ArcaAgro, ArcaSoapError, ArcaValidationError, WSAA_SERVICES } from '../src/index.js';
import type { ArcaEvent, TicketStorage } from '../src/index.js';
import { CPE_NS, LPG_NS, cpeResp, http503, lpgResp, setup, ticketStorage } from './helpers.js';

const CPE_DUMMY = cpeResp('DummyResp', '<appserver>Ok</appserver><authserver>Ok</authserver><dbserver>Ok</dbserver>');
const LPG_DUMMY = lpgResp(
  'dummyResp',
  'return',
  '<appserver>OK</appserver><authserver>OK</authserver><dbserver>OK</dbserver>',
);

describe('ArcaAgro', () => {
  it('rechaza un CUIT con dígito verificador inválido', () => {
    expect(() => new ArcaAgro({ cuit: 20123456789, ...testCert() })).toThrow(ArcaValidationError);
  });

  it('status usa allSettled: una falla no oculta el otro servicio', async () => {
    const { agro } = setup((call) => (call.url.includes('wscpe') ? CPE_DUMMY : http503()), { retries: 0 });
    const r = await agro.status();
    expect(r.cpe).toEqual({ ok: true, status: { appserver: 'Ok', authserver: 'Ok', dbserver: 'Ok' } });
    expect(r.lpg.ok).toBe(false);
    expect(!r.lpg.ok && r.lpg.error).toBeInstanceOf(ArcaSoapError);
  });

  it('status con ambos servicios OK', async () => {
    const { agro, calls } = setup((call) => (call.url.includes('wscpe') ? CPE_DUMMY : LPG_DUMMY));
    const r = await agro.status();
    expect(r.cpe.ok && r.lpg.ok).toBe(true);
    expect(calls.map((c) => c.soapAction).sort()).toEqual([`"${LPG_NS}dummy"`, `"${CPE_NS}dummy"`]);
  });

  it('clearAuthCache espera el borrado en el ticketStorage de ambos servicios', async () => {
    const deleted: string[] = [];
    const storage: TicketStorage = {
      get: ticketStorage.get,
      set: async () => {},
      delete: async (key) => {
        await new Promise((r) => setTimeout(r, 5));
        deleted.push(key);
      },
    };
    const agro = new ArcaAgro({ cuit: '20123456786', ...testCert(), ticketStorage: storage });
    await agro.clearAuthCache();
    expect(deleted).toHaveLength(2);
    expect(deleted.some((k) => k.endsWith(WSAA_SERVICES.cpe))).toBe(true);
    expect(deleted.some((k) => k.endsWith(WSAA_SERVICES.lpg))).toBe(true);
  });

  it('emite eventos por onEvent y on(); un handler que falla no rompe la llamada', async () => {
    const onEvent = vi.fn((_e: ArcaEvent) => {
      throw new Error('logger roto');
    });
    const { agro } = setup(() => CPE_DUMMY, { onEvent });
    const ends: ArcaEvent[] = [];
    agro.on('request:end', (e) => ends.push(e));
    agro.on('request:start', () => {
      throw new Error('handler roto');
    });
    await agro.cpe.dummy();
    expect(onEvent).toHaveBeenCalled();
    expect(ends).toHaveLength(1);
  });

  it('los internos de los sub-clientes no son accesibles', () => {
    const { agro } = setup(() => '');
    expect((agro.cpe as unknown as Record<string, unknown>)['getAuth']).toBeUndefined();
    // Sólo los campos de SoapServiceClient / ArcaSdkBase: el contexto (getTicket, cuit) queda privado.
    expect(Object.keys(agro.cpe)).toEqual(['endpoint', 'namespace', 'transport']);
    expect(Object.keys(agro.lpg)).toEqual(['endpoint', 'namespace', 'transport']);
    expect(Object.keys(agro)).toEqual(['wsaa', 'cuit', 'production', 'transport', 'cpe', 'lpg']);
  });

  it('el signal aborta antes de enviar', async () => {
    const { agro, fetchMock } = setup(() => CPE_DUMMY);
    const ctrl = new AbortController();
    ctrl.abort();
    const e = await agro.cpe.consultarProvincias({ signal: ctrl.signal }).catch((err) => err);
    expect(e).toBeInstanceOf(Error);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('config.signal global aborta todas las llamadas', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const { agro, fetchMock } = setup(() => CPE_DUMMY, { signal: ctrl.signal });
    await expect(agro.cpe.dummy()).rejects.toBeInstanceOf(Error);
    await expect(agro.lpg.dummy()).rejects.toBeInstanceOf(Error);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('config.wsaa comparte el cliente WSAA', () => {
    const { agro } = setup(() => CPE_DUMMY);
    const otro = new ArcaAgro({ cuit: '20123456786', ...testCert(), wsaa: agro.wsaa });
    expect(otro.wsaa).toBe(agro.wsaa);
    expect(otro.cuit).toBe('20123456786');
  });
});
