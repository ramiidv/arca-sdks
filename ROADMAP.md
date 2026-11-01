# Plan de trabajo

Estado al 2026-11-01 y próximos pasos. Actualizar este archivo cuando se cierre
o se agregue algo.

## Estado actual

Primera versión publicada desde el monorepo (con trusted publishing y provenance):

| Paquete | Versión | Notas |
|---|---|---|
| `@ramiidv/arca-common` | 0.5.0 | `ArcaSdkBase`, `SoapServiceClient`, `/schema` (DSL del XSD), `/testing` (mocks y contratos contra el WSDL) |
| `@ramiidv/arca-facturacion` | 5.0.0 | ESM-only. WSFE/WSFEX todavía sin el DSL |
| `@ramiidv/arca-padron` | 0.5.0 | DSL + contratos |
| `@ramiidv/arca-agro` | 0.4.0 | DSL + contratos (WSCPE, WSLPG) |
| `@ramiidv/arca-cdc` | 0.4.0 | DSL + contratos |
| `@ramiidv/arca-fecred` | 0.4.0 | DSL + contratos |
| `@ramiidv/arca-mtxca` | 0.4.0 | DSL + contratos |
| `@ramiidv/arca-sire` | 0.4.0 | DSL + contratos |
| `@ramiidv/arca-empleados` | 0.4.0 | Genera un TXT, no usa SOAP |

Todos los SDKs con web service extienden `ArcaSdkBase`, así que comparten
configuración, `wsaa`, `cuit`, `production`, `on`/`off`, `config.wsaa`,
`config.signal` y `clearAuthCache()`.

## Pendientes operativos

- [ ] Desplegar arca-sdk.dev (`~/projects/arca-sdk-web/landing`). Ya está
      actualizado y compilado con las versiones nuevas, los links al
      monorepo, `ArcaFacturacion` y Node 20.19+; falta `npx vercel deploy --prod`.
- [ ] Mergear en arca-server la branch `chore/sdks-nuevas-versiones`, que sube
      todos los SDKs a estas versiones (typecheck, tests y build verificados) y
      después redesplegar.
- [ ] Archivar los 9 repos anteriores (`ramiidv/arca-common`,
      `ramiidv/arca-facturacion`...) con un aviso en su README que apunte acá.
- [ ] Opcional: `npm deprecate` de las versiones anteriores al monorepo, con un
      mensaje que indique la versión nueva.

## Próximos pasos técnicos

En orden de prioridad.

### 1. facturacion: WSFE y WSFEX sobre el DSL

Es el paquete más usado y el único que todavía serializa y parsea a mano
(`src/wsfe.ts`, `src/wsfex.ts`, `src/facturacion.ts`, `src/validation.ts`).

- Describir los requests y respuestas con `@ramiidv/arca-common/schema`. Son
  servicios ASMX: elementos `qualified`, nombres en PascalCase y fechas
  `AAAAMMDD` (`date8()`).
- Pedir las respuestas con `parseNumbers: false` y decodificarlas con el
  schema. Hoy no se pierden datos porque los campos largos (CAE, CUIT, fechas)
  quedan como string por `skipLike`, pero los códigos y descripciones cortos
  pueden perder ceros y decimales.
- Agregar `tests/contract.test.ts` contra `wsdl/wsfev1.wsdl` y
  `wsdl/wsfexv1.wsdl`, como en los otros paquetes.
- Mantener la API pública. Es un minor.

### 2. Próximas majors: quitar lo deprecado

| Paquete | Qué se quita | Reemplazo |
|---|---|---|
| facturacion 6.0 | `Arca` | `ArcaFacturacion` |
| facturacion 6.0 | `serverStatus()`, `serverStatusExpo()` y su `ServerStatus` en mayúsculas | `status()` |
| facturacion 6.0 | `src/padron.ts`, `consultarCuit`, `consultarCuitDetalle`, `endpoints.padronA5/A13` | `@ramiidv/arca-padron` |
| facturacion 6.0 | `requestTimeoutMs` | `timeout` |
| agro 0.5 | `serverStatus()` | `status()` |
| fecred 0.5 | `ArcaFecred.fecred`, `FecredClientConfig.soapOptions`/`onEvent` | `client`, `transport` |
| mtxca 0.5 | `endpoint`, `wsaaEndpoint` | `endpoints: { mtxca, wsaa }` |
| padron 0.6 | `status()` con `PromiseSettledResult` | `status()` con `ServiceStatus` (`statusOf` de common), igual que agro y facturacion |

En facturacion 6.0, revisar también la convención de nombres. cdc usa los
nombres de AFIP (`CbteModo`, PascalCase) y padron tiene métodos en inglés
(`getConstanciaInscripcion`). Decidir si se unifican o se documenta la regla
(por ejemplo, PascalCase en los servicios ASMX y camelCase en los Java).

### 3. Mejoras al DSL y al comparador de contratos (common)

- `xsd:choice` nativo en el DSL. fecred tiene su propio `choice()` en
  `src/schemas.ts`; moverlo a common.
- El comparador trata `xsd:all` como secuencia ordenada (más estricto de lo
  necesario) y en respuestas no verifica que un `choice` traiga al menos una
  opción.
- Un `str()` con mensaje propio para `pattern` (ej: "no puede estar vacío" en
  lugar de `formato inválido (\S)`).
- Que el orden de los errores de `extraCheck` se intercale con el de los del
  schema (hoy van al final).

### 4. Tests de integración contra homologación (en curso)

Rama `feat/integracion-homologacion`: cada paquete tiene `tests/integration`
(dummy sin autenticación y una consulta autenticada si `ARCA_TEST_SERVICES`
incluye el servicio), `npm run test:integration` y el workflow
`integracion.yml` (nightly y manual, con los tickets de WSAA en `actions/cache`).
Los dummy de los 7 servicios se probaron contra homologación el 2026-11-01.

- [ ] Cargar en el repo los secrets `ARCA_TEST_CERT`, `ARCA_TEST_KEY` y
      `ARCA_TEST_CUIT`, y la variable `ARCA_TEST_SERVICES` con los servicios
      autorizados para ese certificado.
- [ ] Grabar respuestas reales, sin token, sign ni CUIT reales, como fixtures
      para los tests unitarios (requiere el certificado).

### 5. ~~Detección de cambios incompatibles~~ (hecho)

Rama `chore/api-extractor`: `scripts/api-report.mjs` corre api-extractor por
cada entry point de `exports` y deja el reporte en `packages/*/api/*.api.md`.
CI corre `npm run api:check` (falla si la API cambió sin actualizar el
reporte); `npm run api:update` lo regenera. Las ramas que cambian la API
(`feat/majors-sin-deprecados`, `feat/dsl-choice`) tienen que correr
`api:update` después de rebasear sobre esta.

### 6. Mantenimiento

- ~~Evaluar TypeScript 7 y vitest 5~~. Rama `chore/ts7-vitest5`: TypeScript
  7.0.2 (build, typecheck y tests iguales; los `.js` emitidos no cambian y
  en los `.d.ts` solo cambian las comillas) y vitest 4.1.12, que arregla las
  3 vulnerabilidades de vitest 3 (`npm audit` limpio) y sigue soportando
  Node 20. Vitest 5 exige Node >= 22.12: subirlo junto con el cambio de
  `engines`.
- ~~Quitar los `any` que quedan~~: common en `chore/ts7-vitest5`, facturacion
  en `feat/majors-sin-deprecados` (`padron.ts` y `Contribuyente` se quitan
  con la major). Con todo mergeado, biome no marca ninguno: se puede pasar
  `noExplicitAny` de warning a error.
- Cuando Node 20 deje de usarse en la práctica, subir `engines` a `>=22.12`,
  sacar 20.19 de la matriz de CI y pasar a vitest 5.

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
