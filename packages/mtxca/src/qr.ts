import { ArcaValidationError, generarUrlQR } from '@ramiidv/arca-common';
import { Moneda } from './constants.js';
import type { QROptions } from '@ramiidv/arca-common';
import type {
  MtxcaAutorizarResult,
  MtxcaComprobanteBase,
  MtxcaComprobanteConsultado,
  MtxcaInformarCAEAResult,
} from './types.js';

/**
 * Datos del comprobante que usa el QR: el request enviado (`autorizar`,
 * `informarComprobanteCAEA`) o el que devuelve `consultarComprobante`.
 */
export type ComprobanteQR = Pick<
  MtxcaComprobanteBase,
  | 'codigoTipoComprobante'
  | 'numeroPuntoVenta'
  | 'fechaEmision'
  | 'codigoTipoDocumento'
  | 'numeroDocumento'
  | 'importeTotal'
  | 'codigoMoneda'
  | 'cotizacionMoneda'
> &
  Partial<Pick<MtxcaComprobanteConsultado, 'numeroComprobante' | 'codigoTipoAutorizacion' | 'codigoAutorizacion'>>;

function fail(field: string, message: string, value?: unknown): never {
  throw new ArcaValidationError(`QR: ${field}: ${message}`, [{ field, message, value }], field);
}

/**
 * URL del código QR del comprobante (RG 4892), armada con `generarUrlQR` de
 * `@ramiidv/arca-common`.
 *
 * - Con `resultado` (de `autorizar`/`autorizarComprobante` o
 *   `informarComprobanteCAEA`): toma tipo, punto de venta, número y CAE/CAEA de
 *   la respuesta; con CAE, también la fecha de emisión que asignó ARCA.
 * - Sin `resultado`: `comprobante` tiene que ser el de `consultarComprobante`
 *   (`codigoAutorizacion`, `codigoTipoAutorizacion` "E"/"A" y `numeroComprobante`).
 * - `ctz`: `cotizacionMoneda` (1 si la moneda es PES). Si se omitió por
 *   `cancelaEnMismaMonedaExtranjera`, usá el comprobante de `consultarComprobante`.
 *
 * @param cuit CUIT del emisor.
 * @throws ArcaValidationError si el comprobante fue rechazado o falta algún dato.
 */
export function urlQR(
  cuit: number | string,
  comprobante: ComprobanteQR,
  resultado?: MtxcaAutorizarResult | MtxcaInformarCAEAResult,
  options?: QROptions,
): string {
  if (comprobante === null || typeof comprobante !== 'object') fail('comprobante', 'es obligatorio', comprobante);
  let datos: {
    tipoCmp: number;
    ptoVta: number;
    nroCmp: number | undefined;
    codAut: string | undefined;
    tipoCodAut: string | undefined;
    fecha: string | Date | undefined;
  };
  if (resultado !== undefined) {
    if (resultado.resultado === 'R' || !resultado.comprobante) {
      fail('resultado', 'el comprobante fue rechazado: no tiene CAE/CAEA', resultado.resultado);
    }
    const r = resultado.comprobante;
    const cae = 'cae' in r;
    datos = {
      tipoCmp: r.codigoTipoComprobante,
      ptoVta: r.numeroPuntoVenta,
      nroCmp: r.numeroComprobante,
      codAut: cae ? r.cae : r.caea,
      tipoCodAut: cae ? 'E' : 'A',
      fecha: cae ? r.fechaEmision : comprobante.fechaEmision,
    };
  } else {
    datos = {
      tipoCmp: comprobante.codigoTipoComprobante,
      ptoVta: comprobante.numeroPuntoVenta,
      nroCmp: comprobante.numeroComprobante,
      codAut: comprobante.codigoAutorizacion,
      tipoCodAut: comprobante.codigoTipoAutorizacion,
      fecha: comprobante.fechaEmision,
    };
  }
  if (datos.tipoCodAut !== 'E' && datos.tipoCodAut !== 'A') {
    fail('codigoTipoAutorizacion', 'debe ser "E" (CAE) o "A" (CAEA)', datos.tipoCodAut);
  }
  if (datos.nroCmp === undefined) fail('numeroComprobante', 'es obligatorio', datos.nroCmp);
  if (datos.codAut === undefined) fail('codigoAutorizacion', 'es obligatorio (CAE o CAEA)', datos.codAut);
  if (datos.fecha === undefined) fail('fechaEmision', 'es obligatoria para el QR', datos.fecha);

  const ctz = comprobante.cotizacionMoneda ?? (comprobante.codigoMoneda === Moneda.PESOS ? 1 : undefined);
  if (ctz === undefined) {
    fail('cotizacionMoneda', 'es obligatoria para el QR (consultala con consultarComprobante)', ctz);
  }

  return generarUrlQR(
    {
      fecha: datos.fecha,
      cuit,
      ptoVta: datos.ptoVta,
      tipoCmp: datos.tipoCmp,
      nroCmp: datos.nroCmp,
      importe: comprobante.importeTotal,
      moneda: comprobante.codigoMoneda,
      ctz,
      tipoDocRec: comprobante.codigoTipoDocumento,
      nroDocRec:
        typeof comprobante.numeroDocumento === 'string'
          ? comprobante.numeroDocumento.replace(/-/g, '')
          : comprobante.numeroDocumento,
      tipoCodAut: datos.tipoCodAut,
      codAut: datos.codAut,
    },
    options,
  );
}
