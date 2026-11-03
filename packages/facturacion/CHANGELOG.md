# Changelog

## 7.0.2

### Patch Changes

- e763bcb: Los source maps publicados incluyen el código fuente embebido (`inlineSources`), así que se pueden depurar sin `src/`. El build borra `dist/` antes de compilar, para que no se publiquen archivos de módulos eliminados.
- Updated dependencies [e763bcb]
- Updated dependencies [8424364]
  - @ramiidv/arca-common@0.10.0

## 7.0.1

### Patch Changes

- 16f2686: - **`getPuntosVenta`** (de `ArcaFacturacion` y de `WsfeClient`) devuelve `[]` cuando el emisor no tiene puntos de venta. ARCA responde en ese caso el error 602 ("Sin Resultados") sin `ResultGet`, y el SDK lanzaba `ArcaWSFEError`. Cualquier otro error sigue lanzando; las tablas de parámetros y `consultarComprobante`/`consultarCAEA` no cambian (un 602 ahí sigue siendo `ArcaWSFEError`).
  - **`consultarSinMovimientoCAEA`** (de `ArcaFacturacion` y de `WsfeClient`) devuelve `[]` cuando el CAEA no tiene informes "sin movimiento". ARCA responde en ese caso el error 10102 ("El CAEA informado no se encuentra registrado ... como sin movimientos") y el SDK lanzaba `ArcaWSFEError`. El 602 también devuelve `[]`; cualquier otro error sigue lanzando.
  - Documentación: casos en que WSFEv1 responde 600/601 y caracteres permitidos en el alias del opcional 2102.
- Updated dependencies [e1c8de0]
  - @ramiidv/arca-common@0.9.1

## 7.0.0

### Major Changes

- 8b9e83a: **Cambios que rompen compatibilidad** (release de API uniforme entre los SDKs):
  
  - Requiere Node >= 22.12.
  - **Los rechazos lanzan `ArcaRechazoError`** (de `@ramiidv/arca-common`, `code` `ARCA_RECHAZO`, extiende `ArcaServiceError`; también se exporta desde este paquete). `facturar`, `notaCredito`, `notaDebito`, `registrarFacturaCAEA` y `facturarExpo` devuelven siempre un comprobante autorizado; si ARCA responde `Resultado` "R", lanzan el error con `operacion` (`'FECAESolicitar'`, `'FECAEARegInformativo'` o `'FEXAuthorize'`), `errors` y `observaciones` (`{ code, msg }[]`). En WSFEv1 los motivos vienen en `observaciones` (las `Obs` del comprobante); en WSFEX, `Motivos_Obs` como `{ code: 0, msg }`.
    - Antes: `const r = await arca.facturar(opts); if (!r.aprobada) console.error(r.observaciones);`
    - Ahora: `try { const r = await arca.facturar(opts); } catch (e) { if (e instanceof ArcaRechazoError) console.error(e.observaciones); else throw e; }`
    - Exportación: antes `if (!res.aprobada) console.error(res.obs)` → ahora `catch (e) { if (e instanceof ArcaRechazoError) console.error(e.observaciones[0]?.msg) }`.
  - **`sinMovimientoCAEA`** lanza `ArcaRechazoError` (`operacion: 'FECAEASinMovimientoInformar'`) si ARCA responde `Resultado` "R". Antes: devolvía `{ resultado: 'R' }` → ahora el valor devuelto siempre tiene `resultado: 'A'`.
  - **Se quita `aprobada`** de `FacturaResult` y `FacturaExpoResult` (siempre `true`), y **`cae` pasa a ser obligatorio** (`string`). Antes: `if (r.aprobada) usar(r.cae!)` → ahora: `usar(r.cae)`. En `registrarFacturaCAEA`, `cae` es el CAEA (si la respuesta no lo repite, el informado).
  - Una respuesta **aprobada sin CAE** (o con un `Resultado` desconocido) de `facturar`, `notaCredito`, `notaDebito` o `registrarFacturaCAEA` lanza `ArcaResultadoIncierto` (con `intento`, resolver con `recuperarComprobante`). Antes: devolvía `aprobada: true` sin `cae`. (`facturarExpo` ya lanzaba `ArcaResultadoInciertoExpo`.)
  - **`requiereRecuperacion(error: unknown)`** recibe el error lanzado, no el resultado. Antes: `requiereRecuperacion(res)` con un `FacturaResult` rechazado → ahora: `catch (e) { if (requiereRecuperacion(e)) ... }` (10016 por número en un `ArcaRechazoError` de `FECAESolicitar`, 703 en uno de `FECAEARegInformativo`, o esos códigos en un `ArcaWSFEError`; cualquier otro valor da `false`).
  - **`recuperarComprobante`**: si el número existe con los datos del intento pero ARCA lo informa rechazado, lanza `ArcaRechazoError` (`operacion: 'FECompConsultar'`). Si coinciden los datos pero el `Resultado` es desconocido o falta `CodAutorizacion`, lanza `ArcaResponseError`. Antes: en ambos casos devolvía `{ estado: 'conflicto' }`. Con otros datos sigue siendo `conflicto`.
  - **`facturaResultDesdeConsulta`** lanza `ArcaRechazoError` si el comprobante consultado está rechazado y `ArcaResponseError` si el `Resultado` no es "A" ni "R" o si no tiene `CodAutorizacion`. Antes: devolvía `aprobada: false` / `cae: undefined`.
  - **`urlQRDesdeFactura` / `urlQR`**: ya no miran `aprobada` (los resultados siempre están autorizados); solo validan que haya `cae` (`ArcaValidationError` en `factura.cae`).
  - El mensaje de `ArcaWSFEError` separa los errores con comas, como el resto de los SDKs (`[10016] ..., [10048] ...`; antes `; `).
  - **Clientes de bajo nivel**: se construyen con `ServiceClientConfig` de arca-common (`{ endpoint, transport? }`). Se quita `WsClientOptions`.
    - Antes: `new WsfeClient(false, { timeoutMs: 60_000, endpoint })` / `new WsfexClient(true)`
    - Ahora: `new WsfeClient({ endpoint: ENDPOINTS.wsfe.testing, transport: { timeout: 60_000 } })` / `new WsfexClient({ endpoint: ENDPOINTS.wsfex.production })`.
    - Los clientes de bajo nivel y la API raw (`crearFactura`, `crearFacturaAuto`, `registrarCAEA`, `crearFacturaExportacion`) siguen devolviendo la respuesta de ARCA tal cual: un comprobante con `resultado` "R" (o un lote "P") no lanza.
  
  Nuevo:
  
  - `ENDPOINTS` se declara `satisfies Record<string, ServiceEndpoints>` (`{ wsfe, wsfex }`, cada uno `{ testing, production }`; mismas claves que `config.endpoints`).
  - Se reexportan `ArcaRechazoError` y los tipos `ServiceErrorDetail`, `ServiceClientConfig`, `ServiceEndpoints` y `ServiceTransport` de arca-common.

### Patch Changes

- Updated dependencies [2ce6ef5]
  - @ramiidv/arca-common@0.9.0

## 6.2.0

### Minor Changes

- 1cccecc: Validaciones locales nuevas del manual de WSFEv1 y de WSFEX (lanzan `ArcaValidationError` sin llamar a ARCA):
  
  - Facturas FCE MiPyME (201, 206, 211): los opcionales 2101 (CBU) y 27 (`SCA` o `ADC`) son obligatorios y no se acepta el 22 (validaciones 10168, 10216, 10214/10215, 10171).
  - NC/ND FCE MiPyME: el opcional 22 (anulación `S` o `N`) es obligatorio y no se aceptan 2101, 2102 ni 27 (validaciones 10173, 10167, 10172).
  - FCE: el 2101 son 22 dígitos y el 2102 (alias) de 6 a 20 caracteres (validaciones 10165, 10166).
  - Los comprobantes que no son FCE no aceptan los opcionales 2101, 2102, 22 ni 27 (validación 10169).
  - Factura E (19) de bienes (`tipoExpo` 1): `incoterms` es obligatorio (validación 1640), e `incotermsDes` requiere `incoterms` (1641).
  
  Documentación: glosario y pasos previos (certificado, relación con el servicio, punto de venta), `permanentErrorCooldownMs` y las opciones que se ignoran con `wsaa` compartido, campos opcionales de `FacturaResult`, `clearAuthCache()` async, ejemplo FCE con el opcional 27 y ejemplos con `ticketStorage`, código de país y CUIT país de EE.UU. corregidos (212, 55000002126) y ejemplo de emisión segura sin importar de `@ramiidv/arca-common` y guardando la fecha como `YYYYMMDD` (`intento.fecha`) para poder reenviarla después de persistirla en JSON.
- cd63fb7: Revisión contra el manual de WSFEv1 v4.8 y el de WSFEX 3.1.1.
  
  **Cambio de comportamiento: redondeo mitad al par.** Los importes que calcula la API simplificada (`calcularTotales`, `facturar`, `facturarExpo`, el QR) y los decimales de la API raw se redondean con Round Half Even, el criterio de los manuales de WSFEv1 y WSFEX: `1.005` → `1.00`, `1.015` → `1.02`.
  
  WSFEX:
  
  - Con `canMisMonExt: 'S'` en moneda extranjera la cotización se puede omitir: ARCA registra la cotización oficial (validación 1602). `FacturarExpoOpts.cotizacion` y `WsfexInvoice.monedaCtz` pasan a ser opcionales.
  - Nuevas validaciones locales: PES con cotización 1 (1601), cotización de hasta 4 enteros (1600), `canMisMonExt` solo en Factura E en moneda extranjera, tampoco `'N'` con PES (1605), la Factura E solo asocia remitos 88, 89, 91, 993 y 994 (1755), un solo asociado salvo remitos 88/89 (1754) y las NC/ND de servicios llevan asociados (2047).
  
  WSFEv1:
  
  - `notaCredito`/`notaDebito` infieren el tipo también cuando el original es una nota, un recibo u otro comprobante de la clase (`FCE_NOTA_DEBITO_A` → `FCE_NOTA_CREDITO_A`, `RECIBO_B` → `NOTA_CREDITO_B`). En FCE, una NC no se infiere desde otra NC ni una ND desde otra ND (validaciones 10157 y 10183). `NOTA_CREDITO_MAP`/`NOTA_DEBITO_MAP` salen de la nueva tabla `CBTES_ASOCIABLES` (validación 10040).
  - B al No Categorizado (23000000000) con otros tributos y sin el tributo 13 ya no se rechaza localmente: es la validación 10283, que solo observa. Sin tributos sigue siendo la 10067.
  - Nuevas validaciones locales: condición frente al IVA del receptor en clase B y en el tipo 49 (10243); tipo 49 con concepto 1 y opcionales 91 y 93 (10085, 10078, 10084); `docTipo` 31 (FCI CNV) con `docNro` de hasta 4 dígitos y condición 15 (10271, 10272); `docTipo` 99 con `docNro` 0, `docNro` obligatorio con cualquier otro `docTipo` y el tipo 49 sin `docTipo` 99 (10015); el receptor y los compradores no pueden ser el emisor (10069, 10140); `cbtesAsoc` solo en los tipos y con los asociados del manual (10040); `opcionales` solo en los tipos que los admiten (10068); opcionales de Seguros de Caución 2901/2902 (10273-10276, 10280, 10281); NC/ND FCE con `cuit` y `fecha` en cada asociado (10151, 10158), que sin anulación asocian una sola factura FCE y, además, remitos (10156/10157), y asociados de una anulación, sin remitos (10183); FCE sin el receptor 23000000000 (10178) y con `vtoPago` no anterior a hoy (10164); compradores solo en A, B, C o M (no FCE), con concepto 1, CUIT de 11 dígitos y porcentajes de 2 decimales (10134, 10150, 10194, 10139, 10143); con empate en el mayor porcentaje alcanza con que el receptor sea uno de ellos (10146); cotización de hasta 4 enteros.
  - Documentación: citas del manual WSFEv1 v4.8 y WSFEX 3.1.1.

### Patch Changes

- Updated dependencies [1cccecc]
- Updated dependencies [bd57c86]
  - @ramiidv/arca-common@0.8.0

## 6.1.0

### Minor Changes

- db257db: Auditoría contra el Manual WSFEv1 v4.7, el Manual WSFEX v3.1.1 y la especificación del QR.
  
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

### Patch Changes

- Updated dependencies [b152f08]
  - @ramiidv/arca-common@0.7.0

## 6.0.0

### Major Changes

- d535462: Se quita lo deprecado y las respuestas crudas usan arrays siempre.
  
  - `Arca` → `ArcaFacturacion`.
  - `serverStatus()`, `serverStatusExpo()` y su `ServerStatus` (`AppServer`/`DbServer`/`AuthServer`) → `status()`, que devuelve `{ wsfe, wsfex }` con el `ServiceStatus` de arca-common. En los clientes de bajo nivel, `WsfeClient.serverStatus()`/`WsfexClient.serverStatus()` pasan a ser `dummy()` y devuelven el `ServerStatus` de arca-common (`appserver`/`dbserver`/`authserver`).
  - Padrón: se quitan `consultarCuit`, `consultarCuitDetalle`, `PadronClient`, `Contribuyente` y `endpoints.padronA5`/`padronA13`; `clearAuthCache()` ya no toca los tickets de padrón. Usar `@ramiidv/arca-padron`.
  - `requestTimeoutMs` → `timeout`.
  - `ArcaFacturacion.extractCAE`, `ArcaFacturacion.formatDate`, `ArcaFacturacion.calcularTotales` y `toDateString` → la API simplificada, `formatDate` de `@ramiidv/arca-common` y la función `calcularTotales`.
  - **Nombres en camelCase.** La API raw, los resultados crudos (`raw`) y los tipos que se pasan en la API simplificada usan los nombres de ARCA en camelCase, con las siglas como palabras: `CbteFch` → `cbteFch`, `ImpIVA` → `impIva`, `CAEFchVto` → `caeFchVto`, `CondicionIVAReceptorId` → `condicionIvaReceptorId`, y en WSFEX `Fecha_cbte` → `fechaCbte`, `Pro_precio_uni` → `proPrecioUni`. Incluye `tributos` (`{ id, desc, baseImp, alic, importe }`), `opcionales` (`{ id, valor }`), `permisos` (`{ idPermiso, dstMerc }`), `WsfeAuth` (`{ token, sign, cuit }`) y las tablas de parámetros (`{ id, desc }`, `{ monId, monCotiz, fchCotiz }`, `{ pveNro }`...). Los mensajes de validación usan esos nombres.
  - **Listas como arrays, sin el contenedor del XML:** `feDetResp[0]` (en lugar de `FeDetResp.FECAEDetResponse`), `resultGet.iva` (en lugar de `ResultGet.Iva.AlicIva`), `observaciones`, `events`. Se quitan `errors`/`fexErr` de los resultados (con errores el SDK lanza `ArcaWSFEError`) y el tipo `WsError` (usar `MensajeArca`).

### Minor Changes

- 8cfee57: WSFEv1 y WSFEX sobre el DSL de schemas de `@ramiidv/arca-common/schema`, con tests de contrato contra `wsdl/wsfev1.wsdl` y `wsdl/wsfexv1.wsdl`.
  
  - Respuestas: se piden como texto (`parseNumbers: false`) y se decodifican según el WSDL. Los `xs:string` conservan los ceros y los decimales (por ejemplo `MonId` `"060"`, CAE con cero inicial). Los `xs:long` llegan como `number`, como dicen sus tipos (`DocNro`, `FeCabResp.Cuit`, `CbteDesde` de 8 o más dígitos antes llegaban como string). Las listas de las respuestas crudas mantienen la forma `X | X[]` del XML.
  - Una respuesta con forma inválida (un número que no es numérico, un obligatorio que falta) lanza `ArcaSoapError` en las consultas y `ArcaResultadoIncierto`/`ArcaResultadoInciertoExpo` en las emisiones.
  - Requests: `buildDetRequest`, `buildFexCmp` y todas las consultas validan el tipo de cada campo y lo ordenan según el WSDL antes de llamar a ARCA (`ArcaValidationError` con la ruta, por ejemplo `FeDetReq[0].DocNro`). Las fechas aceptan `AAAAMMDD` o `AAAA-MM-DD`.

### Patch Changes

- Updated dependencies [87f58c1]
  - @ramiidv/arca-common@0.6.0

## 5.0.0

### Major Changes

- bed68e8: Paquetes solo ESM y Node >= 20.19. `arca-common`, `arca-facturacion` y
  `arca-padron` dejan de publicar un build CommonJS: desde CommonJS se cargan con
  `require()` (require(esm), Node >= 20.19 / 22.12). Todos los paquetes pasan a
  requerir Node >= 20.19.0 (Node 18 y 20 sin soporte). El código vive ahora en el
  monorepo `arca-sdks`.

### Minor Changes

- 8c02c30: API uniforme entre los SDKs (los nombres anteriores siguen funcionando,
  marcados `@deprecated`, hasta la próxima major):
  
  - arca-facturacion: la clase principal es `ArcaFacturacion` (`Arca` queda como
    alias). Nuevo `status()` → `{ wsfe, wsfex }` con `ServiceStatus` y el
    `ServerStatus` de arca-common (`appserver`/`dbserver`/`authserver`);
    `serverStatus()`/`serverStatusExpo()` y su `ServerStatus` en mayúsculas
    quedan deprecados.
  - arca-agro: `status()` (antes `serverStatus()`).
  - arca-fecred: el cliente de bajo nivel es `client` (antes `fecred`).
  - arca-common: `ServiceStatus` y `statusOf()` para el estado de varios servicios.
- f8bd053: Las clases principales extienden `ArcaSdkBase` de arca-common, así que todos
  los SDKs tienen la misma base: `wsaa`, `cuit`, `production`, `on()`/`off()`,
  `clearAuthCache()`, `config.wsaa` (WsaaClient compartido) y `config.signal`
  (signal global). arca-mtxca acepta `endpoints: { mtxca, wsaa }` (`endpoint` y
  `wsaaEndpoint` quedan deprecados). Los `dummy`/`status` validan la respuesta con
  `parseServerStatus`: si falta un campo lanzan `ArcaSoapError`.

### Patch Changes

- Updated dependencies [8c02c30]
- Updated dependencies [f8bd053]
- Updated dependencies [242fb5f]
- Updated dependencies [fd438bc]
- Updated dependencies [bed68e8]
- Updated dependencies [20ecf7d]
- Updated dependencies [b86db00]
  - @ramiidv/arca-common@0.5.0

## 4.0.0 (2026-11-01)

Correcciones contra el WSDL de WSFEv1/WSFEX, el manual WSFEv1 v4.7, el manual WSFEX 3.1.1 y la
especificación del QR. Requiere `@ramiidv/arca-common` ^0.4.0.

### Breaking changes
Cambios de comportamiento que eran bugs (la API pública se mantiene):
- `getCotizacion` devuelve `ResultGet` (`{ MonId, MonCotiz: number, FchCotiz }`); antes devolvía el
  wrapper completo y `MonCotiz` quedaba `undefined`.
- `registrarFacturaCAEA` exige `fechaHoraGeneracion` (`CbteFchHsGen`, obligatorio desde la RG 5782,
  error 1440) y la fecha del comprobante sale de ahí si no se pasa `fecha` (antes usaba la fecha del
  informe). `registrarCAEA` (raw) exige `CbteFchHsGen` en cada comprobante.
- `facturarExpo` / `crearFacturaExportacion`: un resultado incierto lanza `ArcaResultadoInciertoExpo`
  (antes `ArcaSoapError` con `uncertain: true`, o `aprobada: false` con un número inventado si faltaba
  `FEXResultAuth`). Los errores internos 500/501/502/505 de WSFEX también son inciertos.
- `facturarExpo`: `Permiso_existente` va vacío en NC/ND E (antes `"N"`, error 1720) y
  `permisoExistente` solo se admite en Factura E de bienes; `fechaPago` solo en Factura E (1673).
- `notaCredito`/`notaDebito` de una Factura E y `facturar` con tipo E lanzan `ArcaValidationError`
  (WSFEv1 los rechaza: van por WSFEX).
- Validaciones nuevas antes de enviar: fechas inexistentes (`20261399`), concepto 2/3 sin `servicio`
  y concepto 1 con `servicio`, `servicio.hasta < desde`, cotización con PES distinta de 1, cotización
  <= 0, `canMisMonExt: "S"` con PES, CUIT del receptor (docTipo 80/86) y de comprobantes asociados con
  dígito verificador, clase A con docTipo 99, tributos con importes negativos. El CUIT de la config
  también se valida.
- `requiereRecuperacion` devuelve `false` para el 10016 por fecha (`CbteFch` fuera de rango).
- `Arca.generateQRUrl` usa la URL de la especificación vigente (`https://www.arca.gob.ar/fe/qr/`,
  configurable con `{ baseUrl }`), envía `fecha` como `YYYY-MM-DD` aunque reciba `YYYYMMDD` y omite
  `tipoDocRec`/`nroDocRec` si no vienen. Valida CUIT y CAE.
- `getPuntosVenta` ya no se cachea.
- Tipos: `InvoiceDetail.MonCotiz` es opcional (no se exige con `CanMisMonExt = "S"`),
  `WsfexGetCmpResult` tiene los campos del WSDL (`Fecha_cbte_cae`, `Motivos_Obs`; no `Obs` inventado),
  `WsfexInvoice.Opcionales` es `Opcional[]`, `CaeaSinMovResult` sin campos obligatorios inventados,
  `DocTipo` es el de `@ramiidv/arca-common` (más códigos, mismos valores).

### Features
- `ArcaConfig` extiende `ArcaBaseConfig`: `timeout` (`requestTimeoutMs` queda como alias deprecado),
  `fetch`, `legacyTls` y `loginErrorCooldownMs` se pasan a WSAA y a todas las llamadas SOAP; CUIT como
  número o string; `endpoints` para usar URLs propias.
- Producción de WSFEv1/WSFEX en Node >= 17: fallback automático al transporte TLS legacy de
  arca-common (`legacyTls: "auto"`). Documentado en "Producción y TLS".
- `facturarExpo`: `id` y `cbteNro` opcionales para reenviar con el mismo `Id`; resultado con `id`,
  `reproceso`, `fecha` y `eventos`. `ArcaResultadoInciertoExpo` con `id`, `cbteTipo`, `ptoVta`,
  `cbteNro`, `intento` y `request`.
- WSFEv1: `consultarSinMovimientoCAEA` (`FECAEASinMovimientoConsultar`), `getActividades`
  (`FEParamGetActividades`), `getTiposPaises` (`FEParamGetTiposPaises`), `getCotizacion(mon, { fecha })`
  (`FchCotiz`), `getCondicionesIva({ claseCmp })`. `PeriodoAsoc` (`periodoAsoc`), `Actividades`
  (`actividades`) y `Compradores` (raw) en el detalle.
- WSFEX: `getCotizacionExpo` (`FEXGetPARAM_Ctz`), `checkPermisoExpo` (`FEXCheck_Permiso`),
  `getPuntosVentaExpo` (`FEXGetPARAM_PtoVenta`), `getOpcionalesExpo` (`FEXGetPARAM_Opcionales`),
  `getActividadesExpo` (`FEXGetPARAM_Actividades`), `getMonedasConCotizacionExpo`
  (`FEXGetPARAM_MON_CON_COTIZACION`); `opcionales` y `actividades` en `facturarExpo`.
  `siguienteComprobanteExpo` acepta `CallOptions`.
- `FacturaResult` expone `eventos` (`Events`), `fecha`, `docTipo`, `docNro`, `moneda`, `cotizacion` y
  `tipoCodAut`. `CaeaSolicitarResult.eventos`.
- QR: `arca.urlQR(factura)`, `urlQRDesdeFactura` y `generarUrlQR`; `codAut` acepta el CAE string.
- `formatFechaHora` (formato `yyyymmddhhmmss` para `CbteFchHsGen`).
- `ArcaWSFEError` extiende `ArcaServiceError` de arca-common (mismo `code` y campos).

### Fixes
- El detalle de `FECAESolicitar`/`FECAEARegInformativo` y el `Cmp` de `FEXAuthorize` se serializan en
  el orden de la secuencia del WSDL (antes `FchServ*`, `CondicionIVAReceptorId`, `Iva`/`Tributos` y
  `Fecha_cbte` iban fuera de orden).
- `FECAEASinMovimientoInformar` envía `PtoVta` antes que `CAEA` (orden del WSDL).
- `getCondicionesIva` leía `CondicionIVAReceptor` y devolvía siempre `[]`; el elemento es `CondicionIvaReceptor`.
- `getPaisesExpo` llamaba a `FEXGetPARAM_DST_Pais`; la operación es `FEXGetPARAM_DST_pais`.
- Tributos: `Importe` y `BaseImp` redondeados a 2 decimales, igual que `ImpTrib`.
- Respuestas sin el campo obligatorio (`CbteNro`, `RegXReq`, `ResultGet` de CAEA/cotización,
  `Cbte_nro`/`Id` de WSFEX) lanzan error en lugar de devolver `0`/`NaN`/`undefined`.
- `getMonedas` mantiene los códigos como string (`"060"`).

### Interno
- Sin `soap-client.ts` propio: WSFEv1 y WSFEX usan `afipSoapCall` de arca-common con
  `qualified: true` y `soapActionFromMethod: true` (mismo SOAPAction que antes, verificado en tests).
  Errores de WSFE con `extractServiceErrors`.
- `toDateString`, `Arca.formatDate`, `Arca.extractCAE` y `Arca.calcularTotales` marcados `@deprecated`.
- Tests: el mock de `fetch` verifica endpoint, SOAPAction, wrapper y namespace de cada request; tests
  nuevos de WSFEX, CAEA, cotización, parámetros, cache, serialización y QR.

## 3.0.0 (2026-10-30)

Objetivo de esta versión: que cada comprobante termine **autorizado o con la certeza de que no se
emitió**, nunca en un estado ambiguo.

### Breaking changes
- **Las emisiones nunca se reintentan.** `retries` aplica solo a consultas (último comprobante,
  consultas, parámetros, login WSAA, padrón). Ante timeout, conexión cortada, HTTP 5xx, abort después
  de enviar o respuesta ilegible en `FECAESolicitar` / `FECAEARegInformativo`, se lanza
  `ArcaResultadoIncierto` (antes: `ArcaSoapError`, y el request se reintentaba).
- **`condicionIva` obligatoria si el receptor está identificado** (`docTipo` distinto de 99) también en
  `notaCredito` y `notaDebito`, que antes no validaban nada. La API raw (`crearFactura`) exige
  `CondicionIVAReceptorId` en ese caso.
- Los errores de validación son `ArcaValidationError` (con `field` y `details`). Siguen extendiendo
  `ArcaError` y el mensaje sigue empezando con "Validación:".
- El IVA de los items con `neto` se redondea por alícuota y no por item (puede cambiar un centavo en
  facturas con muchos items de la misma alícuota; ahora la suma siempre es exacta).
- `FacturaResult.raw` es `FECAESolicitarResult | FECompConsultarResult`.
- `clearAuthCache()` devuelve `Promise<void>`.
- `consultarCuitDetalle` usa la constancia de inscripción (`ws_sr_constancia_inscripcion`,
  `getPersona_v2`): el certificado necesita esa autorización (A5 está deprecado por ARCA).
- Requiere `@ramiidv/arca-common` ^0.3.0 (`AccessTicket.expirationTime` es un string ISO).

### Features
- Los errores internos de ARCA (500, 501, 502) en una emisión se informan como `ArcaResultadoIncierto`,
  no como rechazo.
- `requiereRecuperacion(resultado | error)`: detecta la validación 10016 (número ya usado), que llega
  como `aprobada: false` con observaciones y suele indicar que un intento anterior se autorizó.
- `ArcaResultadoIncierto` con `intento` (`ptoVta`, `cbteTipo`, `cbteNro`, `importeTotal`, `docTipo`,
  `docNro`, `fecha`), `intentos` y `operacion`.
- `recuperarComprobante(intento)`: `autorizado` (con CAE), `no_emitido` o `conflicto`.
- `cbteNro` opcional en `facturar`, `notaCredito`, `notaDebito` y `registrarFacturaCAEA`.
- `armarComprobante(opts)`: función pura (también método de `Arca`) que valida y arma el comprobante
  sin red, y devuelve `{ request, importes, intento }`.
- Items con precio final: `{ total, iva }` además de `{ neto, iva }`.
- `descuentoGlobal`, prorrateado entre alícuotas, exento y no gravado. Importes en centavos: la suma de
  los componentes es exactamente `ImpTotal`.
- `resolverCbteTipo(emisor, receptor, clase?)` según RG 1415, RG 5003/2021 y el manual WSFEv1.
- `ticketStorage`, `clockOffsetMs`, `autoClockSkew`, `signal` y `wsaa` en `ArcaConfig`; `signal` por
  llamada en todos los métodos. La fecha por defecto usa el reloj de ARCA.
- `ArcaWSFEError.tieneCodigo(code)`; `code` estable en todos los errores; `instanceof` entre copias.
- Exports de funciones puras: `armarComprobante`, `calcularTotales`, `resolverCbteTipo`,
  `intentoDesdeComprobante`, `coincideConIntento`, `facturaResultDesdeConsulta`, `toDateString`.
- Build dual ESM + CommonJS con `exports` condicional, y smoke test CommonJS/ESM en CI.

### Fixes
- `registrarFacturaCAEA` devuelve el CAEA en `cae` (antes `undefined`; FECAEARegInformativo no trae `CAE`).
- Un listener (`onEvent` / `arca.on`) que lanzaba podía hacer fallar una emisión ya autorizada.
- Importes con 3 decimales se redondean bien (1.005 → 1.01).
- Se quitaron dependencias que no se usaban (`fast-xml-parser`, `node-forge`): XML y WSAA vienen de
  arca-common.
- Padrón A13 y constancia de inscripción no funcionaban contra ARCA: los parámetros heredaban el
  namespace del método y la respuesta con prefijo (`ns2:getPersonaResponse`) no se reconocía (#1).
- Documentación: el paquete es `@ramiidv/arca-facturacion` (el README decía `@ramiidv/arca-sdk`).
- La fecha de obligatoriedad de `CondicionIVAReceptorId` es el 01/12/2026 (RG 5616, manual WSFEv1
  v4.8), no abril 2026.

### Limitaciones conocidas
- En exportación (`facturarExpo`, `crearFacturaExportacion`) y en `sinMovimientoCAEA`, un resultado
  incierto llega como `ArcaSoapError` con `uncertain: true` (no hay `recuperarComprobante` para WSFEX):
  verificar con `consultarComprobanteExpo` antes de reenviar.

### Deprecated
- `PadronClient`, `consultarCuit` y `consultarCuitDetalle`: usar `@ramiidv/arca-padron`.

### Migración de 2.x a 3.0

1. **Persistí el ticket de acceso** (recomendado):
   ```ts
   new Arca({ ...config, ticketStorage: new FileTicketStorage("./.arca-tickets") });
   ```
2. **Manejá el resultado incierto.** Antes, un timeout en `facturar` se reintentaba (y podía chocar con
   la numeración) o terminaba en `ArcaSoapError`. Ahora:
   ```ts
   try {
     await arca.facturar({ ...opts, cbteNro });
   } catch (e) {
     if (e instanceof ArcaResultadoIncierto) {
       const r = await arca.recuperarComprobante(e.intento);
       // "autorizado" → usar r.resultado.cae; "no_emitido" → reintentar con el mismo cbteNro;
       // "conflicto" → revisión manual
     }
   }
   ```
   Si tenías `catch (e) { if (e instanceof ArcaSoapError) reintentar() }` alrededor de `facturar`,
   **quitalo**: reintentar una emisión sin recuperar primero es justamente lo que esta versión evita.
3. **Pasá `condicionIva`** en NC/ND (y en facturas) cuando el receptor tiene `docTipo` distinto de 99.
   Para obtenerla: `condicionIvaDesdePadron` de `@ramiidv/arca-padron`.
4. Si capturabas errores de validación por clase, `ArcaValidationError` sigue siendo `instanceof ArcaError`.
5. `await arca.clearAuthCache()`.
6. Si usabas `consultarCuitDetalle`, autorizá `ws_sr_constancia_inscripcion` en el certificado
   (o migrá a `@ramiidv/arca-padron`).
7. Si leías `raw` de `FacturaResult` asumiendo `FECAESolicitarResult`, chequeá `"FeCabResp" in result.raw`.

## 2.0.0 – 2.1.0

- Renombre a `@ramiidv/arca-facturacion` y migración de WSAA/SOAP a `@ramiidv/arca-common`.

## 1.2.5

- **Fix**: `Permiso_existente` now defaults to `""` for Servicios (2) and Otros (4) — was `"N"` which AFIP rejects
- **Fix**: `Fecha_pago` auto-set to invoice date for service exports when not provided
- Round `Imp_total` to 2 decimals in `facturarExpo`
- Validate `condicionIva` required for non-consumidor-final invoices
- Validate `tipoExpo`, `cliente.domicilio`, `cliente.cuitPais` in export
- 53 tests (5 new validation tests)

## 1.2.4

- **Fix**: WSFEX `FEXGetLast_CMP` params inside Auth with correct field name `Pto_venta`
- **Fix**: CAEA `solicitarCAEA`/`consultarCAEA` now parse `ResultGet` wrapper correctly
- **Fix**: CAEA `registrarCAEA` uses correct response type `FECAEADetResponse`
- **Fix**: `WsfexAuthResult.Obs` renamed to `Motivos_Obs` (matches WSDL)
- **Fix**: `WsfexLastCmpResult` corrected to only `Cbte_nro` + `Cbte_fecha`
- **Fix**: `WsfexInvoice.Imp_total` now required (WSDL `minOccurs=1`)
- `WsfexParamItem` changed to `Record<string, string | number>` (field names vary by param type)
- `ComprobanteAsociado.Cuit` type changed to `string | number`

## 1.2.3

- Add input validation: `validateFacturarOpts`, `validateFacturarExpoOpts`, `validateInvoiceRequest`
- Add parameter caching (24h default, configurable via `paramCacheTTLMs`)
- Add `clearParamCache()` method
- Add JSDoc on all public methods
- Add 48 unit tests with vitest
- Add `test` and `test:watch` scripts

## 1.2.2

- Extract shared `toArray()` utility (was duplicated in wsfe, wsfex, padron)
- Move QR URL to `QR_URL` constant
- Remove internal padron namespace exports from public API
- Add `getCondicionesIva()` and `clearAuthCache()` to docs
- Update CHANGELOG with missing version entries

## 1.2.1

- Fix `CondicionIva` enum: code 8=PROVEEDOR_EXTERIOR, 9=CLIENTE_EXTERIOR, 10=IVA_LIBERADO (Ley 19.640), 16=MONOTRIBUTO_INDEPENDIENTE_PROMOVIDO
- Add missing WSFEX fields: `Fecha_pago`, `CanMisMonExt`, `Opcionales`
- Add `getCondicionesIva()` method (`FEParamGetCondicionIvaReceptor`)
- Extract shared `toArray` utility, remove duplicated code
- Move QR URL to constants, clean up internal exports

## 1.2.0

- **CRITICAL**: Add `CondicionIVAReceptorId` field (mandatory since April 1, 2026)
  - New `CondicionIva` enum with all valid values
  - Auto-inferred as `CONSUMIDOR_FINAL` (5) when `docTipo=99`
- Add `CanMisMonExt` field for foreign currency operations (RG5616)
- Fix padron namespaces: `puc.sr` instead of `padron.sr.afip.gov.ar`
- Fix WSAA namespace: remove extra `/LoginCMSService` suffix
- Add `Imp_total` to WSFEX `facturarExpo()` calculation

## 1.1.5

- Add `author`, `sideEffects: false`, `publishConfig.access: public` to package.json
- Add CHANGELOG.md
- Set homepage to [arca-sdk.dev](https://arca-sdk.dev/)
- Add more npm keywords for discoverability
- Add `clean` script, fix `repository.url` format

## 1.1.4

- Fix: add `default` export for tsx/CJS bundler compatibility

## 1.1.3

- Add examples for export invoicing, CAEA, padron, and QR generation

## 1.1.2

- Fix: XML parser no longer converts CAE, dates, and CUITs to numbers
  - CAE with leading zeros (e.g., `04512345678901`) now preserved correctly
  - Dates (`CbteFch`, `CAEFchVto`) remain as strings
  - Added `Number()` guards on all numeric return paths

## 1.1.1

- Add `registrarFacturaCAEA()` simplified API for offline invoicing with CAEA
- Update README and llm.txt with CAEA, padron, and export docs

## 1.1.0

- Add `facturarExpo()` simplified API for export invoices (WSFEX)
- Add CAEA support: `solicitarCAEA`, `consultarCAEA`, `registrarCAEA`, `sinMovimientoCAEA`
- Add Padron support: `consultarCuit` (A13), `consultarCuitDetalle` (A5)
- New types: `FacturarExpoOpts`, `FacturaExpoResult`, `Contribuyente`, `CaeaSolicitarResult`

## 1.0.0

- Retry with exponential backoff on transient errors (default: 1 retry)
- Event system: `onEvent` callback + `.on()`/`.off()` for auth, requests, retries
- `Arca.generateQRUrl()` for official ARCA QR code URLs
- WSFEX support for export invoices (authorize, query, params)
- Refactor: `SoapOptions` object, `afipSoapCall` with namespace param

## 0.3.0

- Update to TypeScript 6.0, fast-xml-parser 5.5, node-forge 1.4, @types/node 25
- Rewrite examples to use simplified API
- Add `isolatedModules` to tsconfig
- Include `llm.txt` in npm package
- Extract `getParam<T>()` helper in WsfeClient, remove all `as any` casts

## 0.2.1

- Throw error when `LineItem` has both `iva` and `exento` set

## 0.2.0

- Add simplified API: `facturar()`, `notaCredito()`, `notaDebito()`
- Auto-calculate IVA, totals, and comprobante numbers from line items
- Auto-detect Factura C (monotributista) to skip IVA discrimination
- Add `Arca.calcularTotales()` static utility for previewing totals
- Add NC/ND type auto-inference from original comprobante type
- Add custom error classes: `ArcaAuthError`, `ArcaWSFEError`, `ArcaSoapError`
- Fix auth race condition with login deduplication
- Add 2-minute safety margin on token expiry
- Add HTTP timeout with AbortController (configurable, default 30s)
- Add `checkErrors` to `solicitarCAE`
- Add `getTiposConcepto`
- Fix `formatDate` to use Argentina timezone

## 0.1.0

- Initial release
- WSFEv1 support: facturas, notas de crédito/débito, recibos (A, B, C, E, M, FCE)
- WSAA authentication with certificate signing (PKCS#7/CMS)
- Token caching and auto-renewal
- All WSFEv1 parameter queries
