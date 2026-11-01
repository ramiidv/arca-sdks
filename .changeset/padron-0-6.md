---
'@ramiidv/arca-padron': minor
---

Cambio incompatible: `status()` devuelve, para cada servicio, el `ServiceStatus` de arca-common (`{ ok: true, status }` o `{ ok: false, error }`) en lugar de un `PromiseSettledResult`, igual que agro y facturacion.

```ts
const s = await padron.status();
if (s.a4.ok) console.log(s.a4.status.appserver);
else console.error(s.a4.error);
```

También se quita lo deprecado: `TipoDocumento` (usar `DocTipo`), `ImpuestoId.IVA_NO_INSCRIPTO`, el re-export de `checkServiceErrors` (está en `@ramiidv/arca-common`) y el tipo `ArcaPadronEvent` (usar `ArcaEvent`).

`WsAuth` (credenciales de los clientes de bajo nivel) pasa a camelCase: `{ token, sign, cuitRepresentada }`.
