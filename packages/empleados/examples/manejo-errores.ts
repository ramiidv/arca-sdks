/**
 * Ejemplo: manejo de errores.
 *
 * - ArcaValidationError: propiedades desconocidas, movimiento inválido, datos que no son
 *   un objeto, generar() sin registros y, en modo strict (default), reglas de negocio y
 *   errores de formato. `details` trae un error por campo.
 * - ArcaSerializationError: con strict: false o con serializarRegistro/serializarArchivo,
 *   un valor no entra en el formato de 130 posiciones (excede el largo, tipo incorrecto,
 *   NaN, caracter no representable...). Nunca se trunca.
 */
import {
  ArcaEmpleados,
  ArcaSerializationError,
  ArcaValidationError,
  serializarRegistro,
} from '@ramiidv/arca-empleados';

const sr = new ArcaEmpleados();

try {
  sr.alta({ cuil: '20-12345678-7', fechaInicio: '2026-02-30', obraSocial: '1234567' });
} catch (e) {
  if (e instanceof ArcaValidationError) {
    for (const d of e.details) console.error(`${d.field}: ${d.message}`);
  }
}

try {
  serializarRegistro({ movimiento: 'MR', cuil: '20123456786', puesto: '12345' });
} catch (e) {
  if (e instanceof ArcaSerializationError) {
    console.error(e.field, e.desde, e.hasta, e.message); // puesto 85 88 ...
  }
}

// Modo no estricto: no aplica reglas de negocio, pero el formato sigue validándose.
const laxo = new ArcaEmpleados({ strict: false });
laxo.modificacion({ cuil: '20123456787' }); // dígito verificador incorrecto: se acepta
