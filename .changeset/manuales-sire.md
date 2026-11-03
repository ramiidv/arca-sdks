---
'@ramiidv/arca-sire': minor
---

`emitirCertificado`/`anularCertificado` ya no borran el ticket cacheado cuando SIRE rechaza el token/sign. WSAA rechaza los pedidos de un TA nuevo durante un lapso de retención, y el rechazo puede no deberse al ticket (CUIT no representada, request mal armado): borrarlo dejaba la instancia sin acceso. Se sigue lanzando `ArcaAuthError`; si el ticket está dañado, usá `clearAuthCache()`. Los importes se redondean mitad al par por el cambio de `dec()` en common.
