# Changelog

## 0.4.0

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

## 0.3.0 (2026-11-01)

Reescritura completa contra el WSDL/XSD oficial del servicio SIRE C2005 y el manual para el desarrollador v1.0.3. Las versiones anteriores usaban endpoints, namespace y operaciones que no existen en ARCA: ninguna llamada funcionaba.

### Breaking
- Endpoints reales: `https://ws-aplicativos-reca[.homo].afip.gob.ar/sire/ws/v1/c2005/2005`; namespace `http://www.afip.gob.ar/sire/c2005/`.
- API nueva según las tres operaciones del WSDL: `emitirCertificado` (`emitir`), `anularCertificado` (`anular`) y `status` (`dummy`).
- Eliminados (no existen en el servicio): `registrarRetencion`, `consultarRetenciones`, `anularRetencion`, `consultarComprobante`, `generarCertificado`, `consultarAlicuotas`, `consultarRegimenes`, `consultarTiposComprobante`, `consultarTiposOperacion`, `consultarCondicion`, y sus tipos (`Retencion`, `RetencionResult`, `CertificadoRetencion`, etc.).
- Eliminados los enums sin respaldo `TipoRetencion`, `Regimen`, `TipoOperacion`, `CondicionSujeto`, `EstadoComprobante`; `TipoComprobante` ahora es la tabla TIPO_COMPROBANTE del manual (1-20), no 2003/2004/2005.
- Eliminados `ArcaSireError` (no se usaba), `validateRetencion`, `validatePeriodo` y los re-exports de utilidades de common (`WsaaClient`, `parseXml`, `buildXml`, `ensureArray`, `checkServiceErrors`).
- `SireClient` tiene una API nueva (`dummy`, `emitir`, `anular`).
- Requiere `@ramiidv/arca-common` ^0.4.0. Se quitan las dependencias sin uso `fast-xml-parser`, `node-forge` y `@types/node-forge`.

### Features
- Tablas del manual: `TipoComprobante`, `Condicion`, `MotivoAnulacion`, `REGIMENES_CON_CONDICION`; constantes `SIRE_VERSION` (100), `IMPUESTO_IVA` (216), `SIRE_SERVICE_ID`, `SIRE_NAMESPACE`.
- Validación local completa según XSD y manual (obligatorios, condicionales, longitudes, formato de `numeroComprobante`, CUIT con dígito verificador) que acumula todos los errores en un `ArcaValidationError`.
- Fechas `xs:dateTime` serializadas como `AAAA-MM-DDThh:mm:ss.SSS-03:00`; importes con 2 decimales.
- `emitir`/`anular` con `kind: 'emision'`: nunca se reintentan y los errores de transporte son `uncertain`. README con el procedimiento de recuperación.
- SOAP Faults de rechazo (`soapenv:Client`, schema, request mal formado, token/sign) → `ArcaSireServiceError` con `faultCode` y `cause`.
- Config basada en `ArcaBaseConfig` (`ticketStorage`, `clockOffsetMs`, `autoClockSkew`, `loginErrorCooldownMs`, `fetch`, `legacyTls`) y `endpoints` opcionales; métodos con `opts.signal`.
- `package.json`: `sideEffects: false`, `exports` con `import`, `prepublishOnly` con clean + build + test.

### Fixes
- Importes `NaN`, `Infinity` o negativos ya no pasan la validación.
- `cuitAgente` y `cuitRetenido` se validan con dígito verificador y se envían como número.
- Respuestas sin `certificadoNro`/`codigoSeguridad` lanzan un error (incierto) en lugar de devolver datos vacíos.

## 0.2.0 (2026-06-03)

### Fixes
- Build en CI: el lockfile resolvía `@ramiidv/arca-common` local; se regeneró desde el registry.
- Tests de `validatePeriodo` alineados con el mensaje real.

### Features
- Workflow de release.

## 0.1.0 (2026-03-31)

### Features
- Versión inicial (`ArcaSire`, `SireClient`, validaciones, enums y errores). Ver 0.3.0: los endpoints y operaciones de esta versión no existían en ARCA.
