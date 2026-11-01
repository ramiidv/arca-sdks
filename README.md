# arca-sdks

SDKs de TypeScript para los web services de ARCA (ex AFIP). Cada paquete se
publica por separado en npm:

| Paquete                                             | Servicio                                         |
| --------------------------------------------------- | ------------------------------------------------ |
| [`@ramiidv/arca-common`](packages/common)           | WSAA, cliente SOAP, errores, validadores         |
| [`@ramiidv/arca-facturacion`](packages/facturacion) | WSFEv1, WSFEX, CAEA, QR                          |
| [`@ramiidv/arca-padron`](packages/padron)           | Constancia de inscripción, A4, A10, A13, A100    |
| [`@ramiidv/arca-cdc`](packages/cdc)                 | WSCDC (constatación de comprobantes)             |
| [`@ramiidv/arca-mtxca`](packages/mtxca)             | WSMTXCA (factura con detalle de ítems)           |
| [`@ramiidv/arca-fecred`](packages/fecred)           | WSFECRED (Factura de Crédito Electrónica MiPyME) |
| [`@ramiidv/arca-agro`](packages/agro)               | WSCPE y WSLPG                                    |
| [`@ramiidv/arca-sire`](packages/sire)               | SIRE (certificados de retención C2005)           |
| [`@ramiidv/arca-empleados`](packages/empleados)     | TXT de Simplificación Registral                  |

Todos son ESM y requieren Node >= 20.19 (desde CommonJS se cargan con `require()`).

## Desarrollo

```sh
npm install
npm run build        # compila todos los paquetes (common primero)
npm test             # vitest en todos los paquetes
npm run lint         # biome
npm run lint:pkg     # publint + attw sobre cada paquete
```

## Releases

Cada cambio que afecta a un paquete publicado lleva un changeset
(`npm run changeset`). Al mergear a `main`, el workflow de release abre el PR
"Version Packages" (versiones, CHANGELOGs y rangos internos actualizados); al
mergearlo se publican en npm, con trusted publishing (OIDC) y provenance, en
orden de dependencias.
