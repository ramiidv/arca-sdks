/**
 * Integración contra ARCA homologación (WSMTXCA).
 *
 * Corre solo con ARCA_TEST_CERT, ARCA_TEST_KEY y ARCA_TEST_CUIT (ver "Desarrollo"
 * en el README raíz). El estado del servicio no requiere autenticación; las
 * consultas autenticadas corren solo si ARCA_TEST_SERVICES incluye "wsmtxca".
 */
import { describe, expect, it } from 'vitest';
import { autorizado, configSdk, principal } from '../../../../tests/homologacion/sdk.js';
import { ArcaMtxca } from '../../src/index.js';

const sdk = () => new ArcaMtxca(configSdk(principal!));

describe.skipIf(!principal)('integración WSMTXCA (homologación)', { timeout: 120_000 }, () => {
  it('status (dummy)', async () => {
    expect(await sdk().status()).toEqual({ appserver: 'OK', dbserver: 'OK', authserver: 'OK' });
  });

  it.skipIf(!autorizado('wsmtxca', principal))('getTiposComprobante', async () => {
    expect((await sdk().getTiposComprobante()).length).toBeGreaterThan(0);
  });
});
