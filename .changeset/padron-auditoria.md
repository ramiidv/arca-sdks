---
'@ramiidv/arca-padron': minor
---

Auditoría contra los manuales de `ws_sr_constancia_inscripcion` v4.1 y A13 v1.4.

**Cambios de comportamiento:**

- `getConstanciaInscripcion` (y `a5.getPersona`) lanza `ArcaPadronServiceError` con `reason: 'inexistente'` también cuando ARCA informa la CUIT inexistente en `errorConstancia` ("No existe persona con ese Id"); antes devolvía una persona sin datos.
- `getConstanciasInscripcion` (y `a5.getPersonaList`) ya no falla todo el lote por una CUIT: las CUITs inválidas (formato o dígito verificador) no se envían a ARCA y vuelven como una persona con el motivo en `errorConstancia`; una persona que ARCA devuelve con datos inválidos vuelve con el detalle en `errorConstancia` (si no trae ninguna CUIT, se omite). El resultado sigue el orden de `cuits`. Si todas son inválidas, no se llama a ARCA.
- `condicionIvaDesdePadron` advierte en el motivo el `errorConstancia` (ej: CUIT limitada por la RG 3832/16) aunque la condición se haya podido determinar; antes lo ignoraba si había impuestos. Un `errorConstancia` sin texto dice "sin detalle". El impuesto 33 (IVA responsable no inscripto) devuelve `null` con un motivo propio.
- `status()`: con el cambio de `statusOf` en arca-common, `ok` es `false` si algún servidor (`appserver`, `dbserver`, `authserver`) no está en `OK`, con lo informado en `status`.

Nuevo:

- `metadata` (`fechaHora`, `servidor`) de las respuestas: en `PersonaA4`, `PersonaA10`, `PersonaA13` y `PersonaA5`; en las listas (`getConstanciasInscripcion`, `getIdPersonaListByDocumento`, `getParametros`), como propiedad no enumerable `lista.metadata` (tipo `ListaPadron<T>`).
- Tipos `PadronMetadata`, `ListaPadron<T>` y `TipoPersonaPadron` (`tipoPersona` admite otros valores además de `FISICA`/`JURIDICA`, que el SDK devuelve tal cual). `ImpuestoId.IVA_RESPONSABLE_NO_INSCRIPTO` (33).
- Se documenta que los `xs:dateTime` (`fechaContratoSocial`, `ffRelacion`...) son strings tal cual los envía ARCA, y por qué los endpoints usan `afip.gov.ar` (los `soap:address` de los WSDL) en lugar de los `arca.gob.ar` del manual de la constancia.

Deprecado: `ensureArray`, `parseXml` y `buildXml` (importarlos de `@ramiidv/arca-common`) y `BasePadronClient.soapOptions` / `.onEvent` (no se usan).

Documentación: README y `llms.txt` en español, con Node >= 20.19 (solo ESM), `ArcaSdkConfig` (`wsaa`, `signal`), credenciales de bajo nivel en camelCase (`{ token, sign, cuitRepresentada }`), `ArcaFacturacion` para compartir el WSAA y los tipos `PersonaA5` y `PersonaA13`.
