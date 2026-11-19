---
"@ramiidv/arca-facturacion": minor
---

- IVA de la API simplificada redondeado mitad al par, como dice la documentación: el IVA sobre el `neto` (y la base que se despeja de un `total`) se redondea al centavo par en los empates exactos. Ejemplo: neto 0,50 al 21 % da IVA 0,10 (antes 0,11). El IVA calculado puede diferir en un centavo respecto de versiones anteriores solo en esos casos de empate exacto.
- `ArcaWSFEError.errors` conserva el código original no numérico en `rawCode` (con `code` 0), también en los `FEXErr` de WSFEX, que antes quedaban con `code` `NaN`.
- `ArcaAuthError.faultCode` es el código de autenticación (600/601 o 1000/1001) aunque ARCA lo devuelva después de otros errores.
- Parámetros cacheados (`getTiposIva`, `getMonedas`, etc.): si un llamador aborta con su `signal`, las consultas concurrentes iguales ya no fallan; el que abortó recibe un `ArcaSoapError` con `aborted: true`.
- `facturarExpo` valida el comprobante completo antes de consultar el último `Id` y número, y envía `Pro_qty` y `Pro_precio_uni` en 0 en los items con unidad 0, 97 o 99.
- `registrarFacturaCAEA` valida que el CAEA tenga 14 dígitos antes de consultar el último número.
- `sinMovimientoCAEA`: un rechazo trae los avisos de ARCA (`Events`) en `observaciones`, y una respuesta ilegible conserva el error de lectura en `cause`.
- `ArcaConflictoExpo` sin `FEXResultAuth` ya no muestra `undefined` en el mensaje.
- `resolverCbteTipo` rechaza nombres de clase heredados de `Object` (como `"toString"`).
