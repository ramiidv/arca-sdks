/**
 * Example: Codigo de Trazabilidad de Granos (WSCTG)
 *
 * Demonstrates how to:
 * 1. Request a CTG code (solicitarCTGInicial)
 * 2. Confirm arrival at destination
 * 3. Query active CTGs
 */
import fs from 'node:fs';
import { ArcaAgro } from '@ramiidv/arca-agro';

const agro = new ArcaAgro({
  cuit: 20123456789,
  cert: fs.readFileSync('cert.pem', 'utf-8'),
  key: fs.readFileSync('key.pem', 'utf-8'),
  production: false,
});

async function main() {
  // -------------------------------------------------------------------------
  // 1. Request a CTG code
  // -------------------------------------------------------------------------
  console.log('--- Requesting CTG ---');

  const ctgResult = await agro.ctg.solicitarCTGInicial({
    nroCartaPorte: 1000001,
    codEspecie: 23, // Soja
    cuitDestino: 30111222334,
    cuitDestinatario: 30111222334,
    codLocalidadOrigen: 10270,
    codLocalidadDestino: 10350,
    codCosecha: 2526, // campaign 2025/2026
    pesoNeto: 30000,
    cuitTransportista: 20999888777,
    patente: 'ABC123',
    kmRecorrer: 150,
  });

  console.log('CTG granted:', {
    nroCTG: ctgResult.nroCTG,
    vigenciaDesde: ctgResult.vigenciaDesde,
    vigenciaHasta: ctgResult.vigenciaHasta,
    tarifaReferencia: ctgResult.tarifaReferencia,
  });

  // -------------------------------------------------------------------------
  // 2. Confirm arrival at destination
  // -------------------------------------------------------------------------
  if (ctgResult.nroCTG) {
    console.log('\n--- Confirming CTG arrival ---');

    const arriboResult = await agro.ctg.confirmarArribo({
      nroCTG: ctgResult.nroCTG,
      nroCartaPorte: 1000001,
      cuitDestino: 30111222334,
      pesoNeto: 29800,
      fechaArribo: '2026-04-01',
    });

    console.log('CTG arrival confirmed:', {
      estado: arriboResult.estado,
    });
  }

  // -------------------------------------------------------------------------
  // 3. Query active CTGs
  // -------------------------------------------------------------------------
  console.log('\n--- Querying active CTGs ---');

  const activos = await agro.ctg.obtenerCTGActivos();
  console.log(`Active CTGs: ${activos.ctgs.length}`);
  for (const ctg of activos.ctgs) {
    console.log(`  CTG: ${JSON.stringify(ctg)}`);
  }

  // -------------------------------------------------------------------------
  // Search CTGs with filters
  // -------------------------------------------------------------------------
  console.log('\n--- Searching CTGs ---');

  const found = await agro.ctg.consultarCTG({
    fechaDesde: '2026-03-01',
    fechaHasta: '2026-03-31',
    codEspecie: 23,
  });

  console.log(`Found ${found.length} CTG(s):`);
  for (const c of found) {
    console.log(`  CTG #${c.nroCTG} - CP #${c.nroCartaPorte} - ${c.estado}`);
  }
}

main().catch(console.error);
