/**
 * Ejemplo: Autenticación WSAA
 *
 * Muestra cómo obtener un Ticket de Acceso para cualquier
 * web service de ARCA usando el WsaaClient.
 */
import fs from 'node:fs';
import { WsaaClient, FileTicketStorage, ArcaAuthError, ArcaTicketVigenteError } from '@ramiidv/arca-common';

const wsaa = new WsaaClient({
  cert: fs.readFileSync('./certs/certificado.crt', 'utf-8'),
  key: fs.readFileSync('./certs/clave.key', 'utf-8'),
  production: false,
  // Persistir el ticket: sin esto, al reiniciar el proceso WSAA rechaza el login
  // ("ya posee un TA válido") hasta que el ticket anterior venza.
  ticketStorage: new FileTicketStorage('./.arca-tickets'),
  // Opcional:
  // timeout: 30_000,
  // retries: 2, // solo errores de red sin enviar (un timeout no se reintenta)
  // tokenTTLMinutes: 720, // vigencia del TRA (1 a 1440), no del TA (WSAA lo emite por 12 h)
  // keyPassphrase: process.env.ARCA_KEY_PASSPHRASE, // si la clave está encriptada
  // retryDelayMs: 1_000,
  // onEvent: (e) => console.log(e.type, e),
});

async function main() {
  // Obtener ticket para WSFE (facturación electrónica)
  const ticket = await wsaa.getAccessTicket('wsfe');
  console.log('Token:', `${ticket.token.slice(0, 40)}...`);
  console.log('Sign:', `${ticket.sign.slice(0, 40)}...`);
  console.log('Expira:', ticket.expirationTime); // string ISO

  // Segunda llamada — devuelve el ticket cacheado (no hace login de nuevo)
  const ticket2 = await wsaa.getAccessTicket('wsfe');
  console.log('¿Mismo ticket?', ticket.token === ticket2.token); // true

  // Obtener ticket para otro servicio (login independiente)
  try {
    const ticketPadron = await wsaa.getAccessTicket('ws_sr_padron_a13');
    console.log('Token padrón:', `${ticketPadron.token.slice(0, 40)}...`);
  } catch (e) {
    if (e instanceof ArcaTicketVigenteError) {
      // Hay un TA vigente que no está en memoria ni en el storage: esperar a que venza.
      console.error('TA vigente inaccesible para', e.service);
    } else if (e instanceof ArcaAuthError && !e.retryable) {
      // Error que no se resuelve reintentando (ej: coe.notAuthorized, el
      // certificado no está asociado al servicio): el cliente no vuelve a pedir
      // un TA hasta que lo indiques. Corregí la causa en ARCA y después:
      console.error('Login rechazado:', e.faultCode, e.message);
      wsaa.resetLoginCooldown('ws_sr_padron_a13');
      // clearTicket/clearAllTickets borran además los tickets: no los uses con un
      // TA vigente, porque WSAA no emite otro hasta que venza (hasta 12 horas).
    } else {
      throw e;
    }
  }
}

main().catch(console.error);
