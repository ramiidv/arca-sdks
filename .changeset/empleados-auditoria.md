---
"@ramiidv/arca-empleados": patch
---

- Con `noRepresentables: 'transliterar'` solo se les quita el diacrítico a los caracteres que no entran en el encoding. Antes, uno solo de esos caracteres hacía transliterar el texto entero. Por ejemplo, en latin1, `'Ñandú ő'` ahora queda `'Ñandú o'` en vez de `'Nandu o'`.
- `new ArcaEmpleados({ fechaReferencia })` con una fecha inválida lanza `ArcaValidationError` (`details[0].field === 'fechaReferencia'`), igual que `validateRegistro`, en lugar de `TypeError`.
- `llms.txt`: requisitos (Node >= 22.12, solo ESM).
