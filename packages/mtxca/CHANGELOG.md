# Changelog

## 0.8.1

### Patch Changes

- ecb29c6: - **Condiciones de IVA 8 (5%) y 9 (2,5%)**: `consultarCondicionesIVA` las devuelve y ARCA autoriza comprobantes con ítems y subtotales de IVA en esas condiciones, pero la validación local los rechazaba ("condición de IVA 8 desconocida", 400, 110). Se agregan `CodigoCondicionIVA.IVA_5` (8) y `CodigoCondicionIVA.IVA_2_5` (9), sus alícuotas en `ALICUOTAS_IVA` (0,05 y 0,025), y cuentan como gravadas (110) y con subtotal de IVA (127, 400, 403, 715).
  - **Sujeto No Categorizado (145)**: ARCA rechaza con 145 solo cuando el comprobante no trae ningún tributo; con otro tributo y sin el 13 lo autoriza con la observación 150. La validación local ahora exige solo algún tributo con importe > 0, así que ya no rechaza ese segundo caso.
  - **Período de comprobantes asociados (162 / 780)**: ARCA rechaza el período también en la Factura B (6), aunque el manual no la nombre. La validación local ahora lo rechaza en todas las facturas (1, 6, 51, 201 y 206); las notas de débito y crédito lo siguen admitiendo.
- Updated dependencies [e1c8de0]
  - @ramiidv/arca-common@0.9.1

## 0.8.0

### Minor Changes

- 714ea8c: **Cambios que rompen compatibilidad** (release de API uniforme entre los SDKs):
  
  - Requiere Node >= 22.12.
  - **Los rechazos lanzan.** Antes, `autorizar`, `autorizarAjusteIVA`, `informarComprobanteCAEA`, `informarAjusteIVACAEA`, `informarCAEANoUtilizado` e `informarCAEANoUtilizadoPtoVta` devolvían `{ resultado: 'R', errores }` → ahora lanzan `ArcaRechazoError` (de `@ramiidv/arca-common`, subclase de `ArcaServiceError`) con `operacion` (método de ARCA, ej. `autorizarComprobante`), `errors` y `observaciones` (`{ code, msg }`). Lo mismo en `MtxcaClient`.
  - Sin cambios: los errores de ARCA sin `resultado: 'R'` (`arrayErrores` de `solicitarCAEA`, o una emisión respondida con `arrayErrores` sin `resultado`) siguen lanzando `ArcaServiceError`.
  - Tipos de resultado sin la rama `R`: `MtxcaResultado` era `'A' | 'O' | 'R'` → ahora `'A' | 'O'`; `MtxcaAutorizarResult` y `MtxcaInformarCAEAResult` eran uniones con `comprobante?` → ahora interfaces con `comprobante` (y `fechaProceso`) siempre presentes; se quita `errores` de los resultados (los motivos están en `ArcaRechazoError.errors`). `MtxcaCAEANoUtilizadoResult`: `fechaProceso?`, `caea?`, `errores` → `fechaProceso` y `caea` obligatorios, sin `errores`.
  - `urlQR(..., resultado)` ya no contempla un resultado rechazado (un rechazo nunca llega como resultado).
  - Respuesta inválida (falta un campo obligatorio, valor inesperado): antes `ArcaSoapError` → ahora `ArcaResponseError` (con `uncertain: true` en emisiones). `ArcaSoapError` queda para Fault SOAP, HTTP, red y timeout.
  - `MTXCA_ENDPOINTS` → `ENDPOINTS.wsmtxca` (`ENDPOINTS` tiene la forma `{ wsmtxca: { testing, production } }`, igual en todos los SDKs). `MTXCA_NAMESPACE` y `MTXCA_SERVICE_ID` no cambian.
  - `config.endpoints.mtxca` → `config.endpoints.wsmtxca` (las claves coinciden con las de `ENDPOINTS`).
  - `new MtxcaClient({ endpoint, timeout, retries, retryDelayMs, onEvent, fetch, legacyTls, onEvento })` → `new MtxcaClient({ endpoint, transport: { timeout, retries, retryDelayMs, onEvent, fetch, legacyTls }, onEvento })`. `MtxcaClientConfig` extiende `ServiceClientConfig` de `@ramiidv/arca-common`.
  
  Nuevo: se reexportan `ArcaRechazoError` y `ArcaResponseError`, y los tipos `ServiceClientConfig`, `ServiceEndpoints` y `ServiceTransport`.

### Patch Changes

- Updated dependencies [2ce6ef5]
  - @ramiidv/arca-common@0.9.0

## 0.7.0

### Minor Changes

- e5a6a0c: Revisión contra el manual de WSMTXCA v0.25.8.
  
  **Corrección:** `informarComprobanteCAEA` ya no rechaza localmente un ítem con condición de IVA 1, 2 o 3 e `importeIVA` distinto de 0: en CAEA esa regla solo observa (1122). Los mensajes de las validaciones de ítems en CAEA citan su numeración (1100-1121) en lugar de la de CAE.
  
  Nuevas validaciones locales (CAE / CAEA):
  
  - Datos adicionales de FCE: 21 (CBU) y 27 (`ADC`/`SCA`) obligatorios en 201 y 206, 22 (`S`/`N`) obligatorio en las notas, 21-23 solo en FCE y con `c1` (326-336 / 925-934); dato adicional 5 (337-340 / 935-938).
  - Comprobantes asociados de FCE: la factura asocia 88, 91, 990 o 995; la nota lleva un solo asociado FCE, con `cuit` y que sea el del emisor; en una anulación, qué tipo revierte cada nota (208, 209, 210, 212, 214 / 808, 809, 810, 812, 814). Período de asociados: no en notas FCE ni en las facturas 1, 51, 201 y 206 (159, 162 / 777, 780).
  - Compradores (CAE): más de uno, con el receptor informado, CUIT/CUIL/CDI, sin repetir, porcentaje mayor a 0 y menor a 100, distintos del emisor, suman 100, con el receptor como uno de los de mayor porcentaje (420-429). En FCE no se admiten (433). Los documentos se comparan como se envían (number o string, con o sin guiones).
  - Sujeto No Categorizado (23000000000): solo en 6, 7 u 8 con `condicionIVAReceptor` 7 (342 / 889) y, en CAE, con el tributo 13 si hay importe gravado (145).
  - CAEA: concepto (713), receptor de clase A y FCE con CUIT (718, 733) y subtotales de IVA (715).
  - `informarAjusteIVACAEA` exige `fechaHoraGen` (754).
  - Largos del manual: `codigoMtx` 13, `otrosTributos[].descripcion` 25, `c1`-`c6` 50, `actividades` de hasta 6 dígitos.
  - `validateComprobanteCAE(c, { cuitEmisor })` y `validateComprobanteCAEA(c, { cuitEmisor })` aceptan el CUIT del emisor (nuevo tipo `ContextoReglas`), que habilita las reglas 426 y 210 / 810; `autorizar` e `informarComprobanteCAEA` lo pasan solos.
  
  `validarImportes: false` sigue desactivando todas las reglas de negocio locales (no solo las de importes); ahora lo dicen el JSDoc y el README.
  
  El pre-redondeo propio de los decimales se reemplazó por el de `dec()` de common, que ahora redondea mitad al par.

### Patch Changes

- 1cccecc: Documentación: glosario y pasos previos (certificado, relación con `wsmtxca`, punto de venta "Codificación de Productos - Web Services"), `keyPassphrase`, `permanentErrorCooldownMs` y las opciones que se ignoran con `wsaa` compartido, `fechaHoraGen` obligatoria en `informarComprobanteCAEA` (754) en `llms.txt` y descripción de la unidad 95 (anulación/devolución). Ejemplos con `ticketStorage`; el de consultas usa `consultarCAEAEntreFechas` en lugar de `solicitarCAEA`.
- Updated dependencies [1cccecc]
- Updated dependencies [bd57c86]
  - @ramiidv/arca-common@0.8.0

## 0.6.0

### Minor Changes

- 739b0d8: Auditoría contra el Manual del desarrollador WSMTXCA v0.25.8.
  
  **Cambios de comportamiento:**
  
  - **FCE MiPyME:** `fechaVencimientoPago` ahora es obligatoria en 201 y 206 y no corresponde en 202, 203, 207 y 208, cualquiera sea el concepto (148/149 en `autorizar`, 764/765 en `informarComprobanteCAEA`). Antes se exigía solo con concepto 2 o 3 y se rechazaba con concepto 1, lo que impedía emitir una FCE de productos.
  - **`condicionIVAReceptor` (RG 5616) obligatoria localmente:** `autorizar()` e `informarComprobanteCAEA()` lanzan `ArcaValidationError` si falta (ARCA hoy la observa con 190/390 y pasará a rechazar). En `autorizar()` se puede omitir la validación local con `{ validarImportes: false }`.
  - **Redondeo Round Half Even:** los importes, cantidades, precios, bonificaciones y cotizaciones se redondean mitad al par, como indica el manual (`8.565` → `8.56`, `1.005` → `1.00`; antes, mitad hacia afuera: `8.57`, `1.01`). Aplica a lo que se envía, a la validación de importes y a `roundImporte()` / `roundDecimal()`.
  
  Nuevas validaciones locales (citan el código de ARCA): `cancelaEnMismaMonedaExtranjera: 'S'` solo en 1, 6, 51, 201 y 206 (118); descripción de cada tributo en FCE (302); compradores solo con concepto 1 (432) y uno solo en FCE (433); en CAEA no se admiten compradores (753); el IVA de las bonificaciones no puede superar el de su alícuota (516); notas de débito/crédito 2, 3, 7, 8, 52 y 53 con comprobantes asociados o período, no ambos (160/161 en CAE, 778/779 en CAEA).
  
  Nuevo:
  
  - `urlQR()` (método de `ArcaMtxca` y función exportada): URL del código QR (RG 4892) desde el request y el resultado de `autorizar` / `informarComprobanteCAEA`, o desde el comprobante de `consultarComprobante`. Se exportan también `QR_URL` y el tipo `QROptions`.
  - `evento` de ARCA: `onEvento(evento, method)` en la configuración (`ArcaMtxcaConfig` y `MtxcaClientConfig`) lo recibe de cualquier respuesta, incluidas las que devuelven un número o una lista; `solicitarCAEA`, `consultarCAEA` y `getCotizacionMoneda` lo incluyen como `evento?` en el resultado.
  
  Documentación: Node >= 20.19 (solo ESM; desde CommonJS con `require()`), reglas de FCE y tabla de reglas validadas, redondeo, SOAP Fault `Client` (no incierto) vs `Server` (incierto) en emisiones, QR y eventos.
  - `informarComprobanteCAEA` exige `fechaHoraGen` (regla 754: obligatoria para todo comprobante CAEA desde el 01/08/2026).

### Patch Changes

- 1db70be: Descripción y keywords del paquete en npm corregidas (tildes).
- Updated dependencies [b152f08]
  - @ramiidv/arca-common@0.7.0

## 0.5.0

### Minor Changes

- d535462: Cambio incompatible: se quitan `endpoint` y `wsaaEndpoint` (deprecados). Usar `endpoints: { mtxca, wsaa }`.

### Patch Changes

- 87f58c1: Un texto obligatorio vacío (o solo con espacios) da el error "no puede estar vacío" en lugar de `formato inválido (\S)`.
- Updated dependencies [87f58c1]
  - @ramiidv/arca-common@0.6.0

## 0.4.0

### Minor Changes

- bed68e8: Paquetes solo ESM y Node >= 20.19. `arca-common`, `arca-facturacion` y
  `arca-padron` dejan de publicar un build CommonJS: desde CommonJS se cargan con
  `require()` (require(esm), Node >= 20.19 / 22.12). Todos los paquetes pasan a
  requerir Node >= 20.19.0 (Node 18 y 20 sin soporte). El código vive ahora en el
  monorepo `arca-sdks`.
- f8bd053: Las clases principales extienden `ArcaSdkBase` de arca-common, así que todos
  los SDKs tienen la misma base: `wsaa`, `cuit`, `production`, `on()`/`off()`,
  `clearAuthCache()`, `config.wsaa` (WsaaClient compartido) y `config.signal`
  (signal global). arca-mtxca acepta `endpoints: { mtxca, wsaa }` (`endpoint` y
  `wsaaEndpoint` quedan deprecados). Los `dummy`/`status` validan la respuesta con
  `parseServerStatus`: si falta un campo lanzan `ArcaSoapError`.
- c9f1444: Requests y respuestas se validan, serializan y decodifican con el DSL de
  `@ramiidv/arca-common/schema`, transcripto del XSD oficial de cada servicio.
  
  - Corrección: las respuestas se parsean sin conversión numérica, así que los
    `xs:string` con contenido numérico ya no pierden ceros a la izquierda ni
    decimales (ej: `"0012"`, `"1.50"`, `DocNro`, `codigoSeguridad`).
  - Los campos desconocidos en el input se rechazan con `ArcaValidationError`
    (antes se ignoraban).
  - Todos los errores de validación se informan juntos (`details`), con mensajes
    del tipo `campo: motivo`. Cambió el texto de los mensajes.
  - arca-fecred deja de recortar espacios de los textos y envía `codCtaCte` tal
    cual; porcentaje y cotización se envían con decimales fijos.

### Patch Changes

- fd438bc: `@ramiidv/arca-common/testing` exporta `loadXsdTypes` y `checkSchemaAgainstXsd`
  para comparar los schemas del DSL con el XSD de un WSDL oficial. Todos los
  schemas de agro, cdc, fecred, mtxca, padron y sire se verifican contra los WSDL
  de producción. arca-mtxca: los renombres API ↔ XML usan `xml()` del DSL y un
  error en `actividades` se reporta en `actividades[i].codigo`.
- 20ecf7d: DSL de schemas, segunda versión:
  
  - Corrección: `dec()` redondea sobre el valor decimal escrito (`8.575` →
    `8.58`; antes daba `8.57` por la representación binaria). Afecta los importes
    que los SDKs envían redondeados.
  - `must()` rechaza también el valor vacío; los elementos `xsi:nil` cuentan
    como ausentes (en una lista, como lista vacía); `must()` en listas exige el
    elemento; un objeto opcional vacío se omite y uno obligatorio valida sus hijos.
  - Al decodificar se validan enteros (`int()`) y valores permitidos
    (`str({ values })`).
  - Nuevos: `siNo()` (S/N ↔ boolean), `double()`, `xml(nombre, campo)` (nombre
    distinto en el XML), `custom(encode, decode)`, `roundHalfUp()` y
    `decodeResponse(..., { emptyLists: 'omit' })`.
- Updated dependencies [8c02c30]
- Updated dependencies [f8bd053]
- Updated dependencies [242fb5f]
- Updated dependencies [fd438bc]
- Updated dependencies [bed68e8]
- Updated dependencies [20ecf7d]
- Updated dependencies [b86db00]
  - @ramiidv/arca-common@0.5.0

## 0.3.0 (2026-11-01)

Revisión completa contra el WSDL de WSMTXCA y el manual del desarrollador (v0.25.8). Las versiones anteriores no podían autorizar comprobantes: el request no cumplía el XSD.

### Breaking

- Requiere `@ramiidv/arca-common` ^0.4.0.
- `autorizar()` recibe el `ComprobanteType` con los nombres del XSD (`codigoTipoComprobante`, `numeroPuntoVenta`, `codigoConcepto`, `codigoTipoDocumento`, `numeroDocumento`, `fechaEmision`, `importeSubtotal`, `codigoMoneda`, `fechaServicioDesde/Hasta`, `fechaVencimientoPago`, `comprobantesAsociados`, ...) en lugar de `{ ptoVta, cbteTipo, invoice }`. `importeSubtotal` y `codigoMoneda` son obligatorios.
- Ítems: `unidadMedida` → `codigoUnidadMedida`; `cantidad`, `precioUnitario` e `importeIVA` pasan a ser opcionales según las reglas del manual; se agregan `unidadesMtx` y `codigoMtx`.
- `SubtotalIVA` ya no tiene `baseImponible`; `MtxcaTributo` → `MtxcaOtroTributo` (`codigo`, sin `alicuota`).
- `autorizar()` devuelve `MtxcaAutorizarResult`: `resultado` `'A' | 'O' | 'R'` y, si no es `R`, `comprobante` con `cae` y `fechaVencimientoCAE`.
- `consultarComprobante()` devuelve `{ comprobante, observaciones, evento }` con el `ComprobanteType` completo, y lanza `ArcaServiceError` si el comprobante no existe.
- Las consultas lanzan `ArcaServiceError` ante `arrayErrores` (antes devolvían 0, objetos de ceros o listas vacías).
- Parámetros: devuelven `{ codigo, descripcion }` (antes `{ Id, Desc, FchDesde, FchHasta }`, campos que no existen en WSMTXCA). Puntos de venta: `{ numeroPuntoVenta, bloqueado, fechaBaja? }`.
- `getCotizacionMoneda(codigo, fecha?)` devuelve `{ codigoMoneda, fechaCotizacion, cotizacion: number | null }`.
- `MtxcaClient` recibe `endpoint` (en lugar de `production`) y `MtxcaAuth` es `{ token, sign, cuitRepresentada }`.
- `ArcaMtxcaConfig` extiende `ArcaBaseConfig`; `cuit` acepta string y se valida el dígito verificador.
- `clearAuthCache()` es async.
- `CbteTipo`: 51–53 se renombran a `*_A_SUJETA_RETENCION` (no son clase M). `CodigoCondicionIVA`: se quitan 7, 8 y 9 (no figuran en el manual de WSMTXCA). `Moneda`: solo `PES`, `DOL` y `060`; el resto, con `getMonedas()`.
- `validateAutorizarRequest`/`validateMtxcaItem` → `validateComprobanteCAE`/`validateComprobanteCAEA`.

### Features

- Numeración automática real en `autorizar()` (último autorizado + 1; el error 1502 "sin comprobantes" cuenta como 0) y número explícito opcional.
- `condicionIVAReceptor` (RG 5616) y `getCondicionesIVAReceptor()`.
- CAEA: `solicitarCAEA`, `consultarCAEA`, `consultarCAEAEntreFechas`, `informarComprobanteCAEA`, `informarAjusteIVACAEA`, `informarCAEANoUtilizado`, `informarCAEANoUtilizadoPtoVta`, `consultarPtosVtaCAEANoInformados`.
- `autorizarAjusteIVA`, `getTiposTributo`, `getTiposDatosAdicionales`, `getActividadesVigentes`.
- Campos del XSD que faltaban: `cancelaEnMismaMonedaExtranjera`, `periodoComprobantesAsociados`, `datosAdicionales`, `compradores`, `actividades`.
- Validación local de las reglas excluyentes del manual (presencia por unidad de medida 97/99, fórmulas de ítem, subtotales de IVA por alícuota, gravado/no gravado/exento/subtotal/total con el margen de error del manual), desactivable con `{ validarImportes: false }`.
- Redondeo según el XSD (2 decimales en importes, 6 en cantidad/precio/bonificación/cotización); `roundImporte` y `roundDecimal` exportados.
- Opciones de `ArcaBaseConfig`: `ticketStorage`, `clockOffsetMs`, `autoClockSkew`, `loginErrorCooldownMs`, `fetch`, `legacyTls`, `tokenTTLMinutes`; overrides `endpoint` y `wsaaEndpoint`.
- Todos los métodos aceptan `opts?: CallOptions` (`signal`).
- Se exportan `ArcaValidationError`, `ArcaTicketVigenteError`, `MemoryTicketStorage` y `FileTicketStorage`.

### Fixes

- Namespace `http://impl.service.wsmtxca.afip.gov.ar/service/`, SOAPAction del WSDL y elementos `{operacion}Request` / `{operacion}Response` (verificado con `dummy` en homologación).
- `ComprobanteType` con los elementos en el orden de la secuencia del XSD y `numeroComprobante` incluido.
- Las emisiones (`autorizar*`, `informar*`, `solicitarCAEA`) usan `kind: 'emision'`: no se reintentan y los errores con resultado desconocido tienen `uncertain: true`.
- `consultarCotizacionMoneda` envía `fechaCotizacion` (obligatorio) y lee solo `cotizacionMoneda`.
- Puntos de venta: se elimina `EmisionTipo` (no existe en la respuesta).
- Ítems de bonificación/seña (unidad 99/97) se envían sin cantidad ni precio.
- La validación ya no traga errores que no son de validación.

## 0.2.0 (2026-06-03)

### Fixes

- Build standalone en CI: el lockfile resolvía `@ramiidv/arca-common` como ruta local; se regeneró para resolverlo desde npm.

### Chore

- Workflow de release (publicación por tag) y workflow de CI para Node 18/20/22.
- Homepage: <https://arca-sdk.dev/mtxca>.

## 0.1.0 (2026-03-31)

### Features

- Initial release
- Authorize invoices with item-level detail (barcodes, quantities, unit prices) via `autorizar()`
- Query last authorized comprobante number via `ultimoComprobante()`
- Compute next comprobante number via `siguienteComprobante()`
- Retrieve previously authorized comprobantes via `consultarComprobante()`
- Query parameter tables: tipos comprobante, tipos documento, alicuotas IVA, condiciones IVA, monedas, unidades de medida, puntos de venta, cotizacion de monedas
- Input validation for `autorizar()` request and item-level fields
- Enum helpers for CbteTipo, Concepto, CodigoCondicionIVA, and Moneda
- Service health check via `status()`
- Automatic WSAA authentication with ticket caching
- Full TypeScript support with strict types
