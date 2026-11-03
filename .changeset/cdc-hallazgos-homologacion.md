---
'@ramiidv/arca-cdc': patch
---

- **Tablas sin resultados**: `getModalidades`, `getTiposCbte`, `getDocTipos` y `getTiposOpcionales` (de `ArcaCdc` y de `CdcClient`) devuelven `[]` cuando ARCA responde el error 503 "Sin Resultados" (por ejemplo, `OpcionalesTipoConsultar` en homologación), en lugar de lanzar `ArcaServiceError`. Cualquier otro error sigue lanzando, y en `constatar()` un 503 sigue siendo `ArcaServiceError`.
- **Eventos con código 0**: ARCA manda `<Events><Evt><Code>0</Code></Evt></Events>` cuando no hay eventos, y el SDK lo exponía como un evento `{ code: 0, msg: '' }`. Ahora se descarta: no aparece en `lista.eventos` de las tablas ni en `eventos` de `constatar()`.
