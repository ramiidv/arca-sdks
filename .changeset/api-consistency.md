---
'@ramiidv/arca-common': minor
'@ramiidv/arca-facturacion': minor
'@ramiidv/arca-agro': minor
'@ramiidv/arca-fecred': minor
---

API uniforme entre los SDKs (los nombres anteriores siguen funcionando,
marcados `@deprecated`, hasta la próxima major):

- arca-facturacion: la clase principal es `ArcaFacturacion` (`Arca` queda como
  alias). Nuevo `status()` → `{ wsfe, wsfex }` con `ServiceStatus` y el
  `ServerStatus` de arca-common (`appserver`/`dbserver`/`authserver`);
  `serverStatus()`/`serverStatusExpo()` y su `ServerStatus` en mayúsculas
  quedan deprecados.
- arca-agro: `status()` (antes `serverStatus()`).
- arca-fecred: el cliente de bajo nivel es `client` (antes `fecred`).
- arca-common: `ServiceStatus` y `statusOf()` para el estado de varios servicios.
