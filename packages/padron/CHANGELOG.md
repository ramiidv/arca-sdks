# Changelog

## 0.9.2

### Patch Changes

- f1b23ca: Documentación: sin indicaciones sobre cómo manejar el repositorio (`.gitignore`) y con el comportamiento de ARCA descripto como tal, sin referencias a cómo se verificó. En sire, el criterio de los SOAP Faults se corrige: solo `XML invalido…` y `Request mal formado` se informan como rechazo; los faults de autenticación son `ArcaAuthError`.
- Updated dependencies [f1b23ca]
  - @ramiidv/arca-common@0.10.1

## 0.9.1

### Patch Changes

- e763bcb: Los source maps publicados incluyen el código fuente embebido (`inlineSources`), así que se pueden depurar sin `src/`. El build borra `dist/` antes de compilar, para que no se publiquen archivos de módulos eliminados.
- Updated dependencies [e763bcb]
- Updated dependencies [8424364]
  - @ramiidv/arca-common@0.10.0

## 0.9.0

### Minor Changes

- 4258c52: **Cambios que rompen compatibilidad** (release de API uniforme entre los SDKs):
  
  - Requiere Node >= 22.12 (Node 20 llegó a fin de vida el 30/04/2026).
  - Clientes de bajo nivel (`PadronA5Client`, `PadronA4Client`, `PadronA10Client`, `PadronA13Client`, `PadronA100Client`): antes `new PadronA4Client({ endpoint, namespace, soapOptions?, onEvent? })` → ahora `new PadronA4Client({ endpoint, transport? })` (`ServiceClientConfig` de `@ramiidv/arca-common`; `transport` incluye `onEvent`). El namespace lo fija cada cliente. `PadronClientConfig` es ahora `ServiceClientConfig`; se quitan el tipo `PadronSoapOptions` y las propiedades protegidas `BasePadronClient.soapOptions` y `.onEvent`. El constructor de `BasePadronClient` pasa a ser `protected constructor(config, namespace)`.
  - `ENDPOINTS`: antes `{ wsaa, a5: { testing, production, namespace, serviceId }, ... }` → ahora solo URLs, `{ a5: { testing, production }, a4, a10, a13, a100 }` (`satisfies Record<string, ServiceEndpoints>`). Se quita `ENDPOINTS.wsaa` (usar `WSAA_ENDPOINTS` de `@ramiidv/arca-common`); `ENDPOINTS.<svc>.namespace` → `NAMESPACES.<svc>` y `ENDPOINTS.<svc>.serviceId` → `SERVICE_IDS.<svc>` (constantes nuevas, con las mismas claves).
  - Se quitan los re-exports deprecados `ensureArray`, `parseXml` y `buildXml`: importarlos de `@ramiidv/arca-common`.
  - Se quita el re-export del tipo `SoapCallOptions` (solo lo usaba `PadronSoapOptions`); las opciones de transporte de los clientes son `ServiceTransport`.
  - `TipoDomicilio.LEGAL` y `TipoDomicilio.REAL` → `TipoDomicilio.LEGAL_REAL` (`'LEGAL/REAL'`, el valor de los manuales).
  - Se quita `EstadoClave.LIMITADO` (los manuales solo documentan `ACTIVO` e `INACTIVO`).
  - `ArcaPadronError` (respuesta inválida de ARCA) antes extendía `ArcaError` → ahora extiende `ArcaResponseError` (con `uncertain: false`), como las respuestas inválidas del resto de los SDKs. `ArcaResponseError` se re-exporta desde el paquete.
  
  Nuevo: se reexportan los tipos `ServiceClientConfig`, `ServiceTransport` y `ServiceEndpoints` de `@ramiidv/arca-common`.

### Patch Changes

- Updated dependencies [2ce6ef5]
  - @ramiidv/arca-common@0.9.0

## 0.8.0

### Minor Changes

- b874fa9: Revisión contra los manuales vigentes (constancia v4.1, A4 v1.3, A10 v1.2, A13 v1.4).
  
  - `TipoDomicilio` agrega `LEGAL_REAL` (`'LEGAL/REAL'`, el valor que informan los manuales) y `LOCALES_Y_ESTABLECIMIENTOS` (A4). `TipoDomicilio.LEGAL`, `TipoDomicilio.REAL` y `EstadoClave.LIMITADO` (no documentado; "limitada" aparece solo en `errorConstancia`) quedan `@deprecated`.
  - `condicionIvaDesdePadron`: con `errorConstancia` y sin impuestos de IVA ni monotributo, el motivo es que ARCA no emitió la constancia, aunque haya otros impuestos (antes decía que podía ser consumidor final).

### Patch Changes

- 1cccecc: README y llms.txt: glosario, links a los manuales de A4, A10, A13 y A100, cómo asociar cada servicio al certificado, advertencia de `clearAuthCache()`, `MAX_PERSONA_LIST`, validación de documentos de `getIdPersonaListByDocumento` y `reason: 'otro'` (el SDK no lo emite: un Fault no reconocido queda como `ArcaSoapError`).
- Updated dependencies [1cccecc]
- Updated dependencies [bd57c86]
  - @ramiidv/arca-common@0.8.0

## 0.7.0

### Minor Changes

- aa1a57d: Auditoría contra los manuales de `ws_sr_constancia_inscripcion` v4.1 y A13 v1.4.
  
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

### Patch Changes

- Updated dependencies [b152f08]
  - @ramiidv/arca-common@0.7.0

## 0.6.0

### Minor Changes

- d535462: Cambio incompatible: `status()` devuelve, para cada servicio, el `ServiceStatus` de arca-common (`{ ok: true, status }` o `{ ok: false, error }`) en lugar de un `PromiseSettledResult`, igual que agro y facturacion.
  
  ```ts
  const s = await padron.status();
  if (s.a4.ok) console.log(s.a4.status.appserver);
  else console.error(s.a4.error);
  ```
  
  También se quita lo deprecado: `TipoDocumento` (usar `DocTipo`), `ImpuestoId.IVA_NO_INSCRIPTO`, el re-export de `checkServiceErrors` (está en `@ramiidv/arca-common`) y el tipo `ArcaPadronEvent` (usar `ArcaEvent`).
  
  `WsAuth` (credenciales de los clientes de bajo nivel) pasa a camelCase: `{ token, sign, cuitRepresentada }`.

### Patch Changes

- Updated dependencies [87f58c1]
  - @ramiidv/arca-common@0.6.0

## 0.5.0

### Minor Changes

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
