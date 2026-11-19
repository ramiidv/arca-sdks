---
"@ramiidv/arca-padron": patch
---

- `getConstanciasInscripcion` (`getPersonaList`) devuelve una persona por cada elemento de `cuits`, en su orden. Una CUIT repetida se consulta una sola vez y la misma persona aparece en cada posición. Una CUIT de la que ARCA no devuelve datos vuelve con `errorConstancia.error = ['ARCA no devolvió datos para esta CUIT.']`. Antes, esas CUITs se descartaban sin aviso y el resultado quedaba más corto que `cuits`.
- `getConstanciaInscripcion`, `getPersona`, `getPersonaBasic`, `getPersonaA13`, `getPersonaA13V2`, `getIdPersonaListByDocumento` y `getConstanciasInscripcion` validan la CUIT, el documento o la cantidad de CUITs antes de pedir el ticket a WSAA: un dato inválido lanza `ArcaValidationError` sin hacer ningún request.
