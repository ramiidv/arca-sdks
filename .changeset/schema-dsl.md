---
'@ramiidv/arca-common': minor
'@ramiidv/arca-agro': patch
---

Nuevo subpath `@ramiidv/arca-common/schema`: el DSL para describir los tipos
del XSD de un servicio y, con la misma descripción, validar y serializar
requests en el orden del XSD (`encodeRequest`) y decodificar respuestas con
tipos (`decodeResponse`). Nuevo error `ArcaResponseError` (respuesta con forma
inválida, con `uncertain`).

arca-agro usa el DSL de common (`ArcaAgroResponseError` extiende
`ArcaResponseError`) y parsea las respuestas sin conversión numérica: los
`xs:string` con contenido numérico (ej: `"0012"`, `"10.50"`) ya no pierden ceros
ni decimales.
