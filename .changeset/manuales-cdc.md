---
'@ramiidv/arca-cdc': minor
---

Revisión contra el manual de WSCDC v0.4: nuevas validaciones locales de `constatar()`. El receptor es obligatorio y con CUIT (80) en los comprobantes A, A con leyenda y MiPyME (113, 114); en los comprobantes T (195, 196, 197) solo se admiten los documentos 80, 91, 94 o 96 (118), y la fecha no puede ser anterior al 01/01/2013 (101). `ImpTotal` se redondea mitad al par, como indica el manual (§2.8).
