/**
 * Ejemplo: recorrer las FCE recibidas, aceptar una y rechazar otra.
 */

import fs from "fs";
import { ArcaFecred, ArcaSoapError, FileTicketStorage } from "@ramiidv/arca-fecred";

async function main() {
  const fecred = new ArcaFecred({
    cert: fs.readFileSync("./certs/certificado.crt", "utf-8"),
    key: fs.readFileSync("./certs/clave.key", "utf-8"),
    cuit: "20123456786",
    production: false,
    ticketStorage: new FileTicketStorage("./.arca-tickets"),
  });

  // 1. Cuentas corrientes como receptor, emitidas en octubre (paginado)
  let nroPagina = 1;
  for (;;) {
    const pagina = await fecred.consultarCtasCtes({
      rol: "Receptor",
      fecha: { tipo: "Emision", desde: "2026-10-01", hasta: "2026-10-31" },
      estadoCtaCte: "Modificable",
      nroPagina,
    });
    for (const cta of pagina.ctasCtes) {
      const f = cta.idFacturaCredito;
      console.log(
        `CtaCte ${cta.codCtaCte}: ${f.codTipoCmp} ${f.ptoVta}-${f.nroCmp} de ${f.cuitEmisor}, ` +
          `saldo ${cta.saldo} ${cta.codMoneda} (${cta.estadoCtaCte.estado})`,
      );
    }
    if (!pagina.hayMas) break;
    nroPagina++;
  }

  // 2. Detalle de una cuenta corriente
  const { ctaCte } = await fecred.consultarCtaCte({ codCtaCte: "1234567890" });

  // 3. Aceptar. Las tablas de códigos salen de consultarTipos*().
  const formas = await fecred.consultarTiposFormasCancelacion();
  try {
    const r = await fecred.aceptarFECred({
      idCtaCte: { codCtaCte: ctaCte.codCtaCte },
      saldoAceptado: ctaCte.saldo,
      codMoneda: ctaCte.codMoneda,
      cotizacionMonedaUlt: ctaCte.cotizacionMonedaUlt,
      formasCancelacion: [formas[0]],
    });
    console.log(`Aceptada: resultado ${r.resultado}`, r.observaciones);
  } catch (e) {
    if (e instanceof ArcaSoapError && e.uncertain) {
      // La aceptación pudo haberse registrado: verificar antes de reintentar.
      const { estados } = await fecred.consultarHistorialEstadosCtaCte({ codCtaCte: ctaCte.codCtaCte });
      console.log("Estado actual:", estados.at(-1));
    } else {
      throw e;
    }
  }

  // 4. Rechazar otra FCE identificándola por la factura
  const motivos = await fecred.consultarTiposMotivosRechazo();
  await fecred.rechazarFECred({
    idCtaCte: { idFactura: { cuitEmisor: "30712345671", codTipoCmp: 201, ptoVta: 3, nroCmp: 125 } },
    motivos: [
      {
        codMotivo: motivos[0].codigo,
        descMotivo: motivos[0].descripcion,
        justificacion: "La mercadería no fue entregada",
      },
    ],
  });

  // 5. Informar la cancelación total de una FCE aceptada
  await fecred.informarCancelacionTotalFECred({
    idCtaCte: { codCtaCte: "1234567891" },
    formasCancelacion: [formas[0]],
    importeCancelacion: 121000,
  });
}

main().catch(console.error);
