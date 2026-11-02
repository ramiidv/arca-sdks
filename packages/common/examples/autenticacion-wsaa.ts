/**
 * Ejemplo: Autenticación WSAA
 *
 * Muestra cómo obtener un Ticket de Acceso para cualquier
 * web service de ARCA usando el WsaaClient.
 */
import fs from 'node:fs';
import { WsaaClient, FileTicketStorage } from '@ramiidv/arca-common';

const wsaa = new WsaaClient({
  cert: fs.readFileSync('./cert.pem', 'utf-8'),
  key: fs.readFileSync('./key.pem', 'utf-8'),
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
  const ticketPadron = await wsaa.getAccessTicket('ws_sr_padron_a13');
  console.log('Token padrón:', `${ticketPadron.token.slice(0, 40)}...`);

  // Si un login falló por un error que no se resuelve reintentando (ej: el
  // certificado no estaba autorizado para el servicio), el cliente no vuelve a
  // pedir un TA hasta que lo indiques, después de corregir la causa:
  wsaa.resetLoginCooldown('ws_sr_padron_a13');
  // clearTicket/clearAllTickets borran además los tickets: no los uses con un
  // TA vigente, porque WSAA no emite otro hasta que venza (hasta 12 horas).
}

main().catch(console.error);
