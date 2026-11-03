# @ramiidv/arca-fecred

[![npm](https://img.shields.io/npm/v/@ramiidv/arca-fecred)](https://www.npmjs.com/package/@ramiidv/arca-fecred)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node >= 20.19](https://img.shields.io/badge/node-%3E%3D20.19-brightgreen)](https://nodejs.org)

SDK en TypeScript para el web service **WSFECRED** (FECredService) de **ARCA** (ex AFIP): Factura de Crédito Electrónica MiPyME (Ley 27.440).

Cubre todas las operaciones del WSDL: obligación de recepción, cuentas corrientes, comprobantes, historial de estados, remitos, aceptación, rechazo, cancelación total, rechazo de notas de débito/crédito, opción de transferencia, Agentes de Depósito Colectivo y tablas de parámetros.

Fuentes: WSDL de FECredService (`https://fwshomo.afip.gob.ar/wsfecred/FECredService?wsdl`) y el [manual del desarrollador de WSFECRED v2.0.3](https://servicioscf.afip.gob.ar/facturadecreditoelectronica/documentos/Manual_Desarrollador_WSFECRED_v2.0.3.pdf). Donde no coinciden, el SDK sigue al XSD.

## Glosario

- **FCE** (Factura de Crédito Electrónica MiPyME): el comprobante que una MiPyME emite a una empresa grande en lugar de la factura, según el título I de la [Ley 27.440](https://www.argentina.gob.ar/normativa/nacional/ley-27440-310084/texto) (art. 1). Cumplidos los requisitos del art. 4, es título ejecutivo y valor no cartular. `consultarMontoObligadoRecepcion` indica si una CUIT está obligada a recibirla.
- **Cuenta corriente de la FCE** (`codCtaCte`): lo que ARCA registra de cada FCE en el "Registro de Facturas de Crédito Electrónicas MiPyMEs" (art. 3): estado, saldo, notas de débito/crédito asociadas, cancelaciones y retenciones. Las operaciones del SDK se hacen sobre ella.
- **Aceptación expresa / tácita** (`TipoAceptacion`): la expresa es la que registra el comprador (`aceptarFECred`); la tácita se produce si vence el plazo que fija la ley sin que se registre aceptación ni rechazo (Ley 27.440, art. 5 inc. i). El SDK informa cuál fue en `tipoAcep`.
- **SCA** (Sistema de Circulación Abierta) y **ADC** (Agente de Depósito Colectivo): las dos opciones de transferencia de una FCE (`OpcionTransferencia`, definidas en el XSD). Con ADC, la FCE aceptada se informa a un Agente de Depósito Colectivo para negociarla (Ley 27.440, arts. 14 y 16; `informarFacturaAgtDptoCltv`).

## Instalación

```bash
npm install @ramiidv/arca-fecred
```

## Requisitos

- Node.js >= 20.19. Solo ESM; desde CommonJS se carga con `require()` (require(esm)).
- Certificado digital X.509 y clave privada de ARCA, con el servicio **`wsfecred`** asociado
  - **Homologación**: [WSASS](https://wsass-homo.afip.gob.ar/wsass/portal/main.aspx)
  - **Producción**: [Administración de Certificados Digitales](https://www.afip.gob.ar/ws/documentacion/certificados.asp)
  - Paso a paso (certificado, asociación del servicio, entornos) en
    [arca-common: Primeros pasos](../common/README.md#primeros-pasos).

## Inicio rápido

```typescript
import { readFileSync } from "node:fs";
import { ArcaFecred, FileTicketStorage } from "@ramiidv/arca-fecred";

const fecred = new ArcaFecred({
  cert: readFileSync("./certs/certificado.crt", "utf-8"),
  key: readFileSync("./certs/clave.key", "utf-8"),
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

// Aceptar una FCE, con la moneda y la cotización de su cuenta corriente
const [cta] = ctasCtes;
if (cta) {
  const { ctaCte } = await fecred.consultarCtaCte({ codCtaCte: cta.codCtaCte });
  if (!ctaCte) throw new Error("ARCA no devolvió la cuenta corriente");
  const r = await fecred.aceptarFECred({
    idCtaCte: { codCtaCte: ctaCte.codCtaCte },
    saldoAceptado: ctaCte.saldo,
    codMoneda: ctaCte.codMoneda,
    cotizacionMonedaUlt: ctaCte.cotizacionMonedaUlt, // 1 solo si codMoneda es PES
  });
  console.log(r.resultado); // 'A' u 'O' (un rechazo se lanza como ArcaServiceError)
}
```

## Configuración

`ArcaFecredConfig` extiende `ArcaSdkConfig` de `@ramiidv/arca-common`:

| Opción                                                                                                                 | Tipo                            | Default            | Descripción                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `cert`, `key`                                                                                                          | `string`                        | —                  | Certificado y clave privada (PEM)                                                                             |
| `keyPassphrase`                                                                                                        | `string`                        | —                  | Contraseña de la clave, si está encriptada                                                                    |
| `cuit`                                                                                                                 | `number \| string`              | —                  | CUIT representada; se valida el dígito verificador y se envía como 11 dígitos                                 |
| `production`                                                                                                           | `boolean`                       | `false`            | Homologación o producción                                                                                     |
| `timeout`                                                                                                              | `number`                        | `30000`            | Timeout HTTP (ms)                                                                                             |
| `retries` / `retryDelayMs`                                                                                             | `number`                        | `1` / `1000`       | Reintentos de **consultas** (las emisiones nunca se reintentan)                                               |
| `tokenTTLMinutes`                                                                                                      | `number`                        | `720`              | Vigencia del TRA pedida a WSAA                                                                                |
| `ticketStorage`                                                                                                        | `TicketStorage`                 | —                  | Persistencia del TA (recomendado en producción: `FileTicketStorage` o propio)                                 |
| `clockOffsetMs`, `autoClockSkew`, `loginErrorCooldownMs`, `permanentErrorCooldownMs`, `alreadyAuthenticatedCooldownMs` |                                 |                    | Opciones de WSAA (ver `@ramiidv/arca-common`)                                                                 |
| `fetch`                                                                                                                | `typeof fetch`                  | `globalThis.fetch` | `fetch` propio (proxy, tests)                                                                                 |
| `legacyTls`                                                                                                            | `'auto' \| 'never' \| 'always'` | `'auto'`           | Transporte TLS legacy                                                                                         |
| `onEvent`                                                                                                              | `(e: ArcaEvent) => void`        | —                  | Eventos `auth:*` y `request:*`                                                                                |
| `wsaa`                                                                                                                 | `WsaaClient`                    | —                  | `WsaaClient` compartido con otros SDKs (mismo certificado); tiene que ser del mismo entorno (`production`)    |
| `signal`                                                                                                               | `AbortSignal`                   | —                  | Cancela todas las llamadas de la instancia (ej: al apagar la app); se combina con el `signal` de cada llamada |
| `endpoints`                                                                                                            | `{ wsfecred?, wsaa? }`          | —                  | Sobrescribe las URLs                                                                                          |

Todos los métodos aceptan un último parámetro opcional `opts?: CallOptions` (`{ signal }`) para cancelar.

## API

### Consultas (se reintentan ante errores transitorios)

| Método                                                                                                                     | Operación | Devuelve                                                                  |
| -------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------- |
| `status()`                                                                                                                 | `dummy`   | `{ appserver, dbserver, authserver }`                                     |
| `consultarMontoObligadoRecepcion({ cuitConsultada, fechaEmision })`                                                        | idem      | `{ obligado?, montoDesde?, observaciones }`                               |
| `consultarObligadoRecepcion(cuit)` (deprecada por el manual: usar `consultarMontoObligadoRecepcion`)                       | idem      | `{ obligado?, desde?, observaciones }` (campo `respuesta` del WS)         |
| `consultarCtasCtes({ rol, cuitContraparte?, fecha?, estadoCtaCte?, nroPagina?, opcionTransferencia? })`                    | idem      | `{ ctasCtes: InfoCtaCte[], nroPagina?, hayMas?, evento?, observaciones }` |
| `consultarCtaCte(idCtaCte)`                                                                                                | idem      | `{ ctaCte?: CuentaCorriente, evento?, observaciones }`                    |
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

Además del XSD se validan reglas del manual: `informaCBU` y `cbuComprador` van juntos (12013), sin CBU con cancelación total (12012) ni con saldo aceptado 0 (2016); `retenciones` con `importeTotalRetPesos` > 0 y viceversa (12007); una cancelación lleva `importeCancelado` > 0, `formasCancelacion` y `tipoCancelacion` (12008); con `PES` la cotización es 1 (2007, 12000); el porcentaje de una retención es mayor a 0 y menor a 100 (`PorcentajeSimpleType`, manual §3.1). En todos los requests que los llevan (`aceptarFECred`, `rechazarFECred`, `rechazarNotaDC`, `informarCancelacionTotalFECred`) no se repiten códigos de retenciones, ajustes, formas de cancelación ni motivos de rechazo (2003, 2013, 4002, 3001).

El error 1103 ("La operación no pudo realizarse, reinténtelo más tarde") se resuelve reintentando: está en `WSFECRED_ERRORES_REINTENTABLES`.

### Tickets de acceso

`await fecred.clearAuthCache()` borra el ticket de `wsfecred` (memoria y `ticketStorage`). **Ojo:** WSAA rechaza los pedidos de un ticket nuevo durante un lapso de retención (minutos), así que borrar un TA vigente puede dejarte sin acceso durante ese lapso. Ante un `ArcaAuthError` no lo uses: corregí la causa en ARCA y, si el error no era reintentable (`retryable: false`), llamá a `fecred.wsaa.resetLoginCooldown("wsfecred")`. `clearAuthCache()` es solo para un ticket dañado (ej: cambiaste de certificado).

### Identificadores

```typescript
import { readFileSync } from "node:fs";
import { ArcaFecred } from "@ramiidv/arca-fecred";
import type { IdCtaCteInput } from "@ramiidv/arca-fecred";

const fecred = new ArcaFecred({
  cert: readFileSync("./certs/certificado.crt", "utf-8"),
  key: readFileSync("./certs/clave.key", "utf-8"),
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
console.log(ctaCte?.estadoCtaCte.estado, estados.length);
```

Las respuestas devuelven `codCtaCte`, CUITs y `codAutorizacion` (CAE) como **string**; importes como `number`; fechas como el string que envía ARCA; los `S`/`N` como `boolean`.

### Paginado

`consultarCtasCtes` y `consultarComprobantes` devuelven `nroPagina` y `hayMas`. Pedí la página siguiente con `nroPagina`.

### Enumeraciones y tablas de códigos

Los códigos de formas de cancelación, motivos de rechazo, ajustes de operación y retenciones **no están en el WSDL**: obtenelos con `consultarTipos*()`. El SDK solo exporta las enumeraciones definidas en el XSD:
`RolCtaCte`, `EstadoCtaCte` (`Modificable`, `Aceptada`, `Rechazada`, `CanceladaTotal`, `InformadaAgDpto`), `EstadoComprobante`, `TipoFechaFiltro`, `OpcionTransferencia` (`SCA`, `ADC`), `TipoCancelacion` (`PAR`, `TOT`), `TipoAceptacion` y `Resultado`. Se pueden usar como `RolCtaCte.RECEPTOR` o con el literal (`'Receptor'`).

En los requests solo se aceptan esos valores. En las respuestas, los estados, `opcionTransferencia`, `tipoAcep` y `tipoCodAuto` se devuelven tal cual vienen: si ARCA agrega un valor nuevo (como pasó con `InformadaAgDpto`), la consulta no falla. El tipo es `ValorAbierto<T>` (los valores conocidos o cualquier `string`), así que un `switch` sobre el estado necesita un caso `default`.

### Cliente de bajo nivel

`fecred.client` es un `FecredClient`: los mismos métodos con las credenciales como primer parámetro y respuestas tipadas. Las credenciales son un `WsAuthSource`: un `WsAuth` (`{ token, sign, cuitRepresentada }`) o una función `() => Promise<WsAuth>`; con la función, el cliente valida los parámetros antes de llamarla, así que un dato inválido no llega a pedir el ticket. Para crearlo a mano hay que pasar `endpoint` y `namespace` (`ENDPOINTS.wsfecred`).

```typescript
import { readFileSync } from "node:fs";
import { ArcaFecred, ENDPOINTS, FecredClient } from "@ramiidv/arca-fecred";

const fecred = new ArcaFecred({
  cert: readFileSync("./certs/certificado.crt", "utf-8"),
  key: readFileSync("./certs/clave.key", "utf-8"),
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

| Clase                    | Cuándo                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ArcaValidationError`    | Datos inválidos (CUIT con dígito verificador incorrecto, fechas inexistentes, importes NaN/negativos, textos fuera de 3..250, CBU inválido, etc.). No se llega a pedir el ticket ni a llamar a ARCA. `details[].field` indica el parámetro. Los importes con más de 2 decimales no se rechazan: se redondean a 2, mitad al par (Round Half Even, sección 3.3 del manual). |
| `ArcaServiceError`       | ARCA devolvió `arrayErrores` o `arrayErroresFormato`, o una emisión terminó con `resultado = 'R'`. `errors: { code, msg, rawCode? }[]`: primero los errores y después las observaciones. El mensaje incluye la operación (`WSFECRED aceptarFECred: ...`).                                                                                                                 |
| `ArcaSoapError`          | HTTP, timeout, SOAP Fault o respuesta que no cumple el XSD (falta un campo obligatorio, S/N inválido, etc.). `uncertain` indica si ARCA pudo haber procesado el request.                                                                                                                                                                                                  |
| `ArcaAuthError`          | Falla de WSAA, o SOAP Fault `wscommon_*` de WSFECRED (token, sign o CUIT representada rechazados). La operación no se procesó; el Fault original está en `cause`.                                                                                                                                                                                                         |
| `ArcaTicketVigenteError` | WSAA ya emitió un TA para este certificado y servicio, y no está en el `ticketStorage`.                                                                                                                                                                                                                                                                                   |

Las observaciones (`arrayObservaciones`/`arrayObservacion`) y el `evento` no son errores: vienen en el resultado, en `observaciones`. El SDK lee el array con cualquiera de los dos nombres (el manual y el XSD los tienen cruzados en algunas operaciones) y, si vienen los dos, los une.

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
  cert: readFileSync("./certs/certificado.crt", "utf-8"),
  key: readFileSync("./certs/clave.key", "utf-8"),
  cuit: "20123456786",
});

const idCtaCte = { codCtaCte: "1234567890" };
try {
  await fecred.aceptarFECred({
    idCtaCte,
    saldoAceptado: 121000,
    codMoneda: "PES",
    cotizacionMonedaUlt: 1, // en pesos; en otra moneda, la de consultarCtaCte
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

Los endpoints y el namespace están en `ENDPOINTS.wsfecred` (en algunos SDKs la constante se llama `<SERVICIO>_ENDPOINTS`, ej: `MTXCA_ENDPOINTS`). Los de WSAA están en `WSAA_ENDPOINTS` de `@ramiidv/arca-common`.

## Ejemplos

En [examples](https://github.com/ramiidv/arca-sdks/tree/main/packages/fecred/examples): consulta de obligación de recepción, gestión de FCE (listar y aceptar) y manejo de errores.

## Licencia

MIT
