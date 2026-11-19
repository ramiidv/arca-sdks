/**
 * Integración contra ARCA homologación (SIRE).
 *
 * Corre solo con ARCA_TEST_CERT, ARCA_TEST_KEY y ARCA_TEST_CUIT (ver "Desarrollo"
 * en el README raíz). El estado del servicio no requiere autenticación.
 */
import { describe, expect, it } from 'vitest';
import { configSdk, principal } from '../../../../tests/homologacion/sdk.js';
import { ArcaSire } from '../../src/index.js';

const sdk = () => new ArcaSire(configSdk(principal!));

describe.skipIf(!principal)('integración SIRE (homologación)', { timeout: 120_000 }, () => {
  it('status (dummy)', async () => {
    const status = await sdk().status();
    expect(status).toMatchObject({ appserver: 'OK', dbserver: 'OK', authserver: 'OK' });
    expect(status.headerInfo?.ambiente).toMatch(/homolog/i);
  });
});
