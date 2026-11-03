---
'@ramiidv/arca-cdc': patch
---

Documentación: glosario, cuándo es obligatorio el receptor (A y MiPyME con CUIT; B, C, R, 30, 31, 37, 38, 41 y 49 por encima de $10.000.000; validaciones 113-117), los errores 600-602 de WSCDC llegan como `ArcaServiceError` y `permanentErrorCooldownMs` en la configuración. El ejemplo de manejo de errores ya no llama a `clearAuthCache()` ante `ArcaAuthError`: indica corregir la causa y usar `wsaa.resetLoginCooldown('wscdc')`.
