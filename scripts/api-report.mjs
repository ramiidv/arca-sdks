/**
 * Reportes de la API pública (`packages/<pkg>/api/*.api.md`) con
 * @microsoft/api-extractor, uno por entry point de `exports`.
 *
 *   npm run api:check    falla si la API cambió y el reporte no se actualizó (CI)
 *   npm run api:update   regenera los reportes (commitear el diff)
 *
 * Requiere `npm run build` antes (lee los `.d.ts` de `dist/`). Un PR que cambia
 * la API pública muestra el cambio en el diff del `.api.md`: ahí se decide si
 * es major.
 */
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Extractor, ExtractorConfig } from '@microsoft/api-extractor';

const local = process.argv.includes('--write');
const root = resolve(import.meta.dirname, '..');
const packagesDir = join(root, 'packages');

let failed = 0;
for (const dir of readdirSync(packagesDir).sort()) {
  const projectFolder = join(packagesDir, dir);
  const pkg = JSON.parse(readFileSync(join(projectFolder, 'package.json'), 'utf8'));
  for (const [subpath, target] of Object.entries(pkg.exports ?? {})) {
    const types = typeof target === 'object' ? target.types : undefined;
    if (!types) continue;
    const reportName = subpath === '.' ? dir : `${dir}-${subpath.slice(2)}`;
    if (local) mkdirSync(join(projectFolder, 'api'), { recursive: true });
    const config = ExtractorConfig.prepare({
      configObject: {
        projectFolder,
        mainEntryPointFilePath: join(projectFolder, types),
        compiler: { tsconfigFilePath: join(projectFolder, 'tsconfig.json') },
        apiReport: {
          enabled: true,
          reportFileName: `${reportName}.api.md`,
          reportFolder: join(projectFolder, 'api'),
          reportTempFolder: join(root, 'node_modules/.cache/api-extractor', dir),
        },
        docModel: { enabled: false },
        dtsRollup: { enabled: false },
        tsdocMetadata: { enabled: false },
        newlineKind: 'lf',
        messages: {
          // Los reportes son para revisar cambios, no para exigir TSDoc completo.
          extractorMessageReporting: {
            default: { logLevel: 'none' },
            'ae-missing-release-tag': { logLevel: 'none' },
          },
          tsdocMessageReporting: { default: { logLevel: 'none' } },
          compilerMessageReporting: { default: { logLevel: 'warning' } },
        },
      },
      configObjectFullPath: undefined,
      packageJsonFullPath: join(projectFolder, 'package.json'),
    });
    const result = Extractor.invoke(config, { localBuild: local, showVerboseMessages: false });
    const name = `${pkg.name}${subpath === '.' ? '' : subpath.slice(1)}`;
    if (result.apiReportChanged && !local) {
      console.error(
        `✗ ${name}: la API pública cambió. Correr \`npm run api:update\` y commitear api/${reportName}.api.md`,
      );
      failed++;
    } else if (!result.succeeded) {
      console.error(`✗ ${name}: api-extractor terminó con errores`);
      failed++;
    } else {
      console.log(`${result.apiReportChanged ? '↻' : '✓'} ${name}`);
    }
  }
}
process.exit(failed > 0 ? 1 : 0);
