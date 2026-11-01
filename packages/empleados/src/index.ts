// Builder
export { ArcaEmpleados } from './ingreso-masivo.js';

// Errores
export { ArcaError, ArcaValidationError, ArcaEmpleadosError, ArcaSerializationError } from './errors.js';
export type { ValidationErrorDetail, ArcaSerializationErrorOptions } from './errors.js';

// Tipos
export type {
  FechaInput,
  CodigoNumerico,
  DatosRelacionLaboral,
  RegistroRelacionLaboral,
  AltaRelacionLaboral,
  BajaRelacionLaboral,
  ModificacionRelacionLaboral,
  EncodingArchivo,
  OpcionesSerializacion,
  ArcaEmpleadosConfig,
  ResumenIngresoMasivo,
  ArchivoIngresoMasivo,
} from './types.js';

// Constantes (solo las publicadas en el manual de Simplificación Registral)
export {
  LONGITUD_REGISTRO,
  TIPO_REGISTRO,
  CodigoMovimiento,
  CODIGOS_MOVIMIENTO,
  VALORES_RECTIFICACION,
  VALORES_MARCA_COVID_CCG,
  PREFIJOS_CUIL_PERSONA_FISICA,
} from './constants.js';

// Validadores
export { validateCuilTrabajador, validateRegistro, CAMPOS_OBLIGATORIOS } from './validators.js';

// Serializador (uso avanzado)
export {
  DISENO_REGISTRO,
  formatFechaSR,
  serializarRegistro,
  serializarArchivo,
  codificarArchivo,
} from './serializer.js';
export type { CampoDiseno, TipoCampo } from './serializer.js';
