# arca-sdks

SDKs de TypeScript para los web services de ARCA (ex AFIP). Cada paquete se
publica por separado en npm:

| Paquete                                             | Servicio                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------- |
| [`@ramiidv/arca-common`](packages/common)           | WSAA, cliente SOAP, errores, validadores, QR                                    |
| [`@ramiidv/arca-facturacion`](packages/facturacion) | WSFEv1, WSFEX, CAEA, QR                                                         |
| [`@ramiidv/arca-padron`](packages/padron)           | Constancia de inscripción, A4, A10, A13, A100                                   |
| [`@ramiidv/arca-cdc`](packages/cdc)                 | WSCDC (constatación de comprobantes)                                            |
| [`@ramiidv/arca-mtxca`](packages/mtxca)             | WSMTXCA (factura con detalle de ítems)                                          |
| [`@ramiidv/arca-fecred`](packages/fecred)           | WSFECRED (Factura de Crédito Electrónica MiPyME)                                |
| [`@ramiidv/arca-agro`](packages/agro)               | WSCPE (incluye derivados granarios) y WSLPG (liquidación primaria y secundaria) |
| [`@ramiidv/arca-sire`](packages/sire)               | SIRE (certificados de retención C2005)                                          |
| [`@ramiidv/arca-empleados`](packages/empleados)     | TXT de Simplificación Registral                                                 |

Requisitos: Node >= 22.12. Los paquetes son solo ESM; desde CommonJS se cargan
con `require()`: Node ≥ 22.12 permite cargar módulos ESM con `require()`.

Cada paquete tiene su `README.md`, un `llms.txt` (referencia compacta de la API
para asistentes de código) y una carpeta `examples/`.

**Usar varios SDKs juntos:** todos dependen de `@ramiidv/arca-common`. Para
compartir el `WsaaClient` entre SDKs (`wsaa: arca.wsaa`) instalá versiones que
dependan de la misma minor de `@ramiidv/arca-common` (cada SDK tiene su propia
versión) y verificá con `npm ls @ramiidv/arca-common` que haya una sola copia; si
hay dos, actualizá los SDKs.

**Convenciones comunes a todos los SDKs:**

- Lo que devuelve una emisión siempre es una operación aprobada. Si ARCA la
  rechaza (`resultado: 'R'`), se lanza `ArcaRechazoError` con `operacion`,
  `errors` y `observaciones`; los errores de ARCA sin `resultado: 'R'` lanzan
  `ArcaServiceError` (o la subclase del SDK). `ArcaRechazoError` extiende
  `ArcaServiceError`, así que un `catch` de esa clase cubre los dos casos.
- Una respuesta con forma inesperada lanza `ArcaResponseError` (`uncertain` en
  las emisiones: la operación pudo haberse procesado).
- Los clientes de bajo nivel se construyen con `{ endpoint, transport? }` y cada
  SDK exporta `ENDPOINTS` con la forma `{ <servicio>: { testing, production } }`.

## Primeros pasos

1. **Certificado**: generalo en WSASS (homologación) o en "Administración de
   Certificados Digitales" (producción).
2. **Asociá cada servicio al certificado**: en WSASS, creando una autorización; en
   producción, con el "Administrador de Relaciones de Clave Fiscal". Sin esto, WSAA
   responde `coe.notAuthorized`.
3. **Para facturar**, dá de alta un punto de venta de tipo Web Services.
4. **Entorno**: los SDKs usan homologación por defecto (testing; los comprobantes
   no tienen validez). Para producción pasá `production: true`.

El detalle, con los links oficiales, está en
[arca-common: Primeros pasos](packages/common/README.md#primeros-pasos).

## Desarrollo

```sh
npm install
npm run build              # compila todos los paquetes (common primero)
npm test                   # tests unitarios (usan el fuente de common, sin compilar)
npm run test:coverage      # tests unitarios con cobertura (coverage/)
npm run test:integration   # contra ARCA homologación (sin ARCA_TEST_* se saltean)
npm run test:homologacion  # lo mismo, y escribe homologacion-reporte.md (HOMOLOGACION.md)
npm run lint               # biome (lint:fix para corregir)
npm run typecheck          # tsc de cada paquete y de tests/ (requiere build: usa el dist de common)
npm run typecheck:examples # examples/ de cada paquete
npm run check:snippets     # bloques ```ts de los README (requiere build)
npm run lint:pkg           # publint + attw sobre cada paquete
npm run api:check          # reporte de API pública (api:update para regenerarlo)
npm run wsdl:check         # WSDL publicados por ARCA vs snapshots (wsdl:update)
npm run test:smoke         # require() desde CommonJS
```

Los tests de integración corren localmente, con el certificado de homologación
de cada desarrollador. `npm run test:integration` toma las variables `ARCA_TEST_*`
del entorno o de un `.env` en la raíz (`.env`, `.env.*`, `certs/` y los archivos
`*.key`/`*.crt`/`*.pem` están en `.gitignore`: no se versionan):

```sh
ARCA_TEST_CERT=./certs/homo.crt     # certificado (PEM o ruta al archivo)
ARCA_TEST_KEY=./certs/homo.key      # clave privada (PEM o ruta al archivo)
ARCA_TEST_CUIT=20123456786          # CUIT del certificado (con o sin guiones)
ARCA_TEST_PERFIL=ri                 # ri (emite A y B) o monotributo (emite C); default ri
ARCA_TEST_SERVICES=wsfe,wscdc       # servicios autorizados (sin esto solo corren los dummy)
ARCA_TEST_PTO_VTA=1                 # punto de venta de WSFE y WSFEX (opcional, default 1)
ARCA_TEST_CUIT_RECEPTOR=20111111112 # receptor RI de la factura a un CUIT (opcional, este default)
ARCA_TEST_TICKETS_DIR=.arca-test-tickets # tickets de WSAA (opcional, default <tmp>/arca-test-tickets)
```

Sin `ARCA_TEST_CERT`, `ARCA_TEST_KEY` y `ARCA_TEST_CUIT`, los tests se saltean.
Las mismas variables con el prefijo `ARCA_TEST_CONTRAPARTE_` definen un segundo
usuario, de otro perfil, para los cruces de `tests/homologacion/cruces.test.ts`
(el RI le factura al monotributista y viceversa, cada uno constata con CDC el
comprobante del otro, y el `Id` de WSFEX se autoriza en las dos CUIT).

Todos los tests de integración corren con un guard de red
(`tests/homologacion/guard.ts`) que bloquea cualquier conexión a un host que no
sea de homologación, producción incluida, y corren de a un archivo por vez.

`npm run test:homologacion` además escribe `homologacion-reporte.md` (no se
versiona) con la fecha, el commit, las versiones, el perfil, los servicios y el
resultado de cada test, sin CUIT, certificado ni tokens; exige `ARCA_TEST_PERFIL`
(y `ARCA_TEST_CONTRAPARTE_PERFIL` si hay contraparte).
Cómo sumarlo al registro de corridas está en [HOMOLOGACION.md](HOMOLOGACION.md).

## Plan de trabajo

Pendientes, próximos pasos y gotchas en [ROADMAP.md](ROADMAP.md).

## Releases

Cada cambio que afecta a un paquete publicado lleva un changeset
(`npm run changeset`). Al mergear a `main`, el workflow de release corre CI y
abre el PR "chore: version packages" (versiones, CHANGELOGs y rangos internos
actualizados); al mergearlo, y con la aprobación del environment `npm-publish`,
se publican en npm, con trusted publishing (OIDC) y provenance, en orden de
dependencias. Las actions de los workflows están fijadas por SHA y Dependabot
las mantiene al día. Detalles en [ROADMAP.md](ROADMAP.md#cómo-publicar).

## Licencia

MIT
