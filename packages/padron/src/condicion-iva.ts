import { CondicionIva } from '@ramiidv/arca-common';
import { ImpuestoId } from './constants.js';
import type { CondicionIvaPadron, PersonaA4, PersonaA5 } from './types.js';

/*
 * Fuentes:
 * - Manual ws_sr_constancia_inscripcion v4.1: impuesto 20 = MONOTRIBUTO
 *   (datosMonotributo), impuesto 30 = IVA (datosRegimenGeneral), estadoImpuesto
 *   "AC" = activo. Categorías de monotributo (anexo 5.3): 61, 99, 100
 *   "B MONOTRIBUTO SOCIAL ..."; 101 a 104 "D/E 2/3 SOCIOS PROY. SERVICIOS /
 *   PRODUCTIVO" (proyectos productivos de efectores sociales, Ley 25.865: también
 *   monotributo social); 98 "B ASOCIADO COOPERATIVA" (monotributo común: no
 *   es necesariamente efector social).
 * - Manual ws_sr_padron_a4 v1.3 §5.3 (TipoEstado): ACTIVO, ACTIVO EN TRAMITE,
 *   BAJA PROVISORIA, BAJA DEFINITIVA, EXENTO, EXENTO EN TRAMITE, NO APORTANTE.
 *   La constancia informa el id del estado (`estadoImpuesto`, ej: "AC"); solo
 *   "AC" figura en los manuales. Las demás abreviaturas que se reconocen son
 *   las iniciales de TipoEstado (EX, BP, BD, NA = NO APORTANTE). "NO APORTANTE"
 *   no es "IVA no alcanzado": no se mapea a ninguna condición.
 * - IVA exento (32), IVA responsable no inscripto (33) e IVA no alcanzado (34)
 *   no figuran en los manuales: el 32 y el 34 se reconocen por id o por la
 *   descripción del impuesto; el 33, por id.
 * - Valores de CondicionIva: FEParamGetCondicionIvaReceptor (WSFEv1, RG 5616).
 */

const CATEGORIAS_MONOTRIBUTO_SOCIAL = new Set([61, 99, 100, 101, 102, 103, 104]);

type Estado =
  | 'ACTIVO'
  | 'ACTIVO EN TRAMITE'
  | 'BAJA PROVISORIA'
  | 'BAJA DEFINITIVA'
  | 'EXENTO'
  | 'EXENTO EN TRAMITE'
  | 'NO APORTANTE';

const ABREVIATURAS: Record<string, Estado> = {
  AC: 'ACTIVO',
  EX: 'EXENTO',
  BP: 'BAJA PROVISORIA',
  BD: 'BAJA DEFINITIVA',
  NA: 'NO APORTANTE',
};

/** Normaliza el estado de un impuesto (palabras de TipoEstado o abreviatura SUPA). `''` si no vino. */
function normalizarEstado(estado: string | undefined): string {
  const e = (estado ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
  return ABREVIATURAS[e] ?? e;
}

/** Activo: ACTIVO o ACTIVO EN TRAMITE. Sin estado (respuestas anteriores a la v3.6 de la constancia) cuenta como activo. */
function esActivo(estado: string): boolean {
  return estado === '' || estado === 'ACTIVO' || estado === 'ACTIVO EN TRAMITE';
}

function esExento(estado: string): boolean {
  return estado === 'EXENTO' || estado === 'EXENTO EN TRAMITE';
}

interface Impuesto {
  id: number;
  descripcion: string;
  estado: string;
  activo: boolean;
}

function esA5(persona: PersonaA5 | PersonaA4): persona is PersonaA5 {
  return Array.isArray((persona as PersonaA5).impuestos);
}

function impuesto(id: number, descripcion: string | undefined, estadoRaw: string | undefined): Impuesto {
  const estado = normalizarEstado(estadoRaw);
  return { id, descripcion: descripcion ?? '', estado, activo: esActivo(estado) };
}

function impuestosDe(persona: PersonaA5 | PersonaA4): Impuesto[] {
  if (esA5(persona))
    return persona.impuestos.map((i) => impuesto(i.idImpuesto, i.descripcionImpuesto, i.estadoImpuesto));
  return (persona.impuesto ?? []).map((i) => impuesto(i.idImpuesto, i.descripcionImpuesto, i.estado));
}

function categoriaMonotributo(persona: PersonaA5 | PersonaA4): { id: number; descripcion: string } | undefined {
  if (esA5(persona)) {
    const c = persona.monotributo?.categoria;
    return c ? { id: c.idCategoria, descripcion: c.descripcionCategoria ?? '' } : undefined;
  }
  const c = (persona.categoria ?? []).find(
    (x) => x.idImpuesto === ImpuestoId.MONOTRIBUTO && esActivo(normalizarEstado(x.estado)),
  );
  return c ? { id: c.idCategoria, descripcion: c.descripcionCategoria ?? '' } : undefined;
}

/** Detalle de un error de la constancia: los `error`, o el `mensaje`, o "sin detalle". */
function detalleError(e: { error: string[]; mensaje?: string }): string {
  const errores = e.error.map((x) => x.trim()).filter((x) => x !== '');
  if (errores.length > 0) return errores.join('; ');
  return e.mensaje?.trim() || 'sin detalle';
}

/** Errores de régimen general / monotributo que informó la constancia, para el motivo. */
function erroresRegimen(persona: PersonaA5 | PersonaA4): string[] {
  if (!esA5(persona)) return [];
  const out: string[] = [];
  if (persona.errorRegimenGeneral) out.push(`régimen general: ${detalleError(persona.errorRegimenGeneral)}`);
  if (persona.errorMonotributo) out.push(`monotributo: ${detalleError(persona.errorMonotributo)}`);
  return out;
}

/**
 * Determina la condición frente al IVA de un contribuyente a partir del padrón
 * (constancia de inscripción / A5, o A4), para usarla como `condicionIva` al
 * facturarle.
 *
 * - Monotributo activo (impuesto 20 activo; o, si el impuesto 20 no figura, la
 *   categoría de monotributo) → MONOTRIBUTISTA, o MONOTRIBUTO_SOCIAL /
 *   MONOTRIBUTO_INDEPENDIENTE_PROMOVIDO según la categoría. Un impuesto 20 en
 *   baja no cuenta aunque haya categoría.
 * - IVA activo (impuesto 30, ACTIVO o ACTIVO EN TRAMITE) → RESPONSABLE_INSCRIPTO.
 * - IVA (30) en estado EXENTO / EXENTO EN TRAMITE, o impuesto 32 → EXENTO.
 * - Impuesto 34 → IVA_NO_ALCANZADO.
 * - Impuesto 33 (IVA responsable no inscripto, categoría eliminada) → `null`
 *   con un motivo propio: no tiene `CondicionIVAReceptorId`.
 * - Si no figura ninguno, devuelve `condicionIva: null`: el padrón no alcanza
 *   para decidir (puede ser consumidor final o sujeto no categorizado según la
 *   operación). No adivina.
 *
 * Si ARCA informó errores de la constancia (`errorConstancia`, ej: CUIT
 * limitada por la RG 3832/16; `errorRegimenGeneral`; `errorMonotributo`) o la
 * CUIT no está activa, el motivo lo advierte siempre, también cuando se pudo
 * determinar la condición: revisalo antes de facturar.
 *
 * Es una función pura: no consulta ARCA.
 *
 * @example
 * ```ts
 * const persona = await padron.getConstanciaInscripcion('30712345674');
 * const { condicionIva, motivo } = condicionIvaDesdePadron(persona);
 * ```
 */
export function condicionIvaDesdePadron(persona: PersonaA5 | PersonaA4): CondicionIvaPadron {
  const impuestos = impuestosDe(persona);
  const tiene = (pred: (i: Impuesto) => boolean) => impuestos.find((i) => i.activo && pred(i));
  const errorConstancia = esA5(persona) && persona.errorConstancia ? detalleError(persona.errorConstancia) : undefined;
  const errores = erroresRegimen(persona);
  const notaConstancia =
    errorConstancia !== undefined ? ` Atención: ARCA informó un error en la constancia (${errorConstancia}).` : '';
  const notaErrores = errores.length > 0 ? ` ARCA informó errores en la constancia (${errores.join(' | ')}).` : '';
  const avisoClave =
    persona.estadoClave && persona.estadoClave.toUpperCase() !== 'ACTIVO'
      ? ` Atención: la CUIT tiene estado ${persona.estadoClave}.`
      : '';
  const advertencia = avisoClave + notaConstancia + notaErrores;

  const categoria = categoriaMonotributo(persona);
  const impuesto20 = impuestos.find((i) => i.id === ImpuestoId.MONOTRIBUTO);
  const monotributo = impuesto20 ? impuesto20.activo : categoria !== undefined;
  if (monotributo) {
    const desc = categoria ? ` (categoría ${categoria.id} - ${categoria.descripcion.trim()})` : '';
    if (
      categoria &&
      (CATEGORIAS_MONOTRIBUTO_SOCIAL.has(categoria.id) || /MONOTRIBUTO SOCIAL/i.test(categoria.descripcion))
    ) {
      return { condicionIva: CondicionIva.MONOTRIBUTO_SOCIAL, motivo: `Monotributo social${desc}.${advertencia}` };
    }
    if (categoria && /PROMOVID/i.test(categoria.descripcion)) {
      return {
        condicionIva: CondicionIva.MONOTRIBUTO_INDEPENDIENTE_PROMOVIDO,
        motivo: `Monotributo trabajador independiente promovido${desc}.${advertencia}`,
      };
    }
    return {
      condicionIva: CondicionIva.MONOTRIBUTISTA,
      motivo: `Inscripto en monotributo (impuesto 20)${desc}.${advertencia}`,
    };
  }

  if (tiene((i) => i.id === ImpuestoId.IVA_RESPONSABLE_INSCRIPTO)) {
    return {
      condicionIva: CondicionIva.RESPONSABLE_INSCRIPTO,
      motivo: `Inscripto en IVA (impuesto 30).${advertencia}`,
    };
  }

  const ivaExento = impuestos.find((i) => i.id === ImpuestoId.IVA_RESPONSABLE_INSCRIPTO && esExento(i.estado));
  if (ivaExento) {
    return {
      condicionIva: CondicionIva.EXENTO,
      motivo: `IVA (impuesto 30) en estado ${ivaExento.estado}.${advertencia}`,
    };
  }

  if (tiene((i) => i.id === ImpuestoId.IVA_EXENTO || /IVA\s+EXENTO/i.test(i.descripcion))) {
    return { condicionIva: CondicionIva.EXENTO, motivo: `IVA exento (impuesto 32).${advertencia}` };
  }

  if (tiene((i) => i.id === ImpuestoId.IVA_NO_ALCANZADO || /IVA.*NO\s+ALCANZADO/i.test(i.descripcion))) {
    return { condicionIva: CondicionIva.IVA_NO_ALCANZADO, motivo: `IVA no alcanzado (impuesto 34).${advertencia}` };
  }

  if (tiene((i) => i.id === ImpuestoId.IVA_RESPONSABLE_NO_INSCRIPTO)) {
    return {
      condicionIva: null,
      motivo:
        'Figura como IVA responsable no inscripto (impuesto 33): la categoría fue eliminada (Ley 25.865) y no ' +
        `tiene condición frente al IVA equivalente para facturar; verificá la situación del contribuyente.${advertencia}`,
    };
  }

  if (errorConstancia !== undefined && impuestos.length === 0) {
    return {
      condicionIva: null,
      motivo: `ARCA no emitió la constancia: ${errorConstancia}.${avisoClave}${notaErrores}`,
    };
  }

  if (errores.length > 0) {
    return {
      condicionIva: null,
      motivo:
        `No se puede determinar: ARCA no informó datos de ${errores.map((e) => e.split(':')[0]).join(' ni de ')} ` +
        `(${errores.join(' | ')}).${avisoClave}${notaConstancia}`,
    };
  }

  return {
    condicionIva: null,
    motivo:
      'No figura inscripto en IVA ni en monotributo: el padrón no alcanza para determinar la condición ' +
      '(puede ser consumidor final o sujeto no categorizado según la operación).' +
      advertencia,
  };
}
