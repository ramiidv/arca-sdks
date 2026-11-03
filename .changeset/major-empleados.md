---
'@ramiidv/arca-empleados': minor
---

**Cambios que rompen compatibilidad** (release de API uniforme entre los SDKs):

- Requiere Node >= 22.12 (antes >= 20.19; Node 20 llegó a fin de vida el 30/04/2026).
- Se quita la constante deprecada `VALORES_MARCA_COVID_CCG`: antes se exportaba (sin usarse para validar) → ahora no existe. La marca de la posición 130 admite `0`–`9`, que ya queda acotado por su formato N(1).
