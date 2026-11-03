---
'@ramiidv/arca-sire': patch
---

Los SOAP Faults de autenticación `BAD_SERVICE` (token/sign emitido para otro servicio) y `CANT_VERIFY_DATA` (token y sign que no se corresponden), observados en homologación, se lanzan como `ArcaAuthError` en `emitirCertificado`/`anularCertificado`. Antes quedaban como `ArcaSoapError` con `uncertain: true`, aunque SIRE los rechaza antes de procesar el request. El `message` del `ArcaAuthError` agrega el `detail` del Fault cuando difiere del código (ej: `SIRE emitir: BAD_SERVICE (V2 - El service (wsfecred) no es igual a los nombres de sistema)`). El ticket cacheado sigue sin borrarse.
