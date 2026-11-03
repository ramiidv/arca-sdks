---
'@ramiidv/arca-facturacion': major
---

**Cambios que rompen compatibilidad** (release de API uniforme entre los SDKs):

- Requiere Node >= 22.12.
- **Los rechazos lanzan `ArcaRechazoError`** (de `@ramiidv/arca-common`, `code` `ARCA_RECHAZO`, extiende `ArcaServiceError`; también se exporta desde este paquete). `facturar`, `notaCredito`, `notaDebito`, `registrarFacturaCAEA` y `facturarExpo` devuelven siempre un comprobante autorizado; si ARCA responde `Resultado` "R", lanzan el error con `operacion` (`'FECAESolicitar'`, `'FECAEARegInformativo'` o `'FEXAuthorize'`), `errors` y `observaciones` (`{ code, msg }[]`). En WSFEv1 los motivos vienen en `observaciones` (las `Obs` del comprobante); en WSFEX, `Motivos_Obs` como `{ code: 0, msg }`.
  - Antes: `const r = await arca.facturar(opts); if (!r.aprobada) console.error(r.observaciones);`
  - Ahora: `try { const r = await arca.facturar(opts); } catch (e) { if (e instanceof ArcaRechazoError) console.error(e.observaciones); else throw e; }`
  - Exportación: antes `if (!res.aprobada) console.error(res.obs)` → ahora `catch (e) { if (e instanceof ArcaRechazoError) console.error(e.observaciones[0]?.msg) }`.
- **`sinMovimientoCAEA`** lanza `ArcaRechazoError` (`operacion: 'FECAEASinMovimientoInformar'`) si ARCA responde `Resultado` "R". Antes: devolvía `{ resultado: 'R' }` → ahora el valor devuelto siempre tiene `resultado: 'A'`.
- **Se quita `aprobada`** de `FacturaResult` y `FacturaExpoResult` (siempre `true`), y **`cae` pasa a ser obligatorio** (`string`). Antes: `if (r.aprobada) usar(r.cae!)` → ahora: `usar(r.cae)`. En `registrarFacturaCAEA`, `cae` es el CAEA (si la respuesta no lo repite, el informado).
- Una respuesta **aprobada sin CAE** (o con un `Resultado` desconocido) de `facturar`, `notaCredito`, `notaDebito` o `registrarFacturaCAEA` lanza `ArcaResultadoIncierto` (con `intento`, resolver con `recuperarComprobante`). Antes: devolvía `aprobada: true` sin `cae`. (`facturarExpo` ya lanzaba `ArcaResultadoInciertoExpo`.)
- **`requiereRecuperacion(error: unknown)`** recibe el error lanzado, no el resultado. Antes: `requiereRecuperacion(res)` con un `FacturaResult` rechazado → ahora: `catch (e) { if (requiereRecuperacion(e)) ... }` (10016 por número en un `ArcaRechazoError` de `FECAESolicitar`, 703 en uno de `FECAEARegInformativo`, o esos códigos en un `ArcaWSFEError`; cualquier otro valor da `false`).
- **`recuperarComprobante`**: si el número existe con los datos del intento pero ARCA lo informa rechazado, lanza `ArcaRechazoError` (`operacion: 'FECompConsultar'`). Si coinciden los datos pero el `Resultado` es desconocido o falta `CodAutorizacion`, lanza `ArcaResponseError`. Antes: en ambos casos devolvía `{ estado: 'conflicto' }`. Con otros datos sigue siendo `conflicto`.
- **`facturaResultDesdeConsulta`** lanza `ArcaRechazoError` si el comprobante consultado está rechazado y `ArcaResponseError` si el `Resultado` no es "A" ni "R" o si no tiene `CodAutorizacion`. Antes: devolvía `aprobada: false` / `cae: undefined`.
- **`urlQRDesdeFactura` / `urlQR`**: ya no miran `aprobada` (los resultados siempre están autorizados); solo validan que haya `cae` (`ArcaValidationError` en `factura.cae`).
- El mensaje de `ArcaWSFEError` separa los errores con comas, como el resto de los SDKs (`[10016] ..., [10048] ...`; antes `; `).
- **Clientes de bajo nivel**: se construyen con `ServiceClientConfig` de arca-common (`{ endpoint, transport? }`). Se quita `WsClientOptions`.
  - Antes: `new WsfeClient(false, { timeoutMs: 60_000, endpoint })` / `new WsfexClient(true)`
  - Ahora: `new WsfeClient({ endpoint: ENDPOINTS.wsfe.testing, transport: { timeout: 60_000 } })` / `new WsfexClient({ endpoint: ENDPOINTS.wsfex.production })`.
  - Los clientes de bajo nivel y la API raw (`crearFactura`, `crearFacturaAuto`, `registrarCAEA`, `crearFacturaExportacion`) siguen devolviendo la respuesta de ARCA tal cual: un comprobante con `resultado` "R" (o un lote "P") no lanza.

Nuevo:

- `ENDPOINTS` se declara `satisfies Record<string, ServiceEndpoints>` (`{ wsfe, wsfex }`, cada uno `{ testing, production }`; mismas claves que `config.endpoints`).
- Se reexportan `ArcaRechazoError` y los tipos `ServiceErrorDetail`, `ServiceClientConfig`, `ServiceEndpoints` y `ServiceTransport` de arca-common.
