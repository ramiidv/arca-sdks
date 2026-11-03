import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { defineConfig } from 'vitest/config';

const commonSrc = fileURLToPath(new URL('./packages/common/src/', import.meta.url));

/**
 * Variables `ARCA_TEST_*` del `.env` local (no se versiona, ver .gitignore) para
 * los tests de integración. Las del entorno tienen prioridad sobre las del archivo.
 */
function arcaTestEnv(): Record<string, string> {
  const file = fileURLToPath(new URL('./.env', import.meta.url));
  if (!existsSync(file)) return {};
  const vars = parseEnv(readFileSync(file, 'utf8'));
  return Object.fromEntries(
    Object.entries(vars).filter(
      (entry): entry is [string, string] =>
        entry[0].startsWith('ARCA_TEST_') && entry[1] !== undefined && process.env[entry[0]] === undefined,
    ),
  );
}

export default defineConfig({
  // Los tests de cada paquete usan el código fuente de common, no su `dist/`:
  // un cambio en common se prueba en todos los paquetes sin recompilar.
  resolve: {
    alias: [
      { find: /^@ramiidv\/arca-common$/, replacement: `${commonSrc}index.ts` },
      { find: /^@ramiidv\/arca-common\/(schema|testing)$/, replacement: `${commonSrc}$1.ts` },
    ],
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['packages/*/tests/**/*.test.ts'],
          exclude: ['**/node_modules/**', 'packages/*/tests/integration/**'],
        },
      },
      {
        // Contra ARCA homologación: `npm run test:integration` (se saltean sin ARCA_TEST_*).
        extends: true,
        test: {
          name: 'integration',
          include: ['packages/*/tests/integration/**/*.test.ts'],
          env: arcaTestEnv(),
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      reporter: ['text-summary', 'html'],
    },
  },
});
