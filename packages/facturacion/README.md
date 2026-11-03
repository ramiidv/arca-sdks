# @ramiidv/arca-facturacion

[![CI](https://github.com/ramiidv/arca-sdks/actions/workflows/ci.yml/badge.svg)](https://github.com/ramiidv/arca-sdks/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@ramiidv/arca-facturacion)](https://www.npmjs.com/package/@ramiidv/arca-facturacion)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node >= 20.19](https://img.shields.io/badge/node-%3E%3D20.19-brightgreen)](https://nodejs.org)

SDK de TypeScript para la factura electrónica de **ARCA** (ex AFIP): WSFEv1 (mercado interno, CAE y CAEA) y WSFEX (exportación), con cálculo de IVA y totales, QR y emisión sin estados ambiguos.

- Todos los comprobantes de WSFEv1 (A, B, C, M, FCE MiPyME, RG 1415, liquidaciones) y de WSFEX (Factura, NC y ND E).
- API simplificada (`facturar`, `notaCredito`, `facturarExpo`...) que calcula IVA, totales, número y fecha, y API raw con los campos de ARCA.
- Validación local de las reglas del [manual de WSFEv1 v4.7](https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf) y del manual de WSFEX: los errores llegan con el código de la validación (ej: `10163`) antes de tocar la red.
- Las emisiones nunca se reintentan; un resultado desconocido lanza un error específico con lo necesario para recuperarlo.

## Instalación

```bash
npm install @ramiidv/arca-facturacion
```

## Requisitos

- Node >= 20.19. Solo ESM; desde CommonJS se carga con `require()` (Node ≥ 20.19 permite cargar módulos ESM con `require()`).
- Certificado digital de ARCA asociado a los servicios `wsfe` (y `wsfex` para exportación):
  - Homologación: [WSASS](https://wsass-homo.afip.gob.ar/wsass/portal/main.aspx).
  - Producción: [Administración de Certificados Digitales](https://www.afip.gob.ar/ws/documentacion/certificados.asp) (con clave fiscal).

Pasos previos (detalle del certificado en [`@ramiidv/arca-common`](https://github.com/ramiidv/arca-sdks/tree/main/packages/common#primeros-pasos)):

1. Generá el certificado con la clave privada y asocialo al servicio `wsfe` (y `wsfex`) en "Administrador de Relaciones de Clave Fiscal". En homologación, todo se hace en WSASS.
2. Dá de alta un punto de venta en "Administración de puntos de venta y domicilios": "RECE para aplicativo y web services" para WSFEv1, "Comprobantes de Exportación - Web Services" para WSFEX.

Glosario:

- **CAE**: código de autorización que ARCA devuelve por cada comprobante emitido. **CAEA**: código anticipado por quincena, para contingencias; los comprobantes se informan después.
- **Punto de venta**: número que identifica dónde se emite; la numeración es por punto de venta y tipo de comprobante.
- **Homologación / producción**: entorno de prueba (sin validez fiscal, otro certificado) y entorno real.
- **Clase A, B, C**: A de un responsable inscripto (RI) a otro RI o a un monotributista (discrimina IVA), B de un RI a consumidor final, exento o no categorizado, C la emite un monotributista o exento (sin IVA).
- **FCE MiPyME**: Factura de Crédito Electrónica (tipos 201-213), obligatoria para MiPyMEs que venden a grandes empresas por encima del monto mínimo.

## Inicio rápido

```ts
import { readFileSync } from 'node:fs';
import { ArcaFacturacion, CbteTipo, FileTicketStorage, IvaTipo } from '@ramiidv/arca-facturacion';

const arca = new ArcaFacturacion({
  cuit: 20123456786,
  cert: readFileSync('./certs/certificado.crt', 'utf-8'),
  key: readFileSync('./certs/clave.key', 'utf-8'),
  production: false, // homologación
  ticketStorage: new FileTicketStorage('./.arca-tickets'), // recomendado: ver "Configuración"
});

// Factura B a consumidor final
const result = await arca.facturar({
  ptoVta: 1,
  cbteTipo: CbteTipo.FACTURA_B,
  items: [
    { neto: 1000, iva: IvaTipo.IVA_21 },
    { neto: 500, iva: IvaTipo.IVA_10_5 },
  ],
});

if (result.aprobada) {
  console.log(result.cae, result.caeVencimiento, result.cbteNro);
  console.log(result.importes.total); // 1762.5
  console.log(arca.urlQR(result)); // URL del QR para el comprobante impreso
} else {
  console.error(result.observaciones);
}
```

El SDK completa el número (último autorizado + 1), la fecha (hora de Argentina, con el reloj de ARCA), el concepto, la moneda (`PES`) y, para consumidor final sin identificar (`docTipo` 99), `CondicionIVAReceptorId = 5`. Agrupa el IVA por alícuota y calcula todo en centavos: la suma de bases, IVA, exento, no gravado y tributos es exactamente el total.

> **Condición frente al IVA del receptor.** Es obligatoria por la RG 5616 (validación 10246). Si el
> receptor está identificado (`docTipo` distinto de 99), `condicionIva` es obligatoria: el SDK no la
> infiere porque un CUIT puede ser RI, monotributista o exento. Se puede obtener del padrón con
> `condicionIvaDesdePadron` de [`@ramiidv/arca-padron`](https://github.com/ramiidv/arca-sdks/tree/main/packages/padron).

## Configuración

`ArcaConfig` extiende `ArcaSdkConfig` de `@ramiidv/arca-common`.

| Parámetro                  | Tipo                            | Default            | Descripción                                                                                          |
| -------------------------- | ------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------- |
| `cuit`                     | `number \| string`              | —                  | CUIT representada (con o sin guiones; se valida el dígito verificador)                               |
| `cert`                     | `string`                        | —                  | Certificado X.509 (PEM)                                                                              |
| `key`                      | `string`                        | —                  | Clave privada (PEM, PKCS#1 o PKCS#8)                                                                 |
| `keyPassphrase`            | `string`                        | —                  | Contraseña de la clave, si está encriptada                                                           |
| `production`               | `boolean`                       | `false`            | `true` para producción                                                                               |
| `ticketStorage`            | `TicketStorage`                 | —                  | Persistencia del Ticket de Acceso entre reinicios (recomendado)                                      |
| `wsaa`                     | `WsaaClient`                    | —                  | Cliente WSAA compartido con otros SDKs del mismo certificado (ej: `padron.wsaa`)                     |
| `signal`                   | `AbortSignal`                   | —                  | Cancela todas las llamadas de la instancia (ej: al apagar la app)                                    |
| `timeout`                  | `number`                        | `30000`            | Timeout HTTP en ms                                                                                   |
| `retries`                  | `number`                        | `1`                | Reintentos de las consultas ante errores transitorios. Las emisiones nunca se reintentan             |
| `retryDelayMs`             | `number`                        | `1000`             | Delay base del backoff exponencial                                                                   |
| `tokenTTLMinutes`          | `number`                        | `720`              | Vigencia del pedido de ticket (TRA) enviado a WSAA                                                   |
| `clockOffsetMs`            | `number`                        | `0`                | Desfase `relojARCA - relojLocal` en ms                                                               |
| `autoClockSkew`            | `boolean`                       | `true`             | Corrige el desfase si WSAA rechaza el login por el reloj                                             |
| `loginErrorCooldownMs`     | `number`                        | `60000`            | Espera tras un login WSAA fallido                                                                    |
| `permanentErrorCooldownMs` | `number`                        | `Infinity`         | Espera tras un error de WSAA no reintentable (certificado, servicio no autorizado); `0` la desactiva |
| `paramCacheTTLMs`          | `number`                        | `86400000`         | TTL del cache de tablas de parámetros (0 lo desactiva). Puntos de venta y cotizaciones no se cachean |
| `endpoints`                | `{ wsaa?, wsfe?, wsfex? }`      | —                  | URLs propias (proxy, mock)                                                                           |
| `legacyTls`                | `'auto' \| 'never' \| 'always'` | `'auto'`           | Transporte TLS para los hosts de producción con DH de 1024 bits (ver [Entornos](#entornos))          |
| `fetch`                    | `typeof fetch`                  | `globalThis.fetch` | `fetch` propio (proxy, mTLS, tests)                                                                  |
| `onEvent`                  | `(e: ArcaEvent) => void`        | —                  | Callback de eventos (ver [Eventos](#eventos))                                                        |

Con `wsaa` compartido se ignoran `cert`, `key`, `keyPassphrase`, `ticketStorage`, `tokenTTLMinutes`,
`clockOffsetMs`, `autoClockSkew`, `loginErrorCooldownMs`, `permanentErrorCooldownMs` y `endpoints.wsaa`:
valen los del cliente compartido.

> **Persistí el Ticket de Acceso.** WSAA rechaza el login si ya existe un ticket vigente para el
> certificado y el servicio. Sin `ticketStorage`, cada reinicio del proceso deja la instancia sin
> poder facturar hasta que venza el ticket anterior (hasta 12 horas, `ArcaTicketVigenteError`).
> Usá `FileTicketStorage` o implementá `TicketStorage` sobre tu base de datos (ver `@ramiidv/arca-common`).

## API

Todos los métodos aceptan como último parámetro opcional `{ signal }`, que se combina con el
`signal` de la config. Los nombres son camelCase: en la API raw y en `raw` los campos son los de
ARCA (`CbteFch` → `cbteFch`, `ImpIVA` → `impIva`, `Fecha_cbte` → `fechaCbte`) y las listas son
arrays sin el contenedor del XML (`resultGet.iva` en lugar de `ResultGet.Iva.AlicIva`).

### Facturación (WSFEv1)

| Método                                            | Descripción                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `facturar(opts)`                                  | Emite un comprobante calculando IVA y totales                                               |
| `notaCredito(opts)` / `notaDebito(opts)`          | NC/ND asociada a `comprobanteOriginal` (el tipo se infiere: `FACTURA_B` → `NOTA_CREDITO_B`) |
| `armarComprobante(opts)`                          | Valida y arma el detalle sin enviarlo: `request`, `importes` e `intento`                    |
| `recuperarComprobante(intento)`                   | Resuelve un resultado incierto: `autorizado`, `no_emitido` o `conflicto`                    |
| `urlQR(factura, datos?, options?)`                | URL del QR de un comprobante emitido, con el CUIT de la instancia                           |
| `crearFactura(request)`                           | API raw: `FECAESolicitar` con uno o más comprobantes                                        |
| `crearFacturaAuto(ptoVta, cbteTipo, invoice)`     | API raw con el número calculado                                                             |
| `ultimoComprobante(ptoVta, cbteTipo)`             | Último número autorizado (`siguienteComprobante`: + 1)                                      |
| `consultarComprobante(cbteTipo, ptoVta, cbteNro)` | Consulta un comprobante (`FECompConsultar`)                                                 |

`FacturaResult`: `aprobada`, `cae?`, `caeVencimiento?`, `cbteNro`, `ptoVta`, `cbteTipo`, `importes`
(`total`, `neto`, `iva`, `exento`, `noGravado`, `tributos`, `descuento?`), `observaciones`,
`eventos`, `fecha?`, `docTipo?`, `docNro?`, `moneda?`, `cotizacion?`, `tipoCodAut?` y `raw`.

#### Opciones de `facturar`

| Opción                      | Descripción                                                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `ptoVta`, `cbteTipo`        | Punto de venta y tipo (`CbteTipo`)                                                                                      |
| `items`                     | Cada item con `neto` (sin IVA) **o** `total` (IVA incluido), y `iva` (`IvaTipo`), `exento: true` o ninguno (no gravado) |
| `cbteNro`                   | Número a usar. Sin él: último + 1, **sin lock** (serializá por punto de venta y tipo)                                   |
| `fecha`                     | `Date`, `YYYYMMDD` o `YYYY-MM-DD`. Default: hoy en Argentina según el reloj de ARCA                                     |
| `docTipo`, `docNro`         | Receptor. Default: 99 / 0 (consumidor final sin identificar)                                                            |
| `condicionIva`              | Condición frente al IVA del receptor (`CondicionIva`). Obligatoria con `docTipo` distinto de 99                         |
| `concepto`                  | 1 productos, 2 servicios, 3 ambos. Default: 2 si hay `servicio`, si no 1                                                |
| `servicio`                  | `{ desde, hasta, vtoPago? }`: período facturado (concepto 2 y 3)                                                        |
| `vtoPago`                   | Vencimiento del pago (`FchVtoPago`). Obligatorio en servicios (aquí o en `servicio.vtoPago`) y en facturas FCE          |
| `moneda`, `cotizacion`      | Default `PES` / 1. En moneda extranjera la cotización es obligatoria, salvo `canMisMonExt: 'S'`                         |
| `canMisMonExt`              | `'S'` si se cancela en la misma moneda extranjera                                                                       |
| `descuentoGlobal`           | Monto final (IVA incluido) que se prorratea entre alícuotas, exento y no gravado                                        |
| `tributos`                  | `{ id, desc?, baseImp, alic, importe }[]` (`TributoTipo`)                                                               |
| `cbtesAsoc`, `periodoAsoc`  | Comprobantes o período asociados (NC/ND)                                                                                |
| `opcionales`, `actividades` | Datos opcionales (`getTiposOpcional`) y actividades (`getActividades`)                                                  |
| `compradores`               | `{ docTipo, docNro, porcentaje }[]` para comprobantes con varios receptores                                             |

#### Ejemplos de `facturar`

```ts
import { ArcaFacturacion, CbteTipo, CondicionIva, DocTipo, IvaTipo, Moneda } from '@ramiidv/arca-facturacion';

declare const arca: ArcaFacturacion;

// Factura A de servicios: el concepto pasa a 2 al informar `servicio`
await arca.facturar({
  ptoVta: 1,
  cbteTipo: CbteTipo.FACTURA_A,
  docTipo: DocTipo.CUIT,
  docNro: 30712345671,
  condicionIva: CondicionIva.RESPONSABLE_INSCRIPTO,
  items: [{ neto: 50000, iva: IvaTipo.IVA_21 }],
  servicio: { desde: '2026-10-01', hasta: '2026-10-31', vtoPago: '2026-11-15' },
});

// Varias alícuotas, exento y no gravado
const r = await arca.facturar({
  ptoVta: 1,
  cbteTipo: CbteTipo.FACTURA_B,
  items: [
    { neto: 1000, iva: IvaTipo.IVA_21 },
    { neto: 500, iva: IvaTipo.IVA_10_5 },
    { neto: 300, exento: true }, // ImpOpEx
    { neto: 150 }, // no gravado (ImpTotConc)
  ],
});
// r.importes: { neto: 1500, iva: 262.5, exento: 300, noGravado: 150, tributos: 0, total: 2212.5 }

// Precios finales (IVA incluido) con descuento global, típico de un punto de venta
await arca.facturar({
  ptoVta: 1,
  cbteTipo: CbteTipo.FACTURA_B,
  items: [
    { total: 4500, iva: IvaTipo.IVA_21 },
    { total: 300, exento: true },
  ],
  descuentoGlobal: 480,
});

// Monotributista: clase C, sin discriminar IVA (todo va a importes.neto)
await arca.facturar({ ptoVta: 2, cbteTipo: CbteTipo.FACTURA_C, items: [{ neto: 5000 }] });

// Moneda extranjera
const { monCotiz } = await arca.getCotizacion(Moneda.DOLARES);
await arca.facturar({
  ptoVta: 1,
  cbteTipo: CbteTipo.FACTURA_A,
  docTipo: DocTipo.CUIT,
  docNro: 30712345671,
  condicionIva: CondicionIva.RESPONSABLE_INSCRIPTO,
  items: [{ neto: 1000, iva: IvaTipo.IVA_21 }],
  moneda: Moneda.DOLARES,
  cotizacion: monCotiz,
});
```

#### Notas de crédito y débito

```ts
import { ArcaFacturacion, CbteTipo, IvaTipo } from '@ramiidv/arca-facturacion';

declare const arca: ArcaFacturacion;

await arca.notaCredito({
  ptoVta: 1,
  comprobanteOriginal: { tipo: CbteTipo.FACTURA_B, ptoVta: 1, nro: 150 },
  items: [{ neto: 100, iva: IvaTipo.IVA_21 }],
});

// NC/ND que refiere a un período en lugar de a comprobantes (no FCE)
await arca.facturar({
  ptoVta: 1,
  cbteTipo: CbteTipo.NOTA_CREDITO_B,
  items: [{ total: 121, iva: IvaTipo.IVA_21 }],
  periodoAsoc: { desde: '20261001', hasta: '20261031' },
});
```

Una NC/ND necesita `cbtesAsoc` o `periodoAsoc` (validación 10197). Las de exportación (clase E)
se emiten con `facturarExpo`.

#### Factura de Crédito Electrónica MiPyME (FCE)

```ts
import { ArcaFacturacion, CbteTipo, CondicionIva, DocTipo, IvaTipo } from '@ramiidv/arca-facturacion';

declare const arca: ArcaFacturacion;

// Factura FCE de productos (concepto 1): vtoPago es obligatorio igual (validación 10163)
await arca.facturar({
  ptoVta: 1,
  cbteTipo: CbteTipo.FCE_FACTURA_A,
  docTipo: DocTipo.CUIT,
  docNro: 30712345671,
  condicionIva: CondicionIva.RESPONSABLE_INSCRIPTO,
  items: [{ neto: 100000, iva: IvaTipo.IVA_21 }],
  vtoPago: '2026-12-15',
  opcionales: [
    { id: '2101', valor: '0110599500000041817221' }, // CBU del emisor
    { id: '27', valor: 'SCA' }, // transferencia: SCA (circulación abierta) o ADC (agente de depósito colectivo)
  ],
});

// NC FCE: el asociado lleva CUIT del emisor y fecha; opcional 22 = anulación S/N
await arca.notaCredito({
  ptoVta: 1,
  docTipo: DocTipo.CUIT,
  docNro: 30712345671,
  condicionIva: CondicionIva.RESPONSABLE_INSCRIPTO,
  items: [{ neto: 100000, iva: IvaTipo.IVA_21 }],
  opcionales: [{ id: '22', valor: 'N' }],
  comprobanteOriginal: { tipo: CbteTipo.FCE_FACTURA_A, ptoVta: 1, nro: 15, cuit: 20123456786, fecha: '20261020' },
});
```

En las NC/ND FCE de productos, `vtoPago` solo se admite si son de anulación (opcional 22 = `S`,
validación 10175).

#### Reglas del manual que se validan antes de enviar

| Regla                                                                                                          | Validación          |
| -------------------------------------------------------------------------------------------------------------- | ------------------- |
| Clase A y M (1-5, 34, 39, 51-54, 60, 63, 201-203): receptor con CUIT y condición RI o monotributo              | 10013, 10243        |
| Servicios (concepto 2 y 3): `servicio.desde`/`hasta` y vencimiento de pago                                     | 10032, 10049        |
| Facturas FCE (201, 206, 211): `vtoPago` obligatorio con cualquier concepto                                     | 10163               |
| Facturas FCE: opcionales 2101 (CBU) y 27 (`SCA` o `ADC`) obligatorios; sin 22                                 | 10168, 10216, 10171 |
| NC/ND FCE: opcional 22 (anulación `S` o `N`) obligatorio; sin 2101, 2102 ni 27                                 | 10173, 10167, 10172 |
| FCE: 2101 de 22 dígitos; 2102 (alias) de 6 a 20 caracteres; 27 `SCA` o `ADC`                                   | 10165, 10166, 10215 |
| Fuera de FCE: sin opcionales 2101, 2102, 22 ni 27                                                              | 10169               |
| NC/ND FCE de productos: `vtoPago` solo si son de anulación                                                     | 10175               |
| FCE: receptor con CUIT; NC/ND FCE con `cbtesAsoc` y sin `periodoAsoc`                                          | 10176, 10153, 10196 |
| NC/ND: `cbtesAsoc` o `periodoAsoc`                                                                             | 10197               |
| Factura/NC/ND B al No Categorizado (23000000000) con importes gravados: tributo 13 (Percepción de IVA No Cat.) | 10067, 10283        |
| Moneda: `PES` con cotización 1; moneda extranjera con cotización, salvo `canMisMonExt: 'S'`                    | 10038, 10039, 10241 |
| Compradores: al menos 2, CUIT/CUIL/CDI, sin repetir, suman 100 y el receptor es el de mayor porcentaje         | 10136-10147         |
| API raw: `ImpTotal` = suma de importes; `ImpIVA` y `ImpTrib` = suma de sus arrays (margen del manual)          | 10048, 10023, 10029 |
| API raw: `CondicionIVAReceptorId` obligatorio, también con `DocTipo` 99                                        | 10246               |

En la API raw los importes se redondean a 2 decimales y `MonCotiz` a 6 (Double 13+2 y 4+6 del manual).

#### Elegir el tipo de comprobante

```ts
import { CondicionIva, resolverCbteTipo } from '@ramiidv/arca-facturacion';

resolverCbteTipo(CondicionIva.RESPONSABLE_INSCRIPTO, CondicionIva.CONSUMIDOR_FINAL); // FACTURA_B
resolverCbteTipo(CondicionIva.RESPONSABLE_INSCRIPTO, CondicionIva.MONOTRIBUTISTA); // FACTURA_A
resolverCbteTipo(CondicionIva.MONOTRIBUTISTA, CondicionIva.RESPONSABLE_INSCRIPTO); // FACTURA_C
resolverCbteTipo(CondicionIva.RESPONSABLE_INSCRIPTO, CondicionIva.RESPONSABLE_INSCRIPTO, 'nota_credito'); // NOTA_CREDITO_A
```

Según la RG 1415, la RG 5003/2021 y la tabla de condiciones por clase del manual. No cubre FCE, M ni E.

#### Armar sin enviar

```ts
import { CbteTipo, IvaTipo, armarComprobante, calcularTotales } from '@ramiidv/arca-facturacion';

const { importes, iva } = calcularTotales([{ neto: 1000, iva: IvaTipo.IVA_21 }]);
// importes: { total: 1210, neto: 1000, iva: 210, exento: 0, noGravado: 0, tributos: 0 }
// iva: [{ id: 5, baseImp: 1000, importe: 210 }]

// Detalle listo para FECAESolicitar e intento para recuperarComprobante, sin red
const { request, intento } = armarComprobante({
  ptoVta: 1,
  cbteTipo: CbteTipo.FACTURA_B,
  cbteNro: 151,
  items: [{ total: 1210, iva: IvaTipo.IVA_21 }],
});
```

### Exportación (WSFEX)

| Método                                                                                                                                                                                                                                                              | Descripción                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `facturarExpo(opts)`                                                                                                                                                                                                                                                | Factura, NC o ND E con `Id`, número y totales calculados |
| `crearFacturaExportacion(invoice)`                                                                                                                                                                                                                                  | API raw: `FEXAuthorize`                                  |
| `ultimoComprobanteExpo` / `siguienteComprobanteExpo` / `ultimoIdExpo` / `consultarComprobanteExpo`                                                                                                                                                                  | Numeración, último `Id` y consulta                       |
| `getTiposCbteExpo`, `getMonedasExpo`, `getMonedasConCotizacionExpo`, `getCotizacionExpo`, `getPaisesExpo`, `getCuitsPaisExpo`, `getIdiomasExpo`, `getIncotermsExpo`, `getUMedExpo`, `getTiposExpo`, `getPuntosVentaExpo`, `getOpcionalesExpo`, `getActividadesExpo` | Tablas de parámetros                                     |
| `checkPermisoExpo(idPermiso, dstMerc)`                                                                                                                                                                                                                              | Verifica un permiso de embarque (`FEXCheck_Permiso`)     |

```ts
import { ArcaFacturacion, CbteTipo, TipoExpo } from '@ramiidv/arca-facturacion';
import type { FacturarExpoOpts } from '@ramiidv/arca-facturacion';

declare const arca: ArcaFacturacion;

const opts: FacturarExpoOpts = {
  ptoVta: 3,
  cbteTipo: CbteTipo.FACTURA_E,
  tipoExpo: TipoExpo.BIENES,
  pais: 212, // getPaisesExpo()
  cliente: { nombre: 'ACME Corp', domicilio: '123 Main St, New York', idImpositivo: '12-3456789' },
  moneda: 'DOL',
  cotizacion: 1200,
  formaPago: 'Transferencia a 30 días',
  incoterms: 'FOB',
  idioma: 2, // 1 español, 2 inglés, 3 portugués
  items: [
    { codigo: 'SKU1', descripcion: 'Widget', cantidad: 100, unidad: 7, precioUnitario: 10 },
    // Unidad 99 (bonificación): sin cantidad ni precio, total negativo (validaciones 1775, 1810)
    { codigo: 'BON', descripcion: 'Bonificación', cantidad: 0, unidad: 99, precioUnitario: 0, total: -50 },
  ],
};
const res = await arca.facturarExpo(opts); // Imp_total: 950
```

Reglas de WSFEX que aplica el SDK:

- Cliente: `cuitPais` (ver `getCuitsPaisExpo`), `idImpositivo` o los dos (validación 1580). Sin
  `cuitPais` se envía `Cuit_pais_cliente` 0 (el WSDL lo declara obligatorio).
- `formaPago` es obligatoria solo en la Factura E (19) (validación 1620).
- `incoterms` es obligatorio en la Factura E (19) de bienes (`tipoExpo` 1); en el resto es opcional
  (validación 1640, ver `getIncotermsExpo`). `incotermsDes` requiere `incoterms` (1641).
- `Permiso_existente`: `S`/`N` solo en Factura E de bienes (default `N`); vacío en NC/ND y en
  servicios (validación 1720). Con `S`, los `permisos` son obligatorios.
- `Fecha_pago`: solo en Factura E; para servicios y otros, si no se indica, se usa la fecha del
  comprobante (1672, 1673).
- Items con unidad 0, 97 (anticipos/señas) y 99 (bonificaciones): `cantidad`, `precioUnitario` y
  `bonificacion` en 0 y `total` explícito; con 99 tiene que ser negativo (1775, 1810).
- El `Id` es **único por CUIT** (manual WSFEX, "Manejo transaccional"). Sin `id`, el SDK usa el
  último + 1 sin lock: serializá todas las emisiones de exportación de la CUIT. Si dos emisiones usan
  el mismo `Id`, WSFEX devuelve la respuesta de la primera y el SDK lanza `ArcaConflictoExpo`.

### CAEA (contingencia)

Desde la RG 5782 el CAEA es solo para contingencias, y cada comprobante se informa con la fecha y
hora en que se generó (`CbteFchHsGen`, obligatorio: validación 1440).

| Método                                                 | Descripción                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------ |
| `solicitarCAEA(periodo, orden)` / `consultarCAEA(...)` | CAEA de una quincena (`periodo` `YYYYMM`, `orden` 1 o 2)                 |
| `registrarFacturaCAEA(caea, opts)`                     | Informa un comprobante (como `facturar` más `fechaHoraGeneracion`)       |
| `registrarCAEA(request)`                               | API raw: cada comprobante con `caea` y `cbteFchHsGen` (`yyyymmddhhmmss`) |
| `sinMovimientoCAEA(caea, ptoVta)`                      | Informa un punto de venta sin movimientos                                |
| `consultarSinMovimientoCAEA(caea, ptoVta)`             | Consulta esos informes                                                   |

```ts
import { ArcaFacturacion, CbteTipo, IvaTipo } from '@ramiidv/arca-facturacion';

declare const arca: ArcaFacturacion;

const caea = await arca.solicitarCAEA('202611', 1);
const informado = await arca.registrarFacturaCAEA(caea.caea, {
  ptoVta: 5,
  cbteTipo: CbteTipo.FACTURA_B,
  cbteNro: 120, // el número usado al emitirlo
  fechaHoraGeneracion: new Date('2026-11-03T14:32:10-03:00'), // fecha del comprobante: la de generación
  items: [{ neto: 100, iva: IvaTipo.IVA_21 }],
});
console.log(informado.aprobada, informado.tipoCodAut); // true 'A'
```

### Parámetros y estado

| Método                                                                                                                                                                 | Descripción                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `status()`                                                                                                                                                             | Estado de WSFEv1 y WSFEX (`{ wsfe, wsfex }`, `ServiceStatus`)                                                                 |
| `getTiposComprobante`, `getTiposConcepto`, `getTiposDocumento`, `getTiposIva`, `getMonedas`, `getTiposTributo`, `getTiposOpcional`, `getActividades`, `getTiposPaises` | Tablas de parámetros (cacheadas; las consultas simultáneas comparten un request)                                              |
| `getCondicionesIva({ claseCmp? })`                                                                                                                                     | Condiciones frente al IVA del receptor por clase                                                                              |
| `getPuntosVenta()`                                                                                                                                                     | Puntos de venta (no se cachea)                                                                                                |
| `getCotizacion(monedaId, { fecha? })`                                                                                                                                  | Cotización oficial: `{ monId, monCotiz, fchCotiz }` (no se cachea)                                                            |
| `getCantMaxRegistros()`                                                                                                                                                | Máximo de comprobantes por request                                                                                            |
| `clearParamCache()`                                                                                                                                                    | Vacía el cache de parámetros                                                                                                  |
| `clearAuthCache()`                                                                                                                                                     | Borra los tickets (memoria y storage); async (`Promise<void>`). Ver la advertencia en [Manejo de errores](#manejo-de-errores) |

### QR

```ts
import { ArcaFacturacion, CbteTipo, DocTipo, generarUrlQR } from '@ramiidv/arca-facturacion';
import type { FacturaResult } from '@ramiidv/arca-facturacion';

declare const arca: ArcaFacturacion;
declare const factura: FacturaResult;

arca.urlQR(factura); // desde el resultado de facturar, notaCredito, registrarFacturaCAEA o recuperarComprobante

generarUrlQR({
  fecha: '20261030',
  cuit: 20123456786,
  ptoVta: 1,
  tipoCmp: CbteTipo.FACTURA_B,
  nroCmp: 150,
  importe: 121,
  moneda: 'PES',
  ctz: 1,
  tipoDocRec: DocTipo.CONSUMIDOR_FINAL,
  nroDocRec: 0,
  codAut: '73429843294823',
}); // "https://www.arca.gob.ar/fe/qr/?p=..."
```

Según la [especificación del QR](https://www.arca.gob.ar/fe/qr/documentos/QRespecificaciones.pdf):
importe a 2 decimales, `ctz` a 6, punto de venta de hasta 5 dígitos y número de hasta 8.
`ArcaFacturacion.generateQRUrl` es la misma función. Con moneda extranjera y `canMisMonExt: 'S'` sin
cotización enviada, pasá `datos.ctz` a `urlQR`.

### Funciones y constantes

- Funciones sin red: `armarComprobante`, `calcularTotales`, `resolverCbteTipo`, `requiereRecuperacion`,
  `intentoDesdeComprobante`, `coincideConIntento`, `facturaResultDesdeConsulta`, `generarUrlQR`,
  `urlQRDesdeFactura`, `formatFechaHora`.
- Enums: `CbteTipo`, `Concepto`, `DocTipo`, `CondicionIva`, `IvaTipo` (`IVA_RATES`), `Moneda`,
  `TributoTipo`, `TipoExpo`; `NOTA_CREDITO_MAP` y `NOTA_DEBITO_MAP`.
- Códigos: `WSFE_ERRORES_INTERNOS`, `WSFEX_ERRORES_INTERNOS`, `WSFE_ERRORES_AUTH`,
  `WSFEX_ERRORES_AUTH`, `WSFE_NUMERO_NO_CORRESPONDE` (10016), `WSFE_CAEA_NUMERO_NO_CORRESPONDE` (703).
- Clientes de bajo nivel: `WsfeClient`, `WsfexClient`, `WsaaClient`.

`Moneda` tiene los códigos más usados (la tabla completa sale de `getMonedas()`): `PES`, `DOL`,
`060` euro, `012` real, `011` peso uruguayo, `033` peso chileno, `029` guaraní, `031` peso
boliviano, `032` peso colombiano, `010` peso mexicano, `021` libra, `019` yen, `009` franco suizo,
`018` dólar canadiense, `064` yuan.

## Manejo de errores

| Clase                       | `code`                         | Cuándo                                                                                                                                             |
| --------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ArcaValidationError`       | `ARCA_VALIDATION_ERROR`        | Datos inválidos (no se envió nada). `field`, `details`; el mensaje cita la validación del manual                                                   |
| `ArcaWSFEError`             | `ARCA_WSFE_ERROR`              | ARCA rechazó el request (`Errors`/`FEXErr`): no se emitió. `errors: { code, msg }[]`, `tieneCodigo(code)`. Extiende `ArcaServiceError`             |
| `ArcaResultadoIncierto`     | `ARCA_RESULTADO_INCIERTO`      | Emisión WSFEv1 sin respuesta confiable (timeout, red, HTTP 5xx, error interno 500/501/502, respuesta ilegible). `intento`, `intentos`, `operacion` |
| `ArcaResultadoInciertoExpo` | `ARCA_RESULTADO_INCIERTO_EXPO` | Lo mismo en `FEXAuthorize` (y errores 500/501/502/505). `intento` (`id`, `cbteNro`, `fecha`) y `request` para reenviar con el mismo `Id`           |
| `ArcaConflictoExpo`         | `ARCA_CONFLICTO_EXPO`          | El `Id` de WSFEX ya lo usaba otra solicitud: WSFEX devolvió otro comprobante. El del request **no** se autorizó. `id`, `request`, `respuesta`      |
| `ArcaAuthError`             | `ARCA_AUTH_ERROR`              | Login WSAA fallido, o ARCA rechazó el ticket (WSFEv1 600/601, WSFEX 1000/1001). `faultCode`, `retryable`, `cause`                                  |
| `ArcaTicketVigenteError`    | `ARCA_TICKET_VIGENTE`          | WSAA ya emitió un ticket vigente que no está en memoria ni en el storage                                                                           |
| `ArcaSoapError`             | `ARCA_SOAP_ERROR`              | HTTP, timeout o SOAP Fault. `statusCode`, `faultCode`, `faultString`, `uncertain`, `aborted`                                                       |
| `ArcaResponseError`         | `ARCA_RESPONSE_ERROR`          | ARCA respondió con una forma inesperada (falta un campo obligatorio). `uncertain`                                                                  |
| `ArcaError`                 | `ARCA_ERROR`                   | Base de todos                                                                                                                                      |

`instanceof` funciona aunque haya más de una copia del paquete cargada; `code` sirve para comparar sin `instanceof`.

Ante un `ArcaAuthError` de los códigos 600/601 (CUIT no relacionada con el certificado, servicio no
autorizado) el SDK **no borra el ticket**: WSAA no emite otro mientras el actual siga vigente, y el
mismo ticket puede servir para otras CUITs. Corregí la relación en ARCA. `clearAuthCache()` es solo
para un ticket dañado (ej: cambiaste de certificado).

### Emisiones: rechazado, aprobado o incierto

Las emisiones (`FECAESolicitar`, `FECAEARegInformativo`, `FECAEASinMovimientoInformar`,
`FEXAuthorize`) **nunca se reintentan**. Cada una termina de una de tres formas:

| Resultado     | Qué devuelve o lanza el SDK                                          | ¿Se emitió?             |
| ------------- | -------------------------------------------------------------------- | ----------------------- |
| ARCA autorizó | `aprobada: true` con `cae`                                           | Sí                      |
| ARCA rechazó  | `aprobada: false` (observaciones), `ArcaWSFEError` o `ArcaAuthError` | No (ver 10016 y 703)    |
| No se sabe    | `ArcaResultadoIncierto` / `ArcaResultadoInciertoExpo`                | **Hay que averiguarlo** |

Para WSFEv1, `recuperarComprobante(intento)` consulta ARCA y devuelve:

- `{ estado: 'autorizado', resultado }`: se autorizó; `resultado` tiene el CAE.
- `{ estado: 'no_emitido' }`: no existe; reintentar **con el mismo `cbteNro`** es seguro (si el
  intento original se autorizara después, ARCA rechaza el duplicado).
- `{ estado: 'conflicto', encontrado }`: el número existe con otros datos (lo usó otra emisión).

Un rechazo por número ya usado también puede esconder un intento anterior autorizado:
`requiereRecuperacion(resultadoOError)` devuelve `true` para la validación 10016 por número (no
por fecha) en `FECAESolicitar` y para la 703 en `FECAEARegInformativo`.

```ts
import {
  ArcaFacturacion,
  ArcaResultadoIncierto,
  ArcaWSFEError,
  CbteTipo,
  IvaTipo,
  requiereRecuperacion,
} from '@ramiidv/arca-facturacion';
import type { FacturarOpts, IntentoComprobante } from '@ramiidv/arca-facturacion';

declare const arca: ArcaFacturacion;
declare function guardar(estado: string, datos?: unknown): Promise<void>;

async function emitir(ptoVta: number) {
  // 1. Fijar número y fecha, y guardar el intento ANTES de enviar.
  const cbteNro = await arca.siguienteComprobante(ptoVta, CbteTipo.FACTURA_B);
  const opts: FacturarOpts = {
    ptoVta,
    cbteTipo: CbteTipo.FACTURA_B,
    cbteNro,
    fecha: arca.wsaa.now(),
    items: [{ total: 1210, iva: IvaTipo.IVA_21 }],
  };
  const { intento } = arca.armarComprobante({ ...opts, cbteNro });
  // La fecha se guarda como YYYYMMDD (intento.fecha): un Date pasado por JSON no se puede reenviar.
  await guardar('enviando', { opts: { ...opts, fecha: intento.fecha }, intento });

  try {
    const res = await arca.facturar(opts);
    if (res.aprobada) return guardar('autorizado', res.cae);
    if (requiereRecuperacion(res)) return guardar('incierto');
    return guardar('rechazado', res.observaciones);
  } catch (e) {
    if (e instanceof ArcaResultadoIncierto) return guardar('incierto');
    if (e instanceof ArcaWSFEError) return guardar('rechazado', e.errors);
    throw e; // validación, auth o sin conexión: no se envió
  }
}

// Al arrancar y cada tanto: resolver los "enviando" (proceso caído) y los "incierto".
async function resolver(intento: IntentoComprobante) {
  const r = await arca.recuperarComprobante(intento);
  if (r.estado === 'autorizado') return guardar('autorizado', r.resultado.cae);
  if (r.estado === 'no_emitido') return guardar('reintentar'); // con el mismo cbteNro
  return guardar('conflicto', r.encontrado); // revisión manual
}
```

> Si la respuesta se perdió por timeout, esperá unos segundos antes de `recuperarComprobante`:
> ARCA puede seguir procesando el request original.

En **exportación** no hace falta consultar: se reenvía **la misma solicitud con el mismo `Id`**
(`facturarExpo({ ...opts, ...error.intento })` o `crearFacturaExportacion(error.request)`). Si ya
estaba autorizada, WSFEX devuelve el CAE original con `reproceso: true`, sin duplicar.

En `sinMovimientoCAEA`, un resultado incierto es un error con `uncertain: true` (`ArcaSoapError`
por red o error interno 500/501/502; `ArcaResponseError` si falta el `Resultado`): verificalo con
`consultarSinMovimientoCAEA` antes de volver a informar.

Abortar una emisión con el `signal` **después de enviada** también deja el resultado incierto;
abortar antes de enviar no envía nada.

## Eventos

```ts
import { ArcaFacturacion } from '@ramiidv/arca-facturacion';

declare const arca: ArcaFacturacion;

arca.on('request:end', (e) => {
  if (e.type === 'request:end') console.log(e.method, e.durationMs);
});
```

| Evento               | Cuándo                                   | Datos                                      |
| -------------------- | ---------------------------------------- | ------------------------------------------ |
| `auth:login`         | Nuevo ticket de WSAA                     | `service`, `durationMs`                    |
| `auth:cache-hit`     | Ticket reutilizado                       | `service`, `source` (`memory` / `storage`) |
| `auth:clock-skew`    | Se ajustó el desfase de reloj            | `service`, `offsetMs`, `previousOffsetMs`  |
| `auth:storage-error` | Falló el `ticketStorage` (no interrumpe) | `service`, `operation`, `error`            |
| `request:start`      | Antes de una llamada SOAP                | `method`, `endpoint`                       |
| `request:end`        | Llamada completada                       | `method`, `durationMs`                     |
| `request:retry`      | Reintento (solo consultas)               | `method`, `attempt`, `error`               |
| `request:error`      | Llamada fallida                          | `method`, `error`                          |

También se reciben con `onEvent` en la config. `off(event, handler)` desuscribe. Los errores de
los handlers se ignoran.

## Entornos

| Entorno      | WSAA                   | WSFEv1 y WSFEX           |
| ------------ | ---------------------- | ------------------------ |
| Homologación | `wsaahomo.afip.gov.ar` | `wswhomo.afip.gov.ar`    |
| Producción   | `wsaa.afip.gov.ar`     | `servicios1.afip.gov.ar` |

Se elige con `production` y se puede reemplazar con `endpoints`.

**TLS legacy.** La producción de WSFEv1 y WSFEX (`servicios1.afip.gov.ar`) negocia Diffie-Hellman
de 1024 bits, que Node rechaza (`ERR_SSL_DH_KEY_TOO_SMALL`). Con `legacyTls: 'auto'` (default) el
SDK repite ese handshake con el transporte legacy de `@ramiidv/arca-common` (`node:https` con
`SECLEVEL=1`; es seguro también en emisiones porque el request no llegó a enviarse) y recuerda el
host. `'always'` lo usa siempre y `'never'` nunca. Con un `fetch` propio no hay fallback.

## Ejemplos

Ejemplos completos en [`examples/`](https://github.com/ramiidv/arca-sdks/tree/main/packages/facturacion/examples):
factura B, factura de servicios, nota de crédito, exportación, CAEA, emisión segura, consultas y
manejo de errores.

## Licencia

MIT
