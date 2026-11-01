---
'@ramiidv/arca-common': minor
'@ramiidv/arca-facturacion': major
'@ramiidv/arca-padron': minor
'@ramiidv/arca-agro': minor
'@ramiidv/arca-cdc': minor
'@ramiidv/arca-empleados': minor
'@ramiidv/arca-fecred': minor
'@ramiidv/arca-mtxca': minor
'@ramiidv/arca-sire': minor
---

Paquetes solo ESM y Node >= 20.19. `arca-common`, `arca-facturacion` y
`arca-padron` dejan de publicar un build CommonJS: desde CommonJS se cargan con
`require()` (require(esm), Node >= 20.19 / 22.12). Todos los paquetes pasan a
requerir Node >= 20.19.0 (Node 18 y 20 sin soporte). El código vive ahora en el
monorepo `arca-sdks`.
