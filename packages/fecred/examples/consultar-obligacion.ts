/**
 * Ejemplo: ¿la CUIT receptora está obligada a recibir Factura de Crédito Electrónica?
 */

import fs from "fs";
import { ArcaFecred, FileTicketStorage } from "@ramiidv/arca-fecred";

async function main() {
  const fecred = new ArcaFecred({
    cert: fs.readFileSync("./certs/certificado.crt", "utf-8"),
    key: fs.readFileSync("./certs/clave.key", "utf-8"),
    cuit: "20123456786",
    production: false,
    ticketStorage: new FileTicketStorage("./.arca-tickets"),
  });

  console.log(await fecred.status()); // { appserver: 'OK', dbserver: 'OK', authserver: 'OK' }

  // Para una fecha de emisión: si está obligada y desde qué monto
  const monto = await fecred.consultarMontoObligadoRecepcion({
    cuitConsultada: "30712345671",
    fechaEmision: "2026-11-01",
  });
  if (monto.obligado) {
    console.log(`Obligada a recibir FCE desde $${monto.montoDesde ?? "(monto no informado)"}`);
  } else {
    console.log("No obligada a recibir FCE");
  }

  // Sin fecha: si está obligada y desde cuándo
  const obligado = await fecred.consultarObligadoRecepcion("30712345671");
  console.log(obligado.obligado, obligado.desde);
}

main().catch(console.error);
