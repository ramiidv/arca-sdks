/**
 * Ejemplo: manejo de errores y recuperación de emisiones inciertas.
 *
 * - ArcaValidationError: datos inválidos, detectados antes de llamar a ARCA.
 * - ArcaAgroServiceError (extiende ArcaServiceError): ARCA rechazó la operación
 *   (`errores.error[]`, y en WSLPG también `erroresFormato`).
 * - ArcaSoapError: red, timeout, HTTP o SOAP Fault. `uncertain: true` en una
 *   emisión significa que ARCA pudo haberla procesado.
 * - ArcaAgroResponseError: respuesta sin un dato imprescindible (ej: nroCTG).
 */
import fs from 'node:fs';
import {
  ArcaAgro,
  ArcaAgroResponseError,
  ArcaAgroServiceError,
  ArcaAuthError,
  ArcaSoapError,
  ArcaValidationError,
  TIPO_CPE,
} from '@ramiidv/arca-agro';
import type { AutorizarCPEAutomotorParams, CPEAutomotorDetalle } from '@ramiidv/arca-agro';

const agro = new ArcaAgro({
  cuit: '20123456786',
  cert: fs.readFileSync('cert.pem', 'utf-8'),
  key: fs.readFileSync('key.pem', 'utf-8'),
});

/**
 * Autoriza una CPE y, si el resultado es incierto, consulta en ARCA si se
 * emitió antes de reintentar (manual WSCPE §1.3).
 */
async function autorizarConRecuperacion(params: AutorizarCPEAutomotorParams): Promise<CPEAutomotorDetalle> {
  const { sucursal, nroOrden, tipoCP } = params.cabecera;
  try {
    return await agro.cpe.autorizarCPEAutomotor(params);
  } catch (error) {
    const incierto =
      (error instanceof ArcaSoapError && error.uncertain) ||
      (error instanceof ArcaAgroResponseError && error.uncertain);
    if (!incierto) throw error;

    // ¿Llegó a autorizarse? El último número de orden lo dice.
    const ultimo = await agro.cpe.consultarUltNroOrden(sucursal, tipoCP);
    if (ultimo >= nroOrden) {
      return agro.cpe.consultarCPEAutomotor({ cartaPorte: { tipoCPE: tipoCP, sucursal, nroOrden } });
    }
    // No se emitió: es seguro reintentar con el mismo número de orden.
    return agro.cpe.autorizarCPEAutomotor(params);
  }
}

async function main() {
  try {
    await autorizarConRecuperacion({
      cabecera: { tipoCP: TIPO_CPE.AUTOMOTOR, cuitSolicitante: '20123456786', sucursal: 1, nroOrden: 1 },
      origen: { operador: { codProvincia: 12, codLocalidad: 5244, planta: 1938 } },
      correspondeRetiroProductor: false,
      esSolicitanteCampo: false,
      datosCarga: { codGrano: 23, cosecha: 2526, pesoBruto: 42000, pesoTara: 12000 },
      destino: { cuit: '30500011129', esDestinoCampo: false, codProvincia: 12, codLocalidad: 5244, planta: 2000 },
      destinatario: { cuit: '30500011129' },
      transporte: {
        cuitTransportista: '20999888772',
        dominio: ['AB123CD'],
        fechaHoraPartida: new Date(),
        kmRecorrer: 30,
        cuitChofer: '27300000008',
        cuitPagadorFlete: '30712345671',
        mercaderiaFumigada: false,
      },
    });
  } catch (error) {
    if (error instanceof ArcaValidationError) {
      for (const d of error.details) console.log(`Dato inválido ${d.field}: ${d.message}`);
    } else if (error instanceof ArcaAgroServiceError) {
      console.log(`${error.service} ${error.method} rechazó la operación:`);
      for (const e of error.errors) console.log(`  [${e.rawCode ?? e.code}] ${e.msg}`);
    } else if (error instanceof ArcaAuthError) {
      console.log('Error de autenticación WSAA:', error.message);
    } else if (error instanceof ArcaSoapError) {
      console.log('Error de comunicación:', error.message, 'incierto:', error.uncertain);
    } else {
      throw error;
    }
  }

  // Estado de los servicios: una falla no oculta el estado del otro.
  const estado = await agro.status();
  console.log('WSCPE:', estado.cpe.ok ? estado.cpe.status : estado.cpe.error.message);
  console.log('WSLPG:', estado.lpg.ok ? estado.lpg.status : estado.lpg.error.message);
}

main().catch(console.error);
