/**
 * Ejemplo: Crear una Nota de Crédito
 *
 * El tipo de NC se infiere automáticamente del comprobante original:
 *   FACTURA_A → NOTA_CREDITO_A
 *   FACTURA_B → NOTA_CREDITO_B
 *   etc.
 */

import fs from 'node:fs';
import { ArcaFacturacion, ArcaRechazoError, CbteTipo, FileTicketStorage, IvaTipo } from '@ramiidv/arca-facturacion';

async function main() {
  const arca = new ArcaFacturacion({
    cuit: 20123456786,
    cert: fs.readFileSync('./certs/certificado.crt', 'utf-8'),
    key: fs.readFileSync('./certs/clave.key', 'utf-8'),
    production: false,
    ticketStorage: new FileTicketStorage('./.arca-tickets'), // persiste el ticket entre reinicios
  });

  // Nota de crédito B asociada a la factura B #150
  try {
    const result = await arca.notaCredito({
      ptoVta: 1,
      comprobanteOriginal: {
        tipo: CbteTipo.FACTURA_B,
        ptoVta: 1,
        nro: 150,
      },
      items: [{ neto: 100, iva: IvaTipo.IVA_21 }],
    });
    console.log(`NC aprobada — CAE: ${result.cae}, Cbte #${result.cbteNro}`);
  } catch (e) {
    if (!(e instanceof ArcaRechazoError)) throw e;
    console.error('NC rechazada:', e.observaciones);
  }
}

main().catch(console.error);
