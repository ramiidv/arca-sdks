/**
 * Ejemplo: manejo de errores
 *
 *   - ArcaValidationError: datos de entrada inválidos (no se llama a ARCA)
 *   - ArcaTicketVigenteError: WSAA ya emitió un ticket (configurá ticketStorage)
 *   - ArcaAuthError: falla de autenticación WSAA
 *   - ArcaServiceError: ARCA devolvió Errors (formato, auth 600-602, infraestructura 500-503)
 *   - ArcaResponseError: ARCA respondió con una forma inesperada
 *   - ArcaSoapError: error HTTP/SOAP (timeout, SOAP Fault)
 *
 * Un rechazo funcional (resultado "R") NO es un error: se devuelve con sus
 * observaciones.
 */

import fs from 'node:fs';
import {
  ArcaCdc,
  ArcaAuthError,
  ArcaResponseError,
  ArcaServiceError,
  ArcaSoapError,
  ArcaTicketVigenteError,
  ArcaValidationError,
  FileTicketStorage,
} from '@ramiidv/arca-cdc';

async function main() {
  const cdc = new ArcaCdc({
    cuit: 20123456786,
    cert: fs.readFileSync('./certs/certificado.crt', 'utf-8'),
    key: fs.readFileSync('./certs/clave.key', 'utf-8'),
    production: false,
    timeout: 60_000,
    ticketStorage: new FileTicketStorage('./.arca-tickets'),
  });

  try {
    const result = await cdc.constatar(
      {
        cbteModo: 'CAE',
        cuitEmisor: 30712345671,
        ptoVta: 1,
        cbteTipo: 6, // Factura B: el receptor es opcional
        cbteNro: 150,
        cbteFch: '20260315',
        impTotal: 12100,
        codAutorizacion: '73429843294823',
      },
      { signal: AbortSignal.timeout(90_000) },
    );

    if (result.resultado === 'R') {
      console.error('Comprobante rechazado:');
      for (const obs of result.observaciones) {
        console.error(`  [${obs.code}] ${obs.msg}`);
      }
      return;
    }
    console.log('Comprobante constatado.');
  } catch (e) {
    if (e instanceof ArcaValidationError) {
      for (const d of e.details) console.error(`Campo ${d.field}: ${d.message}`);
    } else if (e instanceof ArcaTicketVigenteError) {
      console.error(
        'WSAA ya emitió un ticket que no está en el storage; reintentá en',
        e.retryAfterMs,
        'ms (y usá ticketStorage).',
      );
    } else if (e instanceof ArcaAuthError) {
      // Borrar el ticket no sirve: WSAA rechaza los pedidos repetidos por unos minutos. Corregí la causa
      // (certificado vencido, servicio wscdc no asociado, etc.). Tras un error no reintentable
      // (e.retryable === false) el SDK bloquea nuevos logins: después de corregirlo, llamá a
      // cdc.wsaa.resetLoginCooldown('wscdc') para volver a intentar sin reiniciar el proceso.
      console.error('Error de autenticación:', e.message, e.retryable ? '(transitorio)' : '(corregir la causa)');
    } else if (e instanceof ArcaServiceError) {
      for (const err of e.errors) console.error(`ARCA [${err.code}]: ${err.msg}`);
    } else if (e instanceof ArcaResponseError) {
      console.error('Respuesta inesperada de ARCA:', e.message);
    } else if (e instanceof ArcaSoapError) {
      // Es una consulta: se puede reintentar sin riesgo.
      console.error('Error de conexión:', e.message, e.statusCode ?? '');
    } else {
      throw e;
    }
  }
}

main().catch(console.error);
