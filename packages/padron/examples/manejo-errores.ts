/**
 * Ejemplo: Manejo de errores
 *
 * Este ejemplo muestra cómo manejar correctamente los distintos
 * tipos de error que puede arrojar el SDK.
 */

import { readFileSync } from 'fs';
import {
  ArcaPadron,
  ArcaPadronError,
  ArcaAuthError,
  ArcaPadronServiceError,
  ArcaSoapError,
  ArcaValidationError,
} from '@ramiidv/arca-padron';

const client = new ArcaPadron({
  cert: readFileSync('./cert.pem', 'utf-8'),
  key: readFileSync('./key.pem', 'utf-8'),
  cuit: '20123456786',
  production: false,
  // Monitorear eventos
  onEvent: (event) => {
    switch (event.type) {
      case 'auth:login':
        console.log(`[AUTH] Login para servicio: ${event.service}`);
        break;
      case 'auth:cache-hit':
        console.log(`[AUTH] Token reutilizado (${event.source}) para servicio: ${event.service}`);
        break;
      case 'request:start':
        console.log(`[REQ] Iniciando ${event.method} a ${event.endpoint}`);
        break;
      case 'request:end':
        console.log(`[REQ] ${event.method} completado en ${event.durationMs}ms`);
        break;
      case 'request:retry':
        console.log(`[REQ] Reintento #${event.attempt} para ${event.method}: ${String(event.error)}`);
        break;
      case 'request:error':
        console.log(`[REQ] Error en ${event.method}: ${String(event.error)}`);
        break;
    }
  },
});

async function main() {
  try {
    const persona = await client.getPersona('20111111112');
    console.log('Persona encontrada:', persona.idPersona);
  } catch (error) {
    if (error instanceof ArcaValidationError) {
      // CUIT inválida (dígito verificador): no se llegó a llamar a ARCA
      console.error('Dato inválido:', error.message);
    } else if (error instanceof ArcaAuthError) {
      // Error de autenticación con WSAA
      // Posibles causas: certificado vencido, servicio no autorizado, WSAA caído
      console.error('Error de autenticación:', error.message);
      console.error('Verificar certificado y permisos del servicio.');
    } else if (error instanceof ArcaPadronServiceError) {
      // Error de negocio de ARCA (SOAP Fault reconocido): reason tipado
      switch (error.reason) {
        case 'inexistente':
          console.error('La CUIT consultada no existe');
          break;
        case 'inactiva':
          console.error('La CUIT está inactiva (en A13 se puede consultar con getPersonaA13V2)');
          break;
        case 'no_autorizado':
          console.error('El certificado no está autorizado para consultar en nombre de esta CUIT');
          break;
        default:
          console.error('Error del servicio ARCA:', error.errors.map((e) => e.msg).join('; '));
      }
    } else if (error instanceof ArcaSoapError) {
      // Error de transporte/HTTP o SOAP Fault no reconocido (faultString)
      console.error('Error de comunicación:', error.message);
      if (error.statusCode) {
        console.error(`  HTTP Status: ${error.statusCode}`);
      }
    } else if (error instanceof ArcaPadronError) {
      // Respuesta de ARCA sin un dato obligatorio (ej: personaReturn sin persona)
      console.error('Error del SDK:', error.message);
    } else {
      // Error inesperado
      console.error('Error inesperado:', error);
    }
  }
}

main().catch(console.error);
