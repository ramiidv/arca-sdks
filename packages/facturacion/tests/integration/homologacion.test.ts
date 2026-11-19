/**
 * Tests de integración contra ARCA homologación (WSFEv1).
 *
 * Corren solo con ARCA_TEST_CERT, ARCA_TEST_KEY y ARCA_TEST_CUIT (ver "Desarrollo"
 * en el README raíz). Sin "wsfe" en ARCA_TEST_SERVICES solo corre el estado del
 * servicio (no requiere autenticación). Opcionales:
 *   ARCA_TEST_PERFIL           ri (default: emite A y B) o monotributo (emite C)
 *   ARCA_TEST_PTO_VTA          punto de venta habilitado para WSFE (default: 1)
 *   ARCA_TEST_CUIT_RECEPTOR    CUIT receptor (responsable inscripto) de la factura a
 *                              un CUIT (default: 20111111112)
 */
import { existsSync } from 'node:fs';
import type { ArcaEvent } from '@ramiidv/arca-common';
import { CondicionIva } from '@ramiidv/arca-common';
import { beforeAll, describe, expect, it } from 'vitest';
import { normalizarCuit } from '../../../../tests/homologacion/env.js';
import { autorizado, configSdk, principal, ticketsDir } from '../../../../tests/homologacion/sdk.js';
import { ArcaFacturacion } from '../../src/arca.js';
import { resolverCbteTipo } from '../../src/cbte-tipo.js';
import { CbteTipo, DocTipo, IvaTipo } from '../../src/constants.js';
import type { FacturaResult, FacturarOpts } from '../../src/types.js';

/** Los tests que se autentican en WSFE: el certificado tiene que estar autorizado en el servicio. */
const itWsfe = it.skipIf(!autorizado('wsfe', principal));

const ri = principal?.perfil !== 'monotributo';
const emisor = ri ? CondicionIva.RESPONSABLE_INSCRIPTO : CondicionIva.MONOTRIBUTISTA;
/** B del RI o C del monotributista. */
const tipoConsumidorFinal = resolverCbteTipo(emisor, CondicionIva.CONSUMIDOR_FINAL);
/** A del RI o C del monotributista. */
const tipoACuit = resolverCbteTipo(emisor, CondicionIva.RESPONSABLE_INSCRIPTO);
const letra = (tipo: number) => CbteTipo[tipo]!.replace(/^FACTURA_/, '');
/** La clase C no discrimina IVA: sus ítems van sin alícuota. */
const conIva = (iva: IvaTipo) => (ri ? { iva } : {});
/** El ítem de la factura a un CUIT y de su nota de crédito: neto más IVA en la A, total en la C. */
const itemACuit = ri ? { neto: 1000, iva: IvaTipo.IVA_21 } : { total: 1000 };

describe.skipIf(!principal)(
  `integración WSFEv1 (homologación, perfil ${principal?.perfil})`,
  { timeout: 120_000 },
  () => {
    const ptoVta = principal?.ptoVta ?? 1;
    const cuitReceptor = Number(
      normalizarCuit(process.env.ARCA_TEST_CUIT_RECEPTOR ?? '20111111112', 'ARCA_TEST_CUIT_RECEPTOR'),
    );

    const nuevaInstancia = (events: ArcaEvent[] = []) =>
      new ArcaFacturacion({ ...configSdk(principal!), onEvent: (e) => events.push(e) });

    const aCuit: Pick<FacturarOpts, 'docTipo' | 'docNro' | 'condicionIva'> = {
      docTipo: DocTipo.CUIT,
      docNro: cuitReceptor,
      condicionIva: CondicionIva.RESPONSABLE_INSCRIPTO,
    };

    let arca: ArcaFacturacion;
    let facturaACuit: FacturaResult;

    beforeAll(() => {
      arca = nuevaInstancia();
    });

    it('status (FEDummy/FEXDummy)', async () => {
      const status = await arca.status();
      expect(status.wsfe).toMatchObject({ ok: true });
      expect(status.wsfex).toMatchObject({ ok: true });
    });

    itWsfe('login con TA persistido: una segunda instancia reutiliza el ticket del storage', async () => {
      await arca.ultimoComprobante(ptoVta, tipoConsumidorFinal);
      expect(existsSync(ticketsDir(principal!))).toBe(true);

      const events: ArcaEvent[] = [];
      const otra = nuevaInstancia(events);
      await otra.ultimoComprobante(ptoVta, tipoConsumidorFinal);
      expect(events.some((e) => e.type === 'auth:login')).toBe(false);
      expect(events).toContainEqual({ type: 'auth:cache-hit', service: 'wsfe', source: 'storage' });
    });

    itWsfe(`factura ${letra(tipoConsumidorFinal)} a consumidor final con precios finales`, async () => {
      const cbteNro = (await arca.ultimoComprobante(ptoVta, tipoConsumidorFinal)) + 1;
      const res = await arca.facturar({
        ptoVta,
        cbteTipo: tipoConsumidorFinal,
        cbteNro,
        items: [
          { total: 1210, ...conIva(IvaTipo.IVA_21) },
          { total: 552.5, ...conIva(IvaTipo.IVA_10_5) },
        ],
        descuentoGlobal: 10.01,
      });
      expect(res.cae).toMatch(/^\d{14}$/);
      expect(res.cbteNro).toBe(cbteNro);
    });

    itWsfe(`factura ${letra(tipoACuit)} a un CUIT responsable inscripto`, async () => {
      facturaACuit = await arca.facturar({
        ptoVta,
        cbteTipo: tipoACuit,
        ...aCuit,
        items: [itemACuit],
      });
      expect(facturaACuit.cae).toMatch(/^\d{14}$/);
    });

    itWsfe(`nota de crédito asociada a la factura ${letra(tipoACuit)}`, async () => {
      const nc = await arca.notaCredito({
        ptoVta,
        ...aCuit,
        items: [itemACuit],
        comprobanteOriginal: { tipo: tipoACuit, ptoVta, nro: facturaACuit.cbteNro },
      });
      expect(nc.cae).toMatch(/^\d{14}$/);
      expect(nc.cbteTipo).toBe(resolverCbteTipo(emisor, CondicionIva.RESPONSABLE_INSCRIPTO, 'nota_credito'));
    });

    itWsfe('recuperarComprobante sobre un número ya emitido → autorizado con el mismo CAE', async () => {
      const r = await arca.recuperarComprobante({
        ptoVta,
        cbteTipo: tipoACuit,
        cbteNro: facturaACuit.cbteNro,
        importeTotal: facturaACuit.importes.total,
        docTipo: DocTipo.CUIT,
        docNro: cuitReceptor,
        fecha: facturaACuit.fecha!,
      });
      expect(r.estado).toBe('autorizado');
      if (r.estado === 'autorizado') expect(r.resultado.cae).toBe(facturaACuit.cae);
    });

    itWsfe('recuperarComprobante sobre el próximo número → no_emitido', async () => {
      const ultimo = await arca.ultimoComprobante(ptoVta, tipoACuit);
      const r = await arca.recuperarComprobante({
        ptoVta,
        cbteTipo: tipoACuit,
        cbteNro: ultimo + 1,
        importeTotal: 1,
        docTipo: DocTipo.CONSUMIDOR_FINAL,
        docNro: 0,
        fecha: '20260101',
      });
      expect(r).toEqual({ estado: 'no_emitido' });
    });
  },
);
