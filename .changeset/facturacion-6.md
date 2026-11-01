---
'@ramiidv/arca-facturacion': major
---

Se quita lo deprecado y las respuestas crudas usan arrays siempre.

- `Arca` → `ArcaFacturacion`.
- `serverStatus()`, `serverStatusExpo()` y su `ServerStatus` (`AppServer`/`DbServer`/`AuthServer`) → `status()`, que devuelve `{ wsfe, wsfex }` con el `ServiceStatus` de arca-common. En los clientes de bajo nivel, `WsfeClient.serverStatus()`/`WsfexClient.serverStatus()` pasan a ser `dummy()` y devuelven el `ServerStatus` de arca-common (`appserver`/`dbserver`/`authserver`).
- Padrón: se quitan `consultarCuit`, `consultarCuitDetalle`, `PadronClient`, `Contribuyente` y `endpoints.padronA5`/`padronA13`; `clearAuthCache()` ya no toca los tickets de padrón. Usar `@ramiidv/arca-padron`.
- `requestTimeoutMs` → `timeout`.
- `ArcaFacturacion.extractCAE`, `ArcaFacturacion.formatDate`, `ArcaFacturacion.calcularTotales` y `toDateString` → la API simplificada, `formatDate` de `@ramiidv/arca-common` y la función `calcularTotales`.
- **Nombres en camelCase.** La API raw, los resultados crudos (`raw`) y los tipos que se pasan en la API simplificada usan los nombres de ARCA en camelCase, con las siglas como palabras: `CbteFch` → `cbteFch`, `ImpIVA` → `impIva`, `CAEFchVto` → `caeFchVto`, `CondicionIVAReceptorId` → `condicionIvaReceptorId`, y en WSFEX `Fecha_cbte` → `fechaCbte`, `Pro_precio_uni` → `proPrecioUni`. Incluye `tributos` (`{ id, desc, baseImp, alic, importe }`), `opcionales` (`{ id, valor }`), `permisos` (`{ idPermiso, dstMerc }`), `WsfeAuth` (`{ token, sign, cuit }`) y las tablas de parámetros (`{ id, desc }`, `{ monId, monCotiz, fchCotiz }`, `{ pveNro }`...). Los mensajes de validación usan esos nombres.
- **Listas como arrays, sin el contenedor del XML:** `feDetResp[0]` (en lugar de `FeDetResp.FECAEDetResponse`), `resultGet.iva` (en lugar de `ResultGet.Iva.AlicIva`), `observaciones`, `events`. Se quitan `errors`/`fexErr` de los resultados (con errores el SDK lanza `ArcaWSFEError`) y el tipo `WsError` (usar `MensajeArca`).
