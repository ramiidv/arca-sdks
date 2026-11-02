---
'@ramiidv/arca-sire': minor
---

Auditoría contra el manual para el desarrollador de SIRE.

**Cambios de comportamiento:**

- Se validan las reglas de fechas del manual (3.2.2), comparando fechas calendario de Argentina: `fechaRetencion` a partir del 2019-12-01, `fechaComprobante` ≤ `fechaRetencion` y, para los tipos 3, 19 y 20, `fechaComprobante` = `fechaRetencion`. Antes estaban documentadas pero no se validaban: ahora dan `ArcaValidationError` antes de llamar a ARCA.
- `numeroComprobante` de los tipos 5, 6, 9 y 11 (`X(n)`, "caracteres alfanuméricos") acepta letras, dígitos y los separadores `-`, `/` y `.` (antes se validaba solo el largo).
- Un SOAP Fault de token/sign (ej: `MISSING_AUTHENTICATION_TOKEN`) ahora lanza `ArcaAuthError` (antes `ArcaSireServiceError`) y descarta el ticket cacheado para que el próximo intento pida uno nuevo.
- `importeComprobante` puede ser negativo en los tipos 19 y 20 (liquidaciones "con valor negativo"); en el resto sigue exigiéndose ≥ 0.

Otros cambios:

- `status()` devuelve también `headerInfo` (`ambiente`, `fecha`, `vCore`, `v2005`) del header SOAP, útil para detectar un entorno equivocado. Nuevos tipos `SireServerStatus` y `SireHeaderInfo`.
- Un Fault `soapenv:Client` sin `faultstring` se informa como `ArcaSireServiceError` (rechazo, no incierto), con el texto de `detail` si vino.
- Las fechas se serializan con `formatDateTimeAR` de common (misma salida que antes).
- Documentación: requisitos (Node >= 20.19, solo ESM, `require(esm)`), `ArcaSireConfig` extiende `ArcaSdkConfig` (`wsaa`, `signal`), `coe`/`coeOriginal`/`cae` se omiten si no corresponden, CDI en `cuitRetenido`, y se aclara que el manual no dice que los importes sean sin signo.
