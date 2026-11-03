---
"@ramiidv/arca-fecred": patch
---

Un SOAP Fault se clasifica como `ArcaAuthError` solo si el código `wscommon_N` es el `faultcode` o aparece al inicio del `faultstring`. Antes bastaba con que se mencionara en cualquier parte del mensaje, y un Fault de negocio o de sistema que lo citara dejaba de ser incierto en las emisiones.
