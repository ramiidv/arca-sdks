/**
 * Constantes del archivo de ingreso masivo de relaciones laborales de
 * Simplificación Registral (ARCA).
 *
 * Fuente: Manual de Ayuda de Simplificación Registral, ARCA, feb. 2025, pág. 24
 * ("Formato de registro"):
 * https://www.arca.gob.ar/simplificacionregistral/ayuda/documentos/SR_Manual-de-Ayuda_20250218_definitivo.pdf
 *
 * Solo se incluyen los valores que figuran en esa fuente. Las tablas de códigos
 * (modalidad de contrato, situación de revista, obra social, actividad, puesto,
 * convenio, categoría, tipo de servicio, modalidad de liquidación) se consultan en
 * el propio servicio ("Ver tablas informativas de códigos", con clave fiscal) y no
 * están publicadas en un documento público, por eso el SDK no las incluye.
 */

/** Largo fijo de cada registro del archivo (posiciones 1 a 130). */
export const LONGITUD_REGISTRO = 130;

/** Tipo de registro (posiciones 1-2). El formato oficial tiene un único tipo: `01`. */
export const TIPO_REGISTRO = '01';

/**
 * Códigos de movimiento (posiciones 3-4), según el manual: `AT,BT,MR,NA,NB`.
 *
 * El manual lista los códigos sin describirlos. AT (alta), BT (baja) y MR
 * (modificación) coinciden con la nomenclatura de la RG AFIP 3399/2012 para las
 * novedades de Simplificación Registral. **NA y NB no están descriptos en ninguna
 * fuente pública de ARCA**: se aceptan tal cual, sin semántica asociada.
 */
export const CodigoMovimiento = {
  /** Alta de la relación laboral. */
  ALTA: 'AT',
  /** Baja de la relación laboral. */
  BAJA: 'BT',
  /** Modificación de una relación laboral informada. */
  MODIFICACION: 'MR',
  /** Código `NA` del manual (significado no documentado por ARCA). */
  NA: 'NA',
  /** Código `NB` del manual (significado no documentado por ARCA). */
  NB: 'NB',
} as const;

export type CodigoMovimiento = (typeof CodigoMovimiento)[keyof typeof CodigoMovimiento];

/** Todos los códigos de movimiento válidos. */
export const CODIGOS_MOVIMIENTO: readonly CodigoMovimiento[] = Object.freeze(['AT', 'BT', 'MR', 'NA', 'NB']);

/** Valores admitidos en "Rectificación" (posiciones 89-90), según el manual: `00` a `05`. */
export const VALORES_RECTIFICACION: readonly number[] = Object.freeze([0, 1, 2, 3, 4, 5]);

/**
 * Valores admitidos en "Marca de trabajador licenciado por COVID / Tipo de contrato CCG"
 * (posición 130), según el manual: `0` a `9`. El manual indica que por defecto se
 * informa `0` y que solo se completa para trabajadores del Programa Puente al Empleo
 * (Dto. 551/22) que aplican a Convenios de Corresponsabilidad Gremial.
 */
export const VALORES_MARCA_COVID_CCG: readonly number[] = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

/**
 * Prefijos de CUIL de persona física (20, 23, 24 y 27). Los prefijos 30, 33 y 34
 * corresponden a personas jurídicas y no pueden identificar a un trabajador.
 */
export const PREFIJOS_CUIL_PERSONA_FISICA: readonly string[] = Object.freeze(['20', '23', '24', '27']);
