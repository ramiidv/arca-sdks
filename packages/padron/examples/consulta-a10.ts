/**
 * Ejemplo: Consulta básica de datos de contribuyente (Padrón A10)
 *
 * Este ejemplo muestra cómo obtener la información mínima de un
 * contribuyente usando el web service ws_sr_padron_a10.
 */

import { readFileSync } from 'fs';
import { ArcaPadron } from '@ramiidv/arca-padron';

const client = new ArcaPadron({
  cert: readFileSync('./cert.pem', 'utf-8'),
  key: readFileSync('./key.pem', 'utf-8'),
  cuit: '20123456786',
  production: false,
});

async function main() {
  const cuitConsulta = '20-11111111-2'; // con o sin guiones

  console.log(`Consultando datos básicos para CUIT: ${cuitConsulta}`);
  const persona = await client.getPersonaBasic(cuitConsulta);

  console.log('\n--- Datos Básicos ---');
  console.log(`CUIT: ${persona.idPersona}`);
  console.log(`Tipo: ${persona.tipoPersona}`);
  console.log(`Estado clave: ${persona.estadoClave}`);

  if (persona.tipoPersona === 'FISICA') {
    console.log(`Nombre: ${persona.nombre} ${persona.apellido}`);
  } else {
    console.log(`Razón Social: ${persona.razonSocial}`);
  }

  if (persona.domicilio && persona.domicilio.length > 0) {
    console.log('\n--- Domicilios ---');
    for (const dom of persona.domicilio) {
      console.log(`  Dirección: ${dom.direccion}`);
      console.log(`  Localidad: ${dom.localidad}`);
      console.log(`  Código Postal: ${dom.codPostal}`);
      console.log(`  Provincia ID: ${dom.idProvincia}`);
    }
  }
}

main().catch(console.error);
