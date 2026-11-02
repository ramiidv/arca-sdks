/**
 * Integración contra ARCA homologación (SIRE).
 *
 * Corre solo si están definidas ARCA_TEST_CERT, ARCA_TEST_KEY (contenido PEM o
 * ruta) y ARCA_TEST_CUIT. Solo verifica el estado del servicio (no requiere
 * autenticación): SIRE no tiene consultas, y emitir o anular un certificado
 * cambia estado en ARCA. Ver `.github/workflows/integracion.yml`.
 */
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileTicketStorage } from '@ramiidv/arca-common';
import { describe, expect, it } from 'vitest';
import { ArcaSire } from '../../src/index.js';

const env = process.env;
const habilitado = Boolean(env.ARCA_TEST_CERT && env.ARCA_TEST_KEY && env.ARCA_TEST_CUIT);
const pem = (value: string) => (value.includes('-----BEGIN') ? value : readFileSync(value, 'utf8'));

/** El storage se conserva entre corridas: WSAA rechaza un login nuevo mientras el ticket anterior siga vigente. */
const sdk = () =>
  new ArcaSire({
    cuit: env.ARCA_TEST_CUIT!,
    cert: pem(env.ARCA_TEST_CERT!),
    key: pem(env.ARCA_TEST_KEY!),
    production: false,
    ticketStorage: new FileTicketStorage(env.ARCA_TEST_TICKETS_DIR ?? join(tmpdir(), 'arca-test-tickets')),
  });

describe.skipIf(!habilitado)('integración SIRE (homologación)', { timeout: 120_000 }, () => {
  it('status (dummy)', async () => {
    const status = await sdk().status();
    expect(status).toMatchObject({ appserver: 'OK', dbserver: 'OK', authserver: 'OK' });
    expect(status.headerInfo?.ambiente).toMatch(/homolog/i);
  });
});
