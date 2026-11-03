---
'@ramiidv/arca-sire': patch
---

Documentación: hosts `arca.gob.ar` que publica el manual v1.0.3 y cómo usarlos con `endpoints.sire`; `permanentErrorCooldownMs` en la configuración de WSAA; `coe`/`coeOriginal`/`cae` con solo espacios dan `ArcaValidationError`; regla de `fechaComprobante` para los tipos 3, 19 y 20; requisitos con los enlaces para el certificado y el micrositio SIRE. El JSDoc de `ArcaSireServiceError` ya no menciona token/sign inválido (sale como `ArcaAuthError`). Los ejemplos usan las mismas rutas de certificado que el README.
