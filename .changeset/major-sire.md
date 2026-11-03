---
'@ramiidv/arca-sire': minor
---

**Cambios que rompen compatibilidad** (release de API uniforme entre los SDKs):

- Requiere Node >= 22.12.
- Rechazos: `ArcaSireServiceError` extendía `ArcaServiceError` → ahora extiende `ArcaRechazoError` de `@ramiidv/arca-common` (que a su vez extiende `ArcaServiceError`), con `operacion` (`'emitir'` o `'anular'`) y `observaciones` (vacío). Conserva su `code` (`ARCA_SIRE_SERVICE_ERROR`), `faultCode` y `cause`; un `catch` de `ArcaRechazoError` cubre los rechazos de SIRE igual que los de los demás SDKs. Su constructor pasa de `(message, errors, { cause?, faultCode? })` a `(message, { operacion, errors?, observaciones? }, { cause?, faultCode? })`.
- Respuestas inválidas: `emitir`/`anular` sin `certificadoNro`/`codigoSeguridad` lanzaban `ArcaSoapError` con `uncertain` → ahora `ArcaResponseError` con `uncertain: true` (mensaje `SIRE <operación>: ...`). `status()` con una respuesta incompleta lanza `ArcaResponseError` (sin `uncertain`).
- `SireClient`: `new SireClient({ endpoint, timeout?, retries?, retryDelayMs?, onEvent?, fetch?, legacyTls?, transport? })` → `new SireClient({ endpoint, transport? })` (`SireClientConfig` es `ServiceClientConfig` de common): las opciones de transporte van dentro de `transport`.
- `ENDPOINTS`: `{ wsaa, sire }` → `{ sire }` (`satisfies Record<string, ServiceEndpoints>`). Las URLs de WSAA están en `WSAA_ENDPOINTS` de `@ramiidv/arca-common`; `endpoints.wsaa` de la config sigue igual.

Nuevo: se reexportan `ArcaRechazoError`, `ArcaResponseError` y los tipos `ServiceEndpoints` y `ServiceTransport` de `@ramiidv/arca-common`; se exporta el tipo `SireOperacion`.
