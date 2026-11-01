import { describe, it, expect } from 'vitest';
import { ArcaServiceError, ArcaSoapError, ArcaValidationError } from '@ramiidv/arca-common';
import {
  AUTH,
  ID_FACTURA_XML,
  NS,
  URL,
  childOrder,
  client,
  mockFetch,
  sentRequest,
  soapResponse,
  xmlResponse,
} from './helpers.js';

const ok = (method: string, inner: string) => xmlResponse(soapResponse(method, inner));

const OPERACION_OK = (cod = '1234567890') =>
  `<operacionFECredReturn><resultado>A</resultado><idCtaCte><codCtaCte>${cod}</codCtaCte></idCtaCte></operacionFECredReturn>`;

const ID_FACTURA = { cuitEmisor: '30-71234567-1', codTipoCmp: 201, ptoVta: 3, nroCmp: 125 };

function infoCtaCte(cod: string, saldo = '1500.5') {
  return (
    '<infoCtaCte>' +
    `<codCtaCte>${cod}</codCtaCte>` +
    '<estadoCtaCte><estado>Modificable</estado><fechaHoraEstado>2026-10-20T10:00:00-03:00</fechaHoraEstado></estadoCtaCte>' +
    `<idFacturaCredito>${ID_FACTURA_XML}</idFacturaCredito>` +
    '<importeTotalFC>1500.50</importeTotalFC>' +
    `<saldo>${saldo}</saldo>` +
    '<codMoneda>PES</codMoneda>' +
    '<opcionTransferencia>SCA</opcionTransferencia>' +
    '</infoCtaCte>'
  );
}

const COMPROBANTE_XML =
  '<comprobante>' +
  '<cuitEmisor>30712345671</cuitEmisor><razonSocialEmi>Proveedor SA</razonSocialEmi>' +
  '<codTipoCmp>201</codTipoCmp><ptovta>3</ptovta><nroCmp>125</nroCmp>' +
  '<cuitReceptor>20123456786</cuitReceptor><razonSocialRecep>Cliente SRL</razonSocialRecep>' +
  '<tipoCodAuto>E</tipoCodAuto><codAutorizacion>76123456789012</codAutorizacion>' +
  '<fechaEmision>2026-10-01</fechaEmision><fechaVenPago>2026-11-30</fechaVenPago>' +
  '<importeTotal>121000.00</importeTotal><codMoneda>PES</codMoneda><cotizacionMoneda>1</cotizacionMoneda>' +
  '<CBUEmisor>2850590940090418135201</CBUEmisor>' +
  '<arraySubtotalesIVA><subtotalIVA><codigo>5</codigo><baseImponible>100000</baseImponible><importe>21000</importe></subtotalIVA></arraySubtotalesIVA>' +
  '<codCtaCte>1234567890</codCtaCte>' +
  '<estado><estado>Recepcionado</estado><fechaHoraEstado>2026-10-02T09:00:00-03:00</fechaHoraEstado></estado>' +
  '<opcionTransferencia>SCA</opcionTransferencia>' +
  '</comprobante>';

// ---------------------------------------------------------------------------

describe('dummy', () => {
  it('envía Body vacío con SOAPAction y parsea dummyReturn', async () => {
    const fetch = mockFetch(
      ok('dummy', '<dummyReturn><appserver>OK</appserver><authserver>OK</authserver><dbserver>OK</dbserver></dummyReturn>'),
    );
    const status = await client(fetch).dummy();
    expect(status).toEqual({ appserver: 'OK', dbserver: 'OK', authserver: 'OK' });
    const req = sentRequest(fetch);
    expect(fetch.mock.calls[0][0]).toBe(URL);
    expect(req.soapAction).toBe(`"${NS}dummy"`);
    expect(req.xml).toMatch(/<soapenv:Body>\s*<\/soapenv:Body>|<soapenv:Body\/>/);
  });
});

describe('auth y namespace', () => {
  it('authRequest{token, sign, cuitRepresentada} en minúsculas dentro de <ns:metodoRequest>', async () => {
    const fetch = mockFetch(ok('consultarTiposMotivosRechazo', '<codigoDescripcionReturn/>'));
    await client(fetch).consultarTiposMotivosRechazo(AUTH);
    const { body, soapAction } = sentRequest(fetch);
    expect(soapAction).toBe(`"${NS}consultarTiposMotivosRechazo"`);
    const req = body['ser:consultarTiposMotivosRechazoRequest'];
    expect(req['@_xmlns:ser']).toBe(NS);
    expect(req.authRequest).toEqual({ token: 'TOKEN', sign: 'SIGN', cuitRepresentada: '20123456786' });
  });

  it('acepta una función que da el auth (se llama después de validar)', async () => {
    const fetch = mockFetch();
    let called = false;
    const err = await client(fetch)
      .consultarObligadoRecepcion(async () => ((called = true), AUTH), '20123456780')
      .catch((e) => e);
    expect(err).toBeInstanceOf(ArcaValidationError);
    expect(err.field).toBe('cuitConsultada');
    expect(called).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('obligación de recepción', () => {
  it('consultarMontoObligadoRecepcion: cuitConsultada + fechaEmision, obligado N → false', async () => {
    const fetch = mockFetch(
      ok(
        'consultarMontoObligadoRecepcion',
        '<consultarMontoObligadoRecepcionReturn><obligado>N</obligado></consultarMontoObligadoRecepcionReturn>',
      ),
    );
    const r = await client(fetch).consultarMontoObligadoRecepcion(AUTH, {
      cuitConsultada: '30-71234567-1',
      fechaEmision: '20261101',
    });
    expect(r).toEqual({ obligado: false, observaciones: [] });
    const { xml } = sentRequest(fetch);
    expect(childOrder(xml, 'ser:consultarMontoObligadoRecepcionRequest')).toEqual([
      'authRequest',
      'cuitConsultada',
      'fechaEmision',
    ]);
    expect(xml).toContain('<cuitConsultada>30712345671</cuitConsultada>');
    expect(xml).toContain('<fechaEmision>2026-11-01</fechaEmision>');
  });

  it('obligado S con montoDesde', async () => {
    const fetch = mockFetch(
      ok(
        'consultarMontoObligadoRecepcion',
        '<consultarMontoObligadoRecepcionReturn><obligado>S</obligado><montoDesde>3958316.00</montoDesde></consultarMontoObligadoRecepcionReturn>',
      ),
    );
    const r = await client(fetch).consultarMontoObligadoRecepcion(AUTH, {
      cuitConsultada: 30712345671,
      fechaEmision: '2026-11-01',
    });
    expect(r.obligado).toBe(true);
    expect(r.montoDesde).toBe(3958316);
  });

  it('sin obligado ni errores es una respuesta inválida', async () => {
    const fetch = mockFetch(
      ok('consultarMontoObligadoRecepcion', '<consultarMontoObligadoRecepcionReturn></consultarMontoObligadoRecepcionReturn>'),
    );
    const err = await client(fetch)
      .consultarMontoObligadoRecepcion(AUTH, { cuitConsultada: 30712345671, fechaEmision: '2026-11-01' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ArcaSoapError);
    expect(err.message).toMatch(/obligado/);
  });

  it('consultarObligadoRecepcion: respuesta N → false, desde', async () => {
    const fetch = mockFetch(
      ok(
        'consultarObligadoRecepcion',
        '<consultarObligadoRecepcionReturn><respuesta>N</respuesta><desde>2026-01-01</desde></consultarObligadoRecepcionReturn>',
      ),
    );
    const r = await client(fetch).consultarObligadoRecepcion(AUTH, '30712345671');
    expect(r).toEqual({ obligado: false, desde: '2026-01-01', observaciones: [] });
  });
});

describe('errores de negocio', () => {
  it('arrayErrores → ArcaServiceError', async () => {
    const fetch = mockFetch(
      ok(
        'consultarCtasCtes',
        '<consultarCtasCtesReturn><arrayErrores><codigoDescripcion><codigo>1001</codigo><descripcion>CUIT sin FCE</descripcion></codigoDescripcion></arrayErrores></consultarCtasCtesReturn>',
      ),
    );
    const err = await client(fetch).consultarCtasCtes(AUTH, { rol: 'Receptor' }).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaServiceError);
    expect(err.errors).toEqual([{ code: 1001, msg: 'CUIT sin FCE' }]);
  });

  it('arrayErroresFormato (codigoDescripcionString) → ArcaServiceError', async () => {
    const fetch = mockFetch(
      ok(
        'consultarTiposRetenciones',
        '<consultarTiposRetencionesReturn><arrayErroresFormato><codigoDescripcionString><codigo>FMT01</codigo><descripcion>Formato inválido</descripcion></codigoDescripcionString></arrayErroresFormato></consultarTiposRetencionesReturn>',
      ),
    );
    const err = await client(fetch).consultarTiposRetenciones(AUTH).catch((e) => e);
    expect(err).toBeInstanceOf(ArcaServiceError);
    expect(err.errors[0]).toMatchObject({ rawCode: 'FMT01', msg: 'Formato inválido' });
  });

  it('aceptarFECred con resultado R y errores → ArcaServiceError', async () => {
    const fetch = mockFetch(
      ok(
        'aceptarFECred',
        '<operacionFECredReturn><resultado>R</resultado><idCtaCte><codCtaCte>1</codCtaCte></idCtaCte>' +
          '<arrayErrores><codigoDescripcion><codigo>2004</codigo><descripcion>Saldo no coincide</descripcion></codigoDescripcion></arrayErrores></operacionFECredReturn>',
      ),
    );
    const err = await client(fetch)
      .aceptarFECred(AUTH, { idCtaCte: { codCtaCte: 1 }, saldoAceptado: 10, codMoneda: 'PES', cotizacionMonedaUlt: 1 })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ArcaServiceError);
    expect(err.errors[0].code).toBe(2004);
  });

  it('resultado R sin errores también lanza (con las observaciones)', async () => {
    const fetch = mockFetch(
      ok(
        'aceptarFECred',
        '<operacionFECredReturn><resultado>R</resultado><idCtaCte><codCtaCte>1</codCtaCte></idCtaCte>' +
          '<arrayObservaciones><codigoDescripcion><codigo>7</codigo><descripcion>Obs</descripcion></codigoDescripcion></arrayObservaciones></operacionFECredReturn>',
      ),
    );
    const err = await client(fetch)
      .aceptarFECred(AUTH, { idCtaCte: { codCtaCte: 1 }, saldoAceptado: 10, codMoneda: 'PES', cotizacionMonedaUlt: 1 })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ArcaServiceError);
    expect(err.message).toMatch(/resultado R/);
    expect(err.errors).toEqual([{ code: 7, msg: 'Obs' }]);
  });
});

describe('consultarCtasCtes', () => {
  it('request: rolCUITRepresentada, CUITContraparte, fecha{tipo,desde,hasta} en orden del XSD', async () => {
    const fetch = mockFetch(ok('consultarCtasCtes', '<consultarCtasCtesReturn/>'));
    await client(fetch).consultarCtasCtes(AUTH, {
      rol: 'Receptor',
      cuitContraparte: '30-71234567-1',
      fecha: { tipo: 'Emision', desde: '2026-10-01', hasta: '20261031' },
      estadoCtaCte: 'Modificable',
      nroPagina: 2,
      opcionTransferencia: 'SCA',
    });
    const { xml, body } = sentRequest(fetch);
    expect(childOrder(xml, 'ser:consultarCtasCtesRequest')).toEqual([
      'authRequest',
      'rolCUITRepresentada',
      'CUITContraparte',
      'fecha',
      'estadoCtaCte',
      'nroPagina',
      'opcionTransferencia',
    ]);
    expect(childOrder(xml, 'fecha')).toEqual(['tipo', 'desde', 'hasta']);
    const req = body['ser:consultarCtasCtesRequest'];
    expect(req.CUITContraparte).toBe('30712345671');
    expect(req.fecha).toEqual({ tipo: 'Emision', desde: '2026-10-01', hasta: '2026-10-31' });
  });

  it('respuesta con 1 infoCtaCte', async () => {
    const fetch = mockFetch(
      ok(
        'consultarCtasCtes',
        `<consultarCtasCtesReturn><arrayInfosCtaCte>${infoCtaCte('1234567890')}</arrayInfosCtaCte><nroPagina>1</nroPagina><hayMas>N</hayMas></consultarCtasCtesReturn>`,
      ),
    );
    const r = await client(fetch).consultarCtasCtes(AUTH, { rol: 'Receptor' });
    expect(r.ctasCtes).toHaveLength(1);
    expect(r.hayMas).toBe(false);
    expect(r.nroPagina).toBe(1);
    expect(r.ctasCtes[0]).toEqual({
      codCtaCte: '1234567890',
      estadoCtaCte: { estado: 'Modificable', fechaHoraEstado: '2026-10-20T10:00:00-03:00' },
      idFacturaCredito: { cuitEmisor: '30712345671', codTipoCmp: 201, ptoVta: 3, nroCmp: 125 },
      importeTotalFC: 1500.5,
      saldo: 1500.5,
      codMoneda: 'PES',
      opcionTransferencia: 'SCA',
    });
  });

  it('respuesta con N infoCtaCte y hayMas S', async () => {
    const fetch = mockFetch(
      ok(
        'consultarCtasCtes',
        `<consultarCtasCtesReturn><arrayInfosCtaCte>${infoCtaCte('11')}${infoCtaCte('22', '0')}${infoCtaCte('33')}</arrayInfosCtaCte><hayMas>S</hayMas></consultarCtasCtesReturn>`,
      ),
    );
    const r = await client(fetch).consultarCtasCtes(AUTH, { rol: 'Emisor' });
    expect(r.ctasCtes.map((c) => c.codCtaCte)).toEqual(['11', '22', '33']);
    expect(r.ctasCtes[1].saldo).toBe(0);
    expect(r.hayMas).toBe(true);
  });

  it('sin arrayInfosCtaCte → lista vacía', async () => {
    const fetch = mockFetch(ok('consultarCtasCtes', '<consultarCtasCtesReturn><hayMas>N</hayMas></consultarCtasCtesReturn>'));
    const r = await client(fetch).consultarCtasCtes(AUTH, { rol: 'Emisor' });
    expect(r.ctasCtes).toEqual([]);
  });

  it('valida rol y rango de fechas', async () => {
    const c = client(mockFetch());
    await expect(c.consultarCtasCtes(AUTH, { rol: 'Comprador' as never })).rejects.toThrow(ArcaValidationError);
    await expect(
      c.consultarCtasCtes(AUTH, { rol: 'Emisor', fecha: { tipo: 'Emision', desde: '2026-10-31', hasta: '2026-10-01' } }),
    ).rejects.toThrow(/hasta/);
  });
});

describe('consultarComprobantes', () => {
  it('request con rolCUITRepresentada obligatorio y orden del XSD', async () => {
    const fetch = mockFetch(ok('consultarComprobantes', '<consultarCmpReturn/>'));
    await client(fetch).consultarComprobantes(AUTH, {
      rol: 'Receptor',
      cuitContraparte: 30712345671,
      codTipoCmp: 201,
      estadoCmp: 'Recepcionado',
      fecha: { tipo: 'VenPago', desde: '2026-10-01', hasta: '2026-10-31' },
      codCtaCte: '1234567890',
      estadoCtaCte: 'Modificable',
      nroPagina: 1,
    });
    expect(childOrder(sentRequest(fetch).xml, 'ser:consultarComprobantesRequest')).toEqual([
      'authRequest',
      'rolCUITRepresentada',
      'CUITContraparte',
      'codTipoCmp',
      'estadoCmp',
      'fecha',
      'codCtaCte',
      'estadoCtaCte',
      'nroPagina',
    ]);
  });

  it('parsea ComprobanteType (1 y N)', async () => {
    const fetch = mockFetch(
      ok('consultarComprobantes', `<consultarCmpReturn><arrayComprobantes>${COMPROBANTE_XML}</arrayComprobantes></consultarCmpReturn>`),
      ok(
        'consultarComprobantes',
        `<consultarCmpReturn><arrayComprobantes>${COMPROBANTE_XML}${COMPROBANTE_XML}</arrayComprobantes><hayMas>N</hayMas></consultarCmpReturn>`,
      ),
    );
    const c = client(fetch);
    const one = await c.consultarComprobantes(AUTH, { rol: 'Receptor' });
    expect(one.comprobantes).toHaveLength(1);
    const cmp = one.comprobantes[0];
    expect(cmp).toMatchObject({
      cuitEmisor: '30712345671',
      razonSocialEmi: 'Proveedor SA',
      codTipoCmp: 201,
      ptoVta: 3,
      nroCmp: 125,
      codAutorizacion: '76123456789012',
      fechaVenPago: '2026-11-30',
      importeTotal: 121000,
      cbuEmisor: '2850590940090418135201',
      codCtaCte: '1234567890',
      estado: { estado: 'Recepcionado', fechaHoraEstado: '2026-10-02T09:00:00-03:00' },
      subtotalesIVA: [{ codigo: 5, baseImponible: 100000, importe: 21000 }],
      items: [],
      motivosRechazo: [],
    });
    const many = await c.consultarComprobantes(AUTH, { rol: 'Receptor' });
    expect(many.comprobantes).toHaveLength(2);
  });

  it('un campo obligatorio ausente lanza (no se inventa)', async () => {
    const sinEstado = COMPROBANTE_XML.replace(/<estado><estado>.*?<\/estado>/, '');
    const fetch = mockFetch(
      ok('consultarComprobantes', `<consultarCmpReturn><arrayComprobantes>${sinEstado}</arrayComprobantes></consultarCmpReturn>`),
    );
    await expect(client(fetch).consultarComprobantes(AUTH, { rol: 'Receptor' })).rejects.toThrow(/estado/);
  });
});

describe('consultarCtaCte', () => {
  it('idCtaCte con idFactura anidado y parsea CuentaCorrienteType', async () => {
    const fetch = mockFetch(
      ok(
        'consultarCtaCte',
        '<consultarCtaCteReturn><ctaCte>' +
          '<codCtaCte>1234567890</codCtaCte>' +
          '<estadoCtaCte><estado>Aceptada</estado><fechaHoraEstado>2026-10-25T12:00:00-03:00</fechaHoraEstado></estadoCtaCte>' +
          `<factura>${COMPROBANTE_XML.replace(/<\/?comprobante>/g, '')}</factura>` +
          '<arrayFormasCancelacion><codigoDescripcion><codigo>1</codigo><descripcion>Transferencia</descripcion></codigoDescripcion></arrayFormasCancelacion>' +
          '<arrayRetenciones><retencion><codTipo>2</codTipo><importe>500</importe><porcentaje>3</porcentaje></retencion></arrayRetenciones>' +
          '<importeInicial>121000</importeInicial><saldoAceptado>120500</saldoAceptado><saldo>120500</saldo>' +
          '<codMoneda>PES</codMoneda><cotizacionMonedaUlt>1</cotizacionMonedaUlt>' +
          '</ctaCte></consultarCtaCteReturn>',
      ),
    );
    const r = await client(fetch).consultarCtaCte(AUTH, { idFactura: ID_FACTURA });
    const { xml, body } = sentRequest(fetch);
    expect(body['ser:consultarCtaCteRequest'].idCtaCte).toEqual({
      idFactura: { CUITEmisor: '30712345671', codTipoCmp: 201, ptoVta: 3, nroCmp: 125 },
    });
    expect(childOrder(xml, 'idFactura')).toEqual(['CUITEmisor', 'codTipoCmp', 'ptoVta', 'nroCmp']);
    expect(r.ctaCte.estadoCtaCte.estado).toBe('Aceptada');
    expect(r.ctaCte.factura.nroCmp).toBe(125);
    expect(r.ctaCte.formasCancelacion).toEqual([{ codigo: 1, descripcion: 'Transferencia' }]);
    expect(r.ctaCte.retenciones).toEqual([{ codTipo: 2, importe: 500, porcentaje: 3 }]);
    expect(r.ctaCte.notasDCAsociadas).toEqual([]);
  });

  it('idCtaCte debe tener exactamente uno de codCtaCte o idFactura', async () => {
    const c = client(mockFetch());
    await expect(c.consultarCtaCte(AUTH, {} as never)).rejects.toThrow(ArcaValidationError);
    await expect(
      c.consultarCtaCte(AUTH, { codCtaCte: 1, idFactura: ID_FACTURA } as never),
    ).rejects.toThrow(/exactamente uno/);
  });
});

describe('emisiones', () => {
  it('aceptarFECred: request completo en el orden del XSD', async () => {
    const fetch = mockFetch(ok('aceptarFECred', OPERACION_OK()));
    const r = await client(fetch).aceptarFECred(AUTH, {
      idCtaCte: { codCtaCte: '1234567890' },
      confirmarNotasDC: [{ acepta: false, idNota: { ...ID_FACTURA, codTipoCmp: 203, nroCmp: 9 } }],
      formasCancelacion: [{ codigo: 1, descripcion: 'Transferencia' }],
      retenciones: [{ codTipo: 2, importe: 500.555, porcentaje: 3 }],
      ajustesOperacion: [{ codigo: 1, importe: -10 }],
      tipoCancelacion: 'TOT',
      importeCancelado: 120000,
      importeTotalRetPesos: 500.555,
      saldoAceptado: 120500,
      codMoneda: 'PES',
      cotizacionMonedaUlt: 1,
      informaCBU: true,
      cbuComprador: '2850590940090418135201',
    });
    expect(r).toEqual({ resultado: 'A', idCtaCte: { codCtaCte: '1234567890' }, observaciones: [] });
    const { xml, body, soapAction } = sentRequest(fetch);
    expect(soapAction).toBe(`"${NS}aceptarFECred"`);
    expect(childOrder(xml, 'ser:aceptarFECredRequest')).toEqual([
      'authRequest',
      'idCtaCte',
      'arrayConfirmarNotasDC',
      'arrayFormasCancelacion',
      'arrayRetenciones',
      'arrayAjustesOperacion',
      'tipoCancelacion',
      'importeCancelado',
      'importeTotalRetPesos',
      'saldoAceptado',
      'codMoneda',
      'cotizacionMonedaUlt',
      'informaCBU',
      'CBUComprador',
    ]);
    const req = body['ser:aceptarFECredRequest'];
    expect(req.idCtaCte).toEqual({ codCtaCte: '1234567890' });
    expect(req.arrayConfirmarNotasDC.confirmarNota.acepta).toBe('N');
    expect(xml).toContain('<importeTotalRetPesos>500.56</importeTotalRetPesos>');
    expect(xml).toContain('<saldoAceptado>120500.00</saldoAceptado>');
    expect(xml).toContain('<importe>-10.00</importe>');
    expect(req.informaCBU).toBe('S');
  });

  it('aceptarFECred: valida importes y CBU antes de enviar', async () => {
    const c = client(mockFetch());
    const base = { idCtaCte: { codCtaCte: 1 }, saldoAceptado: 1, codMoneda: 'PES', cotizacionMonedaUlt: 1 };
    await expect(c.aceptarFECred(AUTH, { ...base, saldoAceptado: Number.NaN })).rejects.toThrow(/saldoAceptado/);
    await expect(c.aceptarFECred(AUTH, { ...base, saldoAceptado: -1 })).rejects.toThrow(/negativo/);
    await expect(c.aceptarFECred(AUTH, { ...base, cotizacionMonedaUlt: 0 })).rejects.toThrow(/cotizacion/);
    await expect(c.aceptarFECred(AUTH, { ...base, cbuComprador: '123' })).rejects.toThrow(/cbuComprador/);
  });

  it('rechazarFECred: idCtaCte + arrayMotivosRechazo{motivoRechazo{codMotivo, descMotivo, justificacion}}', async () => {
    const fetch = mockFetch(ok('rechazarFECred', OPERACION_OK()));
    await client(fetch).rechazarFECred(AUTH, {
      idCtaCte: { idFactura: ID_FACTURA },
      motivos: [
        { codMotivo: 1, descMotivo: 'Mercadería', justificacion: 'Llegó dañada & incompleta' },
        { codMotivo: 3, descMotivo: 'Precio', justificacion: 'No coincide con OC <123>' },
      ],
    });
    const { xml, body } = sentRequest(fetch);
    expect(childOrder(xml, 'ser:rechazarFECredRequest')).toEqual(['authRequest', 'idCtaCte', 'arrayMotivosRechazo']);
    const motivos = body['ser:rechazarFECredRequest'].arrayMotivosRechazo.motivoRechazo;
    expect(motivos).toHaveLength(2);
    expect(motivos[0]).toEqual({ codMotivo: 1, descMotivo: 'Mercadería', justificacion: 'Llegó dañada & incompleta' });
    expect(motivos[1].justificacion).toBe('No coincide con OC <123>');
    expect(xml).toContain('&amp;');
  });

  it('rechazarFECred sin motivos o con texto corto no se envía', async () => {
    const c = client(mockFetch());
    await expect(c.rechazarFECred(AUTH, { idCtaCte: { codCtaCte: 1 }, motivos: [] })).rejects.toThrow(ArcaValidationError);
    await expect(
      c.rechazarFECred(AUTH, { idCtaCte: { codCtaCte: 1 }, motivos: [{ codMotivo: 1, descMotivo: 'ab', justificacion: 'abc' }] }),
    ).rejects.toThrow(/descMotivo/);
  });

  it('informarCancelacionTotalFECred: idCtaCte, arrayFormasCancelacion, importeCancelacion', async () => {
    const fetch = mockFetch(ok('informarCancelacionTotalFECred', OPERACION_OK('77')));
    const r = await client(fetch).informarCancelacionTotalFECred(AUTH, {
      idCtaCte: { codCtaCte: 77 },
      formasCancelacion: [{ codigo: 1, descripcion: 'Transferencia' }],
      importeCancelacion: 1500.5,
    });
    expect(r.idCtaCte).toEqual({ codCtaCte: '77' });
    const { xml, soapAction } = sentRequest(fetch);
    expect(soapAction).toBe(`"${NS}informarCancelacionTotalFECred"`);
    expect(childOrder(xml, 'ser:informarCancelacionTotalFECredRequest')).toEqual([
      'authRequest',
      'idCtaCte',
      'arrayFormasCancelacion',
      'importeCancelacion',
    ]);
    expect(xml).toContain('<importeCancelacion>1500.50</importeCancelacion>');
  });

  it('rechazarNotaDC y modificarOpcionTransferencia', async () => {
    const fetch = mockFetch(
      ok(
        'rechazarNotaDC',
        `<rechazarNotaDCReturn><idComprobante>${ID_FACTURA_XML}</idComprobante><resultado>O</resultado>` +
          '<arrayObservaciones><codigoDescripcion><codigo>5</codigo><descripcion>Obs</descripcion></codigoDescripcion></arrayObservaciones></rechazarNotaDCReturn>',
      ),
      ok('modificarOpcionTransferencia', OPERACION_OK()),
    );
    const c = client(fetch);
    const r = await c.rechazarNotaDC(AUTH, {
      idComprobante: ID_FACTURA,
      motivos: [{ codMotivo: 1, descMotivo: 'Motivo', justificacion: 'Justificación' }],
    });
    expect(r).toEqual({
      resultado: 'O',
      idComprobante: { cuitEmisor: '30712345671', codTipoCmp: 201, ptoVta: 3, nroCmp: 125 },
      observaciones: [{ codigo: 5, descripcion: 'Obs' }],
    });
    expect(childOrder(sentRequest(fetch, 0).xml, 'ser:rechazarNotaDCRequest')).toEqual([
      'authRequest',
      'idComprobante',
      'arrayMotivosRechazo',
    ]);
    await c.modificarOpcionTransferencia(AUTH, { idCtaCte: { codCtaCte: 1 }, opcionTransferencia: 'ADC' });
    expect(childOrder(sentRequest(fetch, 1).xml, 'ser:modificarOpcionTransferenciaRequest')).toEqual([
      'authRequest',
      'idCtaCte',
      'opcionTransferencia',
    ]);
  });

  const emitir = (c: ReturnType<typeof client>) =>
    c.aceptarFECred(AUTH, { idCtaCte: { codCtaCte: 1 }, saldoAceptado: 1, codMoneda: 'PES', cotizacionMonedaUlt: 1 });

  it('una emisión ante 503 hace 1 solo fetch y el error es uncertain', async () => {
    const fetch = mockFetch(xmlResponse('Service Unavailable', 503), ok('aceptarFECred', OPERACION_OK()));
    const err = await emitir(client(fetch, { retries: 3 })).catch((e) => e);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(err).toBeInstanceOf(ArcaSoapError);
    expect(err.uncertain).toBe(true);
  });

  it('una emisión ante timeout hace 1 solo fetch y el error es uncertain', async () => {
    const hang = (init: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    const fetch = mockFetch(hang, ok('rechazarFECred', OPERACION_OK()));
    const err = await client(fetch, { retries: 3, timeout: 20 })
      .rechazarFECred(AUTH, {
        idCtaCte: { codCtaCte: 1 },
        motivos: [{ codMotivo: 1, descMotivo: 'Motivo', justificacion: 'Justificación' }],
      })
      .catch((e) => e);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(err).toBeInstanceOf(ArcaSoapError);
    expect(err.uncertain).toBe(true);
  });

  it('una consulta sí se reintenta ante 503', async () => {
    const fetch = mockFetch(xmlResponse('Service Unavailable', 503), ok('consultarCtasCtes', '<consultarCtasCtesReturn/>'));
    await client(fetch, { retries: 1 }).consultarCtasCtes(AUTH, { rol: 'Emisor' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('historial, remitos y parámetros', () => {
  it('consultarHistorialEstadosCtaCte (N estados)', async () => {
    const fetch = mockFetch(
      ok(
        'consultarHistorialEstadosCtaCte',
        '<consultarHistorialEstadosCtaCteReturn><idCtaCte><codCtaCte>5</codCtaCte></idCtaCte><arrayHistorialEstados>' +
          '<estadoHistorico><estado>Modificable</estado><fechaHoraEstado>2026-10-01T00:00:00-03:00</fechaHoraEstado></estadoHistorico>' +
          '<estadoHistorico><estado>Aceptada</estado><fechaHoraEstado>2026-10-05T00:00:00-03:00</fechaHoraEstado></estadoHistorico>' +
          '</arrayHistorialEstados></consultarHistorialEstadosCtaCteReturn>',
      ),
    );
    const r = await client(fetch).consultarHistorialEstadosCtaCte(AUTH, { codCtaCte: 5 });
    expect(r.idCtaCte).toEqual({ codCtaCte: '5' });
    expect(r.estados.map((e) => e.estado)).toEqual(['Modificable', 'Aceptada']);
  });

  it('consultarHistorialEstadosComprobante (1 estado)', async () => {
    const fetch = mockFetch(
      ok(
        'consultarHistorialEstadosComprobante',
        `<consultarHistorialEstadosComprobanteReturn><idComprobante>${ID_FACTURA_XML}</idComprobante><arrayHistorialEstados>` +
          '<estadoHistorico><estado>Aceptado</estado><fechaHoraEstado>2026-10-05T00:00:00-03:00</fechaHoraEstado></estadoHistorico>' +
          '</arrayHistorialEstados></consultarHistorialEstadosComprobanteReturn>',
      ),
    );
    const r = await client(fetch).consultarHistorialEstadosComprobante(AUTH, ID_FACTURA);
    expect(r.estados).toEqual([{ estado: 'Aceptado', fechaHoraEstado: '2026-10-05T00:00:00-03:00' }]);
  });

  it('obtenerRemitos', async () => {
    const fetch = mockFetch(
      ok(
        'obtenerRemitos',
        `<obtenerRemitosReturn><arrayIdsRemitos><idsComprobantes>${ID_FACTURA_XML}</idsComprobantes></arrayIdsRemitos></obtenerRemitosReturn>`,
      ),
    );
    const r = await client(fetch).obtenerRemitos(AUTH, ID_FACTURA);
    expect(r).toEqual([{ cuitEmisor: '30712345671', codTipoCmp: 201, ptoVta: 3, nroCmp: 125 }]);
  });

  it('tipos: codigoDescripcionReturn/arrayCodigoDescripcion/codigoDescripcion (1 y N)', async () => {
    const item = (c: number, d: string) => `<codigoDescripcion><codigo>${c}</codigo><descripcion>${d}</descripcion></codigoDescripcion>`;
    const fetch = mockFetch(
      ok('consultarTiposFormasCancelacion', `<codigoDescripcionReturn><arrayCodigoDescripcion>${item(1, 'Efectivo')}</arrayCodigoDescripcion></codigoDescripcionReturn>`),
      ok('consultarTiposAjustesOperacion', `<codigoDescripcionReturn><arrayCodigoDescripcion>${item(1, 'A')}${item(2, 'B')}</arrayCodigoDescripcion></codigoDescripcionReturn>`),
    );
    const c = client(fetch);
    expect(await c.consultarTiposFormasCancelacion(AUTH)).toEqual([{ codigo: 1, descripcion: 'Efectivo' }]);
    expect(await c.consultarTiposAjustesOperacion(AUTH)).toHaveLength(2);
    expect(sentRequest(fetch, 1).soapAction).toBe(`"${NS}consultarTiposAjustesOperacion"`);
  });

  it('consultarTiposRetenciones', async () => {
    const fetch = mockFetch(
      ok(
        'consultarTiposRetenciones',
        '<consultarTiposRetencionesReturn><arrayTiposRetenciones><tipoRetencion><codigoJurisdiccion>901</codigoJurisdiccion>' +
          '<descripcionJurisdiccion>CABA</descripcionJurisdiccion><porcentajeRetencion>2.5</porcentajeRetencion></tipoRetencion></arrayTiposRetenciones></consultarTiposRetencionesReturn>',
      ),
    );
    expect(await client(fetch).consultarTiposRetenciones(AUTH)).toEqual([
      { codigoJurisdiccion: 901, descripcionJurisdiccion: 'CABA', porcentajeRetencion: 2.5 },
    ]);
  });
});

describe('Agente de Depósito Colectivo', () => {
  it('informarFacturaAgtDptoCltv es emisión y arma ctaAgente', async () => {
    const fetch = mockFetch(xmlResponse('err', 503));
    const err = await client(fetch, { retries: 2 })
      .informarFacturaAgtDptoCltv(AUTH, {
        idCtaCte: { codCtaCte: 1 },
        ctaAgente: { cuitAgente: '30500012346', idCuenta: 'CTA-001' },
      })
      .catch((e) => e);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(err.uncertain).toBe(true);
    expect(sentRequest(fetch).body['ser:informarFacturaAgtDptoCltvRequest'].ctaAgente).toEqual({
      cuitAgente: '30500012346',
      idCuenta: 'CTA-001',
    });
  });

  it('consultarCuentasEnAgtDptoCltv', async () => {
    const fetch = mockFetch(
      ok(
        'consultarCuentasEnAgtDptoCltv',
        '<consultarCuentasEnAgtDptoCltvReturn><arrayCuentasEnAgente><cuentaEnAgente><cuitAgente>30500012346</cuitAgente><idCuenta>CTA-001</idCuenta></cuentaEnAgente></arrayCuentasEnAgente></consultarCuentasEnAgtDptoCltvReturn>',
      ),
    );
    const r = await client(fetch).consultarCuentasEnAgtDptoCltv(AUTH);
    expect(r.cuentas).toEqual([{ cuitAgente: '30500012346', idCuenta: 'CTA-001' }]);
  });
});
