---
'@ramiidv/arca-common': minor
---

Revisión contra los manuales vigentes de ARCA (WSAA, especificación del QR y los manuales de cada servicio).

**Cambio de comportamiento: redondeo mitad al par.** `dec()` (y por lo tanto `importe()`, `porcentaje()` y todos los decimales de los SDKs) redondea con Round Half Even, el método que indican los manuales de WSFEv1, WSFEX, WSMTXCA, WSFECRED y WSLPG: `1.005` → `1.00`, `1.015` → `1.02`. Antes redondeaba mitad hacia arriba. `generarUrlQR` redondea `importe` y `ctz` igual.

**Cambio de comportamiento: `coe.alreadyAuthenticated`.** Según el manual del desarrollador de WSAA (§10.6), WSAA rechaza los pedidos repetidos durante un lapso de retención de 2 minutos en producción y 10 en homologación, no hasta que venza el TA. `ArcaTicketVigenteError` pasa a ser `retryable: true` y trae `retryAfterMs`. Durante la nueva espera `alreadyAuthenticatedCooldownMs` (default: ese lapso; también en `ArcaBaseConfig`) `getAccessTicket` lo vuelve a lanzar sin llamar a WSAA, en lugar de pedir un TA en cada llamada.

WSAA:

- Con `tokenTTLMinutes: 1440` el TRA vence 24 horas después de su `generationTime` (que es 2 minutos anterior a la hora actual), en lugar de 1442 minutos, que WSAA rechaza.
- El nombre del servicio tiene que empezar con una letra, como exige el XSD del TRA.

DSL y helpers:

- `datetime()` exige los segundos (`xsd:dateTime`).
- `str()` rechaza los caracteres que XML 1.0 no admite (controles salvo tab, LF y CR; U+FFFE y U+FFFF) y los surrogates UTF-16 sueltos.
- `buildXml`/`arcaSoapCall` envían un `Date` como `xsd:dateTime` en hora de Argentina (antes, `Date.toString()`).
- `validateCuit`/`normalizeCuit` ya no le quitan el punto decimal a un `number` (`2012345678.6` no es un CUIT válido).
- `generarUrlQR` valida los largos de la especificación: `tipoCmp` de hasta 3 dígitos, `moneda` de 3 caracteres, `tipoDocRec` entero de hasta 2 dígitos, `importe` y `ctz` de hasta 13 enteros. `nroDocRec` acepta hasta 20 dígitos (como string) sin perder precisión.
- Nuevo `DocTipo.FONDO_COMUN_INVERSION_CNV` (31).
- Nuevo `diasEntre(desde, hasta)`: días de calendario de Argentina entre dos fechas.
- `list()`/`wrapped()` aceptan un máximo de elementos (`maxItems`), que se verifica en requests.
- `/testing`: `checkSchemaAgainstXsd` resuelve la herencia (`complexContent/extension`) también en tipos anónimos; `soapFault` escapa `faultCode` y `faultString`.
