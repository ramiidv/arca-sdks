# @ramiidv/arca-common

[![npm](https://img.shields.io/npm/v/@ramiidv/arca-common)](https://www.npmjs.com/package/@ramiidv/arca-common)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node >= 22.12](https://img.shields.io/badge/node-%3E%3D22.12-brightgreen)](https://nodejs.org)

Utilidades compartidas para el ecosistema de SDKs de **ARCA** (ex AFIP) en TypeScript.

Este paquete es la base sobre la que se construyen los SDKs de dominio:

- [`@ramiidv/arca-facturacion`](https://github.com/ramiidv/arca-sdks/tree/main/packages/facturacion) — Facturación electrónica (WSFEv1, WSFEX, CAEA)
- [`@ramiidv/arca-padron`](https://github.com/ramiidv/arca-sdks/tree/main/packages/padron) — Consulta de contribuyentes (Constancia de Inscripción, Padrón A4, A10, A13, A100)
- [`@ramiidv/arca-empleados`](https://github.com/ramiidv/arca-sdks/tree/main/packages/empleados) — Ingreso masivo de relaciones laborales (Simplificación Registral)
- [`@ramiidv/arca-cdc`](https://github.com/ramiidv/arca-sdks/tree/main/packages/cdc) — Constatación de comprobantes (WSCDC)
- [`@ramiidv/arca-fecred`](https://github.com/ramiidv/arca-sdks/tree/main/packages/fecred) — Factura de Crédito Electrónica MiPyME (WSFECRED)
- [`@ramiidv/arca-sire`](https://github.com/ramiidv/arca-sdks/tree/main/packages/sire) — Retenciones electrónicas (SIRE)
- [`@ramiidv/arca-agro`](https://github.com/ramiidv/arca-sdks/tree/main/packages/agro) — Carta de porte y liquidaciones de granos (WSCPE, WSLPG)
- [`@ramiidv/arca-mtxca`](https://github.com/ramiidv/arca-sdks/tree/main/packages/mtxca) — Facturación con detalle de artículos (WSMTXCA)

## Instalación

```bash
npm install @ramiidv/arca-common
```

## Requisitos

- Node.js >= 22.12. El paquete es **solo ESM**; desde CommonJS se carga con `require()` (require(esm), disponible desde Node 22.12).
- Certificado digital X.509 (RSA) y su clave privada de ARCA, con cada web service asociado (ver
  [Primeros pasos](#primeros-pasos)).

## Primeros pasos

Lo mismo para todos los SDKs (la documentación oficial está en
[Certificados](https://www.afip.gob.ar/ws/documentacion/certificados.asp)):

1. **Clave privada y pedido de certificado (CSR)**, con OpenSSL
   ([instructivo oficial](https://www.afip.gob.ar/ws/WSAA/WSAA.ObtenerCertificado.pdf)):

   ```bash
   mkdir -p certs
   openssl genrsa -out certs/clave.key 2048
   openssl req -new -key certs/clave.key -subj "/C=AR/O=Mi Empresa/CN=miapp/serialNumber=CUIT 20123456786" -out pedido.csr
   ```

   `serialNumber` es el texto `CUIT`, un espacio y la CUIT sin guiones. Guardá la clave: el
   certificado no sirve sin ella. Los ejemplos de este repo leen `./certs/clave.key` y
   `./certs/certificado.crt`.
2. **Certificado**: con el CSR, generalo en
   - **Homologación**: [WSASS](https://wsass-homo.afip.gob.ar/wsass/portal/main.aspx), que se
     adhiere con clave fiscal de una persona física desde el "Administrador de Relaciones de Clave
     Fiscal" ([cómo adherirse](https://www.afip.gob.ar/ws/WSASS/WSASS_como_adherirse.pdf),
     [manual](https://www.afip.gob.ar/ws/WSASS/WSASS_manual.pdf)).
   - **Producción**: "Administración de Certificados Digitales", con clave fiscal en
     [arca.gob.ar](https://arca.gob.ar).
3. **Asociá cada web service al certificado** (`wsfe`, `ws_sr_padron_a13`, `wsfecred`...): en
   WSASS, creando una autorización para el servicio; en producción, con el "Administrador de
   Relaciones de Clave Fiscal"
   ([delegación de web services](https://www.afip.gob.ar/ws/WSAA/ADMINREL.DelegarWS.pdf)). Sin
   esto, WSAA responde `coe.notAuthorized`, que el SDK trata como error no reintentable
   (`ArcaAuthError` con `retryable: false`): después de asociarlo, llamá a
   `resetLoginCooldown(servicio)` (ver [Login fallido](#login-fallido-esperas)).
4. **Homologación o producción**: por defecto (`production: false`) se usan los endpoints de
   homologación (testing), donde las operaciones no tienen validez fiscal y se usa el certificado
   de WSASS. Con `production: true` se usan los de producción, con el certificado de producción.
   Cada certificado sirve solo en su entorno.

## Qué incluye

| Módulo                | Descripción                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **WsaaClient**        | Cliente WSAA: firma CMS/PKCS#7, cache de tickets, persistencia (`ticketStorage`), deduplicación, ajuste de reloj y esperas tras logins fallidos                          |
| **Certificados**      | `certificateInfo` (vigencia, sujeto y CUIT de un certificado); `WsaaClient` valida cert y clave al construirse                                                           |
| **Ticket storage**    | `MemoryTicketStorage`, `FileTicketStorage` — implementaciones de referencia de `TicketStorage`                                                                           |
| **SOAP client**       | `soapCall`, `arcaSoapCall`, `extractMethodResult`, `checkServiceErrors`, `extractServiceErrors`, `formatServiceErrors` — timeout, `signal`, reintentos solo en consultas |
| **XML**               | `parseXml`, `buildXml`, `ensureArray`, `getNestedValue` — vía fast-xml-parser                                                                                            |
| **Base de los SDKs**  | `ArcaSdkBase`, `SoapServiceClient`, `createWsaaClient`, `transportOptions`, `parseServerStatus`, `statusOf`                                                              |
| **Validadores**       | `validateCuit`, `isValidCuit`, `validateCBU`, `isValidCBU`, `formatDate`, `parseArcaDate`, `validateFecha`, `validateFechaRango`, `diasEntre`                            |
| **Fechas y redondeo** | `formatDateTimeAR`, `AR_TIMEZONE`, `roundHalfUp`, `roundHalfEven`                                                                                                        |
| **QR**                | `generarUrlQR` — URL del QR de los comprobantes electrónicos                                                                                                             |
| **Errores**           | `ArcaError`, `ArcaAuthError`, `ArcaTicketVigenteError`, `ArcaSoapError`, `ArcaServiceError`, `ArcaRechazoError`, `ArcaValidationError`, `ArcaResponseError`              |
| **Schemas del XSD**   | `@ramiidv/arca-common/schema` — DSL para validar/codificar requests y decodificar respuestas                                                                             |
| **Testing**           | `@ramiidv/arca-common/testing` — `fetch` simulado, envelopes, `testCert`, contratos contra el XSD                                                                        |
| **Constantes**        | `WSAA_ENDPOINTS`, `DocTipo`, `Provincia`, `CondicionIva` (tipo `ServiceEndpoints`: la forma de cada servicio en el `ENDPOINTS` de los SDKs)                              |

## Autenticación WSAA

```typescript
import fs from 'node:fs';
import { WsaaClient, FileTicketStorage } from '@ramiidv/arca-common';

const wsaa = new WsaaClient({
  cert: fs.readFileSync('./certs/certificado.crt', 'utf-8'),
  key: fs.readFileSync('./certs/clave.key', 'utf-8'),
  // keyPassphrase: '...', // si la clave está encriptada
  production: false,
  ticketStorage: new FileTicketStorage('./.arca-tickets'), // recomendado
});

const ticket = await wsaa.getAccessTicket('wsfe');
ticket.token;
ticket.sign;
ticket.expirationTime; // "2026-10-30T23:00:00.000Z" (ISO, serializable)

// Llamadas siguientes devuelven el ticket cacheado mientras esté vigente.
await wsaa.getAccessTicket('wsfe'); // cache hit
wsaa.production; // false: entorno de WSAA de este cliente
```

El constructor **valida el certificado y la clave** (PEM legibles, RSA, y que la clave corresponda
al certificado) y lanza `ArcaValidationError` si algo no está bien, sin llamar a WSAA. Acepta claves
PKCS#1 y PKCS#8, encriptadas con `keyPassphrase`. El nombre del servicio se valida en cada
`getAccessTicket` (3 a 32 letras, dígitos, `_` o `-`, empezando con una letra).

`tokenTTLMinutes` (1 a 1440, default 720) es la **vigencia del TRA** (el pedido firmado), no la del
Ticket de Acceso: WSAA emite cada TA con su propio vencimiento (12 horas, según el manual). Si la
respuesta no trae `expirationTime`, se asume 12 horas. WSAA rechaza un TRA que vence más de 24 horas
después de su `generationTime` (que el SDK fija 2 minutos antes de la hora actual), así que con 1440 el
`expirationTime` queda 1438 minutos adelante. Un TA cuyo `expirationTime` ya pasó se
rechaza con `ArcaAuthError`.

### Datos del certificado

```typescript
import { readFileSync } from 'node:fs';
import { certificateInfo } from '@ramiidv/arca-common';

const info = certificateInfo(readFileSync('./certs/certificado.crt', 'utf-8'));
// { subject: 'CN=miapp, SERIALNUMBER=CUIT 20123456786', issuer: '...', notBefore, notAfter, cuit: '20123456786' }
if (info.notAfter.getTime() - Date.now() < 30 * 86_400_000) console.warn('El certificado vence pronto');
```

### Persistencia del Ticket de Acceso

WSAA **rechaza el login si ya existe un TA vigente** para el mismo certificado y servicio y se lo
pide de nuevo dentro de un lapso de retención (`coe.alreadyAuthenticated`). Según el manual del
desarrollador de WSAA, ese lapso es de 2 minutos en producción y 10 en homologación, y ARCA puede
cambiarlo sin aviso. Si tu proceso se reinicia y el TA solo estaba en memoria, no vas a poder
loguearte durante ese lapso. Para evitarlo, configurá un `ticketStorage`:

- Orden de lectura: memoria → storage → login. Después de un login exitoso, se persiste.
- `clearTicket` también borra del storage. **Ojo:** WSAA rechaza los pedidos repetidos durante el
  lapso de retención, así que borrar un ticket vigente puede dejarte sin acceso durante ese lapso.
  Usalo solo si el ticket es inválido.
- En los 2 minutos previos al vencimiento el SDK intenta renovar; si WSAA todavía no lo permite,
  sigue usando el ticket actual hasta su vencimiento real.
- Los logins concurrentes del mismo servicio se deduplican (incluida la lectura del storage).
- Si WSAA responde "ya posee un TA válido" y el storage no tiene el ticket (después de releerlo,
  por si otro proceso lo acaba de guardar), se lanza `ArcaTicketVigenteError` (`retryable: true`,
  `retryAfterMs`). Durante `alreadyAuthenticatedCooldownMs` (default: 2 minutos en producción, 10 en
  homologación) se vuelve a lanzar sin llamar a WSAA, porque un pedido dentro del lapso de retención
  vuelve a ser rechazado.
- Si el storage falla, el SDK sigue funcionando con el ticket en memoria y emite `auth:storage-error`.

`FileTicketStorage(directorio)` guarda un archivo JSON por ticket, con escritura atómica (archivo
temporal + `fsync` + rename), permisos 0600 en los archivos y 0700 en el directorio. Un archivo
corrupto se descarta (y se informa como `auth:storage-error`). Sirve para varios procesos que
comparten el directorio. `MemoryTicketStorage` no sobrevive a un reinicio (útil en tests).

La key que recibe el storage identifica entorno, certificado y servicio
(`"prod:3f9a0c1b2d4e5f60:wsfe"`), así que el mismo storage sirve para varios CUITs y entornos.
`AccessTicket` es JSON puro (fechas ISO-8601). En un storage propio, `normalizeAccessTicket(raw)`
valida lo leído (acepta `expirationTime` como ISO, epoch en ms o `Date`) y devuelve `null` si no es
un ticket; `get` recibe un segundo parámetro opcional `{ onError }` para informar problemas que el
storage resolvió sin lanzar:

```typescript
import type { TicketStorage, AccessTicket } from '@ramiidv/arca-common';

// `db`: tu cliente de base de datos (ej: node-postgres)
declare const db: { query(sql: string, params: unknown[]): Promise<{ value: string } | undefined> };

const dbStorage: TicketStorage = {
  async get(key) {
    const row = await db.query('SELECT value FROM arca_tickets WHERE key = $1', [key]);
    return row ? (JSON.parse(row.value) as AccessTicket) : null;
  },
  async set(key, ticket) {
    await db.query('INSERT INTO arca_tickets (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', [
      key,
      JSON.stringify(ticket),
    ]);
  },
  async delete(key) {
    await db.query('DELETE FROM arca_tickets WHERE key = $1', [key]);
  },
};
```

> El token y el sign dan acceso a los web services de ARCA con tu CUIT: guardalos como un secreto.

> Si un login llega a WSAA pero la respuesta se pierde (timeout), ese TA no se puede recuperar:
> el siguiente login falla con `ArcaTicketVigenteError` durante el lapso de retención. Por eso el SDK nunca
> aborta un login en curso (aunque el caller cancele su `signal`) y solo reintenta un login si es
> seguro que el request no se envió (DNS, conexión rechazada).

### Login fallido: esperas

La especificación de WSAA pide no volver a pedir un TA enseguida después de un error, y no pedirlo
más hasta corregir la causa cuando el error no es transitorio. `getAccessTicket` lanza siempre
`ArcaAuthError`, con el error original en `cause`, `faultCode`/`statusCode` de la respuesta de
WSAA (si hubo) y `retryable`:

- **Transitorios** (`retryable: true`): `wsaa.*`, `wsn.unavailable`, timeout, HTTP 4xx/5xx sin
  Fault, respuesta ilegible. Durante `loginErrorCooldownMs` (default `60000`) se rechaza sin
  llamar a WSAA.
- **No reintentables** (`retryable: false`): `cms.*` (certificado vencido o no confiable, firma
  inválida), `coe.notAuthorized`, `xml.*`, `wsn.notFound`, etc. **No se piden más TA para ese
  servicio** hasta `resetLoginCooldown(service)`, `clearTicket(service)` o `clearAllTickets()` (o
  hasta que pase `permanentErrorCooldownMs`, si se configura).
- **Desfase de reloj** (`xml.generationTime.invalid`, `xml.expirationTime.expired`): con
  `autoClockSkew` (default) el SDK ajusta el offset y reintenta una vez (ver abajo); si vuelve a
  fallar después de corregirlo, espera de `loginErrorCooldownMs`. Con `autoClockSkew: false` se
  lanza `ArcaAuthError` (`retryable: true`) sin espera: corregí el reloj o `clockOffsetMs`.
- **TA vigente** (`coe.alreadyAuthenticated` sin ticket utilizable): `ArcaTicketVigenteError`
  (`retryable: true`). Durante `alreadyAuthenticatedCooldownMs` (default: 2 minutos en producción
  y 10 en homologación, el lapso de retención del manual de WSAA) se rechaza sin llamar a WSAA.
- **Error de red sin enviar o abort**: sin espera.

Durante una espera, si hay un ticket por vencer todavía utilizable, se devuelve ese ticket.
`resetLoginCooldown()` limpia las esperas sin borrar tickets: usalo después de corregir la causa
(ej: autorizar el certificado para el servicio en ARCA).

### Reloj desfasado

Con `autoClockSkew: true` (default), si WSAA rechaza el TRA por el reloj, el SDK calcula el offset
desde el header `Date` de la respuesta, reintenta el login una sola vez y emite `auth:clock-skew`.
También se puede fijar a mano con `clockOffsetMs` (`relojARCA - relojLocal`, en ms).
`wsaa.clockOffsetMs` y `wsaa.now()` exponen el offset vigente. `xml.expirationTime.invalid`
(vigencia pedida mayor a 24 horas) es un error de configuración de `tokenTTLMinutes`, no de reloj.

## Base de los SDKs

Las clases principales de los SDKs (`ArcaCdc`, `ArcaSire`, `ArcaMtxca`...) extienden
`ArcaSdkBase`, y sus clientes de bajo nivel, `SoapServiceClient`. Sirven también para armar un
cliente propio de un web service de ARCA que todavía no tiene SDK:

```typescript
import { ArcaSdkBase, SoapServiceClient, parseServerStatus, statusOf } from '@ramiidv/arca-common';
import type { ArcaSdkConfig, CallOptions, ServerStatus } from '@ramiidv/arca-common';

const NS = 'http://ar.gob.afip.ws/miServicio/';
const ENDPOINTS = { production: 'https://.../miServicio', testing: 'https://...homo.../miServicio' };

class MiServicioClient extends SoapServiceClient {
  async dummy(opts?: CallOptions): Promise<ServerStatus> {
    return parseServerStatus(await this.soapCall('dummy', {}, { signal: opts?.signal }));
  }
}

class ArcaMiServicio extends ArcaSdkBase<'mi'> {
  readonly client: MiServicioClient;
  constructor(config: ArcaSdkConfig) {
    super(config, { mi: 'ws_mi_servicio' }); // nombre corto → id del servicio en WSAA
    this.client = new MiServicioClient({ endpoint: this.endpoint(ENDPOINTS), namespace: NS, transport: this.transport });
  }
  async consultar(opts?: CallOptions) {
    const { token, sign } = await this.ticket('mi', opts);
    // ... this.client.soapCall('consultar', { auth: { token, sign, cuit: this.cuit } }, this.callOptions(opts))
  }
  status() {
    return statusOf({ mi: () => this.client.dummy() });
  }
}
```

| API                                       | Descripción                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ArcaSdkBase`                             | Valida la CUIT representada, crea (o reutiliza con `config.wsaa`) el `WsaaClient`, reparte eventos a `onEvent` y a `on()`/`off()`, combina el `signal` global con el de cada llamada, elige endpoints por entorno y expone `clearAuthCache()`. Si `config.wsaa` es de otro entorno que `production` (y usa un endpoint oficial), lanza `ArcaValidationError` |
| `ArcaBaseConfig`                          | Config común a todos los SDKs (ver [Configuración de `WsaaClient`](#configuración-de-wsaaclient))                                                                                                                                                                                                                                                            |
| `ArcaSdkConfig`                           | `ArcaBaseConfig` + `wsaa?` (cliente compartido), `signal?` (cancela todo), `endpoints?.wsaa`                                                                                                                                                                                                                                                                 |
| `SoapServiceClient`                       | Guarda endpoint, namespace y transporte; `soapCall(method, params, opts)` llama a `arcaSoapCall`                                                                                                                                                                                                                                                             |
| `ServiceClientConfig`                     | `{ endpoint, transport? }`: la configuración de los clientes de bajo nivel de todos los SDKs (el namespace lo fija cada cliente)                                                                                                                                                                                                                             |
| `SoapServiceClientConfig`                 | `ServiceClientConfig` más `namespace`                                                                                                                                                                                                                                                                                                                        |
| `ServiceTransport` / `transportOptions()` | Opciones de transporte (timeout, reintentos, eventos, `fetch`, `legacyTls`) que se pasan a cada llamada                                                                                                                                                                                                                                                      |
| `createWsaaClient(config, onEvent?)`      | Arma un `WsaaClient` con las opciones de WSAA de una config de SDK                                                                                                                                                                                                                                                                                           |
| `parseServerStatus(result, method?)`      | Respuesta de un `dummy` → `ServerStatus` (valores tal cual). Lanza `ArcaResponseError` si falta un campo                                                                                                                                                                                                                                                     |
| `serverStatusOk(status)`                  | `true` si todos los servidores informados están en `OK` (sin distinguir mayúsculas)                                                                                                                                                                                                                                                                          |
| `statusOf(checks)` / `ServiceStatus`      | Consulta varios servicios en paralelo: `{ ok: true, status }` solo si respondió y todos los servidores están en `OK`; si no, `{ ok: false, error, status? }`                                                                                                                                                                                                 |
| `ArcaResponseError`                       | Respuesta con forma inesperada; `uncertain: true` en emisiones                                                                                                                                                                                                                                                                                               |
| `validateCuit`                            | Valida y normaliza la CUIT representada (ver Validadores)                                                                                                                                                                                                                                                                                                    |
| `anySignal(...signals)`                   | Combina varios `AbortSignal` (ignora los `undefined`) en uno que se aborta con cualquiera                                                                                                                                                                                                                                                                    |
| `safeEmit(onEvent, event)`                | Emite un `ArcaEvent` ignorando los errores del callback                                                                                                                                                                                                                                                                                                      |
| `collectErrors(fn, errors)`               | Corre una validación y acumula los `details` de un `ArcaValidationError` en `errors` en vez de lanzar (re-lanza cualquier otro error)                                                                                                                                                                                                                        |
| `collectErrorsWithPrefix(fn, errors, p)`  | Igual, prefijando `p.` al `field` de cada detalle                                                                                                                                                                                                                                                                                                            |

## SOAP

```typescript
import {
  soapCall,
  arcaSoapCall,
  checkServiceErrors,
  extractServiceErrors,
  formatServiceErrors,
  parseXml,
  buildXml,
} from '@ramiidv/arca-common';

// Bajo nivel (la respuesta parseada no tiene prefijos de namespace)
const result = await soapCall('https://wswhomo.afip.gov.ar/wsfev1/service.asmx', '<FEDummy xmlns="http://ar.gov.afip.dif.FEV1/"/>', {
  soapAction: 'http://ar.gov.afip.dif.FEV1/FEDummy',
  kind: 'consulta', // 'emision' = nunca reintentar
  signal: AbortSignal.timeout(60_000),
});

// Alto nivel: arma el body, llama y extrae el resultado del método
const data = await arcaSoapCall('https://wswhomo.afip.gov.ar/wsfev1/service.asmx', 'http://ar.gov.afip.dif.FEV1/', 'FEDummy', {}, {
  qualified: true, // <FEDummy xmlns="..."> (ASMX)
  soapActionFromMethod: true,
});
checkServiceErrors(data, 'WSFE'); // lanza ArcaServiceError
extractServiceErrors(data); // [{ code, msg, rawCode? }] sin lanzar
formatServiceErrors(extractServiceErrors(data)); // '[600] ..., [601] ...' (el formato de los mensajes de error)
```

- `buildXml` y `arcaSoapCall` **omiten** las propiedades `null`/`undefined` (no envían `<x/>`) y envían
  un `Date` como `xsd:dateTime` en hora de Argentina (`2026-11-01T08:30:00-03:00`).
- El parser decodifica referencias numéricas (`&#243;` → `ó`) y entidades HTML.
- Por defecto el parser convierte a `number` el texto numérico de menos de 8 dígitos (CUIT, CAE y
  fechas `YYYYMMDD` quedan como string). `parseNumbers: false` deja todo como string.
- Un SOAP Fault (con HTTP 500 o 200) es un `ArcaSoapError` con `faultCode`, `faultString` y
  `faultDetail` (el `<detail>`/`<Detail>`, SOAP 1.1 y 1.2).
- Un HTTP no-2xx sin Fault incluye un extracto del body (hasta 500 caracteres) en el mensaje y en
  `responseBody`.

### Reintentos e incertidumbre

Las **consultas** (`kind: 'consulta'`, default) reintentan (`retries`, default 1, backoff
`retryDelayMs * 2^(intento-1)`) los errores transitorios: red, timeout, HTTP 5xx sin Fault y
respuesta 2xx sin Envelope SOAP (ej: una página HTML de un proxy).
No reintentan SOAP Faults, 4xx ni errores de negocio.

Las **emisiones** (`kind: 'emision'`) nunca se reintentan. El error indica `uncertain: true`
cuando el servidor pudo haber procesado el request (timeout, conexión cortada, 5xx, respuesta
ilegible, Fault de tipo Server) y `uncertain: false` cuando hay certeza de que no (DNS, conexión
rechazada, 4xx, abortado antes de enviar, Fault de tipo `Client`/`Sender`).

### TLS legacy (DH de 1024 bits)

Algunos hosts de producción de ARCA (`servicios1.afip.gov.ar`: WSFEv1, WSFEX y WSCDC) negocian
Diffie-Hellman de 1024 bits, que Node rechaza con `ERR_SSL_DH_KEY_TOO_SMALL`. Con
`legacyTls: 'auto'` (default) el mismo request se reintenta una vez por `node:https` con
`ciphers: 'DEFAULT@SECLEVEL=1'` (seguro incluso en emisiones: el request no se envió) y el host se
recuerda. `'never'` lo desactiva y `'always'` lo usa siempre. Con un `fetch` inyectado no hay fallback.

## Validadores

```typescript
import { validateCuit, normalizeCuit, formatCuit, isValidCuit, validateCBU } from '@ramiidv/arca-common';

validateCuit('20-12345678-6'); // "20123456786" (acepta number, guiones, puntos y espacios)
validateCuit('50100000005'); // prefijos 20, 23, 24, 27, 30, 33, 34 y CUIT país / exterior 50, 51, 55
normalizeCuit('20.12345678.6'); // "20123456786"
formatCuit(20123456786); // "20-12345678-6"
isValidCuit('20123456789'); // false

validateCBU('0110599-5 00000041817221'); // "0110599500000041817221" (quita espacios y guiones)
```

Las funciones de CUIT sirven también para CUIL (mismo algoritmo). `isValidCBU` devuelve `boolean` sin
lanzar.

## Fechas, redondeo y QR

```typescript
import {
  formatDate,
  parseArcaDate,
  formatDateTimeAR,
  validateFechaRango,
  diasEntre,
  roundHalfEven,
  roundHalfUp,
  generarUrlQR,
} from '@ramiidv/arca-common';

// Todo en hora de Argentina (America/Argentina/Buenos_Aires), sin importar la zona del proceso
formatDate(new Date()); // "20260331"
formatDate('2026-03-31'); // "20260331" (literal, valida que exista)
parseArcaDate('20260331'); // 2026-03-31T15:00:00.000Z (mediodía de Argentina)
formatDateTimeAR(new Date()); // "2026-03-31T14:05:09-03:00"
formatDateTimeAR(new Date(), { millis: true }); // "2026-03-31T14:05:09.123-03:00"
validateFechaRango('20260301', '20260301'); // OK: fin puede ser igual a inicio (no anterior)
diasEntre('2026-03-01', '20260304'); // 3 (días de calendario de Argentina)

roundHalfEven(8.565, 2); // 8.56 (Round Half Even, el de los manuales de ARCA)
roundHalfUp(8.565, 2); // 8.57

generarUrlQR({
  fecha: '2026-03-28', cuit: 20123456786, ptoVta: 1, tipoCmp: 6, nroCmp: 150,
  importe: 121, moneda: 'PES', ctz: 1, tipoDocRec: 99, nroDocRec: 0, codAut: '74512345678901',
}); // "https://www.arca.gob.ar/fe/qr/?p=..."
```

`generarUrlQR` sigue la [especificación del QR](https://arca.gob.ar/fe/qr/documentos/QRespecificaciones.pdf):
importe a 2 decimales y `ctz` a 6 (mitad al par, hasta 13 enteros), punto de venta de hasta 5 dígitos,
tipo de comprobante de hasta 3, número de comprobante de hasta 8, `moneda` de 3 caracteres,
`tipoDocRec` de hasta 2 dígitos y `nroDocRec` de hasta 20 (como string si no entra en un `number`).

## Errores

| Clase                    | Cuándo se lanza                                                                                                                        | Propiedades extra                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `ArcaError`              | Clase base                                                                                                                             | `code`                                                                                                                |
| `ArcaAuthError`          | Login WSAA fallido o en espera, respuesta de WSAA inválida                                                                             | `faultCode?`, `statusCode?`, `retryable`, `cause`                                                                     |
| `ArcaTicketVigenteError` | WSAA ya emitió un TA vigente que no está en memoria ni en el storage                                                                   | `service`, `retryAfterMs?`; extiende `ArcaAuthError` (`retryable: true`)                                              |
| `ArcaSoapError`          | Error HTTP, timeout, SOAP Fault                                                                                                        | `statusCode?`, `faultCode?`, `faultString?`, `faultDetail?`, `responseBody?`, `responseDate?`, `uncertain`, `aborted` |
| `ArcaServiceError`       | Error de negocio de ARCA (códigos funcionales)                                                                                         | `errors: { code, msg, rawCode? }[]`                                                                                   |
| `ArcaRechazoError`       | ARCA rechazó una emisión (`resultado: 'R'` o equivalente): no se emitió nada. Lo lanzan todos los SDKs en lugar de devolver el rechazo | `operacion`, `errors`, `observaciones`; extiende `ArcaServiceError`                                                   |
| `ArcaValidationError`    | Datos de entrada inválidos (también cert/clave/config)                                                                                 | `field?`, `details: ValidationErrorDetail[]`                                                                          |
| `ArcaResponseError`      | Respuesta con forma inesperada                                                                                                         | `uncertain`                                                                                                           |

`ArcaTicketVigenteError` extiende `ArcaAuthError` con `retryable: true`: se resuelve esperando.
`retryAfterMs` es lo que falta para que el cliente vuelva a llamar a WSAA (no viene con
`alreadyAuthenticatedCooldownMs: 0`). Chequealo **antes** que `ArcaAuthError`.

```typescript
try {
  await wsaa.getAccessTicket('wsfe');
} catch (e) {
  if (e instanceof ArcaTicketVigenteError) {
    // Hay un TA vigente que no tenemos: reintentar después de e.retryAfterMs
  } else if (e instanceof ArcaAuthError) {
    console.error(e.faultCode, e.retryable, e.cause);
    if (!e.retryable) {
      // corregir la causa y después: wsaa.resetLoginCooldown('wsfe')
    }
  }
}
```

Todos los errores tienen un `code` estable (`"ARCA_AUTH_ERROR"`, `"ARCA_TICKET_VIGENTE"`,
`"ARCA_SOAP_ERROR"`...) y `instanceof` funciona aunque haya más de una copia del paquete cargada.
Las subclases propias tienen que declarar `static readonly code`. Los callbacks de `onEvent` nunca
rompen una llamada: si lanzan, el error se ignora.

## Schemas del XSD (`@ramiidv/arca-common/schema`)

Mini-DSL con el que los SDKs describen los tipos complejos de cada WSDL. Con el mismo schema se
valida y codifica un request (orden del XSD, obligatorios, rangos, CUIT, decimales, fechas) y se
decodifica una respuesta pedida con `parseNumbers: false`.

```typescript
import { decodeResponse, encodeRequest, importe, nonEmptyStr, porcentaje, int, must, obj, wrapped } from '@ramiidv/arca-common/schema';

declare const input: unknown; // datos del usuario
declare const result: unknown; // nodo de la respuesta SOAP

const Item = { descripcion: nonEmptyStr({ max: 4000 }), precio: importe(), iva: porcentaje(), cantidad: int(1) };
const body = encodeRequest(input, { items: wrapped('item', obj(Item)) }, 'autorizar'); // ArcaValidationError con todos los errores
const resp = decodeResponse(result, { numero: must(int()) }, 'autorizarResponse', { kind: 'emision' });
```

- `nonEmptyStr({ min?, max? })`: string que no puede estar vacío ni tener solo espacios.
- `str()` rechaza los caracteres que XML 1.0 no admite (controles salvo tab, LF y CR; U+FFFE y
  U+FFFF) y los surrogates UTF-16 sueltos.
- `datetime()` acepta `Date` (se envía en hora de Argentina) o un string ISO-8601 con segundos.
- `list(f, minItems?, maxItems?)` / `wrapped(item, f, minItems?, maxItems?)`: en requests se verifica la
  cantidad de elementos.
- `dec(digits, ...)` redondea a `digits` decimales mitad al par (Round Half Even, el método que
  indican los manuales de ARCA): `8.565` → `8.56`, `8.575` → `8.58`.
- `importe(max?)`: `dec(2, 0, max)`. `porcentaje()`: `dec(2, 0, 100)`.
- `decodeResponse(..., { kind: 'emision' })`: el error por defecto es un `ArcaResponseError` con
  `uncertain: true`. `error` (fábrica propia) tiene prioridad.
- También exporta `formatDateTimeAR`, `roundHalfUp` y `roundHalfEven`.

`@ramiidv/arca-common/testing` incluye `loadXsdTypes` y `checkSchemaAgainstXsd` para tests de
contrato contra el WSDL oficial, además de `mockFetch`, `soapResponse`, `soapFault`, `testCert`
(certificado autofirmado válido) y `fakeTicketStorage`.

## Configuración de `WsaaClient`

| Parámetro                        | Tipo                            | Default             | Descripción                                                                           |
| -------------------------------- | ------------------------------- | ------------------- | ------------------------------------------------------------------------------------- |
| `cert`                           | `string`                        | —                   | Certificado X.509 en PEM                                                              |
| `key`                            | `string`                        | —                   | Clave privada RSA en PEM (PKCS#1 o PKCS#8), tiene que corresponder al certificado     |
| `keyPassphrase`                  | `string`                        | —                   | Contraseña de la clave, si está encriptada                                            |
| `production`                     | `boolean`                       | `false`             | Usar WSAA de producción                                                               |
| `endpoint`                       | `string`                        | —                   | URL propia de WSAA (proxy, mock)                                                      |
| `tokenTTLMinutes`                | `number`                        | `720`               | Vigencia del TRA (1 a 1440). No es la vida del TA                                     |
| `timeout`                        | `number`                        | `30000`             | Timeout HTTP en ms                                                                    |
| `retries`                        | `number`                        | `1`                 | Reintentos del login, solo ante errores de red sin enviar                             |
| `retryDelayMs`                   | `number`                        | `1000`              | Delay base del backoff exponencial                                                    |
| `onEvent`                        | `function`                      | —                   | Callback de eventos                                                                   |
| `ticketStorage`                  | `TicketStorage`                 | —                   | Persistencia de tickets entre reinicios (recomendado)                                 |
| `clockOffsetMs`                  | `number`                        | `0`                 | Offset `relojARCA - relojLocal` en ms                                                 |
| `autoClockSkew`                  | `boolean`                       | `true`              | Ajustar el offset si WSAA rechaza el TRA por reloj                                    |
| `loginErrorCooldownMs`           | `number`                        | `60000`             | Espera tras un error transitorio (`0` = sin espera)                                   |
| `permanentErrorCooldownMs`       | `number`                        | `Infinity`          | Espera tras un error no reintentable (`Infinity` = hasta limpiarla; `0` = sin espera) |
| `alreadyAuthenticatedCooldownMs` | `number`                        | `120000` / `600000` | Espera tras `coe.alreadyAuthenticated` (producción / homologación; `0` = sin espera)  |
| `fetch`                          | `typeof fetch`                  | `globalThis.fetch`  | `fetch` propio (proxy, mTLS, tests)                                                   |
| `legacyTls`                      | `'auto' \| 'never' \| 'always'` | `'auto'`            | Transporte TLS legacy para hosts con DH de 1024 bits                                  |

`ArcaBaseConfig`, la config común de los SDKs, tiene los mismos campos que esta tabla (incluidos
`loginErrorCooldownMs`, `permanentErrorCooldownMs` y `alreadyAuthenticatedCooldownMs`) salvo
`endpoint` (en los SDKs es `endpoints.wsaa`), más `cuit` (CUIT representada, se valida el dígito verificador). En un SDK,
`timeout`, `retries`, `retryDelayMs`, `fetch` y `legacyTls` aplican también a las llamadas al web
service: `retries` reintenta las consultas ante errores transitorios (las emisiones nunca).

Métodos y propiedades: `getAccessTicket(service, { signal }?)`, `clearTicket(service)`,
`clearAllTickets()`, `resetLoginCooldown(service?)`, `ticketKey(service)`, `clockOffsetMs`,
`now()`, `endpoint`, `production`.

## Eventos

| Evento               | Cuándo                                                | Datos                                      |
| -------------------- | ----------------------------------------------------- | ------------------------------------------ |
| `auth:login`         | Nuevo ticket obtenido                                 | `service`, `durationMs`                    |
| `auth:cache-hit`     | Ticket reutilizado                                    | `service`, `source` (`memory` / `storage`) |
| `auth:clock-skew`    | Se ajustó el offset de reloj                          | `service`, `offsetMs`, `previousOffsetMs`  |
| `auth:storage-error` | Falló el `ticketStorage` (no interrumpe la operación) | `service`, `operation`, `error`            |
| `request:start`      | Antes de una llamada SOAP                             | `method`, `endpoint`                       |
| `request:end`        | Llamada SOAP completada                               | `method`, `endpoint`, `durationMs`         |
| `request:retry`      | Reintentando tras un error                            | `method`, `endpoint`, `attempt`, `error`   |
| `request:error`      | Llamada SOAP fallida                                  | `method`, `endpoint`, `error`              |

## Constantes

| Constante        | Descripción                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| `WSAA_ENDPOINTS` | URLs de WSAA (`testing`, `production`)                                                                 |
| `WSAA_NAMESPACE` | Namespace XML de WSAA                                                                                  |
| `AR_TIMEZONE`    | `"America/Argentina/Buenos_Aires"`                                                                     |
| `QR_URL`         | URL base del QR (`https://www.arca.gob.ar/fe/qr/`)                                                     |
| `DocTipo`        | Tipos de documento de `FEParamGetTiposDoc` (CUIT=80, CUIL=86, DNI=96, cédulas provinciales 0-24, etc.) |
| `Provincia`      | Códigos de provincia de ARCA (0-24, sin 15: Chaco=16, Tierra del Fuego=24)                             |
| `CondicionIva`   | Condición frente al IVA (`CondicionIVAReceptorId` de WSFEv1)                                           |

## Ejemplos

Ver la carpeta [`examples/`](./examples/):

- [`autenticacion-wsaa.ts`](./examples/autenticacion-wsaa.ts) — Login WSAA, cache de tickets, esperas
- [`validar-cuit-cbu.ts`](./examples/validar-cuit-cbu.ts) — `validateCuit`, `isValidCuit`, `formatCuit`, CBU
- [`fechas-afip.ts`](./examples/fechas-afip.ts) — `formatDate`, `parseArcaDate`, `formatDateTimeAR`
- [`manejo-errores.ts`](./examples/manejo-errores.ts) — Jerarquía de errores, `faultCode`/`retryable`

## Licencia

MIT
