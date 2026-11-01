/**
 * Schemas del WSDL de WSCDC (`https://wswhomo.afip.gov.ar/WSCDC/service.asmx?WSDL`)
 * para el DSL de `@ramiidv/arca-common/schema`.
 *
 * Los rangos y largos que el WSDL no declara (todo es `s:string`/`s:int`/`s:long`)
 * salen del manual del desarrollador de WSCDC.
 *
 * @internal No se exporta desde `index.ts`.
 */
import { cuit, date8, dec, int, must, obj, opt, str, wrapped } from '@ramiidv/arca-common/schema';
import type { Schema } from '@ramiidv/arca-common/schema';
import { CBTE_MODOS } from './constants.js';

/** `DocTipoReceptor`: numérico de hasta 2 dígitos. */
export const DOC_TIPO_RE = /^\d{1,2}$/;
/** `DocNroReceptor`: solo dígitos, hasta 20. */
export const DOC_NRO_RE = /^\d{1,20}$/;

// ---------------------------------------------------------------------------
// Request: CmpDatos (CmpReq de ComprobanteConstatar)
// ---------------------------------------------------------------------------

/**
 * `CmpDatos` en orden del WSDL. `CbteModo`, `CbteFch` y `CodAutorizacion` son
 * `minOccurs=0` en el WSDL pero el manual los exige.
 */
export const CMP_REQ: Schema = {
  CbteModo: str({ values: CBTE_MODOS }),
  CuitEmisor: cuit(),
  PtoVta: int(1, 99998),
  CbteTipo: int(1, 999),
  CbteNro: int(1, 99_999_999),
  CbteFch: date8(),
  // `s:double`; el manual admite 13 enteros y 2 decimales (error 7).
  ImpTotal: dec(2, 0, 9_999_999_999_999.99),
  CodAutorizacion: str({ pattern: /^\d{14}$/ }),
  DocTipoReceptor: opt(str({ pattern: DOC_TIPO_RE })),
  DocNroReceptor: opt(str({ pattern: DOC_NRO_RE })),
  Opcionales: opt(
    wrapped('Opcional', obj({ Id: str({ minLen: 1, maxLen: 4 }), Valor: str({ minLen: 1, maxLen: 250 }) })),
  ),
};

// ---------------------------------------------------------------------------
// Respuestas
// ---------------------------------------------------------------------------

/** `Obs` / `Evt` (`Code` es `minOccurs=1`). */
const MENSAJE: Schema = { Code: must(int()), Msg: opt(str()) };

/** `CmpDatos` tal como lo devuelve ARCA en `CmpResp`. */
export const CMP_RESP: Schema = {
  CbteModo: must(str()),
  CuitEmisor: must(cuit({ decodeAs: 'string' })),
  PtoVta: must(int()),
  CbteTipo: must(int()),
  CbteNro: must(int()),
  CbteFch: must(str()),
  ImpTotal: must(dec(2)),
  CodAutorizacion: must(str()),
  DocTipoReceptor: opt(str()),
  DocNroReceptor: opt(str()),
  Opcionales: wrapped('Opcional', obj({ Id: must(str()), Valor: opt(str()) }), 0),
};

/** `CmpResponse` sin `CmpResp` (que se decodifica aparte) ni `Errors` (`checkServiceErrors`). */
export const CONSTATAR_RESP: Schema = {
  Resultado: must(str()),
  FchProceso: must(str()),
  Observaciones: wrapped('Obs', obj(MENSAJE), 0),
  Events: wrapped('Evt', obj(MENSAJE), 0),
};

/** Ítems de `ResultGet` de las tablas de parámetros. */
export const FAC_MOD_TIPO: Schema = {
  Cod: must(str()),
  Desc: must(str()),
  FchDesde: opt(str()),
  FchHasta: opt(str()),
};
export const CBTE_TIPO: Schema = { Id: must(int()), Desc: must(str()) };
/** `DocTipo` y `OpcionalTipo` (`Id` es `s:string`: se preservan ceros a la izquierda). */
export const ID_DESC: Schema = { Id: must(str()), Desc: must(str()) };
