/**
 * Combina varios AbortSignal en uno que se aborta cuando se aborta cualquiera.
 * Ignora los `undefined`; si queda uno solo, lo devuelve tal cual.
 *
 * Usa `AbortSignal.any` (disponible en todas las versiones de Node soportadas, >= 20.19).
 */
export function anySignal(...signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
  const present = signals.filter((s): s is AbortSignal => s !== undefined);
  if (present.length <= 1) return present[0];
  return AbortSignal.any(present);
}
