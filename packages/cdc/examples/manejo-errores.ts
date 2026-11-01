/**
 * Ejemplo: manejo de errores
 *
 *   - ArcaValidationError: datos de entrada inválidos (no se llama a ARCA)
 *   - ArcaTicketVigenteError: WSAA ya emitió un ticket (configurá ticketStorage)
 *   - ArcaAuthError: falla de autenticación WSAA
 *   - ArcaServiceError: ARCA devolvió Errors (formato, auth 600-602, infraestructura 500-503)
 *   - ArcaSoapError: error HTTP/SOAP (timeout, SOAP Fault, respuesta inválida)
 *
 * Un rechazo funcional (Resultado "R") NO es un error: se devuelve con sus
 * Observaciones.
 */

import fs from "node:fs";
import {
  ArcaCdc,
  ArcaAuthError,
  ArcaServiceError,
  ArcaSoapError,
  ArcaTicketVigenteError,
  ArcaValidationError,
  FileTicketStorage,
} from "@ramiidv/arca-cdc";

async function main() {
  const cdc = new ArcaCdc({
    cuit: 20123456786,
    cert: fs.readFileSync("./certs/certificado.crt", "utf-8"),
    key: fs.readFileSync("./certs/clave.key", "utf-8"),
    production: false,
    timeout: 60_000,
    ticketStorage: new FileTicketStorage("./.arca-tickets"),
  });

  try {
    const result = await cdc.constatar(
      {
        CbteModo: "CAE",
        CuitEmisor: 30712345671,
        PtoVta: 1,
        CbteTipo: 6, // Factura B: el receptor es opcional
        CbteNro: 150,
        CbteFch: "20260315",
        ImpTotal: 12100,
        CodAutorizacion: "73429843294823",
      },
      { signal: AbortSignal.timeout(90_000) },
    );

    if (result.Resultado === "R") {
      console.error("Comprobante rechazado:");
      for (const obs of result.Observaciones) {
        console.error(`  [${obs.Code}] ${obs.Msg}`);
      }
      return;
    }
    console.log("Comprobante constatado.");
  } catch (e) {
    if (e instanceof ArcaValidationError) {
      for (const d of e.details) console.error(`Campo ${d.field}: ${d.message}`);
    } else if (e instanceof ArcaTicketVigenteError) {
      console.error("WSAA ya emitió un ticket para este certificado; esperá a que venza o usá ticketStorage.");
    } else if (e instanceof ArcaAuthError) {
      console.error("Error de autenticación:", e.message);
      await cdc.clearAuthCache();
    } else if (e instanceof ArcaServiceError) {
      for (const err of e.errors) console.error(`ARCA [${err.code}]: ${err.msg}`);
    } else if (e instanceof ArcaSoapError) {
      // Es una consulta: se puede reintentar sin riesgo.
      console.error("Error de conexión:", e.message, e.statusCode ?? "");
    } else {
      throw e;
    }
  }
}

main().catch(console.error);
