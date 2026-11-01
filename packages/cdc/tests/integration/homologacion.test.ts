/**
 * Integración contra ARCA homologación (WSCDC).
 *
 * Corre solo si están definidas ARCA_TEST_CERT, ARCA_TEST_KEY (contenido PEM o
 * ruta) y ARCA_TEST_CUIT. El estado del servicio no requiere autenticación;
 * las consultas autenticadas corren solo si ARCA_TEST_SERVICES (lista separada
 * por comas) incluye "wscdc": el certificado tiene que estar autorizado en ese
 * servicio. Ver `.github/workflows/integracion.yml`.
 */
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileTicketStorage } from '@ramiidv/arca-common';
import { describe, expect, it } from 'vitest';
import { ArcaCdc } from '../../src/index.js';

const env = process.env;
const habilitado = Boolean(env.ARCA_TEST_CERT && env.ARCA_TEST_KEY && env.ARCA_TEST_CUIT);
const servicios = new Set((env.ARCA_TEST_SERVICES ?? '').split(',').map((s) => s.trim()));
const pem = (value: string) => (value.includes('-----BEGIN') ? value : readFileSync(value, 'utf8'));

/** El storage se conserva entre corridas: WSAA rechaza un login nuevo mientras el ticket anterior siga vigente. */
const sdk = () =>
  new ArcaCdc({
    cuit: env.ARCA_TEST_CUIT!,
    cert: pem(env.ARCA_TEST_CERT!),
    key: pem(env.ARCA_TEST_KEY!),
    production: false,
    ticketStorage: new FileTicketStorage(env.ARCA_TEST_TICKETS_DIR ?? join(tmpdir(), 'arca-test-tickets')),
  });

describe.skipIf(!habilitado)('integración WSCDC (homologación)', { timeout: 120_000 }, () => {
  it('status (ComprobanteDummy)', async () => {
    expect(await sdk().status()).toEqual({ appserver: 'OK', dbserver: 'OK', authserver: 'OK' });
  });

  it.skipIf(!servicios.has('wscdc'))('getTiposCbte', async () => {
    expect((await sdk().getTiposCbte()).length).toBeGreaterThan(0);
  });
});
