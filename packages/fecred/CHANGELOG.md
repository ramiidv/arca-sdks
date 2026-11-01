# Changelog

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
