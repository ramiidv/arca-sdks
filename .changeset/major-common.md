---
'@ramiidv/arca-common': minor
---

**Cambios que rompen compatibilidad** (release de API uniforme entre los SDKs):

- Requiere Node >= 22.12 (Node 20 llegó a fin de vida el 30/04/2026).
- Se quitan los alias deprecados `afipSoapCall`, `AfipSoapCallOptions`, `parseAfipDate`, `validateCuil`, `normalizeCuil` y `formatCuil`: usar `arcaSoapCall`, `ArcaSoapCallOptions`, `parseArcaDate`, `validateCuit`, `normalizeCuit` y `formatCuit`.

Nuevo:

- `ArcaRechazoError` (subclase de `ArcaServiceError`, `code` `ARCA_RECHAZO`, con `operacion`, `errors` y `observaciones`): los SDKs lo lanzan cuando ARCA rechaza una operación (`resultado` R), en lugar de devolver el rechazo.
- `ServiceClientConfig` (`{ endpoint, transport? }`): la configuración de los clientes de bajo nivel de todos los SDKs.
- `ServiceEndpoints` (`{ testing, production }`): la forma de cada servicio en el `ENDPOINTS` que exporta cada SDK.
- `formatServiceErrors(details)`: la lista `[código] mensaje, ...` con la que todos los SDKs arman los mensajes de error de ARCA.
