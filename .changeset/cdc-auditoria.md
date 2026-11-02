---
'@ramiidv/arca-cdc': minor
---

Auditoría contra el manual de WSCDC v4.

**Cambios de comportamiento:**

- Una respuesta con forma inesperada (sin `Resultado`, `Resultado` desconocido, datos inválidos) lanza `ArcaResponseError` (`uncertain: false`; exportado desde este paquete) en lugar de `ArcaSoapError`.
- En un rechazo funcional (`resultado: 'R'`) con `CmpResp` incompleto, `constatar` devuelve `resultado` y `observaciones` sin `cmpResp` en lugar de lanzar.
- Las tablas de parámetros aceptan ítems sin `Desc` (`minOccurs=0` en el WSDL): `desc` queda como `''`.
- `CdcClient` valida la CUIT de `auth` (dígito verificador) y la envía normalizada; una inválida lanza `ArcaValidationError` sin llamar a ARCA.

Nuevo:

- Los `Events` de las tablas de parámetros quedan en `lista.eventos` (propiedad no enumerable; tipo `ListaCdc<T>`). `constatar` ya los devolvía en `events`.
- `ArcaCdc.constatar` valida el input una sola vez, antes de autenticarse.

Documentación: ejemplos de JSDoc, README y `llms.txt` con la API en camelCase (`cbteModo`, `cuitEmisor`, `resultado`, `docNroReceptor`), Node >= 20.19 (solo ESM), `ArcaSdkConfig` (`wsaa`, `signal`, `keyPassphrase`), sin versiones fijas; `llms.txt` en español.
