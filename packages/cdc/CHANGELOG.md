# Changelog

## 0.3.0 (2026-11-01)

Las versiones anteriores no podían operar contra ARCA (namespace incorrecto, sin SOAPAction y sin
`CmpReq`). Esta versión se alinea con el WSDL oficial y el manual del desarrollador WSCDC v0.4
(01-12-2025).

### Breaking
- Requiere `@ramiidv/arca-common` `^0.4.0`.
- `constatar()`: el input ahora es el bloque `CmpReq` del WSDL. Campos nuevos obligatorios
  `CbteModo` (`'CAE' | 'CAI' | 'CAEA'`) y `CuitEmisor` (permite constatar comprobantes de terceros).
  `DocTipoReceptor`/`DocNroReceptor` pasan a ser opcionales (se informan juntos) y se agrega
  `Opcionales`. `CbteFch` acepta `YYYYMMDD`, `YYYY-MM-DD` o `Date`.
- `ConstatarResult`: expone `FchProceso`, `CmpResp`, `Observaciones` y `Events` (siempre arrays). Se
  quita `Errors`: si ARCA devuelve `Errors` (formato, autenticación 600-602, infraestructura
  500-503) se lanza `ArcaServiceError` (antes devolvía `Resultado: 'R'`, indistinguible de un
  rechazo real). Si falta `Resultado` o `FchProceso` se lanza `ArcaSoapError`.
- `getModalidades()` devuelve `{ Cod, Desc, FchDesde?, FchHasta? }` (`FacModTipo`); antes `{ Id, ... }`
  y siempre `[]`.
- `getTiposCbte()` devuelve `{ Id: number, Desc }` y `getDocTipos()` `{ Id: string, Desc }`: se
  quitan `FchDesde`/`FchHasta`, que no existen en esos tipos del WSDL.
- `clearAuthCache()` es `async` (`Promise<void>`).
- `ArcaCdcConfig` extiende `ArcaBaseConfig`; `cuit` acepta `number | string` y se valida con dígito
  verificador al construir.
- `CdcClient`: nuevo constructor (`{ endpoint, timeout, retries, retryDelayMs, onEvent, fetch,
  legacyTls }`) y `Cuit` del `Auth` como `number | string`.
- Endpoint de producción: `https://servicios1.afip.gov.ar/WSCDC/service.asmx` (el host
  `servicios1.arca.gob.ar` presenta un certificado para `servicios1.afip.gov.ar` y falla la
  validación TLS).
- `WSCDC_NAMESPACE` = `http://servicios1.afip.gob.ar/wscdc/`.
- `index.ts` ya no re-exporta `ensureArray`, `parseXml`, `buildXml`, `checkServiceErrors` ni los tipos
  `WsaaClientConfig`/`SoapCallOptions` (usalos desde `@ramiidv/arca-common`).

### Features
- `getTiposOpcionales()` / `CdcClient.getTiposOpcionales()` (`OpcionalesTipoConsultar`).
- Todos los métodos públicos aceptan `opts?: { signal }`.
- Config: `ticketStorage`, `tokenTTLMinutes`, `clockOffsetMs`, `autoClockSkew`,
  `loginErrorCooldownMs`, `fetch`, `legacyTls` y `endpoints: { wscdc?, wsaa? }`.
- Exporta `ArcaValidationError`, `ArcaTicketVigenteError`, `MemoryTicketStorage`,
  `FileTicketStorage`, `CBTE_MODOS` y los tipos `CbteModo`, `Opcional`, `ComprobanteConstatado`,
  `CdcMensaje`, `OpcionalTipoItem`, `CallOptions`, `TicketStorage`, etc.
- Validación local según el manual: `CbteModo`, CUIT del emisor y de la representada (dígito
  verificador), `PtoVta` 1-99998, `CbteTipo` 1-999, `CbteNro` 1-99999999, fecha existente,
  `ImpTotal` finito >= 0 con hasta 13 enteros (redondeado a 2 decimales), `CodAutorizacion` de 14
  dígitos, documento del receptor (numérico; CUIT con dígito verificador si `DocTipoReceptor` = 80),
  `Opcionales` (Id 1-4 caracteres sin repetir, Valor 1-250).

### Fixes
- Namespace, SOAPAction y serialización calificada (ASMX, `elementFormDefault="qualified"`): ninguna
  llamada funcionaba.
- `ComprobanteConstatar` envía `Auth` + `CmpReq` en el orden del WSDL.
- `ComprobantesModalidadConsultar` lee `ResultGet/FacModTipo`.
- Producción funciona con el fallback TLS legacy de common (el host negocia DH de 1024 bits).
- Los errores de negocio de las tablas de parámetros se lanzan siempre; nunca se devuelve una lista
  vacía por un error. Campos obligatorios ausentes en la respuesta lanzan `ArcaSoapError`.
- `constatar()` es una consulta (`kind: 'consulta'`): se reintenta ante errores transitorios.
- `prepublishOnly` corre los tests.

## 0.2.0 (2026-06-03)

### Chore
- CI con GitHub Actions (Node 18/20/22) y workflow de release (publicación al crear un tag).
- `homepage` apunta a arca-sdk.dev.
- `package-lock.json` resuelve `@ramiidv/arca-common` desde el registry de npm (el build en CI
  fallaba con la ruta local).

## 0.1.0 (2026-03-31)

### Features
- Initial release
- Verify comprobantes (invoices) against ARCA using `constatar()` with CAE, CAI, or CAEA codes
- Query available billing modalities via `getModalidades()`
- Query enabled voucher types via `getTiposCbte()`
- Query enabled document types via `getDocTipos()`
- Service health check via `status()`
- Automatic WSAA authentication with ticket caching
- Input validation for `constatar()` parameters
- Full TypeScript support with strict types
