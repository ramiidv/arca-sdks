/**
 * Ejemplo: constatar un comprobante recibido
 *
 * Verifica con el WSCDC que un comprobante (propio o de un proveedor) fue
 * autorizado por ARCA con el CAE, CAI o CAEA informado.
 */

import fs from 'node:fs';
import { ArcaCdc } from '@ramiidv/arca-cdc';

async function main() {
  const cdc = new ArcaCdc({
    cuit: 20123456786, // CUIT que consulta (representada en el certificado)
    cert: fs.readFileSync('./certs/certificado.crt', 'utf-8'),
    key: fs.readFileSync('./certs/clave.key', 'utf-8'),
    production: false,
  });

  console.log('Estado del servicio:', await cdc.status());

  const result = await cdc.constatar({
    cbteModo: 'CAE',
    cuitEmisor: '30-71234567-1', // CUIT del proveedor que emitió la factura
    ptoVta: 1,
    cbteTipo: 1, // Factura A
    cbteNro: 150,
    cbteFch: '2026-03-15',
    impTotal: 12100,
    codAutorizacion: '73429843294823',
    docTipoReceptor: 80, // CUIT (obligatorio en comprobantes A)
    docNroReceptor: 20123456786,
  });

  if (result.resultado === 'A') {
    console.log(`Comprobante CONSTATADO (${result.fchProceso}).`);
  } else {
    console.log('Comprobante RECHAZADO:');
  }
  for (const obs of result.observaciones) {
    console.log(`  Observación [${obs.code}]: ${obs.msg}`);
  }
}

main().catch(console.error);
