---
"@ramiidv/arca-cdc": patch
---

`CdcClient` deja de exponer `constatarCmpReq`, un método interno que enviaba el `CmpReq` sin validar. Usá `constatar(auth, input)`, que valida el input antes de llamar a ARCA.
