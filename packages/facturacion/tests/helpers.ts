import { afterEach, vi } from 'vitest';
import { parseXml } from '@ramiidv/arca-common';
import {
  fakeTicketStorage,
  mockFetchByMethod,
  soapResponse as soapResponseXml,
  xmlResponse,
  testCert,
} from '@ramiidv/arca-common/testing';
import type { MockReply } from '@ramiidv/arca-common/testing';
import { ArcaFacturacion } from '../src/arca.js';
import { ENDPOINTS, WSFE_NAMESPACE, WSFEX_NAMESPACE } from '../src/constants.js';
import type { ArcaConfig } from '../src/types.js';

export { networkError } from '@ramiidv/arca-common/testing';

export const CUIT_EMISOR = 20123456786;

type Handler = Response | Error | ((body: string) => Response | Promise<Response>);

export interface LlamadaMock {
  /** Método SOAP (del SOAPAction), o "" si no hay SOAPAction (Padrón). */
  method: string;
  url: string;
  soapAction: string;
  body: string;
  /** Hijos del elemento del método, parseados (en orden de documento). */
  params: Record<string, any>;
}

/** Servicio esperado según el nombre del método. */
function servicioDe(method: string): { endpoint: string; ns: string } | undefined {
  if (method.startsWith('FEX')) return { endpoint: ENDPOINTS.wsfex.testing, ns: WSFEX_NAMESPACE };
  if (method.startsWith('FE')) return { endpoint: ENDPOINTS.wsfe.testing, ns: WSFE_NAMESPACE };
  return undefined;
}

/** Métodos de Padrón: se registran en el mock con la clave "" (no tienen SOAPAction). */
const METODOS_PADRON = ['getPersona', 'getPersona_v2'];

/** Violaciones del contrato (endpoint, namespace, wrapper, SOAPAction) detectadas por el mock. */
const violaciones: string[] = [];

// Un error lanzado dentro de fetch lo convierte el SDK en error de red; por eso
// las violaciones se acumulan y hacen fallar el test al terminar.
afterEach(() => {
  const v = violaciones.splice(0);
  if (v.length > 0) throw new Error(`Requests inválidos:\n${v.join('\n')}`);
});

function bodyElement(body: string): { name: string; el: Record<string, any> } | undefined {
  const parsed = parseXml(body) as Record<string, any>;
  const env = parsed['soapenv:Envelope'];
  const b = env?.['soapenv:Body'];
  if (!b || typeof b !== 'object') return undefined;
  const name = Object.keys(b)[0];
  return { name, el: (b[name] ?? {}) as Record<string, any> };
}

/**
 * Mock de fetch (sobre `mockFetchByMethod` de arca-common). Despacha por método
 * ("" para Padrón) y verifica que cada request de WSFEv1/WSFEX vaya al endpoint
 * de homologación del servicio, con SOAPAction `"namespace + método"` y el
 * elemento del método con el namespace por defecto del servicio.
 * Cada método tiene una cola de respuestas; la última se repite.
 *
 * Con `{ global: false }` no reemplaza `globalThis.fetch` (para pasarlo en la config).
 */
export function mockArcaFetch(handlers: Record<string, Handler | Handler[]>, opts: { global?: boolean } = {}) {
  const replies: Record<string, MockReply[]> = {};
  for (const [method, value] of Object.entries(handlers)) {
    const queue = (Array.isArray(value) ? value : [value]).map(
      (h): MockReply => (typeof h === 'function' ? (req) => h(req.body) : h),
    );
    for (const m of method === '' ? METODOS_PADRON : [method]) replies[m] = [...queue];
  }
  const inner = mockFetchByMethod(replies);
  const calls: LlamadaMock[] = [];

  const fn = vi.fn((url: string, init: RequestInit) => {
    const response = inner(url, init);
    // mockFetchByMethod graba el request antes de su primer await.
    const req = inner.calls[inner.calls.length - 1];
    const method = req.soapAction.split('/').pop() ?? '';
    const el = bodyElement(req.body);
    const params: Record<string, any> = {};
    for (const [k, v] of Object.entries(el?.el ?? {})) if (!k.startsWith('@_')) params[k] = v;
    calls.push({ method, url, soapAction: req.soapAction, body: req.body, params });

    const svc = servicioDe(method);
    if (svc) {
      if (url !== svc.endpoint) violaciones.push(`${method}: endpoint ${url} (esperado ${svc.endpoint})`);
      if (req.soapAction !== `${svc.ns}${method}`) violaciones.push(`${method}: SOAPAction "${req.soapAction}"`);
      if (el?.name !== method) violaciones.push(`${method}: wrapper <${el?.name}>`);
      if (el?.el?.['@_xmlns'] !== svc.ns)
        violaciones.push(`${method}: xmlns ${el?.el?.['@_xmlns']} (esperado ${svc.ns})`);
    } else if (method === '' && !/sr-padron/.test(url)) {
      violaciones.push(`request sin SOAPAction a ${url}`);
    }
    return response;
  });
  if (opts.global !== false) vi.stubGlobal('fetch', fn);
  return {
    fn,
    calls,
    count: (method: string) => calls.filter((c) => c.method === method).length,
    /** Última llamada al método. */
    last: (method: string) => [...calls].reverse().find((c) => c.method === method)!,
  };
}

/** Respuesta ASMX: `<{method}Response xmlns="{ns}"><{method}Result>{inner}</...></...>`. */
function soapResponse(method: string, ns: string, inner: string, status = 200): Response {
  return xmlResponse(soapResponseXml(`${method}Response`, `<${method}Result>${inner}</${method}Result>`, ns), status);
}

export function wsfeResponse(method: string, inner: string, status = 200): Response {
  return soapResponse(method, WSFE_NAMESPACE, inner, status);
}

export function wsfexResponse(method: string, inner: string, status = 200): Response {
  return soapResponse(method, WSFEX_NAMESPACE, inner, status);
}

export function ultimoAutorizado(ptoVta: number, cbteTipo: number, cbteNro: number): Response {
  return wsfeResponse(
    'FECompUltimoAutorizado',
    `<PtoVta>${ptoVta}</PtoVta><CbteTipo>${cbteTipo}</CbteTipo><CbteNro>${cbteNro}</CbteNro>`,
  );
}

export function caeAprobado(o: {
  ptoVta: number;
  cbteTipo: number;
  cbteNro: number;
  docTipo?: number;
  docNro?: number | string;
  fecha?: string;
  cae?: string;
  events?: string;
}): Response {
  return wsfeResponse(
    'FECAESolicitar',
    `<FeCabResp><Cuit>${CUIT_EMISOR}</Cuit><PtoVta>${o.ptoVta}</PtoVta><CbteTipo>${o.cbteTipo}</CbteTipo>` +
      '<FchProceso>20261030120000</FchProceso><CantReg>1</CantReg><Resultado>A</Resultado><Reproceso>N</Reproceso></FeCabResp>' +
      '<FeDetResp><FECAEDetResponse>' +
      `<Concepto>1</Concepto><DocTipo>${o.docTipo ?? 99}</DocTipo><DocNro>${o.docNro ?? 0}</DocNro>` +
      `<CbteDesde>${o.cbteNro}</CbteDesde><CbteHasta>${o.cbteNro}</CbteHasta><CbteFch>${o.fecha ?? '20261030'}</CbteFch>` +
      `<Resultado>A</Resultado><CAE>${o.cae ?? '76123456789012'}</CAE><CAEFchVto>20261109</CAEFchVto>` +
      '</FECAEDetResponse></FeDetResp>' +
      (o.events ?? ''),
  );
}

export function wsfeErrores(method: string, errors: { code: number; msg: string }[]): Response {
  return wsfeResponse(
    method,
    `<Errors>${errors.map((e) => `<Err><Code>${e.code}</Code><Msg>${e.msg}</Msg></Err>`).join('')}</Errors>`,
  );
}

export function comprobanteConsultado(o: {
  ptoVta: number;
  cbteTipo: number;
  cbteNro: number;
  docTipo: number;
  docNro: number | string;
  fecha: string;
  total: number;
  neto: number;
  iva: number;
  cae?: string;
  /** Default: `A`. */
  resultado?: string;
}): Response {
  return wsfeResponse(
    'FECompConsultar',
    '<ResultGet>' +
      `<Concepto>1</Concepto><DocTipo>${o.docTipo}</DocTipo><DocNro>${o.docNro}</DocNro>` +
      `<CbteDesde>${o.cbteNro}</CbteDesde><CbteHasta>${o.cbteNro}</CbteHasta><CbteFch>${o.fecha}</CbteFch>` +
      `<ImpTotal>${o.total}</ImpTotal><ImpTotConc>0</ImpTotConc><ImpNeto>${o.neto}</ImpNeto><ImpOpEx>0</ImpOpEx>` +
      `<ImpTrib>0</ImpTrib><ImpIVA>${o.iva}</ImpIVA><FchServDesde/><FchServHasta/><FchVtoPago/>` +
      '<MonId>PES</MonId><MonCotiz>1</MonCotiz>' +
      `<Iva><AlicIva><Id>5</Id><BaseImp>${o.neto}</BaseImp><Importe>${o.iva}</Importe></AlicIva></Iva>` +
      `<Resultado>${o.resultado ?? 'A'}</Resultado><CodAutorizacion>${o.cae ?? '76123456789012'}</CodAutorizacion>` +
      '<EmisionTipo>CAE</EmisionTipo><FchVto>20261109</FchVto><FchProceso>20261030120000</FchProceso>' +
      `<PtoVta>${o.ptoVta}</PtoVta><CbteTipo>${o.cbteTipo}</CbteTipo>` +
      '</ResultGet>',
  );
}

/** ArcaFacturacion con un ticket vigente en el storage (los tests no pasan por WSAA). */
export async function arcaDePrueba(extra: Partial<ArcaConfig> = {}): Promise<ArcaFacturacion> {
  return new ArcaFacturacion({
    cuit: CUIT_EMISOR,
    ...testCert(),
    ticketStorage: fakeTicketStorage(),
    retries: 3,
    retryDelayMs: 1,
    ...extra,
  });
}

/** Timeout simulado: la respuesta nunca llega antes del `timeout` del SDK. */
export function colgado(ms = 60): () => Promise<Response> {
  return () =>
    new Promise<Response>((_, reject) => setTimeout(() => reject(new DOMException('aborted', 'AbortError')), ms));
}

/** Claves de un objeto parseado en orden de documento (sin atributos). */
export function orden(obj: Record<string, unknown>): string[] {
  return Object.keys(obj).filter((k) => !k.startsWith('@_'));
}
