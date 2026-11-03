# Plan de trabajo

Estado al 2026-11-03 y próximos pasos. Actualizar este archivo cuando se cierre
o se agregue algo.

## Estado actual

Versiones publicadas (2026-11-03, con trusted publishing y provenance):

| Paquete | Versión | Notas |
|---|---|---|
| `@ramiidv/arca-common` | 0.9.1 | `ArcaSdkBase`, `SoapServiceClient`, `/schema` (DSL del XSD), `/testing`, QR, certificados, `ArcaRechazoError` |
| `@ramiidv/arca-facturacion` | 7.0.1 | WSFEv1, WSFEX, CAEA y QR sobre el DSL |
| `@ramiidv/arca-padron` | 0.9.0 | Constancia, A4, A10, A13, A100 |
| `@ramiidv/arca-agro` | 0.8.1 | WSCPE (con derivados granarios), WSLPG (liquidación primaria y secundaria) |
| `@ramiidv/arca-cdc` | 0.8.1 | WSCDC |
| `@ramiidv/arca-fecred` | 0.8.0 | WSFECRED |
| `@ramiidv/arca-mtxca` | 0.8.1 | WSMTXCA |
| `@ramiidv/arca-sire` | 0.7.1 | SIRE C2005 |
| `@ramiidv/arca-empleados` | 0.6.0 | Genera un TXT, no usa SOAP |

Todos los SDKs con web service extienden `ArcaSdkBase`, así que comparten
configuración, `wsaa`, `cuit`, `production`, `on`/`off`, `config.wsaa`,
`config.signal` y `clearAuthCache()`. Todos dependen de `@ramiidv/arca-common`
^0.9 (los que cambiaron en la última release, de ^0.9.1): para compartir el
`WsaaClient` hay que actualizarlos juntos.

La última release (PR #19) corrigió lo que ARCA homologación contradijo:
alícuotas 5% y 2,5% y reglas 145/162 en mtxca, tablas vacías y eventos de
código 0 en cdc, faults de autenticación de SIRE, consultas sin resultados en
facturacion (602/10102) y agro (800), reglas de `liquidacionAutorizar`, y el
extracto del body en el error de una respuesta 2xx sin SOAP Envelope.

La anterior (PR #16) unificó la API entre los paquetes: Node >= 22.12;
los rechazos de ARCA (`resultado` R) lanzan `ArcaRechazoError`; clientes de bajo
nivel con `{ endpoint, transport? }`; `ENDPOINTS` con la misma forma en todos los
paquetes; `ArcaResponseError` ante una respuesta inválida; `formatServiceErrors`
para los mensajes de error de ARCA; sin los alias ni las operaciones deprecadas.
Antes, la PR #15 salió de una revisión contra los manuales vigentes de cada
servicio.

## Próximos pasos técnicos

### Mantenimiento

- `@ramiidv/arca-common` sigue como `dependency` (no `peerDependency`): con
  rangos `^0.x`, un peer obliga a changesets a publicar una major de cada SDK
  en cada minor de common. Revisar cuando common llegue a 1.0.
- Cuando un manual discontinúe una operación que siga en el WSDL, marcarla
  `@deprecated` y quitarla en la major siguiente.
- `@types/node` sigue la Node mínima de `engines.node` (hoy 22): `npm run lint`
  falla si las majors no coinciden (`scripts/check-types-node.mjs`) y Dependabot
  no propone sus majors. Al subir la Node mínima, subir los dos juntos.

## Cómo publicar

1. Cada PR que cambia un paquete publicado agrega un changeset
   (`npm run changeset`), con patch, minor o major por paquete. Si cambia la
   API pública, `npm run api:update` y commitear el `.api.md`: el diff ayuda a
   elegir el tipo de cambio.
2. Al mergear a `main`, el workflow Release abre o actualiza el PR "chore:
   version packages", con versiones, CHANGELOGs y rangos internos.
3. Al mergear ese PR, el workflow compila y empaqueta los paquetes en un job
   sin permisos de escritura, y el job `publish` espera la aprobación del
   environment `npm-publish`. Aprobado, publica esos tarballs en npm con
   trusted publishing (OIDC), en orden de dependencias, y crea los tags y los
   GitHub Releases.

Notas:

- Hace falta `changesets/action@v2` con `@changesets/cli` v3. Con la v1, la
  publicación funciona pero no se crean los tags ni los releases. `release.yml`
  usa sus sub-actions (`select-mode`, `version`, `pack`, `publish`) para que
  solo el job que publica tenga `id-token: write`.
- El environment `npm-publish` (Settings > Environments) requiere aprobación
  manual y solo admite la rama `main`. Mientras no esté creado con esas
  reglas, GitHub lo crea al vuelo sin protección y la publicación no espera.
- Las actions están fijadas por SHA de commit, con la versión en un
  comentario. Dependabot (`.github/dependabot.yml`) abre como mucho un PR por
  mes por ecosistema: las actions juntas, y npm con minor y patch de todas las
  dependencias (las de seguridad, en otro PR agrupado). Las major no las
  propone: se hacen a mano.
- Node 24.22 trae npm 11.19.1. Trusted publishing requiere npm >= 11.5.1:
  revisarlo si se cambia `node-version` en `release.yml`.
- El repo necesita el permiso "Allow GitHub Actions to create and approve pull
  requests".
- El trusted publisher de cada paquete en npmjs.com apunta a este repo y a
  `release.yml`; si además declara el environment `npm-publish`, npm rechaza
  publicaciones que no pasen por la aprobación. Un paquete nuevo hay que
  publicarlo una vez a mano (o configurarle el trusted publisher antes) para
  que el workflow pueda.
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
