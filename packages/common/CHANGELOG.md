# Changelog

## 0.10.1

### Patch Changes

- f1b23ca: Documentación: sin indicaciones sobre cómo manejar el repositorio (`.gitignore`) y con el comportamiento de ARCA descripto como tal, sin referencias a cómo se verificó. En sire, el criterio de los SOAP Faults se corrige: solo `XML invalido…` y `Request mal formado` se informan como rechazo; los faults de autenticación son `ArcaAuthError`.

## 0.10.0

### Minor Changes

- 8424364: Endurecimiento de seguridad del transporte, de WSAA y del storage de tickets. Algunos cambios de comportamiento pueden requerir ajustes:
  
  - **Endpoints solo `https://`**: `WsaaClient` (`endpoint`), `ArcaSdkBase` (`endpoints.*`), `SoapServiceClient` / `ServiceClientConfig` (`endpoint`), `soapCall` y `arcaSoapCall` lanzan `ArcaValidationError` si la URL no es `https://` o lleva usuario o contraseña. `http://` se acepta solo en `localhost`, `127.0.0.0/8` y `::1`. Cómo adaptarse: un proxy o mock propio tiene que servir `https://`; un servidor de prueba local con `http://` tiene que escuchar en loopback (`http://127.0.0.1:8080/...`).
  - **Redirecciones no seguidas**: `fetch` se llama con `redirect: 'manual'` (también un `fetch` propio) y un 3xx es un `ArcaSoapError` con `statusCode` y `uncertain: false`, que no se reintenta. El mensaje indica el host del `Location`. Antes, un 307/308 reenviaba el body (token y sign, o el TRA firmado) al host de destino, incluso de `https` a `http`. Cómo adaptarse: configurar la URL final del servicio.
  - **`tokenTTLMinutes` por defecto 10** (antes 720): es la vigencia del TRA, no la del Ticket de Acceso (que sigue durando 12 horas). Una vigencia larga solo ampliaba el lapso en que un TRA firmado filtrado servía para pedir un TA. El rango sigue siendo 1 a 1440. Cómo adaptarse: nada, salvo con un reloj local muy desfasado sin `autoClockSkew`; en ese caso, corregir el reloj o `clockOffsetMs`.
  - **TLS legacy acotado**: con `legacyTls: 'auto'`, el fallback a `SECLEVEL=1` ante `ERR_SSL_DH_KEY_TOO_SMALL` aplica solo a `servicios1.afip.gov.ar` (WSFEv1, WSFEX y WSCDC de producción). Con otro host el error se lanza. Nuevo evento `request:legacy-tls` (`{ endpoint, method }`) en cada request que va por ese transporte. `'always'` y `'never'` no cambian. Cómo adaptarse: para otro host que lo necesite, `legacyTls: 'always'`.
  - **Respuestas con `<!DOCTYPE` rechazadas**: SOAP no admite DTDs y el parser expandía las entidades declaradas en ellas. Con HTTP 2xx, `soapCall` la trata como una respuesta sin SOAP Envelope (`ArcaSoapError`, `uncertain: true`, reintentable en consultas); con un no-2xx, el error HTTP de siempre. `parseXml` lanza `ArcaResponseError`.
  - **Tamaño máximo de respuesta**: nueva opción `maxResponseBytes` (default 50 MB) en `ArcaBaseConfig`, `WsaaClientConfig`, `SoapCallOptions` y `ServiceTransport` (`transportOptions`). El body se lee por streaming (también en el transporte legacy) y, si supera el límite, se corta y se lanza `ArcaSoapError`, sin reintento y con `uncertain: true` en emisiones.
  - **`buildXml` valida los nombres**: una key que no es un nombre XML (`nombre`, `prefijo:nombre`, `@_atributo` o `#text`) lanza `ArcaValidationError`. Antes se escribía tal cual y permitía inyectar elementos.
  - **WSAA**: un TA que vence a más de 24 horas se rechaza (`ArcaAuthError`) si viene de WSAA y se descarta (se hace login) si viene del storage. `autoClockSkew` no aplica un offset calculado de más de ±24 horas: se lanza el error original.
  - **Secretos fuera de `util.inspect`**: `WsaaClient` guarda el `ticketStorage` y los logins en curso, y `MemoryTicketStorage` sus tickets, en campos privados `#`: `console.log` de un cliente o un SDK ya no muestra token ni sign.
  - **`FileTicketStorage`**: en POSIX rechaza un directorio que es un symlink o de otro usuario, y ajusta a 0700 uno propio con permisos para el grupo u otros (el directorio actual, el home y la raíz no se modifican: se rechazan si el grupo u otros pueden escribir). Abre los archivos sin seguir symlinks y sin bloquearse en un FIFO; un archivo que no es regular, es de otro usuario o pesa más de 1 MB se ignora y se informa por `onError`. El error de un JSON corrupto ya no cita parte del archivo. Con un directorio rechazado, `get`/`set` lanzan: `WsaaClient` lo emite como `auth:storage-error` y sigue con los tickets en memoria (cada proceso hace su propio login). Cómo adaptarse: usar la ruta real (no un symlink) de un directorio del usuario del proceso; por ejemplo, en Docker, un volumen con el mismo uid que el proceso.
  - `testing`: `loginResponse` escapa el `token`.
  - Dependencias: `fast-xml-parser` `^5.11.2` y `node-forge` `^1.4.2`.
  - README y llms.txt: nueva sección "Seguridad".

### Patch Changes

- e763bcb: Los source maps publicados incluyen el código fuente embebido (`inlineSources`), así que se pueden depurar sin `src/`. El build borra `dist/` antes de compilar, para que no se publiquen archivos de módulos eliminados.

## 0.9.1

### Patch Changes

- e1c8de0: - Una respuesta 2xx sin SOAP Envelope (por ejemplo, el texto plano `BL<id> <fecha> 500` con que WSCPE responde un request que no cumple el XSD, o un body vacío) lanza `ArcaSoapError` con el extracto del body en el mensaje y en `responseBody`. Antes el error no decía qué había respondido el servidor.
  - Documentación de `tokenTTLMinutes`: WSAA mide el tope de 24 horas del `expirationTime` desde su propia hora, no desde el `generationTime` del TRA, y cada TA vence 12 horas después de la hora de WSAA.

## 0.9.0

### Minor Changes

- 2ce6ef5: **Cambios que rompen compatibilidad** (release de API uniforme entre los SDKs):
  
  - Requiere Node >= 22.12 (Node 20 llegó a fin de vida el 30/04/2026).
  - Se quitan los alias deprecados `afipSoapCall`, `AfipSoapCallOptions`, `parseAfipDate`, `validateCuil`, `normalizeCuil` y `formatCuil`: usar `arcaSoapCall`, `ArcaSoapCallOptions`, `parseArcaDate`, `validateCuit`, `normalizeCuit` y `formatCuit`.
  
  Nuevo:
  
  - `ArcaRechazoError` (subclase de `ArcaServiceError`, `code` `ARCA_RECHAZO`, con `operacion`, `errors` y `observaciones`): los SDKs lo lanzan cuando ARCA rechaza una operación (`resultado` R), en lugar de devolver el rechazo.
  - `ServiceClientConfig` (`{ endpoint, transport? }`): la configuración de los clientes de bajo nivel de todos los SDKs.
  - `ServiceEndpoints` (`{ testing, production }`): la forma de cada servicio en el `ENDPOINTS` que exporta cada SDK.
  - `formatServiceErrors(details)`: la lista `[código] mensaje, ...` con la que todos los SDKs arman los mensajes de error de ARCA.

## 0.8.0

### Minor Changes

- bd57c86: Revisión contra los manuales vigentes de ARCA (WSAA, especificación del QR y los manuales de cada servicio).
  
  **Cambio de comportamiento: redondeo mitad al par.** `dec()` (y por lo tanto `importe()`, `porcentaje()` y todos los decimales de los SDKs) redondea con Round Half Even, el método que indican los manuales de WSFEv1, WSFEX, WSMTXCA, WSFECRED y WSLPG: `1.005` → `1.00`, `1.015` → `1.02`. Antes redondeaba mitad hacia arriba. `generarUrlQR` redondea `importe` y `ctz` igual.
  
  **Cambio de comportamiento: `coe.alreadyAuthenticated`.** Según el manual del desarrollador de WSAA (§10.6), WSAA rechaza los pedidos repetidos durante un lapso de retención de 2 minutos en producción y 10 en homologación, no hasta que venza el TA. `ArcaTicketVigenteError` pasa a ser `retryable: true` y trae `retryAfterMs`. Durante la nueva espera `alreadyAuthenticatedCooldownMs` (default: ese lapso; también en `ArcaBaseConfig`) `getAccessTicket` lo vuelve a lanzar sin llamar a WSAA, en lugar de pedir un TA en cada llamada.
  
  WSAA:
  
  - Con `tokenTTLMinutes: 1440` el TRA vence 24 horas después de su `generationTime` (que es 2 minutos anterior a la hora actual), en lugar de 1442 minutos, que WSAA rechaza.
  - El nombre del servicio tiene que empezar con una letra, como exige el XSD del TRA.
  
  DSL y helpers:
  
  - `datetime()` exige los segundos (`xsd:dateTime`).
  - `str()` rechaza los caracteres que XML 1.0 no admite (controles salvo tab, LF y CR; U+FFFE y U+FFFF) y los surrogates UTF-16 sueltos.
  - `buildXml`/`arcaSoapCall` envían un `Date` como `xsd:dateTime` en hora de Argentina (antes, `Date.toString()`).
  - `validateCuit`/`normalizeCuit` ya no le quitan el punto decimal a un `number` (`2012345678.6` no es un CUIT válido).
  - `generarUrlQR` valida los largos de la especificación: `tipoCmp` de hasta 3 dígitos, `moneda` de 3 caracteres, `tipoDocRec` entero de hasta 2 dígitos, `importe` y `ctz` de hasta 13 enteros. `nroDocRec` acepta hasta 20 dígitos (como string) sin perder precisión.
  - Nuevo `DocTipo.FONDO_COMUN_INVERSION_CNV` (31).
  - Nuevo `diasEntre(desde, hasta)`: días de calendario de Argentina entre dos fechas.
  - `list()`/`wrapped()` aceptan un máximo de elementos (`maxItems`), que se verifica en requests.
  - `/testing`: `checkSchemaAgainstXsd` resuelve la herencia (`complexContent/extension`) también en tipos anónimos; `soapFault` escapa `faultCode` y `faultString`.

### Patch Changes

- 1cccecc: README: sección "Primeros pasos" (certificado con OpenSSL, WSASS, asociación de cada servicio, homologación y producción); errores transitorios de WSAA (HTTP 4xx/5xx sin Fault) y reintentos de consultas (respuesta 2xx sin Envelope); desfase de reloj con y sin `autoClockSkew`; `ArcaTicketVigenteError` extiende `ArcaAuthError` y se chequea antes; `FileTicketStorage`, `normalizeAccessTicket`, `ArcaBaseConfig` y helpers para autores de SDKs (`anySignal`, `safeEmit`, `collectErrors`, `collectErrorsWithPrefix`) documentados. Ejemplos: CBU inválido real, `resetLoginCooldown` solo tras un `ArcaAuthError` no reintentable y errores de servicio con un ejemplo propio.

## 0.7.0

### Minor Changes

- b152f08: Auditoría contra la especificación de WSAA 1.2.2 y mejoras compartidas para los SDKs.
  
  **Cambio de comportamiento en WSAA (esperas tras un login fallido):** ante un error que no se resuelve reintentando (`cms.*` como certificado vencido, no confiable o firma inválida; `coe.notAuthorized`; `xml.*`; `wsn.*` salvo `wsn.unavailable`), `WsaaClient` ya no vuelve a pedir un TA para ese servicio después de 60 segundos: queda bloqueado hasta `resetLoginCooldown(service)`, `clearTicket(service)` o `clearAllTickets()`, como pide el manual. La nueva opción `permanentErrorCooldownMs` (default `Infinity`) permite limitar esa espera. Los errores transitorios (`wsaa.*`, `wsn.unavailable`, timeout, HTTP 5xx) mantienen la espera de `loginErrorCooldownMs` (60 s); un desfase de reloj que sigue después de corregir el offset ahora también la inicia. El login solo se reintenta si es seguro que el request no se envió (un timeout o un 5xx ya no se reintentan).
  
  WSAA:
  
  - `ArcaAuthError` tiene `faultCode`, `statusCode` y `retryable` (se completan desde el `ArcaSoapError` original).
  - `WsaaClient` valida el certificado y la clave al construirse (PEM legibles, RSA y que la clave corresponda al certificado) y lanza `ArcaValidationError`; se parsean una sola vez. Soporta claves encriptadas con la nueva opción `keyPassphrase`.
  - Nuevo `certificateInfo(pem)`: sujeto, emisor, vigencia y CUIT del certificado.
  - Nuevos `wsaa.production` y `wsaa.resetLoginCooldown(service?)`.
  - `tokenTTLMinutes` se valida entre 1 y 1440 y se documenta como vigencia del TRA (no del TA). Si la respuesta no trae `expirationTime`, el TA vence a las 12 horas. Un TA con `expirationTime` no futuro se rechaza.
  - El nombre del servicio se valida (3 a 32 caracteres `[A-Za-z0-9_-]`).
  
  SOAP:
  
  - `ArcaSoapError` tiene `responseBody` (extracto del body de un HTTP no-2xx sin Fault, también en el mensaje) y `faultDetail` (`<detail>` SOAP 1.1 / `<Detail>` SOAP 1.2).
  - El parser decodifica referencias numéricas (`&#243;`) y entidades HTML.
  - `buildXml` y `arcaSoapCall` omiten los valores `null`/`undefined` en lugar de enviar `<x/>`.
  - En emisiones, un SOAP Fault de tipo `Client`/`Sender` ya no es `uncertain`.
  - Nuevos nombres `arcaSoapCall`, `ArcaSoapCallOptions` y `parseArcaDate`; `afipSoapCall`, `AfipSoapCallOptions` y `parseAfipDate` quedan como alias deprecados.
  
  Base de los SDKs:
  
  - `parseServerStatus` lanza `ArcaResponseError` (antes `ArcaSoapError`) ante un `dummy` incompleto.
  - `statusOf` devuelve `ok: true` solo si todos los servidores están en `OK`; si alguno no, `{ ok: false, error, status }`. Nuevo `serverStatusOk`.
  - `ArcaSdkBase` lanza `ArcaValidationError` si `config.wsaa` es de otro entorno que `production`.
  
  Helpers compartidos:
  
  - `decodeResponse` acepta `kind: 'emision'` (error por defecto incierto). Nuevos `nonEmptyStr`, `importe` y `porcentaje` en `/schema`.
  - `formatDateTimeAR(d, { millis })` y `AR_TIMEZONE` también desde el entry principal; un solo formateador de hora argentina.
  - Nuevo `roundHalfEven` (Round Half Even del manual de WSMTXCA).
  - `generarUrlQR` (con `QRInput`, `QROptions` y `QR_URL`) pasa a common, redondea `ctz` a 6 decimales y valida largos de punto de venta (5 dígitos) y número de comprobante (8).
  - `validateCuit` acepta los prefijos 50, 51 y 55; `normalizeCuit` quita también puntos y espacios; `validateCBU` quita espacios y guiones.
  - `validateFechaRango` acepta fechas iguales (compara fechas calendario de Argentina).
  - Documentación: Node >= 20.19, solo ESM (CommonJS vía `require(esm)`); README y llms.txt actualizados.

## 0.6.0

### Minor Changes

- 87f58c1: DSL de schemas y comparador de contratos:
  
  - `choice(schema)`: `xsd:choice` nativo. En un request tiene que venir exactamente una opción; en una respuesta, al menos una (un elemento vacío es inválido).
  - `str({ pattern, patternMessage })`: mensaje propio cuando no se cumple el `pattern`.
  - `encodeRequest`: los errores de `extraCheck` se intercalan con los del schema según el orden de los campos (antes iban al final).
  - `checkSchemaAgainstXsd`: los elementos de un `xsd:all` no tienen orden, y un `xsd:choice` del XSD tiene que ser `choice()` en el schema (y al revés).

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
