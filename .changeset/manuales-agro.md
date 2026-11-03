---
'@ramiidv/arca-agro': minor
---

Revisión contra el manual de WSCPE v2.2.1 y el de WSLPG v1.25, con las operaciones que faltaban.

WSCPE:

- **Ediciones:** ARCA anula los CUIT opcionales que no se informan en `editarCPEAutomotor`, `editarCPEFerroviaria` y `editarCPEConfirmada*`. Nueva opción `{ preservarIntervinientes: true }` (`EditarCPEOptions`): valida los datos, consulta la CPE (si la consulta falla, la edición no se envía) y completa con el valor vigente los CUIT no informados; `null` los quita.
- **Derivados granarios (DG):** el circuito completo (automotor DG, ferroviaria DG, emitida en destino DG, ductos DG, pendientes de emisión, `consultarDerivadosGranarios`, `consultarPlantasDG`) y los validadores `validateAutorizarCPEAutomotorDG`, `validateAutorizarCPEFerroviariaDG` y `validateAutorizarCPEEmisionDestinoDG`. `TIPO_CPE` agrega 284 a 287. `autorizarCPEDuctosDG` no se expone: el manual la discontinuó. Los métodos comunes (`informarContingencia`, `anularCPE`, etc.) también sirven para automotor DG, ferroviaria DG y ductos (manual §2.9).
- Nuevas validaciones locales: hasta 3 dominios (2144), código de turno (2244), cosecha de 4 dígitos (2073), formato del RENSPA (2153), motivos de anulación y rechazo 1 a 3 (2220, 2225), motivo de contingencia según el tipo de CPE, también en DG (§4.2), conceptos de cierre y de desactivación A a C, rango de `consultarCPEPorDestino` de hasta 3 días (2152) y, en DG, tipo de domicilio 1 o 3 (2223, 2224), de 1 a 10 precintos (2212) y las reglas de la carga.

WSLPG:

- **Nuevas operaciones:** `lpgAnularContraDocumento` (la anulación vigente), `liquidacionAjustarContrato`, `asociarLiquidacionAContrato`, `lpgAutorizarAnticipo`, `lpgCancelarAnticipo`, `cgInformarCalidad` y la liquidación secundaria (`lsgAutorizar`, `lsgConsultarXCoe`, `lsgConsultarXNroOrden`, `lsgConsultarUltimoNroOrden`, `lsgConsultarXContrato`, `lsgAjustarXCoe`, `lsgAjustarXContrato`, `lsgAsociarAContrato`, `lsgAnularContraDocumento`, `lsgAnular`), con los validadores `validateAjusteContrato`, `validateAutorizarAnticipo`, `validateCgInformarCalidad`, `validateLsgAutorizar`, `validateLsgAjustarXCoe` y `validateLsgAjustarXContrato`.
- `liquidacionAnular` y `lsgAnular` quedan `@deprecated`: el manual los discontinuó en favor de la anulación por contradocumento. La receta de recuperación del README explica que el contradocumento consume un número de orden y queda en estado `PA`.
- **Corrección:** las consultas de listas (`cgBuscarCtg`, `cgBuscarCertConSaldoDisponible`, `liquidacionPorContratoConsultar`, `lsgConsultarXContrato` y las paramétricas) devuelven `[]` cuando el único error que informa WSLPG es el 600 (sin registros, manual §1.7; un 1021 al lado no cambia el resultado), en lugar de lanzar.
- En `asociarLiquidacionAContrato`, `lsgAsociarAContrato` y `cgInformarCalidad` un error de ARCA no es `uncertain`: operan sobre un comprobante existente y el COE de la respuesta es el que se informó.
- Nuevas validaciones locales: códigos de grado (G1-G3, FG, F1-F3), tipo de certificado de depósito `332`, `cgAutorizar` con el bloque que corresponde a su `tipoCertificado`, calidad de `cgInformarCalidad` (3014, 3015, 3017, 3018) y ajustes con crédito y/o débito (3010).

Los decimales se redondean mitad al par (Round Half Even, manual WSLPG §4.2) por el cambio de `dec()` en common.
