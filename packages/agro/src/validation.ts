/**
 * Validación local de requests contra el XSD (sin llamar a ARCA).
 *
 * Los métodos de `CpeClient` y `LpgClient` ya validan antes de enviar; estas
 * funciones sirven para validar datos de antemano (ej: en un formulario).
 * Verifican campos obligatorios, campos desconocidos, rangos y largos del XSD,
 * CUIT con dígito verificador, números finitos y fechas.
 */
import { ArcaValidationError, diasEntre } from '@ramiidv/arca-common';
import type { ValidationErrorDetail } from '@ramiidv/arca-common';
import { TIPO_CPE } from './constants.js';
import { encodeRequest } from './schema.js';
import {
  AUTORIZAR_AUTOMOTOR,
  AUTORIZAR_AUTOMOTOR_DG,
  AUTORIZAR_EMISION_DESTINO_DG,
  AUTORIZAR_FERROVIARIA,
  AUTORIZAR_FERROVIARIA_DG,
  CONFIRMACION_AUTOMOTOR,
  CONFIRMACION_FERROVIARIA,
  EDITAR_AUTOMOTOR,
  EDITAR_CONFIRMADA,
  EDITAR_FERROVIARIA,
} from './cpe-schemas.js';
import {
  AJUSTE_CONTRATO,
  AJUSTE_UNIFICADO,
  AUTORIZAR_ANTICIPO,
  CG_AUTORIZAR,
  CG_INFORMAR_CALIDAD,
  GRADOS_CON_VALOR,
  GRADOS_SIN_VALOR,
  LIQUIDACION_AUTORIZAR,
  LSG_AJUSTAR_X_COE,
  LSG_AJUSTAR_X_CONTRATO,
  LSG_AUTORIZAR,
} from './lpg-schemas.js';
import type {
  AutorizarCPEAutomotorDGParams,
  AutorizarCPEAutomotorParams,
  AutorizarCPEEmisionDestinoDGParams,
  AutorizarCPEFerroviariaDGParams,
  AutorizarCPEFerroviariaParams,
  ConfirmacionDefinitivaCPEAutomotorParams,
  ConfirmacionDefinitivaCPEFerroviariaParams,
  EditarCPEAutomotorParams,
  EditarCPEConfirmadaParams,
  EditarCPEFerroviariaParams,
} from './cpe-types.js';
import type {
  AjusteContratoParams,
  AjusteUnificadoParams,
  AutorizarAnticipoParams,
  CgAutorizarParams,
  CgInformarCalidadParams,
  GradoLpg,
  LiquidacionAutorizarParams,
  LsgAjustarXCoeParams,
  LsgAjustarXContratoParams,
  LsgAutorizarParams,
} from './lpg-types.js';

/** @internal `origen` debe tener `operador` o `productor`. */
export function requireOrigen(input: Record<string, unknown>, errors: ValidationErrorDetail[]): void {
  const origen = input['origen'];
  if (origen !== null && typeof origen === 'object') {
    const o = origen as Record<string, unknown>;
    if (o['operador'] == null && o['productor'] == null) {
      errors.push({ field: 'origen', message: 'origen: se debe informar operador o productor', value: origen });
    }
  }
}

/** @internal Las consultas de una CPE necesitan `cartaPorte` o `nroCTG`. */
export function requireCartaPorteOCtg(input: Record<string, unknown>, errors: ValidationErrorDetail[]): void {
  if (input['cartaPorte'] == null && input['nroCTG'] == null) {
    errors.push({ field: 'cartaPorte', message: 'se debe informar cartaPorte o nroCTG' });
  }
}

/** Motivos de contingencia de una CPE automotor, automotor DG o emitida en destino (manual WSCPE §4.2). */
const MOTIVOS_AUTOMOTOR: readonly string[] = ['A', 'B', 'C', 'D', 'E', 'F'];
/** Motivos de contingencia de una CPE ferroviaria o ferroviaria DG: todos los de `MotivoContingencia`. */
const MOTIVOS_FERROVIARIA: readonly string[] = [...MOTIVOS_AUTOMOTOR, 'G'];
/** Motivos de contingencia de los tipos de CPE que no admiten los de automotor (manual WSCPE §4.2). */
const MOTIVOS_CONTINGENCIA: Readonly<Record<number, readonly string[]>> = {
  [TIPO_CPE.FERROVIARIA]: MOTIVOS_FERROVIARIA,
  [TIPO_CPE.FERROVIARIA_DG]: MOTIVOS_FERROVIARIA,
  [TIPO_CPE.DUCTOS_DG]: ['A', 'C', 'D', 'E', 'F'],
};

/**
 * @internal Motivo de contingencia según el tipo de CPE (manual WSCPE §4.2):
 * A a G en ferroviaria y ferroviaria DG, A, C, D, E o F en ductos DG, A a F en el resto.
 * Un concepto fuera de A a G ya lo informa el schema.
 */
export function checkConceptoContingencia(input: Record<string, unknown>, errors: ValidationErrorDetail[]): void {
  const tipo = (input['cartaPorte'] as { tipoCPE?: unknown } | undefined)?.tipoCPE;
  const concepto = (input['contingencia'] as { concepto?: unknown } | undefined)?.concepto;
  if (typeof tipo !== 'number' || typeof concepto !== 'string' || !MOTIVOS_FERROVIARIA.includes(concepto)) return;
  const admitidos = MOTIVOS_CONTINGENCIA[tipo] ?? MOTIVOS_AUTOMOTOR;
  if (!admitidos.includes(concepto)) {
    errors.push({
      field: 'contingencia.concepto',
      message: `contingencia.concepto: ${concepto} no corresponde a una CPE tipo ${tipo} (admite ${admitidos.join(', ')})`,
      value: concepto,
    });
  }
}

/**
 * @internal Datos que el manual (§3.2) pide "solo si" en la autorización de una
 * CPE DG: `cuitTitularPlanta` con `esUsuarioIndustria`, `cantidadUnidades` y
 * `kgLitroM3` con un embalaje que no sea a granel (1), y `fechaLote` con `lote`.
 */
export function checkCargaDG(input: Record<string, unknown>, errors: ValidationErrorDetail[]): void {
  const origen = input['origen'] as Record<string, unknown> | undefined;
  if (origen?.['cuitTitularPlanta'] != null && origen['esUsuarioIndustria'] === false) {
    errors.push({
      field: 'origen.cuitTitularPlanta',
      message: 'origen.cuitTitularPlanta: solo corresponde con esUsuarioIndustria = true',
      value: origen['cuitTitularPlanta'],
    });
  }
  const carga = input['datosCarga'] as Record<string, unknown> | undefined;
  if (!carga) return;
  if (carga['tipoEmbalaje'] === 1) {
    for (const campo of ['cantidadUnidades', 'kgLitroM3']) {
      if (carga[campo] != null) {
        errors.push({
          field: `datosCarga.${campo}`,
          message: `datosCarga.${campo}: no corresponde con tipoEmbalaje 1 (a granel)`,
          value: carga[campo],
        });
      }
    }
  }
  if (carga['fechaLote'] != null && carga['lote'] == null) {
    errors.push({
      field: 'datosCarga.fechaLote',
      message: 'datosCarga.fechaLote: solo corresponde si se informa lote',
      value: carga['fechaLote'],
    });
  }
}

/** Rango máximo de fechas de `consultarCPEPorDestino` (error 2152). */
const MAX_DIAS_CONSULTA_DESTINO = 3;

/**
 * @internal `fechaPartidaHasta` no anterior a `fechaPartidaDesde` y a lo sumo 3 días después (error 2152).
 * Homologación acepta del 01 al 04 y rechaza del 01 al 05 con 2152. Un rango
 * invertido ARCA no lo rechaza (responde sin resultados); acá se rechaza igual.
 */
export function checkRangoConsultaDestino(input: Record<string, unknown>, errors: ValidationErrorDetail[]): void {
  let dias: number;
  try {
    dias = diasEntre(input['fechaPartidaDesde'] as Date | string, input['fechaPartidaHasta'] as Date | string);
  } catch (e) {
    if (e instanceof ArcaValidationError) return; // las fechas inválidas ya las informa el schema
    throw e;
  }
  if (dias < 0 || dias > MAX_DIAS_CONSULTA_DESTINO) {
    errors.push({
      field: 'fechaPartidaHasta',
      message: `fechaPartidaHasta: debe estar entre fechaPartidaDesde y ${MAX_DIAS_CONSULTA_DESTINO} días después (error 2152)`,
      value: input['fechaPartidaHasta'],
    });
  }
}

/**
 * @internal Un ajuste (unificado, por contrato o de liquidación secundaria)
 * necesita `ajusteCredito` y/o `ajusteDebito` (en lsg*, error 3010).
 */
export function requireAjuste(input: Record<string, unknown>, errors: ValidationErrorDetail[]): void {
  if (input['ajusteCredito'] == null && input['ajusteDebito'] == null) {
    errors.push({ field: 'ajusteCredito', message: 'se debe informar ajusteCredito y/o ajusteDebito' });
  }
}

/** Bloque propio de cada tipo de certificado en `cgAutorizar` (manual WSLPG §2.4.36.1). */
const BLOQUES_CERTIFICADO: Readonly<Record<string, readonly string[]>> = {
  P: ['primaria'],
  R: ['retiroTransferencia'],
  T: ['retiroTransferencia'],
  E: ['preexistente', 'preexistenteFusion'],
};
const TODOS_LOS_BLOQUES: readonly string[] = [...new Set(Object.values(BLOQUES_CERTIFICADO).flat())];

/**
 * @internal `cgAutorizar` lleva exactamente el bloque de su `tipoCertificado`:
 * `primaria` (P), `retiroTransferencia` (R o T) y `preexistente` o
 * `preexistenteFusion` (E, este último si el certificado es de una fusión).
 */
export function checkBloqueCertificado(input: Record<string, unknown>, errors: ValidationErrorDetail[]): void {
  const tipo = (input['cabecera'] as { tipoCertificado?: unknown } | undefined)?.tipoCertificado;
  const propios = typeof tipo === 'string' ? BLOQUES_CERTIFICADO[tipo] : undefined;
  if (!propios) return; // un tipo inválido lo informa el schema
  const informados = TODOS_LOS_BLOQUES.filter((k) => input[k] != null);
  for (const k of informados.filter((k) => !propios.includes(k))) {
    errors.push({ field: k, message: `${k}: no corresponde a un certificado tipo ${tipo}`, value: input[k] });
  }
  const deTipo = informados.filter((k) => propios.includes(k));
  if (deTipo.length === 0) {
    errors.push({ field: propios[0], message: `se debe informar ${propios.join(' o ')} (certificado tipo ${tipo})` });
  } else if (deTipo.length > 1) {
    errors.push({ field: deTipo[1], message: `se debe informar solo uno de ${propios.join(' o ')}` });
  }
}

/**
 * @internal Calidad de `cgInformarCalidad` (manual WSLPG §2.4.44.3): codGrado
 * y/o valorFactor (3018), valorGrado solo con codGrado (3017), no con G1-G3
 * (3014) y obligatorio con FG, F1-F3 (3015).
 */
export function checkCalidadCg(input: Record<string, unknown>, errors: ValidationErrorDetail[]): void {
  const calidad = input['calidad'];
  if (calidad === null || typeof calidad !== 'object') return;
  const { codGrado, valorGrado, valorFactor } = calidad as {
    codGrado?: unknown;
    valorGrado?: unknown;
    valorFactor?: unknown;
  };
  const grado = codGrado as GradoLpg; // un código inválido ya lo informa el schema
  const add = (field: string, message: string) => errors.push({ field: `calidad.${field}`, message });
  if (codGrado == null && valorFactor == null) {
    add('codGrado', 'calidad: se debe informar codGrado y/o valorFactor (error 3018)');
  }
  if (valorGrado != null && codGrado == null) add('valorGrado', 'calidad.valorGrado: requiere codGrado (error 3017)');
  if (valorGrado != null && GRADOS_SIN_VALOR.includes(grado)) {
    add('valorGrado', `calidad.valorGrado: no se informa con el grado ${codGrado} (error 3014)`);
  }
  if (valorGrado == null && GRADOS_CON_VALOR.includes(grado)) {
    add('valorGrado', `calidad.valorGrado: obligatorio con el grado ${codGrado} (error 3015)`);
  }
}

/**
 * @internal Validaciones de negocio de `liquidacionAutorizar` que no dependen
 * de los padrones de ARCA (manual WSLPG §2.4.2.3):
 *
 * - 1609: si liquida el comprador una compraventa (`codTipoOperacion` 1),
 *   informar `esLiquidacionPropia`.
 * - 1617: si liquida el comprador y no es propia producción, informar
 *   `actuaCorredor`.
 * - 1631 / 1634: informar `codGradoEnt` y/o `factorEnt`; `valGradoEnt` solo
 *   con `codGradoEnt`.
 * - 1644 / 1646: con `certificados` no se informan `pesoNetoSinCertificado` ni
 *   la procedencia sin certificado. Sin `certificados`, homologación rechaza
 *   con 1646 un `pesoNetoSinCertificado` sin procedencia: se exige al menos
 *   uno de `codLocalidadProcedenciaSinCertificado` y
 *   `codProvProcedenciaSinCertificado` (si falta uno de los dos, la
 *   combinación la valida ARCA, error 1529).
 */
export function checkLiquidacion(input: Record<string, unknown>, errors: ValidationErrorDetail[]): void {
  const liq = input['liquidacion'];
  if (liq === null || typeof liq !== 'object') return;
  const l = liq as Record<string, unknown>;
  const add = (field: string, message: string) => errors.push({ field: `liquidacion.${field}`, message });
  if (l['liquidaCorredor'] === 'N') {
    if (Number(l['codTipoOperacion']) === 1 && l['esLiquidacionPropia'] == null) {
      add(
        'esLiquidacionPropia',
        'liquidacion.esLiquidacionPropia: obligatorio si liquida el comprador una compraventa (error 1609)',
      );
    }
    if (l['esLiquidacionPropia'] === 'N' && l['actuaCorredor'] == null) {
      add('actuaCorredor', 'liquidacion.actuaCorredor: obligatorio si no es liquidación propia (error 1617)');
    }
  }
  if (l['codGradoEnt'] == null && l['factorEnt'] == null) {
    add('codGradoEnt', 'liquidacion: se debe informar codGradoEnt y/o factorEnt (error 1631)');
  }
  if (l['valGradoEnt'] != null && l['codGradoEnt'] == null) {
    add('valGradoEnt', 'liquidacion.valGradoEnt: requiere codGradoEnt (error 1634)');
  }
  const procedencia = ['codLocalidadProcedenciaSinCertificado', 'codProvProcedenciaSinCertificado'] as const;
  const certificados = l['certificados'];
  if (Array.isArray(certificados) && certificados.length > 0) {
    if (l['pesoNetoSinCertificado'] != null) {
      add('pesoNetoSinCertificado', 'liquidacion.pesoNetoSinCertificado: no se informa con certificados (error 1644)');
    }
    for (const k of procedencia.filter((k) => l[k] != null)) {
      add(k, `liquidacion.${k}: no se informa con certificados (error 1646)`);
    }
  } else if (l['pesoNetoSinCertificado'] != null && procedencia.every((k) => l[k] == null)) {
    add(
      procedencia[0],
      `liquidacion: sin certificados, pesoNetoSinCertificado va con ${procedencia.join(' y ')} (error 1646)`,
    );
  }
}

/** Valida una solicitud de `autorizarCPEAutomotor`. @throws ArcaValidationError */
export function validateAutorizarCPEAutomotor(params: AutorizarCPEAutomotorParams): void {
  encodeRequest(params, AUTORIZAR_AUTOMOTOR, 'autorizarCPEAutomotor', requireOrigen);
}

/** Valida una solicitud de `autorizarCPEFerroviaria`. @throws ArcaValidationError */
export function validateAutorizarCPEFerroviaria(params: AutorizarCPEFerroviariaParams): void {
  encodeRequest(params, AUTORIZAR_FERROVIARIA, 'autorizarCPEFerroviaria');
}

/** Valida una solicitud de `editarCPEAutomotor`. @throws ArcaValidationError */
export function validateEditarCPEAutomotor(params: EditarCPEAutomotorParams): void {
  encodeRequest(params, EDITAR_AUTOMOTOR, 'editarCPEAutomotor');
}

/** Valida una solicitud de `editarCPEFerroviaria`. @throws ArcaValidationError */
export function validateEditarCPEFerroviaria(params: EditarCPEFerroviariaParams): void {
  encodeRequest(params, EDITAR_FERROVIARIA, 'editarCPEFerroviaria');
}

/**
 * Valida una solicitud de `editarCPEConfirmadaAutomotor` o
 * `editarCPEConfirmadaFerroviaria` (mismo tipo). @throws ArcaValidationError
 */
export function validateEditarCPEConfirmada(params: EditarCPEConfirmadaParams): void {
  encodeRequest(params, EDITAR_CONFIRMADA, 'editarCPEConfirmada');
}

/** Valida una solicitud de `confirmacionDefinitivaCPEAutomotor`. @throws ArcaValidationError */
export function validateConfirmacionDefinitivaCPEAutomotor(params: ConfirmacionDefinitivaCPEAutomotorParams): void {
  encodeRequest(params, CONFIRMACION_AUTOMOTOR, 'confirmacionDefinitivaCPEAutomotor');
}

/** Valida una solicitud de `confirmacionDefinitivaCPEFerroviaria`. @throws ArcaValidationError */
export function validateConfirmacionDefinitivaCPEFerroviaria(params: ConfirmacionDefinitivaCPEFerroviariaParams): void {
  encodeRequest(params, CONFIRMACION_FERROVIARIA, 'confirmacionDefinitivaCPEFerroviaria');
}

/** Valida una solicitud de `autorizarCPEAutomotorDG`. @throws ArcaValidationError */
export function validateAutorizarCPEAutomotorDG(params: AutorizarCPEAutomotorDGParams): void {
  encodeRequest(params, AUTORIZAR_AUTOMOTOR_DG, 'autorizarCPEAutomotorDG', checkCargaDG);
}

/** Valida una solicitud de `autorizarCPEFerroviariaDG`. @throws ArcaValidationError */
export function validateAutorizarCPEFerroviariaDG(params: AutorizarCPEFerroviariaDGParams): void {
  encodeRequest(params, AUTORIZAR_FERROVIARIA_DG, 'autorizarCPEFerroviariaDG', checkCargaDG);
}

/** Valida una solicitud de `autorizarCPEEmisionDestinoDG`. @throws ArcaValidationError */
export function validateAutorizarCPEEmisionDestinoDG(params: AutorizarCPEEmisionDestinoDGParams): void {
  encodeRequest(params, AUTORIZAR_EMISION_DESTINO_DG, 'autorizarCPEEmisionDestinoDG', checkCargaDG);
}

/** Valida una solicitud de `liquidacionAutorizar`. @throws ArcaValidationError */
export function validateLiquidacion(params: LiquidacionAutorizarParams): void {
  encodeRequest(params, LIQUIDACION_AUTORIZAR, 'liquidacionAutorizar', checkLiquidacion);
}

/** Valida una solicitud de `liquidacionAjustarUnificado`. @throws ArcaValidationError */
export function validateAjusteUnificado(params: AjusteUnificadoParams): void {
  encodeRequest(params, AJUSTE_UNIFICADO, 'liquidacionAjustarUnificado', requireAjuste);
}

/** Valida una solicitud de `cgAutorizar`. @throws ArcaValidationError */
export function validateCgAutorizar(params: CgAutorizarParams): void {
  encodeRequest(params, CG_AUTORIZAR, 'cgAutorizar', checkBloqueCertificado);
}

/** Valida una solicitud de `liquidacionAjustarContrato`. @throws ArcaValidationError */
export function validateAjusteContrato(params: AjusteContratoParams): void {
  encodeRequest(params, AJUSTE_CONTRATO, 'liquidacionAjustarContrato', requireAjuste);
}

/** Valida una solicitud de `lpgAutorizarAnticipo`. @throws ArcaValidationError */
export function validateAutorizarAnticipo(params: AutorizarAnticipoParams): void {
  encodeRequest(params, AUTORIZAR_ANTICIPO, 'lpgAutorizarAnticipo');
}

/** Valida una solicitud de `cgInformarCalidad`. @throws ArcaValidationError */
export function validateCgInformarCalidad(params: CgInformarCalidadParams): void {
  encodeRequest(params, CG_INFORMAR_CALIDAD, 'cgInformarCalidad', checkCalidadCg);
}

/** Valida una solicitud de `lsgAutorizar`. @throws ArcaValidationError */
export function validateLsgAutorizar(params: LsgAutorizarParams): void {
  encodeRequest(params, LSG_AUTORIZAR, 'lsgAutorizar');
}

/** Valida una solicitud de `lsgAjustarXCoe`. @throws ArcaValidationError */
export function validateLsgAjustarXCoe(params: LsgAjustarXCoeParams): void {
  encodeRequest(params, LSG_AJUSTAR_X_COE, 'lsgAjustarXCoe', requireAjuste);
}

/** Valida una solicitud de `lsgAjustarXContrato`. @throws ArcaValidationError */
export function validateLsgAjustarXContrato(params: LsgAjustarXContratoParams): void {
  encodeRequest(params, LSG_AJUSTAR_X_CONTRATO, 'lsgAjustarXContrato', requireAjuste);
}
