/**
 * Example: Liquidacion Primaria de Granos (WSLPG)
 *
 * Demonstrates how to:
 * 1. Authorize a grain liquidation
 * 2. Query liquidations
 * 3. Adjust a liquidation (ajuste unificado)
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
  // 1. Authorize a grain liquidation
  // -------------------------------------------------------------------------
  console.log('--- Authorizing liquidation ---');

  const liqResult = await agro.lpg.liquidacionAutorizar({
    cuitComprador: 30111222334,
    cuitVendedor: 20123456789,
    codGrano: 23, // Soja
    pesoNeto: 30000,
    precioRefTn: 350000, // price per ton in ARS
    precioFleteTn: 15000,
    codGrado: 'G2',
    fechaEmision: '2026-03-31',
    codTipoOperacion: 1,
    ptoEmision: 1,
  });

  console.log('Liquidation authorized:', {
    codOperacion: liqResult.codOperacion,
    nroOrden: liqResult.nroOrden,
    resultado: liqResult.resultado,
    totalPagar: liqResult.totalPagar,
    totalDeducciones: liqResult.totalDeducciones,
  });

  // -------------------------------------------------------------------------
  // 2. Query liquidations
  // -------------------------------------------------------------------------
  console.log('\n--- Querying liquidations ---');

  const liquidaciones = await agro.lpg.liquidacionConsultar({
    fechaDesde: '2026-03-01',
    fechaHasta: '2026-03-31',
    codTipoOperacion: 1,
  });

  console.log(`Found ${liquidaciones.length} liquidation(s):`);
  for (const l of liquidaciones) {
    console.log(`  #${l.nroOrden} - ${l.resultado} - $${l.totalPagar}`);
  }

  // -------------------------------------------------------------------------
  // 3. Adjust a liquidation
  // -------------------------------------------------------------------------
  if (liqResult.nroOrden) {
    console.log('\n--- Adjusting liquidation ---');

    const ajusteResult = await agro.lpg.liquidacionAjustarUnificado({
      nroOrdenOriginal: liqResult.nroOrden,
      ptoEmisionOriginal: 1,
      tipoAjuste: 'credito',
      liquidacion: {
        codGrano: 23,
        pesoNeto: 30000,
        precioRefTn: 355000, // adjusted price
      },
      observaciones: 'Ajuste por diferencia de precio',
    });

    console.log('Adjustment result:', {
      codOperacion: ajusteResult.codOperacion,
      nroOrden: ajusteResult.nroOrden,
      resultado: ajusteResult.resultado,
    });
  }

  // -------------------------------------------------------------------------
  // Query parameters (grain types, etc.)
  // -------------------------------------------------------------------------
  console.log('\n--- Querying grain types ---');

  const granos = await agro.lpg.consultarParametros('tipoGrano');
  console.log(`Available grain types: ${granos.length}`);
  for (const g of granos.slice(0, 5)) {
    console.log(`  ${JSON.stringify(g)}`);
  }
}

main().catch(console.error);
