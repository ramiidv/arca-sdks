/**
 * Integración contra ARCA homologación (WSCDC).
 *
 * Corre solo con ARCA_TEST_CERT, ARCA_TEST_KEY y ARCA_TEST_CUIT (ver "Desarrollo"
 * en el README raíz). El estado del servicio no requiere autenticación; las
 * consultas autenticadas corren solo si ARCA_TEST_SERVICES incluye "wscdc".
 */
import { describe, expect, it } from 'vitest';
import { autorizado, configSdk, principal } from '../../../../tests/homologacion/sdk.js';
import { ArcaCdc } from '../../src/index.js';

const sdk = () => new ArcaCdc(configSdk(principal!));

describe.skipIf(!principal)('integración WSCDC (homologación)', { timeout: 120_000 }, () => {
  it('status (ComprobanteDummy)', async () => {
    expect(await sdk().status()).toEqual({ appserver: 'OK', dbserver: 'OK', authserver: 'OK' });
  });

  it.skipIf(!autorizado('wscdc', principal))('getTiposCbte', async () => {
    expect((await sdk().getTiposCbte()).length).toBeGreaterThan(0);
  });
});
