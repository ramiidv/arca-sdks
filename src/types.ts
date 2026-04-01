// Re-export common types
export type { AccessTicket, ArcaEvent, ServerStatus } from '@ramiidv/arca-common';
import type { ArcaEvent } from '@ramiidv/arca-common';

// ============================================================
// Configuración
// ============================================================

export interface ArcaAgroConfig {
  /** CUIT del contribuyente (sin guiones) */
  cuit: number;
  /** Contenido del certificado X.509 en formato PEM */
  cert: string;
  /** Contenido de la clave privada en formato PEM */
  key: string;
  /** Usar entorno de producción (default: false = testing/homologación) */
  production?: boolean;
  /** Tiempo de vida del token WSAA en minutos (default: 720 = 12 horas) */
  tokenTTLMinutes?: number;
  /** Timeout para requests HTTP en milisegundos (default: 30000) */
  requestTimeoutMs?: number;
  /** Cantidad de reintentos en caso de error transitorio (default: 1) */
  retries?: number;
  /** Delay inicial entre reintentos en milisegundos, se duplica con cada intento (default: 1000) */
  retryDelayMs?: number;
  /** Callback para eventos del SDK (auth, requests, retries). */
  onEvent?: (event: ArcaEvent) => void;
}

// ============================================================
// Auth interna
// ============================================================

export interface AgroAuth {
  Token: string;
  Sign: string;
  Cuit: number;
}

// ============================================================
// Errores de servicio (genérico agro)
// ============================================================

export interface AgroError {
  Code: number | string;
  Msg: string;
}

// ============================================================
// WSCPE - Carta de Porte Electrónica
// ============================================================

export interface CartaPorteAutomotor {
  /** CUIT del titular de la carta de porte */
  cuitTitularCartaPorte: number;
  /** Sucursal */
  sucursal: number;
  /** Número de orden */
  nroOrden: number;
  /** Código de tipo de carta de porte */
  codTipoCartaPorte: number;
  /** CUIT del remitente comercial */
  cuitRemitenteComercial?: number;
  /** Código de grano */
  codGrano: number;
  /** Código de localidad de procedencia */
  codLocalidadProcedencia: number;
  /** Código de provincia de procedencia */
  codProvProcedencia: number;
  /** Código de localidad de destino */
  codLocalidadDestino: number;
  /** Código de provincia de destino */
  codProvDestino: number;
  /** CUIT del destinatario */
  cuitDestino: number;
  /** CUIT del destinatario original (si difiere) */
  cuitDestinoOriginal?: number;
  /** Planta de destino */
  plantaDestino: number;
  /** Peso neto en kg */
  pesoNeto: number;
  /** Peso bruto en kg */
  pesoBruto: number;
  /** Peso tara en kg */
  pesoTara: number;
  /** Patente del vehículo */
  patente: string;
  /** CUIT del transportista */
  cuitTransportista: number;
  /** Kilómetros a recorrer */
  kmRecorrer?: number;
  /** Fecha de emisión (YYYY-MM-DD) */
  fechaEmision: string;
  /** Fecha de inicio del viaje (YYYY-MM-DD) */
  fechaInicioViaje?: string;
  /** Hora de salida (HH:mm) */
  horaSalida?: string;
  /** Turno (mañana/tarde/noche) */
  turno?: string;
  /** Datos adicionales para campos opcionales */
  [key: string]: unknown;
}

export interface CartaPorteResult {
  /** Número de CTG asignado */
  nroCTG?: number;
  /** Número de carta de porte */
  nroCartaPorte?: number;
  /** Número de orden */
  nroOrden?: number;
  /** Fecha de emisión */
  fechaEmision?: string;
  /** Fecha de vencimiento */
  fechaVencimiento?: string;
  /** Estado de la CPE */
  estado?: string;
  /** Errores del servicio */
  errores?: AgroError[];
  /** Eventos informativos */
  eventos?: AgroError[];
  /** Respuesta cruda */
  raw: Record<string, unknown>;
}

export interface ConsultaCPEParams {
  /** Tipo de consulta */
  tipoConsulta?: string;
  /** CUIT del solicitante */
  cuitSolicitante?: number;
  /** Número de CTG */
  nroCTG?: number;
  /** Número de carta de porte */
  nroCartaPorte?: number;
  /** Sucursal */
  sucursal?: number;
  /** Número de orden */
  nroOrden?: number;
  /** Fecha desde (YYYY-MM-DD) */
  fechaDesde?: string;
  /** Fecha hasta (YYYY-MM-DD) */
  fechaHasta?: string;
  /** Código de grano */
  codGrano?: number;
  /** Estado de la CPE */
  estado?: string;
}

export interface ConsultaCPEPorDestinoParams {
  /** CUIT del destino */
  cuitDestino: number;
  /** Fecha desde (YYYY-MM-DD) */
  fechaDesde: string;
  /** Fecha hasta (YYYY-MM-DD) */
  fechaHasta: string;
  /** Código de grano */
  codGrano?: number;
  /** Estado */
  estado?: string;
}

export interface ConfirmadoArriboCPEParams {
  /** Número de CTG */
  nroCTG: number;
  /** Número de carta de porte */
  nroCartaPorte: number;
  /** CUIT del destino */
  cuitDestino: number;
  /** Peso neto confirmado */
  pesoNeto: number;
  /** Fecha de arribo (YYYY-MM-DD) */
  fechaArribo: string;
}

export interface RechazoAnulacionCPEParams {
  /** Número de CTG */
  nroCTG: number;
  /** Número de carta de porte */
  nroCartaPorte: number;
  /** Código del motivo de rechazo/anulación */
  codMotivo: number;
  /** Observaciones */
  observaciones?: string;
}

export interface EditarCPEParams {
  /** Número de CTG */
  nroCTG: number;
  /** Número de carta de porte */
  nroCartaPorte: number;
  /** Campos a editar (Record con los valores nuevos) */
  [key: string]: unknown;
}

export interface ContingenciaCPEParams {
  /** Número de CTG */
  nroCTG: number;
  /** Número de carta de porte */
  nroCartaPorte: number;
  /** Tipo de contingencia */
  tipoContingencia: number;
  /** Observaciones */
  observaciones?: string;
}

// ============================================================
// WSCTG - Código de Trazabilidad de Granos
// ============================================================

export interface SolicitudCTG {
  /** Número de carta de porte */
  nroCartaPorte: number;
  /** Código de especie (grano) */
  codEspecie: number;
  /** CUIT del canjeador */
  cuitCanjeador?: number;
  /** CUIT del destino */
  cuitDestino: number;
  /** CUIT del destinatario */
  cuitDestinatario: number;
  /** Código de localidad de origen */
  codLocalidadOrigen: number;
  /** Código de localidad de destino */
  codLocalidadDestino: number;
  /** Código de cosecha */
  codCosecha: number;
  /** Peso neto en kg */
  pesoNeto: number;
  /** CUIT del transportista */
  cuitTransportista?: number;
  /** CUIT del corredor vendedor */
  cuitCorredorVendedor?: number;
  /** CUIT del corredor comprador */
  cuitCorredorComprador?: number;
  /** CUIT del remitente comercial venta primaria */
  cuitRemitenteComercialVentaPrimaria?: number;
  /** CUIT del remitente comercial venta secundaria */
  cuitRemitenteComercialVentaSecundaria?: number;
  /** CUIT del remitente comercial venta secundaria 2 */
  cuitRemitenteComercialVentaSecundaria2?: number;
  /** CUIT del mercado a término */
  cuitMercadoATermino?: number;
  /** Número de contrato */
  nroContrato?: number;
  /** Patente del vehículo */
  patente?: string;
  /** Kilómetros a recorrer */
  kmRecorrer?: number;
  /** Código de ruta */
  codigoRuta?: number;
  /** Turno */
  turno?: string;
  /** Fecha de emisión (YYYY-MM-DD) */
  fechaEmision?: string;
  /** Hora de salida (HH:mm) */
  horaSalida?: string;
}

export interface CTGResult {
  /** Número de CTG asignado */
  nroCTG?: number;
  /** Fecha de emisión */
  fechaEmision?: string;
  /** Fecha de vencimiento */
  vigenciaDesde?: string;
  /** Fecha de vencimiento */
  vigenciaHasta?: string;
  /** Tarifa de referencia */
  tarifaReferencia?: number;
  /** Estado del CTG */
  estado?: string;
  /** Número de carta de porte */
  nroCartaPorte?: number;
  /** Errores del servicio */
  errores?: AgroError[];
  /** Eventos */
  eventos?: AgroError[];
  /** Respuesta cruda */
  raw: Record<string, unknown>;
}

export interface ConsultaCTGParams {
  /** Número de CTG */
  nroCTG?: number;
  /** Número de carta de porte */
  nroCartaPorte?: number;
  /** Patente del vehículo */
  patente?: string;
  /** CUIT del solicitante */
  cuitSolicitante?: number;
  /** Fecha desde (YYYY-MM-DD) */
  fechaDesde?: string;
  /** Fecha hasta (YYYY-MM-DD) */
  fechaHasta?: string;
  /** Código de especie */
  codEspecie?: number;
  /** Estado del CTG */
  estado?: string;
}

export interface ConfirmarArriboCTGParams {
  /** Número de CTG */
  nroCTG: number;
  /** Número de carta de porte */
  nroCartaPorte: number;
  /** CUIT del destino */
  cuitDestino: number;
  /** Peso neto confirmado */
  pesoNeto: number;
  /** Fecha de arribo (YYYY-MM-DD) */
  fechaArribo: string;
  /** Código de cosecha */
  codCosecha?: number;
}

export interface RechazoCTGParams {
  /** Número de CTG */
  nroCTG: number;
  /** Número de carta de porte */
  nroCartaPorte: number;
  /** Código del motivo de rechazo */
  codMotivo: number;
  /** Observaciones */
  observaciones?: string;
}

export interface AnulacionCTGParams {
  /** Número de CTG */
  nroCTG: number;
  /** Número de carta de porte */
  nroCartaPorte: number;
  /** Código del motivo de anulación */
  codMotivo: number;
  /** Observaciones */
  observaciones?: string;
}

export interface CTGActivosResult {
  /** Lista de CTGs activos */
  ctgs: Record<string, unknown>[];
  /** Errores */
  errores?: AgroError[];
  /** Respuesta cruda */
  raw: Record<string, unknown>;
}

// ============================================================
// WSLPG - Liquidación Primaria de Granos
// ============================================================

export interface Liquidacion {
  /** Número de orden */
  nroOrden?: number;
  /** CUIT del comprador */
  cuitComprador: number;
  /** CUIT del vendedor */
  cuitVendedor: number;
  /** CUIT del corredor vendedor */
  cuitCorredorVendedor?: number;
  /** CUIT del corredor comprador */
  cuitCorredorComprador?: number;
  /** Código de grano */
  codGrano: number;
  /** Código de puerto */
  codPuerto?: number;
  /** Número de contrato */
  nroContrato?: number;
  /** Peso neto en kg */
  pesoNeto: number;
  /** Precio por tonelada referencia */
  precioRefTn?: number;
  /** Precio flete por tonelada */
  precioFleteTn?: number;
  /** Código de grado */
  codGrado?: string;
  /** Valor grado */
  valorGrado?: number;
  /** Factor */
  factor?: number;
  /** Porcentaje de comisión gastos administrativos */
  porcComisionGastosAdm?: number;
  /** Precio base por tonelada */
  precioBaseTn?: number;
  /** Fecha de precio operación */
  fechaPrecioOperacion?: string;
  /** Número de carta de porte */
  nroCartaPorte?: number;
  /** Número de CTG */
  nroCTG?: number;
  /** Fecha de emisión (YYYY-MM-DD) */
  fechaEmision?: string;
  /** Código de tipo de operación */
  codTipoOperacion?: number;
  /** Punto de emision */
  ptoEmision?: number;
  /** Total peso neto merma volatil */
  totalPesoNetoMermaVolatil?: number;
  /** Total deducciones por kg */
  totalDeduccionesKg?: number;
  /** Datos adicionales para campos opcionales */
  [key: string]: unknown;
}

export interface LiquidacionResult {
  /** Código de operación */
  codOperacion?: number;
  /** Número de orden */
  nroOrden?: number;
  /** Fecha de liquidación */
  fechaLiquidacion?: string;
  /** Total a pagar */
  totalPagar?: number;
  /** Total deducciones */
  totalDeducciones?: number;
  /** Total peso neto */
  totalPesoNeto?: number;
  /** Número de contrato */
  nroContrato?: number;
  /** Resultado (A=Aprobada, R=Rechazada) */
  resultado?: string;
  /** Errores del servicio */
  errores?: AgroError[];
  /** Eventos */
  eventos?: AgroError[];
  /** Respuesta cruda */
  raw: Record<string, unknown>;
}

export interface ConsultaLiquidacionParams {
  /** Punto de emisión */
  ptoEmision?: number;
  /** Número de orden */
  nroOrden?: number;
  /** Código de tipo de operación */
  codTipoOperacion?: number;
  /** Número de contrato */
  nroContrato?: number;
  /** Fecha desde (YYYY-MM-DD) */
  fechaDesde?: string;
  /** Fecha hasta (YYYY-MM-DD) */
  fechaHasta?: string;
}

export interface AjusteUnificadoParams {
  /** Número de orden de la liquidación original */
  nroOrdenOriginal: number;
  /** Punto de emisión original */
  ptoEmisionOriginal: number;
  /** Tipo de ajuste */
  tipoAjuste: string;
  /** Datos de la liquidación de ajuste */
  liquidacion: Partial<Liquidacion>;
  /** Observaciones */
  observaciones?: string;
}

export interface Certificacion {
  /** Tipo de certificación */
  tipoCertificacion: number;
  /** Número de certificación */
  nroCertificacion?: number;
  /** CUIT de la certificadora */
  cuitCertificadora?: number;
  /** CUIT del depositante */
  cuitDepositante: number;
  /** Código de grano */
  codGrano: number;
  /** Campaña */
  campania?: number;
  /** Fecha de cierre (YYYY-MM-DD) */
  fechaCierre?: string;
  /** Peso neto en kg */
  pesoNeto: number;
  /** Código de localidad */
  codLocalidad?: number;
  /** Código de provincia */
  codProvincia?: number;
  /** Datos adicionales */
  [key: string]: unknown;
}

export interface CertificacionResult {
  /** Número de certificación */
  nroCertificacion?: number;
  /** Código de operación */
  codOperacion?: number;
  /** Fecha de certificación */
  fechaCertificacion?: string;
  /** Resultado (A=Aprobada, R=Rechazada) */
  resultado?: string;
  /** Errores */
  errores?: AgroError[];
  /** Eventos */
  eventos?: AgroError[];
  /** Respuesta cruda */
  raw: Record<string, unknown>;
}

export interface LpgParameterQueryParams {
  /** Código de grano (para consultas relacionadas) */
  codGrano?: number;
  /** Campaña */
  campania?: number;
  /** Fecha vigencia (YYYY-MM-DD) */
  fechaVigencia?: string;
}
