---
'@ramiidv/arca-common': patch
---

- Una respuesta 2xx sin SOAP Envelope (por ejemplo, el texto plano `BL<id> <fecha> 500` con que WSCPE responde un request que no cumple el XSD, o un body vacío) lanza `ArcaSoapError` con el extracto del body en el mensaje y en `responseBody`. Antes el error no decía qué había respondido el servidor.
- Documentación de `tokenTTLMinutes`: WSAA mide el tope de 24 horas del `expirationTime` desde su propia hora, no desde el `generationTime` del TRA, y cada TA vence 12 horas después de la hora de WSAA.
