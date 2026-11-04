# Changelog

## 0.8.3

### Patch Changes

- f1b23ca: Documentación: sin indicaciones sobre cómo manejar el repositorio (`.gitignore`) y con el comportamiento de ARCA descripto como tal, sin referencias a cómo se verificó. En sire, el criterio de los SOAP Faults se corrige: solo `XML invalido…` y `Request mal formado` se informan como rechazo; los faults de autenticación son `ArcaAuthError`.
- Updated dependencies [f1b23ca]
  - @ramiidv/arca-common@0.10.1

## 0.8.2

### Patch Changes

- e763bcb: Los source maps publicados incluyen el código fuente embebido (`inlineSources`), así que se pueden depurar sin `src/`. El build borra `dist/` antes de compilar, para que no se publiquen archivos de módulos eliminados.
- Updated dependencies [e763bcb]
- Updated dependencies [8424364]
  - @ramiidv/arca-common@0.10.0

## 0.8.1

### Patch Changes

- 62ea589: - **Tablas sin resultados**: `getModalidades`, `getTiposCbte`, `getDocTipos` y `getTiposOpcionales` (de `ArcaCdc` y de `CdcClient`) devuelven `[]` cuando ARCA responde el error 503 "Sin Resultados" (por ejemplo, `OpcionalesTipoConsultar` en homologación), en lugar de lanzar `ArcaServiceError`. Cualquier otro error sigue lanzando, y en `constatar()` un 503 sigue siendo `ArcaServiceError`.
  - **Eventos con código 0**: ARCA manda `<Events><Evt><Code>0</Code></Evt></Events>` cuando no hay eventos, y el SDK lo exponía como un evento `{ code: 0, msg: '' }`. Ahora se descarta: no aparece en `lista.eventos` de las tablas ni en `eventos` de `constatar()`.
- Updated dependencies [e1c8de0]
  - @ramiidv/arca-common@0.9.1

## 0.8.0

### Minor Changes

- 373aa1d: **Cambios que rompen compatibilidad** (release de API uniforme entre los SDKs):
  
  - Requiere Node >= 22.12.
  - `ConstatarResult.events` → `ConstatarResult.eventos` (igual que en las tablas de parámetros, que ya usaban `eventos`).
  - `WSCDC_ENDPOINTS` → `ENDPOINTS.wscdc` (`ENDPOINTS` tiene la forma `{ wscdc: { testing, production } }`, igual en todos los SDKs). `WSCDC_NAMESPACE` y `WSCDC_SERVICE_ID` no cambian.
  - `new CdcClient({ endpoint, timeout, retries, onEvent, fetch, ... })` → `new CdcClient({ endpoint, transport: { timeout, retries, onEvent, fetch, ... } })`. `CdcClientConfig` es ahora `ServiceClientConfig` de `@ramiidv/arca-common`.
  
  Sin cambios de comportamiento: `constatar()` es una consulta, así que un `resultado: 'R'` (comprobante no constatado) se sigue devolviendo, no lanza `ArcaRechazoError`. Se reexportan `ArcaRechazoError` y los tipos `ServiceClientConfig`, `ServiceEndpoints` y `ServiceTransport`.

### Patch Changes

- Updated dependencies [2ce6ef5]
  - @ramiidv/arca-common@0.9.0

## 0.7.0

### Minor Changes

- 9790ecd: Revisión contra el manual de WSCDC v0.4: nuevas validaciones locales de `constatar()`. El receptor es obligatorio y con CUIT (80) en los comprobantes A, A con leyenda y MiPyME (113, 114); en los comprobantes T (195, 196, 197) solo se admiten los documentos 80, 91, 94 o 96 (118), y la fecha no puede ser anterior al 01/01/2013 (101). `ImpTotal` se redondea mitad al par, como indica el manual (§2.8).

### Patch Changes

- 1cccecc: Documentación: glosario, cuándo es obligatorio el receptor (A y MiPyME con CUIT; B, C, R, 30, 31, 37, 38, 41 y 49 por encima de $10.000.000; validaciones 113-117), los errores 600-602 de WSCDC llegan como `ArcaServiceError` y `permanentErrorCooldownMs` en la configuración. El ejemplo de manejo de errores ya no llama a `clearAuthCache()` ante `ArcaAuthError`: indica corregir la causa y usar `wsaa.resetLoginCooldown('wscdc')`.
- Updated dependencies [1cccecc]
- Updated dependencies [bd57c86]
  - @ramiidv/arca-common@0.8.0

## 0.6.0

### Minor Changes

- aa1a57d: Auditoría contra el manual de WSCDC v4.
  
  **Cambios de comportamiento:**
  
  - Una respuesta con forma inesperada (sin `Resultado`, `Resultado` desconocido, datos inválidos) lanza `ArcaResponseError` (`uncertain: false`; exportado desde este paquete) en lugar de `ArcaSoapError`.
  - En un rechazo funcional (`resultado: 'R'`) con `CmpResp` incompleto, `constatar` devuelve `resultado` y `observaciones` sin `cmpResp` en lugar de lanzar.
  - Las tablas de parámetros aceptan ítems sin `Desc` (`minOccurs=0` en el WSDL): `desc` queda como `''`.
  - `CdcClient` valida la CUIT de `auth` (dígito verificador) y la envía normalizada; una inválida lanza `ArcaValidationError` sin llamar a ARCA.
  
  Nuevo:
  
  - Los `Events` de las tablas de parámetros quedan en `lista.eventos` (propiedad no enumerable; tipo `ListaCdc<T>`). `constatar` ya los devolvía en `events`.
  - `ArcaCdc.constatar` valida el input una sola vez, antes de autenticarse.
  
  Documentación: ejemplos de JSDoc, README y `llms.txt` con la API en camelCase (`cbteModo`, `cuitEmisor`, `resultado`, `docNroReceptor`), Node >= 20.19 (solo ESM), `ArcaSdkConfig` (`wsaa`, `signal`, `keyPassphrase`), sin versiones fijas; `llms.txt` en español.

### Patch Changes

- 1db70be: Descripción y keywords del paquete en npm corregidas (tildes).
- Updated dependencies [b152f08]
  - @ramiidv/arca-common@0.7.0

## 0.5.0

### Minor Changes

- 3f83d31: Cambio incompatible: toda la API en camelCase, con los nombres de ARCA (`CbteModo` → `cbteModo`, `CuitEmisor` → `cuitEmisor`, `CodAutorizacion` → `codAutorizacion`...). Afecta a `ConstatarInput`, `ConstatarResult` (`resultado`, `fchProceso`, `observaciones`, `events`, `cmpResp`), los mensajes (`{ code, msg }`), las tablas de parámetros (`{ cod, desc }`, `{ id, desc }`), `CdcAuth` (`{ token, sign, cuit }`) y las rutas de los errores de validación.

### Patch Changes

- Updated dependencies [87f58c1]
  - @ramiidv/arca-common@0.6.0

## 0.4.0

### Minor Changes

- bed68e8: Paquetes solo ESM y Node >= 20.19. `arca-common`, `arca-facturacion` y
  `arca-padron` dejan de publicar un build CommonJS: desde CommonJS se cargan con
  `require()` (require(esm), Node >= 20.19 / 22.12). Todos los paquetes pasan a
  requerir Node >= 20.19.0 (Node 18 y 20 sin soporte). El código vive ahora en el
  monorepo `arca-sdks`.
- f8bd053: Las clases principales extienden `ArcaSdkBase` de arca-common, así que todos
  los SDKs tienen la misma base: `wsaa`, `cuit`, `production`, `on()`/`off()`,
  `clearAuthCache()`, `config.wsaa` (WsaaClient compartido) y `config.signal`
  (signal global). arca-mtxca acepta `endpoints: { mtxca, wsaa }` (`endpoint` y
  `wsaaEndpoint` quedan deprecados). Los `dummy`/`status` validan la respuesta con
  `parseServerStatus`: si falta un campo lanzan `ArcaSoapError`.
- c9f1444: Requests y respuestas se validan, serializan y decodifican con el DSL de
  `@ramiidv/arca-common/schema`, transcripto del XSD oficial de cada servicio.
  
  - Corrección: las respuestas se parsean sin conversión numérica, así que los
    `xs:string` con contenido numérico ya no pierden ceros a la izquierda ni
    decimales (ej: `"0012"`, `"1.50"`, `DocNro`, `codigoSeguridad`).
  - Los campos desconocidos en el input se rechazan con `ArcaValidationError`
    (antes se ignoraban).
  - Todos los errores de validación se informan juntos (`details`), con mensajes
    del tipo `campo: motivo`. Cambió el texto de los mensajes.
  - arca-fecred deja de recortar espacios de los textos y envía `codCtaCte` tal
    cual; porcentaje y cotización se envían con decimales fijos.

### Patch Changes

- fd438bc: `@ramiidv/arca-common/testing` exporta `loadXsdTypes` y `checkSchemaAgainstXsd`
  para comparar los schemas del DSL con el XSD de un WSDL oficial. Todos los
  schemas de agro, cdc, fecred, mtxca, padron y sire se verifican contra los WSDL
  de producción. arca-mtxca: los renombres API ↔ XML usan `xml()` del DSL y un
  error en `actividades` se reporta en `actividades[i].codigo`.
- 20ecf7d: DSL de schemas, segunda versión:
  
  - Corrección: `dec()` redondea sobre el valor decimal escrito (`8.575` →
    `8.58`; antes daba `8.57` por la representación binaria). Afecta los importes
    que los SDKs envían redondeados.
  - `must()` rechaza también el valor vacío; los elementos `xsi:nil` cuentan
    como ausentes (en una lista, como lista vacía); `must()` en listas exige el
    elemento; un objeto opcional vacío se omite y uno obligatorio valida sus hijos.
  - Al decodificar se validan enteros (`int()`) y valores permitidos
    (`str({ values })`).
  - Nuevos: `siNo()` (S/N ↔ boolean), `double()`, `xml(nombre, campo)` (nombre
    distinto en el XML), `custom(encode, decode)`, `roundHalfUp()` y
    `decodeResponse(..., { emptyLists: 'omit' })`.
- Updated dependencies [8c02c30]
- Updated dependencies [f8bd053]
- Updated dependencies [242fb5f]
- Updated dependencies [fd438bc]
- Updated dependencies [bed68e8]
- Updated dependencies [20ecf7d]
- Updated dependencies [b86db00]
  - @ramiidv/arca-common@0.5.0

## 0.3.0 (2026-11-01)

Las versiones anteriores no podían operar contra ARCA (namespace incorrecto, sin SOAPAction y sin
`CmpReq`). Esta versión se alinea con el WSDL oficial y el manual del desarrollador WSCDC v0.4
(01-12-2025).

### Breaking
- Requiere `@ramiidv/arca-common` `^0.4.0`.
- `constatar()`: el input ahora es el bloque `CmpReq` del WSDL. Campos nuevos obligatorios
  `CbteModo` (`'CAE' | 'CAI' | 'CAEA'`) y `CuitEmisor` (permite constatar comprobantes de terceros).
  `DocTipoReceptor`/`DocNroReceptor` pasan a ser opcionales (se informan juntos) y se agrega
  `Opcionales`. `CbteFch` acepta `YYYYMMDD`, `YYYY-MM-DD` o `Date`.
- `ConstatarResult`: expone `FchProceso`, `CmpResp`, `Observaciones` y `Events` (siempre arrays). Se
  quita `Errors`: si ARCA devuelve `Errors` (formato, autenticación 600-602, infraestructura
  500-503) se lanza `ArcaServiceError` (antes devolvía `Resultado: 'R'`, indistinguible de un
  rechazo real). Si falta `Resultado` o `FchProceso` se lanza `ArcaSoapError`.
- `getModalidades()` devuelve `{ Cod, Desc, FchDesde?, FchHasta? }` (`FacModTipo`); antes `{ Id, ... }`
  y siempre `[]`.
- `getTiposCbte()` devuelve `{ Id: number, Desc }` y `getDocTipos()` `{ Id: string, Desc }`: se
  quitan `FchDesde`/`FchHasta`, que no existen en esos tipos del WSDL.
- `clearAuthCache()` es `async` (`Promise<void>`).
- `ArcaCdcConfig` extiende `ArcaBaseConfig`; `cuit` acepta `number | string` y se valida con dígito
  verificador al construir.
- `CdcClient`: nuevo constructor (`{ endpoint, timeout, retries, retryDelayMs, onEvent, fetch,
  legacyTls }`) y `Cuit` del `Auth` como `number | string`.
- Endpoint de producción: `https://servicios1.afip.gov.ar/WSCDC/service.asmx` (el host
  `servicios1.arca.gob.ar` presenta un certificado para `servicios1.afip.gov.ar` y falla la
  validación TLS).
- `WSCDC_NAMESPACE` = `http://servicios1.afip.gob.ar/wscdc/`.
- `index.ts` ya no re-exporta `ensureArray`, `parseXml`, `buildXml`, `checkServiceErrors` ni los tipos
  `WsaaClientConfig`/`SoapCallOptions` (usalos desde `@ramiidv/arca-common`).

### Features
- `getTiposOpcionales()` / `CdcClient.getTiposOpcionales()` (`OpcionalesTipoConsultar`).
- Todos los métodos públicos aceptan `opts?: { signal }`.
- Config: `ticketStorage`, `tokenTTLMinutes`, `clockOffsetMs`, `autoClockSkew`,
  `loginErrorCooldownMs`, `fetch`, `legacyTls` y `endpoints: { wscdc?, wsaa? }`.
- Exporta `ArcaValidationError`, `ArcaTicketVigenteError`, `MemoryTicketStorage`,
  `FileTicketStorage`, `CBTE_MODOS` y los tipos `CbteModo`, `Opcional`, `ComprobanteConstatado`,
  `CdcMensaje`, `OpcionalTipoItem`, `CallOptions`, `TicketStorage`, etc.
- Validación local según el manual: `CbteModo`, CUIT del emisor y de la representada (dígito
  verificador), `PtoVta` 1-99998, `CbteTipo` 1-999, `CbteNro` 1-99999999, fecha existente,
  `ImpTotal` finito >= 0 con hasta 13 enteros (redondeado a 2 decimales), `CodAutorizacion` de 14
  dígitos, documento del receptor (numérico; CUIT con dígito verificador si `DocTipoReceptor` = 80),
  `Opcionales` (Id 1-4 caracteres sin repetir, Valor 1-250).

### Fixes
- Namespace, SOAPAction y serialización calificada (ASMX, `elementFormDefault="qualified"`): ninguna
  llamada funcionaba.
- `ComprobanteConstatar` envía `Auth` + `CmpReq` en el orden del WSDL.
- `ComprobantesModalidadConsultar` lee `ResultGet/FacModTipo`.
- Producción funciona con el fallback TLS legacy de common (el host negocia DH de 1024 bits).
- Los errores de negocio de las tablas de parámetros se lanzan siempre; nunca se devuelve una lista
  vacía por un error. Campos obligatorios ausentes en la respuesta lanzan `ArcaSoapError`.
- `constatar()` es una consulta (`kind: 'consulta'`): se reintenta ante errores transitorios.
- `prepublishOnly` corre los tests.

## 0.2.0 (2026-06-03)

### Chore
- CI con GitHub Actions (Node 18/20/22) y workflow de release (publicación al crear un tag).
- `homepage` apunta a arca-sdk.dev.
- `package-lock.json` resuelve `@ramiidv/arca-common` desde el registry de npm (el build en CI
  fallaba con la ruta local).

## 0.1.0 (2026-03-31)

### Features
- Initial release
- Verify comprobantes (invoices) against ARCA using `constatar()` with CAE, CAI, or CAEA codes
- Query available billing modalities via `getModalidades()`
- Query enabled voucher types via `getTiposCbte()`
- Query enabled document types via `getDocTipos()`
- Service health check via `status()`
- Automatic WSAA authentication with ticket caching
- Input validation for `constatar()` parameters
- Full TypeScript support with strict types
