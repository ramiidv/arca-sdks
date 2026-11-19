---
"@ramiidv/arca-common": patch
---

Correcciones de robustez en WSAA, el cliente SOAP y los storages de tickets:

- `getAccessTicket` con un `signal` ya abortado lanza `ArcaSoapError` (`aborted: true`, `uncertain: false`) sin iniciar un login. Antes disparaba un login que nadie esperaba y, si fallaba, dejaba un rechazo sin manejar (que en Node 22 termina el proceso).
- `timeout`, `retries` y `retryDelayMs` se validan: `timeout` tiene que ser un entero de 1 a 2147483647 ms, y `retries` y `retryDelayMs`, enteros de 0 a 2147483647. Con un valor mayor, o `Infinity`, el timer de Node se disparaba a 1 ms. Si no son válidos, `soapCall` lanza `ArcaValidationError` sin enviar nada, y `WsaaClient` y los SDKs lanzan al construirse. La espera entre reintentos tiene un tope de 2147483647 ms.
- `WsaaClient` valida `clockOffsetMs` (número finito de hasta ±24 horas) y las esperas `loginErrorCooldownMs`, `alreadyAuthenticatedCooldownMs` (números finitos ≥ 0) y `permanentErrorCooldownMs` (≥ 0 o `Infinity`). Antes, un `clockOffsetMs: NaN` hacía fallar cada login con un error que se trataba como transitorio.
- `FileTicketStorage`: si el directorio se borra mientras el proceso corre, el próximo `set` lo vuelve a crear (antes cada `set` fallaba con `ENOENT` hasta reiniciar).
- Los handlers suscriptos con `on()` se llaman cada uno por separado: si uno lanza, el error se ignora y los demás se llaman igual (antes un handler que lanzaba cortaba a los siguientes).
- `datetime()` de `/schema` rechaza fechas inexistentes (`2026-02-30T00:00:00`).
- La huella del certificado en la key del `ticketStorage` se calcula sobre el certificado en sí: el mismo certificado con `Bag Attributes` o seguido de la cadena de certificación usa la misma key. Para un PEM con un solo certificado la key no cambia, así que los tickets ya guardados siguen sirviendo.
- `normalizeAccessTicket` devuelve `null` si `token` o `sign` están vacíos.
- Un TA de WSAA con XML ilegible (`ArcaAuthError`) y una respuesta que el parser no puede leer (`ArcaSoapError` "sin SOAP Envelope") incluyen el error del parser en `cause`.
- `hangingReply()` de `/testing` rechaza enseguida si el `signal` del request ya llega abortado.
- `EnvEndpoints` queda como alias deprecado de `ServiceEndpoints` (misma forma: `{ testing, production }`).
- Documentación: sección de `/testing` completa en el README, validaciones de las opciones numéricas y lo que no se reintenta (redirecciones y respuestas que superan `maxResponseBytes`).
