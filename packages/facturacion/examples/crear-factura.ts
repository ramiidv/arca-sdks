/**
 * Ejemplo: Crear una Factura B para consumidor final
 *
 * Requisitos:
 *   - Certificado digital (.crt) y clave privada (.key) de ARCA
 *   - CUIT del contribuyente
 *   - Punto de venta habilitado para facturación electrónica
 *
 * Para testing/homologación, generá el certificado desde:
 *   https://wsass-homo.afip.gob.ar/wsass/portal/main.aspx
 *
 * Para producción:
 *   https://www.afip.gob.ar/ws/documentacion/certificados.asp
 */

import fs from 'node:fs';
import { ArcaFacturacion, ArcaRechazoError, CbteTipo, FileTicketStorage, IvaTipo } from '@ramiidv/arca-facturacion';

async function main() {
  // 1. Inicializar el SDK
  const arca = new ArcaFacturacion({
    cuit: 20123456786, // Tu CUIT sin guiones
    cert: fs.readFileSync('./certs/certificado.crt', 'utf-8'),
    key: fs.readFileSync('./certs/clave.key', 'utf-8'),
    production: false, // true para producción
    ticketStorage: new FileTicketStorage('./.arca-tickets'), // persiste el ticket entre reinicios
  });

  // 2. Verificar que los servidores estén activos
  const status = await arca.status();
  console.log('Estado servidores:', status);

  // 3. Crear la factura (número, fecha, totales e IVA se calculan automáticamente).
  //    El resultado siempre es un comprobante aprobado: si ARCA lo rechaza, lanza ArcaRechazoError.
  try {
    const result = await arca.facturar({
      ptoVta: 1,
      cbteTipo: CbteTipo.FACTURA_B,
      items: [{ neto: 100, iva: IvaTipo.IVA_21 }],
    });

    console.log('Factura aprobada!');
    console.log(`  CAE: ${result.cae}`);
    console.log(`  Vencimiento: ${result.caeVencimiento}`);
    console.log(`  Comprobante #${result.cbteNro}`);
    console.log(`  Total: $${result.importes.total}`);

    // 4. URL del QR oficial para imprimir en la factura (fecha, receptor,
    //    moneda y CAE salen del resultado; el CUIT, de la instancia).
    const qrUrl = arca.urlQR(result);
    console.log(`  QR: ${qrUrl}`);
  } catch (e) {
    if (!(e instanceof ArcaRechazoError)) throw e;
    // En WSFEv1 los motivos del rechazo vienen como observaciones.
    console.error('Factura rechazada:');
    for (const obs of e.observaciones) {
      console.error(`  [${obs.code}] ${obs.msg}`);
    }
  }
}

main().catch(console.error);
