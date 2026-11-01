# @ramiidv/arca-sire

SDK de TypeScript para el web service **SIRE** de ARCA (ex AFIP): emisión y anulación de **certificados de retención electrónicos de IVA** (formulario C2005, RG 4523/2019).

El servicio oficial tiene tres operaciones y el SDK las cubre todas:

| Operación ARCA | Método del SDK        | Qué hace                                                                        |
| -------------- | --------------------- | ------------------------------------------------------------------------------- |
| `emitir`       | `emitirCertificado()` | Emite un certificado C2005 y devuelve `certificadoNro` y `codigoSeguridad`.     |
| `anular`       | `anularCertificado()` | Anula un certificado emitido y devuelve los datos del certificado de anulación. |
| `dummy`        | `status()`            | Estado de los servidores (sin autenticación).                                   |

SIRE **no tiene operaciones de consulta** (ni de certificados emitidos ni de tablas de parámetros). Los certificados se consultan e imprimen desde el micrositio SIRE con clave fiscal.

Fuentes: [WSDL](https://ws-aplicativos-reca.afip.gob.ar/sire/ws/v1/c2005/2005?wsdl), [XSD](https://ws-aplicativos-reca.afip.gob.ar/sire/ws/v1/c2005/C2005_schema.xsd) y el [manual para el desarrollador v1.0.3](https://www.afip.gob.ar/sire/documentos/SOAP-SIRE-IVA-Manualparaeldesarrollador_V1_0_0.pdf).

## Instalación

```bash
npm install @ramiidv/arca-sire
```

Node.js >= 18. ESM. Necesitás un certificado digital asociado al web service **SIRE** (servicio WSAA `sire-ws`).

## Inicio rápido

```typescript
import { readFileSync } from 'node:fs';
import { ArcaSire, Condicion, TipoComprobante } from '@ramiidv/arca-sire';

const sire = new ArcaSire({
  cert: readFileSync('./cert.pem', 'utf-8'),
  key: readFileSync('./key.pem', 'utf-8'),
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

`ArcaSireConfig` extiende `ArcaBaseConfig` de `@ramiidv/arca-common`:

| Opción                                                                                       | Descripción                                                                                  |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `cert`, `key`                                                                                | Certificado y clave privada en PEM.                                                          |
| `cuit`                                                                                       | CUIT del agente de retención (se valida el dígito verificador y se envía como `cuitAgente`). |
| `production`                                                                                 | `true` para producción (default: homologación).                                              |
| `endpoints`                                                                                  | `{ sire?, wsaa? }` para usar otras URLs (proxy).                                             |
| `timeout`, `retries`, `retryDelayMs`                                                         | Transporte. Los reintentos solo aplican a `status()`; `emitir`/`anular` nunca se reintentan. |
| `ticketStorage`, `tokenTTLMinutes`, `clockOffsetMs`, `autoClockSkew`, `loginErrorCooldownMs` | WSAA (ver `@ramiidv/arca-common`). Usá `ticketStorage` en producción.                        |
| `fetch`, `legacyTls`                                                                         | `fetch` propio y transporte TLS legacy.                                                      |
| `onEvent`                                                                                    | Eventos `auth:*` y `request:*`.                                                              |

Endpoints (`ENDPOINTS.sire`):

- Homologación: `https://ws-aplicativos-reca.homo.afip.gob.ar/sire/ws/v1/c2005/2005`
- Producción: `https://ws-aplicativos-reca.afip.gob.ar/sire/ws/v1/c2005/2005`

## API

Todos los métodos aceptan `opts?: { signal?: AbortSignal }`.

### `emitirCertificado(params, opts?): Promise<CertificadoResult>`

`version` (100) e `impuesto` (216, IVA) se completan solos. Campos (`EmitirCertificadoParams`, en el orden del XSD):

| Campo                               | Tipo                  | Obligatorio                 | Notas (manual)                                                                         |
| ----------------------------------- | --------------------- | --------------------------- | -------------------------------------------------------------------------------------- |
| `codigoTrazabilidad`                | string ≤ 36           | no                          | Texto libre.                                                                           |
| `regimen`                           | int ≤ 3 dígitos       | sí                          | Existente en la tabla REGIMEN del impuesto 216 (lo valida ARCA).                       |
| `fechaRetencion`                    | `FechaHora`           | sí                          | Desde el 01/12/2019.                                                                   |
| `condicion`                         | `Condicion`           | para el régimen 831         | 1 Inscripto, 2 No inscripto.                                                           |
| `imposibilidadRetencion`            | boolean               | sí                          | `true` = retención no efectuada.                                                       |
| `motivoNoRetencion`                 | string ≤ 30           | si `imposibilidadRetencion` |                                                                                        |
| `importeRetencion`                  | number                | sí                          | 11 enteros + 2 decimales.                                                              |
| `importeBaseCalculo`                | number                | sí                          |                                                                                        |
| `regimenExclusion`                  | boolean               | sí                          |                                                                                        |
| `porcentajeExclusion`               | 50 \| 100             | si `regimenExclusion`       |                                                                                        |
| `fechaPublicacion`                  | `FechaHora`           | si `regimenExclusion`       | Publicación del certificado de exclusión.                                              |
| `tipoComprobante`                   | `TipoComprobante`     | sí                          | Tabla TIPO_COMPROBANTE.                                                                |
| `fechaComprobante`                  | `FechaHora`           | sí                          | ≤ `fechaRetencion` (igual para tipos 3, 19 y 20).                                      |
| `numeroComprobante`                 | string                | sí (todos los tipos)        | `99999-99999999` para 1-4 y 17-20; hasta 16 caracteres para 5, 9, 11; hasta 12 para 6. |
| `coe`, `coeOriginal`, `cae`         | string ≤ 12 / 12 / 14 | no                          |                                                                                        |
| `importeComprobante`                | number                | sí                          |                                                                                        |
| `motivoEmisionNotaCredito`          | string ≤ 30           | solo tipo 3                 |                                                                                        |
| `cuitRetenido`                      | CUIT                  | sí                          | Se valida el dígito verificador y se envía como número.                                |
| `numeroCertificadoOriginal`         | string ≤ 25           | solo tipos 3, 19, 20        |                                                                                        |
| `fechaRetencionCertificadoOriginal` | `FechaHora`           | solo tipos 3, 19, 20        |                                                                                        |
| `importeCertificadoOriginal`        | number                | solo tipos 3, 19, 20        |                                                                                        |

`FechaHora` es `Date` o string (`YYYY-MM-DD`, `YYYYMMDD`, `YYYY-MM-DDThh:mm[:ss[.SSS]]` en hora de Argentina, o con zona `Z`/`±hh:mm`). Se envía siempre como `AAAA-MM-DDThh:mm:ss.SSS-03:00`.

Importes: números finitos y no negativos, redondeados a 2 decimales (`2100` → `2100.00`). `NaN`, `Infinity` y negativos se rechazan.

Devuelve `{ certificadoNro, codigoSeguridad }` (strings). Con ambos datos se imprime el certificado desde el micrositio SIRE.

### `anularCertificado(params, opts?): Promise<CertificadoResult>`

```typescript
import { MotivoAnulacion } from '@ramiidv/arca-sire';

const anulacion = await sire.anularCertificado({
  numeroCertificado: certificadoNro,
  motivoAnulacion: MotivoAnulacion.CUIT_ERRONEA_SUJETO_RETENIDO,
  codigoTrazabilidad: 'ANUL-OP-2026-000123', // opcional
});
// anulacion.certificadoNro / codigoSeguridad: el certificado que anula al informado
```

### `status(opts?): Promise<ServerStatus>`

`{ appserver, dbserver, authserver }`, cada uno `"OK"` si funciona.

### Bajo nivel

`sire.client` (`SireClient`) expone `dummy()`, `emitir(auth, cuitAgente, certificado)` y `anular(auth, cuitAgente, certificadoAnulacion)` con datos ya serializados (`buildCertificadoRequest`/`buildAnulacionRequest` los arman y validan). `sire.wsaa` es el `WsaaClient`.

## Manejo de errores

| Error                                                | Cuándo                                                                                                                                                                                                                                                | ¿Se emitió/anuló? |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `ArcaValidationError`                                | Datos inválidos detectados localmente (antes de autenticar). `details` tiene un ítem por campo.                                                                                                                                                       | No                |
| `ArcaAuthError` / `ArcaTicketVigenteError`           | Falla de WSAA.                                                                                                                                                                                                                                        | No                |
| `ArcaSireServiceError` (extiende `ArcaServiceError`) | ARCA rechazó el request con un SOAP Fault de negocio (`soapenv:Client`), de schema, de request mal formado o de token/sign. `message`/`errors[0].msg` tienen el texto de ARCA, `faultCode` el código del Fault y `cause` el `ArcaSoapError` original. | No                |
| `ArcaSoapError` con `uncertain: true`                | Timeout, error de red después de enviar, HTTP 5xx sin Fault, respuesta ilegible o sin `certificadoNro`/`codigoSeguridad`, o un Fault `soapenv:Server` de sistema (ej: "Error de conexión a la base de datos").                                        | **No se sabe**    |
| `ArcaSoapError` con `uncertain: false`               | El request no llegó a enviarse (DNS, conexión rechazada, abort antes de enviar).                                                                                                                                                                      | No                |

Criterio para los SOAP Faults: el manual (sección 4) define `soapenv:Client` como error de negocio y `soapenv:Server` como error de sistema. En homologación, además, el servidor responde `soapenv:Server` para rechazos previos a procesar (XML que no cumple el schema, operación inexistente, `MISSING_AUTHENTICATION_TOKEN`); esos también se informan como `ArcaSireServiceError`. Cualquier otro `soapenv:Server` en `emitir`/`anular` se deja como `ArcaSoapError` incierto.

```typescript
import { ArcaSireServiceError, ArcaSoapError, ArcaValidationError } from '@ramiidv/arca-sire';

try {
  await sire.emitirCertificado(datos);
} catch (err) {
  if (err instanceof ArcaValidationError) {
    console.error(err.details); // [{ field, message, value }]
  } else if (err instanceof ArcaSireServiceError) {
    console.error('Rechazado por ARCA:', err.message); // seguro: no se emitió
  } else if (err instanceof ArcaSoapError && err.uncertain) {
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

## Tablas

Constantes tomadas del anexo del manual:

- `TipoComprobante`: 1 Factura, 2 Recibo, 3 Nota de crédito, 4 Nota de débito, 5 Otro comprobante, 6 Orden de pago, 9 Escritura pública, 11 Factura (16 dígitos), 17/18 Liquidación de servicios públicos clase A/B, 19/20 ídem con valor negativo.
- `Condicion`: 1 Inscripto, 2 No inscripto.
- `MotivoAnulacion`: 1 CUIT errónea del sujeto retenido, 2 Fecha de la retención errónea, 3 Régimen incorrecto, 4 Otros.
- `REGIMENES_CON_CONDICION`: `[831]` (tabla REGIMEN_CONDICION).
- `SIRE_VERSION` (100), `IMPUESTO_IVA` (216), `SIRE_SERVICE_ID` (`sire-ws`), `SIRE_NAMESPACE`.

El manual no publica la tabla REGIMEN completa: los regímenes válidos los valida ARCA.

## Eventos

```typescript
const sire = new ArcaSire({
  // ...
  onEvent: (e) => console.log(e.type, 'method' in e ? e.method : e.service),
});
```

## Migración desde 0.2.x

La 0.2.x apuntaba a endpoints y operaciones que no existen en ARCA (`registrarRetencion`, `consultarRetenciones`, `consultarComprobante`, `generarCertificado`, `consultarAlicuotas`, etc.); ninguna llamada de esa versión funcionaba. Reemplazos:

- `registrarRetencion` → `emitirCertificado` (campos nuevos, ver tabla).
- `anularRetencion(nro)` → `anularCertificado({ numeroCertificado, motivoAnulacion })`.
- Consultas y tablas: no existen en el servicio; usar el micrositio SIRE y las constantes del SDK.

## Licencia

MIT
