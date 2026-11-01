/**
 * Ejemplo: constatar un comprobante recibido
 *
 * Verifica con el WSCDC que un comprobante (propio o de un proveedor) fue
 * autorizado por ARCA con el CAE, CAI o CAEA informado.
 */

import fs from "node:fs";
import { ArcaCdc } from "@ramiidv/arca-cdc";

async function main() {
  const cdc = new ArcaCdc({
    cuit: 20123456786, // CUIT que consulta (representada en el certificado)
    cert: fs.readFileSync("./certs/certificado.crt", "utf-8"),
    key: fs.readFileSync("./certs/clave.key", "utf-8"),
    production: false,
  });

  console.log("Estado del servicio:", await cdc.status());

  const result = await cdc.constatar({
    CbteModo: "CAE",
    CuitEmisor: "30-71234567-1", // CUIT del proveedor que emitió la factura
    PtoVta: 1,
    CbteTipo: 1, // Factura A
    CbteNro: 150,
    CbteFch: "2026-03-15",
    ImpTotal: 12100,
    CodAutorizacion: "73429843294823",
    DocTipoReceptor: 80, // CUIT (obligatorio en comprobantes A)
    DocNroReceptor: 20123456786,
  });

  if (result.Resultado === "A") {
    console.log(`Comprobante CONSTATADO (${result.FchProceso}).`);
  } else {
    console.log("Comprobante RECHAZADO:");
  }
  for (const obs of result.Observaciones) {
    console.log(`  Observación [${obs.Code}]: ${obs.Msg}`);
  }
}

main().catch(console.error);
