---
'@ramiidv/arca-common': patch
'@ramiidv/arca-facturacion': patch
'@ramiidv/arca-padron': patch
'@ramiidv/arca-agro': patch
'@ramiidv/arca-cdc': patch
'@ramiidv/arca-fecred': patch
'@ramiidv/arca-mtxca': patch
'@ramiidv/arca-sire': patch
---

Documentación: sin indicaciones sobre cómo manejar el repositorio (`.gitignore`) y con el comportamiento de ARCA descripto como tal, sin referencias a cómo se verificó. En sire, el criterio de los SOAP Faults se corrige: solo `XML invalido…` y `Request mal formado` se informan como rechazo; los faults de autenticación son `ArcaAuthError`.
