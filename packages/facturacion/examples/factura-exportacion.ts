/**
 * Ejemplo: Factura de exportación (WSFEX)
 *
 * Usa facturarExpo() que obtiene automáticamente el ID de request
 * y el número de comprobante, y calcula el total por item.
 *
 * Si la respuesta se pierde (ArcaResultadoInciertoExpo), WSFEX permite
 * reenviar la misma solicitud con el mismo Id: si ya estaba autorizada,
 * devuelve el CAE original con reproceso = true, sin duplicar.
 *
 * El Id es único por CUIT: serializá las emisiones de exportación de toda la
 * CUIT. Si dos emisiones usan el mismo Id, la segunda falla con
 * ArcaConflictoExpo (no se autorizó) y se reintenta sin `id`.
 */

import fs from 'node:fs';
import {
  ArcaConflictoExpo,
  ArcaFacturacion,
  ArcaResultadoInciertoExpo,
  CbteTipo,
  FileTicketStorage,
} from '@ramiidv/arca-facturacion';
import type { FacturarExpoOpts } from '@ramiidv/arca-facturacion';

async function main() {
  const arca = new ArcaFacturacion({
    cuit: 20123456786,
    cert: fs.readFileSync('./certs/certificado.crt', 'utf-8'),
    key: fs.readFileSync('./certs/clave.key', 'utf-8'),
    production: false,
    ticketStorage: new FileTicketStorage('./.arca-tickets'), // persiste el ticket entre reinicios
  });

  const opts: FacturarExpoOpts = {
    ptoVta: 1,
    cbteTipo: CbteTipo.FACTURA_E,
    tipoExpo: 1, // 1=Bienes, 2=Servicios, 4=Otros
    pais: 212, // País destino (212 = Estados Unidos, ver getPaisesExpo)
    cliente: {
      nombre: 'ACME Corp',
      cuitPais: 55000002126, // CUIT país de EE.UU. para personas jurídicas (getCuitsPaisExpo)
      domicilio: '123 Main St, New York, NY 10001',
      idImpositivo: '12-3456789',
    },
    moneda: 'DOL',
    cotizacion: 1200,
    formaPago: 'Wire Transfer - 30 days',
    incoterms: 'FOB',
    idioma: 2, // 1=Español, 2=Inglés, 3=Portugués
    items: [
      {
        codigo: 'SKU-001',
        descripcion: 'Industrial Widget',
        cantidad: 100,
        unidad: 7, // 7 = unidades
        precioUnitario: 10,
        // total se calcula automáticamente: 100 * 10 = 1000
      },
      {
        codigo: 'SKU-002',
        descripcion: 'Premium Gasket',
        cantidad: 50,
        unidad: 7,
        precioUnitario: 25,
        bonificacion: 50, // descuento
        // total: 50 * 25 - 50 = 1200
      },
    ],
  };

  let result;
  try {
    result = await arca.facturarExpo(opts);
  } catch (e) {
    if (e instanceof ArcaConflictoExpo) {
      // Otra emisión usó el mismo Id: esta no se autorizó. Reintentar con Id y número nuevos.
      result = await arca.facturarExpo(opts);
    } else if (e instanceof ArcaResultadoInciertoExpo) {
      // Persistí e.intento antes de reintentar. Reenviar con el mismo Id, número y fecha:
      result = await arca.facturarExpo({ ...opts, ...e.intento });
      if (result.reproceso) console.log('WSFEX ya la tenía autorizada (reproceso)');
    } else {
      throw e;
    }
  }

  if (result.aprobada) {
    console.log('Factura de exportación aprobada!');
    console.log(`  CAE: ${result.cae}`);
    console.log(`  Vencimiento: ${result.caeVencimiento}`);
    console.log(`  Comprobante #${result.cbteNro}`);
  } else {
    console.error('Rechazada:', result.obs);
  }
}

main().catch(console.error);
