/**
 * Serializador del archivo TXT de ingreso masivo de relaciones laborales de
 * Simplificación Registral: registros de ancho fijo de 130 posiciones, tipo `01`.
 *
 * Diseño de registro: Manual de Ayuda de Simplificación Registral, ARCA, feb. 2025, pág. 24.
 * https://www.arca.gob.ar/simplificacionregistral/ayuda/documentos/SR_Manual-de-Ayuda_20250218_definitivo.pdf
 *
 * Lo que el manual NO define (relleno, decimales de la retribución, codificación, fin
 * de línea, valor de los campos vacíos) sigue la convención habitual de los diseños
 * de registro de ARCA y es configurable con {@link OpcionesSerializacion}; ver README.
 */
import { ArcaValidationError, formatDate, normalizeCuit } from '@ramiidv/arca-common';
import type { ValidationErrorDetail } from '@ramiidv/arca-common';
import { ArcaSerializationError } from './errors.js';
import { CODIGOS_MOVIMIENTO, LONGITUD_REGISTRO, TIPO_REGISTRO } from './constants.js';
import type {
  EncodingArchivo,
  FechaInput,
  OpcionesSerializacion,
  RegistroRelacionLaboral,
} from './types.js';

// ---------------------------------------------------------------------------
// Diseño de registro
// ---------------------------------------------------------------------------

/** `N` numérico, `A` alfanumérico, `F` fecha (alfanumérico de 10, `AAAA/MM/DD`). */
export type TipoCampo = 'N' | 'A' | 'F';

/** Un campo del diseño de registro oficial. */
export interface CampoDiseno {
  /** Nombre de la propiedad en {@link RegistroRelacionLaboral} (`tipoRegistro` es fijo). */
  readonly campo: keyof RegistroRelacionLaboral | 'tipoRegistro';
  /** Descripción tal como figura en el manual. */
  readonly descripcion: string;
  readonly desde: number;
  readonly hasta: number;
  readonly longitud: number;
  readonly tipo: TipoCampo;
}

function campo(
  campo: CampoDiseno['campo'],
  descripcion: string,
  desde: number,
  hasta: number,
  tipo: TipoCampo,
): CampoDiseno {
  return Object.freeze({ campo, descripcion, desde, hasta, longitud: hasta - desde + 1, tipo });
}

/** Diseño de registro `01` (manual de Simplificación Registral, pág. 24). */
export const DISENO_REGISTRO: readonly CampoDiseno[] = Object.freeze([
  campo('tipoRegistro', 'Tipo de registro', 1, 2, 'N'),
  campo('movimiento', 'Código de movimiento', 3, 4, 'A'),
  campo('cuil', 'Cuil del empleado', 5, 15, 'N'),
  campo('trabajadorAgropecuario', 'Marca de trabajador agropecuario', 16, 16, 'A'),
  campo('modalidadContrato', 'Modalidad de contrato', 17, 19, 'N'),
  campo('fechaInicio', 'Fecha de inicio de rel. laboral', 20, 29, 'F'),
  campo('fechaFin', 'Fecha de fin de rel. laboral', 30, 39, 'F'),
  campo('obraSocial', 'Código obra social', 40, 45, 'N'),
  campo('situacionRevista', 'Código de situación de revista', 46, 47, 'N'),
  campo('fechaTelegramaRenuncia', 'Fecha recepción telegrama de renuncia', 48, 57, 'F'),
  campo('retribucion', 'Retribución pactada', 58, 72, 'N'),
  campo('modalidadLiquidacion', 'Modalidad de liquidación', 73, 73, 'N'),
  campo('sucursal', 'Sucursal - Domicilio de desempeño', 74, 78, 'N'),
  campo('actividad', 'Actividad en el domicilio de desempeño', 79, 84, 'N'),
  campo('puesto', 'Puesto desempeñado', 85, 88, 'A'),
  campo('rectificacion', 'Rectificación', 89, 90, 'N'),
  campo('cct', 'Código de Convenio Colectivo de Trabajo', 91, 100, 'A'),
  campo('categoriaProfesional', 'Categoría profesional', 101, 106, 'N'),
  campo('tipoServicio', 'Tipo de servicio', 107, 109, 'N'),
  campo('fechaSuspensionServiciosTemporarios', 'Fecha de suspensión servicios temporarios', 110, 119, 'F'),
  campo('numeroFormularioAgropecuario', 'Número formulario agropecuario', 120, 129, 'N'),
  campo('marcaCovidTipoContratoCCG', 'Marca de trabajador licenciado por COVID / Tipo de contrato CCG', 130, 130, 'N'),
]);

/** Campos numéricos con default `0` según el manual (en lugar de "vacío"). */
const DEFAULT_CERO: ReadonlySet<string> = new Set(['rectificacion', 'marcaCovidTipoContratoCCG']);

const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/;

interface OpcionesResueltas {
  eol: '\r\n' | '\n';
  eolFinal: boolean;
  encoding: EncodingArchivo;
  noRepresentables: 'error' | 'transliterar';
  numericoVacio: 'ceros' | 'espacios';
}

function resolverOpciones(opts: OpcionesSerializacion = {}): OpcionesResueltas {
  const r: OpcionesResueltas = {
    eol: opts.eol ?? '\r\n',
    eolFinal: opts.eolFinal ?? true,
    encoding: opts.encoding ?? 'latin1',
    noRepresentables: opts.noRepresentables ?? 'error',
    numericoVacio: opts.numericoVacio ?? 'ceros',
  };
  if (r.eol !== '\r\n' && r.eol !== '\n') throw new TypeError(`eol inválido: ${JSON.stringify(opts.eol)}`);
  if (r.encoding !== 'latin1' && r.encoding !== 'ascii') {
    throw new TypeError(`encoding inválido: ${JSON.stringify(opts.encoding)} (usar 'latin1' o 'ascii')`);
  }
  if (r.noRepresentables !== 'error' && r.noRepresentables !== 'transliterar') {
    throw new TypeError(`noRepresentables inválido: ${JSON.stringify(opts.noRepresentables)}`);
  }
  if (r.numericoVacio !== 'ceros' && r.numericoVacio !== 'espacios') {
    throw new TypeError(`numericoVacio inválido: ${JSON.stringify(opts.numericoVacio)}`);
  }
  return r;
}

function maxCodePoint(encoding: EncodingArchivo): number {
  return encoding === 'ascii' ? 0x7f : 0xff;
}

function fail(c: CampoDiseno, value: unknown, motivo: string, cause?: unknown): never {
  throw new ArcaSerializationError(
    `Campo "${c.campo}" (posiciones ${c.desde}-${c.hasta}, ${c.descripcion}): ${motivo}`,
    { field: c.campo, desde: c.desde, hasta: c.hasta, value, cause },
  );
}

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------

const FECHA_STRING_RE = /^(\d{4})([-/]?)(\d{2})\2(\d{2})$/;

/**
 * Formatea una fecha como `AAAA/MM/DD` (formato de las fechas del archivo de
 * Simplificación Registral). Distinto del `formatDate` de common (`AAAAMMDD`).
 *
 * - `Date`: fecha calendario en Argentina (`America/Argentina/Buenos_Aires`),
 *   independiente de la zona horaria del proceso.
 * - string `AAAA-MM-DD`, `AAAAMMDD` o `AAAA/MM/DD`: se toma literal.
 *
 * @throws ArcaValidationError si el formato es otro, la fecha no existe o el `Date` es inválido.
 */
export function formatFechaSR(fecha: FechaInput): string {
  let input: Date | string;
  if (typeof fecha === 'string') {
    const m = FECHA_STRING_RE.exec(fecha);
    if (!m) {
      throw new ArcaValidationError(
        `Fecha inválida: "${fecha}". Formato esperado: AAAA-MM-DD, AAAAMMDD o AAAA/MM/DD.`,
        [{ field: 'fecha', message: 'Formato esperado: AAAA-MM-DD, AAAAMMDD o AAAA/MM/DD', value: fecha }],
        'fecha',
      );
    }
    input = `${m[1]}-${m[3]}-${m[4]}`;
  } else if (fecha instanceof Date) {
    input = fecha;
  } else {
    throw new ArcaValidationError(
      `Fecha inválida: se esperaba Date o string, se recibió ${tipoDe(fecha)}.`,
      [{ field: 'fecha', message: 'Se esperaba Date o string', value: fecha }],
      'fecha',
    );
  }
  const yyyymmdd = formatDate(input);
  return `${yyyymmdd.slice(0, 4)}/${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(6, 8)}`;
}

function tipoDe(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number' && Number.isNaN(v)) return 'NaN';
  return typeof v;
}

// ---------------------------------------------------------------------------
// Campos
// ---------------------------------------------------------------------------

function vacio(v: unknown): boolean {
  return v === undefined || v === null || v === '';
}

function formatearNumerico(c: CampoDiseno, value: unknown, o: OpcionesResueltas): string {
  if (vacio(value)) {
    if (DEFAULT_CERO.has(c.campo)) return '0'.repeat(c.longitud);
    return (o.numericoVacio === 'ceros' ? '0' : ' ').repeat(c.longitud);
  }
  let digits: string;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      fail(c, value, `debe ser un entero no negativo (se recibió ${Number.isNaN(value) ? 'NaN' : value}).`);
    }
    digits = String(value);
  } else if (typeof value === 'string') {
    if (!/^\d+$/.test(value)) fail(c, value, `debe contener solo dígitos (se recibió "${value}").`);
    digits = value;
  } else {
    fail(c, value, `se esperaba number o string de dígitos, se recibió ${tipoDe(value)}.`);
  }
  if (digits.length > c.longitud) {
    fail(c, value, `"${digits}" tiene ${digits.length} dígitos y el campo admite ${c.longitud}.`);
  }
  return digits.padStart(c.longitud, '0');
}

function formatearRetribucion(c: CampoDiseno, value: unknown, o: OpcionesResueltas): string {
  if (vacio(value)) return formatearNumerico(c, undefined, o);
  if (typeof value !== 'number') fail(c, value, `se esperaba number, se recibió ${tipoDe(value)}.`);
  if (!Number.isFinite(value) || value < 0) {
    fail(c, value, `debe ser un importe finito y no negativo (se recibió ${value}).`);
  }
  const centavosExactos = value * 100;
  const centavos = Math.round(centavosExactos);
  if (Math.abs(centavosExactos - centavos) > 1e-6 * Math.max(1, Math.abs(centavosExactos))) {
    fail(c, value, `admite como máximo 2 decimales (se recibió ${value}).`);
  }
  if (!Number.isSafeInteger(centavos)) fail(c, value, 'importe demasiado grande.');
  const digits = String(centavos);
  if (digits.length > c.longitud) {
    fail(c, value, `${value} ocupa ${digits.length} posiciones (2 decimales implícitos) y el campo admite ${c.longitud}.`);
  }
  return digits.padStart(c.longitud, '0');
}

function transliterar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
}

function formatearAlfanumerico(c: CampoDiseno, value: unknown, o: OpcionesResueltas): string {
  if (vacio(value)) return ' '.repeat(c.longitud);
  if (typeof value !== 'string') fail(c, value, `se esperaba string, se recibió ${tipoDe(value)}.`);
  if (CONTROL_CHARS.test(value)) fail(c, value, 'contiene caracteres de control (saltos de línea, tabulaciones, etc.).');
  const max = maxCodePoint(o.encoding);
  let s = value.normalize('NFC');
  const noRepresentable = (t: string) => [...t].find((ch) => ch.codePointAt(0)! > max);
  if (noRepresentable(s) !== undefined && o.noRepresentables === 'transliterar') s = transliterar(s);
  const bad = noRepresentable(s);
  if (bad !== undefined) {
    fail(c, value, `el caracter "${bad}" no es representable en ${o.encoding === 'ascii' ? 'ASCII' : 'ISO-8859-1'}.`);
  }
  if (s.length > c.longitud) {
    fail(c, value, `"${s}" tiene ${s.length} caracteres y el campo admite ${c.longitud}.`);
  }
  return s.padEnd(c.longitud, ' ');
}

function formatearFecha(c: CampoDiseno, value: unknown): string {
  if (vacio(value)) return ' '.repeat(c.longitud);
  try {
    return formatFechaSR(value as FechaInput);
  } catch (e) {
    if (e instanceof ArcaValidationError) fail(c, value, e.message, e);
    throw e;
  }
}

function formatearCuil(c: CampoDiseno, value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') {
    fail(c, value, `es obligatorio (string o number de 11 dígitos), se recibió ${tipoDe(value)}.`);
  }
  const n = normalizeCuit(value);
  if (!/^\d{11}$/.test(n)) fail(c, value, `debe tener 11 dígitos (se recibió "${String(value)}").`);
  return n;
}

function formatearCampo(c: CampoDiseno, registro: RegistroRelacionLaboral, o: OpcionesResueltas): string {
  if (c.campo === 'tipoRegistro') return TIPO_REGISTRO;
  const value = (registro as unknown as Record<string, unknown>)[c.campo];
  switch (c.campo) {
    case 'movimiento':
      if (typeof value !== 'string' || !(CODIGOS_MOVIMIENTO as readonly string[]).includes(value)) {
        fail(c, value, `debe ser uno de ${CODIGOS_MOVIMIENTO.join(', ')} (se recibió ${JSON.stringify(value) ?? tipoDe(value)}).`);
      }
      return value;
    case 'cuil':
      return formatearCuil(c, value);
    case 'retribucion':
      return formatearRetribucion(c, value, o);
  }
  switch (c.tipo) {
    case 'N': return formatearNumerico(c, value, o);
    case 'A': return formatearAlfanumerico(c, value, o);
    case 'F': return formatearFecha(c, value);
  }
}

function assertObjeto(registro: unknown): asserts registro is RegistroRelacionLaboral {
  if (typeof registro !== 'object' || registro === null || Array.isArray(registro)) {
    throw new ArcaSerializationError(
      `El registro debe ser un objeto con los datos de la relación laboral, se recibió ${tipoDe(registro)}.`,
      { value: registro },
    );
  }
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Serializa un registro `01` a una línea de exactamente 130 caracteres (sin fin de línea).
 * @throws ArcaSerializationError si algún campo no se puede escribir (nunca trunca).
 */
export function serializarRegistro(registro: RegistroRelacionLaboral, opciones?: OpcionesSerializacion): string {
  const o = resolverOpciones(opciones);
  assertObjeto(registro);
  const linea = DISENO_REGISTRO.map((c) => formatearCampo(c, registro, o)).join('');
  if (linea.length !== LONGITUD_REGISTRO) {
    // Invariante: cada formateador devuelve exactamente `longitud` caracteres.
    throw new ArcaSerializationError(`Registro de ${linea.length} caracteres (se esperaban ${LONGITUD_REGISTRO}).`);
  }
  return linea;
}

/**
 * Devuelve todos los errores de formato de un registro (sin lanzar), uno por campo.
 * @internal Lo usa `validateRegistro`.
 */
export function erroresDeFormato(registro: unknown, opciones?: OpcionesSerializacion): ValidationErrorDetail[] {
  const o = resolverOpciones(opciones);
  try {
    assertObjeto(registro);
  } catch (e) {
    return [{ field: 'registro', message: (e as Error).message, value: registro }];
  }
  const errores: ValidationErrorDetail[] = [];
  for (const c of DISENO_REGISTRO) {
    try {
      formatearCampo(c, registro, o);
    } catch (e) {
      if (!(e instanceof ArcaSerializationError)) throw e;
      errores.push({ field: c.campo, message: e.message, value: e.value });
    }
  }
  return errores;
}

/**
 * Serializa varios registros al contenido completo del archivo (string).
 * Por defecto: líneas separadas por CRLF y CRLF final.
 * @throws ArcaSerializationError con `indice` del registro que falló y `cause` = error original.
 */
export function serializarArchivo(registros: readonly RegistroRelacionLaboral[], opciones?: OpcionesSerializacion): string {
  const o = resolverOpciones(opciones);
  if (!Array.isArray(registros)) {
    throw new ArcaSerializationError(`Se esperaba un array de registros, se recibió ${tipoDe(registros)}.`);
  }
  const lineas = registros.map((r, i) => {
    try {
      return serializarRegistro(r, o);
    } catch (e) {
      if (!(e instanceof ArcaSerializationError)) throw e;
      throw new ArcaSerializationError(`Registro ${i}: ${e.message}`, {
        field: e.field, desde: e.desde, hasta: e.hasta, value: e.value, indice: i, cause: e,
      });
    }
  });
  return unirLineas(lineas, o);
}

/** @internal */
export function unirLineas(lineas: readonly string[], opciones?: OpcionesSerializacion): string {
  const o = resolverOpciones(opciones);
  if (lineas.length === 0) return '';
  return lineas.join(o.eol) + (o.eolFinal ? o.eol : '');
}

/**
 * Codifica el contenido del archivo a `Buffer` (ISO-8859-1 por defecto, un byte por caracter).
 * @throws ArcaSerializationError si hay un caracter no representable en la codificación.
 */
export function codificarArchivo(contenido: string, encoding: EncodingArchivo = 'latin1'): Buffer {
  if (encoding !== 'latin1' && encoding !== 'ascii') {
    throw new TypeError(`encoding inválido: ${JSON.stringify(encoding)} (usar 'latin1' o 'ascii')`);
  }
  const max = maxCodePoint(encoding);
  for (let i = 0; i < contenido.length; i++) {
    if (contenido.charCodeAt(i) > max) {
      throw new ArcaSerializationError(
        `El caracter "${contenido[i]}" (posición ${i} del contenido) no es representable en ${encoding}.`,
        { value: contenido[i] },
      );
    }
  }
  return Buffer.from(contenido, 'latin1');
}
