/**
 * Ejemplo: consultas de parámetros, comprobantes y CAEA.
 */

import fs from 'node:fs';
import { ArcaMtxca, ArcaServiceError, CbteTipo, Moneda } from '@ramiidv/arca-mtxca';

async function main() {
  const mtxca = new ArcaMtxca({
    cert: fs.readFileSync('./certs/certificado.crt', 'utf-8'),
    key: fs.readFileSync('./certs/clave.key', 'utf-8'),
    cuit: '20123456786',
    production: false,
  });

  console.log('Estado:', await mtxca.status());

  console.log('Tipos de comprobante:', await mtxca.getTiposComprobante());
  console.log('Condiciones de IVA (ítems):', await mtxca.getCondicionesIVA());
  console.log('Condiciones de IVA del receptor (Factura B):', await mtxca.getCondicionesIVAReceptor(CbteTipo.FACTURA_B));
  console.log('Unidades de medida:', await mtxca.getUnidadesMedida());
  console.log('Tipos de tributo:', await mtxca.getTiposTributo());
  console.log('Monedas:', await mtxca.getMonedas());
  console.log('Actividades vigentes:', await mtxca.getActividadesVigentes());
  console.log('Puntos de venta CAE:', await mtxca.getPuntosVentaCAE());

  const cot = await mtxca.getCotizacionMoneda(Moneda.DOLARES);
  console.log(cot.cotizacion === null ? `Sin cotización para ${cot.fechaCotizacion}` : `Dólar ${cot.fechaCotizacion}: ${cot.cotizacion}`);

  const ultimo = await mtxca.ultimoComprobante(4000, CbteTipo.FACTURA_A);
  console.log('Último Factura A:', ultimo);
  if (ultimo > 0) {
    const { comprobante } = await mtxca.consultarComprobante(CbteTipo.FACTURA_A, 4000, ultimo);
    console.log(`Comprobante ${comprobante.numeroComprobante}: total ${comprobante.importeTotal}, ${comprobante.items.length} ítems`);
  }

  // CAEA de la quincena actual
  const hoy = new Date();
  const periodo = hoy.getFullYear() * 100 + hoy.getMonth() + 1;
  const orden = hoy.getDate() <= 15 ? 1 : 2;
  try {
    const caea = await mtxca.solicitarCAEA(periodo, orden);
    console.log(`CAEA ${caea.caea}: ${caea.fechaDesde} a ${caea.fechaHasta}, informar hasta ${caea.fechaTopeInforme}`);
  } catch (e) {
    if (e instanceof ArcaServiceError) {
      console.error('CAEA rechazado:', e.errors);
      const otorgados = await mtxca.consultarCAEAEntreFechas(new Date(hoy.getFullYear(), hoy.getMonth(), 1), hoy);
      console.log('CAEAs ya otorgados:', otorgados.map((c) => c.caea));
    } else {
      throw e;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
