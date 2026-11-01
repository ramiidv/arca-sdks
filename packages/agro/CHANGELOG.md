# Changelog

## 0.3.0 (2026-11-01)

Reescritura de los clientes contra los WSDL/XSD oficiales. La versión anterior no funcionaba contra ARCA en ningún servicio (endpoints, namespaces, elementos y campos incorrectos).

### Breaking

- **Se elimina WSCTG** (cliente `CtgClient`, `agro.ctg`, tipos, constantes `CTG_*`, `validateCTG`, servicio en `serverStatus`): el CTG fue derogado el 1/11/2021 (RG 5017/2021, reemplazado por la Carta de Porte Electrónica) y sus endpoints responden 404.
- WSCPE: los requests ahora siguen el XSD (`cabecera`, `origen`, `datosCarga`, `destino`, `destinatario`, `transporte`, ...). Se renombran/reemplazan métodos: `confirmadoArriboCPE` → `confirmarArriboCPE`, `editarCPE` → `editarCPEAutomotor`, `consultarCPE` → `consultarCPEAutomotor`, `consultarConstanciaCPEPDF` eliminado (el PDF viene en `pdf` de las respuestas). `consultarUltNroOrden`/`siguienteNroOrden` reciben `(sucursal, tipoCPE)`.
- WSLPG: `liquidacionAutorizar` recibe `{ liquidacion, deducciones?, retenciones?, percepciones? }` según `LpgLiquidacionBaseType`; `liquidacionConsultar` se reemplaza por `liquidacionXCoeConsultar` y `liquidacionXNroOrdenConsultar`; `liquidacionAnular(coe)`; `liquidacionAjustarUnificado({ ajusteBase, ajusteCredito?, ajusteDebito? })`; `certificacionAutorizar`/`certificacionAnular` → `cgAutorizar`, `cgSolicitarAnulacion`, `cgConfirmarAnulacion`; `consultarParametros(nombre)` → un método por paramétrica (`tipoGranoConsultar`, `puertoConsultar`, ...).
- Respuestas tipadas según el XSD: `nroCTG` y `coe` son `string`; los `xs:string` (ej: `codigo` de paramétricas) son `string`. Se eliminan `AgroAuth`, `AgroError`, `raw` y las index signatures `[key: string]: unknown`.
- Los errores de negocio se lanzan como `ArcaAgroServiceError` (extiende `ArcaServiceError`) en lugar de devolverse en `errores`.
- `ArcaAgroConfig` extiende `ArcaBaseConfig`: `requestTimeoutMs` → `timeout`; `cuit` acepta `number | string` y se valida el dígito verificador.
- `CpeClient`/`LpgClient` solo se obtienen desde `ArcaAgro` (se exportan como tipos); sus métodos reciben `opts?: { signal }` en lugar de `auth`.
- `serverStatus()` devuelve `{ cpe, lpg }` con `{ ok: true, status } | { ok: false, error }`; `clearAuthCache()` es async.
- `validateCPE`/`validateCTG` → `validateAutorizarCPEAutomotor`, `validateAutorizarCPEFerroviaria`, `validateLiquidacion`, `validateAjusteUnificado`.
- Requiere `@ramiidv/arca-common` ^0.4.0.

### Features

- WSCPE, circuito automotor completo: `autorizarCPEAutomotor` (tipos 74 y 274), `consultarCPEAutomotor`, `editarCPEAutomotor`, `editarCPEConfirmadaAutomotor`, `confirmarArriboCPE`, `confirmacionDefinitivaCPEAutomotor`, `descargadoDestinoCPE`, `rechazoCPE`, `anularCPE`, `nuevoDestinoDestinatarioCPEAutomotor`, `regresoOrigenCPEAutomotor`, `desvioCPEAutomotor`, `informarContingencia`, `cerrarContingenciaCPE`.
- WSCPE, circuito ferroviario: `autorizarCPEFerroviaria`, `consultarCPEFerroviaria`, `editarCPEFerroviaria`, `editarCPEConfirmadaFerroviaria`, `confirmacionDefinitivaCPEFerroviaria`, `nuevoDestinoDestinatarioCPEFerroviaria`, `regresoOrigenCPEFerroviaria`, `desvioCPEFerroviaria`, `consultaCPEFerroviariaPorNroOperativo`.
- WSCPE, consultas y paramétricas: `consultarCPEPorDestino`, `consultarCPEPPendientesDeResolucion`, `consultarProvincias`, `consultarLocalidadesPorProvincia`, `consultarTiposGrano`, `consultarPlantas`, `consultarLocalidadesProductor`, `consultarCategoriasSemillas`, `consultarVariedadesSemillas`.
- WSLPG: `liquidacionUltimoNroOrdenConsultar`, `cgConsultarUltimoNroOrden` y paramétricas (`provinciasConsultar`, `localidadXProvinciaConsultar`, `tipoOperacionXActividadConsultar`, `puertoConsultar`, `tipoActividadConsultar`, `tipoActividadRepresentadoConsultar`, `tipoCertificadoDepositoConsultar`, `tipoRetencionConsultar`, `tipoDeduccionConsultar`, `tipoGranoConsultar`, `codigoGradoReferenciaConsultar`, `codigoGradoEntregadoXTipoGranoConsultar`, `campaniasConsultar`).
- Validación local completa contra el XSD (obligatorios, campos desconocidos, rangos, largos, CUIT con dígito verificador, números finitos, redondeo según `fractionDigits`, fechas) reportando todos los errores juntos.
- Constantes `TIPO_CPE` y `ESTADOS_CPE`. Endpoints configurables (`endpoints: { cpe, lpg, wsaa }`).
- Configuración de WSAA: `ticketStorage`, `clockOffsetMs`, `autoClockSkew`, `loginErrorCooldownMs`, `fetch`, `legacyTls`.
- Todos los métodos aceptan `{ signal }`.

### Fixes

- WSCPE: endpoints de homologación (`cpea-ws-qaext.afip.gob.ar`) y producción (`cpea-ws.afip.gob.ar`), elementos `<Op>Req`/`<Op>Resp`, SOAPAction y auth `{ token, sign, cuitRepresentada }`.
- WSLPG: namespace `http://serviciosjava.afip.gob.ar/wslpg/` (era `https`), elementos del WSDL (`liquidacionReq`, `liqConsXCoeReq`, ...) y auth `{ token, sign, cuit }`.
- Los errores de negocio (`errores.error[]`, `erroresFormato.error[]`) ya no se pierden: siempre se lanzan.
- Las consultas sin resultados devuelven `[]` (antes devolvían `[respuestaCompleta]`).
- `consultarUltNroOrden` lanza si ARCA no devuelve `nroOrden` (antes devolvía 0 y `siguienteNroOrden` daba 1, un número ya usado).
- Las emisiones (autorizar, anular, rechazar, confirmar, editar, contingencias, desvíos, liquidar, ajustar, certificar) nunca se reintentan y conservan `uncertain`.
- `serverStatus()` usa `Promise.allSettled`; `clearAuthCache()` espera el borrado de los tickets.
- Validación: `NaN` ya no pasa como número positivo; el CUIT se valida con dígito verificador.
- Los ejemplos usaban `codTipoCartaPorte: 1` (inválido); ahora usan el tipo 74.

## 0.2.0 (2026-06-03)

### Chore
- Build standalone para CI y workflow de release en GitHub Actions.
- `homepage` apunta a arca-sdk.dev.

## 0.1.0 (2026-03-31)

### Features
- Initial release
- WSCPE (Carta de Porte Electronica) - Electronic bill of lading for grain transport
- WSCTG (Codigo de Trazabilidad de Granos) - Grain traceability codes
- WSLPG (Liquidacion Primaria de Granos) - Primary grain settlement/liquidation
- Auto-handles WSAA authentication for all 3 services
- Retry with exponential backoff on transient errors
- Event system for logging/debugging
