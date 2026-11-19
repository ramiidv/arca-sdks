/**
 * Cruces entre un responsable inscripto y un monotributista en ARCA homologación.
 *
 * Corren solo con los dos usuarios, uno de cada perfil: el de ARCA_TEST_* y el de
 * ARCA_TEST_CONTRAPARTE_* (mismas variables con ese prefijo: CERT, KEY, CUIT,
 * PERFIL, SERVICES y opcionalmente PTO_VTA y TICKETS_DIR). Ver "Desarrollo" en el
 * README raíz. Cada test necesita que los dos estén autorizados en sus servicios.
 */
import { CondicionIva } from '@ramiidv/arca-common';
import { describe, expect, it } from 'vitest';
import { ArcaCdc } from '../../packages/cdc/src/index.js';
import type { ConstatarInput } from '../../packages/cdc/src/index.js';
import { ArcaFacturacion, CbteTipo, DocTipo, IvaTipo } from '../../packages/facturacion/src/index.js';
import type { FacturaResult } from '../../packages/facturacion/src/index.js';
import type { Credenciales } from './env.js';
import { autorizado, configSdk, contraparte, principal } from './sdk.js';

const usuarios = [principal, contraparte];
const ri = usuarios.find((u) => u?.perfil === 'ri');
const mono = usuarios.find((u) => u?.perfil === 'monotributo');

const itCdc = it.skipIf(!autorizado('wsfe', ri, mono) || !autorizado('wscdc', ri, mono));
const itWsfex = it.skipIf(!autorizado('wsfex', ri, mono));

describe.skipIf(!ri || !mono)('cruces RI ↔ monotributista (homologación)', { timeout: 120_000 }, () => {
  const facturacion = (u: Credenciales) => new ArcaFacturacion(configSdk(u));
  const cdc = (u: Credenciales) => new ArcaCdc(configSdk(u));

  /** Datos para constatar `factura`, emitida por `emisor` a `receptor`. */
  const constatacion = (factura: FacturaResult, emisor: Credenciales, receptor: Credenciales): ConstatarInput => ({
    cbteModo: 'CAE',
    cuitEmisor: emisor.cuit,
    ptoVta: factura.ptoVta,
    cbteTipo: factura.cbteTipo,
    cbteNro: factura.cbteNro,
    cbteFch: factura.fecha!,
    impTotal: factura.importes.total,
    codAutorizacion: factura.cae,
    docTipoReceptor: DocTipo.CUIT,
    docNroReceptor: receptor.cuit,
  });

  let facturaA: FacturaResult | undefined;
  let facturaC: FacturaResult | undefined;

  /** La factura de un test anterior; si su emisión falló, este test falla con ese motivo. */
  const emitida = (factura: FacturaResult | undefined, cual: string): FacturaResult => {
    expect(factura, `no se emitió la ${cual} (falló el test que la emite)`).toBeDefined();
    return factura!;
  };

  itCdc('el RI le emite una Factura A al monotributista', async () => {
    facturaA = await facturacion(ri!).facturar({
      ptoVta: ri!.ptoVta,
      cbteTipo: CbteTipo.FACTURA_A,
      docTipo: DocTipo.CUIT,
      docNro: Number(mono!.cuit),
      condicionIva: CondicionIva.MONOTRIBUTISTA,
      items: [{ neto: 1000, iva: IvaTipo.IVA_21 }],
    });
    expect(facturaA?.cae).toMatch(/^\d{14}$/);
  });

  itCdc('el monotributista le emite una Factura C al RI', async () => {
    facturaC = await facturacion(mono!).facturar({
      ptoVta: mono!.ptoVta,
      cbteTipo: CbteTipo.FACTURA_C,
      docTipo: DocTipo.CUIT,
      docNro: Number(ri!.cuit),
      condicionIva: CondicionIva.RESPONSABLE_INSCRIPTO,
      items: [{ total: 1500 }],
    });
    expect(facturaC?.cae).toMatch(/^\d{14}$/);
  });

  itCdc('el RI constata la Factura C del monotributista', async () => {
    const r = await cdc(ri!).constatar(constatacion(emitida(facturaC, 'Factura C'), mono!, ri!));
    expect(r.resultado).toBe('A');
  });

  itCdc('el monotributista constata la Factura A del RI', async () => {
    const r = await cdc(mono!).constatar(constatacion(emitida(facturaA, 'Factura A'), ri!, mono!));
    expect(r.resultado).toBe('A');
  });

  itCdc('una constatación con otro importe total se rechaza (110)', async () => {
    const datos = constatacion(emitida(facturaC, 'Factura C'), mono!, ri!);
    const r = await cdc(ri!).constatar({ ...datos, impTotal: datos.impTotal + 1000 });
    expect(r.resultado).toBe('R');
    expect(r.observaciones.map((o) => o.code)).toContain(110);
  });

  itWsfex('WSFEX: el Id es por CUIT (el mismo Id se autoriza en las dos)', async () => {
    const lados = await Promise.all(
      [ri!, mono!].map(async (u) => {
        const sdk = facturacion(u);
        return { u, sdk, id: await sdk.ultimoIdExpo() };
      }),
    );
    const emitir = (lado: (typeof lados)[number], id: number) =>
      lado.sdk.facturarExpo({
        id,
        ptoVta: lado.u.ptoVta,
        cbteTipo: CbteTipo.FACTURA_E,
        tipoExpo: 2,
        pais: 212,
        cliente: { nombre: 'ACME Corp', cuitPais: 55000002126, domicilio: '123 Main St', idImpositivo: '12-3456789' },
        moneda: 'PES',
        cotizacion: 1,
        formaPago: 'Transferencia',
        idioma: 1,
        items: [{ codigo: 'S1', descripcion: 'Servicio', cantidad: 1, unidad: 7, precioUnitario: 100 }],
      });

    // `adelante` ya usó el Id que le toca a `atras` (si tenían el mismo, emite una primero).
    const [adelante, atras] = lados[0]!.id >= lados[1]!.id ? [lados[0]!, lados[1]!] : [lados[1]!, lados[0]!];
    if (adelante.id === atras.id) await emitir(adelante, adelante.id + 1);

    const id = atras.id + 1;
    const r = await emitir(atras, id);
    expect(r.id).toBe(id);
    expect(r.reproceso).toBe(false);
    expect(r.cae).toMatch(/^\d{14}$/);
  });
});
