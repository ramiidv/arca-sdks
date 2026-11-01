import type { CodigoMovimiento } from './constants.js';

/**
 * Fecha de entrada. Un `Date` se convierte a la fecha calendario de Argentina
 * (`America/Argentina/Buenos_Aires`); un string se toma literal y puede ser
 * `AAAA-MM-DD`, `AAAAMMDD` o `AAAA/MM/DD` (debe ser una fecha existente).
 */
export type FechaInput = Date | string;

/** Código numérico: entero no negativo o string de dígitos (conserva ceros a la izquierda). */
export type CodigoNumerico = number | string;

/**
 * Datos de una relación laboral, campo por campo según el "Formato de registro"
 * del manual de Simplificación Registral (pág. 24). Las posiciones están entre
 * corchetes. Todos los campos salvo `cuil` son opcionales a nivel de formato; qué
 * campos exige cada movimiento lo valida {@link validateRegistro} (modo `strict`)
 * y, en última instancia, el servicio de ARCA al importar el archivo.
 */
export interface DatosRelacionLaboral {
  /** [5-15] CUIL del trabajador (11 dígitos, con o sin guiones). */
  cuil: string | number;
  /**
   * [16] Marca de trabajador agropecuario (alfanumérico, 1). El manual no publica
   * el valor de la marca: se escribe tal cual (vacío = espacio).
   */
  trabajadorAgropecuario?: string;
  /** [17-19] Código de modalidad de contrato (numérico, 3). */
  modalidadContrato?: CodigoNumerico;
  /** [20-29] Fecha de inicio de la relación laboral (AAAA/MM/DD). */
  fechaInicio?: FechaInput;
  /** [30-39] Fecha de fin de la relación laboral (AAAA/MM/DD). */
  fechaFin?: FechaInput;
  /** [40-45] Código de obra social (RNOS, numérico, 6). */
  obraSocial?: CodigoNumerico;
  /** [46-47] Código de situación de revista (numérico, 2). */
  situacionRevista?: CodigoNumerico;
  /** [48-57] Fecha de recepción del telegrama de renuncia (AAAA/MM/DD). */
  fechaTelegramaRenuncia?: FechaInput;
  /**
   * [58-72] Retribución pactada en pesos (numérico, 15). Se escribe con 2 decimales
   * implícitos (ver README). Debe ser finita, ≥ 0 y tener como máximo 2 decimales.
   */
  retribucion?: number;
  /** [73] Código de modalidad de liquidación (numérico, 1). */
  modalidadLiquidacion?: CodigoNumerico;
  /** [74-78] Sucursal - domicilio de desempeño (numérico, 5). */
  sucursal?: CodigoNumerico;
  /** [79-84] Actividad en el domicilio de desempeño (numérico, 6). */
  actividad?: CodigoNumerico;
  /** [85-88] Puesto desempeñado (alfanumérico, 4). */
  puesto?: string;
  /** [89-90] Rectificación (numérico, 2): `0` a `5` según el manual. */
  rectificacion?: CodigoNumerico;
  /** [91-100] Código de convenio colectivo de trabajo (alfanumérico, 10), ej. `"9999/99"`. */
  cct?: string;
  /** [101-106] Categoría profesional (numérico, 6). */
  categoriaProfesional?: CodigoNumerico;
  /** [107-109] Tipo de servicio (numérico, 3). */
  tipoServicio?: CodigoNumerico;
  /** [110-119] Fecha de suspensión de servicios temporarios (AAAA/MM/DD). */
  fechaSuspensionServiciosTemporarios?: FechaInput;
  /** [120-129] Número de formulario agropecuario (numérico, 10). */
  numeroFormularioAgropecuario?: CodigoNumerico;
  /**
   * [130] Marca de trabajador licenciado por COVID / tipo de contrato CCG
   * (numérico, 1, `0` a `9`). Default `0`, como indica el manual.
   */
  marcaCovidTipoContratoCCG?: CodigoNumerico;
}

/** Un registro `01` completo: los datos de la relación laboral más el código de movimiento [3-4]. */
export interface RegistroRelacionLaboral extends DatosRelacionLaboral {
  /** [3-4] Código de movimiento: `AT`, `BT`, `MR`, `NA` o `NB`. */
  movimiento: CodigoMovimiento;
}

/** Datos para un alta (`AT`). */
export type AltaRelacionLaboral = DatosRelacionLaboral;
/** Datos para una baja (`BT`). */
export type BajaRelacionLaboral = DatosRelacionLaboral;
/** Datos para una modificación (`MR`). */
export type ModificacionRelacionLaboral = DatosRelacionLaboral;

/** Codificación del archivo. */
export type EncodingArchivo = 'latin1' | 'ascii';

/** Opciones de serialización. Lo que el manual no define se puede ajustar acá (ver README). */
export interface OpcionesSerializacion {
  /** Fin de línea. Default `'\r\n'` (CRLF). */
  eol?: '\r\n' | '\n';
  /** Si el archivo termina con un fin de línea después del último registro. Default `true`. */
  eolFinal?: boolean;
  /**
   * Codificación del archivo. Default `'latin1'` (ISO-8859-1). Define qué caracteres
   * son representables en los campos alfanuméricos.
   */
  encoding?: EncodingArchivo;
  /**
   * Qué hacer con un caracter no representable en `encoding`:
   * `'error'` (default) lanza `ArcaSerializationError`; `'transliterar'` quita
   * diacríticos (NFD, ej. `ñ`→`n` en ASCII) y, si aún no es representable, lanza.
   */
  noRepresentables?: 'error' | 'transliterar';
  /**
   * Cómo se escribe un campo numérico no informado: `'ceros'` (default) o `'espacios'`.
   * No aplica a `rectificacion` ni a la marca de la posición 130, que tienen
   * default `0` según el manual.
   */
  numericoVacio?: 'ceros' | 'espacios';
}

/** Configuración del builder. */
export interface ArcaEmpleadosConfig {
  /**
   * `true` (default): al agregar cada registro se valida el formato y las reglas de
   * negocio (CUIL con dígito verificador, campos obligatorios por movimiento, rangos
   * de fechas). `false`: solo se valida el formato (que el registro se pueda escribir
   * en las 130 posiciones); los errores siguen siendo explícitos.
   */
  strict?: boolean;
  /** Opciones de serialización (fin de línea, codificación, etc.). */
  serializacion?: OpcionesSerializacion;
}

/** Cantidad de registros por código de movimiento. */
export interface ResumenIngresoMasivo {
  totalRegistros: number;
  altas: number;
  bajas: number;
  modificaciones: number;
  na: number;
  nb: number;
}

/** Resultado de {@link ArcaEmpleados.generar}. */
export interface ArchivoIngresoMasivo {
  /** Contenido del archivo como string (cada línea de 130 caracteres + fin de línea). */
  contenido: string;
  /** Las líneas sin fin de línea, en el orden en que se agregaron. */
  lineas: string[];
  /** Codificación con la que hay que escribir `contenido` (ver `buffer`). */
  encoding: EncodingArchivo;
  /** Contenido ya codificado, listo para `fs.writeFileSync`. */
  buffer: Buffer;
  resumen: ResumenIngresoMasivo;
}
