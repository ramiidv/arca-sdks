---
'@ramiidv/arca-facturacion': patch
---

- **`getPuntosVenta`** (de `ArcaFacturacion` y de `WsfeClient`) devuelve `[]` cuando el emisor no tiene puntos de venta. ARCA responde en ese caso el error 602 ("Sin Resultados") sin `ResultGet`, y el SDK lanzaba `ArcaWSFEError`. Cualquier otro error sigue lanzando; las tablas de parámetros y `consultarComprobante`/`consultarCAEA` no cambian (un 602 ahí sigue siendo `ArcaWSFEError`).
- **`consultarSinMovimientoCAEA`** (de `ArcaFacturacion` y de `WsfeClient`) devuelve `[]` cuando el CAEA no tiene informes "sin movimiento". ARCA responde en ese caso el error 10102 ("El CAEA informado no se encuentra registrado ... como sin movimientos") y el SDK lanzaba `ArcaWSFEError`. El 602 también devuelve `[]`; cualquier otro error sigue lanzando.
- Documentación: casos en que WSFEv1 responde 600/601 y caracteres permitidos en el alias del opcional 2102.
