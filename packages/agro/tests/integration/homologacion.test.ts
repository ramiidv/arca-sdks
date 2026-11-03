/**
 * Integración contra ARCA homologación (WSCPE/WSLPG).
 *
 * Corre solo si están definidas ARCA_TEST_CERT, ARCA_TEST_KEY (contenido PEM o
 * ruta) y ARCA_TEST_CUIT. El estado del servicio no requiere autenticación;
 * las consultas autenticadas corren solo si ARCA_TEST_SERVICES (lista separada
 * por comas) incluye "wscpe" o "wslpg": el certificado tiene que estar autorizado en ese
 * servicio. Ver "Desarrollo" en el README raíz (`.env` local).
 */
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileTicketStorage } from '@ramiidv/arca-common';
import { describe, expect, it } from 'vitest';
import { ArcaAgro } from '../../src/index.js';

const env = process.env;
const habilitado = Boolean(env.ARCA_TEST_CERT && env.ARCA_TEST_KEY && env.ARCA_TEST_CUIT);
const servicios = new Set((env.ARCA_TEST_SERVICES ?? '').split(',').map((s) => s.trim()));
const pem = (value: string) => (value.includes('-----BEGIN') ? value : readFileSync(value, 'utf8'));

/** El storage se conserva entre corridas: WSAA rechaza un login nuevo mientras el ticket anterior siga vigente. */
const sdk = () =>
  new ArcaAgro({
    cuit: env.ARCA_TEST_CUIT!,
    cert: pem(env.ARCA_TEST_CERT!),
    key: pem(env.ARCA_TEST_KEY!),
    production: false,
    ticketStorage: new FileTicketStorage(env.ARCA_TEST_TICKETS_DIR ?? join(tmpdir(), 'arca-test-tickets')),
  });

describe.skipIf(!habilitado)('integración WSCPE/WSLPG (homologación)', { timeout: 120_000 }, () => {
  it('status (dummy de WSCPE y WSLPG)', async () => {
    const s = await sdk().status();
    expect(s.cpe.ok).toBe(true);
    expect(s.lpg.ok).toBe(true);
  });

  it.skipIf(!servicios.has('wscpe'))('WSCPE: consultarProvincias', async () => {
    expect((await sdk().cpe.consultarProvincias()).length).toBeGreaterThan(0);
  });

  it.skipIf(!servicios.has('wslpg'))('WSLPG: tipoGranoConsultar', async () => {
    expect((await sdk().lpg.tipoGranoConsultar()).length).toBeGreaterThan(0);
  });
});
