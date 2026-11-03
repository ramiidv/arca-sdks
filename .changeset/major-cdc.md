---
'@ramiidv/arca-cdc': minor
---

**Cambios que rompen compatibilidad** (release de API uniforme entre los SDKs):

- Requiere Node >= 22.12.
- `ConstatarResult.events` → `ConstatarResult.eventos` (igual que en las tablas de parámetros, que ya usaban `eventos`).
- `WSCDC_ENDPOINTS` → `ENDPOINTS.wscdc` (`ENDPOINTS` tiene la forma `{ wscdc: { testing, production } }`, igual en todos los SDKs). `WSCDC_NAMESPACE` y `WSCDC_SERVICE_ID` no cambian.
- `new CdcClient({ endpoint, timeout, retries, onEvent, fetch, ... })` → `new CdcClient({ endpoint, transport: { timeout, retries, onEvent, fetch, ... } })`. `CdcClientConfig` es ahora `ServiceClientConfig` de `@ramiidv/arca-common`.

Sin cambios de comportamiento: `constatar()` es una consulta, así que un `resultado: 'R'` (comprobante no constatado) se sigue devolviendo, no lanza `ArcaRechazoError`. Se reexportan `ArcaRechazoError` y los tipos `ServiceClientConfig`, `ServiceEndpoints` y `ServiceTransport`.
