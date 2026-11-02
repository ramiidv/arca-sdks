---
'@ramiidv/arca-empleados': minor
---

Auditoría contra el manual de Simplificación Registral.

**Cambios de comportamiento:**

- Las propiedades que no son del diseño de registro se rechazan con `ArcaValidationError`, en modo `strict` y no estricto (en `serializarRegistro`, `ArcaSerializationError`). Antes se ignoraban: un nombre mal escrito como `retribucon` u `obraSocal` generaba el registro con el campo vacío.
- `fechaInicio` es obligatoria en todos los movimientos en modo `strict` (`BT`, `MR`, `NA` y `NB` además de `AT`), según la nota de la pantalla de ingreso masivo: "fecha inicio de vínculo son obligatorios para todos los eventos" (manual, pág. 23).
- En modo `strict`, un alta (`AT`) con `fechaInicio` más de 90 días posterior a la fecha de la novedad se rechaza (manual, pág. 18). La fecha de referencia es la de hoy en Argentina, configurable con la nueva opción `fechaReferencia` (también en `validateRegistro(registro, opciones, { fechaReferencia })`).

Otros cambios:

- `validateRegistro` con un movimiento como `"constructor"` o `"toString"` daba `TypeError`; ahora da `ArcaValidationError`.
- `VALORES_MARCA_COVID_CCG` queda deprecado (el campo N(1) ya acota los valores).
- Nuevo tipo `OpcionesValidacion`.
- README: secciones de requisitos (Node >= 20.19, solo ESM, `require(esm)`) y "Convenciones del formato" (relleno de campos vacíos, formato de la retribución, codificación y fin de línea, `NA`/`NB`, marca agropecuaria), y una advertencia sobre los numéricos no informados en `MR`/`BT` con `numericoVacio: 'ceros'` (el default no cambia).
