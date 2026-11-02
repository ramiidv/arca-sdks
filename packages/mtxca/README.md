# @ramiidv/arca-mtxca

SDK de TypeScript para el web service **WSMTXCA** de ARCA (ex AFIP): factura electrónica con detalle de ítems (código MTX/GTIN, cantidad, precio unitario e IVA por línea), con CAE y con CAEA.

- Tipos fieles al WSDL/XSD de WSMTXCA y elementos en el orden de la secuencia (Axis2 valida el orden).
- Redondeo según el XSD: 2 decimales en importes, 6 en cantidad, precio unitario, bonificación y cotización.
- Validación local de las reglas excluyentes del manual (presencia de campos por unidad de medida, fórmulas por ítem, subtotales de IVA por alícuota, totales).
- Las emisiones nunca se reintentan y los errores con resultado desconocido se marcan como `uncertain`.
- Los errores de negocio de ARCA (`arrayErrores`) se lanzan como `ArcaServiceError` en las consultas.
- Autenticación WSAA automática (via `@ramiidv/arca-common`), con `ticketStorage` persistente opcional.
- ESM, Node 18+, `fetch` nativo.

## Instalación

```bash
npm install @ramiidv/arca-mtxca
```

## Inicio rápido

```typescript
import { readFileSync } from 'node:fs';
import { ArcaMtxca, CbteTipo, Concepto, CodigoCondicionIVA, Moneda } from '@ramiidv/arca-mtxca';

const mtxca = new ArcaMtxca({
  cert: readFileSync('./cert.pem', 'utf-8'),
  key: readFileSync('./key.pem', 'utf-8'),
  cuit: '20-12345678-6',
  production: false, // homologación
});

// Factura A: 1 producto a $100 + IVA 21%
const res = await mtxca.autorizar({
  codigoTipoComprobante: CbteTipo.FACTURA_A,
  numeroPuntoVenta: 4000,
  // numeroComprobante: omitido => último autorizado + 1
  fechaEmision: new Date(),
  codigoTipoDocumento: 80,
  numeroDocumento: '30-00000000-7',
  condicionIVAReceptor: 1, // RG 5616: ver getCondicionesIVAReceptor()
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
});

if (res.resultado === 'R') {
  console.error('Rechazado', res.errores);
} else {
  // 'A' aprobado, 'O' aprobado con observaciones
  console.log(res.comprobante.numeroComprobante, res.comprobante.cae, res.comprobante.fechaVencimientoCAE);
  if (res.observaciones.length) console.warn(res.observaciones);
}
```

## Configuración

`ArcaMtxcaConfig` extiende `ArcaSdkConfig` de `@ramiidv/arca-common`:

| Opción                                                                      | Descripción                                                                              |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `cert`, `key`                                                               | Certificado y clave privada PEM.                                                         |
| `cuit`                                                                      | CUIT representada (número o string, con o sin guiones). Se valida el dígito verificador. |
| `production`                                                                | `false` (default) = homologación.                                                        |
| `endpoints`                                                                 | `{ mtxca?, wsaa? }`: URLs propias (proxy, mock). Ignoran `production`.                   |
| `wsaa`                                                                      | `WsaaClient` compartido con otros SDKs del mismo certificado.                            |
| `signal`                                                                    | `AbortSignal` global: cancela todas las llamadas de la instancia.                        |
| `timeout`, `retries`, `retryDelayMs`                                        | Transporte. `retries` solo aplica a consultas.                                           |
| `ticketStorage`                                                             | Storage persistente de tickets WSAA (recomendado en producción).                         |
| `tokenTTLMinutes`, `clockOffsetMs`, `autoClockSkew`, `loginErrorCooldownMs` | Opciones de WSAA.                                                                        |
| `fetch`, `legacyTls`                                                        | `fetch` propio (proxy, tests) y transporte TLS legacy.                                   |
| `onEvent`                                                                   | Callback de eventos (`auth:*`, `request:*`).                                             |

Endpoints (manual WSMTXCA):

| Entorno      | URL                                                               |
| ------------ | ----------------------------------------------------------------- |
| Homologación | `https://fwshomo.afip.gov.ar/wsmtxca/services/MTXCAService`       |
| Producción   | `https://serviciosjava.afip.gob.ar/wsmtxca/services/MTXCAService` |

Todos los métodos aceptan un último parámetro `opts?: CallOptions` con `signal` para cancelar.

## Reglas de importes

Los campos del request se llaman igual que en el XSD (`ComprobanteType`, `ItemType`). Lo más importante del manual:

- `importeItem` incluye el IVA. En clase A (1, 2, 3, 51, 52, 53) `precioUnitario` va **sin** IVA y el ítem lleva `importeIVA`; en clase B (6, 7, 8) `precioUnitario` va **con** IVA y el ítem no lleva `importeIVA`.
- `importeItem` = (`precioUnitario` × `cantidad` − `importeBonificacion`) × (1 + alícuota) en clase A; = `precioUnitario` × `cantidad` − `importeBonificacion` en clase B.
- Unidad 99 (bonificación) y 97 (seña): sin `cantidad`, `precioUnitario` ni `importeBonificacion`; la bonificación tiene `importeItem` negativo y requiere otro ítem con la misma condición de IVA. En clase A, `importeIVA` = `importeItem` − `importeItem` / (1 + alícuota).
- Fuera de 97/99, `unidadesMtx` y `codigoMtx` son obligatorios.
- `importeGravado` = Σ (`importeItem` − IVA) de los ítems con condición 3–6; `importeNoGravado` = Σ ítems condición 1; `importeExento` = Σ ítems condición 2; `importeSubtotal` = gravado + no gravado + exento.
- `subtotalesIVA`: uno por cada condición 4, 5 o 6 presente, con la suma del IVA de esos ítems.
- `importeTotal` = `importeSubtotal` + `importeOtrosTributos` + Σ subtotales de IVA = `importeOtrosTributos` + Σ `importeItem`.
- Margen de error del manual: error relativo ≤ 0,01% o absoluto ≤ 0,01 × cantidad de elementos.

`autorizar()` valida todo esto antes de enviar y lanza `ArcaValidationError` con el detalle (incluye el código de error de ARCA que se evita y el valor esperado). Si ARCA acepta un caso que la validación local rechaza, pasá `{ validarImportes: false }`. Para redondear como el SDK: `roundImporte()` y `roundDecimal()`.

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

## Resultado de una autorización y manejo de errores

| Situación                      | Qué pasa                                                             |
| ------------------------------ | -------------------------------------------------------------------- |
| Datos inválidos localmente     | `ArcaValidationError` (no se hace ningún request).                   |
| ARCA aprueba                   | `{ resultado: 'A', comprobante: { cae, fechaVencimientoCAE, ... } }` |
| ARCA aprueba con observaciones | `{ resultado: 'O', comprobante, observaciones }`                     |
| ARCA rechaza                   | `{ resultado: 'R', errores }` — **no lanza**; revisá `resultado`.    |
| Consulta con `arrayErrores`    | `ArcaServiceError` con `errors[]` (`code`, `msg`).                   |
| Fault SOAP, HTTP, red, timeout | `ArcaSoapError` (`uncertain`, `faultString`, `statusCode`).          |
| Login WSAA                     | `ArcaAuthError` / `ArcaTicketVigenteError`.                          |

`ultimoComprobante()` devuelve 0 solo ante el error 1502 de ARCA ("no hay comprobantes para ese punto de venta y tipo"); cualquier otro error lanza.

### Emisiones con resultado incierto

`autorizar`, `autorizarAjusteIVA`, `solicitarCAEA`, `informarComprobanteCAEA`, `informarAjusteIVACAEA`, `informarCAEANoUtilizado` e `informarCAEANoUtilizadoPtoVta` se envían una sola vez (nunca se reintentan). Si fallan con `ArcaSoapError` y `uncertain === true` (timeout, conexión cortada, HTTP 5xx, respuesta ilegible), ARCA pudo haber procesado el request. **No reintentes a ciegas**: si el comprobante ya fue autorizado, un reenvío con el mismo número es rechazado por correlatividad (102) y uno con el número siguiente duplica la factura.

```typescript
import { ArcaSoapError } from '@ramiidv/arca-mtxca';

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
```

Para CAEA: `solicitarCAEA` incierto → `consultarCAEAEntreFechas()`; `informarComprobanteCAEA` incierto → `consultarComprobante()`.

Las solicitudes de un mismo punto de venta y tipo deben ser secuenciales (ARCA rechaza con 135 una solicitud concurrente), y la numeración automática supone un único emisor por punto de venta.

## API

### Comprobantes con CAE

| Método                                                   | Operación WSMTXCA                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| `autorizar(req, opts?)`                                  | `autorizarComprobante` (número automático si se omite)             |
| `autorizarAjusteIVA(req, opts?)`                         | `autorizarAjusteIVA` (solo valida el XSD: tiene reglas propias)    |
| `ultimoComprobante(ptoVta, cbteTipo, opts?)`             | `consultarUltimoComprobanteAutorizado`                             |
| `siguienteComprobante(ptoVta, cbteTipo, opts?)`          | último + 1                                                         |
| `consultarComprobante(cbteTipo, ptoVta, cbteNro, opts?)` | `consultarComprobante` → `{ comprobante, observaciones, evento? }` |

### CAEA

| Método                                               | Operación WSMTXCA                                    |
| ---------------------------------------------------- | ---------------------------------------------------- |
| `solicitarCAEA(periodo, orden, opts?)`               | `solicitarCAEA` (`periodo` AAAAMM, `orden` 1 o 2)    |
| `consultarCAEA(caea, opts?)`                         | `consultarCAEA`                                      |
| `consultarCAEAEntreFechas(desde, hasta, opts?)`      | `consultarCAEAEntreFechas`                           |
| `informarComprobanteCAEA(comp, opts?)`               | `informarComprobanteCAEA` (`comp.caea` = CAEA usado) |
| `informarAjusteIVACAEA(comp, opts?)`                 | `informarAjusteIVACAEA`                              |
| `informarCAEANoUtilizado(caea, opts?)`               | `informarCAEANoUtilizado`                            |
| `informarCAEANoUtilizadoPtoVta(caea, ptoVta, opts?)` | `informarCAEANoUtilizadoPtoVta`                      |
| `consultarPtosVtaCAEANoInformados(caea, opts?)`      | `consultarPtosVtaCAEANoInformados`                   |

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

`getCotizacionMoneda` usa la fecha de hoy si no se indica; `cotizacion` es `null` cuando ARCA no tiene cotización (responde sin valor y sin error).

`clearAuthCache()` (async) descarta el ticket WSAA de `wsmtxca`.

### Cliente de bajo nivel

`mtxca.client` (`MtxcaClient`) expone una función por operación del WSDL (`autorizarComprobante`, `consultarCAEA`, ...) que recibe `MtxcaAuth` (`{ token, sign, cuitRepresentada }`) y `numeroComprobante` explícito. Valida contra el XSD y redondea, pero no valida la coherencia de importes. Se puede usar sin `ArcaMtxca`:

```typescript
import { MtxcaClient, MTXCA_ENDPOINTS } from '@ramiidv/arca-mtxca';
const client = new MtxcaClient({ endpoint: MTXCA_ENDPOINTS.testing });
await client.dummy();
```

## Enums y constantes

- `CbteTipo`: 1, 2, 3, 6, 7, 8, 51, 52, 53 (A con leyenda "OPERACIÓN SUJETA A RETENCIÓN") y FCE 201–203, 206–208.
- `Concepto`: 1 productos, 2 servicios, 3 ambos.
- `CodigoCondicionIVA`: 1 no gravado, 2 exento, 3 0%, 4 10,5%, 5 21%, 6 27% (y `ALICUOTAS_IVA`).
- `UnidadMedidaEspecial`: 95, 97 (seña), 99 (bonificación).
- `Moneda`: `PES`, `DOL`, `060` (euro). Lista completa: `getMonedas()`.

## Requisitos

- Node.js >= 18.
- Certificado digital de ARCA asociado al servicio `wsmtxca` y empadronamiento en "Codificación de Productos – Factura con Detalle".

## Licencia

MIT
