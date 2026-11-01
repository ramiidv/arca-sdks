---
'@ramiidv/arca-common': minor
'@ramiidv/arca-mtxca': patch
'@ramiidv/arca-cdc': patch
---

`@ramiidv/arca-common/testing` exporta `loadXsdTypes` y `checkSchemaAgainstXsd`
para comparar los schemas del DSL con el XSD de un WSDL oficial. Todos los
schemas de agro, cdc, fecred, mtxca, padron y sire se verifican contra los WSDL
de producción. arca-mtxca: los renombres API ↔ XML usan `xml()` del DSL y un
error en `actividades` se reporta en `actividades[i].codigo`.
