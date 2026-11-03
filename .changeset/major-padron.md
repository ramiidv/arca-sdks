---
'@ramiidv/arca-padron': minor
---

**Cambios que rompen compatibilidad** (release de API uniforme entre los SDKs):

- Requiere Node >= 22.12 (Node 20 llegó a fin de vida el 30/04/2026).
- Clientes de bajo nivel (`PadronA5Client`, `PadronA4Client`, `PadronA10Client`, `PadronA13Client`, `PadronA100Client`): antes `new PadronA4Client({ endpoint, namespace, soapOptions?, onEvent? })` → ahora `new PadronA4Client({ endpoint, transport? })` (`ServiceClientConfig` de `@ramiidv/arca-common`; `transport` incluye `onEvent`). El namespace lo fija cada cliente. `PadronClientConfig` es ahora `ServiceClientConfig`; se quitan el tipo `PadronSoapOptions` y las propiedades protegidas `BasePadronClient.soapOptions` y `.onEvent`. El constructor de `BasePadronClient` pasa a ser `protected constructor(config, namespace)`.
- `ENDPOINTS`: antes `{ wsaa, a5: { testing, production, namespace, serviceId }, ... }` → ahora solo URLs, `{ a5: { testing, production }, a4, a10, a13, a100 }` (`satisfies Record<string, ServiceEndpoints>`). Se quita `ENDPOINTS.wsaa` (usar `WSAA_ENDPOINTS` de `@ramiidv/arca-common`); `ENDPOINTS.<svc>.namespace` → `NAMESPACES.<svc>` y `ENDPOINTS.<svc>.serviceId` → `SERVICE_IDS.<svc>` (constantes nuevas, con las mismas claves).
- Se quitan los re-exports deprecados `ensureArray`, `parseXml` y `buildXml`: importarlos de `@ramiidv/arca-common`.
- Se quita el re-export del tipo `SoapCallOptions` (solo lo usaba `PadronSoapOptions`); las opciones de transporte de los clientes son `ServiceTransport`.
- `TipoDomicilio.LEGAL` y `TipoDomicilio.REAL` → `TipoDomicilio.LEGAL_REAL` (`'LEGAL/REAL'`, el valor de los manuales).
- Se quita `EstadoClave.LIMITADO` (los manuales solo documentan `ACTIVO` e `INACTIVO`).
- `ArcaPadronError` (respuesta inválida de ARCA) antes extendía `ArcaError` → ahora extiende `ArcaResponseError` (con `uncertain: false`), como las respuestas inválidas del resto de los SDKs. `ArcaResponseError` se re-exporta desde el paquete.

Nuevo: se reexportan los tipos `ServiceClientConfig`, `ServiceTransport` y `ServiceEndpoints` de `@ramiidv/arca-common`.
