/**
 * Schemas de C2005_schema.xsd con el DSL de `@ramiidv/arca-common/schema`.
 *
 * El XSD solo define tipos, orden y opcionalidad; los largos, rangos y tablas
 * son del manual para el desarrollador v1.0.3. Las fechas (`xs:dateTime`) se
 * serializan antes con `formatSireDateTime` (formato propio del manual, 5.1),
 * por eso acá son `str()`.
 *
 * @internal No se exporta desde `index.ts`.
 */
import { bool, cuit, dec, int, must, opt, str } from '@ramiidv/arca-common/schema';
import type { Field, Schema } from '@ramiidv/arca-common/schema';

/** Máximo de un importe `11,2` (11 enteros + 2 decimales, sin signo). */
const IMPORTE_MAX = 99_999_999_999.99;

/** Texto no vacío (ni solo espacios) de hasta `maxLen` caracteres. */
const texto = (maxLen?: number): Field => str({ maxLen, pattern: /\S/ });
/** Importe `xs:double` del manual: 11 enteros + 2 decimales, sin signo. */
const importe = (): Field => dec(2, 0, IMPORTE_MAX);
/** `xs:dateTime` ya serializado por `formatSireDateTime`. */
const fechaHora = (): Field => str();

/** `tns:certificado` (`xs:sequence` de C2005_schema.xsd). */
export const CERTIFICADO = {
  version: int(),
  codigoTrazabilidad: opt(texto(36)),
  impuesto: int(),
  regimen: int(1, 999),
  fechaRetencion: fechaHora(),
  /** Tabla CONDICION (1 o 2). */
  condicion: opt(int(1, 2)),
  imposibilidadRetencion: bool(),
  motivoNoRetencion: opt(texto(30)),
  importeRetencion: importe(),
  importeBaseCalculo: importe(),
  regimenExclusion: bool(),
  /** 50 o 100 (se valida aparte). */
  porcentajeExclusion: opt(dec(2)),
  fechaPublicacion: opt(fechaHora()),
  /** Tabla TIPO_COMPROBANTE (se valida aparte). */
  tipoComprobante: int(),
  fechaComprobante: fechaHora(),
  /** Formato según el tipo de comprobante (se valida aparte). */
  numeroComprobante: opt(str()),
  coe: opt(texto(12)),
  coeOriginal: opt(texto(12)),
  cae: opt(texto(14)),
  importeComprobante: importe(),
  motivoEmisionNotaCredito: opt(texto(30)),
  cuitRetenido: cuit(),
  numeroCertificadoOriginal: opt(texto(25)),
  fechaRetencionCertificadoOriginal: opt(fechaHora()),
  importeCertificadoOriginal: opt(importe()),
  /** Tabla MOTIVO_DE_ANULACION. No se envía en `emitir` (manual 3.2.1). */
  motivoAnulacion: opt(int(1, 4)),
} as const satisfies Schema;

/** `tns:certificadoAnulacion`. */
export const CERTIFICADO_ANULACION = {
  version: int(),
  codigoTrazabilidad: opt(texto(36)),
  impuesto: int(),
  numeroCertificado: texto(25),
  /** Tabla MOTIVO_DE_ANULACION (1 a 4). */
  motivoAnulacion: int(1, 4),
} as const satisfies Schema;

/** `emitirResponse` / `anularResponse` (ambos `xs:string`). */
export const CERTIFICADO_RESULT = {
  certificadoNro: must(str()),
  codigoSeguridad: must(str()),
} as const satisfies Schema;
