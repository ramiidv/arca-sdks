# Changelog

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
