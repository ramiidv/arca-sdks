import { ArcaValidationError } from './errors.js';

/**
 * `true` si `hostname` (de `URL.hostname`) es de loopback: `localhost`,
 * `127.0.0.0/8` o `::1`.
 */
function isLoopback(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '[::1]') return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

/**
 * Valida la URL de un web service antes de mandarle credenciales (token,
 * sign, el CMS firmado de WSAA): tiene que ser `https://` y no llevar usuario
 * ni contraseña. `http://` se acepta solo en loopback (`localhost`,
 * `127.0.0.0/8`, `::1`), para servidores de prueba locales.
 *
 * @returns La URL ya parseada.
 * @throws ArcaValidationError si la URL no cumple.
 * @internal
 */
export function validateEndpoint(url: unknown, field: string): URL {
  const problem = endpointProblem(url);
  if ('parsed' in problem) return problem.parsed;
  throw new ArcaValidationError(
    `${field} inválido: ${problem.reason}. Tiene que ser una URL https:// (http:// solo en localhost, 127.0.0.0/8 o ::1).`,
    [{ field, message: problem.reason, ...(problem.origin !== undefined ? { value: problem.origin } : {}) }],
    field,
  );
}

/**
 * La URL parseada si `url` es un endpoint válido; si no, el motivo. `origin`
 * es solo protocolo + host: nunca la ruta, la query ni credenciales.
 */
function endpointProblem(url: unknown): { parsed: URL } | { reason: string; origin?: string } {
  if (typeof url !== 'string') return { reason: 'no es un string' };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { reason: 'no es una URL válida' };
  }
  const origin = originOf(parsed);
  if (parsed.username !== '' || parsed.password !== '')
    return { reason: 'no puede llevar usuario ni contraseña', origin };
  if (parsed.protocol === 'https:') return { parsed };
  if (parsed.protocol === 'http:') {
    return isLoopback(parsed.hostname)
      ? { parsed }
      : { reason: `http:// no está permitido para ${parsed.host}`, origin };
  }
  return { reason: `protocolo ${parsed.protocol} no permitido`, origin };
}

/**
 * Protocolo + host de `url` (`https://host:puerto`), sin ruta, query ni
 * credenciales: lo único de una URL que se muestra en un mensaje de error.
 * (`URL.origin` no sirve para todos los protocolos: con `file:` es `"null"`.)
 * @internal
 */
export function originOf(url: URL): string {
  return `${url.protocol}//${url.host}`;
}
