---
"@ramiidv/arca-agro": minor
---

- `consultarCPEFerroviaria` y `autorizarCPEFerroviaria` aceptan una `transporte.tarifa` con decimales (ej: `1500.50`). Antes, la consulta lanzaba `ArcaAgroResponseError` ("no es entero").
- WSCPE: un rechazo de una operación sobre una CPE que ya existe (ediciones, anulación, desvíos, confirmaciones, contingencias, etc.) ya no sale con `uncertain: true` porque la respuesta traiga la cabecera: esa cabecera es la de la CPE sobre la que se operó. Las autorizaciones siguen marcando `uncertain` cuando la respuesta trae errores y la CPE.
- `cgSolicitarAnulacion` y `cgConfirmarAnulacion` lanzan `ArcaAgroResponseError` con `uncertain: true` si la respuesta no trae `oReturn` o lo trae vacío, en lugar de dar la anulación por hecha. Verificá con `cgConsultarXCoe`. Una respuesta con datos pero sin `estadoCertificado` (opcional en el XSD) se sigue aceptando.
- `liquidacionPorContratoConsultar`, `lsgConsultarXContrato` y `asociarLiquidacionAContrato` lanzan `ArcaAgroResponseError` si la respuesta no trae el elemento con el resultado, en lugar de devolver `[]` (o un resultado vacío) sin avisar. Un elemento vacío sigue siendo una lista sin resultados.
- `ArcaAgroResponseError` acepta `{ cause }` como tercer parámetro (opcional). Cuando una emisión aceptada trae la respuesta incompleta, el error conserva en `cause` el error original.
- Nuevo tipo `AgroServiceName` (`'WSCPE' | 'WSLPG'`), el de `ArcaAgroServiceError.service`.
- Docs: el ejemplo de recuperación de una CPE incierta toma una fecha/hora sin zona horaria como hora de Argentina (`-03:00`) al comparar `fechaHoraPartida`. Antes, en un servidor con otra zona horaria, podía concluir que otra CPE había usado el número de orden.
