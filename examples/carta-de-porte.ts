/**
 * Example: Carta de Porte Electronica (WSCPE)
 *
 * Demonstrates how to:
 * 1. Authorize a CPE for grain transport (autorizarCPEAutomotor)
 * 2. Confirm arrival at destination
 * 3. Query CPEs
 */
import fs from 'node:fs';
import { ArcaAgro } from '@ramiidv/arca-agro';

const agro = new ArcaAgro({
  cuit: 20123456789,
  cert: fs.readFileSync('cert.pem', 'utf-8'),
  key: fs.readFileSync('key.pem', 'utf-8'),
  production: false, // testing/homologacion
  onEvent: (event) => console.log(`[${event.type}]`, event),
});

async function main() {
  // -------------------------------------------------------------------------
  // 1. Authorize a CPE for grain transport
  // -------------------------------------------------------------------------
  console.log('--- Authorizing CPE ---');

  const cpeResult = await agro.cpe.autorizarCPEAutomotor({
    cuitTitularCartaPorte: 20123456789,
    sucursal: 1,
    nroOrden: 1,
    codTipoCartaPorte: 1,
    codGrano: 23, // Soja
    codLocalidadProcedencia: 10270,
    codProvProcedencia: 1, // Buenos Aires
    codLocalidadDestino: 10350,
    codProvDestino: 1,
    cuitDestino: 30111222334,
    plantaDestino: 1,
    pesoNeto: 30000,
    pesoBruto: 32000,
    pesoTara: 2000,
    patente: 'ABC123',
    cuitTransportista: 20999888777,
    fechaEmision: '2026-03-31',
  });

  console.log('CPE authorized:', {
    nroCTG: cpeResult.nroCTG,
    nroCartaPorte: cpeResult.nroCartaPorte,
    estado: cpeResult.estado,
  });

  // -------------------------------------------------------------------------
  // 2. Confirm arrival at destination
  // -------------------------------------------------------------------------
  if (cpeResult.nroCTG && cpeResult.nroCartaPorte) {
    console.log('\n--- Confirming arrival ---');

    const arriboResult = await agro.cpe.confirmadoArriboCPE({
      nroCTG: cpeResult.nroCTG,
      nroCartaPorte: cpeResult.nroCartaPorte,
      cuitDestino: 30111222334,
      pesoNeto: 29800, // actual weight at destination
      fechaArribo: '2026-04-01',
    });

    console.log('Arrival confirmed:', {
      estado: arriboResult.estado,
    });
  }

  // -------------------------------------------------------------------------
  // 3. Query CPEs
  // -------------------------------------------------------------------------
  console.log('\n--- Querying CPEs ---');

  const cpes = await agro.cpe.consultarCPE({
    cuitSolicitante: 20123456789,
    fechaDesde: '2026-03-01',
    fechaHasta: '2026-03-31',
    codGrano: 23,
  });

  console.log(`Found ${cpes.length} CPE(s):`);
  for (const c of cpes) {
    console.log(`  CTG #${c.nroCTG} - CP #${c.nroCartaPorte} - ${c.estado}`);
  }

  // -------------------------------------------------------------------------
  // Query by destination
  // -------------------------------------------------------------------------
  console.log('\n--- Querying CPEs by destination ---');

  const cpesByDest = await agro.cpe.consultarCPEPorDestino({
    cuitDestino: 30111222334,
    fechaDesde: '2026-03-01',
    fechaHasta: '2026-03-31',
  });

  console.log(`Found ${cpesByDest.length} CPE(s) by destination`);
}

main().catch(console.error);
