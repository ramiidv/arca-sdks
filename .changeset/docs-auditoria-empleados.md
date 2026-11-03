---
'@ramiidv/arca-empleados': patch
---

Documentación corregida: con el builder en modo `strict` (default) los errores de formato llegan como `ArcaValidationError` (en `details`); `ArcaSerializationError` sale con `strict: false` o con `serializarRegistro`/`serializarArchivo`. El ejemplo de manejo de errores ahora muestra los dos casos. `noRepresentables: 'transliterar'` solo cambia los caracteres no representables en el encoding (con `latin1` se conservan Ñ y Ú). Referencias al manual corregidas (pág. 19 para el plazo de 90 días del alta y la fecha de fin).
