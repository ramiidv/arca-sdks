/**
 * Ejemplo: Manejo de fechas en formato ARCA
 *
 * ARCA (ex AFIP) usa el formato YYYYMMDD en la mayoría de sus web services.
 * Estas utilidades facilitan la conversión entre Date de JS y ese formato, siempre
 * en hora de Argentina (America/Argentina/Buenos_Aires).
 */
import { formatDate, formatDateTimeAR, parseArcaDate } from '@ramiidv/arca-common';

// ---------------------------------------------------------------------------
// formatDate — convertir a YYYYMMDD
// ---------------------------------------------------------------------------

// Desde Date: fecha calendario en Argentina (America/Argentina/Buenos_Aires)
const hoy = formatDate(new Date());
console.log('Hoy:', hoy); // ej: "20260331"

// Desde YYYY-MM-DD: se formatea literal, sin pasar por Date (sin corrimientos de zona horaria)
const fecha1 = formatDate('2026-03-31');
console.log('Desde ISO:', fecha1); // "20260331"

// YYYYMMDD se devuelve tal cual (después de validar que la fecha exista)
const fecha2 = formatDate('20260331');
console.log('Passthrough:', fecha2); // "20260331"

// Útil para armar requests (campos de FacturarOpts de @ramiidv/arca-facturacion):
const request = {
  cbteFch: formatDate(new Date()), // fecha del comprobante
  fchServDesde: formatDate('2026-03-01'), // inicio del servicio
  fchServHasta: formatDate('2026-03-31'), // fin del servicio
  fchVtoPago: formatDate('2026-04-15'), // vencimiento de pago
  // Ojo: new Date("2026-04-15") es medianoche UTC = 14/04 21:00 en Argentina.
};
console.log('Request:', request);

// Fecha y hora (xsd:dateTime) en hora de Argentina:
console.log('Ahora:', formatDateTimeAR(new Date())); // ej: "2026-03-31T14:05:09-03:00"
console.log('Con ms:', formatDateTimeAR(new Date(), { millis: true })); // ej: "2026-03-31T14:05:09.123-03:00"

// ---------------------------------------------------------------------------
// parseArcaDate — convertir YYYYMMDD a Date
// ---------------------------------------------------------------------------

// Fechas inexistentes o formatos ambiguos lanzan ArcaValidationError:
// formatDate("20230230"), formatDate("2026/03/31"), parseArcaDate("2026-0331")

// Parsear respuestas de ARCA (devuelve el mediodía de Argentina de ese día,
// así formatDate(parseArcaDate(x)) === x en cualquier zona horaria)
const fecha3 = parseArcaDate('20260331');
console.log('Parseado:', fecha3.toISOString()); // "2026-03-31T15:00:00.000Z"
// Para leer año/mes/día usá los helpers de Argentina, no getFullYear()/getDate()
// (que dependen de la zona horaria del proceso):
console.log('Fecha:', formatDate(fecha3)); // "20260331"
console.log('Fecha y hora:', formatDateTimeAR(fecha3)); // "2026-03-31T12:00:00-03:00"

// También acepta YYYY-MM-DD (algunos servicios Java de ARCA usan este formato)
const fecha4 = parseArcaDate('2026-03-31');
console.log('Desde YYYY-MM-DD:', fecha4.toISOString());

// Ejemplo: parsear fecha de vencimiento de CAE
const caeVencimiento = '20260415'; // viene de la respuesta de ARCA
const vtoDate = parseArcaDate(caeVencimiento);
const diasRestantes = Math.ceil((vtoDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
console.log(`CAE vence el ${formatDate(vtoDate)}, quedan ${diasRestantes} días`);
