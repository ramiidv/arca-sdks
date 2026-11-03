/**
 * Ejemplo: manejo de errores
 *
 *   - ArcaValidationError: datos de entrada inválidos (no se llega a llamar a ARCA)
 *   - ArcaAuthError / ArcaTicketVigenteError: falla de autenticación WSAA (o Fault wscommon_* de WSFECRED)
 *   - ArcaServiceError: ARCA rechazó la operación (arrayErrores, arrayErroresFormato o resultado R)
 *   - ArcaSoapError: HTTP, timeout o SOAP Fault. `uncertain` indica si ARCA pudo haberla procesado.
 */

import fs from 'node:fs';
import {
  ArcaFecred,
  ArcaAuthError,
  ArcaServiceError,
  ArcaSoapError,
  ArcaTicketVigenteError,
  ArcaValidationError,
  WSFECRED_ERRORES_REINTENTABLES,
} from '@ramiidv/arca-fecred';

async function main() {
  const fecred = new ArcaFecred({
    cert: fs.readFileSync('./certs/certificado.crt', 'utf-8'),
    key: fs.readFileSync('./certs/clave.key', 'utf-8'),
    cuit: '20123456786',
    production: false,
    timeout: 60_000,
  });

  try {
    await fecred.aceptarFECred({
      idCtaCte: { codCtaCte: '1234567890' },
      saldoAceptado: 121000,
      codMoneda: 'PES',
      cotizacionMonedaUlt: 1,
    });
  } catch (e) {
    if (e instanceof ArcaValidationError) {
      for (const d of e.details) console.error(`Campo ${d.field}: ${d.message}`);
    } else if (e instanceof ArcaTicketVigenteError) {
      console.error('WSAA ya emitió un TA que no está en el ticketStorage; reintentá en', e.retryAfterMs, 'ms.');
    } else if (e instanceof ArcaAuthError) {
      console.error('Error de autenticación:', e.faultCode, e.message);
      // No borres el ticket (clearAuthCache): WSAA rechaza los pedidos repetidos
      // durante un lapso de retención (minutos). Si no es reintentable (ej: coe.notAuthorized), corregí la causa
      // en ARCA (asociar wsfecred al certificado) y después:
      if (!e.retryable) fecred.wsaa.resetLoginCooldown('wsfecred');
    } else if (e instanceof ArcaServiceError) {
      for (const err of e.errors) console.error(`ARCA [${err.rawCode ?? err.code}]: ${err.msg}`);
      // 1103 ("reinténtelo más tarde"): no se procesó, se puede reintentar más tarde.
      if (e.errors.some((err) => WSFECRED_ERRORES_REINTENTABLES.includes(err.code)))
        console.error('Reintentar más tarde');
    } else if (e instanceof ArcaSoapError) {
      if (e.uncertain) {
        // No se sabe si ARCA aceptó la FCE: consultar el estado antes de reintentar.
        const { ctaCte } = await fecred.consultarCtaCte({ codCtaCte: '1234567890' });
        console.error('Resultado incierto. Estado actual:', ctaCte?.estadoCtaCte.estado);
      } else {
        console.error('Error de conexión (no procesado):', e.message);
      }
    } else {
      throw e;
    }
  }
}

main().catch(console.error);
