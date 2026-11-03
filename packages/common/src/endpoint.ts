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
 * @throws ArcaValidationError si la URL no cumple.
 * @internal
 */
export function validateEndpoint(url: unknown, field: string): void {
  const problem = endpointProblem(url);
  if (!problem) return;
  throw new ArcaValidationError(
    `${field} inválido: ${problem.reason}. Tiene que ser una URL https:// (http:// solo en localhost, 127.0.0.0/8 o ::1).`,
    [{ field, message: problem.reason, ...(problem.origin !== undefined ? { value: problem.origin } : {}) }],
    field,
  );
}

/**
 * Motivo por el que `url` no es un endpoint válido, o `undefined` si lo es.
 * `origin` es solo protocolo + host: nunca la ruta, la query ni credenciales.
 */
function endpointProblem(url: unknown): { reason: string; origin?: string } | undefined {
  if (typeof url !== 'string') return { reason: 'no es un string' };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { reason: 'no es una URL válida' };
  }
  const origin = `${parsed.protocol}//${parsed.host}`;
  if (parsed.username !== '' || parsed.password !== '')
    return { reason: 'no puede llevar usuario ni contraseña', origin };
  if (parsed.protocol === 'https:') return undefined;
  if (parsed.protocol === 'http:') {
    return isLoopback(parsed.hostname)
      ? undefined
      : { reason: `http:// no está permitido para ${parsed.host}`, origin };
  }
  return { reason: `protocolo ${parsed.protocol} no permitido`, origin };
}
