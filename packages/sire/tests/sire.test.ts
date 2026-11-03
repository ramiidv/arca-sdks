import { describe, expect, it, vi } from 'vitest';
import {
  ArcaAuthError,
  ArcaRechazoError,
  ArcaResponseError,
  ArcaSireServiceError,
  ArcaSoapError,
  ArcaServiceError,
  ArcaValidationError,
  Condicion,
  ENDPOINTS,
  MotivoAnulacion,
  SIRE_NAMESPACE,
  SireClient,
  TipoComprobante,
} from '../src/index.js';
import { ArcaRechazoError as RechazoDeCommon, WSAA_ENDPOINTS } from '@ramiidv/arca-common';
import type { EmitirCertificadoParams } from '../src/index.js';
import { hangingReply, mockFetch, xmlResponse } from '@ramiidv/arca-common/testing';
import { CUIT_AGENTE, HEADER_INFO, NS, envelope, fault, homoFault, makeSire, sentBody } from './helpers.js';

/** `xs:sequence` de `tns:certificado` en C2005_schema.xsd. */
const XSD_CERTIFICADO = [
  'version',
  'codigoTrazabilidad',
  'impuesto',
  'regimen',
  'fechaRetencion',
  'condicion',
  'imposibilidadRetencion',
  'motivoNoRetencion',
  'importeRetencion',
  'importeBaseCalculo',
  'regimenExclusion',
  'porcentajeExclusion',
  'fechaPublicacion',
  'tipoComprobante',
  'fechaComprobante',
  'numeroComprobante',
  'coe',
  'coeOriginal',
  'cae',
  'importeComprobante',
  'motivoEmisionNotaCredito',
  'cuitRetenido',
  'numeroCertificadoOriginal',
  'fechaRetencionCertificadoOriginal',
  'importeCertificadoOriginal',
  'motivoAnulacion',
];
/** Obligatorios (sin `minOccurs="0"`) de `tns:certificado`. */
const XSD_CERTIFICADO_REQUIRED = [
  'version',
  'impuesto',
  'regimen',
  'fechaRetencion',
  'imposibilidadRetencion',
  'importeRetencion',
  'importeBaseCalculo',
  'regimenExclusion',
  'tipoComprobante',
  'fechaComprobante',
  'importeComprobante',
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
    const m = mockFetch(EMITIR_OK);
    const sire = makeSire(m);
    await sire.emitirCertificado({ ...FACTURA, codigoTrazabilidad: 'OP-1' });

    expect(m.calls).toHaveLength(1);
    const { url, body, headers } = m.calls[0];
    expect(url).toBe(ENDPOINTS.sire.testing);
    expect(headers.soapaction).toBe('""');

    const sent = sentBody(body);
    const emitir = sent['ser:emitir'] as Record<string, unknown>;
    expect(emitir['@_xmlns:ser']).toBe(NS);
    expect(Object.keys(emitir).filter((k) => !k.startsWith('@_'))).toEqual([
      'token',
      'sign',
      'cuitAgente',
      'certificado',
    ]);
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
    const m = mockFetch(EMITIR_OK);
    const sire = makeSire(m);
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
    expect(body).toContain(
      '<fechaRetencionCertificadoOriginal>2026-10-01T12:00:00.000-03:00</fechaRetencionCertificadoOriginal>',
    );
    expect(body).toContain('<importeCertificadoOriginal>100.50</importeCertificadoOriginal>');
    expect(body).toContain('<numeroCertificadoOriginal>0000000000012345</numeroCertificadoOriginal>');
  });

  it('parsea emitirResponse como strings (sin perder ceros)', async () => {
    const sire = makeSire(mockFetch(EMITIR_OK));
    await expect(sire.emitirCertificado(FACTURA)).resolves.toEqual({
      certificadoNro: '00000000000000000012345',
      codigoSeguridad: '9876',
    });
  });

  it('preserva xs:string que parecen números en la respuesta', async () => {
    const body = envelope(
      '<tns:emitirResponse><certificadoNro>0012</certificadoNro><codigoSeguridad>1.50</codigoSeguridad></tns:emitirResponse>',
    );
    await expect(makeSire(mockFetch(body)).emitirCertificado(FACTURA)).resolves.toEqual({
      certificadoNro: '0012',
      codigoSeguridad: '1.50',
    });
  });

  it('respuesta con certificadoNro vacío: error incierto', async () => {
    const body = envelope(
      '<tns:emitirResponse><certificadoNro></certificadoNro><codigoSeguridad>1</codigoSeguridad></tns:emitirResponse>',
    );
    const err = await makeSire(mockFetch(body))
      .emitirCertificado(FACTURA)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ArcaResponseError);
    expect(err).not.toBeInstanceOf(ArcaSoapError);
    expect(err.uncertain).toBe(true);
    expect(err.message).toBe('SIRE emitir: Respuesta inválida: emitirResponse.certificadoNro vacío');
  });

  it('respuesta sin codigoSeguridad: error incierto', async () => {
    const body = envelope('<tns:emitirResponse><certificadoNro>1</certificadoNro></tns:emitirResponse>');
    const sire = makeSire(mockFetch(body));
    const err = await sire.emitirCertificado(FACTURA).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaResponseError);
    expect(err.code).toBe('ARCA_RESPONSE_ERROR');
    expect(err.uncertain).toBe(true);
    expect(err.message).toContain('codigoSeguridad');
  });

  it('Fault soapenv:Client → ArcaSireServiceError (rechazo determinístico)', async () => {
    const m = mockFetch(xmlResponse(fault('soapenv:Client', 'No existe persona con id 30500010912.'), 500));
    const sire = makeSire(m);
    const err = await sire.emitirCertificado(FACTURA).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaSireServiceError);
    expect(err).toBeInstanceOf(ArcaRechazoError);
    expect(err).toBeInstanceOf(RechazoDeCommon);
    expect(err).toBeInstanceOf(ArcaServiceError);
    expect(err.code).toBe('ARCA_SIRE_SERVICE_ERROR');
    expect(err.name).toBe('ArcaSireServiceError');
    expect(err.operacion).toBe('emitir');
    expect(err.observaciones).toEqual([]);
    expect(err.message).toBe('SIRE emitir: No existe persona con id 30500010912.');
    expect(err.errors).toEqual([{ code: 0, msg: 'No existe persona con id 30500010912.' }]);
    expect(err.faultCode).toBe('soapenv:Client');
    expect(err.cause).toBeInstanceOf(ArcaSoapError);
    expect(m.calls).toHaveLength(1);
  });

  it('Fault soapenv:Server de schema (real de homologación) → ArcaSireServiceError con entidades decodificadas', async () => {
    const msg =
      // `fault()` escapa el texto: en el XML queda `&amp;apos;`, como lo manda ARCA.
      'XML invalido, no cumple el schema: cvc-datatype-valid.1.2.1: &apos;abc&apos; is not a valid value for &apos;integer&apos;.';
    const sire = makeSire(mockFetch(xmlResponse(fault('soapenv:Server', msg), 500)));
    const err = await sire.emitirCertificado(FACTURA).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaSireServiceError);
    expect(err.errors[0].msg).toBe(
      "XML invalido, no cumple el schema: cvc-datatype-valid.1.2.1: 'abc' is not a valid value for 'integer'.",
    );
  });

  it('Fault de token/sign → ArcaAuthError, sin borrar el ticket cacheado', async () => {
    for (const msg of ['MISSING_AUTHENTICATION_TOKEN', 'INVALID_SIGN']) {
      const sire = makeSire(mockFetch(xmlResponse(fault('soapenv:Server', msg), 500)));
      const clear = vi.spyOn(sire, 'clearAuthCache');
      const err = await sire.emitirCertificado(FACTURA).catch((e) => e);
      expect(err).toBeInstanceOf(ArcaAuthError);
      expect(err).not.toBeInstanceOf(ArcaSireServiceError);
      expect(err.message).toBe(`SIRE emitir: ${msg}`);
      expect(err.faultCode).toBe('soapenv:Server');
      expect(err.cause).toBeInstanceOf(ArcaSoapError);
      expect(clear).not.toHaveBeenCalled();
    }
    const sire = makeSire(mockFetch(xmlResponse(fault('soapenv:Client', 'EXPIRED_TOKEN'), 500)));
    const clear = vi.spyOn(sire, 'clearAuthCache');
    await expect(sire.anularCertificado({ numeroCertificado: '1', motivoAnulacion: 4 })).rejects.toBeInstanceOf(
      ArcaAuthError,
    );
    expect(clear).not.toHaveBeenCalled();
  });

  // Faults reales de homologación (HTTP 500, soapenv:Server): rechazos de
  // autenticación previos a procesar el request. Ninguno es incierto.
  it.each([
    ['MISSING_AUTHENTICATION_TOKEN', 'MISSING_AUTHENTICATION_TOKEN', 'SIRE emitir: MISSING_AUTHENTICATION_TOKEN'],
    ['CANT_PARSE_TOKEN', 'CANT_PARSE_TOKEN', 'SIRE emitir: CANT_PARSE_TOKEN'],
    [
      'CANT_VERIFY_SIGN',
      'No se pudo verificar la firma por error general',
      'SIRE emitir: CANT_VERIFY_SIGN (No se pudo verificar la firma por error general)',
    ],
    [
      'BAD_SERVICE',
      'V2 - El service (wsfecred) no es igual a los nombres de sistema',
      'SIRE emitir: BAD_SERVICE (V2 - El service (wsfecred) no es igual a los nombres de sistema)',
    ],
    [
      'CANT_VERIFY_DATA',
      'No se pudo verificar la firma',
      'SIRE emitir: CANT_VERIFY_DATA (No se pudo verificar la firma)',
    ],
  ])('Fault real %s → ArcaAuthError (no incierto), sin borrar el ticket', async (code, detail, message) => {
    const m = mockFetch(xmlResponse(homoFault('soapenv:Server', code, detail), 500));
    const sire = makeSire(m, { retries: 3 });
    const clear = vi.spyOn(sire, 'clearAuthCache');
    const err = await sire.emitirCertificado(FACTURA).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaAuthError);
    expect(err).not.toBeInstanceOf(ArcaSoapError);
    expect(err).not.toBeInstanceOf(ArcaSireServiceError);
    expect(err.uncertain).not.toBe(true);
    expect(err.message).toBe(message);
    expect(err.faultCode).toBe('soapenv:Server');
    expect(err.cause).toBeInstanceOf(ArcaSoapError);
    expect(clear).not.toHaveBeenCalled();
    expect(m.calls).toHaveLength(1);
  });

  it.each([
    ['No existe persona con id 20123456786.', 'No existe persona con id 20123456786.'],
    [
      'La CUIT del agente de retenci&amp;#243;n 30500010912 debe ser una relaci&amp;#243;n delegada.',
      'La CUIT del agente de retención 30500010912 debe ser una relación delegada.',
    ],
  ])('Fault real de negocio %s → ArcaSireServiceError, no ArcaAuthError', async (raw, msg) => {
    const sire = makeSire(mockFetch(xmlResponse(homoFault('soapenv:Client', raw), 500)));
    const err = await sire.emitirCertificado(FACTURA).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaSireServiceError);
    expect(err).not.toBeInstanceOf(ArcaAuthError);
    expect(err.faultCode).toBe('soapenv:Client');
    expect(err.message).toBe(`SIRE emitir: ${msg}`);
    expect(err.errors).toEqual([{ code: 0, msg }]);
  });

  it('Fault real de schema (namespace arca.gob.ar) → ArcaSireServiceError con &amp;apos; decodificado', async () => {
    const raw =
      'XML invalido, no cumple el schema: cvc-elt.1: Cannot find the declaration of element &amp;apos;ser:emitir&amp;apos;.';
    const sire = makeSire(mockFetch(xmlResponse(homoFault('soapenv:Server', raw), 500)));
    const err = await sire.emitirCertificado(FACTURA).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaSireServiceError);
    expect(err).not.toBeInstanceOf(ArcaAuthError);
    expect(err.errors[0].msg).toBe(
      "XML invalido, no cumple el schema: cvc-elt.1: Cannot find the declaration of element 'ser:emitir'.",
    );
  });

  it('un código en mayúsculas desconocido de soapenv:Server sigue siendo incierto', async () => {
    const sire = makeSire(mockFetch(xmlResponse(homoFault('soapenv:Server', 'INTERNAL_ERROR'), 500)));
    const err = await sire.emitirCertificado(FACTURA).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaSoapError);
    expect(err.uncertain).toBe(true);
  });

  it('un rechazo de negocio no descarta el ticket', async () => {
    const sire = makeSire(mockFetch(xmlResponse(fault('soapenv:Client', 'No existe persona con id 1.'), 500)));
    const clear = vi.spyOn(sire, 'clearAuthCache');
    await expect(sire.emitirCertificado(FACTURA)).rejects.toBeInstanceOf(ArcaSireServiceError);
    expect(clear).not.toHaveBeenCalled();
  });

  it('Fault soapenv:Client sin faultstring → ArcaSireServiceError (no incierto)', async () => {
    const sinFaultstring = envelope(
      '<soapenv:Fault><faultcode>soapenv:Client</faultcode><detail>Régimen inexistente</detail></soapenv:Fault>',
      HEADER_INFO,
    );
    const err = await makeSire(mockFetch(xmlResponse(sinFaultstring, 500)))
      .emitirCertificado(FACTURA)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ArcaSireServiceError);
    expect(err.errors[0].msg).toBe('Régimen inexistente');
    expect((err.cause as ArcaSoapError).uncertain).toBe(false);

    const vacio = envelope('<soapenv:Fault><faultcode>soapenv:Client</faultcode><faultstring/></soapenv:Fault>');
    const err2 = await makeSire(mockFetch(xmlResponse(vacio, 500)))
      .emitirCertificado(FACTURA)
      .catch((e) => e);
    expect(err2).toBeInstanceOf(ArcaSireServiceError);
    expect(err2.faultCode).toBe('soapenv:Client');
  });

  it('Fault soapenv:Server de sistema → ArcaSoapError incierto, sin reintento', async () => {
    const m = mockFetch(xmlResponse(fault('soapenv:Server', 'Error de conexión a la base de datos'), 500));
    const sire = makeSire(m, { retries: 3 });
    const err = await sire.emitirCertificado(FACTURA).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaSoapError);
    expect(err).not.toBeInstanceOf(ArcaSireServiceError);
    expect(err.uncertain).toBe(true);
    expect(err.faultString).toBe('Error de conexión a la base de datos');
    expect(m.calls).toHaveLength(1);
  });

  it('HTTP 503: un solo fetch y uncertain', async () => {
    const m = mockFetch(xmlResponse('<html>Service Unavailable</html>', 503));
    const sire = makeSire(m, { retries: 3 });
    const err = await sire.emitirCertificado(FACTURA).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaSoapError);
    expect(err.uncertain).toBe(true);
    expect(m.calls).toHaveLength(1);
  });

  it('timeout: un solo fetch y uncertain', async () => {
    const m = mockFetch(hangingReply());
    const sire = makeSire(m, { timeout: 20, retries: 3 });
    const err = await sire.emitirCertificado(FACTURA).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaSoapError);
    expect(err.uncertain).toBe(true);
    expect(m.calls).toHaveLength(1);
  });

  it('valida antes de autenticar: CUIT retenido inválido', async () => {
    const m = mockFetch(EMITIR_OK);
    const sire = makeSire(m);
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
    const m = mockFetch(ANULAR_OK);
    const sire = makeSire(m);
    const res = await sire.anularCertificado({
      numeroCertificado: '0000000000012345',
      motivoAnulacion: MotivoAnulacion.OTROS,
      codigoTrazabilidad: 'ANUL-1',
    });
    expect(res).toEqual({ certificadoNro: '0000000000012346', codigoSeguridad: 'ab12' });

    const anular = sentBody(m.calls[0].body)['ser:anular'] as Record<string, unknown>;
    expect(anular['@_xmlns:ser']).toBe(NS);
    expect(Object.keys(anular).filter((k) => !k.startsWith('@_'))).toEqual([
      'token',
      'sign',
      'cuitAgente',
      'certificadoAnulacion',
    ]);
    expect(Object.keys(anular.certificadoAnulacion as object)).toEqual(XSD_ANULACION);
    const body = m.calls[0].body;
    expect(body).toContain('<numeroCertificado>0000000000012345</numeroCertificado>');
    expect(body).toContain('<motivoAnulacion>4</motivoAnulacion>');
  });

  it('sin codigoTrazabilidad lo omite', async () => {
    const m = mockFetch(ANULAR_OK);
    await makeSire(m).anularCertificado({ numeroCertificado: '1', motivoAnulacion: 1 });
    const anular = sentBody(m.calls[0].body)['ser:anular'] as Record<string, unknown>;
    expect(Object.keys(anular.certificadoAnulacion as object)).toEqual([
      'version',
      'impuesto',
      'numeroCertificado',
      'motivoAnulacion',
    ]);
  });

  it('Fault de negocio → ArcaSireServiceError; 503 → incierto sin reintento', async () => {
    const sire1 = makeSire(mockFetch(xmlResponse(fault('soapenv:Client', 'Certificado inexistente'), 500)));
    const rechazo = await sire1.anularCertificado({ numeroCertificado: '1', motivoAnulacion: 4 }).catch((e) => e);
    expect(rechazo).toBeInstanceOf(ArcaSireServiceError);
    expect(rechazo).toBeInstanceOf(ArcaRechazoError);
    expect(rechazo.operacion).toBe('anular');
    expect(rechazo.errors).toEqual([{ code: 0, msg: 'Certificado inexistente' }]);

    const m = mockFetch(xmlResponse('', 503));
    const err = await makeSire(m, { retries: 2 })
      .anularCertificado({ numeroCertificado: '1', motivoAnulacion: 4 })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ArcaSoapError);
    expect(err.uncertain).toBe(true);
    expect(m.calls).toHaveLength(1);
  });

  it('respuesta sin certificadoNro → ArcaResponseError incierto con la operación anular', async () => {
    const body = envelope('<tns:anularResponse><codigoSeguridad>ABC</codigoSeguridad></tns:anularResponse>');
    const err = await makeSire(mockFetch(body))
      .anularCertificado({ numeroCertificado: '1', motivoAnulacion: 4 })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ArcaResponseError);
    expect(err.uncertain).toBe(true);
    expect(err.message).toBe('SIRE anular: Respuesta inválida: falta anularResponse.certificadoNro');
  });

  it('valida motivoAnulacion y numeroCertificado', async () => {
    const sire = makeSire(mockFetch(ANULAR_OK));
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
    const m = mockFetch(body);
    const sire = makeSire(m);
    await expect(sire.status()).resolves.toEqual({
      appserver: 'OK',
      dbserver: 'OK',
      authserver: 'OK',
      headerInfo: {
        ambiente: 'homologacion - 207',
        fecha: '2026-11-01T14:43:01.733-03:00',
        vCore: '2020.4', // texto, no número
        v2005: '2020.7',
      },
    });
    expect(sire.wsaa.getAccessTicket).not.toHaveBeenCalled();
    expect(sentBody(m.calls[0].body)['ser:dummy']).toBeDefined();
  });

  it('sin HeaderInfo no incluye headerInfo', async () => {
    const body = envelope(
      '<tns:dummyResponse><appserver>OK</appserver><authserver>OK</authserver><dbserver>OK</dbserver></tns:dummyResponse>',
    );
    const res = await makeSire(mockFetch(body)).status();
    expect(res).toEqual({ appserver: 'OK', dbserver: 'OK', authserver: 'OK' });
    expect('headerInfo' in res).toBe(false);
  });

  it('dummy: envía el mismo request que antes (ser:dummy, sin SOAPAction)', async () => {
    const body = envelope(
      '<tns:dummyResponse><appserver>OK</appserver><authserver>OK</authserver><dbserver>OK</dbserver></tns:dummyResponse>',
    );
    const m = mockFetch(body);
    await makeSire(m).status();
    const dummy = sentBody(m.calls[0].body)['ser:dummy'] as Record<string, unknown>;
    expect(dummy['@_xmlns:ser']).toBe(NS);
  });

  it('dummyResponse incompleto → ArcaResponseError', async () => {
    const body = envelope('<tns:dummyResponse><appserver>OK</appserver></tns:dummyResponse>');
    const err = await makeSire(mockFetch(body))
      .status()
      .catch((e) => e);
    expect(err).toBeInstanceOf(ArcaResponseError);
    expect(err.uncertain).toBe(false);
    expect(err.message).toMatch(/dbserver/);
  });

  it('un Fault en dummy no es un rechazo: queda como ArcaSoapError', async () => {
    for (const code of ['soapenv:Client', 'soapenv:Server']) {
      const err = await makeSire(mockFetch(xmlResponse(fault(code, 'XML invalido, no cumple el schema'), 500)))
        .status()
        .catch((e) => e);
      expect(err).toBeInstanceOf(ArcaSoapError);
      expect(err).not.toBeInstanceOf(ArcaServiceError);
      expect(err.faultCode).toBe(code);
    }
  });

  it('es una consulta: reintenta un 503', async () => {
    const ok = envelope(
      '<tns:dummyResponse><appserver>OK</appserver><authserver>OK</authserver><dbserver>OK</dbserver></tns:dummyResponse>',
    );
    const m = mockFetch(xmlResponse('', 503), ok);
    await expect(makeSire(m, { retries: 1 }).status()).resolves.toMatchObject({ appserver: 'OK' });
    expect(m.calls).toHaveLength(2);
  });
});

describe('config', () => {
  it('usa el endpoint de producción y permite sobrescribirlo', async () => {
    const ok = envelope(
      '<tns:dummyResponse><appserver>OK</appserver><authserver>OK</authserver><dbserver>OK</dbserver></tns:dummyResponse>',
    );
    const m1 = mockFetch(ok);
    await makeSire(m1, { production: true }).status();
    expect(m1.calls[0].url).toBe('https://ws-aplicativos-reca.afip.gob.ar/sire/ws/v1/c2005/2005');

    const m2 = mockFetch(ok);
    await makeSire(m2, { endpoints: { sire: 'https://proxy.local/sire' } }).status();
    expect(m2.calls[0].url).toBe('https://proxy.local/sire');
  });

  it('ENDPOINTS solo tiene el servicio sire (WSAA está en WSAA_ENDPOINTS de common)', () => {
    expect(ENDPOINTS).toEqual({
      sire: {
        testing: 'https://ws-aplicativos-reca.homo.afip.gob.ar/sire/ws/v1/c2005/2005',
        production: 'https://ws-aplicativos-reca.afip.gob.ar/sire/ws/v1/c2005/2005',
      },
    });
    expect(ENDPOINTS).not.toHaveProperty('wsaa');
  });

  it('endpoints.wsaa sobrescribe WSAA (por defecto, WSAA_ENDPOINTS según production)', () => {
    expect(makeSire(mockFetch('')).wsaa.endpoint).toBe(WSAA_ENDPOINTS.testing);
    expect(makeSire(mockFetch(''), { production: true }).wsaa.endpoint).toBe(WSAA_ENDPOINTS.production);
    expect(makeSire(mockFetch(''), { endpoints: { wsaa: 'https://proxy.local/wsaa' } }).wsaa.endpoint).toBe(
      'https://proxy.local/wsaa',
    );
  });

  it('SireClient se construye con { endpoint, transport? }', async () => {
    const ok = envelope(
      '<tns:dummyResponse><appserver>OK</appserver><authserver>OK</authserver><dbserver>OK</dbserver></tns:dummyResponse>',
    );
    const m = mockFetch(xmlResponse('', 503), ok);
    const onEvent = vi.fn();
    const client = new SireClient({
      endpoint: 'https://proxy.local/sire',
      transport: { fetch: m, retries: 1, retryDelayMs: 1, onEvent },
    });
    expect(client.namespace).toBe(SIRE_NAMESPACE);
    await expect(client.dummy()).resolves.toMatchObject({ appserver: 'OK' });
    expect(m.calls).toHaveLength(2);
    expect(m.calls[0].url).toBe('https://proxy.local/sire');
    expect(onEvent).toHaveBeenCalled();
    // @ts-expect-error: las opciones de transporte sueltas (timeout, fetch...) ya no existen: van en `transport`
    new SireClient({ endpoint: 'https://proxy.local/sire', timeout: 1000 });
  });

  it('rechaza un CUIT de agente inválido', () => {
    expect(() => makeSire(mockFetch(''), { cuit: '20267565390' })).toThrow(ArcaValidationError);
  });
});
