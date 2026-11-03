/**
 * Ejemplo: ¿la CUIT receptora está obligada a recibir Factura de Crédito Electrónica?
 */

import fs from 'node:fs';
import { ArcaFecred, FileTicketStorage } from '@ramiidv/arca-fecred';

async function main() {
  const fecred = new ArcaFecred({
    cert: fs.readFileSync('./certs/certificado.crt', 'utf-8'),
    key: fs.readFileSync('./certs/clave.key', 'utf-8'),
    cuit: '20123456786',
    production: false,
    ticketStorage: new FileTicketStorage('./.arca-tickets'),
  });

  console.log(await fecred.status()); // { appserver: 'OK', dbserver: 'OK', authserver: 'OK' }

  // Para una fecha de emisión: si está obligada y desde qué monto
  const monto = await fecred.consultarMontoObligadoRecepcion({
    cuitConsultada: '30712345671',
    fechaEmision: '2026-11-01',
  });
  if (monto.obligado) {
    console.log(`Obligada a recibir FCE desde $${monto.montoDesde ?? '(monto no informado)'}`);
  } else {
    console.log('No obligada a recibir FCE');
  }

  // `consultarObligadoRecepcion` (sin fecha) fue discontinuada por el manual (§2.4.13)
  // y el SDK no la incluye: consultarMontoObligadoRecepcion la reemplaza.
}

main().catch(console.error);
