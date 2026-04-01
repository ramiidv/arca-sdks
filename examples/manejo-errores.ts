/**
 * Example: Error handling patterns for all 3 agro services
 *
 * Demonstrates how to handle:
 * - Validation errors (ArcaValidationError) - bad input data
 * - Service errors (ArcaServiceError) - ARCA rejected the request
 * - SOAP/HTTP errors (ArcaSoapError) - network or protocol issues
 * - Auth errors (ArcaAuthError) - certificate or WSAA issues
 */
import fs from 'node:fs';
import {
  ArcaAgro,
  ArcaValidationError,
  ArcaServiceError,
  ArcaSoapError,
  ArcaAuthError,
  ArcaError,
} from '@ramiidv/arca-agro';

const agro = new ArcaAgro({
  cuit: 20123456789,
  cert: fs.readFileSync('cert.pem', 'utf-8'),
  key: fs.readFileSync('key.pem', 'utf-8'),
  production: false,
});

// ---------------------------------------------------------------------------
// Pattern 1: Validation errors (caught before hitting the network)
// ---------------------------------------------------------------------------
async function validationErrorExample() {
  console.log('--- Validation error example ---');
  try {
    await agro.cpe.autorizarCPEAutomotor({
      cuitTitularCartaPorte: 123, // invalid: not 11 digits
      sucursal: 0,                // invalid: must be > 0
      nroOrden: -1,               // invalid: must be >= 0
      codTipoCartaPorte: 1,
      codGrano: 0,                // invalid: must be > 0
      codLocalidadProcedencia: 10270,
      codProvProcedencia: 1,
      codLocalidadDestino: 10350,
      codProvDestino: 1,
      cuitDestino: 30111222334,
      plantaDestino: 1,
      pesoNeto: -100,             // invalid: must be > 0
      pesoBruto: 32000,
      pesoTara: 2000,
      patente: 'ABC123',
      cuitTransportista: 20999888777,
      fechaEmision: '2026-03-31',
    });
  } catch (error) {
    if (error instanceof ArcaValidationError) {
      console.log('Validation failed!');
      console.log('  Field:', error.field);
      console.log('  Details:');
      for (const detail of error.details) {
        console.log(`    - ${detail.field}: ${detail.message} (value: ${detail.value})`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Pattern 2: Service errors (ARCA rejected the business request)
// ---------------------------------------------------------------------------
async function serviceErrorExample() {
  console.log('\n--- Service error example ---');
  try {
    await agro.ctg.solicitarCTGInicial({
      nroCartaPorte: 9999999,
      codEspecie: 23,
      cuitDestino: 30111222334,
      cuitDestinatario: 30111222334,
      codLocalidadOrigen: 10270,
      codLocalidadDestino: 10350,
      codCosecha: 2526,
      pesoNeto: 30000,
    });
  } catch (error) {
    if (error instanceof ArcaServiceError) {
      console.log('Service rejected the request:');
      for (const e of error.errors) {
        console.log(`  Error ${e.code}: ${e.msg}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Pattern 3: Network / SOAP errors
// ---------------------------------------------------------------------------
async function soapErrorExample() {
  console.log('\n--- SOAP error example ---');
  try {
    await agro.lpg.liquidacionAutorizar({
      cuitComprador: 30111222334,
      cuitVendedor: 20123456789,
      codGrano: 23,
      pesoNeto: 30000,
    });
  } catch (error) {
    if (error instanceof ArcaSoapError) {
      console.log('SOAP/HTTP error:');
      console.log('  Message:', error.message);
      console.log('  Status code:', error.statusCode);
    }
  }
}

// ---------------------------------------------------------------------------
// Pattern 4: Authentication errors
// ---------------------------------------------------------------------------
async function authErrorExample() {
  console.log('\n--- Auth error example ---');
  try {
    // This would fail if the certificate is invalid or expired
    await agro.cpe.dummy();
  } catch (error) {
    if (error instanceof ArcaAuthError) {
      console.log('Authentication failed:');
      console.log('  Message:', error.message);
      console.log('  Check your certificate and private key.');
    }
  }
}

// ---------------------------------------------------------------------------
// Pattern 5: Generic catch-all using base ArcaError
// ---------------------------------------------------------------------------
async function genericErrorExample() {
  console.log('\n--- Generic error handling ---');
  try {
    await agro.lpg.liquidacionConsultar({
      fechaDesde: '2026-03-01',
      fechaHasta: '2026-03-31',
    });
  } catch (error) {
    if (error instanceof ArcaValidationError) {
      console.log('Input validation failed:', error.details);
    } else if (error instanceof ArcaServiceError) {
      console.log('ARCA service error:', error.errors);
    } else if (error instanceof ArcaSoapError) {
      console.log('Network/SOAP error:', error.message);
    } else if (error instanceof ArcaAuthError) {
      console.log('Authentication error:', error.message);
    } else if (error instanceof ArcaError) {
      console.log('Unknown ARCA error:', error.message);
    } else {
      console.log('Unexpected error:', error);
    }
  }
}

async function main() {
  await validationErrorExample();
  await serviceErrorExample();
  await soapErrorExample();
  await authErrorExample();
  await genericErrorExample();
}

main().catch(console.error);
