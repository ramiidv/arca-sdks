/**
 * Integración contra ARCA homologación (WSFECRED).
 *
 * Corre solo con ARCA_TEST_CERT, ARCA_TEST_KEY y ARCA_TEST_CUIT (ver "Desarrollo"
 * en el README raíz). El estado del servicio no requiere autenticación; las
 * consultas autenticadas corren solo si ARCA_TEST_SERVICES incluye "wsfecred".
 */
import { describe, expect, it } from 'vitest';
import { autorizado, configSdk, principal } from '../../../../tests/homologacion/sdk.js';
import { ArcaFecred } from '../../src/index.js';

const sdk = () => new ArcaFecred(configSdk(principal!));

describe.skipIf(!principal)('integración WSFECRED (homologación)', { timeout: 120_000 }, () => {
  it('status (dummy)', async () => {
    expect(await sdk().status()).toEqual({ appserver: 'OK', dbserver: 'OK', authserver: 'OK' });
  });

  it.skipIf(!autorizado('wsfecred', principal))('consultarTiposRetenciones', async () => {
    expect((await sdk().consultarTiposRetenciones()).length).toBeGreaterThan(0);
  });
});
