# @ramiidv/arca-cdc

[![npm](https://img.shields.io/npm/v/@ramiidv/arca-cdc)](https://www.npmjs.com/package/@ramiidv/arca-cdc)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

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

- Node.js >= 18
- Certificado digital X.509 y clave privada de ARCA, con el servicio **`wscdc`** asociado
  - **Homologación**: [WSASS](https://wsass-homo.afip.gob.ar/wsass/portal/main.aspx)
  - **Producción**: [Administración de Certificados Digitales](https://www.afip.gob.ar/ws/documentacion/certificados.asp)

## Uso rápido

```typescript
import fs from "node:fs";
import { ArcaCdc } from "@ramiidv/arca-cdc";

const cdc = new ArcaCdc({
  cuit: 20123456786, // CUIT representada (quien consulta)
  cert: fs.readFileSync("./cert.crt", "utf-8"),
  key: fs.readFileSync("./key.key", "utf-8"),
  production: false,
});

const r = await cdc.constatar({
  CbteModo: "CAE",              // CAE | CAI | CAEA
  CuitEmisor: 30712345671,      // CUIT de quien emitió el comprobante
  PtoVta: 1,
  CbteTipo: 1,                  // Factura A
  CbteNro: 150,
  CbteFch: "20260315",          // YYYYMMDD, YYYY-MM-DD o Date
  ImpTotal: 12100,
  CodAutorizacion: "73429843294823",
  DocTipoReceptor: 80,          // opcional (obligatorio en comprobantes A)
  DocNroReceptor: 20123456786,  // se informa junto con DocTipoReceptor
});

if (r.Resultado === "A") {
  console.log("Constatado", r.FchProceso, r.Observaciones); // puede traer observaciones no excluyentes (ej: 200)
} else {
  console.log("Rechazado:", r.Observaciones);              // ej: [{ Code: 100, Msg: "..." }]
}
```

## Configuración

`ArcaCdcConfig` extiende `ArcaBaseConfig` de `@ramiidv/arca-common`:

| Opción | Tipo | Default | Descripción |
| --- | --- | --- | --- |
| `cuit` | `number \| string` | -- | CUIT representada (se valida el dígito verificador) |
| `cert` / `key` | `string` | -- | Certificado y clave privada (PEM) |
| `production` | `boolean` | `false` | Producción u homologación |
| `timeout` | `number` | `30000` | Timeout HTTP (ms) |
| `retries` | `number` | `1` | Reintentos ante errores transitorios (todas las operaciones son consultas) |
| `retryDelayMs` | `number` | `1000` | Delay inicial del backoff exponencial |
| `tokenTTLMinutes` | `number` | `720` | Vigencia pedida a WSAA |
| `ticketStorage` | `TicketStorage` | memoria | Persistencia del ticket WSAA (recomendado en producción; ver `FileTicketStorage`) |
| `clockOffsetMs` / `autoClockSkew` | | `0` / `true` | Ajuste de reloj para WSAA |
| `loginErrorCooldownMs` | `number` | `60000` | Espera tras un login WSAA fallido |
| `fetch` | `typeof fetch` | global | `fetch` propio (proxy, tests) |
| `legacyTls` | `'auto' \| 'never' \| 'always'` | `'auto'` | Transporte TLS legacy (ver abajo) |
| `endpoints` | `{ wscdc?, wsaa? }` | -- | Sobrescribe las URLs |
| `onEvent` | `(e: ArcaEvent) => void` | -- | Eventos (auth, requests, reintentos) |

## Métodos

Todos aceptan un último parámetro opcional `opts?: { signal?: AbortSignal }`.

| Método | Operación WSCDC | Devuelve |
| --- | --- | --- |
| `constatar(input)` | `ComprobanteConstatar` | `ConstatarResult` |
| `status()` | `ComprobanteDummy` (sin auth) | `{ appserver, dbserver, authserver }` |
| `getModalidades()` | `ComprobantesModalidadConsultar` | `{ Cod, Desc, FchDesde?, FchHasta? }[]` (`Cod`: `CAE`, `CAI`, `CAEA`) |
| `getTiposCbte()` | `ComprobantesTipoConsultar` | `{ Id: number, Desc }[]` |
| `getDocTipos()` | `DocumentosTipoConsultar` | `{ Id: string, Desc }[]` |
| `getTiposOpcionales()` | `OpcionalesTipoConsultar` | `{ Id: string, Desc }[]` |
| `clearAuthCache()` | -- | `Promise<void>`: descarta los tickets WSAA |

### `constatar(input)`

```typescript
interface ConstatarInput {
  CbteModo: "CAE" | "CAI" | "CAEA";
  CuitEmisor: number | string;      // 11 dígitos, con o sin guiones
  PtoVta: number;                   // 1..99998
  CbteTipo: number;                 // ver getTiposCbte()
  CbteNro: number;                  // 1..99999999
  CbteFch: string | Date;           // se envía YYYYMMDD
  ImpTotal: number;                 // >= 0, se redondea a 2 decimales; 0 si el comprobante no tiene total
  CodAutorizacion: string;          // 14 dígitos
  DocTipoReceptor?: number | string;// ver getDocTipos(); se informa junto con DocNroReceptor
  DocNroReceptor?: number | string; // solo dígitos (CUIT validado si DocTipoReceptor = 80)
  Opcionales?: { Id: string; Valor: string }[]; // ver getTiposOpcionales()
}

interface ConstatarResult {
  Resultado: "A" | "R";
  FchProceso: string;               // YYYYMMDDHHMMSS
  CmpResp?: ComprobanteConstatado;  // los datos del comprobante tal como los devuelve ARCA
  Observaciones: { Code: number; Msg: string }[];
  Events: { Code: number; Msg: string }[];
}
```

Cómo interpretar la respuesta (manual WSCDC, 2.2.3):

- **`Resultado: 'A'`**: el comprobante está registrado y autorizado. Puede traer observaciones no
  excluyentes (ej: `200`, CAEA aún no rendido pero en plazo).
- **`Resultado: 'R'`**: rechazo por validaciones funcionales (`100` código inexistente, `102` CUIT
  emisor no coincide, `110` importe no coincide, etc.). El detalle está en `Observaciones`.
- **`Errors` de ARCA** (validaciones de formato `1`-`10`, autenticación `600`-`602`,
  infraestructura `500`-`503`): el SDK **lanza `ArcaServiceError`**, porque el comprobante no se
  llegó a constatar. ARCA en esos casos también responde `Resultado: R`, pero no significa que el
  comprobante sea inválido.

El importe se compara con margen: error relativo <= 0,01% o absoluto <= 1 (manual, 2.8).

## Manejo de errores

```typescript
import {
  ArcaAuthError,
  ArcaTicketVigenteError,
  ArcaServiceError,
  ArcaSoapError,
  ArcaValidationError,
} from "@ramiidv/arca-cdc";

try {
  await cdc.constatar(input);
} catch (e) {
  if (e instanceof ArcaValidationError) {
    e.details; // [{ field, message, value }] — no se llamó a ARCA
  } else if (e instanceof ArcaTicketVigenteError) {
    // WSAA ya emitió un ticket para este certificado: configurá ticketStorage
  } else if (e instanceof ArcaAuthError) {
    // login WSAA fallido
  } else if (e instanceof ArcaServiceError) {
    e.errors; // [{ code, msg }] tal cual los devuelve ARCA
  } else if (e instanceof ArcaSoapError) {
    e.statusCode; e.faultString; // transporte / SOAP Fault / respuesta inválida
  }
}
```

Como todas las operaciones son consultas, ante un timeout o error de red alcanza con repetir la
misma llamada (el SDK ya reintenta `retries` veces).

## Entornos

| Entorno | WSCDC |
| --- | --- |
| Homologación | `https://wswhomo.afip.gov.ar/WSCDC/service.asmx` |
| Producción | `https://servicios1.afip.gov.ar/WSCDC/service.asmx` |

- El manual menciona `servicios1.arca.gob.ar` para producción, pero ese host presenta un certificado
  emitido solo para `servicios1.afip.gov.ar` y la validación TLS falla; por eso el SDK usa
  `servicios1.afip.gov.ar`.
- **TLS legacy**: el host de producción negocia Diffie-Hellman de 1024 bits, que Node >= 17 rechaza
  (`ERR_SSL_DH_KEY_TOO_SMALL`). Con `legacyTls: 'auto'` (default), `@ramiidv/arca-common` reintenta
  ese handshake una vez con `ciphers: 'DEFAULT@SECLEVEL=1'` y recuerda el host. Con un `fetch`
  propio no hay fallback: tu `fetch` tiene que aceptar DH de 1024 bits.

## Cliente de bajo nivel

```typescript
import { CdcClient, WSCDC_ENDPOINTS } from "@ramiidv/arca-cdc";

const client = new CdcClient({ endpoint: WSCDC_ENDPOINTS.testing });
await client.dummy();

const ticket = await cdc.wsaa.getAccessTicket("wscdc");
const auth = { Token: ticket.token, Sign: ticket.sign, Cuit: "20123456786" };
await client.constatar(auth, input);
await client.getTiposOpcionales(auth);
```

## Eventos

`onEvent` recibe `auth:login`, `auth:cache-hit`, `auth:clock-skew`, `auth:storage-error`,
`request:start`, `request:end`, `request:retry` y `request:error` (ver `ArcaEvent` en
`@ramiidv/arca-common`).

## Licencia

MIT
