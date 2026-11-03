/**
 * Ejemplo: consultas de parámetros, comprobantes y CAEA.
 */

import fs from 'node:fs';
import { ArcaMtxca, ArcaServiceError, CbteTipo, FileTicketStorage, Moneda } from '@ramiidv/arca-mtxca';

async function main() {
  const mtxca = new ArcaMtxca({
    cert: fs.readFileSync('./certs/certificado.crt', 'utf-8'),
    key: fs.readFileSync('./certs/clave.key', 'utf-8'),
    cuit: '20123456786',
    production: false,
    ticketStorage: new FileTicketStorage('./.arca-tickets'), // persiste el ticket entre reinicios
  });

  console.log('Estado:', await mtxca.status());

  console.log('Tipos de comprobante:', await mtxca.getTiposComprobante());
  console.log('Condiciones de IVA (ítems):', await mtxca.getCondicionesIVA());
  console.log(
    'Condiciones de IVA del receptor (Factura B):',
    await mtxca.getCondicionesIVAReceptor(CbteTipo.FACTURA_B),
  );
  console.log('Unidades de medida:', await mtxca.getUnidadesMedida());
  console.log('Tipos de tributo:', await mtxca.getTiposTributo());
  console.log('Monedas:', await mtxca.getMonedas());
  console.log('Actividades vigentes:', await mtxca.getActividadesVigentes());
  console.log('Puntos de venta CAE:', await mtxca.getPuntosVentaCAE());

  const cot = await mtxca.getCotizacionMoneda(Moneda.DOLARES);
  console.log(
    cot.cotizacion === null
      ? `Sin cotización para ${cot.fechaCotizacion}`
      : `Dólar ${cot.fechaCotizacion}: ${cot.cotizacion}`,
  );

  const ultimo = await mtxca.ultimoComprobante(4000, CbteTipo.FACTURA_A);
  console.log('Último Factura A:', ultimo);
  if (ultimo > 0) {
    const { comprobante } = await mtxca.consultarComprobante(CbteTipo.FACTURA_A, 4000, ultimo);
    console.log(
      `Comprobante ${comprobante.numeroComprobante}: total ${comprobante.importeTotal}, ${comprobante.items.length} ítems`,
    );
  }

  // CAEA otorgados en el mes. Es una consulta: solicitarCAEA, en cambio, pide un CAEA nuevo que
  // después hay que informar (comprobantes con informarComprobanteCAEA o sin movimiento con
  // informarCAEANoUtilizado / informarCAEANoUtilizadoPtoVta).
  const hoy = new Date();
  try {
    const otorgados = await mtxca.consultarCAEAEntreFechas(new Date(hoy.getFullYear(), hoy.getMonth(), 1), hoy);
    for (const caea of otorgados) {
      console.log(
        `CAEA ${caea.caea}: ${caea.fechaDesde} a ${caea.fechaHasta}, informar hasta ${caea.fechaTopeInforme}`,
      );
    }
  } catch (e) {
    if (!(e instanceof ArcaServiceError)) throw e;
    console.error('Consulta de CAEA rechazada:', e.errors);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
