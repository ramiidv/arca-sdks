/**
 * Ejemplo: Manejo de errores
 *
 * El SDK provee clases de error específicas para catch granular:
 *   - ArcaResultadoIncierto: no se sabe si la factura se emitió (ver emision-segura.ts)
 *   - ArcaRechazoError: ARCA rechazó el comprobante (Resultado "R", no se emitió)
 *   - ArcaWSFEError: ARCA rechazó el request con errores (Errors, no se emitió)
 *   - ArcaValidationError: datos inválidos (no se envió nada)
 *   - ArcaTicketVigenteError: WSAA ya emitió un TA que no tenemos (falta ticketStorage)
 *   - ArcaAuthError: falla de autenticación WSAA, o ARCA rechazó el ticket (600/601)
 *   - ArcaSoapError: error HTTP/SOAP en consultas, o emisión que con certeza no se envió
 *   - ArcaResponseError: ARCA respondió con una forma inesperada
 */

import fs from 'node:fs';
import {
  ArcaFacturacion,
  CbteTipo,
  IvaTipo,
  ArcaAuthError,
  ArcaRechazoError,
  ArcaTicketVigenteError,
  ArcaResultadoIncierto,
  ArcaValidationError,
  ArcaWSFEError,
  ArcaSoapError,
  FileTicketStorage,
  requiereRecuperacion,
} from '@ramiidv/arca-facturacion';

async function main() {
  const arca = new ArcaFacturacion({
    cuit: 20123456786,
    cert: fs.readFileSync('./certs/certificado.crt', 'utf-8'),
    key: fs.readFileSync('./certs/clave.key', 'utf-8'),
    production: false,
    timeout: 60_000, // 60s para servidores lentos
    ticketStorage: new FileTicketStorage('./.arca-tickets'),
  });

  try {
    const result = await arca.facturar({
      ptoVta: 1,
      cbteTipo: CbteTipo.FACTURA_B,
      items: [{ neto: 100, iva: IvaTipo.IVA_21 }],
    });

    // Si llega acá, está aprobada.
    console.log(`CAE: ${result.cae}`);
  } catch (e) {
    if (e instanceof ArcaRechazoError) {
      // ARCA respondió pero rechazó el comprobante. En WSFEv1 los motivos vienen en observaciones.
      if (requiereRecuperacion(e)) {
        // 10016: el número ya se usó; si hubo un intento previo, resolver con recuperarComprobante
        console.error('El número no es el próximo: quizá un intento anterior sí se autorizó.');
        return;
      }
      console.error(`Rechazada (${e.operacion}):`, e.observaciones);
    } else if (e instanceof ArcaResultadoIncierto) {
      // No se sabe si se emitió: resolverlo consultando a ARCA
      const r = await arca.recuperarComprobante(e.intento);
      console.log('Recuperación:', r.estado);
    } else if (e instanceof ArcaValidationError) {
      console.error(`Dato inválido en ${e.field}:`, e.message);
    } else if (e instanceof ArcaTicketVigenteError) {
      console.error('Hay un TA vigente que no está en el storage: esperar a que venza.');
    } else if (e instanceof ArcaAuthError) {
      // Certificado inválido o vencido, servicio no autorizado o CUIT no relacionada (600/601).
      // No borrar el ticket: WSAA no emite otro mientras el actual siga vigente.
      console.error('Error de autenticación:', e.faultCode, e.retryable, e.message);
    } else if (e instanceof ArcaWSFEError) {
      // Error de negocio con códigos de ARCA
      for (const err of e.errors) {
        console.error(`ARCA [${err.code}]: ${err.msg}`);
      }
    } else if (e instanceof ArcaSoapError) {
      // Consultas: timeout, HTTP 500, SOAP Fault. Emisiones: sin conexión (uncertain: false).
      console.error('Error de conexión:', e.message, 'incierto:', e.uncertain);
      if (e.statusCode) console.error('HTTP status:', e.statusCode);
    } else {
      throw e;
    }
  }
}

main().catch(console.error);
