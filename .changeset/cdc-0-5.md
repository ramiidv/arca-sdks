---
'@ramiidv/arca-cdc': minor
---

Cambio incompatible: toda la API en camelCase, con los nombres de ARCA (`CbteModo` → `cbteModo`, `CuitEmisor` → `cuitEmisor`, `CodAutorizacion` → `codAutorizacion`...). Afecta a `ConstatarInput`, `ConstatarResult` (`resultado`, `fchProceso`, `observaciones`, `events`, `cmpResp`), los mensajes (`{ code, msg }`), las tablas de parámetros (`{ cod, desc }`, `{ id, desc }`), `CdcAuth` (`{ token, sign, cuit }`) y las rutas de los errores de validación.
