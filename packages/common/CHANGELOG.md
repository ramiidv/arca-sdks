# Changelog

## 0.5.0

### Minor Changes

- 8c02c30: API uniforme entre los SDKs (los nombres anteriores siguen funcionando,
  marcados `@deprecated`, hasta la próxima major):
  
  - arca-facturacion: la clase principal es `ArcaFacturacion` (`Arca` queda como
    alias). Nuevo `status()` → `{ wsfe, wsfex }` con `ServiceStatus` y el
    `ServerStatus` de arca-common (`appserver`/`dbserver`/`authserver`);
    `serverStatus()`/`serverStatusExpo()` y su `ServerStatus` en mayúsculas
    quedan deprecados.
  - arca-agro: `status()` (antes `serverStatus()`).
  - arca-fecred: el cliente de bajo nivel es `client` (antes `fecred`).
  - arca-common: `ServiceStatus` y `statusOf()` para el estado de varios servicios.
- f8bd053: `validateCuit(cuit, field?)` acepta el nombre del campo para el error;
  `WsaaClient.endpoint` es público; `transportOptions` acepta sólo las opciones de
  transporte; en `/testing`, `mockFetchWith(responder)` y
  `requestParams(xml, { parseNumbers: false })`.
- 242fb5f: Nueva base para los SDKs: `ArcaSdkBase` (CUIT, `WsaaClient` propio o
  compartido, transporte, eventos `on`/`off`, `signal` global, endpoints por
  entorno, `clearAuthCache`), `SoapServiceClient`, `createWsaaClient`,
  `transportOptions` y `parseServerStatus`. Nuevo subpath
  `@ramiidv/arca-common/testing` con `mockFetch`, `mockFetchByMethod`,
  `soapResponse`, `soapFault`, `fakeTicketStorage`, `testCert`, `requestParams`,
  `childOrder` y más, sin dependencias de un framework de tests.
- fd438bc: `@ramiidv/arca-common/testing` exporta `loadXsdTypes` y `checkSchemaAgainstXsd`
  para comparar los schemas del DSL con el XSD de un WSDL oficial. Todos los
  schemas de agro, cdc, fecred, mtxca, padron y sire se verifican contra los WSDL
  de producción. arca-mtxca: los renombres API ↔ XML usan `xml()` del DSL y un
  error en `actividades` se reporta en `actividades[i].codigo`.
- bed68e8: Paquetes solo ESM y Node >= 20.19. `arca-common`, `arca-facturacion` y
  `arca-padron` dejan de publicar un build CommonJS: desde CommonJS se cargan con
  `require()` (require(esm), Node >= 20.19 / 22.12). Todos los paquetes pasan a
  requerir Node >= 20.19.0 (Node 18 y 20 sin soporte). El código vive ahora en el
  monorepo `arca-sdks`.
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
- b86db00: Nuevo subpath `@ramiidv/arca-common/schema`: el DSL para describir los tipos
  del XSD de un servicio y, con la misma descripción, validar y serializar
  requests en el orden del XSD (`encodeRequest`) y decodificar respuestas con
  tipos (`decodeResponse`). Nuevo error `ArcaResponseError` (respuesta con forma
  inválida, con `uncertain`).
  
  arca-agro usa el DSL de common (`ArcaAgroResponseError` extiende
  `ArcaResponseError`) y parsea las respuestas sin conversión numérica: los
  `xs:string` con contenido numérico (ej: `"0012"`, `"10.50"`) ya no pierden ceros
  ni decimales.

## 0.4.0 (2026-11-01)

### Breaking changes
- `formatDate` es estricto: los strings solo pueden ser `YYYYMMDD` o `YYYY-MM-DD` (se formatean
  literal, sin pasar por `Date`) y la fecha tiene que existir (`20230230`, mes 13 o `00000000` lanzan
  `ArcaValidationError`). Otros formatos de string (ej: ISO con hora) ya no se aceptan: pasá un `Date`.
  Un `Date` se formatea con la fecha calendario de `America/Argentina/Buenos_Aires` (`Intl`).
- `parseAfipDate` acepta solo `YYYYMMDD` o `YYYY-MM-DD` exactos, valida que la fecha exista y
  devuelve el mediodía de Argentina (15:00 UTC) en lugar de la medianoche local:
  `formatDate(parseAfipDate(x)) === x` en cualquier zona horaria.
- Un SOAP Fault en `kind: 'consulta'` ya no es `uncertain` (es un rechazo determinístico del
  servidor). En `emision` sigue siendo `uncertain: true`.
- `collectErrors` / `collectErrorsWithPrefix` re-lanzan todo error que no sea `ArcaValidationError`
  (antes se tragaban, por ejemplo, `TypeError`s de bugs).
- `Provincia`: corregida la numeración según la tabla oficial de ARCA (no existe el 15):
  `CHACO = 16`, `CHUBUT = 17`, `FORMOSA = 18`, `MISIONES = 19`, `NEUQUEN = 20`, `LA_PAMPA = 21`,
  `RIO_NEGRO = 22`, `SANTA_CRUZ = 23`, `TIERRA_DEL_FUEGO = 24` (antes 15 a 23).
- `formatCuit` lanza `ArcaValidationError` si el CUIT no tiene 11 dígitos.
- `checkServiceErrors` lanza si **cualquier** error tiene código distinto de 0 (antes solo miraba el
  primero) o un código no numérico.
- `ArcaBaseConfig` incluye `cuit` (obligatorio).

### Features
- `afipSoapCall` acepta `AfipSoapCallOptions`: `requestElement` (`null` = Body vacío),
  `responseElement`, `qualified` (`<X xmlns="ns">`, para servicios ASMX) y `soapActionFromMethod`.
- Fallback TLS legacy: si el `fetch` por defecto falla con `ERR_SSL_DH_KEY_TOO_SMALL` (hosts con DH de
  1024 bits como `servicios1.afip.gov.ar`, WSFEv1 y WSCDC), el mismo request se reintenta una vez por
  `node:https` con `ciphers: 'DEFAULT@SECLEVEL=1'` y el host se recuerda. Opción
  `legacyTls: 'auto' | 'never' | 'always'` (default `auto`).
- Opción `fetch` en `SoapCallOptions` y `WsaaClientConfig` para inyectar un `fetch` propio.
- `WsaaClient`: `loginErrorCooldownMs` (default 60000): tras un login fallido no se vuelve a llamar a
  WSAA durante ese lapso (lo pide la especificación); `getAccessTicket` rechaza enseguida con
  `ArcaAuthError` (`cause` = error original). `clearTicket`/`clearAllTickets` lo limpian.
- `extractServiceErrors(result)`: devuelve los errores de negocio sin lanzar. `checkServiceErrors` y
  `extractServiceErrors` reconocen también `errors.error[]`/`errors.err[]`, `arrayErrores` y
  `arrayErroresFormato` (WSMTXCA, WSFECRED) con ítems `codigoDescripcion[]` o
  `codigoDescripcionString[]` (el que usa el XSD de WSFECRED en `arrayErroresFormato`),
  `errores.error[]` (WSCPE, WSLPG) y `erroresFormato.error[]` (WSLPG). Los códigos no numéricos se
  exponen en `rawCode`.
- Opción `parseNumbers?: boolean` en `SoapCallOptions` (y por lo tanto en `AfipSoapCallOptions`) y en
  `parseXml(xml, { parseNumbers })`. `true` (default) mantiene la conversión de textos numéricos a
  `number`; `false` deja todos los valores de texto como string (`"10.50"`, `"1E3"`, `"007"`), para
  servicios con campos `xs:string` que parecen números. Funciona por `fetch` y por el fallback TLS
  legacy, sin necesidad de inyectar un `fetch` propio.
- `extractMethodResult(parsed, method, { kind, responseElement })`: detecta Faults también con
  prefijos de namespace (salida de `parseXml`).
- `ArcaBaseConfig` completo para que lo extiendan los SDKs: `cuit`, `tokenTTLMinutes`,
  `ticketStorage`, `clockOffsetMs`, `autoClockSkew`, `loginErrorCooldownMs`, `fetch`, `legacyTls`.
- `ArcaServiceError` y `ArcaValidationError` aceptan `{ cause }` como último parámetro opcional.
- `validateFecha` / `validateFechaRango` aceptan también strings `YYYYMMDD`/`YYYY-MM-DD`.
- `DocTipo`: códigos faltantes de la tabla oficial (cédulas provinciales 0-24, `CERTIFICADO_MIGRACION
  = 30`, `ANSES_PADRON = 88`) y el alias `SIN_IDENTIFICAR = 99`.
- `TicketStorage.get(key, { onError })`: un storage puede informar problemas que resolvió sin lanzar.
- Nuevos tipos exportados: `AfipSoapCallOptions`, `ExtractMethodResultOptions`, `ParseXmlOptions`, `LegacyTlsMode`,
  `ServiceErrorDetail`, `TicketStorageGetOptions`.

### Fixes
- `formatDate('2026-03-15')` devolvía `'20260314'` (el string se interpretaba como medianoche UTC).
- `parseAfipDate` aceptaba guiones en cualquier posición y fechas inexistentes (`20230230` → 2 de marzo).
- Un SOAP Fault con HTTP 200 no se lanzaba desde `soapCall` (solo desde `afipSoapCall`).
- Una respuesta 2xx que no es SOAP (ej: HTML de mantenimiento) se devolvía como respuesta válida;
  ahora es un error de transporte (se reintenta en consultas, `uncertain` en emisiones).
- `WsaaClient`: el certificado, la clave privada y los tickets en memoria aparecían en `util.inspect`
  y `JSON.stringify` (ahora son campos privados `#`).
- `WsaaClient`: `xml.expirationTime.invalid` (vigencia mayor a 24 h) se trataba como desfase de reloj.
- `WsaaClient`: el `uniqueId` del TRA era el epoch en segundos y colisionaba entre TRAs del mismo
  segundo; ahora es un entero de 32 bits al azar (`xsd:unsignedInt`).
- `WsaaClient`: tras `coe.alreadyAuthenticated` se relee el storage hasta 3 veces (0/250/750 ms)
  antes de lanzar `ArcaTicketVigenteError`, por si otro proceso está guardando el ticket.
- `getNestedValue` usaba `in` (encontraba propiedades heredadas como `toString`), fallaba con valores
  que no son objetos y devolvía `undefined`/`null` aunque una key siguiente tuviera valor.
- `FileTicketStorage`: nombre temporal con `randomUUID()`, `fsync` antes del rename, `chmod 0700` del
  directorio existente si es del usuario (best effort) y un JSON corrupto se borra (y se informa como
  `auth:storage-error`) en lugar de quedar ahí para siempre.
- README: el CBU de ejemplo era inválido.

## 0.3.0 (2026-10-30)

### Breaking changes
- `AccessTicket.expirationTime` es un string ISO-8601 (antes `Date`), para que el ticket sea
  serializable a JSON. Se agregan `generationTime?` y `service?`.
- `WsaaClient.clearTicket` y `clearAllTickets` devuelven `Promise<void>` (también borran del storage).
- `soapCall` devuelve la respuesta parseada **sin prefijos de namespace** (`Envelope` en lugar de
  `soap:Envelope`). `afipSoapCall` no cambia su contrato.
- `soapCall` solo reintenta consultas: los SOAP Faults (aunque lleguen con HTTP 500) ya no se reintentan.

### Features
- `ticketStorage` en `WsaaClient`: persistencia de Tickets de Acceso entre reinicios. Orden de
  lectura memoria → storage → login; key `entorno:huellaDelCert:servicio`.
- `MemoryTicketStorage` y `FileTicketStorage` como implementaciones de referencia.
- `ArcaTicketVigenteError`: WSAA indica que ya hay un TA vigente y no está en el storage.
- `clockOffsetMs` y `autoClockSkew` (default `true`): ajuste del reloj desde el header `Date` de WSAA,
  con evento `auth:clock-skew`. `wsaa.now()` y `wsaa.clockOffsetMs` exponen el reloj de ARCA.
- `soapCall` acepta `kind: "consulta" | "emision"` (las emisiones nunca se reintentan) y `signal`.
- `ArcaSoapError` expone `faultCode`, `faultString`, `responseDate`, `uncertain` y `aborted`.
- Todos los errores tienen un `code` estable (estático en la clase y legible en la instancia), y
  `instanceof` funciona entre copias del paquete.
- `safeEmit` para emitir eventos sin que un callback del usuario afecte la operación.
- `CondicionIva` (movido desde arca-facturacion) y `extractMethodResult`.
- Eventos `auth:clock-skew` y `auth:storage-error`; `auth:cache-hit` indica `source`.
- Build dual ESM + CommonJS con `exports` condicional, y smoke test CommonJS/ESM en CI.

### Fixes
- Los SOAP Faults con HTTP 500 (como los de WSAA) se perdían: el error solo decía `HTTP 500`.
- `afipSoapCall` no desenvolvía `personaReturn` (Padrón) ni respuestas con prefijo de namespace.
- Un callback de `onEvent` que lanzaba podía convertir una respuesta recibida en error (y en WSAA,
  perder el ticket recién obtenido). Ahora los errores de los callbacks se ignoran.
- En los 2 minutos previos al vencimiento, si WSAA no permite renovar el ticket, se sigue usando el
  vigente en lugar de fallar con `ArcaTicketVigenteError`.
- Cancelar `getAccessTicket` con `signal` lanza `ArcaSoapError` (`aborted: true`), no un `DOMException`.
- Una respuesta 200 cortada a mitad del body se reintenta en consultas.
- `instanceof` entre copias se basa en el `code` estático de cada clase, no en su nombre (sobrevive a la
  minificación).

## 0.1.0 (2026-03-31)

### Features
- Initial release
- WSAA authentication client with token caching and request deduplication
- Generic SOAP client with retry, timeout, and exponential backoff
- XML parsing/building utilities (via fast-xml-parser)
- Error hierarchy: ArcaError, ArcaAuthError, ArcaSoapError, ArcaServiceError, ArcaValidationError
- CUIT/CUIL validation with Módulo 11 checksum verification (accepts string and number)
- `isValidCuit()` — non-throwing boolean check
- CBU validation (22-digit format with block checksums)
- `isValidCBU()` — non-throwing boolean check
- `formatDate()` — formats Date/string to YYYYMMDD (AFIP format, timezone Argentina)
- `parseAfipDate()` — parses YYYYMMDD or YYYY-MM-DD to Date
- Date range validation utilities
- Shared types: AccessTicket, ArcaBaseConfig, SoapCallOptions, ServerStatus, ArcaEvent
- Shared constants: WSAA endpoints, DocTipo enum, Provincia enum
- Backward-compatible aliases: `validateCuil`, `normalizeCuil`, `formatCuil` → apuntan a `validateCuit`, `normalizeCuit`, `formatCuit`
