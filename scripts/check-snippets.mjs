#!/usr/bin/env node
/**
 * Typechequea los bloques ```ts de los README de cada paquete, para que los
 * ejemplos de la documentación no queden desactualizados respecto de la API.
 *
 *   npm run check:snippets
 *
 * Cada bloque que importa de `@ramiidv/*` se compila como un módulo aparte
 * (contra los `.d.ts` de `dist/`: requiere `npm run build`). Los bloques sin
 * imports son fragmentos que siguen a otro bloque y se omiten. Para omitir un
 * bloque con imports, poner `<!-- snippet:skip -->` en la línea anterior.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'node_modules/.cache/snippets');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const BLOCK_RE = /(<!-- snippet:skip -->\s*\n)?```(?:ts|typescript)\n([\s\S]*?)```/g;
const files = [];
for (const pkg of readdirSync(join(root, 'packages')).sort()) {
  const readme = readFileSync(join(root, 'packages', pkg, 'README.md'), 'utf8');
  let n = 0;
  for (const m of readme.matchAll(BLOCK_RE)) {
    const [, skip, code] = m;
    if (skip || !/from ['"]@ramiidv\//.test(code)) continue;
    const line = readme.slice(0, m.index).split('\n').length + 1;
    const file = join(out, `${pkg}-${++n}.mts`);
    writeFileSync(file, `// packages/${pkg}/README.md:${line}\n${code}\nexport {};\n`);
    files.push(file);
  }
}

writeFileSync(
  join(out, 'tsconfig.json'),
  JSON.stringify({
    extends: join(root, 'tsconfig.base.json'),
    compilerOptions: {
      noEmit: true,
      declaration: false,
      declarationMap: false,
      sourceMap: false,
      inlineSources: false,
    },
    include: ['*.mts'],
  }),
);

try {
  execFileSync(join(root, 'node_modules/.bin/tsc'), ['-p', out], { stdio: 'inherit' });
  console.log(`✓ ${files.length} snippets de README compilan`);
} catch {
  console.error('Snippets de README con errores (la primera línea de cada archivo indica de dónde sale).');
  process.exit(1);
}
