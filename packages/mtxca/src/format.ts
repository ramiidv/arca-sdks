/**
 * Redondea a `decimals` decimales (mitad hacia afuera del cero), sin los
 * errores de `toFixed` con binarios (ej. `1.005` → `1.01`).
 */
export function roundTo(value: number, decimals: number): number {
  const abs = Math.abs(value);
  const text = String(abs);
  const rounded = text.includes('e')
    ? Math.round(abs * 10 ** decimals) / 10 ** decimals
    : Number(`${Math.round(Number(`${text}e${decimals}`))}e-${decimals}`);
  const result = value < 0 ? -rounded : rounded;
  return result === 0 ? 0 : result; // sin -0
}

/** Redondea un importe a 2 decimales (`ImporteSubtotalSimpleType` / `ImporteTotalSimpleType`). */
export function roundImporte(value: number): number {
  return roundTo(value, 2);
}

/** Redondea cantidad, precio unitario o bonificación a 6 decimales (`DecimalSimpleType`). */
export function roundDecimal(value: number): number {
  return roundTo(value, 6);
}
