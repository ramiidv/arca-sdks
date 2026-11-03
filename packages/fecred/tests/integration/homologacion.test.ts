/**
 * Integración contra ARCA homologación (WSFECRED).
 *
 * Corre solo si están definidas ARCA_TEST_CERT, ARCA_TEST_KEY (contenido PEM o
 * ruta) y ARCA_TEST_CUIT. El estado del servicio no requiere autenticación;
 * las consultas autenticadas corren solo si ARCA_TEST_SERVICES (lista separada
 * por comas) incluye "wsfecred": el certificado tiene que estar autorizado en ese
 * servicio. Ver "Desarrollo" en el README raíz (`.env` local).
 */
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileTicketStorage } from '@ramiidv/arca-common';
import { describe, expect, it } from 'vitest';
import { ArcaFecred } from '../../src/index.js';

const env = process.env;
const habilitado = Boolean(env.ARCA_TEST_CERT && env.ARCA_TEST_KEY && env.ARCA_TEST_CUIT);
const servicios = new Set((env.ARCA_TEST_SERVICES ?? '').split(',').map((s) => s.trim()));
const pem = (value: string) => (value.includes('-----BEGIN') ? value : readFileSync(value, 'utf8'));

/** El storage se conserva entre corridas: WSAA rechaza un login nuevo mientras el ticket anterior siga vigente. */
const sdk = () =>
  new ArcaFecred({
    cuit: env.ARCA_TEST_CUIT!,
    cert: pem(env.ARCA_TEST_CERT!),
    key: pem(env.ARCA_TEST_KEY!),
    production: false,
    ticketStorage: new FileTicketStorage(env.ARCA_TEST_TICKETS_DIR ?? join(tmpdir(), 'arca-test-tickets')),
  });

describe.skipIf(!habilitado)('integración WSFECRED (homologación)', { timeout: 120_000 }, () => {
  it('status (dummy)', async () => {
    expect(await sdk().status()).toEqual({ appserver: 'OK', dbserver: 'OK', authserver: 'OK' });
  });

  it.skipIf(!servicios.has('wsfecred'))('consultarTiposRetenciones', async () => {
    expect((await sdk().consultarTiposRetenciones()).length).toBeGreaterThan(0);
  });
});
