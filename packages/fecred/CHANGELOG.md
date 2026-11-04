# Changelog

## 0.8.2

### Patch Changes

- f1b23ca: Documentación: sin indicaciones sobre cómo manejar el repositorio (`.gitignore`) y con el comportamiento de ARCA descripto como tal, sin referencias a cómo se verificó. En sire, el criterio de los SOAP Faults se corrige: solo `XML invalido…` y `Request mal formado` se informan como rechazo; los faults de autenticación son `ArcaAuthError`.
- Updated dependencies [f1b23ca]
  - @ramiidv/arca-common@0.10.1

## 0.8.1

### Patch Changes

- e763bcb: Los source maps publicados incluyen el código fuente embebido (`inlineSources`), así que se pueden depurar sin `src/`. El build borra `dist/` antes de compilar, para que no se publiquen archivos de módulos eliminados.
- db3f62f: Un SOAP Fault se clasifica como `ArcaAuthError` solo si el código `wscommon_N` es el `faultcode` o aparece al inicio del `faultstring`. Antes bastaba con que se mencionara en cualquier parte del mensaje, y un Fault de negocio o de sistema que lo citara dejaba de ser incierto en las emisiones.
- Updated dependencies [e763bcb]
- Updated dependencies [8424364]
  - @ramiidv/arca-common@0.10.0

## 0.8.0

### Minor Changes

- 66f5dd9: **Cambios que rompen compatibilidad** (release de API uniforme entre los SDKs):
  
  - Requiere Node >= 22.12.
  - Rechazos: una emisión con `resultado = 'R'` (`aceptarFECred`, `rechazarFECred`, `informarCancelacionTotalFECred`, `rechazarNotaDC`, `modificarOpcionTransferencia`, `informarFacturaAgtDptoCltv`) se lanzaba como `ArcaServiceError` con los errores y las observaciones mezclados en `errors` → ahora se lanza como `ArcaRechazoError` (subclase de `ArcaServiceError`, `code` `ARCA_RECHAZO`), con `operacion` (el método de ARCA), `errors` (`arrayErrores`) y `observaciones` por separado; el mensaje es siempre `WSFECRED <operación>: operación rechazada (resultado R): ...`. Los errores sin `resultado = 'R'` (consultas, o emisiones que no llegaron a procesarse) siguen siendo `ArcaServiceError`.
  - Respuestas inválidas (falta un campo obligatorio, S/N inválido, emisión sin `resultado`, etc.): `ArcaSoapError` (`uncertain` en emisiones) → `ArcaResponseError` (`uncertain` en emisiones).
  - `FecredClient`: `new FecredClient({ endpoint, namespace, transport? })` → `new FecredClient({ endpoint, transport? })` (`FecredClientConfig` es `ServiceClientConfig` de common; el namespace lo fija el cliente).
  - `ENDPOINTS.wsfecred`: `{ testing, production, namespace, serviceId }` → `{ testing, production }` (`satisfies Record<string, ServiceEndpoints>`). El namespace pasa a `FECRED_NAMESPACE` y el id de WSAA a `FECRED_SERVICE_ID`.
  - Se quita `consultarObligadoRecepcion` (deprecada; el manual §2.4.13 la discontinuó) de `ArcaFecred` y de `FecredClient`, junto con el tipo `ObligadoRecepcionResult` → usar `consultarMontoObligadoRecepcion({ cuitConsultada, fechaEmision })`.
  
  Nuevo: se reexportan `ArcaRechazoError`, `ArcaResponseError` y los tipos `ServiceEndpoints` y `ServiceTransport` de `@ramiidv/arca-common`.

### Patch Changes

- Updated dependencies [2ce6ef5]
  - @ramiidv/arca-common@0.9.0

## 0.7.0

### Minor Changes

- e1240ad: Revisión contra el manual del desarrollador de WSFECRED v2.0.3 (el README ya no dice que no está publicado).
  
  - **Redondeo mitad al par** (Round Half Even, manual §3.3) en todos los importes, por el cambio de `dec()` en common.
  - Nuevas validaciones locales de `aceptarFECred`: `informaCBU` y `cbuComprador` van juntos (12013), sin CBU con cancelación total (12012) ni con saldo aceptado 0 (2016), retenciones con `importeTotalRetPesos` > 0 y viceversa (12007), cancelación completa (12008) y cotización 1 con PES (2007, 12000). El porcentaje de una retención es mayor a 0 y menor a 100 (`PorcentajeSimpleType`; antes se aceptaban 0 y 100).
  - Códigos repetidos en retenciones (2003), ajustes (2013), formas de cancelación (4002, también en `informarCancelacionTotalFECred`) y motivos de rechazo (3001, en `rechazarFECred` y `rechazarNotaDC`).
  - `consultarCtaCte`: `ctaCte` es opcional, como en el XSD; una respuesta sin cuenta corriente (con `evento` u observaciones) ya no se toma como inválida. En TypeScript hay que comprobar `ctaCte` antes de usarlo.
  - Las respuestas leen el array de observaciones con cualquiera de los dos nombres (`arrayObservaciones` / `arrayObservacion`), que el manual y el XSD tienen cruzados en algunas operaciones; si vienen los dos, se unen.
  - `consultarObligadoRecepcion` queda `@deprecated` (manual §2.4.13): usar `consultarMontoObligadoRecepcion`.
  - Nuevo `WSFECRED_ERRORES_REINTENTABLES` (1103, "reinténtelo más tarde").

### Patch Changes

- 1cccecc: README y llms.txt: glosario (FCE, cuenta corriente, aceptación, SCA/ADC), `clearAuthCache()` con su advertencia, `WsAuthSource` en el cliente de bajo nivel, redondeo de importes a 2 decimales, cotización tomada de `consultarCtaCte` en el inicio rápido y rutas del certificado unificadas con los ejemplos. El ejemplo de manejo de errores ya no borra el ticket ante un `ArcaAuthError`.
- Updated dependencies [1cccecc]
- Updated dependencies [bd57c86]
  - @ramiidv/arca-common@0.8.0

## 0.6.0

### Minor Changes

- d1a3604: Auditoría de WSFECRED contra el XSD del WSDL.
  
  **Cambios de comportamiento:**
  
  - Las enumeraciones de las respuestas (`estadoCtaCte.estado`, `estado.estado`, `opcionTransferencia`, `tipoAcep`, `tipoCodAuto`) ya no lanzan `ArcaSoapError` ante un valor desconocido: se devuelven tal cual, para que un estado nuevo de ARCA (como pasó con `InformadaAgDpto`) no rompa las consultas. Sus tipos pasan a `ValorAbierto<T>` (los valores conocidos o cualquier `string`): un `switch` exhaustivo sobre ellos necesita un caso `default`. Los requests siguen aceptando solo los valores del XSD.
  - Una respuesta inválida de una **consulta** (falta un campo obligatorio, S/N inválido, etc.) ya no es `uncertain`: solo lo es en las emisiones.
  - Un SOAP Fault `wscommon_*` (token, sign o CUIT representada rechazados) se lanza como `ArcaAuthError` (con el `ArcaSoapError` original en `cause`), también en las emisiones: la operación no se procesó. Antes era un `ArcaSoapError` (`uncertain` en las emisiones).
  - `obligado` de `consultarMontoObligadoRecepcion` y `consultarObligadoRecepcion` es opcional (`minOccurs="0"` en el XSD): una respuesta solo con `arrayObservacion` ya no lanza y devuelve `obligado: undefined`.
  - El mensaje de `ArcaServiceError` incluye la operación (`WSFECRED aceptarFECred: ...`), y ante `arrayErrores` las observaciones de la respuesta se agregan al final de `errors` (antes solo con `resultado = 'R'` sin errores).
  
  Otros cambios:
  
  - `MontoObligadoRecepcionResult`, `ObligadoRecepcionResult` y `ConsultarCuentasEnAgtDptoCltvResult` ya no declaran `evento` (el XSD no lo tiene; nunca venía). Nuevo tipo `ObservacionesRespuesta`.
  - Se usan `importe()` y `porcentaje()` de `@ramiidv/arca-common/schema`; la CUIT del config la valida `ArcaSdkBase` (sin validación duplicada).
  - README y llms.txt: requisitos (Node >= 20.19, solo ESM, `require(esm)` desde CommonJS), `ArcaSdkConfig` con `signal` y `wsaa`, comportamiento de `resultado` `R`, `ENDPOINTS` y `FecredClient`, sección de ejemplos; se quitó el aviso de la 0.3.0. Ejemplo de JSDoc con una CUIT válida.

### Patch Changes

- 1db70be: Descripción y keywords del paquete en npm corregidas (tildes).
- Updated dependencies [b152f08]
  - @ramiidv/arca-common@0.7.0

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
