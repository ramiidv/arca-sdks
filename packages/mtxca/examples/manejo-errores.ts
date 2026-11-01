/**
 * Ejemplo: manejo de errores.
 *
 *   - ArcaValidationError: datos inválidos detectados localmente (no se envió nada)
 *   - resultado 'R': ARCA rechazó el comprobante (autorizar no lanza)
 *   - ArcaServiceError: una consulta devolvió arrayErrores
 *   - ArcaSoapError: Fault SOAP, HTTP, red o timeout (ver `uncertain`)
 *   - ArcaAuthError / ArcaTicketVigenteError: login WSAA
 */

import fs from 'node:fs';
import {
  ArcaMtxca,
  ArcaAuthError,
  ArcaServiceError,
  ArcaSoapError,
  ArcaTicketVigenteError,
  ArcaValidationError,
  CbteTipo,
  CodigoCondicionIVA,
  Concepto,
  FileTicketStorage,
  Moneda,
} from '@ramiidv/arca-mtxca';

async function main() {
  const mtxca = new ArcaMtxca({
    cert: fs.readFileSync('./certs/certificado.crt', 'utf-8'),
    key: fs.readFileSync('./certs/clave.key', 'utf-8'),
    cuit: '20123456786',
    production: false,
    timeout: 60_000,
    ticketStorage: new FileTicketStorage('./.tickets'),
    onEvent: (e) => console.debug('[arca]', e.type),
  });

  try {
    const res = await mtxca.autorizar({
      codigoTipoComprobante: CbteTipo.FACTURA_A,
      numeroPuntoVenta: 4000,
      codigoTipoDocumento: 80,
      numeroDocumento: '30000000007',
      condicionIVAReceptor: 1,
      importeGravado: 100,
      importeSubtotal: 100,
      importeTotal: 125, // incoherente: debería ser 121
      codigoMoneda: Moneda.PESOS,
      cotizacionMoneda: 1,
      codigoConcepto: Concepto.PRODUCTOS,
      items: [
        {
          unidadesMtx: 1,
          codigoMtx: '7790001000012',
          descripcion: 'Producto',
          cantidad: 1,
          codigoUnidadMedida: 7,
          precioUnitario: 100,
          codigoCondicionIVA: CodigoCondicionIVA.IVA_21,
          importeIVA: 21,
          importeItem: 121,
        },
      ],
      subtotalesIVA: [{ codigo: CodigoCondicionIVA.IVA_21, importe: 21 }],
    });

    if (res.resultado === 'R') {
      for (const err of res.errores) console.error(`ARCA rechazó [${err.codigo}] ${err.descripcion}`);
    } else {
      console.log('CAE:', res.comprobante.cae);
    }
  } catch (e) {
    if (e instanceof ArcaValidationError) {
      for (const d of e.details) console.error(`Dato inválido ${d.field}: ${d.message}`);
    } else if (e instanceof ArcaServiceError) {
      for (const err of e.errors) console.error(`Error de ARCA [${err.code}] ${err.msg}`);
    } else if (e instanceof ArcaSoapError) {
      console.error(`Error SOAP/HTTP: ${e.message}`, {
        uncertain: e.uncertain,
        fault: e.faultString,
        status: e.statusCode,
      });
      if (e.uncertain)
        console.error('El comprobante pudo haberse autorizado: verificá con ultimoComprobante/consultarComprobante.');
    } else if (e instanceof ArcaTicketVigenteError) {
      console.error('Hay un ticket WSAA vigente que no está en el storage; esperá a que venza.');
    } else if (e instanceof ArcaAuthError) {
      console.error('Error de autenticación WSAA:', e.message);
    } else {
      throw e;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
