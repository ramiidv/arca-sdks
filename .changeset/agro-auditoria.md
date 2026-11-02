---
'@ramiidv/arca-agro': minor
---

Auditoría contra el Manual WSCPE v2.0.3 y el Manual WSLPG.

**Cambio de comportamiento: errores admitidos (WSCPE 550, WSLPG 1021).** "Error al generar el archivo pdf" no cancela la operación (estado Aceptada, manual WSCPE §2.4 y §2.6). Antes se lanzaba `ArcaAgroServiceError` y una CPE o liquidación ya autorizada parecía rechazada (reintentarla podía duplicarla). Ahora el método devuelve el resultado, sin `pdf`, con el error en el nuevo campo `advertencias: ServiceErrorDetail[]` (presente solo si hubo). Si viene junto con otro error, se sigue lanzando con todos.

Errores e incertidumbre:

- `ArcaAgroServiceError` tiene `uncertain`: es `true` en una emisión cuya respuesta trae errores **y también** el resultado (`cabecera.nroCTG`/`cabecera.estado` en WSCPE; `autorizacion.coe`, `ajusteUnificado.coe` o `resultado: 'A'` en WSLPG). Consultá antes de reintentar.
- Un `<error>` sin código (o con código vacío) ahora cuenta como error; solo se ignora el código explícito `0`.
- `liquidacionAnular` lanza `ArcaAgroServiceError` si ARCA responde `resultado: 'R'` (rechazada).
- `resultado` de `liquidacionAnular` y `estadoCertificado` de `cgSolicitarAnulacion`/`cgConfirmarAnulacion` son opcionales (`minOccurs=0` en el XSD): si no vienen, la anulación ya no termina en un `ArcaAgroResponseError` incierto. Los tipos pasan a `resultado?: 'A' | 'R' | string` y `estadoCertificado?: string`.
- En las emisiones, un campo secundario de la respuesta con forma inválida se omite en lugar de volver incierta una operación aceptada; solo la falta del identificador (`nroCTG`, `coe`) es incierta.
- Nuevo `cpeFaultException(error)`: lee el `Exception` (`businessErrorId`, `uuid`, ...) del SOAP Fault de WSCPE desde `ArcaSoapError.faultDetail`.

Nuevas operaciones:

- WSLPG, para recuperar emisiones inciertas: `cgConsultarXNroOrden`, `cgConsultarXCoe`, `ajusteXNroOrdenConsultar`, `ajusteXCoeConsultar`. También `ajustePorContratoConsultar`, `liquidacionPorContratoConsultar`, `cgBuscarCtg` y `cgBuscarCertConSaldoDisponible`.
- WSCPE: `consultarRenspa`, `consultarDomiciliosPorCUIT`, `consultarTiposEmbalaje` y `consultarUnidadesMedida`.
- Validadores: `validateCgAutorizar`, `validateEditarCPEAutomotor`, `validateEditarCPEFerroviaria`, `validateEditarCPEConfirmada`, `validateConfirmacionDefinitivaCPEAutomotor` y `validateConfirmacionDefinitivaCPEFerroviaria`.
- Se reexportan `FileTicketStorage`, `MemoryTicketStorage` y `WsaaClient`.

Otros:

- `cgAutorizar`: `cabecera.cuitCorredor` acepta `0` (sin corredor, `LpgCuit0Type`); una CUIT distinta de 0 se sigue validando.
- README y llms.txt reescritos: recetas de recuperación corregidas (certificación con `cgConsultarXNroOrden`; ajuste con `liquidacionUltimoNroOrdenConsultar` + `ajusteXNroOrdenConsultar`, que comparten el contador; en WSCPE, comparar los datos de la CPE consultada antes de darla por propia), lista de operaciones no implementadas y nota sobre el formato `dateTime`. Los ejemplos hacen el arribo y la confirmación con la instancia del destino.
