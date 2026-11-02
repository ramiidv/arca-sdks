---
'@ramiidv/arca-mtxca': minor
---

Auditoría contra el Manual del desarrollador WSMTXCA v0.25.8.

**Cambios de comportamiento:**

- **FCE MiPyME:** `fechaVencimientoPago` ahora es obligatoria en 201 y 206 y no corresponde en 202, 203, 207 y 208, cualquiera sea el concepto (148/149 en `autorizar`, 764/765 en `informarComprobanteCAEA`). Antes se exigía solo con concepto 2 o 3 y se rechazaba con concepto 1, lo que impedía emitir una FCE de productos.
- **`condicionIVAReceptor` (RG 5616) obligatoria localmente:** `autorizar()` e `informarComprobanteCAEA()` lanzan `ArcaValidationError` si falta (ARCA hoy la observa con 190/390 y pasará a rechazar). En `autorizar()` se puede omitir la validación local con `{ validarImportes: false }`.
- **Redondeo Round Half Even:** los importes, cantidades, precios, bonificaciones y cotizaciones se redondean mitad al par, como indica el manual (`8.565` → `8.56`, `1.005` → `1.00`; antes, mitad hacia afuera: `8.57`, `1.01`). Aplica a lo que se envía, a la validación de importes y a `roundImporte()` / `roundDecimal()`.

Nuevas validaciones locales (citan el código de ARCA): `cancelaEnMismaMonedaExtranjera: 'S'` solo en 1, 6, 51, 201 y 206 (118); descripción de cada tributo en FCE (302); compradores solo con concepto 1 (432) y uno solo en FCE (433); en CAEA no se admiten compradores (753); el IVA de las bonificaciones no puede superar el de su alícuota (516); notas de débito/crédito 2, 3, 7, 8, 52 y 53 con comprobantes asociados o período, no ambos (160/161 en CAE, 778/779 en CAEA).

Nuevo:

- `urlQR()` (método de `ArcaMtxca` y función exportada): URL del código QR (RG 4892) desde el request y el resultado de `autorizar` / `informarComprobanteCAEA`, o desde el comprobante de `consultarComprobante`. Se exportan también `QR_URL` y el tipo `QROptions`.
- `evento` de ARCA: `onEvento(evento, method)` en la configuración (`ArcaMtxcaConfig` y `MtxcaClientConfig`) lo recibe de cualquier respuesta, incluidas las que devuelven un número o una lista; `solicitarCAEA`, `consultarCAEA` y `getCotizacionMoneda` lo incluyen como `evento?` en el resultado.

Documentación: Node >= 20.19 (solo ESM; desde CommonJS con `require()`), reglas de FCE y tabla de reglas validadas, redondeo, SOAP Fault `Client` (no incierto) vs `Server` (incierto) en emisiones, QR y eventos.
