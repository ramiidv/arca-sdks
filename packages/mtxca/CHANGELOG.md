# Changelog

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
