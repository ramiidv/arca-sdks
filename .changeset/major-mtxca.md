---
'@ramiidv/arca-mtxca': minor
---

**Cambios que rompen compatibilidad** (release de API uniforme entre los SDKs):

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
