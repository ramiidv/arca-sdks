---
'@ramiidv/arca-fecred': minor
---

Auditoría de WSFECRED contra el XSD del WSDL.

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
