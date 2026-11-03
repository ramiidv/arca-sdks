# @ramiidv/arca-mtxca

[![npm](https://img.shields.io/npm/v/@ramiidv/arca-mtxca)](https://www.npmjs.com/package/@ramiidv/arca-mtxca)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node >= 20.19](https://img.shields.io/badge/node-%3E%3D20.19-brightgreen)](https://nodejs.org)

SDK de TypeScript para el web service **WSMTXCA** de ARCA (ex AFIP): factura electrónica con detalle de ítems (código MTX/GTIN, cantidad, precio unitario e IVA por línea), con CAE y con CAEA.

- Tipos fieles al WSDL/XSD de WSMTXCA y elementos en el orden de la secuencia (Axis2 valida el orden).
- Redondeo según el manual (Round Half Even): 2 decimales en importes, 6 en cantidad, precio unitario, bonificación y cotización.
- Validación local de las reglas excluyentes del manual v0.25.8 (presencia de campos por unidad de medida, fórmulas por ítem, subtotales de IVA por alícuota, totales, FCE y sus datos adicionales, comprobantes asociados, compradores, Sujeto No Categorizado, condición de IVA del receptor).
- URL del código QR (RG 4892) con `urlQR()`.
- Las emisiones nunca se reintentan y los errores con resultado desconocido se marcan como `uncertain`.
- Los errores de negocio de ARCA (`arrayErrores`) se lanzan como `ArcaServiceError` en las consultas.
- Autenticación WSAA automática (via `@ramiidv/arca-common`), con `ticketStorage` persistente opcional.
- Solo ESM, `fetch` nativo.

Fuente: [Manual del desarrollador WSMTXCA v0.25.8](https://www.afip.gob.ar/fe/ayuda/documentos/wsmtxca-RG-2904.pdf) y el WSDL de producción.

## Instalación

```bash
npm install @ramiidv/arca-mtxca
```

## Requisitos

- Node.js >= 20.19. Solo ESM; desde CommonJS se carga con `require()` (Node ≥ 20.19 permite cargar módulos ESM con `require()`).
- Certificado digital de ARCA asociado al servicio `wsmtxca` y empadronamiento en "Codificación de Productos – Factura con Detalle".

Pasos previos (detalle del certificado en [`@ramiidv/arca-common`](https://github.com/ramiidv/arca-sdks/tree/main/packages/common#primeros-pasos)):

1. Generá el certificado con la clave privada y asocialo al servicio `wsmtxca` en "Administrador de Relaciones de Clave Fiscal". En homologación, todo se hace en [WSASS](https://wsass-homo.afip.gob.ar/wsass/portal/main.aspx).
2. Dá de alta un punto de venta del sistema "Codificación de Productos - Web Services" en "Administración de puntos de venta y domicilios" (para CAEA, uno "CAEA - Codificación de Productos").

Glosario:

- **CAE**: código de autorización que ARCA devuelve por cada comprobante. **CAEA**: código anticipado por quincena, para contingencias; los comprobantes se informan después.
- **Punto de venta**: número que identifica dónde se emite; la numeración es por punto de venta y tipo de comprobante.
- **Homologación / producción**: entorno de prueba (sin validez fiscal, otro certificado) y entorno real.
- **Clase A, B**: A de un responsable inscripto (RI) a otro RI o a un monotributista (IVA por ítem), B a consumidor final, exento o no categorizado (precio con IVA).
- **FCE MiPyME**: Factura de Crédito Electrónica (tipos 201-208 en WSMTXCA), obligatoria para MiPyMEs que venden a grandes empresas por encima del monto mínimo.
- **Código MTX**: código del producto (GTIN/EAN o propio) que identifica cada ítem.

## Inicio rápido

```typescript
import { readFileSync } from 'node:fs';
import { ArcaMtxca, CbteTipo, Concepto, CodigoCondicionIVA, Moneda } from '@ramiidv/arca-mtxca';
import type { AutorizarRequest } from '@ramiidv/arca-mtxca';

const mtxca = new ArcaMtxca({
  cert: readFileSync('./certs/certificado.crt', 'utf-8'),
  key: readFileSync('./certs/clave.key', 'utf-8'),
  cuit: '20-12345678-6',
  production: false, // homologación
});

// Factura A: 1 producto a $100 + IVA 21%
const comprobante: AutorizarRequest = {
  codigoTipoComprobante: CbteTipo.FACTURA_A,
  numeroPuntoVenta: 4000,
  // numeroComprobante: omitido => último autorizado + 1
  fechaEmision: new Date(),
  codigoTipoDocumento: 80,
  numeroDocumento: '30-00000000-7',
  condicionIVAReceptor: 1, // RG 5616 (obligatoria): ver getCondicionesIVAReceptor()
  importeGravado: 100,
  importeNoGravado: 0,
  importeExento: 0,
  importeSubtotal: 100,
  importeTotal: 121,
  codigoMoneda: Moneda.PESOS,
  cotizacionMoneda: 1,
  codigoConcepto: Concepto.PRODUCTOS,
  items: [
    {
      unidadesMtx: 1,
      codigoMtx: '7790001000012',
      codigo: 'P0001',
      descripcion: 'Producto de ejemplo',
      cantidad: 1,
      codigoUnidadMedida: 7,
      precioUnitario: 100, // clase A: sin IVA
      codigoCondicionIVA: CodigoCondicionIVA.IVA_21,
      importeIVA: 21,
      importeItem: 121, // con IVA incluido
    },
  ],
  subtotalesIVA: [{ codigo: CodigoCondicionIVA.IVA_21, importe: 21 }],
};
const res = await mtxca.autorizar(comprobante);

if (res.resultado === 'R') {
  console.error('Rechazado', res.errores);
} else {
  // 'A' aprobado, 'O' aprobado con observaciones
  console.log(res.comprobante.numeroComprobante, res.comprobante.cae, res.comprobante.fechaVencimientoCAE);
  if (res.observaciones.length) console.warn(res.observaciones);
  console.log(mtxca.urlQR(comprobante, res)); // URL del QR (RG 4892)
}
```

## Configuración

`ArcaMtxcaConfig` extiende `ArcaSdkConfig` de `@ramiidv/arca-common`:

| Opción                                                                                                                                    | Descripción                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cert`, `key`                                                                                                                             | Certificado y clave privada PEM.                                                                                                                                                                                                                             |
| `keyPassphrase`                                                                                                                           | Contraseña de la clave, si está encriptada.                                                                                                                                                                                                                  |
| `cuit`                                                                                                                                    | CUIT representada (número o string, con o sin guiones). Se valida el dígito verificador.                                                                                                                                                                     |
| `production`                                                                                                                              | `false` (default) = homologación.                                                                                                                                                                                                                            |
| `endpoints`                                                                                                                               | `{ mtxca?, wsaa? }`: URLs propias (proxy, mock). Ignoran `production`.                                                                                                                                                                                       |
| `wsaa`                                                                                                                                    | `WsaaClient` compartido con otros SDKs del mismo certificado. Con él se ignoran `cert`, `key`, `keyPassphrase`, `ticketStorage` y las opciones de WSAA.                                                                                                      |
| `signal`                                                                                                                                  | `AbortSignal` global: cancela todas las llamadas de la instancia.                                                                                                                                                                                            |
| `timeout`, `retries`, `retryDelayMs`                                                                                                      | Transporte. `retries` solo aplica a consultas.                                                                                                                                                                                                               |
| `ticketStorage`                                                                                                                           | Storage persistente de tickets WSAA (recomendado en producción).                                                                                                                                                                                             |
| `tokenTTLMinutes`, `clockOffsetMs`, `autoClockSkew`, `loginErrorCooldownMs`, `permanentErrorCooldownMs`, `alreadyAuthenticatedCooldownMs` | Opciones de WSAA. `permanentErrorCooldownMs` (default `Infinity`): espera tras un error no reintentable; `alreadyAuthenticatedCooldownMs` (default: 2 minutos en producción, 10 en homologación): espera tras `coe.alreadyAuthenticated`; `0` las desactiva. |
| `fetch`, `legacyTls`                                                                                                                      | `fetch` propio (proxy, tests) y transporte TLS legacy.                                                                                                                                                                                                       |
| `onEvent`                                                                                                                                 | Callback de eventos (`auth:*`, `request:*`).                                                                                                                                                                                                                 |
| `onEvento`                                                                                                                                | Recibe el `evento` (aviso de ARCA) de cualquier respuesta: `(evento, method) => void`.                                                                                                                                                                       |

Todos los métodos aceptan un último parámetro `opts?: CallOptions` con `signal` para cancelar.

## API

### Comprobantes con CAE

| Método                                                   | Operación WSMTXCA                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| `autorizar(req, opts?)`                                  | `autorizarComprobante` (número automático si se omite)             |
| `autorizarAjusteIVA(req, opts?)`                         | `autorizarAjusteIVA` (solo valida el XSD: tiene reglas propias)    |
| `ultimoComprobante(ptoVta, cbteTipo, opts?)`             | `consultarUltimoComprobanteAutorizado`                             |
| `siguienteComprobante(ptoVta, cbteTipo, opts?)`          | último + 1                                                         |
| `consultarComprobante(cbteTipo, ptoVta, cbteNro, opts?)` | `consultarComprobante` → `{ comprobante, observaciones, evento? }` |
| `urlQR(comprobante, resultado?, options?)`               | URL del código QR (RG 4892), sin request                           |

### Código QR (RG 4892)

`urlQR` arma la URL con `generarUrlQR` de `@ramiidv/arca-common` y la CUIT de la instancia. Toma tipo, punto de venta, número y CAE/CAEA de `resultado` (con CAE, también la fecha que asignó ARCA) y del comprobante `importeTotal`, `codigoMoneda`, `cotizacionMoneda` (1 si es `PES`), `codigoTipoDocumento` y `numeroDocumento`. Sin `resultado`, recibe el comprobante de `consultarComprobante()` (`codigoTipoAutorizacion` "E" = CAE, "A" = CAEA). También está como función: `urlQR(cuit, comprobante, resultado?, options?)`.

```typescript
const { comprobante } = await mtxca.consultarComprobante(CbteTipo.FACTURA_A, 4000, 25);
const url = mtxca.urlQR(comprobante); // https://www.arca.gob.ar/fe/qr/?p=...
```

Lanza `ArcaValidationError` si el comprobante fue rechazado o falta un dato (ej. la cotización de una moneda extranjera omitida por `cancelaEnMismaMonedaExtranjera`: en ese caso, usá el comprobante de `consultarComprobante()`).

### CAEA

| Método                                               | Operación WSMTXCA                                             |
| ---------------------------------------------------- | ------------------------------------------------------------- |
| `solicitarCAEA(periodo, orden, opts?)`               | `solicitarCAEA` (`periodo` AAAAMM, `orden` 1 o 2)             |
| `consultarCAEA(caea, opts?)`                         | `consultarCAEA`                                               |
| `consultarCAEAEntreFechas(desde, hasta, opts?)`      | `consultarCAEAEntreFechas`                                    |
| `informarComprobanteCAEA(comp, opts?)`               | `informarComprobanteCAEA` (`comp.caea` = CAEA usado)          |
| `informarAjusteIVACAEA(comp, opts?)`                 | `informarAjusteIVACAEA` (valida el XSD y `fechaHoraGen`, 754) |
| `informarCAEANoUtilizado(caea, opts?)`               | `informarCAEANoUtilizado`                                     |
| `informarCAEANoUtilizadoPtoVta(caea, ptoVta, opts?)` | `informarCAEANoUtilizadoPtoVta`                               |
| `consultarPtosVtaCAEANoInformados(caea, opts?)`      | `consultarPtosVtaCAEANoInformados`                            |

### Parámetros y estado

| Método                                                              | Operación                         | Devuelve                                                        |
| ------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------- |
| `status()`                                                          | `dummy` (sin auth)                | `{ appserver, dbserver, authserver }`                           |
| `getTiposComprobante()`                                             | `consultarTiposComprobante`       | `CodigoDescripcion[]`                                           |
| `getTiposDocumento()`                                               | `consultarTiposDocumento`         | `CodigoDescripcion[]`                                           |
| `getAlicuotasIVA()`                                                 | `consultarAlicuotasIVA`           | `CodigoDescripcion[]`                                           |
| `getCondicionesIVA()`                                               | `consultarCondicionesIVA`         | `CodigoDescripcion[]`                                           |
| `getCondicionesIVAReceptor(cbteTipo)`                               | `consultarCondicionesIVAReceptor` | `CodigoDescripcion[]`                                           |
| `getMonedas()`                                                      | `consultarMonedas`                | `{ codigo: string, descripcion }[]`                             |
| `getCotizacionMoneda(codigo, fecha?)`                               | `consultarCotizacionMoneda`       | `{ codigoMoneda, fechaCotizacion, cotizacion: number \| null }` |
| `getUnidadesMedida()`                                               | `consultarUnidadesMedida`         | `CodigoDescripcion[]`                                           |
| `getTiposTributo()`                                                 | `consultarTiposTributo`           | `CodigoDescripcion[]`                                           |
| `getTiposDatosAdicionales()`                                        | `consultarTiposDatosAdicionales`  | `CodigoDescripcion[]`                                           |
| `getActividadesVigentes()`                                          | `consultarActividadesVigentes`    | `{ codigo, orden, descripcion }[]`                              |
| `getPuntosVenta()` / `getPuntosVentaCAE()` / `getPuntosVentaCAEA()` | `consultarPuntosVenta*`           | `{ numeroPuntoVenta, bloqueado, fechaBaja? }[]`                 |

`getCotizacionMoneda` usa la fecha de hoy si no se indica; `cotizacion` es `null` cuando ARCA no tiene cotización (responde sin valor y sin error). `getCotizacionMoneda`, `solicitarCAEA` y `consultarCAEA` incluyen `evento?` en el resultado; para el resto, usá `onEvento` (ver [Eventos](#eventos)).

`clearAuthCache()` (async) descarta el ticket WSAA de `wsmtxca`.

### Cliente de bajo nivel

`mtxca.client` (`MtxcaClient`) expone una función por operación del WSDL (`autorizarComprobante`, `consultarCAEA`, ...) que recibe `MtxcaAuth` (`{ token, sign, cuitRepresentada }`) y `numeroComprobante` explícito. Valida contra el XSD (y el dígito verificador de los CUIT) y redondea, pero no aplica las reglas de negocio del manual (para eso, `validateComprobanteCAE`/`validateComprobanteCAEA`). Se puede usar sin `ArcaMtxca`:

```typescript
import { MtxcaClient, MTXCA_ENDPOINTS } from '@ramiidv/arca-mtxca';
const client = new MtxcaClient({ endpoint: MTXCA_ENDPOINTS.testing });
await client.dummy();
```

### Reglas de importes

Los campos del request se llaman igual que en el XSD (`ComprobanteType`, `ItemType`). Lo más importante del manual:

- `importeItem` incluye el IVA. En clase A (1, 2, 3, 51, 52, 53) `precioUnitario` va **sin** IVA y el ítem lleva `importeIVA`; en clase B (6, 7, 8) `precioUnitario` va **con** IVA y el ítem no lleva `importeIVA`.
- `importeItem` = (`precioUnitario` × `cantidad` − `importeBonificacion`) × (1 + alícuota) en clase A; = `precioUnitario` × `cantidad` − `importeBonificacion` en clase B.
- Unidad 99 (bonificación) y 97 (seña): sin `cantidad`, `precioUnitario` ni `importeBonificacion`; la bonificación tiene `importeItem` negativo y requiere otro ítem con la misma condición de IVA. En clase A, `importeIVA` = `importeItem` − `importeItem` / (1 + alícuota).
- Fuera de 97/99, `unidadesMtx` y `codigoMtx` son obligatorios.
- `importeGravado` = Σ (`importeItem` − IVA) de los ítems con condición 3–6; `importeNoGravado` = Σ ítems condición 1; `importeExento` = Σ ítems condición 2; `importeSubtotal` = gravado + no gravado + exento.
- `subtotalesIVA`: uno por cada condición 4, 5 o 6 presente, con la suma del IVA de esos ítems.
- `importeTotal` = `importeSubtotal` + `importeOtrosTributos` + Σ subtotales de IVA = `importeOtrosTributos` + Σ `importeItem`.
- En una bonificación (99) de clase A, el IVA (en valor absoluto) no puede superar el IVA de los demás ítems de la misma condición (516).
- Margen de error del manual: error relativo ≤ 0,01% o absoluto ≤ 0,01 × cantidad de elementos.
- Redondeo: **Round Half Even** (mitad al par, nota 4 de "Aclaraciones y Definiciones" del manual) en todos los valores decimales: `8.565` → `8.56`, `8.575` → `8.58`, `1.005` → `1.00`. El SDK redondea así lo que envía (con `dec()` del DSL de common) y lo que valida; para calcular igual, usá `roundImporte()` (2 decimales) y `roundDecimal()` (6).

`autorizar()` valida todo esto antes de enviar y lanza `ArcaValidationError` con el detalle (incluye el código de error de ARCA que se evita y el valor esperado). Si ARCA acepta un caso que la validación local rechaza, pasá `{ validarImportes: false }`: a pesar del nombre, desactiva todas las reglas de negocio locales (las de esta sección y las de la tabla siguiente); solo quedan el XSD y el dígito verificador de los CUIT.

### Otras reglas del manual que se validan localmente

| Regla                                                                                                                                                                                                      | CAE (`autorizar`)       | CAEA (`informarComprobanteCAEA`) |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | -------------------------------- |
| `condicionIVAReceptor` (RG 5616) obligatoria. ARCA hoy la **observa**; el SDK la exige para no emitir sin ella                                                                                             | 190                     | 390                              |
| `fechaServicioDesde`/`Hasta` y `fechaVencimientoPago` solo con concepto 2 o 3 (fuera de FCE)                                                                                                               | 122-124                 | — (ARCA solo observa)            |
| FCE 201 y 206: `fechaVencimientoPago` obligatoria, cualquiera sea el concepto                                                                                                                              | 148                     | 764                              |
| FCE 202, 203, 207 y 208: `fechaVencimientoPago` no corresponde, cualquiera sea el concepto                                                                                                                 | 149                     | 765                              |
| FCE: cada `otrosTributos[].descripcion` es obligatoria (en el resto, solo con `codigo` 99, regla 301)                                                                                                      | 302                     | —                                |
| ND/NC 2, 3, 7, 8, 52, 53: `comprobantesAsociados` o `periodoComprobantesAsociados`, no ambos                                                                                                               | 160, 161                | 778, 779                         |
| `cancelaEnMismaMonedaExtranjera: 'S'` solo en 1, 6, 51, 201 y 206                                                                                                                                          | 118                     | — (ARCA solo observa)            |
| `compradores` solo con concepto 1 y no en FCE                                                                                                                                                              | 432, 433                | no se admiten (753)              |
| `compradores`: más de uno, con receptor informado, CUIT/CUIL/CDI, sin repetir, porcentaje entre 0 y 100 (exclusivo), distintos del emisor, suman 100, el receptor está y es uno de los de mayor porcentaje | 420-429                 | —                                |
| `codigoConcepto` 1, 2 o 3                                                                                                                                                                                  | 121                     | 713                              |
| Clase A y FCE: receptor con CUIT (80)                                                                                                                                                                      | 128, 129                | 718, 733                         |
| `subtotalesIVA` si hay ítems con condición 4, 5 o 6                                                                                                                                                        | 403                     | 715                              |
| Sujeto No Categorizado (23000000000): solo en 6, 7, 8 con `condicionIVAReceptor` 7; con gravado, tributo 13                                                                                                | 342, 145                | 889 (749 solo observa)           |
| Datos adicionales FCE: 21 (CBU) y 27 (`ADC`/`SCA`) en 201 y 206; 22 (`S`/`N`) en las notas; 21-23 solo en FCE y con `c1`                                                                                   | 326-336                 | 925-934 (923 solo observa)       |
| Dato adicional 5: solo en 1, 2, 3, 201, 202, 203, con `c1` de 1 a 6 y sin `c2`-`c6`                                                                                                                        | 337-340                 | 935-938                          |
| FCE: la factura asocia 88, 91, 990 o 995; la nota lleva un solo asociado FCE, con el `cuit` del emisor; en una anulación, la NC revierte 201/202/206/207 y la ND 203/208                                   | 208, 209, 210, 212, 214 | 808, 809, 810, 812, 814          |
| Período de asociados: no en notas FCE ni en las facturas 1, 51, 201 y 206                                                                                                                                  | 159, 162                | 777, 780                         |
| `fechaHoraGen` obligatoria en todo comprobante CAEA, también en `informarAjusteIVACAEA` (desde el 01/08/2026)                                                                                              | —                       | 754                              |

En CAEA, la regla de `importeIVA` 0 en las condiciones 1 a 3 solo observa (1122): `informarComprobanteCAEA` no la
valida localmente. Los mensajes de los ítems citan la numeración de cada método (CAE 500-521, CAEA 1100-1121).

Las reglas también se pueden correr sin enviar nada: `validateComprobanteCAE(comprobante, ctx?)` (las de `autorizar()`)
y `validateComprobanteCAEA(comprobante, ctx?)` (las de `informarComprobanteCAEA()`) lanzan `ArcaValidationError` con
todos los errores. `ctx` (`ContextoReglas`) es `{ cuitEmisor? }`: con él se validan además que el emisor no sea
comprador (426) y el `cuit` del asociado de una nota FCE (210 / 810). `ArcaMtxca` lo pasa solo con su `cuit`.
No validan el XSD.

En FCE (201-208) el ítem no exige `importeIVA` ni se valida su fórmula (514/515 aplican a 1, 2, 3, 51, 52, 53); el precio va sin IVA en FCE A y con IVA en FCE B, y los totales (110-116) se validan igual que en A y B.

Ejemplo de bonificación en clase A:

```typescript
items: [
  { unidadesMtx: 1, codigoMtx: '7790001000012', descripcion: 'Producto', cantidad: 1, codigoUnidadMedida: 7,
    precioUnitario: 100, codigoCondicionIVA: 5, importeIVA: 21, importeItem: 121 },
  { descripcion: 'Bonificación 10%', codigoUnidadMedida: 99, codigoCondicionIVA: 5, importeIVA: -2.1, importeItem: -12.1 },
],
importeGravado: 90, importeSubtotal: 90, importeTotal: 108.9,
subtotalesIVA: [{ codigo: 5, importe: 18.9 }],
```

### Enums y constantes

- `CbteTipo`: 1, 2, 3, 6, 7, 8, 51, 52, 53 (A con leyenda "OPERACIÓN SUJETA A RETENCIÓN") y FCE 201–203, 206–208.
- `Concepto`: 1 productos, 2 servicios, 3 ambos.
- `CodigoCondicionIVA`: 1 no gravado, 2 exento, 3 0%, 4 10,5%, 5 21%, 6 27% (y `ALICUOTAS_IVA`).
- `UnidadMedidaEspecial`: 95 (anulación/devolución), 97 (seña), 99 (bonificación).
- `Moneda`: `PES`, `DOL`, `060` (euro). Lista completa: `getMonedas()`.

## Manejo de errores

| Situación                      | Qué pasa                                                             |
| ------------------------------ | -------------------------------------------------------------------- |
| Datos inválidos localmente     | `ArcaValidationError` (no se hace ningún request).                   |
| ARCA aprueba                   | `{ resultado: 'A', comprobante: { cae, fechaVencimientoCAE, ... } }` |
| ARCA aprueba con observaciones | `{ resultado: 'O', comprobante, observaciones }`                     |
| ARCA rechaza                   | `{ resultado: 'R', errores }` — **no lanza**; revisá `resultado`.    |
| Consulta con `arrayErrores`    | `ArcaServiceError` con `errors[]` (`code`, `msg`).                   |
| Fault SOAP, HTTP, red, timeout | `ArcaSoapError` (`uncertain`, `faultString`, `statusCode`).          |
| Respuesta con forma inesperada | `ArcaSoapError` (`uncertain: true` en emisiones).                    |
| Login WSAA                     | `ArcaAuthError` / `ArcaTicketVigenteError`.                          |

`ultimoComprobante()` devuelve 0 solo ante el error 1502 de ARCA ("no hay comprobantes para ese punto de venta y tipo"); cualquier otro error lanza.

### Emisiones con resultado incierto

`autorizar`, `autorizarAjusteIVA`, `solicitarCAEA`, `informarComprobanteCAEA`, `informarAjusteIVACAEA`, `informarCAEANoUtilizado` e `informarCAEANoUtilizadoPtoVta` se envían una sola vez (nunca se reintentan). Si fallan con `ArcaSoapError` y `uncertain === true` (timeout, conexión cortada, HTTP 5xx, SOAP Fault `Server`, respuesta ilegible), ARCA pudo haber procesado el request. Los Fault `Client` (ej. "Token vencido", errores de estructura) no son inciertos: el request se rechazó antes de procesarse. **No reintentes a ciegas**: si el comprobante ya fue autorizado, un reenvío con el mismo número es rechazado por correlatividad (102) y uno con el número siguiente duplica la factura.

```typescript
import { type ArcaMtxca, type AutorizarRequest, ArcaSoapError, CbteTipo } from '@ramiidv/arca-mtxca';

async function autorizarSeguro(mtxca: ArcaMtxca, comprobante: AutorizarRequest) {
  const numero = (await mtxca.ultimoComprobante(4000, CbteTipo.FACTURA_A)) + 1;
  try {
    return await mtxca.autorizar({ ...comprobante, numeroComprobante: numero });
  } catch (e) {
    if (e instanceof ArcaSoapError && e.uncertain) {
      // ¿Llegó a autorizarse?
      const ultimo = await mtxca.ultimoComprobante(4000, CbteTipo.FACTURA_A);
      if (ultimo >= numero) {
        const { comprobante } = await mtxca.consultarComprobante(CbteTipo.FACTURA_A, 4000, numero);
        return comprobante; // codigoAutorizacion = CAE
      }
      // No se autorizó: se puede reenviar con el mismo número.
    }
    throw e;
  }
}
```

Para CAEA: `solicitarCAEA` incierto → `consultarCAEAEntreFechas()`; `informarComprobanteCAEA` incierto → `consultarComprobante()`.

Las solicitudes de un mismo punto de venta y tipo deben ser secuenciales (ARCA rechaza con 135 una solicitud concurrente), y la numeración automática supone un único emisor por punto de venta.

## Eventos

`onEvent` (o `mtxca.on(tipo, handler)`) recibe `auth:login`, `auth:cache-hit`, `auth:clock-skew`, `auth:storage-error`, `request:start`, `request:end`, `request:retry` y `request:error` (ver `ArcaEvent` en `@ramiidv/arca-common`).

El `evento` de WSMTXCA (aviso informativo de ARCA, `{ codigo, descripcion }`, ej. mantenimiento programado) llega como `evento?` en los resultados de autorizaciones, informes de CAEA, `consultarComprobante`, `solicitarCAEA`, `consultarCAEA` y `getCotizacionMoneda`, y de **cualquier** respuesta (incluidas las que devuelven un número o una lista) a `onEvento(evento, method)` de la configuración.

## Entornos

| Entorno      | URL                                                               |
| ------------ | ----------------------------------------------------------------- |
| Homologación | `https://fwshomo.afip.gov.ar/wsmtxca/services/MTXCAService`       |
| Producción   | `https://serviciosjava.afip.gob.ar/wsmtxca/services/MTXCAService` |

`production: false` (default) usa homologación. Las URLs están en `MTXCA_ENDPOINTS`; las de WSAA, en `WSAA_ENDPOINTS` de `@ramiidv/arca-common`.

## Ejemplos

En [examples](https://github.com/ramiidv/arca-sdks/tree/main/packages/mtxca/examples): factura B con ítems y QR, consultas de parámetros y CAEA, y manejo de errores.

## Licencia

MIT
