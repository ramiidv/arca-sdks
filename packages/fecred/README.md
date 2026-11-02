# @ramiidv/arca-fecred

[![npm](https://img.shields.io/npm/v/@ramiidv/arca-fecred)](https://www.npmjs.com/package/@ramiidv/arca-fecred)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node >= 20.19](https://img.shields.io/badge/node-%3E%3D20.19-brightgreen)](https://nodejs.org)

SDK en TypeScript para el web service **WSFECRED** (FECredService) de **ARCA** (ex AFIP): Factura de Crédito Electrónica MiPyME (Ley 27.440).

Cubre todas las operaciones del WSDL: obligación de recepción, cuentas corrientes, comprobantes, historial de estados, remitos, aceptación, rechazo, cancelación total, rechazo de notas de débito/crédito, opción de transferencia, Agentes de Depósito Colectivo y tablas de parámetros.

Fuente: WSDL de FECredService (`https://fwshomo.afip.gob.ar/wsfecred/FECredService?wsdl`). El manual de WSFECRED no está publicado: los tipos y las validaciones siguen el XSD embebido en el WSDL.

## Instalación

```bash
npm install @ramiidv/arca-fecred
```

## Requisitos

- Node.js >= 20.19. Solo ESM; desde CommonJS se carga con `require()` (require(esm)).
- Certificado digital X.509 y clave privada de ARCA, con el servicio **`wsfecred`** asociado
  - **Homologación**: [WSASS](https://wsass-homo.afip.gob.ar/wsass/portal/main.aspx)
  - **Producción**: [Administración de Certificados Digitales](https://www.afip.gob.ar/ws/documentacion/certificados.asp)

## Inicio rápido

```typescript
import { readFileSync } from "node:fs";
import { ArcaFecred, FileTicketStorage } from "@ramiidv/arca-fecred";

const fecred = new ArcaFecred({
  cert: readFileSync("./cert.pem", "utf-8"),
  key: readFileSync("./key.pem", "utf-8"),
  cuit: "20-12345678-6", // CUIT representada (number o string, con o sin guiones)
  production: false,
  ticketStorage: new FileTicketStorage("./.arca-tickets"),
});

// ¿La CUIT receptora está obligada a recibir FCE?
const { obligado, montoDesde } = await fecred.consultarMontoObligadoRecepcion({
  cuitConsultada: "30712345671",
  fechaEmision: "2026-11-01",
});
console.log(obligado, montoDesde);

// Cuentas corrientes recibidas en octubre (paginado)
const { ctasCtes, hayMas } = await fecred.consultarCtasCtes({
  rol: "Receptor",
  fecha: { tipo: "Emision", desde: "2026-10-01", hasta: "2026-10-31" },
});
console.log(ctasCtes.length, hayMas);

// Aceptar una FCE
const [cta] = ctasCtes;
if (cta) {
  const r = await fecred.aceptarFECred({
    idCtaCte: { codCtaCte: cta.codCtaCte },
    saldoAceptado: cta.saldo,
    codMoneda: cta.codMoneda,
    cotizacionMonedaUlt: 1,
  });
  console.log(r.resultado); // 'A' u 'O' (un rechazo se lanza como ArcaServiceError)
}
```

## Configuración

`ArcaFecredConfig` extiende `ArcaSdkConfig` de `@ramiidv/arca-common`:

| Opción                                                                               | Tipo                            | Default            | Descripción                                                                                                   |
| ------------------------------------------------------------------------------------ | ------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `cert`, `key`                                                                        | `string`                        | —                  | Certificado y clave privada (PEM)                                                                             |
| `keyPassphrase`                                                                      | `string`                        | —                  | Contraseña de la clave, si está encriptada                                                                    |
| `cuit`                                                                               | `number \| string`              | —                  | CUIT representada; se valida el dígito verificador y se envía como 11 dígitos                                 |
| `production`                                                                         | `boolean`                       | `false`            | Homologación o producción                                                                                     |
| `timeout`                                                                            | `number`                        | `30000`            | Timeout HTTP (ms)                                                                                             |
| `retries` / `retryDelayMs`                                                           | `number`                        | `1` / `1000`       | Reintentos de **consultas** (las emisiones nunca se reintentan)                                               |
| `tokenTTLMinutes`                                                                    | `number`                        | `720`              | Vigencia del TRA pedida a WSAA                                                                                |
| `ticketStorage`                                                                      | `TicketStorage`                 | —                  | Persistencia del TA (recomendado en producción: `FileTicketStorage` o propio)                                 |
| `clockOffsetMs`, `autoClockSkew`, `loginErrorCooldownMs`, `permanentErrorCooldownMs` |                                 |                    | Opciones de WSAA (ver `@ramiidv/arca-common`)                                                                 |
| `fetch`                                                                              | `typeof fetch`                  | `globalThis.fetch` | `fetch` propio (proxy, tests)                                                                                 |
| `legacyTls`                                                                          | `'auto' \| 'never' \| 'always'` | `'auto'`           | Transporte TLS legacy                                                                                         |
| `onEvent`                                                                            | `(e: ArcaEvent) => void`        | —                  | Eventos `auth:*` y `request:*`                                                                                |
| `wsaa`                                                                               | `WsaaClient`                    | —                  | `WsaaClient` compartido con otros SDKs (mismo certificado); tiene que ser del mismo entorno (`production`)    |
| `signal`                                                                             | `AbortSignal`                   | —                  | Cancela todas las llamadas de la instancia (ej: al apagar la app); se combina con el `signal` de cada llamada |
| `endpoints`                                                                          | `{ wsfecred?, wsaa? }`          | —                  | Sobrescribe las URLs                                                                                          |

Todos los métodos aceptan un último parámetro opcional `opts?: CallOptions` (`{ signal }`) para cancelar.

## API

### Consultas (se reintentan ante errores transitorios)

| Método                                                                                                                     | Operación | Devuelve                                                                  |
| -------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------- |
| `status()`                                                                                                                 | `dummy`   | `{ appserver, dbserver, authserver }`                                     |
| `consultarMontoObligadoRecepcion({ cuitConsultada, fechaEmision })`                                                        | idem      | `{ obligado?, montoDesde?, observaciones }`                               |
| `consultarObligadoRecepcion(cuit)`                                                                                         | idem      | `{ obligado?, desde?, observaciones }` (campo `respuesta` del WS)         |
| `consultarCtasCtes({ rol, cuitContraparte?, fecha?, estadoCtaCte?, nroPagina?, opcionTransferencia? })`                    | idem      | `{ ctasCtes: InfoCtaCte[], nroPagina?, hayMas?, evento?, observaciones }` |
| `consultarCtaCte(idCtaCte)`                                                                                                | idem      | `{ ctaCte: CuentaCorriente, evento?, observaciones }`                     |
| `consultarComprobantes({ rol, cuitContraparte?, codTipoCmp?, estadoCmp?, fecha?, codCtaCte?, estadoCtaCte?, nroPagina? })` | idem      | `{ comprobantes: Comprobante[], nroPagina?, hayMas?, ... }`               |
| `consultarHistorialEstadosComprobante(idComprobante)`                                                                      | idem      | `{ idComprobante, estados }`                                              |
| `consultarHistorialEstadosCtaCte(idCtaCte)`                                                                                | idem      | `{ idCtaCte, estados }`                                                   |
| `obtenerRemitos(idComprobante)`                                                                                            | idem      | `IdComprobante[]`                                                         |
| `consultarCuentasEnAgtDptoCltv()`                                                                                          | idem      | `{ cuentas, observaciones }`                                              |
| `consultarFacturasAgtDptoCltv({ idCtaCte?, fecha? })`                                                                      | idem      | `{ facturas, evento?, observaciones }`                                    |
| `consultarTiposRetenciones()`                                                                                              | idem      | `{ codigoJurisdiccion, descripcionJurisdiccion, porcentajeRetencion }[]`  |
| `consultarTiposFormasCancelacion()`                                                                                        | idem      | `{ codigo, descripcion }[]`                                               |
| `consultarTiposMotivosRechazo()`                                                                                           | idem      | `{ codigo, descripcion }[]`                                               |
| `consultarTiposAjustesOperacion()`                                                                                         | idem      | `{ codigo, descripcion }[]`                                               |

`obligado` es opcional en el XSD: si ARCA no lo informa, viene `undefined` y el motivo suele estar en `observaciones`.

### Operaciones que cambian estado (emisiones: nunca se reintentan)

| Método                                                                                | Operación | Devuelve                                                      |
| ------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------- |
| `aceptarFECred({ idCtaCte, saldoAceptado, codMoneda, cotizacionMonedaUlt, ... })`     | idem      | `{ resultado: 'A' \| 'O', idCtaCte, evento?, observaciones }` |
| `rechazarFECred({ idCtaCte, motivos })`                                               | idem      | idem                                                          |
| `informarCancelacionTotalFECred({ idCtaCte, formasCancelacion, importeCancelacion })` | idem      | idem                                                          |
| `modificarOpcionTransferencia({ idCtaCte, opcionTransferencia })`                     | idem      | idem                                                          |
| `informarFacturaAgtDptoCltv({ idCtaCte, ctaAgente })`                                 | idem      | idem                                                          |
| `rechazarNotaDC({ idComprobante, motivos })`                                          | idem      | `{ resultado, idComprobante, evento?, observaciones }`        |

`resultado` `A` (aprobado) u `O` (aprobado con observaciones) se devuelve; `R` (rechazado) **se lanza** como `ArcaServiceError`, con los errores y las observaciones en `errors`. (En `@ramiidv/arca-mtxca`, en cambio, las emisiones devuelven el `R`.)

`aceptarFECred` acepta además los opcionales del XSD: `confirmarNotasDC` (`{ acepta, idNota }[]`), `formasCancelacion`, `retenciones` (`{ codTipo, importe, porcentaje, descMotivo? }[]`), `ajustesOperacion` (`{ codigo, importe }[]`), `tipoCancelacion` (`'PAR' | 'TOT'`), `importeCancelado`, `importeTotalRetPesos`, `importeEmbargoPesos`, `informaCBU` y `cbuComprador`.

### Identificadores

```typescript
import { readFileSync } from "node:fs";
import { ArcaFecred } from "@ramiidv/arca-fecred";
import type { IdCtaCteInput } from "@ramiidv/arca-fecred";

const fecred = new ArcaFecred({
  cert: readFileSync("./cert.pem", "utf-8"),
  key: readFileSync("./key.pem", "utf-8"),
  cuit: "20123456786",
});

// IdCtaCteType es un xsd:choice: por código de cuenta corriente o por factura
const porCodigo: IdCtaCteInput = { codCtaCte: "1234567890" };
const porFactura: IdCtaCteInput = {
  idFactura: {
    cuitEmisor: "30712345671",
    codTipoCmp: 201,
    ptoVta: 3,
    nroCmp: 125,
  },
};

const { ctaCte } = await fecred.consultarCtaCte(porFactura);
const { estados } = await fecred.consultarHistorialEstadosCtaCte(porCodigo);
console.log(ctaCte.estadoCtaCte.estado, estados.length);
```

Las respuestas devuelven `codCtaCte`, CUITs y `codAutorizacion` (CAE) como **string**; importes como `number`; fechas como el string que envía ARCA; los `S`/`N` como `boolean`.

### Paginado

`consultarCtasCtes` y `consultarComprobantes` devuelven `nroPagina` y `hayMas`. Pedí la página siguiente con `nroPagina`.

### Enumeraciones y tablas de códigos

Los códigos de formas de cancelación, motivos de rechazo, ajustes de operación y retenciones **no están en el WSDL**: obtenelos con `consultarTipos*()`. El SDK solo exporta las enumeraciones definidas en el XSD:
`RolCtaCte`, `EstadoCtaCte` (`Modificable`, `Aceptada`, `Rechazada`, `CanceladaTotal`, `InformadaAgDpto`), `EstadoComprobante`, `TipoFechaFiltro`, `OpcionTransferencia` (`SCA`, `ADC`), `TipoCancelacion` (`PAR`, `TOT`), `TipoAceptacion` y `Resultado`. Se pueden usar como `RolCtaCte.RECEPTOR` o con el literal (`'Receptor'`).

En los requests solo se aceptan esos valores. En las respuestas, los estados, `opcionTransferencia`, `tipoAcep` y `tipoCodAuto` se devuelven tal cual vienen: si ARCA agrega un valor nuevo (como pasó con `InformadaAgDpto`), la consulta no falla. El tipo es `ValorAbierto<T>` (los valores conocidos o cualquier `string`), así que un `switch` sobre el estado necesita un caso `default`.

### Cliente de bajo nivel

`fecred.client` es un `FecredClient`: los mismos métodos con las credenciales (`WsAuth`) como primer parámetro y respuestas tipadas. Para crearlo a mano hay que pasar `endpoint` y `namespace` (`ENDPOINTS.wsfecred`).

```typescript
import { readFileSync } from "node:fs";
import { ArcaFecred, ENDPOINTS, FecredClient } from "@ramiidv/arca-fecred";

const fecred = new ArcaFecred({
  cert: readFileSync("./cert.pem", "utf-8"),
  key: readFileSync("./key.pem", "utf-8"),
  cuit: "20123456786",
});

const ticket = await fecred.wsaa.getAccessTicket("wsfecred");
const auth = {
  token: ticket.token,
  sign: ticket.sign,
  cuitRepresentada: fecred.cuit,
};
const tipos = await fecred.client.consultarTiposMotivosRechazo(auth);

// Cliente propio (ej: otro endpoint)
const client = new FecredClient({
  endpoint: ENDPOINTS.wsfecred.testing,
  namespace: ENDPOINTS.wsfecred.namespace,
});
console.log(tipos, await client.dummy());
```

Detalles del protocolo (verificados contra homologación): namespace `http://ar.gob.afip.wsfecred/FECredService/`, wrapper `<operacionRequest>`, header `SOAPAction` = namespace + operación (obligatorio), `dummy` con Body vacío.

## Manejo de errores

| Clase                    | Cuándo                                                                                                                                                                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ArcaValidationError`    | Datos inválidos (CUIT con dígito verificador incorrecto, fechas inexistentes, importes NaN/negativos, textos fuera de 3..250, CBU inválido, etc.). No se llega a pedir el ticket ni a llamar a ARCA. `details[].field` indica el parámetro.               |
| `ArcaServiceError`       | ARCA devolvió `arrayErrores` o `arrayErroresFormato`, o una emisión terminó con `resultado = 'R'`. `errors: { code, msg, rawCode? }[]`: primero los errores y después las observaciones. El mensaje incluye la operación (`WSFECRED aceptarFECred: ...`). |
| `ArcaSoapError`          | HTTP, timeout, SOAP Fault o respuesta que no cumple el XSD (falta un campo obligatorio, S/N inválido, etc.). `uncertain` indica si ARCA pudo haber procesado el request.                                                                                  |
| `ArcaAuthError`          | Falla de WSAA, o SOAP Fault `wscommon_*` de WSFECRED (token, sign o CUIT representada rechazados). La operación no se procesó; el Fault original está en `cause`.                                                                                         |
| `ArcaTicketVigenteError` | WSAA ya emitió un TA para este certificado y servicio, y no está en el `ticketStorage`.                                                                                                                                                                   |

Las observaciones (`arrayObservaciones`/`arrayObservacion`) y el `evento` no son errores: vienen en el resultado.

```typescript
import { readFileSync } from "node:fs";
import {
  ArcaAuthError,
  ArcaFecred,
  ArcaServiceError,
  ArcaSoapError,
  ArcaValidationError,
} from "@ramiidv/arca-fecred";

const fecred = new ArcaFecred({
  cert: readFileSync("./cert.pem", "utf-8"),
  key: readFileSync("./key.pem", "utf-8"),
  cuit: "20123456786",
});

const idCtaCte = { codCtaCte: "1234567890" };
try {
  await fecred.aceptarFECred({
    idCtaCte,
    saldoAceptado: 121000,
    codMoneda: "PES",
    cotizacionMonedaUlt: 1,
  });
} catch (e) {
  if (e instanceof ArcaValidationError) {
    console.error(e.details); // no se llamó a ARCA
  } else if (e instanceof ArcaServiceError) {
    console.error(e.errors); // rechazo de ARCA (errores + observaciones)
  } else if (e instanceof ArcaAuthError) {
    console.error("Autenticación:", e.message); // la operación no se procesó
  } else if (e instanceof ArcaSoapError && e.uncertain) {
    // La aceptación pudo haberse registrado: consultar el estado antes de reintentar.
    const { estados } = await fecred.consultarHistorialEstadosCtaCte(idCtaCte);
    console.error("Resultado incierto. Último estado:", estados.at(-1)?.estado);
  } else {
    throw e;
  }
}
```

### Resultado incierto en emisiones

Las emisiones (`aceptarFECred`, `rechazarFECred`, `informarCancelacionTotalFECred`, `rechazarNotaDC`, `modificarOpcionTransferencia`, `informarFacturaAgtDptoCltv`) se envían una sola vez. Si la respuesta se pierde (timeout, conexión cortada, HTTP 5xx, SOAP Fault `Server`, respuesta ilegible o sin `resultado`) se lanza `ArcaSoapError` con `uncertain = true`: la operación **pudo haberse registrado**. Antes de reintentar, consultá el estado con `consultarCtaCte` o `consultarHistorialEstadosCtaCte`; si ya figura `Aceptada`/`Rechazada`, no reintentes.

No son inciertos: los Faults `Client` (el request se rechazó antes de procesarse), los `wscommon_*` (`ArcaAuthError`) y las respuestas inválidas de las consultas.

## Eventos

`onEvent` (o `fecred.on(tipo, handler)`) recibe `auth:login`, `auth:cache-hit`, `auth:clock-skew`, `auth:storage-error`, `request:start`, `request:end`, `request:retry` y `request:error` (ver `ArcaEvent` en `@ramiidv/arca-common`).

## Entornos

| Entorno      | WSFECRED                                                   |
| ------------ | ---------------------------------------------------------- |
| Homologación | `https://fwshomo.afip.gob.ar/wsfecred/FECredService`       |
| Producción   | `https://serviciosjava.afip.gob.ar/wsfecred/FECredService` |

Los endpoints y el namespace están en `ENDPOINTS.wsfecred` (en otros SDKs la constante se llama `<SERVICIO>_ENDPOINTS`, ej: `MTXCA_ENDPOINTS`). Los de WSAA están en `WSAA_ENDPOINTS` de `@ramiidv/arca-common`.

## Ejemplos

En [examples](https://github.com/ramiidv/arca-sdks/tree/main/packages/fecred/examples): consulta de obligación de recepción, gestión de FCE (listar y aceptar) y manejo de errores.

## Licencia

MIT
