---
'@ramiidv/arca-facturacion': major
---

Se quita lo deprecado y las respuestas crudas usan arrays siempre.

- `Arca` → `ArcaFacturacion`.
- `serverStatus()`, `serverStatusExpo()` y su `ServerStatus` (`AppServer`/`DbServer`/`AuthServer`) → `status()`, que devuelve `{ wsfe, wsfex }` con el `ServiceStatus` de arca-common. En los clientes de bajo nivel, `WsfeClient.serverStatus()`/`WsfexClient.serverStatus()` pasan a ser `dummy()` y devuelven el `ServerStatus` de arca-common (`appserver`/`dbserver`/`authserver`).
- Padrón: se quitan `consultarCuit`, `consultarCuitDetalle`, `PadronClient`, `Contribuyente` y `endpoints.padronA5`/`padronA13`; `clearAuthCache()` ya no toca los tickets de padrón. Usar `@ramiidv/arca-padron`.
- `requestTimeoutMs` → `timeout`.
- `ArcaFacturacion.extractCAE`, `ArcaFacturacion.formatDate`, `ArcaFacturacion.calcularTotales` y `toDateString` → la API simplificada, `formatDate` de `@ramiidv/arca-common` y la función `calcularTotales`.
- Respuestas crudas (`FECAESolicitarResult`, `FECompConsultarResult`, `CaeaRegInfResult`, `WsfexGetCmpResult`, `raw` de los resultados...): las listas son siempre arrays dentro de su contenedor (`FeDetResp.FECAEDetResponse[0]`, `Observaciones.Obs[]`, `Iva.AlicIva[]`), en lugar de `X | X[]`.
