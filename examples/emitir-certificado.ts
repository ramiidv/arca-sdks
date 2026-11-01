/**
 * Ejemplo: emitir un certificado de retención de IVA (C2005) en homologación.
 *
 *   npx tsx examples/emitir-certificado.ts
 */
import { readFileSync } from 'node:fs';
import { ArcaSire, Condicion, TipoComprobante } from '@ramiidv/arca-sire';

async function main() {
  const sire = new ArcaSire({
    cert: readFileSync('./certs/certificado.crt', 'utf-8'),
    key: readFileSync('./certs/clave.key', 'utf-8'),
    cuit: '20123456786', // CUIT del agente de retención
    production: false,
  });

  console.log('Estado:', await sire.status());

  const certificado = await sire.emitirCertificado({
    codigoTrazabilidad: 'OP-2026-000123',
    regimen: 831,
    condicion: Condicion.INSCRIPTO,
    fechaRetencion: '2026-10-30T11:16:00',
    imposibilidadRetencion: false,
    importeRetencion: 2100,
    importeBaseCalculo: 20000,
    regimenExclusion: false,
    tipoComprobante: TipoComprobante.FACTURA,
    fechaComprobante: '2026-10-30',
    numeroComprobante: '00003-00008497',
    importeComprobante: 24200,
    cuitRetenido: '30500010912',
  });

  console.log('Certificado:', certificado.certificadoNro);
  console.log('Código de seguridad:', certificado.codigoSeguridad);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
