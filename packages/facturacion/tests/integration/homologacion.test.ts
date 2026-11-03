/**
 * Tests de integración contra ARCA homologación.
 *
 * Corren solo si están definidas:
 *   ARCA_TEST_CERT   certificado PEM (contenido o ruta al archivo)
 *   ARCA_TEST_KEY    clave privada PEM (contenido o ruta al archivo)
 *   ARCA_TEST_CUIT   CUIT del certificado
 * Opcionales:
 *   ARCA_TEST_SERVICES         servicios autorizados, separados por comas: sin "wsfe"
 *                              solo corre el estado del servicio (no requiere autenticación)
 *   ARCA_TEST_PTO_VTA          punto de venta habilitado para WSFE (default: 1)
 *   ARCA_TEST_CUIT_RECEPTOR    CUIT receptor para la factura A (default: 20111111112)
 *   ARCA_TEST_TICKETS_DIR      directorio del FileTicketStorage (default: <tmp>/arca-test-tickets)
 *
 * El storage se conserva entre corridas a propósito: WSAA rechaza un login
 * nuevo mientras el ticket anterior siga vigente.
 *
 * npm run test:integration (ver "Desarrollo" en el README raíz: `.env` local)
 */
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { FileTicketStorage } from '@ramiidv/arca-common';
import type { ArcaEvent } from '@ramiidv/arca-common';
import { ArcaFacturacion } from '../../src/arca.js';
import { CbteTipo, CondicionIva, DocTipo, IvaTipo } from '../../src/constants.js';
import type { FacturaResult } from '../../src/types.js';

const env = process.env;
const habilitado = Boolean(env.ARCA_TEST_CERT && env.ARCA_TEST_KEY && env.ARCA_TEST_CUIT);
const servicios = new Set((env.ARCA_TEST_SERVICES ?? '').split(',').map((s) => s.trim()));
/** Los tests que se autentican en WSFE: el certificado tiene que estar autorizado en el servicio. */
const itWsfe = it.skipIf(!servicios.has('wsfe'));

function pem(value: string): string {
  return value.includes('-----BEGIN') ? value : readFileSync(value, 'utf8');
}

describe.skipIf(!habilitado)('integración ARCA homologación', { timeout: 120_000 }, () => {
  const ptoVta = Number(env.ARCA_TEST_PTO_VTA ?? 1);
  const cuitReceptor = Number(env.ARCA_TEST_CUIT_RECEPTOR ?? 20111111112);
  const ticketsDir = env.ARCA_TEST_TICKETS_DIR ?? join(tmpdir(), 'arca-test-tickets');

  const nuevaInstancia = (events: ArcaEvent[] = []) =>
    new ArcaFacturacion({
      cuit: Number(env.ARCA_TEST_CUIT),
      cert: pem(env.ARCA_TEST_CERT!),
      key: pem(env.ARCA_TEST_KEY!),
      production: false,
      ticketStorage: new FileTicketStorage(ticketsDir),
      onEvent: (e) => events.push(e),
    });

  let arca: ArcaFacturacion;
  let facturaA: FacturaResult;

  beforeAll(() => {
    arca = nuevaInstancia();
  });

  it('status (FEDummy/FEXDummy)', async () => {
    const status = await arca.status();
    expect(status.wsfe).toMatchObject({ ok: true });
    expect(status.wsfex).toMatchObject({ ok: true });
  });

  itWsfe('login con TA persistido: una segunda instancia reutiliza el ticket del storage', async () => {
    await arca.ultimoComprobante(ptoVta, CbteTipo.FACTURA_B);
    expect(existsSync(ticketsDir)).toBe(true);

    const events: ArcaEvent[] = [];
    const otra = nuevaInstancia(events);
    await otra.ultimoComprobante(ptoVta, CbteTipo.FACTURA_B);
    expect(events.some((e) => e.type === 'auth:login')).toBe(false);
    expect(events).toContainEqual({ type: 'auth:cache-hit', service: 'wsfe', source: 'storage' });
  });

  itWsfe('factura B a consumidor final con precios finales', async () => {
    const cbteNro = (await arca.ultimoComprobante(ptoVta, CbteTipo.FACTURA_B)) + 1;
    const res = await arca.facturar({
      ptoVta,
      cbteTipo: CbteTipo.FACTURA_B,
      cbteNro,
      items: [
        { total: 1210, iva: IvaTipo.IVA_21 },
        { total: 552.5, iva: IvaTipo.IVA_10_5 },
      ],
      descuentoGlobal: 10.01,
    });
    expect(res.cae).toMatch(/^\d{14}$/);
    expect(res.cbteNro).toBe(cbteNro);
  });

  itWsfe('factura A a un CUIT', async () => {
    facturaA = await arca.facturar({
      ptoVta,
      cbteTipo: CbteTipo.FACTURA_A,
      docTipo: DocTipo.CUIT,
      docNro: cuitReceptor,
      condicionIva: CondicionIva.RESPONSABLE_INSCRIPTO,
      items: [{ neto: 1000, iva: IvaTipo.IVA_21 }],
    });
    expect(facturaA.cae).toMatch(/^\d{14}$/);
  });

  itWsfe('nota de crédito asociada a la factura A', async () => {
    const nc = await arca.notaCredito({
      ptoVta,
      docTipo: DocTipo.CUIT,
      docNro: cuitReceptor,
      condicionIva: CondicionIva.RESPONSABLE_INSCRIPTO,
      items: [{ neto: 1000, iva: IvaTipo.IVA_21 }],
      comprobanteOriginal: { tipo: CbteTipo.FACTURA_A, ptoVta, nro: facturaA.cbteNro },
    });
    expect(nc.cae).toMatch(/^\d{14}$/);
    expect(nc.cbteTipo).toBe(CbteTipo.NOTA_CREDITO_A);
  });

  itWsfe('recuperarComprobante sobre un número ya emitido → autorizado con el mismo CAE', async () => {
    const r = await arca.recuperarComprobante({
      ptoVta,
      cbteTipo: CbteTipo.FACTURA_A,
      cbteNro: facturaA.cbteNro,
      importeTotal: facturaA.importes.total,
      docTipo: DocTipo.CUIT,
      docNro: cuitReceptor,
      fecha: facturaA.fecha!,
    });
    expect(r.estado).toBe('autorizado');
    if (r.estado === 'autorizado') expect(r.resultado.cae).toBe(facturaA.cae);
  });

  itWsfe('recuperarComprobante sobre el próximo número → no_emitido', async () => {
    const ultimo = await arca.ultimoComprobante(ptoVta, CbteTipo.FACTURA_A);
    const r = await arca.recuperarComprobante({
      ptoVta,
      cbteTipo: CbteTipo.FACTURA_A,
      cbteNro: ultimo + 1,
      importeTotal: 1,
      docTipo: DocTipo.CONSUMIDOR_FINAL,
      docNro: 0,
      fecha: '20260101',
    });
    expect(r).toEqual({ estado: 'no_emitido' });
  });
});
