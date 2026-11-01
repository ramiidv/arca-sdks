import { describe, expect, it } from 'vitest';
import {
  ArcaSireServiceError,
  ArcaSoapError,
  ArcaServiceError,
  ArcaValidationError,
  Condicion,
  ENDPOINTS,
  MotivoAnulacion,
  TipoComprobante,
} from '../src/index.js';
import type { EmitirCertificadoParams } from '../src/index.js';
import { CUIT_AGENTE, HEADER_INFO, NS, envelope, fault, makeSire, mockFetch, sentBody } from './helpers.js';

/** `xs:sequence` de `tns:certificado` en C2005_schema.xsd. */
const XSD_CERTIFICADO = [
  'version', 'codigoTrazabilidad', 'impuesto', 'regimen', 'fechaRetencion', 'condicion',
  'imposibilidadRetencion', 'motivoNoRetencion', 'importeRetencion', 'importeBaseCalculo',
  'regimenExclusion', 'porcentajeExclusion', 'fechaPublicacion', 'tipoComprobante', 'fechaComprobante',
  'numeroComprobante', 'coe', 'coeOriginal', 'cae', 'importeComprobante', 'motivoEmisionNotaCredito',
  'cuitRetenido', 'numeroCertificadoOriginal', 'fechaRetencionCertificadoOriginal',
  'importeCertificadoOriginal', 'motivoAnulacion',
];
/** Obligatorios (sin `minOccurs="0"`) de `tns:certificado`. */
const XSD_CERTIFICADO_REQUIRED = [
  'version', 'impuesto', 'regimen', 'fechaRetencion', 'imposibilidadRetencion', 'importeRetencion',
  'importeBaseCalculo', 'regimenExclusion', 'tipoComprobante', 'fechaComprobante', 'importeComprobante',
  'cuitRetenido',
];
const XSD_ANULACION = ['version', 'codigoTrazabilidad', 'impuesto', 'numeroCertificado', 'motivoAnulacion'];

/** Es subsecuencia ordenada del XSD. */
function inXsdOrder(keys: string[], order: string[]): boolean {
  let i = 0;
  for (const k of keys) {
    i = order.indexOf(k, i);
    if (i < 0) return false;
    i++;
  }
  return true;
}

const FACTURA: EmitirCertificadoParams = {
  regimen: 831,
  condicion: Condicion.INSCRIPTO,
  fechaRetencion: '2026-10-30T11:16:00',
  imposibilidadRetencion: false,
  importeRetencion: 2100,
  importeBaseCalculo: 20000,
  regimenExclusion: false,
  tipoComprobante: TipoComprobante.FACTURA,
  fechaComprobante: '2026-10-30',
  numeroComprobante: '00003-00008497',
  importeComprobante: 24200.456,
  cuitRetenido: '30-50001091-2',
};

const EMITIR_OK = envelope(
  '<tns:emitirResponse><certificadoNro>00000000000000000012345</certificadoNro>' +
    '<codigoSeguridad>9876</codigoSeguridad></tns:emitirResponse>',
  HEADER_INFO,
);

describe('emitirCertificado', () => {
  it('envía el request según el XSD (wrapper, namespace, SOAPAction, auth, orden y formatos)', async () => {
    const m = mockFetch({ body: EMITIR_OK });
    const sire = makeSire(m.fetch);
    await sire.emitirCertificado({ ...FACTURA, codigoTrazabilidad: 'OP-1' });

    expect(m.calls).toHaveLength(1);
    const { url, body, headers } = m.calls[0];
    expect(url).toBe(ENDPOINTS.sire.testing);
    expect(headers.SOAPAction).toBe('""');

    const sent = sentBody(body);
    const emitir = sent['ser:emitir'] as Record<string, unknown>;
    expect(emitir['@_xmlns:ser']).toBe(NS);
    expect(Object.keys(emitir).filter((k) => !k.startsWith('@_'))).toEqual(['token', 'sign', 'cuitAgente', 'certificado']);
    expect(emitir.token).toBe('TOKEN');
    expect(emitir.sign).toBe('SIGN');
    expect(body).toContain(`<cuitAgente>${CUIT_AGENTE}</cuitAgente>`);

    const cert = emitir.certificado as Record<string, unknown>;
    const keys = Object.keys(cert);
    expect(inXsdOrder(keys, XSD_CERTIFICADO)).toBe(true);
    for (const f of XSD_CERTIFICADO_REQUIRED) expect(keys).toContain(f);
    expect(keys).not.toContain('motivoAnulacion');
    // Elementos hijos sin namespace (elementFormDefault="unqualified")
    expect(body).not.toMatch(/<ser:(token|certificado|version)/);

    expect(body).toContain('<version>100</version>');
    expect(body).toContain('<codigoTrazabilidad>OP-1</codigoTrazabilidad>');
    expect(body).toContain('<impuesto>216</impuesto>');
    expect(body).toContain('<regimen>831</regimen>');
    expect(body).toContain('<fechaRetencion>2026-10-30T11:16:00.000-03:00</fechaRetencion>');
    expect(body).toContain('<condicion>1</condicion>');
    expect(body).toContain('<imposibilidadRetencion>false</imposibilidadRetencion>');
    expect(body).toContain('<importeRetencion>2100.00</importeRetencion>');
    expect(body).toContain('<importeBaseCalculo>20000.00</importeBaseCalculo>');
    expect(body).toContain('<regimenExclusion>false</regimenExclusion>');
    expect(body).toContain('<tipoComprobante>1</tipoComprobante>');
    expect(body).toContain('<fechaComprobante>2026-10-30T00:00:00.000-03:00</fechaComprobante>');
    expect(body).toContain('<numeroComprobante>00003-00008497</numeroComprobante>');
    expect(body).toContain('<importeComprobante>24200.46</importeComprobante>');
    expect(body).toContain('<cuitRetenido>30500010912</cuitRetenido>');
    // Opcionales ausentes no se envían (manual 5.1 (5))
    expect(body).not.toContain('porcentajeExclusion');
    expect(body).not.toContain('<coe');
  });

  it('nota de crédito: envía los datos del certificado original en orden', async () => {
    const m = mockFetch({ body: EMITIR_OK });
    const sire = makeSire(m.fetch);
    await sire.emitirCertificado({
      ...FACTURA,
      tipoComprobante: TipoComprobante.NOTA_CREDITO,
      motivoEmisionNotaCredito: 'Devolución',
      numeroCertificadoOriginal: '0000000000012345',
      fechaRetencionCertificadoOriginal: new Date('2026-10-01T15:00:00Z'),
      importeCertificadoOriginal: 100.5,
      regimenExclusion: true,
      porcentajeExclusion: 50,
      fechaPublicacion: '20260101',
    });
    const cert = (sentBody(m.calls[0].body)['ser:emitir'] as Record<string, Record<string, unknown>>).certificado;
    expect(inXsdOrder(Object.keys(cert), XSD_CERTIFICADO)).toBe(true);
    const body = m.calls[0].body;
    expect(body).toContain('<regimenExclusion>true</regimenExclusion>');
    expect(body).toContain('<porcentajeExclusion>50.00</porcentajeExclusion>');
    expect(body).toContain('<fechaPublicacion>2026-01-01T00:00:00.000-03:00</fechaPublicacion>');
    expect(body).toContain('<fechaRetencionCertificadoOriginal>2026-10-01T12:00:00.000-03:00</fechaRetencionCertificadoOriginal>');
    expect(body).toContain('<importeCertificadoOriginal>100.50</importeCertificadoOriginal>');
    expect(body).toContain('<numeroCertificadoOriginal>0000000000012345</numeroCertificadoOriginal>');
  });

  it('parsea emitirResponse como strings (sin perder ceros)', async () => {
    const sire = makeSire(mockFetch({ body: EMITIR_OK }).fetch);
    await expect(sire.emitirCertificado(FACTURA)).resolves.toEqual({
      certificadoNro: '00000000000000000012345',
      codigoSeguridad: '9876',
    });
  });

  it('respuesta sin codigoSeguridad: error incierto', async () => {
    const body = envelope('<tns:emitirResponse><certificadoNro>1</certificadoNro></tns:emitirResponse>');
    const sire = makeSire(mockFetch({ body }).fetch);
    const err = await sire.emitirCertificado(FACTURA).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaSoapError);
    expect(err.uncertain).toBe(true);
    expect(err.message).toContain('codigoSeguridad');
  });

  it('Fault soapenv:Client → ArcaSireServiceError (rechazo determinístico)', async () => {
    const m = mockFetch({ status: 500, body: fault('soapenv:Client', 'No existe persona con id 30500010912.') });
    const sire = makeSire(m.fetch);
    const err = await sire.emitirCertificado(FACTURA).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaSireServiceError);
    expect(err).toBeInstanceOf(ArcaServiceError);
    expect(err.message).toBe('SIRE emitir: No existe persona con id 30500010912.');
    expect(err.errors).toEqual([{ code: 0, msg: 'No existe persona con id 30500010912.' }]);
    expect(err.faultCode).toBe('soapenv:Client');
    expect(err.cause).toBeInstanceOf(ArcaSoapError);
    expect(m.calls).toHaveLength(1);
  });

  it('Fault soapenv:Server de schema (real de homologación) → ArcaSireServiceError con entidades decodificadas', async () => {
    const msg =
      'XML invalido, no cumple el schema: cvc-datatype-valid.1.2.1: &amp;apos;abc&amp;apos; is not a valid value for &amp;apos;integer&amp;apos;.';
    const sire = makeSire(mockFetch({ status: 500, body: fault('soapenv:Server', msg) }).fetch);
    const err = await sire.emitirCertificado(FACTURA).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaSireServiceError);
    expect(err.errors[0].msg).toBe(
      "XML invalido, no cumple el schema: cvc-datatype-valid.1.2.1: 'abc' is not a valid value for 'integer'.",
    );
  });

  it('Fault MISSING_AUTHENTICATION_TOKEN → ArcaSireServiceError', async () => {
    const sire = makeSire(mockFetch({ status: 500, body: fault('soapenv:Server', 'MISSING_AUTHENTICATION_TOKEN') }).fetch);
    await expect(sire.emitirCertificado(FACTURA)).rejects.toBeInstanceOf(ArcaSireServiceError);
  });

  it('Fault soapenv:Server de sistema → ArcaSoapError incierto, sin reintento', async () => {
    const m = mockFetch({ status: 500, body: fault('soapenv:Server', 'Error de conexión a la base de datos') });
    const sire = makeSire(m.fetch, { retries: 3 });
    const err = await sire.emitirCertificado(FACTURA).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaSoapError);
    expect(err).not.toBeInstanceOf(ArcaSireServiceError);
    expect(err.uncertain).toBe(true);
    expect(err.faultString).toBe('Error de conexión a la base de datos');
    expect(m.calls).toHaveLength(1);
  });

  it('HTTP 503: un solo fetch y uncertain', async () => {
    const m = mockFetch({ status: 503, body: '<html>Service Unavailable</html>' });
    const sire = makeSire(m.fetch, { retries: 3 });
    const err = await sire.emitirCertificado(FACTURA).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaSoapError);
    expect(err.uncertain).toBe(true);
    expect(m.calls).toHaveLength(1);
  });

  it('timeout: un solo fetch y uncertain', async () => {
    const hang = () => new Promise<Response>(() => {});
    const m = mockFetch(hang);
    const realFetch: typeof fetch = (url, init) =>
      new Promise((resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        void m.fetch(url, init).then(resolve, reject);
      });
    const sire = makeSire(realFetch, { timeout: 20, retries: 3 });
    const err = await sire.emitirCertificado(FACTURA).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaSoapError);
    expect(err.uncertain).toBe(true);
    expect(m.calls).toHaveLength(1);
  });

  it('valida antes de autenticar: CUIT retenido inválido', async () => {
    const m = mockFetch({ body: EMITIR_OK });
    const sire = makeSire(m.fetch);
    const err = await sire.emitirCertificado({ ...FACTURA, cuitRetenido: '30500010913' }).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaValidationError);
    expect(err.details[0].field).toBe('cuitRetenido');
    expect(sire.wsaa.getAccessTicket).not.toHaveBeenCalled();
    expect(m.calls).toHaveLength(0);
  });
});

describe('anularCertificado', () => {
  const ANULAR_OK = envelope(
    '<tns:anularResponse><certificadoNro>0000000000012346</certificadoNro><codigoSeguridad>ab12</codigoSeguridad></tns:anularResponse>',
    HEADER_INFO,
  );

  it('envía certificadoAnulacion en el orden del XSD y parsea la respuesta', async () => {
    const m = mockFetch({ body: ANULAR_OK });
    const sire = makeSire(m.fetch);
    const res = await sire.anularCertificado({
      numeroCertificado: '0000000000012345',
      motivoAnulacion: MotivoAnulacion.OTROS,
      codigoTrazabilidad: 'ANUL-1',
    });
    expect(res).toEqual({ certificadoNro: '0000000000012346', codigoSeguridad: 'ab12' });

    const anular = sentBody(m.calls[0].body)['ser:anular'] as Record<string, unknown>;
    expect(anular['@_xmlns:ser']).toBe(NS);
    expect(Object.keys(anular).filter((k) => !k.startsWith('@_'))).toEqual([
      'token', 'sign', 'cuitAgente', 'certificadoAnulacion',
    ]);
    expect(Object.keys(anular.certificadoAnulacion as object)).toEqual(XSD_ANULACION);
    const body = m.calls[0].body;
    expect(body).toContain('<numeroCertificado>0000000000012345</numeroCertificado>');
    expect(body).toContain('<motivoAnulacion>4</motivoAnulacion>');
  });

  it('sin codigoTrazabilidad lo omite', async () => {
    const m = mockFetch({ body: ANULAR_OK });
    await makeSire(m.fetch).anularCertificado({ numeroCertificado: '1', motivoAnulacion: 1 });
    const anular = sentBody(m.calls[0].body)['ser:anular'] as Record<string, unknown>;
    expect(Object.keys(anular.certificadoAnulacion as object)).toEqual(['version', 'impuesto', 'numeroCertificado', 'motivoAnulacion']);
  });

  it('Fault de negocio → ArcaSireServiceError; 503 → incierto sin reintento', async () => {
    const sire1 = makeSire(mockFetch({ status: 500, body: fault('soapenv:Client', 'Certificado inexistente') }).fetch);
    await expect(sire1.anularCertificado({ numeroCertificado: '1', motivoAnulacion: 4 })).rejects.toBeInstanceOf(
      ArcaSireServiceError,
    );

    const m = mockFetch({ status: 503, body: '' });
    const err = await makeSire(m.fetch, { retries: 2 })
      .anularCertificado({ numeroCertificado: '1', motivoAnulacion: 4 })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ArcaSoapError);
    expect(err.uncertain).toBe(true);
    expect(m.calls).toHaveLength(1);
  });

  it('valida motivoAnulacion y numeroCertificado', async () => {
    const sire = makeSire(mockFetch({ body: ANULAR_OK }).fetch);
    const err = await sire.anularCertificado({ numeroCertificado: '', motivoAnulacion: 9 }).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaValidationError);
    expect(err.details.map((d: { field: string }) => d.field).sort()).toEqual(['motivoAnulacion', 'numeroCertificado']);
  });
});

describe('status (dummy)', () => {
  it('parsea dummyResponse real de homologación sin autenticar', async () => {
    const body = envelope(
      '<tns:dummyResponse><appserver>OK</appserver><authserver>OK</authserver><dbserver>OK</dbserver></tns:dummyResponse>',
      HEADER_INFO,
    );
    const m = mockFetch({ body });
    const sire = makeSire(m.fetch);
    await expect(sire.status()).resolves.toEqual({ appserver: 'OK', dbserver: 'OK', authserver: 'OK' });
    expect(sire.wsaa.getAccessTicket).not.toHaveBeenCalled();
    expect(sentBody(m.calls[0].body)['ser:dummy']).toBeDefined();
  });

  it('dummyResponse incompleto lanza', async () => {
    const body = envelope('<tns:dummyResponse><appserver>OK</appserver></tns:dummyResponse>');
    await expect(makeSire(mockFetch({ body }).fetch).status()).rejects.toThrow(/dbserver/);
  });

  it('es una consulta: reintenta un 503', async () => {
    const ok = envelope(
      '<tns:dummyResponse><appserver>OK</appserver><authserver>OK</authserver><dbserver>OK</dbserver></tns:dummyResponse>',
    );
    const m = mockFetch({ status: 503, body: '' }, { body: ok });
    await expect(makeSire(m.fetch, { retries: 1 }).status()).resolves.toMatchObject({ appserver: 'OK' });
    expect(m.calls).toHaveLength(2);
  });
});

describe('config', () => {
  it('usa el endpoint de producción y permite sobrescribirlo', async () => {
    const ok = envelope(
      '<tns:dummyResponse><appserver>OK</appserver><authserver>OK</authserver><dbserver>OK</dbserver></tns:dummyResponse>',
    );
    const m1 = mockFetch({ body: ok });
    await makeSire(m1.fetch, { production: true }).status();
    expect(m1.calls[0].url).toBe('https://ws-aplicativos-reca.afip.gob.ar/sire/ws/v1/c2005/2005');

    const m2 = mockFetch({ body: ok });
    await makeSire(m2.fetch, { endpoints: { sire: 'https://proxy.local/sire' } }).status();
    expect(m2.calls[0].url).toBe('https://proxy.local/sire');
  });

  it('rechaza un CUIT de agente inválido', () => {
    expect(() => makeSire(mockFetch({ body: '' }).fetch, { cuit: '20267565390' })).toThrow(ArcaValidationError);
  });
});
