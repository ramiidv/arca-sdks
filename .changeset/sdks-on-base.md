---
'@ramiidv/arca-agro': minor
'@ramiidv/arca-cdc': minor
'@ramiidv/arca-facturacion': minor
'@ramiidv/arca-fecred': minor
'@ramiidv/arca-mtxca': minor
'@ramiidv/arca-padron': minor
'@ramiidv/arca-sire': minor
---

Las clases principales extienden `ArcaSdkBase` de arca-common, así que todos
los SDKs tienen la misma base: `wsaa`, `cuit`, `production`, `on()`/`off()`,
`clearAuthCache()`, `config.wsaa` (WsaaClient compartido) y `config.signal`
(signal global). arca-mtxca acepta `endpoints: { mtxca, wsaa }` (`endpoint` y
`wsaaEndpoint` quedan deprecados). Los `dummy`/`status` validan la respuesta con
`parseServerStatus`: si falta un campo lanzan `ArcaSoapError`.
