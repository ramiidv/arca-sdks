import type { ArcaBaseConfig, ServerStatus } from '@ramiidv/arca-common';

// Re-export de tipos de common usados en la API pública.
export type { AccessTicket, ArcaEvent, CallOptions, ServerStatus, TicketStorage } from '@ramiidv/arca-common';

// ============================================================
// Configuración
// ============================================================

/** Configuración de `ArcaAgro`. */
export interface ArcaAgroConfig extends ArcaBaseConfig {
  /** Endpoints propios (ej: un proxy). Si no se indican, se usan los oficiales según `production`. */
  endpoints?: {
    cpe?: string;
    lpg?: string;
    wsaa?: string;
  };
}

// ============================================================
// Tipos comunes
// ============================================================

/** CUIT de 11 dígitos, con o sin guiones. Se valida el dígito verificador. */
export type CuitInput = number | string;

/** `xsd:date`: `Date` (fecha calendario en Argentina) o string `AAAAMMDD` / `AAAA-MM-DD`. */
export type FechaInput = Date | string;

/**
 * `xsd:dateTime`: `Date` (se envía en hora de Argentina, `-03:00`) o string
 * ISO-8601 (ej: `2026-11-01T08:30:00-03:00`), que se envía tal cual.
 */
export type FechaHoraInput = Date | string;

/** Par código/descripción (`CodigoDescripcion` / `LpgCodigoDescripcionType`). */
export interface CodigoDescripcion {
  codigo: string;
  descripcion: string;
}

/** Resultado de `serverStatus()` para un servicio. */
export type AgroServiceStatus = { ok: true; status: ServerStatus } | { ok: false; error: Error };
