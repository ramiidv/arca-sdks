/** Redondeo decimal sin errores de punto flotante. */

/**
 * Redondea a `digits` decimales, mitad hacia arriba (en valor absoluto), sobre
 * el valor decimal que se escribió: `8.575` → `8.58` aunque en binario sea
 * `8.57499999…`.
 */
export function roundHalfUp(value: number, digits: number): number {
  const scaled = Number((Math.abs(value) * 10 ** digits).toPrecision(15));
  const result = (Math.sign(value) * Math.round(scaled)) / 10 ** digits;
  return result === 0 ? 0 : result;
}

/**
 * Redondea a `digits` decimales, mitad al par ("Round Half Even", el que
 * especifica el manual de WSMTXCA), sobre el valor decimal que se escribió:
 * `8.565` → `8.56`, `8.575` → `8.58`, `2.675` → `2.68` aunque en binario
 * sean `8.5649999…`/`8.57499999…`/`2.67499999…`. Simétrico para negativos.
 */
export function roundHalfEven(value: number, digits: number): number {
  const scaled = Number((Math.abs(value) * 10 ** digits).toPrecision(15));
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  const rounded = diff > 0.5 || (diff === 0.5 && floor % 2 === 1) ? floor + 1 : floor;
  const result = (Math.sign(value) * rounded) / 10 ** digits;
  return result === 0 ? 0 : result;
}
