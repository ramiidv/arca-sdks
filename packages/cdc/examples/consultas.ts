/**
 * Ejemplo: tablas de parámetros del WSCDC
 *
 * Modalidades de autorización, tipos de comprobante, tipos de documento y
 * tipos de datos opcionales habilitados.
 */

import fs from 'node:fs';
import { ArcaCdc } from '@ramiidv/arca-cdc';

async function main() {
  const cdc = new ArcaCdc({
    cuit: 20123456786,
    cert: fs.readFileSync('./certs/certificado.crt', 'utf-8'),
    key: fs.readFileSync('./certs/clave.key', 'utf-8'),
    production: false,
  });

  console.log('Modalidades (CbteModo):');
  for (const mod of await cdc.getModalidades()) {
    console.log(`  [${mod.cod}] ${mod.desc}`);
  }

  console.log('\nTipos de comprobante:');
  for (const tipo of await cdc.getTiposCbte()) {
    console.log(`  [${tipo.id}] ${tipo.desc}`);
  }

  console.log('\nTipos de documento:');
  for (const doc of await cdc.getDocTipos()) {
    console.log(`  [${doc.id}] ${doc.desc}`);
  }

  console.log('\nTipos de datos opcionales:');
  for (const op of await cdc.getTiposOpcionales()) {
    console.log(`  [${op.id}] ${op.desc}`);
  }
}

main().catch(console.error);
