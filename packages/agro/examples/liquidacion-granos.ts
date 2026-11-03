/**
 * Ejemplo: Liquidación Primaria de Granos (WSLPG).
 *
 * 1. Paramétricas (granos, puertos, tipos de operación)
 * 2. Último número de orden + autorización
 * 3. Consulta por COE (con PDF) y anulación por contradocumento
 */
import fs from 'node:fs';
import { ArcaAgro, FileTicketStorage } from '@ramiidv/arca-agro';

const CUIT = '20123456786';

const agro = new ArcaAgro({
  cuit: CUIT,
  cert: fs.readFileSync('./certs/certificado.crt', 'utf-8'),
  key: fs.readFileSync('./certs/clave.key', 'utf-8'),
  production: false,
  ticketStorage: new FileTicketStorage('.arca-tickets'),
});

async function main() {
  // 1. Paramétricas
  console.log('Granos:', (await agro.lpg.tipoGranoConsultar()).slice(0, 5));
  console.log('Puertos:', (await agro.lpg.puertoConsultar()).slice(0, 5));
  console.log('Actividades:', await agro.lpg.tipoActividadRepresentadoConsultar());
  console.log('Tipos de operación (act. 40):', await agro.lpg.tipoOperacionXActividadConsultar(40));

  // 2. Autorización
  const ptoEmision = 1;
  const nroOrden = (await agro.lpg.liquidacionUltimoNroOrdenConsultar(ptoEmision)) + 1;

  // Valores ilustrativos: los códigos de actividad, operación, puerto, grano,
  // deducciones y retenciones salen de las paramétricas (tipoActividad*, tipoOperacion*,
  // puertoConsultar, tipoGranoConsultar, tipoDeduccionConsultar, tipoRetencionConsultar).
  const { autorizacion, eventos } = await agro.lpg.liquidacionAutorizar({
    liquidacion: {
      ptoEmision,
      nroOrden,
      cuitComprador: CUIT,
      nroActComprador: 40,
      nroIngBrutoComprador: 901234567,
      codTipoOperacion: '1',
      esLiquidacionPropia: 'N',
      esCanje: 'N',
      codPuerto: 14,
      desPuertoLocalidad: 'Rosario',
      codGrano: 31,
      cuitVendedor: '30712345671',
      nroIngBrutoVendedor: 900123,
      actuaCorredor: 'N',
      liquidaCorredor: 'N',
      fechaPrecioOperacion: '2026-10-30',
      precioRefTn: 250000,
      // Grado entregado: los códigos y valores de cada grano salen de
      // codigoGradoEntregadoXTipoGranoConsultar(codGrano).
      codGradoEnt: 'G2',
      valGradoEnt: 1,
      factorEnt: 100,
      precioFleteTn: 0,
      alicIvaOperacion: 10.5,
      campaniaPPal: 2526,
      codLocalidadProcedencia: 3,
      codProvProcedencia: 1,
      // Sin certificados de depósito se informan el peso y la procedencia sin
      // certificado; con `certificados`, ninguno de los tres (errores 1644 y 1646).
      pesoNetoSinCertificado: 30000,
      codLocalidadProcedenciaSinCertificado: 3,
      codProvProcedenciaSinCertificado: 1,
    },
    deducciones: [{ codigoConcepto: 'CO', detalleAclaratorio: 'Comisión', comisionGastosAdm: 1.5, alicuotaIva: 21 }],
    retenciones: [{ codigoConcepto: 'RG', baseCalculo: 7500000, alicuota: 2 }],
  });
  console.log('COE:', autorizacion.coe, 'neto a pagar:', autorizacion.totalNetoAPagar);
  for (const e of eventos) console.log(`Evento ${e.codigo}: ${e.descripcion}`);

  // 3. Consulta con PDF y anulación
  const consulta = await agro.lpg.liquidacionXCoeConsultar(autorizacion.coe, { pdf: true });
  if (consulta.pdf) fs.writeFileSync(`lpg-${autorizacion.coe}.pdf`, Buffer.from(consulta.pdf, 'base64'));

  // Anulación por contradocumento: una nueva liquidación (consume el siguiente
  // número de orden) que queda en estado PA hasta que el vendedor la acepta.
  const contra = await agro.lpg.lpgAnularContraDocumento({
    anulacionBase: { puntoEmision: ptoEmision, nroOrden: nroOrden + 1, coeAnular: autorizacion.coe },
  });
  console.log('Contradocumento:', contra.autorizacion.coe, 'estado:', contra.autorizacion.estado);
}

main().catch(console.error);
