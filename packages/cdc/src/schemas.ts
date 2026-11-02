/**
 * Schemas del WSDL de WSCDC (`https://wswhomo.afip.gov.ar/WSCDC/service.asmx?WSDL`)
 * para el DSL de `@ramiidv/arca-common/schema`.
 *
 * Los rangos y largos que el WSDL no declara (todo es `s:string`/`s:int`/`s:long`)
 * salen del manual del desarrollador de WSCDC.
 *
 * @internal No se exporta desde `index.ts`.
 */
import { cuit, date8, dec, int, must, obj, opt, str, wrapped, xml } from '@ramiidv/arca-common/schema';
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
  cbteModo: xml('CbteModo', str({ values: CBTE_MODOS })),
  cuitEmisor: xml('CuitEmisor', cuit()),
  ptoVta: xml('PtoVta', int(1, 99998)),
  cbteTipo: xml('CbteTipo', int(1, 999)),
  cbteNro: xml('CbteNro', int(1, 99_999_999)),
  cbteFch: xml('CbteFch', date8()),
  // `s:double`; el manual admite 13 enteros y 2 decimales (error 7).
  impTotal: xml('ImpTotal', dec(2, 0, 9_999_999_999_999.99)),
  codAutorizacion: xml('CodAutorizacion', str({ pattern: /^\d{14}$/ })),
  docTipoReceptor: xml('DocTipoReceptor', opt(str({ pattern: DOC_TIPO_RE }))),
  docNroReceptor: xml('DocNroReceptor', opt(str({ pattern: DOC_NRO_RE }))),
  opcionales: xml(
    'Opcionales',
    opt(
      wrapped(
        'Opcional',
        obj({ id: xml('Id', str({ minLen: 1, maxLen: 4 })), valor: xml('Valor', str({ minLen: 1, maxLen: 250 })) }),
      ),
    ),
  ),
};

// ---------------------------------------------------------------------------
// Respuestas
// ---------------------------------------------------------------------------

/** `Obs` / `Evt` (`Code` es `minOccurs=1`). */
const MENSAJE: Schema = { code: xml('Code', must(int())), msg: xml('Msg', opt(str())) };

/**
 * `CmpDatos` tal como lo devuelve ARCA en `CmpResp`. En el WSDL todos son
 * `minOccurs=0`; el SDK exige los que identifican el comprobante (ARCA los
 * devuelve siempre en un `A`). En un `R`, si falta alguno, el resultado se
 * devuelve sin `cmpResp`.
 */
export const CMP_RESP: Schema = {
  cbteModo: xml('CbteModo', must(str())),
  cuitEmisor: xml('CuitEmisor', must(cuit({ decodeAs: 'string' }))),
  ptoVta: xml('PtoVta', must(int())),
  cbteTipo: xml('CbteTipo', must(int())),
  cbteNro: xml('CbteNro', must(int())),
  cbteFch: xml('CbteFch', must(str())),
  impTotal: xml('ImpTotal', must(dec(2))),
  codAutorizacion: xml('CodAutorizacion', must(str())),
  docTipoReceptor: xml('DocTipoReceptor', opt(str())),
  docNroReceptor: xml('DocNroReceptor', opt(str())),
  opcionales: xml(
    'Opcionales',
    wrapped('Opcional', obj({ id: xml('Id', must(str())), valor: xml('Valor', opt(str())) }), 0),
  ),
};

/** `Events` de las respuestas (lista de `Evt`). */
export const EVENTS = xml('Events', wrapped('Evt', obj(MENSAJE), 0));

/** `CmpResponse` (en orden del WSDL) sin `CmpResp` (que se decodifica aparte) ni `Errors` (`checkServiceErrors`). */
export const CONSTATAR_RESP: Schema = {
  resultado: xml('Resultado', must(str())),
  observaciones: xml('Observaciones', wrapped('Obs', obj(MENSAJE), 0)),
  fchProceso: xml('FchProceso', must(str())),
  events: EVENTS,
};

/**
 * Ítems de `ResultGet` de las tablas de parámetros. Todos los campos son
 * `minOccurs=0`: el SDK exige el código (`Cod`/`Id`, sin él el ítem no sirve);
 * `Desc` ausente queda como `''`.
 */
export const FAC_MOD_TIPO: Schema = {
  cod: xml('Cod', must(str())),
  desc: xml('Desc', opt(str())),
  fchDesde: xml('FchDesde', opt(str())),
  fchHasta: xml('FchHasta', opt(str())),
};
export const CBTE_TIPO: Schema = { id: xml('Id', must(int())), desc: xml('Desc', opt(str())) };
/** `DocTipo` y `OpcionalTipo` (`Id` es `s:string`: se preservan ceros a la izquierda). */
export const ID_DESC: Schema = { id: xml('Id', must(str())), desc: xml('Desc', opt(str())) };
