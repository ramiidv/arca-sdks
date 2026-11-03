---
'@ramiidv/arca-fecred': minor
---

**Cambios que rompen compatibilidad** (release de API uniforme entre los SDKs):

- Requiere Node >= 22.12.
- Rechazos: una emisión con `resultado = 'R'` (`aceptarFECred`, `rechazarFECred`, `informarCancelacionTotalFECred`, `rechazarNotaDC`, `modificarOpcionTransferencia`, `informarFacturaAgtDptoCltv`) se lanzaba como `ArcaServiceError` con los errores y las observaciones mezclados en `errors` → ahora se lanza como `ArcaRechazoError` (subclase de `ArcaServiceError`, `code` `ARCA_RECHAZO`), con `operacion` (el método de ARCA), `errors` (`arrayErrores`) y `observaciones` por separado; el mensaje es siempre `WSFECRED <operación>: operación rechazada (resultado R): ...`. Los errores sin `resultado = 'R'` (consultas, o emisiones que no llegaron a procesarse) siguen siendo `ArcaServiceError`.
- Respuestas inválidas (falta un campo obligatorio, S/N inválido, emisión sin `resultado`, etc.): `ArcaSoapError` (`uncertain` en emisiones) → `ArcaResponseError` (`uncertain` en emisiones).
- `FecredClient`: `new FecredClient({ endpoint, namespace, transport? })` → `new FecredClient({ endpoint, transport? })` (`FecredClientConfig` es `ServiceClientConfig` de common; el namespace lo fija el cliente).
- `ENDPOINTS.wsfecred`: `{ testing, production, namespace, serviceId }` → `{ testing, production }` (`satisfies Record<string, ServiceEndpoints>`). El namespace pasa a `FECRED_NAMESPACE` y el id de WSAA a `FECRED_SERVICE_ID`.
- Se quita `consultarObligadoRecepcion` (deprecada; el manual §2.4.13 la discontinuó) de `ArcaFecred` y de `FecredClient`, junto con el tipo `ObligadoRecepcionResult` → usar `consultarMontoObligadoRecepcion({ cuitConsultada, fechaEmision })`.

Nuevo: se reexportan `ArcaRechazoError`, `ArcaResponseError` y los tipos `ServiceEndpoints` y `ServiceTransport` de `@ramiidv/arca-common`.
