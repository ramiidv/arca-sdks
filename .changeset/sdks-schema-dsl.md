---
'@ramiidv/arca-cdc': minor
'@ramiidv/arca-fecred': minor
'@ramiidv/arca-mtxca': minor
'@ramiidv/arca-padron': minor
'@ramiidv/arca-sire': minor
---

Requests y respuestas se validan, serializan y decodifican con el DSL de
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
