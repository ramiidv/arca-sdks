/**
 * Ejemplo: Consulta de tablas de parámetros (Padrón A100)
 *
 * Este ejemplo muestra cómo obtener las tablas de referencia
 * (provincias, tipos de documento, tipos de relación, etc.)
 * usando el web service ws_sr_padron_a100.
 */

import { readFileSync } from 'fs';
import { ArcaPadron, CollectionName } from '@ramiidv/arca-padron';

const client = new ArcaPadron({
  cert: readFileSync('./cert.pem', 'utf-8'),
  key: readFileSync('./key.pem', 'utf-8'),
  cuit: '20123456786',
  production: false,
});

async function main() {
  // Consultar tabla de provincias (SUPA.E_PROVINCIA)
  console.log('--- Provincias ---');
  const provincias = await client.getParametros(CollectionName.PROVINCIA);
  for (const prov of provincias) {
    console.log(`  [${prov.id}] ${prov.descripcion}`);
  }
  console.log();

  // Los atributos traen los valores tal cual los envía ARCA (strings)
  const misiones = provincias.find((p) => p.id === '19');
  console.log('Atributos de Misiones:', misiones?.atributos);

  // Consultar tabla de tipos de documento (SUPA.TIPO_DOCUMENTO)
  console.log('--- Tipos de Documento ---');
  const tiposDoc = await client.getParametros(CollectionName.TIPO_DOCUMENTO);
  for (const tipo of tiposDoc) {
    console.log(`  [${tipo.id}] ${tipo.descripcion}`);
  }
  console.log();

  // Consultar tabla de tipos de relación (SUPA.TIPO_RELACION)
  console.log('--- Tipos de Relación ---');
  const tiposRelacion = await client.getParametros(CollectionName.TIPO_RELACION);
  for (const rel of tiposRelacion) {
    console.log(`  [${rel.id}] ${rel.descripcion}`);
  }
  console.log();

  // Consultar tabla de tipos de domicilio (SUPA.TIPO_DOMICILIO)
  console.log('--- Tipos de Domicilio ---');
  const tiposDom = await client.getParametros(CollectionName.TIPO_DOMICILIO);
  for (const dom of tiposDom) {
    console.log(`  [${dom.id}] ${dom.descripcion}`);
  }
}

main().catch(console.error);
