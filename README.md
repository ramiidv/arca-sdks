# arca-sdks

SDKs de TypeScript para los web services de ARCA (ex AFIP). Cada paquete se
publica por separado en npm:

| Paquete                                             | Servicio                                         |
| --------------------------------------------------- | ------------------------------------------------ |
| [`@ramiidv/arca-common`](packages/common)           | WSAA, cliente SOAP, errores, validadores, QR     |
| [`@ramiidv/arca-facturacion`](packages/facturacion) | WSFEv1, WSFEX, CAEA, QR                          |
| [`@ramiidv/arca-padron`](packages/padron)           | Constancia de inscripción, A4, A10, A13, A100    |
| [`@ramiidv/arca-cdc`](packages/cdc)                 | WSCDC (constatación de comprobantes)             |
| [`@ramiidv/arca-mtxca`](packages/mtxca)             | WSMTXCA (factura con detalle de ítems)           |
| [`@ramiidv/arca-fecred`](packages/fecred)           | WSFECRED (Factura de Crédito Electrónica MiPyME) |
| [`@ramiidv/arca-agro`](packages/agro)               | WSCPE y WSLPG                                    |
| [`@ramiidv/arca-sire`](packages/sire)               | SIRE (certificados de retención C2005)           |
| [`@ramiidv/arca-empleados`](packages/empleados)     | TXT de Simplificación Registral                  |

Requisitos: Node >= 20.19. Los paquetes son solo ESM; desde CommonJS se cargan
con `require()` (require(esm)).

Cada paquete tiene su `README.md`, un `llms.txt` (referencia compacta de la API
para asistentes de código) y una carpeta `examples/`.

**Usar varios SDKs juntos:** todos dependen de `@ramiidv/arca-common`. Para
compartir el `WsaaClient` entre SDKs (`wsaa: arca.wsaa`) instalá versiones del
mismo release, que dependen de la misma minor de common; si npm instala dos
copias de common (`npm ls @ramiidv/arca-common`), actualizá los SDKs.

## Desarrollo

```sh
npm install
npm run build              # compila todos los paquetes (common primero)
npm test                   # tests unitarios (usan el fuente de common, sin compilar)
npm run test:coverage      # tests unitarios con cobertura (coverage/)
npm run test:integration   # contra ARCA homologación (ver integracion.yml; sin ARCA_TEST_* se saltean)
npm run lint               # biome (lint:fix para corregir)
npm run typecheck          # tsc de cada paquete (requiere build: usa el dist de common)
npm run typecheck:examples # examples/ de cada paquete
npm run check:snippets     # bloques ```ts de los README (requiere build)
npm run lint:pkg           # publint + attw sobre cada paquete
npm run api:check          # reporte de API pública (api:update para regenerarlo)
npm run wsdl:check         # WSDL publicados por ARCA vs snapshots (wsdl:update)
npm run test:smoke         # require() desde CommonJS
```

## Plan de trabajo

Pendientes, próximos pasos y gotchas en [ROADMAP.md](ROADMAP.md).

## Releases

Cada cambio que afecta a un paquete publicado lleva un changeset
(`npm run changeset`). Al mergear a `main`, el workflow de release corre CI y
abre el PR "chore: version packages" (versiones, CHANGELOGs y rangos internos
actualizados); al mergearlo se publican en npm, con trusted publishing (OIDC) y
provenance, en orden de dependencias.

## Licencia

MIT
