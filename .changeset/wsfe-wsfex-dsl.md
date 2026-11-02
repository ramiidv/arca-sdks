---
'@ramiidv/arca-facturacion': minor
---

WSFEv1 y WSFEX sobre el DSL de schemas de `@ramiidv/arca-common/schema`, con tests de contrato contra `wsdl/wsfev1.wsdl` y `wsdl/wsfexv1.wsdl`.

- Respuestas: se piden como texto (`parseNumbers: false`) y se decodifican según el WSDL. Los `xs:string` conservan los ceros y los decimales (por ejemplo `MonId` `"060"`, CAE con cero inicial). Los `xs:long` llegan como `number`, como dicen sus tipos (`DocNro`, `FeCabResp.Cuit`, `CbteDesde` de 8 o más dígitos antes llegaban como string). Las listas de las respuestas crudas mantienen la forma `X | X[]` del XML.
- Una respuesta con forma inválida (un número que no es numérico, un obligatorio que falta) lanza `ArcaSoapError` en las consultas y `ArcaResultadoIncierto`/`ArcaResultadoInciertoExpo` en las emisiones.
- Requests: `buildDetRequest`, `buildFexCmp` y todas las consultas validan el tipo de cada campo y lo ordenan según el WSDL antes de llamar a ARCA (`ArcaValidationError` con la ruta, por ejemplo `FeDetReq[0].DocNro`). Las fechas aceptan `AAAAMMDD` o `AAAA-MM-DD`.
