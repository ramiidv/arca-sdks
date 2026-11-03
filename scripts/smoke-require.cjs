// Verifica que cada paquete (ESM-only) se pueda cargar con `require()` desde
// CommonJS (require(esm), Node >= 22.12). Falla si algún módulo usa
// top-level await o si el build no exporta nada. Correr después de `build`.
const { readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const packagesDir = join(__dirname, '..', 'packages');
let failed = false;
for (const dir of readdirSync(packagesDir)) {
  const { name } = JSON.parse(readFileSync(join(packagesDir, dir, 'package.json'), 'utf8'));
  try {
    const mod = require(name);
    const count = Object.keys(mod).length;
    if (count === 0) throw new Error('no exporta nada');
    console.log(`ok   ${name} (${count} exports)`);
  } catch (err) {
    failed = true;
    console.error(`FAIL ${name}: ${err.message}`);
  }
}
process.exit(failed ? 1 : 0);
