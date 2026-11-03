// Borra dist/ antes de compilar para que no queden archivos viejos (de módulos
// renombrados o eliminados) que terminen publicados. Multiplataforma.
//   node ../../scripts/clean-dist.mjs   -> borra ./dist (desde un paquete)
//   node scripts/clean-dist.mjs --all   -> borra packages/*/dist (desde la raíz)
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const dirs = process.argv.includes('--all')
  ? readdirSync('packages', { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => join('packages', d.name, 'dist'))
  : ['dist'];

for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
