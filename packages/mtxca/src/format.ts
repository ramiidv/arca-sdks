import { roundHalfEven } from '@ramiidv/arca-common';

// El manual de WSMTXCA ("Aclaraciones y Definiciones", nota 4) indica Round
// Half Even para todos los valores decimales.

/** Redondea un importe a 2 decimales, mitad al par (`8.565` → `8.56`, `8.575` → `8.58`). */
export function roundImporte(value: number): number {
  return roundHalfEven(value, 2);
}

/** Redondea cantidad, precio unitario, bonificación o cotización a 6 decimales, mitad al par. */
export function roundDecimal(value: number): number {
  return roundHalfEven(value, 6);
}
