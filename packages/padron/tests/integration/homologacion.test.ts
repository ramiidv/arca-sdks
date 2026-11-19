/**
 * Integración contra ARCA homologación (Padrón).
 *
 * Corre solo con ARCA_TEST_CERT, ARCA_TEST_KEY y ARCA_TEST_CUIT (ver "Desarrollo"
 * en el README raíz). El estado del servicio no requiere autenticación; las
 * consultas autenticadas corren solo si ARCA_TEST_SERVICES incluye "ws_sr_padron_a100".
 */
import { describe, expect, it } from 'vitest';
import { autorizado, configSdk, principal } from '../../../../tests/homologacion/sdk.js';
import { ArcaPadron, CollectionName } from '../../src/index.js';

const sdk = () => new ArcaPadron(configSdk(principal!));

describe.skipIf(!principal)('integración Padrón (homologación)', { timeout: 120_000 }, () => {
  it('status (dummy de cada servicio)', async () => {
    expect(Object.keys(await sdk().status()).sort()).toEqual(['a10', 'a100', 'a13', 'a4', 'a5']);
  });

  it.skipIf(!autorizado('ws_sr_padron_a100', principal))('getParametros (A100, provincias)', async () => {
    expect((await sdk().getParametros(CollectionName.PROVINCIA)).length).toBeGreaterThan(0);
  });
});
