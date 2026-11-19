#!/usr/bin/env node
/**
 * Typechequea los bloques ```ts de los README.md y llms.txt de cada paquete, para
 * que los ejemplos de la documentación no queden desactualizados respecto de la API.
 *
 *   npm run check:snippets
 *
 * Cada bloque que importa de `@ramiidv/*` se compila como un módulo aparte
 * (contra los `.d.ts` de `dist/`: requiere `npm run build`). Los bloques sin
 * imports son fragmentos que siguen a otro bloque y se omiten. Para omitir un
 * bloque con imports, poner `<!-- snippet:skip -->` en la línea anterior.
 *
 * En llms.txt las firmas de los constructores están escritas en pseudo-TS
 * (`timeout?, retries?`): los bloques que no son TypeScript sintácticamente
 * válido se omiten (se detectan con `stripTypeScriptTypes` de node:module, que
 * no existe en Node < 22.13: ahí no se revisan los llms.txt).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import nodeModule from 'node:module';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'node_modules/.cache/snippets');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const BLOCK_RE = /(<!-- snippet:skip -->\s*\n)?```(?:ts|typescript)\n([\s\S]*?)```/g;
const files = [];
// Import por defecto: con un import con nombre, Node < 22.13 falla al cargar el script.
const { stripTypeScriptTypes } = nodeModule;
const DOCS = stripTypeScriptTypes ? ['README.md', 'llms.txt'] : ['README.md'];
if (!stripTypeScriptTypes) console.log('Node < 22.13: no se revisan los bloques de llms.txt.');

/** ¿Es TypeScript sintácticamente válido? (las firmas en pseudo-TS no lo son) */
function esTypeScript(code) {
  try {
    stripTypeScriptTypes(code);
    return true;
  } catch {
    return false;
  }
}
for (const pkg of readdirSync(join(root, 'packages')).sort()) {
  let n = 0;
  for (const doc of DOCS) {
    const path = join(root, 'packages', pkg, doc);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf8');
    for (const m of text.matchAll(BLOCK_RE)) {
      const [, skip, code] = m;
      if (skip || !/from ['"]@ramiidv\//.test(code)) continue;
      if (doc === 'llms.txt' && !esTypeScript(code)) continue;
      const line = text.slice(0, m.index).split('\n').length + 1;
      const file = join(out, `${pkg}-${++n}.mts`);
      writeFileSync(file, `// packages/${pkg}/${doc}:${line}\n${code}\nexport {};\n`);
      files.push(file);
    }
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
  console.log(`✓ ${files.length} snippets de README y llms.txt compilan`);
} catch {
  console.error('Snippets de la documentación con errores (la primera línea de cada archivo indica de dónde sale).');
  process.exit(1);
}
