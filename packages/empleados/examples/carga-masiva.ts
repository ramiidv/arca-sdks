/**
 * Ejemplo: carga masiva desde una planilla (por ejemplo, un CSV ya parseado).
 *
 * `altasMasivas` es atómica: si una fila es inválida no se agrega ninguna y el
 * error lista los problemas de todas las filas (campo "[índice].campo").
 */
import { writeFileSync } from 'node:fs';
import { ArcaEmpleados, ArcaValidationError } from '@ramiidv/arca-empleados';
import type { AltaRelacionLaboral } from '@ramiidv/arca-empleados';

const filas: AltaRelacionLaboral[] = [
  { cuil: '20123456786', fechaInicio: '2026-11-02', modalidadContrato: 8, obraSocial: '126205', sucursal: 1 },
  { cuil: '27111111117', fechaInicio: '2026-11-02', modalidadContrato: 8, obraSocial: '126205', sucursal: 1 },
  { cuil: '23987654325', fechaInicio: '2026-11-09', modalidadContrato: 8, obraSocial: '000208', sucursal: 2 },
];

const sr = new ArcaEmpleados();

try {
  sr.altasMasivas(filas);
} catch (e) {
  if (e instanceof ArcaValidationError) {
    for (const d of e.details) console.error(`${d.field}: ${d.message}`);
    process.exit(1);
  }
  throw e;
}

const { buffer, resumen } = sr.generar();
writeFileSync('altas.txt', buffer);
console.log(`${resumen.altas} altas`);
