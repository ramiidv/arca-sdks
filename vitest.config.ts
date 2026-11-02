import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const commonSrc = fileURLToPath(new URL('./packages/common/src/', import.meta.url));

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
