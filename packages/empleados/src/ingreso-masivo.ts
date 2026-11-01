import { ArcaValidationError } from '@ramiidv/arca-common';
import { ArcaSerializationError } from './errors.js';
import { CodigoMovimiento, CODIGOS_MOVIMIENTO } from './constants.js';
import { codificarArchivo, serializarRegistro, unirLineas } from './serializer.js';
import { validateRegistro } from './validators.js';
import type {
  AltaRelacionLaboral,
  ArcaEmpleadosConfig,
  ArchivoIngresoMasivo,
  BajaRelacionLaboral,
  DatosRelacionLaboral,
  ModificacionRelacionLaboral,
  OpcionesSerializacion,
  RegistroRelacionLaboral,
  ResumenIngresoMasivo,
} from './types.js';

interface Entrada {
  registro: Readonly<RegistroRelacionLaboral>;
  linea: string;
}

/** Copia superficial (los `Date` se copian; el resto de los valores son primitivos). */
function copiar(r: Readonly<RegistroRelacionLaboral>): RegistroRelacionLaboral {
  const copia: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) {
    copia[k] = v instanceof Date ? new Date(v.getTime()) : v;
  }
  return copia as unknown as RegistroRelacionLaboral;
}

function clonar(r: RegistroRelacionLaboral): Readonly<RegistroRelacionLaboral> {
  return Object.freeze(copiar(r));
}

function exportar(r: Readonly<RegistroRelacionLaboral>): RegistroRelacionLaboral {
  return copiar(r);
}

/**
 * Arma el archivo TXT de "Ingreso masivo de datos - Relaciones laborales" de
 * Simplificación Registral (registros `01` de 130 posiciones).
 *
 * Cada registro se valida y se serializa al agregarlo: si algo falla, se lanza
 * el error y el registro no se agrega. Las operaciones masivas son atómicas.
 *
 * @example
 * ```ts
 * const sr = new ArcaEmpleados();
 * sr.alta({ cuil: '20-12345678-6', fechaInicio: '2026-11-02', modalidadContrato: 8,
 *           obraSocial: '126205', sucursal: 1 });
 * const { buffer } = sr.generar();
 * fs.writeFileSync('relaciones.txt', buffer);
 * ```
 */
export class ArcaEmpleados {
  private readonly strict: boolean;
  private readonly serializacion: Readonly<OpcionesSerializacion>;
  private entradas: Entrada[] = [];

  constructor(config: ArcaEmpleadosConfig = {}) {
    if (typeof config !== 'object' || config === null) {
      throw new TypeError('ArcaEmpleados: config debe ser un objeto.');
    }
    if (config.strict !== undefined && typeof config.strict !== 'boolean') {
      throw new TypeError('ArcaEmpleados: config.strict debe ser boolean.');
    }
    this.strict = config.strict ?? true;
    this.serializacion = Object.freeze({ ...config.serializacion });
    // Valida las opciones de serialización enseguida.
    unirLineas([], this.serializacion);
  }

  /** Copia de los registros agregados (modificarla no afecta al builder). */
  get registros(): RegistroRelacionLaboral[] {
    return this.entradas.map((e) => exportar(e.registro));
  }

  /** Cantidad de registros agregados. */
  get cantidad(): number {
    return this.entradas.length;
  }

  // -------------------------------------------------------------------------
  // Movimientos individuales
  // -------------------------------------------------------------------------

  /** Agrega un alta (`AT`). */
  alta(datos: AltaRelacionLaboral): this {
    return this.novedad(this.conMovimiento(CodigoMovimiento.ALTA, datos));
  }

  /** Agrega una baja (`BT`). La fecha de baja va en `fechaFin`. */
  baja(datos: BajaRelacionLaboral): this {
    return this.novedad(this.conMovimiento(CodigoMovimiento.BAJA, datos));
  }

  /** Agrega una modificación (`MR`). */
  modificacion(datos: ModificacionRelacionLaboral): this {
    return this.novedad(this.conMovimiento(CodigoMovimiento.MODIFICACION, datos));
  }

  /**
   * Agrega un registro con cualquier código de movimiento (`AT`, `BT`, `MR`, `NA`, `NB`).
   * Es la única vía para `NA` y `NB`, cuyo significado el manual no documenta.
   */
  novedad(registro: RegistroRelacionLaboral): this {
    this.entradas.push(this.preparar(registro));
    return this;
  }

  // -------------------------------------------------------------------------
  // Operaciones masivas (atómicas: si un registro falla, no se agrega ninguno)
  // -------------------------------------------------------------------------

  /** Agrega varias altas. Atómico. */
  altasMasivas(datos: readonly AltaRelacionLaboral[]): this {
    return this.novedadesMasivas(this.lista(datos).map((d) => this.conMovimiento(CodigoMovimiento.ALTA, d)));
  }

  /** Agrega varias bajas. Atómico. */
  bajasMasivas(datos: readonly BajaRelacionLaboral[]): this {
    return this.novedadesMasivas(this.lista(datos).map((d) => this.conMovimiento(CodigoMovimiento.BAJA, d)));
  }

  /** Agrega varias modificaciones. Atómico. */
  modificacionesMasivas(datos: readonly ModificacionRelacionLaboral[]): this {
    return this.novedadesMasivas(this.lista(datos).map((d) => this.conMovimiento(CodigoMovimiento.MODIFICACION, d)));
  }

  /**
   * Agrega varios registros con cualquier código de movimiento. Atómico: valida
   * todos y, si alguno falla, lanza un `ArcaValidationError` con los errores de
   * todos los registros (campo `"[i].campo"`) sin agregar ninguno.
   */
  novedadesMasivas(registros: readonly RegistroRelacionLaboral[]): this {
    const lista = this.lista(registros);
    const nuevas: Entrada[] = [];
    const detalles: ArcaValidationError['details'] = [];
    const causas: unknown[] = [];
    lista.forEach((r, i) => {
      try {
        nuevas.push(this.preparar(r));
      } catch (e) {
        if (e instanceof ArcaValidationError) {
          detalles.push(...e.details.map((d) => ({ ...d, field: `[${i}].${d.field}` })));
        } else if (e instanceof ArcaSerializationError) {
          detalles.push({ field: `[${i}].${e.field ?? 'registro'}`, message: e.message, value: e.value });
        } else {
          throw e;
        }
        causas.push(e);
      }
    });
    if (detalles.length > 0) {
      throw new ArcaValidationError(
        `${causas.length} de ${lista.length} registros inválidos; no se agregó ninguno. ${detalles.map((d) => `${d.field}: ${d.message}`).join('; ')}`,
        detalles,
        detalles[0].field,
        { cause: causas.length === 1 ? causas[0] : new AggregateError(causas, 'Errores por registro') },
      );
    }
    this.entradas.push(...nuevas);
    return this;
  }

  // -------------------------------------------------------------------------
  // Salida
  // -------------------------------------------------------------------------

  /**
   * Genera el archivo.
   * @throws ArcaValidationError si no hay registros.
   */
  generar(): ArchivoIngresoMasivo {
    if (this.entradas.length === 0) {
      throw new ArcaValidationError(
        'No hay registros para generar el archivo.',
        [{ field: 'registros', message: 'Agregue al menos un registro antes de generar el archivo' }],
        'registros',
      );
    }
    const lineas = this.entradas.map((e) => e.linea);
    const contenido = unirLineas(lineas, this.serializacion);
    const encoding = this.serializacion.encoding ?? 'latin1';
    return {
      contenido,
      lineas,
      encoding,
      buffer: codificarArchivo(contenido, encoding),
      resumen: this.resumen(),
    };
  }

  /** Cantidad de registros por movimiento. */
  resumen(): ResumenIngresoMasivo {
    const r: ResumenIngresoMasivo = { totalRegistros: this.entradas.length, altas: 0, bajas: 0, modificaciones: 0, na: 0, nb: 0 };
    for (const { registro } of this.entradas) {
      switch (registro.movimiento) {
        case 'AT': r.altas++; break;
        case 'BT': r.bajas++; break;
        case 'MR': r.modificaciones++; break;
        case 'NA': r.na++; break;
        case 'NB': r.nb++; break;
      }
    }
    return r;
  }

  /** Elimina todos los registros. */
  limpiar(): this {
    this.entradas = [];
    return this;
  }

  // -------------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------------

  private lista<T>(datos: readonly T[]): readonly T[] {
    if (!Array.isArray(datos)) {
      throw new ArcaValidationError(
        'Se esperaba un array de registros.',
        [{ field: 'registros', message: 'Se esperaba un array', value: datos }],
        'registros',
      );
    }
    return datos;
  }

  private conMovimiento(movimiento: CodigoMovimiento, datos: DatosRelacionLaboral): RegistroRelacionLaboral {
    if (typeof datos !== 'object' || datos === null || Array.isArray(datos)) {
      throw new ArcaValidationError(
        `Los datos del movimiento ${movimiento} deben ser un objeto (se recibió ${datos === null ? 'null' : typeof datos}).`,
        [{ field: 'registro', message: 'Se esperaba un objeto', value: datos }],
        'registro',
      );
    }
    if ('movimiento' in datos && (datos as RegistroRelacionLaboral).movimiento !== movimiento) {
      throw new ArcaValidationError(
        `El registro trae movimiento "${String((datos as RegistroRelacionLaboral).movimiento)}" pero se agregó como ${movimiento}.`,
        [{ field: 'movimiento', message: `Se esperaba ${movimiento}`, value: (datos as RegistroRelacionLaboral).movimiento }],
        'movimiento',
      );
    }
    return { ...datos, movimiento };
  }

  private preparar(registro: RegistroRelacionLaboral): Entrada {
    if (typeof registro !== 'object' || registro === null || Array.isArray(registro)) {
      throw new ArcaValidationError(
        `El registro debe ser un objeto (se recibió ${registro === null ? 'null' : typeof registro}).`,
        [{ field: 'registro', message: 'Se esperaba un objeto', value: registro }],
        'registro',
      );
    }
    if (!(CODIGOS_MOVIMIENTO as readonly unknown[]).includes(registro.movimiento)) {
      throw new ArcaValidationError(
        `Código de movimiento inválido: ${JSON.stringify(registro.movimiento) ?? String(registro.movimiento)}. Valores: ${CODIGOS_MOVIMIENTO.join(', ')}.`,
        [{ field: 'movimiento', message: `Debe ser uno de ${CODIGOS_MOVIMIENTO.join(', ')}`, value: registro.movimiento }],
        'movimiento',
      );
    }
    const copia = clonar(registro);
    if (this.strict) validateRegistro(copia, this.serializacion);
    // En modo no estricto, los errores de formato salen como ArcaSerializationError.
    const linea = serializarRegistro(copia, this.serializacion);
    return { registro: copia, linea };
  }
}
