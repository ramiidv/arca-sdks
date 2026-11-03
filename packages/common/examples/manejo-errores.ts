/**
 * Ejemplo: Manejo de errores
 *
 * El SDK provee una jerarquía de errores específicos para
 * distinguir entre problemas de autenticación, SOAP, negocio
 * y validación de datos.
 */
import fs from 'node:fs';
import {
  WsaaClient,
  ArcaError,
  ArcaAuthError,
  ArcaSoapError,
  ArcaServiceError,
  ArcaTicketVigenteError,
  ArcaValidationError,
  arcaSoapCall,
  certificateInfo,
  checkServiceErrors,
  validateCuit,
} from '@ramiidv/arca-common';

// ---------------------------------------------------------------------------
// Error de validación — datos de entrada inválidos
// ---------------------------------------------------------------------------

try {
  validateCuit('INVALIDO');
} catch (e) {
  if (e instanceof ArcaValidationError) {
    console.log('=== Error de validación ===');
    console.log('Mensaje:', e.message);
    console.log('Campo:', e.field);
    console.log('Detalles:');
    for (const detail of e.details) {
      console.log(`  ${detail.field}: ${detail.message} (valor: ${detail.value})`);
    }
  }
}

// ---------------------------------------------------------------------------
// Errores de WSAA y SOAP — autenticación y transporte
// ---------------------------------------------------------------------------

async function ejemploErroresWsaa() {
  const wsaa = new WsaaClient({
    // El constructor valida el certificado y la clave (y que se correspondan):
    // si no, lanza ArcaValidationError sin llamar a WSAA.
    cert: fs.readFileSync('./certs/certificado.crt', 'utf-8'),
    key: fs.readFileSync('./certs/clave.key', 'utf-8'),
    production: false,
  });

  // Vigencia del certificado y CUIT del titular, sin llamar a ARCA.
  const info = certificateInfo(fs.readFileSync('./certs/certificado.crt', 'utf-8'));
  console.log(`Certificado de ${info.cuit ?? info.subject}, vence el ${info.notAfter.toISOString()}`);

  try {
    await wsaa.getAccessTicket('wsfe');
  } catch (e) {
    if (e instanceof ArcaTicketVigenteError) {
      // WSAA ya emitió un TA para este certificado y servicio, pero no está en
      // memoria ni en el ticketStorage: WSAA lo rechaza durante un lapso de retención.
      console.log('TA vigente inaccesible:', e.service, '- reintentar en', e.retryAfterMs, 'ms');
    } else if (e instanceof ArcaAuthError) {
      // getAccessTicket envuelve todo error de login en ArcaAuthError: el
      // original (ArcaSoapError con el Fault de WSAA, timeout, etc.) está en `cause`.
      console.log('=== Error de autenticación ===');
      console.log('Mensaje:', e.message);
      console.log('faultCode:', e.faultCode); // ej: "ns1:cms.cert.expired", "ns1:coe.notAuthorized"
      console.log('HTTP status:', e.statusCode);
      if (e.cause instanceof ArcaSoapError) {
        console.log('Fault de WSAA:', e.cause.faultString, '- incierto:', e.cause.uncertain);
      }

      if (e.retryable) {
        // Transitorio (WSAA no disponible, red, timeout): el cliente rechaza
        // nuevos logins para este servicio durante loginErrorCooldownMs (60 s)
        // sin llamar a WSAA. Reintentar más tarde.
        console.log('Reintentar en un rato.');
      } else {
        // No se resuelve reintentando (certificado vencido o no confiable,
        // servicio no autorizado, firma inválida...): el cliente no vuelve a
        // pedir un TA para este servicio hasta que se corrija la causa.
        // Después de corregirla (ej: autorizar el certificado en ARCA):
        wsaa.resetLoginCooldown('wsfe');
        // Ojo: no borres tickets vigentes (clearTicket/clearAllTickets) "por las
        // dudas": WSAA rechaza los pedidos repetidos durante un lapso de retención.
      }
    } else if (e instanceof ArcaValidationError) {
      // Nombre de servicio inválido.
      console.log('Validación:', e.message);
    }

    // Catch-all: todos extienden ArcaError
    if (e instanceof ArcaError) {
      console.log('Algún error de ARCA:', e.code, e.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Errores de los web services — transporte y negocio
// ---------------------------------------------------------------------------

function describirErrorDeServicio(e: unknown) {
  if (e instanceof ArcaSoapError) {
    // Timeout, HTTP 5xx, SOAP Fault, red caída
    console.log('=== Error de transporte ===');
    console.log('Mensaje:', e.message);
    console.log('HTTP status:', e.statusCode); // undefined si fue timeout/red
    console.log('Body (extracto):', e.responseBody); // ej: página de error de un proxy
    console.log('Detail del Fault:', e.faultDetail);
    // En una emisión, `uncertain: true` = no se sabe si ARCA la procesó: consultar antes de reintentar.
    console.log('Incierto:', e.uncertain);
  } else if (e instanceof ArcaServiceError) {
    // Error funcional de ARCA (códigos de error del web service)
    console.log('=== Error de servicio ===');
    for (const err of e.errors) {
      console.log(`  [${err.code}] ${err.msg}`);
    }
  } else {
    throw e;
  }
}

async function ejemploErroresDeServicio() {
  // Transporte: una llamada SOAP (FEDummy de WSFEv1 en homologación, sin autenticación)
  // lanza ArcaSoapError si falla la red, hay timeout, HTTP no-2xx o SOAP Fault.
  try {
    const estado = await arcaSoapCall(
      'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
      'http://ar.gov.afip.dif.FEV1/',
      'FEDummy',
      {},
      { qualified: true, soapActionFromMethod: true, timeout: 10_000 },
    );
    console.log('FEDummy:', estado);
  } catch (e) {
    describirErrorDeServicio(e);
  }

  // Negocio: los errores funcionales vienen dentro de la respuesta. checkServiceErrors
  // los lanza como ArcaServiceError (formato de WSFEv1: Errors.Err[]).
  try {
    checkServiceErrors({ Errors: { Err: [{ Code: 10016, Msg: 'Mensaje de error de ARCA' }] } }, 'WSFE');
  } catch (e) {
    describirErrorDeServicio(e);
  }
}

async function main() {
  try {
    await ejemploErroresWsaa();
  } catch (e) {
    // getAccessTicket ya se maneja adentro: acá llegan los errores del constructor
    // (certificado o clave inválidos) o de lectura de los archivos.
    if (e instanceof ArcaValidationError) console.log('Certificado o clave inválidos:', e.message);
    else console.error(e);
  }
  await ejemploErroresDeServicio();
}

main().catch(console.error);
