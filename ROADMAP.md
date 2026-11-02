# Plan de trabajo

Estado al 2026-11-01 y próximos pasos. Actualizar este archivo cuando se cierre
o se agregue algo.

## Estado actual

Versiones publicadas (release del 2026-11-01, con trusted publishing y provenance):

| Paquete | Versión | Notas |
|---|---|---|
| `@ramiidv/arca-common` | 0.6.0 | `ArcaSdkBase`, `SoapServiceClient`, `/schema` (DSL del XSD), `/testing` (mocks y contratos contra el WSDL) |
| `@ramiidv/arca-facturacion` | 6.0.0 | ESM-only, camelCase, WSFE/WSFEX sobre el DSL |
| `@ramiidv/arca-padron` | 0.6.0 | DSL + contratos, `WsAuth` en camelCase |
| `@ramiidv/arca-agro` | 0.5.0 | DSL + contratos (WSCPE, WSLPG) |
| `@ramiidv/arca-cdc` | 0.5.0 | DSL + contratos, camelCase |
| `@ramiidv/arca-fecred` | 0.5.0 | DSL + contratos, `choice()` de common |
| `@ramiidv/arca-mtxca` | 0.5.0 | DSL + contratos |
| `@ramiidv/arca-sire` | 0.4.1 | DSL + contratos |
| `@ramiidv/arca-empleados` | 0.4.1 | Genera un TXT, no usa SOAP |

Todos los SDKs con web service extienden `ArcaSdkBase`, así que comparten
configuración, `wsaa`, `cuit`, `production`, `on`/`off`, `config.wsaa`,
`config.signal` y `clearAuthCache()`.

Rama `fix/auditoria` (sin publicar): auditoría de todos los paquetes contra los
manuales de ARCA. Bugs (monedas 029/031 invertidas, error 550 de WSCPE, FCE en
WSFE y WSMTXCA, reproceso de WSFEX), manejo de errores de WSAA según la
especificación, helpers compartidos en common, documentación y CI. Ver los
changesets `*-auditoria.md`.

## Pendientes operativos

- [ ] Redesplegar arca-server con los SDKs nuevos. Para subir a facturacion 6 /
      padron 0.6: `src/routes/afip.ts` (`padron.status()` devuelve
      `ServiceStatus`) y `tests/arca-sdk.test.ts` (`Arca` → `ArcaFacturacion`).
- [ ] Commitear los cambios de la landing en `ramiidv/arca-sdk-web`.
- [ ] Cargar en el repo los secrets `ARCA_TEST_CERT`, `ARCA_TEST_KEY` y
      `ARCA_TEST_CUIT`, y la variable `ARCA_TEST_SERVICES`.

## Próximos pasos técnicos

### 1. Próxima major: API uniforme entre paquetes

- Clientes de bajo nivel con la misma configuración (`SoapServiceClientConfig`:
  `{ endpoint, transport? }`): hoy cdc, sire, mtxca, fecred, padron y
  facturacion usan formas distintas.
- Rechazos uniformes: mtxca devuelve `resultado: 'R'`, fecred lanza.
- Respuesta inválida: facturacion, cdc, padron y agro ya lanzan
  `ArcaResponseError` (vía `decodeResponse({ kind })`); mtxca, fecred y sire
  siguen con `ArcaSoapError` (`uncertain` en emisiones) para no romper los
  `catch` existentes. Unificar en la major.
- cdc `constatar()` devuelve `events`; las tablas, `eventos`.
- Constantes de endpoints con la misma forma en todos los paquetes.
- Quitar los alias deprecados (`afipSoapCall`, `parseAfipDate`, re-exports de
  padron).

### 2. Mantenimiento

- Cuando Node 20 deje de usarse en la práctica, subir `engines` a `>=22.12`,
  sacar 20.19 de la matriz de CI y pasar a vitest 5.
- `@ramiidv/arca-common` sigue como `dependency` (no `peerDependency`): con
  rangos `^0.x`, un peer obliga a changesets a publicar una major de cada SDK
  en cada minor de common. Revisar cuando common llegue a 1.0.

## Cómo publicar

1. Cada PR que cambia un paquete publicado agrega un changeset
   (`npm run changeset`), con patch, minor o major por paquete. Si cambia la
   API pública, `npm run api:update` y commitear el `.api.md`: el diff ayuda a
   elegir el tipo de cambio.
2. Al mergear a `main`, el workflow Release abre o actualiza el PR "chore:
   version packages", con versiones, CHANGELOGs y rangos internos.
3. Al mergear ese PR, el workflow publica en npm con trusted publishing (OIDC),
   en orden de dependencias, y crea los tags y los GitHub Releases.

Notas:

- Hace falta `changesets/action@v2` con `@changesets/cli` v3. Con la v1, la
  publicación funciona pero no se crean los tags ni los releases.
- El repo necesita el permiso "Allow GitHub Actions to create and approve pull
  requests".
- El trusted publisher de cada paquete en npmjs.com apunta a este repo y a
  `release.yml`. Un paquete nuevo hay que publicarlo una vez a mano (o
  configurarle el trusted publisher antes) para que el workflow pueda.
- Los PRs que abre Actions no disparan CI; su contenido es el de `main` más el
  versionado.

## Gotchas conocidos

- **TLS legacy:** la producción de WSFEv1, WSFEX y WSCDC (`servicios1.afip.gov.ar`)
  negocia DH de 1024 bits. Node >= 17 lo rechaza con `ERR_SSL_DH_KEY_TOO_SMALL`.
  `legacyTls: 'auto'` reintenta con `ciphers: 'DEFAULT@SECLEVEL=1'`.
- **Emisiones:** toda llamada que puede crear algo va con `kind: 'emision'`.
  Nunca se reintenta, y si no hay certeza el error lleva `uncertain: true`.
- **Respuestas decodificadas con el DSL:** siempre con `parseNumbers: false`.
- **WSDL:** `npm run wsdl:check` (nightly en CI) avisa si ARCA cambió un
  servicio; `npm run wsdl:update` actualiza los snapshots de `packages/*/wsdl/`.
  Se usan los WSDL de producción: el de homologación de WSMTXCA está roto.
- **Manuales:** las restricciones que el XSD no tiene (largos, rangos, tablas)
  vienen de los manuales de cada servicio. Están en los schemas, más
  estrictos que el contrato, y los tests de contrato lo permiten.
- **Biome:** formatea también YAML y JSON (no Markdown). Correr
  `npm run lint:fix` antes de commitear workflows.
