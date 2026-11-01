# Changelog

## 0.4.0 (2026-11-01)

### Breaking changes
- Requiere `@ramiidv/arca-common` ^0.4.0. `ArcaPadronConfig` extiende `ArcaBaseConfig` (`cuit` acepta
  `string | number`; se agregan `tokenTTLMinutes`, `loginErrorCooldownMs`, `fetch`, `legacyTls` y
  `endpoints`, que se pasan al `WsaaClient` y a cada servicio).
- Las CUIT se validan localmente con `validateCuit` (dígito verificador) y se envían normalizadas: una
  CUIT inválida (también la representada de la config) lanza `ArcaValidationError` sin llamar a ARCA.
- Los SOAP Faults de negocio conocidos (CUIT inexistente, clave INACTIVA, id inválido, token no
  autorizado; textos de los manuales) se lanzan como `ArcaPadronServiceError` con `reason` tipado y el
  `ArcaSoapError` original en `cause` (antes llegaban como `ArcaSoapError`).
- Si `personaReturn` no trae `persona` (A4, A10, A13), la constancia no trae `datosGenerales` ni
  `errorConstancia`, o A100 no trae `parameterCollection`, se lanza `ArcaPadronError` (antes se
  devolvía una persona inventada `{ idPersona: '', tipoPersona: 'FISICA' }` o `[]`). También si falta el
  id de un ítem (`idImpuesto`, `idActividad`, `idCategoria`, etc.): ya no se rellenan con `0` / `''`.
- `status()` devuelve `PromiseSettledResult<ServerStatus>` por servicio (`Promise.allSettled`): un
  servicio caído ya no hace fallar todo.
- `ImpuestoId.BIENES_PERSONALES` es `180` (estaba como `31`, incorrecto); se quitó el alias
  `ImpuestoId.MONOTRIBUTO_SOCIAL` (mismo valor que `MONOTRIBUTO`, rompía el mapeo inverso).
- `condicionIvaDesdePadron`: el impuesto 30 en estado `NA` / `NO APORTANTE` ya no se interpreta como IVA
  no alcanzado (`NA` es "NO APORTANTE" en la tabla TipoEstado); un impuesto 20 en baja ya no da
  monotributista aunque haya categoría.
- Tipos: `DomicilioA4` ya no tiene `estadoDomicilio` (no existe en el WSDL de A4) y, como
  `DependenciaA4`/`DependenciaA10`, tiene sus campos opcionales (son `minOccurs="0"`);
  `ImpuestoA4.estado` y `ParameterAttribute.value` son opcionales.
- Se eliminaron los módulos internos `soap-client.ts` y `wsaa.ts` (re-exports puros): `WsaaClient`,
  `ensureArray`, `parseXml` y `buildXml` se siguen exportando desde el índice.

### Features
- `getConstanciasInscripcion(cuits)` / `a5.getPersonaList`: `getPersonaList_v2`, hasta 250 CUITs; las
  inexistentes vuelven con `errorConstancia`.
- `getPersonaA13V2(cuit)` / `a13.getPersonaV2`: consulta de claves INACTIVAS (manual A13 v1.4).
- `monotributo.componenteDeSociedad` en la constancia (tipo `relacion` del WSDL).
- `CollectionName`: `AUTONOMO_MONOTRIBUTO`, `REGIMEN`, `TIPO_REGIMEN`, `CARACTERIZACION`,
  `TIPO_ARCHIVO`, `ACTIVIDAD_RUBRO`, `RUBRO_ACTIVIDAD`, `ACTIVIDAD_OCUPACIONAL` (manual A100 v2.1).
- `ImpuestoId`: `MONOTRIBUTO_AUTONOMO` (21), `AUTONOMOS` (308).
- `getIdPersonaListByDocumento` acepta el documento con puntos/espacios y lo valida.
- Se exportan `ArcaValidationError`, `DocTipo`, `PadronErrorReason`, `PadronStatus`, `PadronServicio`,
  `ComponenteSociedadA5`, `PadronSoapOptions` y `MAX_PERSONA_LIST`.

### Fixes
- A4 y A10: los campos `xs:string` con contenido numérico (`codPostal`, `datoAdicional`, `localidad`,
  `numeroInscripcion`) salían como `number`; ahora son `string`. A4 y A10 usan los helpers de
  `mapping.ts` (sin bloques duplicados de dependencia, claves inactivas y domicilio).
- A100: `id`, `description`, `name` y `value` se preservan tal cual (`"10.50"` ya no se convierte en
  `10.5`, ni `"1E3"` en `1000`). Usa `parseNumbers: false` de arca-common en lugar de envolver `fetch`:
  el A100 ya no desactiva el fallback TLS legacy (`legacyTls`) y respeta el `fetch` de la config.
- Todos los servicios parsean las respuestas con `parseNumbers: false` y convierten explícitamente los
  campos numéricos del WSDL: los `xs:string` con decimales, exponente o ceros a la izquierda
  (`datoAdicional`, `piso`, `numeroDocumento`, etc.) llegan tal cual (`"1.50"` antes era `"1.5"`).
- Los elementos `xsi:nil="true"` se tratan como ausentes (antes, por ejemplo, una caracterización nil
  se mapeaba como `{ idCaracterizacion: 0 }`).
- `condicionIvaDesdePadron`: reconoce los estados del manual A4 en palabras (`ACTIVO EN TRAMITE`,
  `EXENTO`, `EXENTO EN TRAMITE`, `BAJA ...`) además de las abreviaturas; categorías 101 a 104
  (proyectos productivos) como monotributo social; incluye `errorRegimenGeneral` / `errorMonotributo`
  en el motivo y ya no afirma "No figura inscripto" cuando ARCA informó errores.
- `ArcaPadronError` y `ArcaPadronServiceError` ahora se lanzan de verdad (la documentación enseñaba a
  capturarlos pero el SDK nunca los usaba).

### Deprecated
- `TipoDocumento` (es `DocTipo` numérico de WSFEv1, no el `tipoDocumento` string del padrón): usar `DocTipo`.
- `checkServiceErrors` desde este paquete (Padrón informa los errores como SOAP Fault).
- `ImpuestoId.IVA_NO_INSCRIPTO` (33), sin respaldo en los manuales.

## 0.3.0 (2026-10-30)

### Breaking changes
- Requiere `@ramiidv/arca-common` ^0.3.0 (`AccessTicket.expirationTime` es un string ISO).
- `ImpuestoId.MONOTRIBUTO` es `20` (estaba como `21`, incorrecto según el manual de
  `ws_sr_constancia_inscripcion`). `ImpuestoId.MONOTRIBUTO_SOCIAL` queda deprecado (mismo valor 20):
  el monotributo social se identifica por la categoría.
- `status()` devuelve también `a5` y `a13`.

### Features
- `getConstanciaInscripcion(cuit)`: constancia de inscripción (`ws_sr_constancia_inscripcion`,
  `getPersona_v2`), que reemplaza a Padrón A5 (deprecado por ARCA). Tipo `PersonaA5` con datos
  generales, domicilio fiscal, caracterizaciones, régimen general, monotributo y errores.
- `getPersonaA13(cuit)` y `getIdPersonaListByDocumento(dni)` (`ws_sr_padron_a13`).
- `condicionIvaDesdePadron(persona)`: condición frente al IVA para `CondicionIVAReceptorId` (también
  reconoce el impuesto 30 en estado `EX` / `NA`).
- `ticketStorage`, `clockOffsetMs`, `autoClockSkew`, `signal` y `wsaa` en `ArcaPadronConfig`; `signal`
  por llamada en todos los métodos.
- `ArcaPadronError` y `ArcaPadronServiceError` tienen `code` propio (`ARCA_PADRON_ERROR`,
  `ARCA_PADRON_SERVICE_ERROR`).
- Re-exporta `CondicionIva`, `MemoryTicketStorage`, `FileTicketStorage` y `ArcaTicketVigenteError`.
- Build dual ESM + CommonJS con `exports` condicional, y smoke test CommonJS/ESM en CI.

### Fixes
- Se quitaron dependencias que no se usaban (`fast-xml-parser`, `node-forge`): todo pasa por arca-common.
- A4, A10 y A100 no desenvolvían `personaReturn` / `parameterCollectionReturn`: con respuestas reales de
  ARCA los datos quedaban vacíos y A100 devolvía `[]`.
- Documentación: el paquete es `@ramiidv/arca-padron` (decía `@ramiidv/arca-padron-sdk`, que da 404).
- Ejemplo de eventos: los campos son `service` y `source` (decía `serviceId`).

### Estado de los servicios
Según el catálogo de web services de ARCA (consultado el 24/10/2026), A4, A10, A13 y A100 no están
deprecados; A5 sí (reemplazado por la constancia de inscripción).

## 0.2.0

- Migración de WSAA/SOAP a `@ramiidv/arca-common`.
- CI en Node 18/20/22, build standalone, workflow de release, `publishConfig` público y homepage.

## 0.1.0 (2026-03-31)

### Features
- Initial release
- Padrón A4: full taxpayer data (domicilios, impuestos, actividades, regímenes, relaciones, categorías, emails, teléfonos)
- Padrón A10: minimal taxpayer data (name, status, domicilio fiscal)
- Padrón A100: parameter tables lookup (provincias, tipos documento, etc.)
- Auto-handles WSAA authentication
- Shared infrastructure from @ramiidv/arca-common
- Retry with exponential backoff on transient errors
- Event system for logging/debugging
