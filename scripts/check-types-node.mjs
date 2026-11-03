// Verifica que la major de @types/node coincida con la versión mínima de Node que
// soportan los paquetes (`engines.node` del package.json raíz). Con tipos de una
// Node más nueva, el compilador acepta APIs que no existen en la mínima: los tests
// pasan en runtimes nuevos y el paquete falla en producción con la versión soportada.
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const majorDe = (rango) => Number(/(\d+)/.exec(rango ?? '')?.[1]);

const engines = pkg.engines?.node;
const tipos = pkg.devDependencies?.['@types/node'];
const minima = majorDe(engines);
const major = majorDe(tipos);

if (!Number.isInteger(minima) || !Number.isInteger(major)) {
  console.error(`check-types-node: no se pudo leer engines.node (${engines}) o @types/node (${tipos}).`);
  process.exit(1);
}
if (major !== minima) {
  console.error(
    `check-types-node: @types/node ${tipos} no coincide con la Node mínima (engines.node ${engines}). ` +
      `Usá @types/node ^${minima}.x; al subir la mínima, subí los dos juntos.`,
  );
  process.exit(1);
}
console.log(`✓ @types/node ${tipos} coincide con engines.node ${engines}`);
