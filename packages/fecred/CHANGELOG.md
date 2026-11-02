# Changelog

## 0.5.0

### Minor Changes

- d535462: Cambio incompatible: se quita lo deprecado.
  
  - `ArcaFecred.fecred` → `client`.
  - `FecredClientConfig.soapOptions` y `onEvent` → `transport` (`transport.onEvent`).

### Patch Changes

- 87f58c1: Usa el `choice()` de `@ramiidv/arca-common/schema` en lugar de uno propio. El error de `idCtaCte` sin una opción (o con las dos) ahora dice "debe tener exactamente uno de codCtaCte, idFactura".
- Updated dependencies [87f58c1]
  - @ramiidv/arca-common@0.6.0

## 0.4.0

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

Revisión completa contra el WSDL de FECredService. La 0.2.0 no podía operar contra ARCA.

### Breaking
- Requiere `@ramiidv/arca-common` `^0.4.0`. `ArcaFecredConfig` extiende `ArcaBaseConfig` (`cuit: number | string`).
- `consultarMontoObligadoRecepcion({ cuitConsultada, fechaEmision })`: ahora recibe un objeto (el XSD exige `fechaEmision`).
- `consultarCtasCtes` y `consultarComprobantes` reciben `{ rol, cuitContraparte?, fecha?: { tipo, desde, hasta }, ... }` (antes `fechaDesde`/`fechaHasta`/`cuitEmisor`/`cuitReceptor`, que no existen en el XSD) y devuelven `{ ctasCtes | comprobantes, nroPagina?, hayMas?, evento?, observaciones }` en lugar de un array.
- `aceptarFECred(params)`, `rechazarFECred(params)`: reciben `idCtaCte` (`{ codCtaCte }` o `{ idFactura }`) y los campos obligatorios del XSD (`saldoAceptado`, `codMoneda`, `cotizacionMonedaUlt`; `motivos[]` con `codMotivo`, `descMotivo`, `justificacion`). Devuelven `{ resultado, idCtaCte, evento?, observaciones }`.
- `informarFacturaAceptadaCancelada` se reemplaza por `informarCancelacionTotalFECred({ idCtaCte, formasCancelacion, importeCancelacion })` (la operación anterior no existe).
- `consultarTiposMotivoRechazo` → `consultarTiposMotivosRechazo`. Los `consultarTipos*` devuelven `{ codigo, descripcion }[]`; `consultarTiposRetenciones` devuelve `{ codigoJurisdiccion, descripcionJurisdiccion, porcentajeRetencion }[]`.
- Tipos de respuesta según el XSD (`InfoCtaCte`, `Comprobante`, `CuentaCorriente`, ...). `codCtaCte`, CUITs y `codAutorizacion` son `string`. Se eliminan `raw`, `CtaCte`, `ComprobanteFecred`, `RetencionFecred`, `*Item`, `WsFecredError`.
- `EstadoCtaCte` con los valores reales (`Modificable`, `Aceptada`, `Rechazada`, `CanceladaTotal`, `InformadaAgDpto`); `RolCtaCte`/`EstadoCtaCte` pasan a ser objetos `as const` + tipo literal.
- Se eliminan los enums inventados `MotivoRechazo`, `FormaCancelacion`, `TipoAjusteOperacion` y `TipoRetencion`: los códigos se obtienen con `consultarTipos*()`.
- `ENDPOINTS` ya no incluye `wsaa` (usar `WSAA_ENDPOINTS` de common) y `ENDPOINTS.wsfecred.namespace` es `http://ar.gob.afip.wsfecred/FECredService/`.
- `FecredClient`: recibe `{ token, sign, cuitRepresentada }` (o una función que lo devuelve), valida los parámetros y devuelve respuestas tipadas en lugar de `Record<string, unknown>`.
- `WsAuth` es `{ token, sign, cuitRepresentada }`.
- `clearAuthCache()` devuelve `Promise<void>`.
- Se eliminan `validateCuit` (usar el de common), `validateCodCtaCte`, `validateConsultaCtasCtes` y los re-exports de utilidades de common (`ensureArray`, `parseXml`, `buildXml`, `checkServiceErrors`, `SoapCallOptions`, `WsaaClientConfig`).

### Features
- Nuevas operaciones del WSDL: `consultarObligadoRecepcion`, `consultarCtaCte`, `consultarHistorialEstadosComprobante`, `consultarHistorialEstadosCtaCte`, `obtenerRemitos`, `rechazarNotaDC`, `modificarOpcionTransferencia`, `informarFacturaAgtDptoCltv`, `consultarCuentasEnAgtDptoCltv` y `consultarFacturasAgtDptoCltv`.
- `aceptarFECred` soporta todos los opcionales del XSD (notas DC, formas de cancelación, retenciones, ajustes, tipo de cancelación, importes, CBU).
- Todos los métodos aceptan `opts?: CallOptions` (`signal`).
- Config: `ticketStorage`, `clockOffsetMs`, `autoClockSkew`, `loginErrorCooldownMs`, `tokenTTLMinutes`, `fetch`, `legacyTls`, `wsaa` (cliente propio) y `endpoints` (override).
- Enums del XSD: `EstadoComprobante`, `TipoFechaFiltro`, `OpcionTransferencia`, `TipoCancelacion`, `TipoAceptacion`, `Resultado`.
- Validación local según el XSD (CUIT con dígito verificador, fechas, importes con 2 decimales, rangos de punto de venta/número, textos 3..250, CBU) antes de pedir el ticket.
- Se exportan `ArcaValidationError`, `ArcaTicketVigenteError`, `FileTicketStorage` y `MemoryTicketStorage`.

### Fixes
- Namespace correcto y `SOAPAction` en todas las operaciones (sin él ARCA responde `NullPointerException`); `dummy` con Body vacío.
- `authRequest` con `token`/`sign`/`cuitRepresentada` (ARCA respondía `wscommon_005`). La CUIT se envía como 11 dígitos.
- Wrapper `<operacionRequest>` según los elementos del XSD y campos en el orden del XSD (`idCtaCte` anidado, `fecha{tipo,desde,hasta}`, `rolCUITRepresentada`).
- `obligado` (`S`/`N`) se convertía a boolean con un cast: `'N'` era `true`.
- Los parsers leían contenedores inexistentes (`arrayCtasCtes`, `tipoComprobante`, ...) y devolvían listas vacías; ahora leen `arrayInfosCtaCte/infoCtaCte`, `arrayComprobantes/comprobante`, `codigoDescripcionReturn/arrayCodigoDescripcion/codigoDescripcion`, etc.
- Un campo obligatorio ausente en la respuesta lanza error en lugar de devolver `0`/`''`.
- `arrayErrores` y `arrayErroresFormato` (`codigoDescripcionString`) se lanzan como `ArcaServiceError`; `resultado = 'R'` también.
- Las operaciones se envían con `kind: 'emision'`: no se reintentan y un error de transporte queda `uncertain`.

## 0.2.0 (2026-06-03)

- CI con GitHub Actions (Node 18/20/22) y workflow de release por tag.
- `homepage` apunta a arca-sdk.dev.
- Lockfile regenerado para resolver `@ramiidv/arca-common` desde npm (el build fallaba en CI).

## 0.1.0 (2026-03-31)

### Features
- Initial release
- Orchestrator class `ArcaFecred` with automatic WSAA authentication
- Check FCE obligation status (`consultarMontoObligadoRecepcion`)
- Query current accounts (`consultarCtasCtes`) and invoices (`consultarComprobantes`)
- Accept (`aceptarFECred`) and reject (`rechazarFECred`) electronic credit invoices
- Inform accepted FCE cancellation (`informarFacturaAceptadaCancelada`)
- Parameter queries: retention types, cancellation methods, adjustment types, rejection reasons
- Input validation with `ArcaValidationError` from `@ramiidv/arca-common`
- Low-level `FecredClient` for direct SOAP access
- Enums: `RolCtaCte`, `EstadoCtaCte`, `MotivoRechazo`, `FormaCancelacion`, `TipoAjusteOperacion`, `TipoRetencion`
- Health check via `status()` / `dummy()`
