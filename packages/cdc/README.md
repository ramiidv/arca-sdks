# @ramiidv/arca-cdc

[![npm](https://img.shields.io/npm/v/@ramiidv/arca-cdc)](https://www.npmjs.com/package/@ramiidv/arca-cdc)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node >= 22.12](https://img.shields.io/badge/node-%3E%3D22.12-brightgreen)](https://nodejs.org)

SDK en TypeScript para el web service **WSCDC** (Constatación de Comprobantes) de **ARCA** (ex AFIP).

Permite verificar si un comprobante (propio o de un tercero) fue autorizado por ARCA mediante CAE,
CAI o CAEA. Todas las operaciones son consultas (no modifican nada en ARCA y se pueden reintentar).

Fuentes: WSDL oficial (`https://wswhomo.afip.gov.ar/WSCDC/service.asmx?WSDL`) y
[Manual del desarrollador WSCDC](https://www.afip.gob.ar/ws/WSCDCV1/WSCDC-manual-desarrollador-v4.pdf)
(revisión 0.4, 01-12-2025).

## Instalación

```bash
npm install @ramiidv/arca-cdc
```

## Requisitos

- Node.js >= 22.12. Solo ESM; desde CommonJS se carga con `require()` (Node ≥ 22.12 permite cargar módulos ESM con `require()`).
- Certificado digital X.509 y clave privada de ARCA, con el servicio **`wscdc`** asociado
  - **Homologación**: [WSASS](https://wsass-homo.afip.gob.ar/wsass/portal/main.aspx)
  - **Producción**: [Administración de Certificados Digitales](https://www.afip.gob.ar/ws/documentacion/certificados.asp)
    y asociación al servicio en "Administrador de Relaciones de Clave Fiscal" (detalle en
    [`@ramiidv/arca-common`](https://github.com/ramiidv/arca-sdks/tree/main/packages/common#primeros-pasos)).
    No hace falta punto de venta: es solo consulta.

Glosario:

- **Constatación**: verificar contra ARCA que un comprobante existe y fue autorizado con los datos
  informados (emisor, número, fecha, importe, receptor).
- **CAE / CAEA / CAI**: código de autorización del comprobante: CAE (por comprobante, web services o
  Comprobantes en línea), CAEA (anticipado, para contingencias) o CAI (comprobantes impresos).
- **Homologación / producción**: entorno de prueba (sin validez fiscal, otro certificado) y entorno real.

## Inicio rápido

```typescript
import fs from 'node:fs';
import { ArcaCdc } from '@ramiidv/arca-cdc';

const cdc = new ArcaCdc({
  cuit: 20123456786, // CUIT representada (quien consulta)
  cert: fs.readFileSync('./certs/certificado.crt', 'utf-8'),
  key: fs.readFileSync('./certs/clave.key', 'utf-8'),
  production: false,
});

const r = await cdc.constatar({
  cbteModo: 'CAE', // CAE | CAI | CAEA
  cuitEmisor: 30712345671, // CUIT de quien emitió el comprobante
  ptoVta: 1,
  cbteTipo: 1, // Factura A
  cbteNro: 150,
  cbteFch: '20260315', // YYYYMMDD, YYYY-MM-DD o Date
  impTotal: 12100,
  codAutorizacion: '73429843294823',
  docTipoReceptor: 80, // ver "Receptor" en constatar(input)
  docNroReceptor: 20123456786, // se informa junto con docTipoReceptor
});

if (r.resultado === 'A') {
  console.log('Constatado', r.fchProceso, r.observaciones); // puede traer observaciones no excluyentes (ej: 200)
} else {
  console.log('Rechazado:', r.observaciones); // ej: [{ code: 100, msg: "..." }]
}
```

## Configuración

`ArcaCdcConfig` extiende `ArcaSdkConfig` de `@ramiidv/arca-common`:

| Opción                            | Tipo                            | Default        | Descripción                                                                          |
| --------------------------------- | ------------------------------- | -------------- | ------------------------------------------------------------------------------------ |
| `cuit`                            | `number \| string`              | --             | CUIT representada (se valida el dígito verificador)                                  |
| `cert` / `key`                    | `string`                        | --             | Certificado y clave privada (PEM)                                                    |
| `production`                      | `boolean`                       | `false`        | Producción u homologación                                                            |
| `timeout`                         | `number`                        | `30000`        | Timeout HTTP (ms)                                                                    |
| `retries`                         | `number`                        | `1`            | Reintentos ante errores transitorios (todas las operaciones son consultas)           |
| `retryDelayMs`                    | `number`                        | `1000`         | Delay inicial del backoff exponencial                                                |
| `tokenTTLMinutes`                 | `number`                        | `720`          | Vigencia pedida a WSAA                                                               |
| `ticketStorage`                   | `TicketStorage`                 | memoria        | Persistencia del ticket WSAA (recomendado en producción; ver `FileTicketStorage`)    |
| `keyPassphrase`                   | `string`                        | --             | Contraseña de la clave, si está encriptada                                           |
| `clockOffsetMs` / `autoClockSkew` |                                 | `0` / `true`   | Ajuste de reloj para WSAA                                                            |
| `loginErrorCooldownMs`            | `number`                        | `60000`        | Espera tras un login WSAA fallido                                                    |
| `permanentErrorCooldownMs`        | `number`                        | `Infinity`     | Espera tras un error de WSAA no reintentable; `0` la desactiva                       |
| `alreadyAuthenticatedCooldownMs`  | `number`                        | 2 min / 10 min | Espera tras `coe.alreadyAuthenticated` (producción / homologación); `0` la desactiva |
| `fetch`                           | `typeof fetch`                  | global         | `fetch` propio (proxy, tests)                                                        |
| `legacyTls`                       | `'auto' \| 'never' \| 'always'` | `'auto'`       | Transporte TLS legacy (ver abajo)                                                    |
| `endpoints`                       | `{ wscdc?, wsaa? }`             | --             | Sobrescribe las URLs                                                                 |
| `onEvent`                         | `(e: ArcaEvent) => void`        | --             | Eventos (auth, requests, reintentos)                                                 |
| `wsaa`                            | `WsaaClient`                    | --             | `WsaaClient` compartido con otros SDKs (mismo certificado y entorno)                 |
| `signal`                          | `AbortSignal`                   | --             | Cancela todas las llamadas de la instancia; se combina con el de cada llamada        |

## API

Todos aceptan un último parámetro opcional `opts?: { signal?: AbortSignal }`.

| Método                 | Operación WSCDC                  | Devuelve                                                              |
| ---------------------- | -------------------------------- | --------------------------------------------------------------------- |
| `constatar(input)`     | `ComprobanteConstatar`           | `ConstatarResult`                                                     |
| `status()`             | `ComprobanteDummy` (sin auth)    | `{ appserver, dbserver, authserver }`                                 |
| `getModalidades()`     | `ComprobantesModalidadConsultar` | `{ cod, desc, fchDesde?, fchHasta? }[]` (`cod`: `CAE`, `CAI`, `CAEA`) |
| `getTiposCbte()`       | `ComprobantesTipoConsultar`      | `{ id: number, desc }[]`                                              |
| `getDocTipos()`        | `DocumentosTipoConsultar`        | `{ id: string, desc }[]`                                              |
| `getTiposOpcionales()` | `OpcionalesTipoConsultar`        | `{ id: string, desc }[]`                                              |
| `clearAuthCache()`     | --                               | `Promise<void>`: descarta los tickets WSAA                            |

Las tablas devuelven un `ListaCdc<T>`: un array común (`desc` es `''` si ARCA no la informa) con los
`Events` de ARCA, si vinieron, en `lista.eventos` (propiedad no enumerable: no aparece al iterar,
serializar ni copiar el array). Si ARCA responde el error `503` "Sin Resultados" (como
`OpcionalesTipoConsultar` en homologación), la tabla es `[]`; cualquier otro error lanza
`ArcaServiceError`.

ARCA manda `<Events><Evt><Code>0</Code></Evt></Events>` cuando no hay eventos: el SDK descarta los
eventos con código `0`, así que no aparecen en `lista.eventos` ni en `eventos` de `constatar()`. `status()` devuelve lo que informa ARCA sin evaluarlo: usá
`serverStatusOk(status)` de `@ramiidv/arca-common` para saber si los tres servidores están en `OK`.

### `constatar(input)`

```typescript
interface ConstatarInput {
  cbteModo: 'CAE' | 'CAI' | 'CAEA';
  cuitEmisor: number | string; // 11 dígitos, con o sin guiones
  ptoVta: number; // 1..99998
  cbteTipo: number; // ver getTiposCbte()
  cbteNro: number; // 1..99999999
  cbteFch: string | Date; // se envía YYYYMMDD; desde el 01/01/2013 (101)
  impTotal: number; // >= 0, se redondea a 2 decimales (mitad al par); 0 si el comprobante no tiene total
  codAutorizacion: string; // 14 dígitos
  docTipoReceptor?: number | string; // ver getDocTipos(); junto con docNroReceptor (117); 80 obligatorio en A, A con leyenda y MiPyME (113, 114); en los T (195-197), 80, 91, 94 o 96 (118)
  docNroReceptor?: number | string; // solo dígitos (CUIT validado si docTipoReceptor = 80)
  opcionales?: { id: string; valor: string }[]; // ver getTiposOpcionales()
}

interface ConstatarResult {
  resultado: 'A' | 'R';
  fchProceso: string; // YYYYMMDDHHMMSS
  cmpResp?: ComprobanteConstatado; // los datos del comprobante tal como los devuelve ARCA
  observaciones: { code: number; msg: string }[];
  eventos: { code: number; msg: string }[]; // Events de ARCA (sin los de código 0)
}
```

Cómo interpretar la respuesta (manual WSCDC, 2.2.3):

- **`resultado: 'A'`**: el comprobante está registrado y autorizado. Puede traer observaciones no
  excluyentes (ej: `200`, CAEA aún no rendido pero en plazo).
- **`resultado: 'R'`**: el comprobante no se pudo constatar por validaciones funcionales (`100`
  código inexistente, `102` CUIT emisor no coincide, `110` importe no coincide, etc.). El detalle
  está en `observaciones`. Si ARCA devuelve `CmpResp` incompleto, el resultado viene sin `cmpResp`.
  `constatar()` es una consulta, así que un `R` **se devuelve, no se lanza**: es la respuesta a "¿este
  comprobante es válido?". (`ArcaRechazoError`, que los demás SDKs lanzan cuando ARCA rechaza una
  emisión, no aplica acá.)
- **`Errors` de ARCA** (validaciones de formato `1`-`10`, autenticación `600`-`602`,
  infraestructura `500`-`503`): el SDK **lanza `ArcaServiceError`**, porque el comprobante no se
  llegó a constatar. ARCA en esos casos también responde `resultado: R`, pero no significa que el
  comprobante sea inválido.

Receptor (`docTipoReceptor` y `docNroReceptor`, se informan juntos: 117): obligatorio y con CUIT en
comprobantes A, A con leyenda "operación sujeta a retención" y MiPyME/FCE (113, 114); en B, C, R,
30, 31, 37, 38, 41 y 49, solo cuando el importe supera $10.000.000 (115, 116); en los comprobantes T
(195, 196, 197), solo los documentos 80, 91, 94 o 96 (118).

`constatar()` valida localmente la fecha (no anterior al 01/01/2013, 101) y las reglas 113, 114,
117 y 118, además del dígito verificador del CUIT del receptor y que los `id` de `opcionales` no se
repitan. Las 115 y 116 dependen del importe a partir del que son obligatorias y las valida ARCA.

Los errores de autenticación `600`-`602` de WSCDC llegan como `ArcaServiceError` (con `errors`), no
como `ArcaAuthError`: a diferencia de `@ramiidv/arca-facturacion`, donde los `600`/`601` de WSFEv1 son
`ArcaAuthError`. `ArcaAuthError` queda para los errores de WSAA (login).

El importe se compara con margen: error relativo <= 0,01% o absoluto <= 1 (manual, 2.8).

El input se valida una sola vez, antes de autenticarse con WSAA: un input inválido lanza
`ArcaValidationError` sin llamar a WSAA ni a WSCDC.

### Cliente de bajo nivel

```typescript
import fs from 'node:fs';
import { ArcaCdc, CdcClient, ENDPOINTS, WSCDC_SERVICE_ID } from '@ramiidv/arca-cdc';
import type { CdcAuth } from '@ramiidv/arca-cdc';

const cdc = new ArcaCdc({
  cuit: 20123456786,
  cert: fs.readFileSync('./certs/certificado.crt', 'utf-8'),
  key: fs.readFileSync('./certs/clave.key', 'utf-8'),
});

// { endpoint, transport? }: transport son las opciones de red (timeout, retries, onEvent, fetch, legacyTls)
const client = new CdcClient({ endpoint: ENDPOINTS.wscdc.testing, transport: { timeout: 30_000 } });
await client.dummy();

const ticket = await cdc.wsaa.getAccessTicket(WSCDC_SERVICE_ID);
const auth: CdcAuth = { token: ticket.token, sign: ticket.sign, cuit: '20123456786' }; // se valida la CUIT
await client.getTiposOpcionales(auth);
```

## Manejo de errores

```typescript
import fs from 'node:fs';
import {
  ArcaAuthError,
  ArcaCdc,
  ArcaResponseError,
  ArcaServiceError,
  ArcaSoapError,
  ArcaTicketVigenteError,
  ArcaValidationError,
} from '@ramiidv/arca-cdc';
import type { ConstatarInput } from '@ramiidv/arca-cdc';

const cdc = new ArcaCdc({
  cuit: 20123456786,
  cert: fs.readFileSync('./certs/certificado.crt', 'utf-8'),
  key: fs.readFileSync('./certs/clave.key', 'utf-8'),
});
const input: ConstatarInput = {
  cbteModo: 'CAE',
  cuitEmisor: 30712345671,
  ptoVta: 1,
  cbteTipo: 6,
  cbteNro: 150,
  cbteFch: '20260315',
  impTotal: 12100,
  codAutorizacion: '73429843294823',
};

try {
  await cdc.constatar(input);
} catch (e) {
  if (e instanceof ArcaValidationError) {
    e.details; // [{ field, message, value }] — no se llamó a ARCA
  } else if (e instanceof ArcaTicketVigenteError) {
    // WSAA ya emitió un ticket que no está en el storage: reintentá después de e.retryAfterMs (y configurá ticketStorage)
  } else if (e instanceof ArcaAuthError) {
    // login WSAA fallido
  } else if (e instanceof ArcaServiceError) {
    e.errors; // [{ code, msg }] tal cual los devuelve ARCA
  } else if (e instanceof ArcaResponseError) {
    e.message; // ARCA respondió con una forma inesperada
  } else if (e instanceof ArcaSoapError) {
    e.statusCode;
    e.faultString; // transporte / SOAP Fault
  }
}
```

Como todas las operaciones son consultas, ante un timeout o error de red alcanza con repetir la
misma llamada (el SDK ya reintenta `retries` veces).

## Eventos

`onEvent` (o `cdc.on(tipo, handler)`) recibe `auth:login`, `auth:cache-hit`, `auth:clock-skew`, `auth:storage-error`,
`request:start`, `request:end`, `request:retry` y `request:error` (ver `ArcaEvent` en
`@ramiidv/arca-common`).

## Entornos

| Entorno      | WSCDC                                               |
| ------------ | --------------------------------------------------- |
| Homologación | `https://wswhomo.afip.gov.ar/WSCDC/service.asmx`    |
| Producción   | `https://servicios1.afip.gov.ar/WSCDC/service.asmx` |

- El manual menciona `servicios1.arca.gob.ar` para producción, pero ese host presenta un certificado
  emitido solo para `servicios1.afip.gov.ar` y la validación TLS falla; por eso el SDK usa
  `servicios1.afip.gov.ar`.
- **TLS legacy**: el host de producción negocia Diffie-Hellman de 1024 bits, que Node >= 17 rechaza
  (`ERR_SSL_DH_KEY_TOO_SMALL`). Con `legacyTls: 'auto'` (default), `@ramiidv/arca-common` reintenta
  ese handshake una vez con `ciphers: 'DEFAULT@SECLEVEL=1'` y recuerda el host. Con un `fetch`
  propio no hay fallback: tu `fetch` tiene que aceptar DH de 1024 bits.

## Ejemplos

En [examples](https://github.com/ramiidv/arca-sdks/tree/main/packages/cdc/examples): verificar un
comprobante, consultas de tablas y manejo de errores.

## Licencia

MIT
