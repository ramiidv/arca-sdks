---
'@ramiidv/arca-facturacion': minor
---

Auditoría contra el Manual WSFEv1 v4.7, el Manual WSFEX v2.0.1 y la especificación del QR.

**Cambio de comportamiento: `Moneda.GUARANIES` y `Moneda.BOLIVIANOS` estaban invertidos.** Según la tabla de ARCA, `029` es Guaraní y `031` es Peso boliviano. Ahora `Moneda.GUARANIES = '029'` y `Moneda.BOLIVIANOS = '031'`. Quien facturaba con `Moneda.GUARANIES` enviaba pesos bolivianos (y al revés): revisá esos comprobantes.

Factura de Crédito Electrónica MiPyME:

- Nuevo `vtoPago` en `FacturarOpts` (`FchVtoPago` independiente del concepto). Las facturas FCE (201, 206, 211) lo exigen también con concepto 1 (validación 10163), algo que antes era imposible con la API simplificada. En las NC/ND FCE de concepto 1 solo se admite si son de anulación (opcional 22 = `S`, validación 10175). `servicio.vtoPago` sigue funcionando y ahora es opcional si se usa `vtoPago`.
- FCE requiere receptor con CUIT; las NC/ND FCE, `cbtesAsoc` (10153).

Exportación (WSFEX):

- **Nuevo `ArcaConflictoExpo`.** El `Id` es único por CUIT (manual WSFEX, "Manejo transaccional"): si ya lo usó otra solicitud, WSFEX devuelve esa respuesta. Antes `facturarExpo` la devolvía como `aprobada: true` para un comprobante que no se autorizó. Ahora, si la respuesta es de otro comprobante (tipo, punto de venta o número distintos), o si llega `Reproceso = "S"` con un `Id` calculado por el SDK, se lanza `ArcaConflictoExpo` con `request` y `respuesta`. El reenvío de un resultado incierto con el mismo `Id` sigue devolviendo `reproceso: true`. La documentación pide serializar las emisiones por CUIT (no por punto de venta).
- `cliente.cuitPais` e `idImpositivo` son opcionales: hace falta al menos uno (validación 1580). Sin `cuitPais` se envía `Cuit_pais_cliente` 0. `WsfexInvoice.cuitPaisCliente` e `idImpositivo` también pasan a opcionales.
- `formaPago` es obligatoria solo en Factura E (validación 1620); opcional en NC/ND (también en `WsfexInvoice`).
- Items con unidad 0, 97 (señas/anticipos) y 99 (bonificaciones): nuevo `total` explícito, con cantidad y precio en 0; con 99 el total tiene que ser negativo (validaciones 1775, 1810).

Errores:

- Los errores de autenticación del bloque de errores (WSFEv1 600 y 601, WSFEX 1000 y 1001) llegan como `ArcaAuthError` (`retryable: false`, `faultCode` con el código, `ArcaWSFEError` en `cause`) en lugar de `ArcaWSFEError`. El SDK no borra el ticket (WSAA no emite otro mientras siga vigente). El 602 ("no existen datos") sigue siendo `ArcaWSFEError`.
- `sinMovimientoCAEA`: los errores internos 500/501/502 son un `ArcaSoapError` con `uncertain: true` (antes, un rechazo `ArcaWSFEError`).
- Las respuestas con forma inválida (falta un campo obligatorio) lanzan `ArcaResponseError` en lugar de `ArcaSoapError` (en emisiones siguen llegando como resultado incierto). `ArcaResponseError` se reexporta.
- `requiereRecuperacion` reconoce también la validación 703 de `FECAEARegInformativo` (`registrarFacturaCAEA`).

Nuevas validaciones (el mensaje cita el código del manual):

- Clase A y M: además de 1-5 y 201-203, los tipos 34, 39, 60, 63 y 51-54 exigen receptor con CUIT (`docTipo` 80, validación 10013) y condición de clase A (10243).
- NC/ND sin `cbtesAsoc` ni `periodoAsoc` (10197).
- Factura/NC/ND B al No Categorizado (23000000000) con importes gravados exige el tributo 13. Nuevo `TributoTipo.PERCEP_IVA_NO_CATEGORIZADO` (validaciones 10067 y 10283).
- Nuevo `compradores` en `FacturarOpts`, con las validaciones 10136-10147.
- API raw (`crearFactura`, `registrarCAEA`): `ImpTotal` igual a la suma de importes (10048), `ImpIVA` y `ImpTrib` iguales a la suma de sus arrays (10023, 10029), con el margen del manual; `condicionIvaReceptorId` obligatorio también con DocTipo 99 (10246). Los importes se redondean a 2 decimales y `MonCotiz` a 6 (en WSFEX, `Moneda_ctz`, `Pro_qty`, `Pro_precio_uni` y `Pro_bonificacion` a 6), así que el XML lleva decimales fijos (`121.00`).

Tipos (solo cambia la opcionalidad, para que coincidan con lo que ARCA puede omitir): `FeCabResp.fchProceso` y `reproceso`, `FECAEDetResponse.cbteFch`, en `FECompConsultarResult.resultGet` `cbteFch`, `fchServDesde`, `fchServHasta`, `fchVtoPago`, `monId`, `monCotiz`, `resultado`, `codAutorizacion`, `emisionTipo`, `fchVto` y `fchProceso`, `PtoVentaItem.emisionTipo`, `bloqueado` y `fchBaja`, y `Tributo.desc` pasan a opcionales. Puede requerir chequear `undefined` en código que los lea.

Otros:

- El QR usa `generarUrlQR` de `@ramiidv/arca-common` (misma salida; `ctz` redondeada a 6 decimales y validación de punto de venta de hasta 5 dígitos y número de hasta 8). `QRInput`, `QROptions` y `QR_URL` vienen de arca-common.
- El cache de parámetros comparte las consultas simultáneas iguales (un solo request) y no guarda errores.
- Nuevas constantes `WSFE_ERRORES_AUTH`, `WSFEX_ERRORES_AUTH` y `WSFE_CAEA_NUMERO_NO_CORRESPONDE`.
- `formatFechaHora` usa `formatDateTimeAR` de arca-common.
- Correcciones de documentación: rutas de error de `registrarCAEA` (`invoices[i].caea`, `invoices[i].cbteFchHsGen`), JSDoc de `getCotizacion` y `generateQRUrl`, cita del manual (v4.7). README y llms.txt reescritos.
