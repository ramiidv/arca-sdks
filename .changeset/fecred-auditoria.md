---
"@ramiidv/arca-fecred": patch
---

- Un SOAP Fault cuyo `faultcode` es `wscommon_*` se informa como `ArcaAuthError` aunque no traiga `faultstring`.
- Los `ArcaResponseError` por respuestas inválidas ya no llevan el prefijo `WSFECRED:` en el mensaje (el resto no cambia: `uncertain` sigue siendo `true` solo en las operaciones que cambian estado).
