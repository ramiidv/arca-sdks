/**
 * Ejemplo: anular un certificado C2005 emitido.
 *
 *   npx tsx examples/anular-certificado.ts <numeroCertificado>
 */
import { readFileSync } from 'node:fs';
import { ArcaSire, MotivoAnulacion } from '@ramiidv/arca-sire';

async function main() {
  const numeroCertificado = process.argv[2];
  if (!numeroCertificado) throw new Error('Uso: anular-certificado.ts <numeroCertificado>');

  const sire = new ArcaSire({
    cert: readFileSync('./certs/certificado.crt', 'utf-8'),
    key: readFileSync('./certs/clave.key', 'utf-8'),
    cuit: '20123456786',
    production: false,
  });

  const anulacion = await sire.anularCertificado({
    numeroCertificado,
    motivoAnulacion: MotivoAnulacion.CUIT_ERRONEA_SUJETO_RETENIDO,
  });

  console.log('Certificado de anulación:', anulacion.certificadoNro, anulacion.codigoSeguridad);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
