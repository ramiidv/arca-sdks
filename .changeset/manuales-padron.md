---
'@ramiidv/arca-padron': minor
---

Revisión contra los manuales vigentes (constancia v4.1, A4 v1.3, A10 v1.2, A13 v1.4).

- `TipoDomicilio` agrega `LEGAL_REAL` (`'LEGAL/REAL'`, el valor que informan los manuales) y `LOCALES_Y_ESTABLECIMIENTOS` (A4). `TipoDomicilio.LEGAL`, `TipoDomicilio.REAL` y `EstadoClave.LIMITADO` (no documentado; "limitada" aparece solo en `errorConstancia`) quedan `@deprecated`.
- `condicionIvaDesdePadron`: con `errorConstancia` y sin impuestos de IVA ni monotributo, el motivo es que ARCA no emitió la constancia, aunque haya otros impuestos (antes decía que podía ser consumidor final).
