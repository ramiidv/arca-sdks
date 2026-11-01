/**
 * Ejemplo: Consulta completa de datos de contribuyente (Padrón A4)
 *
 * Este ejemplo muestra cómo obtener la información completa de un
 * contribuyente usando el web service ws_sr_padron_a4.
 */

import { readFileSync } from 'fs';
import { ArcaPadron } from '@ramiidv/arca-padron';

const client = new ArcaPadron({
  cert: readFileSync('./cert.pem', 'utf-8'),
  key: readFileSync('./key.pem', 'utf-8'),
  cuit: '20123456786', // Tu CUIT representada
  production: false,   // false = homologación, true = producción
});

async function main() {
  const cuitConsulta = '20-11111111-2'; // con o sin guiones

  console.log(`Consultando datos completos para CUIT: ${cuitConsulta}`);
  const persona = await client.getPersona(cuitConsulta);

  // Datos generales
  console.log('\n--- Datos Generales ---');
  console.log(`Tipo: ${persona.tipoPersona}`);
  console.log(`Estado clave: ${persona.estadoClave}`);

  if (persona.tipoPersona === 'FISICA') {
    console.log(`Nombre: ${persona.nombre} ${persona.apellido}`);
  } else {
    console.log(`Razón Social: ${persona.razonSocial}`);
  }

  // Domicilios
  if (persona.domicilio && persona.domicilio.length > 0) {
    console.log('\n--- Domicilios ---');
    for (const dom of persona.domicilio) {
      console.log(`  [${dom.tipoDomicilio}] ${dom.direccion}, ${dom.localidad} (${dom.codPostal})`);
    }
  }

  // Impuestos inscriptos
  if (persona.impuesto && persona.impuesto.length > 0) {
    console.log('\n--- Impuestos ---');
    for (const imp of persona.impuesto) {
      console.log(`  ID: ${imp.idImpuesto} - Estado: ${imp.estado} - Período: ${imp.periodo ?? 'N/A'}`);
    }
  }

  // Actividades económicas
  if (persona.actividad && persona.actividad.length > 0) {
    console.log('\n--- Actividades ---');
    for (const act of persona.actividad) {
      console.log(`  ${act.idActividad}: ${act.descripcionActividad ?? 'Sin descripción'} (orden: ${act.orden})`);
    }
  }

  // Regímenes
  if (persona.regimen && persona.regimen.length > 0) {
    console.log('\n--- Regímenes ---');
    for (const reg of persona.regimen) {
      console.log(`  ID: ${reg.idRegimen} - Estado: ${reg.estado} - Tipo: ${reg.tipoRegimen ?? 'N/A'}`);
    }
  }

  // Relaciones
  if (persona.relacion && persona.relacion.length > 0) {
    console.log('\n--- Relaciones ---');
    for (const rel of persona.relacion) {
      console.log(`  CUIT: ${rel.idPersona} - Tipo: ${rel.tipoRelacion} - Desde: ${rel.ffRelacion ?? 'N/A'}`);
    }
  }
}

main().catch(console.error);
