/**
 * Ejemplo: Consultas de parámetros y comprobantes (WSFE + WSFEX)
 */

import fs from 'node:fs';
import { ArcaFacturacion, CbteTipo, ENDPOINTS, FileTicketStorage, Moneda, WsfeClient } from '@ramiidv/arca-facturacion';

async function main() {
  const arca = new ArcaFacturacion({
    cuit: 20123456786,
    cert: fs.readFileSync('./certs/certificado.crt', 'utf-8'),
    key: fs.readFileSync('./certs/clave.key', 'utf-8'),
    production: false,
    ticketStorage: new FileTicketStorage('./.arca-tickets'), // persiste el ticket entre reinicios
  });

  // Tipos de comprobante disponibles
  const tiposCbte = await arca.getTiposComprobante();
  console.log('Tipos de comprobante:', tiposCbte);

  // Tipos de documento
  const tiposDoc = await arca.getTiposDocumento();
  console.log('Tipos de documento:', tiposDoc);

  // Tipos de IVA
  const tiposIva = await arca.getTiposIva();
  console.log('Tipos de IVA:', tiposIva);

  // Monedas
  const monedas = await arca.getMonedas();
  console.log('Monedas:', monedas);

  // Puntos de venta habilitados
  const ptosVenta = await arca.getPuntosVenta();
  console.log('Puntos de venta:', ptosVenta);

  // Cotización del dólar
  const cotizacion = await arca.getCotizacion(Moneda.DOLARES);
  console.log(`Cotización USD: ${cotizacion.monCotiz} (${cotizacion.fchCotiz})`);

  // Cotización a una fecha puntual
  const cotizacionAyer = await arca.getCotizacion(Moneda.DOLARES, { fecha: '20261030' });
  console.log('Cotización USD al 30/10:', cotizacionAyer.monCotiz);

  // Actividades del emisor (para informar en Actividades)
  console.log('Actividades:', await arca.getActividades());

  // Condiciones de IVA válidas para el receptor
  const condicionesIva = await arca.getCondicionesIva();
  console.log('Condiciones IVA:', condicionesIva);

  // Último comprobante autorizado
  const ultimoNro = await arca.ultimoComprobante(1, CbteTipo.FACTURA_B);
  console.log('Último Factura B en PtoVta 1:', ultimoNro);

  // Consultar un comprobante específico
  if (ultimoNro > 0) {
    const comprobante = await arca.consultarComprobante(CbteTipo.FACTURA_B, 1, ultimoNro);
    console.log('Comprobante consultado:', comprobante.resultGet);
  }

  // ============================================================
  // Parámetros WSFEX (exportación)
  // ============================================================

  const paises = await arca.getPaisesExpo();
  console.log('Países destino:', paises.slice(0, 5), '...');

  const incoterms = await arca.getIncotermsExpo();
  console.log('Incoterms:', incoterms);

  const unidades = await arca.getUMedExpo();
  console.log('Unidades de medida:', unidades.slice(0, 5), '...');

  const tiposExpo = await arca.getTiposExpo();
  console.log('Tipos de exportación:', tiposExpo);

  // ============================================================
  // Cliente de bajo nivel (uso avanzado)
  // ============================================================

  // Endpoint explícito (ENDPOINTS.wsfe.testing / .production, o un proxy) y transporte opcional.
  // Las operaciones autenticadas reciben el Auth ({ token, sign, cuit }) en cada llamada.
  const wsfe = new WsfeClient({ endpoint: ENDPOINTS.wsfe.testing, transport: { timeout: 10_000 } });
  console.log('FEDummy:', await wsfe.dummy());
}

main().catch(console.error);
