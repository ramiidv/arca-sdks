---
'@ramiidv/arca-common': minor
'@ramiidv/arca-agro': patch
'@ramiidv/arca-cdc': patch
'@ramiidv/arca-fecred': patch
'@ramiidv/arca-mtxca': patch
'@ramiidv/arca-padron': patch
'@ramiidv/arca-sire': patch
---

DSL de schemas, segunda versión:

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
