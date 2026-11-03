/**
 * Ejemplo: manejo de errores al emitir.
 *
 * - ArcaValidationError: datos inválidos (no se llamó a ARCA).
 * - ArcaSireServiceError (un ArcaRechazoError): ARCA rechazó el certificado (no se emitió).
 *   `operacion` es 'emitir' o 'anular'.
 * - ArcaSoapError / ArcaResponseError con uncertain=true: no se sabe si se emitió. No reintentar a ciegas.
 * - ArcaAuthError: falla de WSAA o SIRE rechazó el token/sign (el SDK no borra el ticket cacheado;
 *   si está dañado, clearAuthCache()).
 */
import { readFileSync } from 'node:fs';
import {
  ArcaAuthError,
  ArcaResponseError,
  ArcaSire,
  ArcaSireServiceError,
  ArcaSoapError,
  ArcaValidationError,
  Condicion,
  TipoComprobante,
} from '@ramiidv/arca-sire';
import type { EmitirCertificadoParams } from '@ramiidv/arca-sire';

async function main() {
  const sire = new ArcaSire({
    cert: readFileSync('./certs/certificado.crt', 'utf-8'),
    key: readFileSync('./certs/clave.key', 'utf-8'),
    cuit: '20123456786',
    production: false,
    timeout: 60_000,
  });

  const datos: EmitirCertificadoParams = {
    codigoTrazabilidad: 'OP-2026-000124', // guardalo junto con la operación antes de llamar
    regimen: 831,
    condicion: Condicion.NO_INSCRIPTO,
    fechaRetencion: new Date(),
    imposibilidadRetencion: false,
    importeRetencion: 1500.5,
    importeBaseCalculo: 10000,
    regimenExclusion: false,
    tipoComprobante: TipoComprobante.RECIBO,
    fechaComprobante: new Date(),
    numeroComprobante: '00001-00000042',
    importeComprobante: 12100,
    cuitRetenido: '30500010912',
  };

  try {
    const res = await sire.emitirCertificado(datos);
    console.log('Emitido:', res.certificadoNro);
  } catch (err) {
    if (err instanceof ArcaValidationError) {
      for (const d of err.details) console.error(`Campo ${d.field}: ${d.message}`);
    } else if (err instanceof ArcaSireServiceError) {
      console.error(`ARCA rechazó el certificado (${err.operacion}):`, err.errors[0]?.msg ?? err.message);
    } else if ((err instanceof ArcaSoapError || err instanceof ArcaResponseError) && err.uncertain) {
      console.error(
        `Resultado incierto para ${datos.codigoTrazabilidad}: verificar en el micrositio SIRE antes de reintentar.`,
        err.message,
      );
    } else if (err instanceof ArcaAuthError) {
      console.error('Error de autenticación (WSAA o token/sign rechazado por SIRE):', err.message);
    } else {
      throw err;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
