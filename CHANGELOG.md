# Changelog

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
