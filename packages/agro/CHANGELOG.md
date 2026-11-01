# Changelog

## 0.4.0

### Minor Changes

- 8c02c30: API uniforme entre los SDKs (los nombres anteriores siguen funcionando,
  marcados `@deprecated`, hasta la próxima major):
  
  - arca-facturacion: la clase principal es `ArcaFacturacion` (`Arca` queda como
    alias). Nuevo `status()` → `{ wsfe, wsfex }` con `ServiceStatus` y el
    `ServerStatus` de arca-common (`appserver`/`dbserver`/`authserver`);
    `serverStatus()`/`serverStatusExpo()` y su `ServerStatus` en mayúsculas
    quedan deprecados.
  - arca-agro: `status()` (antes `serverStatus()`).
  - arca-fecred: el cliente de bajo nivel es `client` (antes `fecred`).
  - arca-common: `ServiceStatus` y `statusOf()` para el estado de varios servicios.
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
- b86db00: Nuevo subpath `@ramiidv/arca-common/schema`: el DSL para describir los tipos
  del XSD de un servicio y, con la misma descripción, validar y serializar
  requests en el orden del XSD (`encodeRequest`) y decodificar respuestas con
  tipos (`decodeResponse`). Nuevo error `ArcaResponseError` (respuesta con forma
  inválida, con `uncertain`).
  
  arca-agro usa el DSL de common (`ArcaAgroResponseError` extiende
  `ArcaResponseError`) y parsea las respuestas sin conversión numérica: los
  `xs:string` con contenido numérico (ej: `"0012"`, `"10.50"`) ya no pierden ceros
  ni decimales.
- Updated dependencies [8c02c30]
- Updated dependencies [f8bd053]
- Updated dependencies [242fb5f]
- Updated dependencies [fd438bc]
- Updated dependencies [bed68e8]
- Updated dependencies [20ecf7d]
- Updated dependencies [b86db00]
  - @ramiidv/arca-common@0.5.0

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
