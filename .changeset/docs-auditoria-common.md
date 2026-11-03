---
'@ramiidv/arca-common': patch
---

README: sección "Primeros pasos" (certificado con OpenSSL, WSASS, asociación de cada servicio, homologación y producción); errores transitorios de WSAA (HTTP 4xx/5xx sin Fault) y reintentos de consultas (respuesta 2xx sin Envelope); desfase de reloj con y sin `autoClockSkew`; `ArcaTicketVigenteError` extiende `ArcaAuthError` y se chequea antes; `FileTicketStorage`, `normalizeAccessTicket`, `ArcaBaseConfig` y helpers para autores de SDKs (`anySignal`, `safeEmit`, `collectErrors`, `collectErrorsWithPrefix`) documentados. Ejemplos: CBU inválido real, `resetLoginCooldown` solo tras un `ArcaAuthError` no reintentable y errores de servicio con un ejemplo propio.
