/**
 * Integración contra ARCA homologación (WSCPE/WSLPG).
 *
 * Corre solo con ARCA_TEST_CERT, ARCA_TEST_KEY y ARCA_TEST_CUIT (ver "Desarrollo"
 * en el README raíz). El estado del servicio no requiere autenticación; las
 * consultas autenticadas corren solo si ARCA_TEST_SERVICES incluye su servicio
 * ("wscpe" o "wslpg").
 */
import { describe, expect, it } from 'vitest';
import { autorizado, configSdk, principal } from '../../../../tests/homologacion/sdk.js';
import { ArcaAgro } from '../../src/index.js';

const sdk = () => new ArcaAgro(configSdk(principal!));

describe.skipIf(!principal)('integración WSCPE/WSLPG (homologación)', { timeout: 120_000 }, () => {
  it('status (dummy de WSCPE y WSLPG)', async () => {
    const s = await sdk().status();
    expect(s.cpe.ok).toBe(true);
    expect(s.lpg.ok).toBe(true);
  });

  it.skipIf(!autorizado('wscpe', principal))('WSCPE: consultarProvincias', async () => {
    expect((await sdk().cpe.consultarProvincias()).length).toBeGreaterThan(0);
  });

  it.skipIf(!autorizado('wslpg', principal))('WSLPG: tipoGranoConsultar', async () => {
    expect((await sdk().lpg.tipoGranoConsultar()).length).toBeGreaterThan(0);
  });
});
