---
'@ramiidv/arca-common': minor
---

Auditoría contra la especificación de WSAA 1.2.2 y mejoras compartidas para los SDKs.

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
