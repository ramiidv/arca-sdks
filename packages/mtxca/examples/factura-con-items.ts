/**
 * Ejemplo: Factura B con detalle de ítems (WSMTXCA, homologación).
 *
 * En clase B el precio unitario incluye IVA y los ítems no llevan importeIVA;
 * el SDK valida que gravado, subtotales de IVA y total sean coherentes. Con
 * el CAE se arma la URL del código QR (RG 4892).
 */

import fs from 'node:fs';
import {
  ArcaMtxca,
  ArcaRechazoError,
  ArcaResponseError,
  ArcaSoapError,
  CbteTipo,
  CodigoCondicionIVA,
  Concepto,
  FileTicketStorage,
  Moneda,
} from '@ramiidv/arca-mtxca';
import type { AutorizarRequest } from '@ramiidv/arca-mtxca';

async function main() {
  const mtxca = new ArcaMtxca({
    cert: fs.readFileSync('./certs/certificado.crt', 'utf-8'),
    key: fs.readFileSync('./certs/clave.key', 'utf-8'),
    cuit: '20123456786',
    production: false,
    ticketStorage: new FileTicketStorage('./.arca-tickets'), // persiste el ticket entre reinicios
  });

  const ptoVta = 4000;
  const tipo = CbteTipo.FACTURA_B;

  // Número explícito: si la respuesta se pierde, sabemos qué número verificar.
  const numero = await mtxca.siguienteComprobante(ptoVta, tipo);

  const req: AutorizarRequest = {
    codigoTipoComprobante: tipo,
    numeroPuntoVenta: ptoVta,
    numeroComprobante: numero,
    fechaEmision: new Date(),
    condicionIVAReceptor: 5, // Consumidor Final (ver getCondicionesIVAReceptor(6))
    importeGravado: 100,
    importeNoGravado: 0,
    importeExento: 100,
    importeSubtotal: 200,
    importeTotal: 221,
    codigoMoneda: Moneda.PESOS,
    cotizacionMoneda: 1,
    codigoConcepto: Concepto.PRODUCTOS,
    items: [
      {
        unidadesMtx: 1,
        codigoMtx: '7790001000012',
        codigo: 'P0001',
        descripcion: 'Producto gravado 21%',
        cantidad: 1,
        codigoUnidadMedida: 7,
        precioUnitario: 121, // con IVA
        codigoCondicionIVA: CodigoCondicionIVA.IVA_21,
        importeItem: 121,
      },
      {
        unidadesMtx: 1,
        codigoMtx: '7790001000029',
        codigo: 'P0002',
        descripcion: 'Producto exento',
        cantidad: 2,
        codigoUnidadMedida: 7,
        precioUnitario: 50,
        codigoCondicionIVA: CodigoCondicionIVA.EXENTO,
        importeItem: 100,
      },
    ],
    subtotalesIVA: [{ codigo: CodigoCondicionIVA.IVA_21, importe: 21 }],
  };

  try {
    // Si ARCA lo rechaza, lanza ArcaRechazoError: acá siempre llega un comprobante aprobado (A u O).
    const res = await mtxca.autorizar(req);
    console.log(`Resultado ${res.resultado}: CAE ${res.comprobante.cae}, vence ${res.comprobante.fechaVencimientoCAE}`);
    for (const o of res.observaciones) console.warn(`Observación ${o.codigo}: ${o.descripcion}`);
    console.log('QR:', mtxca.urlQR(req, res));
  } catch (e) {
    if (e instanceof ArcaRechazoError) {
      for (const err of e.errors) console.error(`Rechazado [${err.code}] ${err.msg}`);
      return;
    }
    if ((e instanceof ArcaSoapError || e instanceof ArcaResponseError) && e.uncertain) {
      // No reintentar a ciegas: verificar si quedó autorizado.
      if ((await mtxca.ultimoComprobante(ptoVta, tipo)) >= numero) {
        const { comprobante } = await mtxca.consultarComprobante(tipo, ptoVta, numero);
        console.log('Ya estaba autorizado. CAE:', comprobante.codigoAutorizacion);
        return;
      }
      console.error('No se autorizó; se puede reenviar con el mismo número.');
    }
    throw e;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
