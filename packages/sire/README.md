# @ramiidv/arca-sire

SDK de TypeScript para el web service **SIRE** de ARCA (ex AFIP): emisión y anulación de **certificados de retención electrónicos de IVA** (formulario C2005, RG 4523/2019).

El servicio oficial tiene tres operaciones y el SDK las cubre todas:

| Operación ARCA | Método del SDK        | Qué hace                                                                        |
| -------------- | --------------------- | ------------------------------------------------------------------------------- |
| `emitir`       | `emitirCertificado()` | Emite un certificado C2005 y devuelve `certificadoNro` y `codigoSeguridad`.     |
| `anular`       | `anularCertificado()` | Anula un certificado emitido y devuelve los datos del certificado de anulación. |
| `dummy`        | `status()`            | Estado de los servidores y del ambiente (sin autenticación).                    |

SIRE **no tiene operaciones de consulta** (ni de certificados emitidos ni de tablas de parámetros). Los certificados se consultan e imprimen desde el [micrositio SIRE](https://www.arca.gob.ar/sire/) con clave fiscal.

Fuentes: [WSDL](https://ws-aplicativos-reca.afip.gob.ar/sire/ws/v1/c2005/2005?wsdl), [XSD](https://ws-aplicativos-reca.afip.gob.ar/sire/ws/v1/c2005/C2005_schema.xsd) y el [manual para el desarrollador v1.0.3](https://www.afip.gob.ar/sire/documentos/SOAP-SIRE-IVA-Manualparaeldesarrollador_V1_0_0.pdf). El SDK usa los hosts `afip.gob.ar` del WSDL; el manual publica los equivalentes `arca.gob.ar` (ver [Entornos](#entornos)).

## Instalación

```bash
npm install @ramiidv/arca-sire
```

## Requisitos

- Node >= 22.12. Solo ESM; también funciona desde CommonJS porque Node ≥ 22.12 permite cargar módulos ESM con `require()`.
- Certificado digital X.509 y clave privada de ARCA asociados al web service **SIRE** (servicio WSAA `sire-ws`), para la CUIT del agente de retención. Cómo generarlo y asociar el servicio: [`@ramiidv/arca-common`, Primeros pasos](https://github.com/ramiidv/arca-sdks/tree/main/packages/common#primeros-pasos).
  - **Homologación**: [WSASS](https://wsass-homo.afip.gob.ar/wsass/portal/main.aspx)
  - **Producción**: [Administración de Certificados Digitales](https://www.afip.gob.ar/ws/documentacion/certificados.asp)
- Acceso con clave fiscal al [micrositio SIRE](https://www.arca.gob.ar/sire/) para consultar e imprimir los certificados.

## Inicio rápido

```typescript
import { readFileSync } from 'node:fs';
import { ArcaSire, Condicion, TipoComprobante } from '@ramiidv/arca-sire';

const sire = new ArcaSire({
  cert: readFileSync('./certs/certificado.crt', 'utf-8'),
  key: readFileSync('./certs/clave.key', 'utf-8'),
  cuit: '20123456786', // CUIT del agente de retención (cuitAgente)
  production: false, // homologación
});

const { certificadoNro, codigoSeguridad } = await sire.emitirCertificado({
  codigoTrazabilidad: 'OP-2026-000123', // opcional, tu identificador (hasta 36 caracteres)
  regimen: 831,
  condicion: Condicion.INSCRIPTO,
  fechaRetencion: '2026-10-30T11:16:00', // hora de Argentina
  imposibilidadRetencion: false,
  importeRetencion: 2100,
  importeBaseCalculo: 20000,
  regimenExclusion: false,
  tipoComprobante: TipoComprobante.FACTURA,
  fechaComprobante: '2026-10-30',
  numeroComprobante: '00003-00008497',
  importeComprobante: 24200,
  cuitRetenido: '30500010912',
});
```

## Configuración

`ArcaSireConfig` extiende `ArcaSdkConfig` de `@ramiidv/arca-common`:

| Opción                                                                                                                                                     | Descripción                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `cert`, `key`, `keyPassphrase`                                                                                                                             | Certificado y clave privada en PEM (y la contraseña de la clave, si está encriptada).        |
| `cuit`                                                                                                                                                     | CUIT del agente de retención (se valida el dígito verificador y se envía como `cuitAgente`). |
| `production`                                                                                                                                               | `true` para producción (default: homologación).                                              |
| `endpoints`                                                                                                                                                | `{ sire?, wsaa? }` para usar otras URLs (proxy).                                             |
| `wsaa`                                                                                                                                                     | `WsaaClient` compartido con otros SDKs (tiene que ser del mismo entorno que `production`).   |
| `signal`                                                                                                                                                   | `AbortSignal` global: cancela todas las llamadas de la instancia.                            |
| `timeout`, `retries`, `retryDelayMs`                                                                                                                       | Transporte. Los reintentos solo aplican a `status()`; `emitir`/`anular` nunca se reintentan. |
| `ticketStorage`, `tokenTTLMinutes`, `clockOffsetMs`, `autoClockSkew`, `loginErrorCooldownMs`, `permanentErrorCooldownMs`, `alreadyAuthenticatedCooldownMs` | WSAA (ver `@ramiidv/arca-common`). Usá `ticketStorage` en producción.                        |
| `fetch`, `legacyTls`                                                                                                                                       | `fetch` propio y transporte TLS legacy.                                                      |
| `onEvent`                                                                                                                                                  | Eventos `auth:*` y `request:*`.                                                              |

## API

Todos los métodos aceptan `opts?: { signal?: AbortSignal }`.

### `emitirCertificado(params, opts?): Promise<CertificadoResult>`

`version` (100) e `impuesto` (216, IVA) se completan solos. Campos (`EmitirCertificadoParams`, en el orden del XSD):

| Campo                               | Tipo                  | Obligatorio                 | Notas (manual)                                                                                                                                           |
| ----------------------------------- | --------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `codigoTrazabilidad`                | string ≤ 36           | no                          | Texto libre.                                                                                                                                             |
| `regimen`                           | int ≤ 3 dígitos       | sí                          | Existente en la tabla REGIMEN del impuesto 216 (lo valida ARCA).                                                                                         |
| `fechaRetencion`                    | `FechaHora`           | sí                          | Desde el 01/12/2019.                                                                                                                                     |
| `condicion`                         | `Condicion`           | para el régimen 831         | 1 Inscripto, 2 No inscripto.                                                                                                                             |
| `imposibilidadRetencion`            | boolean               | sí                          | `true` = retención no efectuada.                                                                                                                         |
| `motivoNoRetencion`                 | string ≤ 30           | si `imposibilidadRetencion` |                                                                                                                                                          |
| `importeRetencion`                  | number                | sí                          | 11 enteros + 2 decimales.                                                                                                                                |
| `importeBaseCalculo`                | number                | sí                          |                                                                                                                                                          |
| `regimenExclusion`                  | boolean               | sí                          |                                                                                                                                                          |
| `porcentajeExclusion`               | 50 \                  | 100                         | si `regimenExclusion`                                                                                                                                    |
| `fechaPublicacion`                  | `FechaHora`           | si `regimenExclusion`       | Publicación del certificado de exclusión.                                                                                                                |
| `tipoComprobante`                   | `TipoComprobante`     | sí                          | Tabla TIPO_COMPROBANTE.                                                                                                                                  |
| `fechaComprobante`                  | `FechaHora`           | sí                          | ≤ `fechaRetencion`; en los tipos 3, 19 y 20 debe ser igual a `fechaRetencion`.                                                                           |
| `numeroComprobante`                 | string                | sí (todos los tipos)        | `99999-99999999` para 1-4 y 17-20; hasta 16 caracteres (letras, dígitos, `-` `/` `.`) para 5, 9 y 11; hasta 12 para 6.                                   |
| `coe`, `coeOriginal`, `cae`         | string ≤ 12 / 12 / 14 | no                          | El manual dice "completar con espacios hasta que se incorporen los regímenes": si no corresponde, omitilos. Con solo espacios dan `ArcaValidationError`. |
| `importeComprobante`                | number                | sí                          | Negativo solo en los tipos 19 y 20 (liquidaciones "con valor negativo").                                                                                 |
| `motivoEmisionNotaCredito`          | string ≤ 30           | solo tipo 3                 |                                                                                                                                                          |
| `cuitRetenido`                      | CUIT/CUIL/CDI         | sí                          | Se valida el dígito verificador y el prefijo (20, 23, 24, 27, 30, 33, 34, 50, 51, 55) y se envía como número.                                            |
| `numeroCertificadoOriginal`         | string ≤ 25           | solo tipos 3, 19, 20        |                                                                                                                                                          |
| `fechaRetencionCertificadoOriginal` | `FechaHora`           | solo tipos 3, 19, 20        |                                                                                                                                                          |
| `importeCertificadoOriginal`        | number                | solo tipos 3, 19, 20        |                                                                                                                                                          |

`FechaHora` es `Date` o string (`YYYY-MM-DD`, `YYYYMMDD`, `YYYY-MM-DDThh:mm[:ss[.SSS]]` en hora de Argentina, o con zona `Z`/`±hh:mm`). Se envía siempre como `AAAA-MM-DDThh:mm:ss.SSS-03:00`.

Reglas de fechas del manual (3.2.2) que el SDK valida antes de llamar, comparando **fechas calendario de Argentina** (la hora no cuenta):

- `fechaRetencion` a partir del 2019-12-01.
- `fechaComprobante` ≤ `fechaRetencion`.
- Para los tipos 3, 19 y 20, `fechaComprobante` = `fechaRetencion`.

Importes: números finitos, redondeados a 2 decimales mitad al par (`2100` → `2100.00`, `1.005` → `1.00`), con hasta 11 enteros. `NaN` e `Infinity` se rechazan. El manual no dice si los importes llevan signo: el SDK exige ≥ 0 en todos salvo `importeComprobante` de los tipos 19 y 20, que por definición tienen valor negativo.

`numeroComprobante` para los tipos 5, 6, 9 y 11 (`X(n)`): el manual dice "caracteres alfanuméricos", así que el SDK acepta letras y dígitos, más los separadores `-`, `/` y `.` (no espacios ni caracteres no ASCII); ARCA valida el resto.

`cuitRetenido`: el manual dice "CUIT/CUIL/CDI existente en ARCA". La CDI tiene el mismo formato de 11 dígitos con dígito verificador; ARCA no publica qué prefijos usa, así que el SDK acepta los mismos que `validateCuit` de common. Si existe o no lo valida ARCA.

Devuelve `{ certificadoNro, codigoSeguridad }` (strings). Con ambos datos se imprime el certificado desde el micrositio SIRE.

### `anularCertificado(params, opts?): Promise<CertificadoResult>`

```typescript
import { ArcaSire, MotivoAnulacion } from '@ramiidv/arca-sire';

declare const sire: ArcaSire;
declare const certificadoNro: string;

const anulacion = await sire.anularCertificado({
  numeroCertificado: certificadoNro,
  motivoAnulacion: MotivoAnulacion.CUIT_ERRONEA_SUJETO_RETENIDO,
  codigoTrazabilidad: 'ANUL-OP-2026-000123', // opcional
});
// anulacion.certificadoNro / codigoSeguridad: el certificado que anula al informado
```

### `status(opts?): Promise<SireServerStatus>`

`{ appserver, dbserver, authserver }`, cada uno `"OK"` si funciona, más `headerInfo` con el `HeaderInfo` que SIRE devuelve en el header SOAP: `{ ambiente, fecha, vCore, v2005 }` (ej: `ambiente: "homologacion - 207"`). Sirve para comprobar que estás apuntando al entorno correcto.

### Tablas

Constantes tomadas del anexo del manual:

- `TipoComprobante`: 1 Factura, 2 Recibo, 3 Nota de crédito, 4 Nota de débito, 5 Otro comprobante, 6 Orden de pago, 9 Escritura pública, 11 Factura (16 dígitos), 17/18 Liquidación de servicios públicos clase A/B, 19/20 ídem con valor negativo.
- `Condicion`: 1 Inscripto, 2 No inscripto.
- `MotivoAnulacion`: 1 CUIT errónea del sujeto retenido, 2 Fecha de la retención errónea, 3 Régimen incorrecto, 4 Otros.
- `REGIMENES_CON_CONDICION`: `[831]` (tabla REGIMEN_CONDICION).
- `SIRE_VERSION` (100), `IMPUESTO_IVA` (216), `SIRE_SERVICE_ID` (`sire-ws`), `SIRE_NAMESPACE`.

El manual no publica la tabla REGIMEN completa: los regímenes válidos los valida ARCA.

### Bajo nivel

`sire.client` (`SireClient`) expone `dummy()`, `emitir(auth, cuitAgente, certificado)` y `anular(auth, cuitAgente, certificadoAnulacion)` con datos ya serializados (`buildCertificadoRequest`/`buildAnulacionRequest` los arman y validan). `sire.wsaa` es el `WsaaClient`.

Para crearlo a mano se usa `{ endpoint, transport? }` (`ServiceClientConfig` de `@ramiidv/arca-common`, igual que en los demás SDKs); el namespace lo fija el cliente (`SIRE_NAMESPACE`). Las opciones de transporte van dentro de `transport`:

```typescript
import { ENDPOINTS, SireClient } from '@ramiidv/arca-sire';

const client = new SireClient({
  endpoint: ENDPOINTS.sire.testing,
  transport: { timeout: 30_000, retries: 1 }, // los reintentos solo aplican a dummy()
});
console.log(await client.dummy());
```

## Manejo de errores

| Error                                                | Cuándo                                                                                                                                                                                                                                                                 | ¿Se emitió/anuló? |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `ArcaValidationError`                                | Datos inválidos detectados localmente (antes de autenticar). `details` tiene un ítem por campo.                                                                                                                                                                        | No                |
| `ArcaAuthError` / `ArcaTicketVigenteError`           | Falla de WSAA, o SIRE rechazó el token/sign (ej: `MISSING_AUTHENTICATION_TOKEN`). El SDK no borra el ticket cacheado (WSAA rechaza los pedidos repetidos durante un lapso de retención); si está dañado, `clearAuthCache()`.                                           | No                |
| `ArcaSireServiceError` (extiende `ArcaRechazoError`) | ARCA rechazó `emitir`/`anular` con un SOAP Fault de negocio (`soapenv:Client`, aunque no traiga `faultstring`), de schema o de request mal formado. `operacion` es `'emitir'` o `'anular'`, `message`/`errors[0].msg` tienen el texto de ARCA, `faultCode` el código del Fault y `cause` el `ArcaSoapError` original. Un `catch` de `ArcaRechazoError` (o `ArcaServiceError`) también lo cubre. | No                |
| `ArcaResponseError` con `uncertain: true`            | `emitir`/`anular` respondió sin `certificadoNro`/`codigoSeguridad` (o vacíos). En `status()`, una respuesta incompleta lanza `ArcaResponseError` sin `uncertain`.                                                                                                     | **No se sabe**    |
| `ArcaSoapError` con `uncertain: true`                | Timeout, error de red después de enviar, HTTP 5xx sin Fault, respuesta ilegible, o un Fault `soapenv:Server` de sistema (ej: "Error de conexión a la base de datos").                                                                                                  | **No se sabe**    |
| `ArcaSoapError` con `uncertain: false`               | El request no llegó a enviarse (DNS, conexión rechazada, abort antes de enviar).                                                                                                                                                                                       | No                |

Criterio para los SOAP Faults: el manual (sección 4) define `soapenv:Client` como error de negocio y `soapenv:Server` como error de sistema. En homologación, además, el servidor responde `soapenv:Server` para rechazos previos a procesar (XML que no cumple el schema, operación inexistente, `MISSING_AUTHENTICATION_TOKEN`); esos también se informan como rechazo. Cualquier otro `soapenv:Server` en `emitir`/`anular` se deja como `ArcaSoapError` incierto. `status()` (`dummy`) no es una emisión: sus Faults quedan siempre como `ArcaSoapError`. El manual no publica la lista de Faults de autenticación: el SDK trata como tal un `faultstring` del estilo `XXX_TOKEN`/`XXX_SIGN`.

```typescript
import {
  ArcaAuthError,
  ArcaResponseError,
  ArcaSire,
  ArcaSireServiceError,
  ArcaSoapError,
  ArcaValidationError,
} from '@ramiidv/arca-sire';
import type { EmitirCertificadoParams } from '@ramiidv/arca-sire';

declare const sire: ArcaSire;
declare const datos: EmitirCertificadoParams;

try {
  await sire.emitirCertificado(datos);
} catch (err) {
  if (err instanceof ArcaValidationError) {
    console.error(err.details); // [{ field, message, value }]
  } else if (err instanceof ArcaSireServiceError) {
    console.error(`ARCA rechazó ${err.operacion}:`, err.message); // seguro: no se emitió
  } else if (err instanceof ArcaAuthError) {
    console.error('Autenticación:', err.message); // no se emitió
  } else if ((err instanceof ArcaSoapError || err instanceof ArcaResponseError) && err.uncertain) {
    // Ver "Resultado incierto"
  }
}
```

### Resultado incierto (emitir/anular)

`emitir` y `anular` no son idempotentes, así que el SDK **nunca los reintenta**. Si el error tiene `uncertain: true`, el certificado pudo haberse emitido (o anulado) aunque no recibiste la respuesta.

SIRE no ofrece ninguna operación para consultar certificados, y el manual define `codigoTrazabilidad` solo como "texto libre": **no documenta que ARCA deduplique por ese campo**, así que reenviar el mismo request puede generar un certificado duplicado. Para recuperar el resultado:

1. Mandá siempre un `codigoTrazabilidad` propio (ej: el ID de la orden de pago) y guardalo junto con la operación como "pendiente" antes de llamar.
2. Ante un error incierto, no reenvíes automáticamente. Verificá en el micrositio SIRE (clave fiscal) si existe un certificado para ese retenido, comprobante y fecha.
3. Si existe, registrá su número; si no, recién entonces volvé a emitir. Si quedó un duplicado, anulalo con `anularCertificado`.

## Eventos

```typescript
import { ArcaSire } from '@ramiidv/arca-sire';

const sire = new ArcaSire({
  cert: '...',
  key: '...',
  cuit: '20123456786',
  onEvent: (e) => console.log(e.type, 'method' in e ? e.method : e.service),
});
```

`onEvent` recibe `auth:login`, `auth:cache-hit`, `auth:clock-skew`, `auth:storage-error`, `request:start`, `request:end`, `request:retry` y `request:error` (ver `ArcaEvent` en `@ramiidv/arca-common`). También se puede suscribir con `sire.on(tipo, handler)`.

## Entornos

| Entorno      | SIRE C2005 (`ENDPOINTS.sire`)                                        |
| ------------ | -------------------------------------------------------------------- |
| Homologación | `https://ws-aplicativos-reca.homo.afip.gob.ar/sire/ws/v1/c2005/2005` |
| Producción   | `https://ws-aplicativos-reca.afip.gob.ar/sire/ws/v1/c2005/2005`      |

El manual v1.0.3 publica los hosts `ws-aplicativos-reca.homo.arca.gob.ar` y `ws-aplicativos-reca.arca.gob.ar`, que sirven el mismo WSDL (cada uno con su propio `soap:address`). El SDK usa los hosts `afip.gob.ar` del WSDL. El host `ws-aplicativos-reca.arca.gob.ar` presenta un certificado TLS emitido para `*.afip.gob.ar`, así que una conexión que valida el certificado falla.

`ENDPOINTS` tiene solo `{ sire: { testing, production } }` (como el `ENDPOINTS` de los demás SDKs); las URLs de WSAA están en `WSAA_ENDPOINTS` de `@ramiidv/arca-common`. Se elige con `production` y se puede sobrescribir con `endpoints.sire` (y WSAA con `endpoints.wsaa`) (ej: `endpoints: { sire: 'https://ws-aplicativos-reca.homo.arca.gob.ar/sire/ws/v1/c2005/2005' }`). `status().headerInfo.ambiente` indica en qué ambiente respondió el servicio (ej: `"homologacion - 207"`).

## Ejemplos

En [`examples/`](https://github.com/ramiidv/arca-sdks/tree/main/packages/sire/examples): emitir un certificado, anularlo y manejo de errores.

## Licencia

MIT
