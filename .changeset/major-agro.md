---
'@ramiidv/arca-agro': minor
---

**Cambios que rompen compatibilidad** (release de API uniforme entre los SDKs):

- Requiere Node >= 22.12.
- Endpoints: `CPE_ENDPOINTS` y `LPG_ENDPOINTS` → `ENDPOINTS.cpe` y `ENDPOINTS.lpg` (`ENDPOINTS = { cpe, lpg }`, cada uno `ServiceEndpoints` `{ testing, production }`, con las mismas claves que `endpoints` de la configuración). `CPE_NAMESPACE` y `LPG_NAMESPACE` no cambian.
- Se quitan `agro.lpg.liquidacionAnular(coe)` y `agro.lpg.lsgAnular(coe, { pdf? })`, deprecados (el manual WSLPG los discontinuó en v1.21 y v1.22), y su tipo `AnulacionLiquidacionResultado`: usar `lpgAnularContraDocumento({ anulacionBase: { puntoEmision, nroOrden, coeAnular } })` y `lsgAnularContraDocumento(...)`, que anulan generando un contradocumento (consume un número de orden; devuelve `LiquidacionConsultaResultado`).
- `ArcaAgroServiceError` ya no se lanza con `uncertain: true` por un `resultado: 'A'` con errores (era exclusivo de los métodos quitados).

Rechazos: WSCPE y WSLPG no tienen `resultado: 'R'` (los quitados eran los únicos): ARCA rechaza una emisión informando `errores`, que sigue lanzando `ArcaAgroServiceError` (extiende `ArcaServiceError`, como el nuevo `ArcaRechazoError` de common). Este SDK no lanza `ArcaRechazoError`; lo que devuelve una emisión es siempre una operación aceptada.

Nuevo: se reexportan `ArcaRechazoError`, `ArcaResponseError` (base de `ArcaAgroResponseError`) y el tipo `ServiceEndpoints` de `@ramiidv/arca-common`.
