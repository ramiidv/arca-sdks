/**
 * Integración contra ARCA homologación (Padrón).
 *
 * Corre solo si están definidas ARCA_TEST_CERT, ARCA_TEST_KEY (contenido PEM o
 * ruta) y ARCA_TEST_CUIT. El estado del servicio no requiere autenticación;
 * las consultas autenticadas corren solo si ARCA_TEST_SERVICES (lista separada
 * por comas) incluye "ws_sr_padron_a100": el certificado tiene que estar autorizado en ese
 * servicio. Ver `.github/workflows/integracion.yml`.
 */
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileTicketStorage } from '@ramiidv/arca-common';
import { describe, expect, it } from 'vitest';
import { ArcaPadron, CollectionName } from '../../src/index.js';

const env = process.env;
const habilitado = Boolean(env.ARCA_TEST_CERT && env.ARCA_TEST_KEY && env.ARCA_TEST_CUIT);
const servicios = new Set((env.ARCA_TEST_SERVICES ?? '').split(',').map((s) => s.trim()));
const pem = (value: string) => (value.includes('-----BEGIN') ? value : readFileSync(value, 'utf8'));

/** El storage se conserva entre corridas: WSAA rechaza un login nuevo mientras el ticket anterior siga vigente. */
const sdk = () =>
  new ArcaPadron({
    cuit: env.ARCA_TEST_CUIT!,
    cert: pem(env.ARCA_TEST_CERT!),
    key: pem(env.ARCA_TEST_KEY!),
    production: false,
    ticketStorage: new FileTicketStorage(env.ARCA_TEST_TICKETS_DIR ?? join(tmpdir(), 'arca-test-tickets')),
  });

describe.skipIf(!habilitado)('integración Padrón (homologación)', { timeout: 120_000 }, () => {
  it('status (dummy de cada servicio)', async () => {
    expect(Object.keys(await sdk().status()).sort()).toEqual(['a10', 'a100', 'a13', 'a4', 'a5']);
  });

  it.skipIf(!servicios.has('ws_sr_padron_a100'))('getParametros (A100, provincias)', async () => {
    expect((await sdk().getParametros(CollectionName.PROVINCIA)).length).toBeGreaterThan(0);
  });
});
