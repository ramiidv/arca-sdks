import { WSAA_ENDPOINTS } from '@ramiidv/arca-common';

// Re-export shared enums from common
export { Provincia, DocTipo, CondicionIva } from '@ramiidv/arca-common';

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/**
 * Endpoints de los servicios de Padrón.
 *
 * El manual de la constancia de inscripción (v4.1) publica los hosts
 * `awshomo.arca.gob.ar` / `aws.arca.gob.ar`. El SDK usa `awshomo.afip.gov.ar` /
 * `aws.afip.gov.ar`: son los `soap:address` de los WSDL oficiales de los cinco
 * servicios y los que publica el manual de A13 (v1.4), y responden igual. Para
 * usar otro host, pasá `endpoints` en la configuración.
 */
export const ENDPOINTS = {
  wsaa: WSAA_ENDPOINTS,
  /** Constancia de inscripción (ex Padrón A5: ws_sr_padron_a5 está deprecado por ARCA). */
  a5: {
    testing: 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5',
    production: 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5',
    namespace: 'http://a5.soap.ws.server.puc.sr/',
    serviceId: 'ws_sr_constancia_inscripcion',
  },
  a13: {
    testing: 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA13',
    production: 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA13',
    namespace: 'http://a13.soap.ws.server.puc.sr/',
    serviceId: 'ws_sr_padron_a13',
  },
  a4: {
    testing: 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA4',
    production: 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA4',
    namespace: 'http://a4.soap.ws.server.puc.sr/',
    serviceId: 'ws_sr_padron_a4',
  },
  a10: {
    testing: 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA10',
    production: 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA10',
    namespace: 'http://a10.soap.ws.server.puc.sr/',
    serviceId: 'ws_sr_padron_a10',
  },
  a100: {
    testing: 'https://awshomo.afip.gov.ar/sr-parametros/webservices/parameterServiceA100',
    production: 'https://aws.afip.gov.ar/sr-parametros/webservices/parameterServiceA100',
    namespace: 'http://a100.soap.ws.server.pucParam.sr/',
    serviceId: 'ws_sr_padron_a100',
  },
} as const;

// ---------------------------------------------------------------------------
// Enums (domain-specific)
// ---------------------------------------------------------------------------

/**
 * Tipos de domicilio (`tipoDomicilio`), según los manuales de la constancia
 * (v4.1), A4 (v1.3), A10 (v1.2) y A13 (v1.4): `FISCAL`, `LEGAL/REAL` y, en
 * A4, `LOCALES Y ESTABLECIMIENTOS`.
 */
export enum TipoDomicilio {
  FISCAL = 'FISCAL',
  LEGAL_REAL = 'LEGAL/REAL',
  /** Solo en A4. */
  LOCALES_Y_ESTABLECIMIENTOS = 'LOCALES Y ESTABLECIMIENTOS',
  /** @deprecated Los manuales informan `LEGAL/REAL` (`TipoDomicilio.LEGAL_REAL`). Se quita en la próxima major. */
  LEGAL = 'LEGAL',
  /** @deprecated Los manuales informan `LEGAL/REAL` (`TipoDomicilio.LEGAL_REAL`). Se quita en la próxima major. */
  REAL = 'REAL',
}

/** Tipos de persona */
export enum TipoPersona {
  FISICA = 'FISICA',
  JURIDICA = 'JURIDICA',
}

/**
 * IDs de impuestos de SUPA.
 *
 * Respaldados por los manuales de ARCA: 11, 20, 21, 30, 180, 301, 308
 * (ejemplos y validaciones de los manuales de constancia de inscripción v4.1 y
 * A4 v1.3). Los marcados "sin respaldo" no figuran en esos manuales.
 */
export enum ImpuestoId {
  /** Ganancias sociedades. Sin respaldo en los manuales del padrón. */
  GANANCIAS_PJ = 10,
  /** Ganancias personas físicas. */
  GANANCIAS_PH = 11,
  /** Monotributo. */
  MONOTRIBUTO = 20,
  /** Monotributo autónomo (manual A4 v1.3). */
  MONOTRIBUTO_AUTONOMO = 21,
  /** IVA. */
  IVA_RESPONSABLE_INSCRIPTO = 30,
  /**
   * IVA responsable no inscripto. Sin respaldo en los manuales del padrón. La
   * categoría fue eliminada (Ley 25.865) y no tiene `CondicionIVAReceptorId`:
   * `condicionIvaDesdePadron` devuelve `null` con un motivo propio.
   */
  IVA_RESPONSABLE_NO_INSCRIPTO = 33,
  /** IVA exento. Sin respaldo en los manuales del padrón: el A4 informa la exención como impuesto 30 con estado EXENTO. */
  IVA_EXENTO = 32,
  /** IVA no alcanzado. Sin respaldo en los manuales del padrón. */
  IVA_NO_ALCANZADO = 34,
  /** Bienes personales (manual de constancia v4.1: "180 – Bs Ps"). Antes figuraba, mal, como 31. */
  BIENES_PERSONALES = 180,
  /** Empleador - aportes de la seguridad social. */
  EMPLEADOR = 301,
  /** Aportes de la seguridad social - autónomos. */
  AUTONOMOS = 308,
}

/** Estado de la clave fiscal del contribuyente */
export enum EstadoClave {
  ACTIVO = 'ACTIVO',
  INACTIVO = 'INACTIVO',
  /**
   * @deprecated Los manuales solo documentan `ACTIVO` e `INACTIVO`; "limitada"
   * aparece en el texto de `errorConstancia`, no en `estadoClave`. Se quita en
   * la próxima major.
   */
  LIMITADO = 'LIMITADO',
}

/**
 * Nombres de colecciones de ws_sr_padron_a100 (manual v2.1, anexo 5.1).
 *
 * La fila de "Categorías de Monotributo según F.184" está cortada en el manual
 * (solo se lee el atributo `COD_CATEGORIA_MONOTRIBUTO`), así que no se incluye:
 * pasá el nombre como string si lo conocés.
 */
export enum CollectionName {
  PROVINCIA = 'SUPA.E_PROVINCIA',
  TIPO_DOCUMENTO = 'SUPA.TIPO_DOCUMENTO',
  TIPO_DOMICILIO = 'SUPA.TIPO_DOMICILIO',
  TIPO_CLAVE = 'SUPA.TIPO_CLAVE_IDENTIFICACION',
  TIPO_EMPRESA_JURIDICA = 'SUPA.TIPO_EMPRESA_JURIDICA',
  TIPO_EMPRESA_JURIDICA_SUBGRUPO = 'SUPA.TIPO_EMPRESA_JURI_SUBGRUPO',
  TIPO_RELACION = 'SUPA.TIPO_RELACION',
  TIPO_SUBTIPO_RELACION = 'SUPA.TIPO_SUBTIPO_RELACION',
  TIPO_COMPONENTE_SOCIEDAD = 'SUPA.TIPO_COMPONENTE_SOCIEDAD',
  TIPO_RELACION_COMPONENTE_SOC = 'SUPA.TIPO_RELACION_COMPONENTE_SOC',
  TIPO_EMAIL = 'SUPA.TIPO_EMAIL',
  TIPO_TELEFONO = 'SUPA.TIPO_TELEFONO',
  TIPO_RESIDENCIA = 'SUPA.TIPO_RESIDENCIA',
  TIPO_DATO_ADICIONAL_DOMICILIO = 'SUPA.TIPO_DATO_ADICIONAL_DOMICILIO',
  ORGANISMO_INFORMANTE = 'SUPA.E_ORGANISMO_INFORMANTE',
  ORGANISMO_CONTROL = 'SUPA.E_ORGANISMO_CONTROL',
  PROVINCIA_SOCIEDAD_ORG = 'SUPA.A_PROVINCIA_SOCIEDAD_ORG',
  SEXO = 'E_SEXO',
  CALLE = 'PUC_PARAM.T_CALLE',
  LOCALIDAD = 'PUC_PARAM.T_LOCALIDAD',
  /** Tipología de autónomos de monotributo según F.184. */
  AUTONOMO_MONOTRIBUTO = 'SUPA.E_AUTONOMO_MONOTRIBUTO',
  /** Nómina de regímenes vigentes y no vigentes. */
  REGIMEN = 'SUPA.E_REGIMEN',
  /** Clasificaciones de regímenes. */
  TIPO_REGIMEN = 'SUPA.TIPO_REGIMEN',
  /** Atributos y características de los contribuyentes. */
  CARACTERIZACION = 'SUPA.E_CARACTERIZACION',
  /** Tipos de documento válidos para el sistema. */
  TIPO_ARCHIVO = 'SUPA.TIPO_ARCHIVO',
  /** Relaciones entre actividades y rubros de todos los nomencladores. */
  ACTIVIDAD_RUBRO = 'SUPA.A_ACTIVIDAD_RUBRO',
  /** Rubros de los nomencladores de actividades económicas. */
  RUBRO_ACTIVIDAD = 'SUPA.E_RUBRO_ACTIVIDAD',
  /** Actividades ocupacionales no incluidas en el nomenclador F.150. */
  ACTIVIDAD_OCUPACIONAL = 'SUPA.E_ACTIVIDAD_OCUPACIONAL',
}
