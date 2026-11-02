---
'@ramiidv/arca-common': minor
---

DSL de schemas y comparador de contratos:

- `choice(schema)`: `xsd:choice` nativo. En un request tiene que venir exactamente una opción; en una respuesta, al menos una (un elemento vacío es inválido).
- `str({ pattern, patternMessage })`: mensaje propio cuando no se cumple el `pattern`.
- `encodeRequest`: los errores de `extraCheck` se intercalan con los del schema según el orden de los campos (antes iban al final).
- `checkSchemaAgainstXsd`: los elementos de un `xsd:all` no tienen orden, y un `xsd:choice` del XSD tiene que ser `choice()` en el schema (y al revés).
