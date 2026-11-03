---
'@ramiidv/arca-fecred': minor
---

Revisión contra el manual del desarrollador de WSFECRED v2.0.3 (el README ya no dice que no está publicado).

- **Redondeo mitad al par** (Round Half Even, manual §3.3) en todos los importes, por el cambio de `dec()` en common.
- Nuevas validaciones locales de `aceptarFECred`: `informaCBU` y `cbuComprador` van juntos (12013), sin CBU con cancelación total (12012) ni con saldo aceptado 0 (2016), retenciones con `importeTotalRetPesos` > 0 y viceversa (12007), cancelación completa (12008) y cotización 1 con PES (2007, 12000). El porcentaje de una retención es mayor a 0 y menor a 100 (`PorcentajeSimpleType`; antes se aceptaban 0 y 100).
- Códigos repetidos en retenciones (2003), ajustes (2013), formas de cancelación (4002, también en `informarCancelacionTotalFECred`) y motivos de rechazo (3001, en `rechazarFECred` y `rechazarNotaDC`).
- `consultarCtaCte`: `ctaCte` es opcional, como en el XSD; una respuesta sin cuenta corriente (con `evento` u observaciones) ya no se toma como inválida. En TypeScript hay que comprobar `ctaCte` antes de usarlo.
- Las respuestas leen el array de observaciones con cualquiera de los dos nombres (`arrayObservaciones` / `arrayObservacion`), que el manual y el XSD tienen cruzados en algunas operaciones; si vienen los dos, se unen.
- `consultarObligadoRecepcion` queda `@deprecated` (manual §2.4.13): usar `consultarMontoObligadoRecepcion`.
- Nuevo `WSFECRED_ERRORES_REINTENTABLES` (1103, "reinténtelo más tarde").
