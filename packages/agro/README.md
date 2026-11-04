# @ramiidv/arca-agro

[![npm](https://img.shields.io/npm/v/@ramiidv/arca-agro)](https://www.npmjs.com/package/@ramiidv/arca-agro)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node >= 22.12](https://img.shields.io/badge/node-%3E%3D22.12-brightgreen)](https://nodejs.org)

SDK en TypeScript para los web services agropecuarios de **ARCA** (ex AFIP):

- **WSCPE**: Carta de Porte Electrónica de granos (automotor y ferroviaria) y de derivados granarios (automotor, ferroviaria, emitida en destino y ductos). Reemplazó al CTG (RG 5017/2021).
- **WSLPG**: Liquidación Primaria y Secundaria de Granos, ajustes, anticipos y certificación primaria.

Los requests siguen el XSD de los WSDL oficiales (mismos nombres y anidamiento): el SDK arma el XML en el orden del XSD, valida los datos antes de enviarlos y devuelve objetos tipados. La autenticación con WSAA es automática.

Fuentes: manual para el desarrollador de WSCPE v2.2.1 (22/07/2026), [manual de WSLPG](https://www.afip.gob.ar/ws/WSLiquiGranos/manual-wslpg.pdf) v1.25 (25/09/2026) y los WSDL de homologación.

> **WSCTG ya no existe.** El Código de Trazabilidad de Granos se derogó el 1/11/2021 y sus endpoints responden 404. El número de CTG ahora lo asigna WSCPE al autorizar la carta de porte (`cabecera.nroCTG`).

## Instalación

```bash
npm install @ramiidv/arca-agro
```

## Requisitos

- Node >= 22.12. Solo ESM; también funciona desde CommonJS porque Node ≥ 22.12 permite cargar módulos ESM con `require()`.
- Certificado digital X.509 y clave privada de ARCA, con los servicios **`wscpe`** y/o **`wslpg`** asociados (los ids de WSAA están en `WSAA_SERVICES`: `{ cpe: 'wscpe', lpg: 'wslpg' }`)
  - **Homologación**: [WSASS](https://wsass-homo.afip.gob.ar/wsass/portal/main.aspx)
  - **Producción**: [Administración de Certificados Digitales](https://www.afip.gob.ar/ws/documentacion/certificados.asp)

## Inicio rápido

Los códigos del ejemplo (provincias, localidades, `planta`, granos, `codPuerto`, actividad, conceptos `'CO'` y `'RG'`) son ilustrativos: los válidos se obtienen con las [paramétricas](#glosario) de cada servicio.

```ts
import fs from 'node:fs';
import { ArcaAgro, FileTicketStorage, TIPO_CPE } from '@ramiidv/arca-agro';

const agro = new ArcaAgro({
  cuit: '20-12345678-6', // CUIT representada (se valida el dígito verificador)
  cert: fs.readFileSync('./certs/certificado.crt', 'utf-8'),
  key: fs.readFileSync('./certs/clave.key', 'utf-8'),
  production: false,
  ticketStorage: new FileTicketStorage('.arca-tickets'), // recomendado: persiste el TA entre reinicios
});

// Carta de Porte automotor
const sucursal = 1;
const nroOrden = await agro.cpe.siguienteNroOrden(sucursal, TIPO_CPE.AUTOMOTOR);
const cpe = await agro.cpe.autorizarCPEAutomotor({
  cabecera: { tipoCP: TIPO_CPE.AUTOMOTOR, cuitSolicitante: '20123456786', sucursal, nroOrden },
  origen: { productor: { codProvincia: 1, codLocalidad: 10270 } }, // o { operador: { codProvincia, codLocalidad, planta } }
  correspondeRetiroProductor: false,
  esSolicitanteCampo: true,
  datosCarga: { codGrano: 23, cosecha: 2526, pesoBruto: 42000, pesoTara: 12000 },
  destino: { cuit: '30500011129', esDestinoCampo: false, codProvincia: 12, codLocalidad: 5244, planta: 1938 },
  destinatario: { cuit: '30500011129' },
  transporte: {
    cuitTransportista: '20999888772',
    dominio: ['AB123CD'],
    fechaHoraPartida: new Date('2026-11-02T08:00:00-03:00'),
    kmRecorrer: 250,
    cuitChofer: '27300000008',
    tarifa: 1500.5,
    cuitPagadorFlete: '30712345671',
    mercaderiaFumigada: false,
  },
});
console.log(cpe.cabecera.nroCTG, cpe.cabecera.estado); // '010100012345' 'AC'
if (cpe.pdf) fs.writeFileSync(`cpe-${cpe.cabecera.nroCTG}.pdf`, Buffer.from(cpe.pdf, 'base64'));

// Liquidación primaria de granos
const ptoEmision = 1;
const { autorizacion } = await agro.lpg.liquidacionAutorizar({
  liquidacion: {
    ptoEmision,
    nroOrden: (await agro.lpg.liquidacionUltimoNroOrdenConsultar(ptoEmision)) + 1,
    cuitComprador: '20123456786',
    nroActComprador: 40,
    nroIngBrutoComprador: 901234567,
    codTipoOperacion: '1',
    esLiquidacionPropia: 'N',
    esCanje: 'N',
    codPuerto: 14,
    desPuertoLocalidad: 'Rosario',
    codGrano: 31,
    cuitVendedor: '30712345671',
    nroIngBrutoVendedor: 900123,
    actuaCorredor: 'N',
    liquidaCorredor: 'N',
    fechaPrecioOperacion: '2026-10-30',
    precioRefTn: 250000,
    codGradoEnt: 'G2', // grados del grano: codigoGradoEntregadoXTipoGranoConsultar(codGrano)
    valGradoEnt: 1,
    factorEnt: 100,
    precioFleteTn: 0,
    alicIvaOperacion: 10.5,
    campaniaPPal: 2526,
    codLocalidadProcedencia: 3,
    codProvProcedencia: 1,
    // Sin certificados de depósito: peso y procedencia sin certificado.
    pesoNetoSinCertificado: 30000,
    codLocalidadProcedenciaSinCertificado: 3,
    codProvProcedenciaSinCertificado: 1,
  },
  deducciones: [{ codigoConcepto: 'CO', comisionGastosAdm: 1.5, alicuotaIva: 21 }],
  retenciones: [{ codigoConcepto: 'RG', baseCalculo: 7500000, alicuota: 2 }],
});
console.log(autorizacion.coe, autorizacion.totalNetoAPagar); // '330100012345' 8130274.01
```

> **`siguienteNroOrden` no es atómico.** Hace `consultarUltNroOrden + 1`: dos procesos que lo llamen a la vez obtienen el mismo número y ARCA rechaza la segunda autorización. Si emitís en paralelo para la misma sucursal y tipo, serializá las emisiones o llevá tu propio contador. Lo mismo vale para el número de orden de WSLPG.

## Glosario

- **CTG** (Código de Trazabilidad de Granos): número que WSCPE asigna al autorizar una carta de porte (`cabecera.nroCTG`).
- **COE** (Código de Operación Electrónico): número que WSLPG asigna a una liquidación, ajuste o certificación autorizada (`autorizacion.coe`).
- **TA / TRA**: el TRA (Ticket de Requerimiento de Acceso) es el pedido que el SDK firma y envía a WSAA; el TA (Ticket de Acceso) es el token y sign que WSAA devuelve y que se reutiliza mientras está vigente (`ticketStorage`).
- **Paramétricas**: consultas de las tablas de códigos de cada servicio (provincias, localidades, granos, plantas, puertos, actividades, conceptos de deducción y retención, campañas).
- **Sucursal**: número de sucursal del solicitante que emite la carta de porte; junto con el tipo de CPE y el número de orden identifica la carta de porte (`cartaPorte: { tipoCPE, sucursal, nroOrden }`).
- **Planta**: código de la planta (establecimiento) de un operador; las de una CUIT salen de `consultarPlantas(cuit)`.
- **Cosecha / campaña** (`cosecha`, `campaniaPPal`): cuatro dígitos con los dos últimos de cada año: `2526` es la campaña 2025/26. `campaniasConsultar()` devuelve los códigos válidos.

## Configuración

`ArcaAgroConfig` extiende `ArcaSdkConfig` de `@ramiidv/arca-common`:

| Opción                                                                                                                 | Tipo                            | Default            | Descripción                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `cert`, `key`                                                                                                          | `string`                        | —                  | Certificado y clave privada (PEM)                                                                             |
| `keyPassphrase`                                                                                                        | `string`                        | —                  | Contraseña de la clave, si está encriptada                                                                    |
| `cuit`                                                                                                                 | `number \| string`              | —                  | CUIT representada (con o sin guiones); se valida el dígito verificador                                        |
| `production`                                                                                                           | `boolean`                       | `false`            | Homologación o producción                                                                                     |
| `timeout`                                                                                                              | `number`                        | `30000`            | Timeout HTTP (ms)                                                                                             |
| `retries` / `retryDelayMs`                                                                                             | `number`                        | `1` / `1000`       | Reintentos de **consultas** (las emisiones nunca se reintentan)                                               |
| `tokenTTLMinutes`                                                                                                      | `number`                        | `10`               | Vigencia del TRA pedida a WSAA                                                                                |
| `ticketStorage`                                                                                                        | `TicketStorage`                 | memoria            | Persistencia del TA (recomendado en producción: `FileTicketStorage` o propio)                                 |
| `clockOffsetMs`, `autoClockSkew`, `loginErrorCooldownMs`, `permanentErrorCooldownMs`, `alreadyAuthenticatedCooldownMs` |                                 |                    | Opciones de WSAA (ver `@ramiidv/arca-common`)                                                                 |
| `fetch`                                                                                                                | `typeof fetch`                  | `globalThis.fetch` | `fetch` propio (proxy, tests)                                                                                 |
| `legacyTls`                                                                                                            | `'auto' \| 'never' \| 'always'` | `'auto'`           | Transporte TLS legacy                                                                                         |
| `maxResponseBytes`                                                                                                     | `number`                        | `52428800`         | Tamaño máximo del body de una respuesta (50 MB)                                                               |
| `onEvent`                                                                                                              | `(e: ArcaEvent) => void`        | —                  | Eventos `auth:*` y `request:*`                                                                                |
| `wsaa`                                                                                                                 | `WsaaClient`                    | —                  | `WsaaClient` compartido con otros SDKs (mismo certificado); tiene que ser del mismo entorno (`production`)    |
| `signal`                                                                                                               | `AbortSignal`                   | —                  | Cancela todas las llamadas de la instancia (ej: al apagar la app); se combina con el `signal` de cada llamada |
| `endpoints`                                                                                                            | `{ cpe?, lpg?, wsaa? }`         | oficiales          | Endpoints propios (ej: un proxy)                                                                              |

Todos los métodos aceptan un último parámetro opcional `opts?: CallOptions` (`{ signal }`) para cancelar la llamada. `clearAuthCache()` (async) invalida los tickets de WSCPE y WSLPG; `status()` consulta el `dummy` de los dos servicios en paralelo (con `statusOf` de common: la caída de uno no oculta el estado del otro).

## API

### WSCPE (`agro.cpe`)

Tipos de carta de porte (`TIPO_CPE`): `74` automotor, `75` ferroviaria, `274` automotor flete corto; derivados granarios (DG): `284` automotor DG, `285` ferroviaria DG, `286` emitida en destino DG y `287` ductos DG ("otros medios terrestres"). Estados: `ESTADOS_CPE`.

**Emisiones** (nunca se reintentan). `autorizar*` devuelve el detalle de la CPE (`cabecera.nroCTG` siempre presente); el resto devuelve `CPEResultado` (`{ cabecera?, pdf?, metadata?, advertencias? }`).

| Circuito    | Métodos                                                                                                                                                                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automotor   | `autorizarCPEAutomotor`, `editarCPEAutomotor`, `editarCPEConfirmadaAutomotor`, `confirmacionDefinitivaCPEAutomotor`, `nuevoDestinoDestinatarioCPEAutomotor`, `regresoOrigenCPEAutomotor`, `desvioCPEAutomotor`                                            |
| Ferroviario | `autorizarCPEFerroviaria`, `editarCPEFerroviaria`, `editarCPEConfirmadaFerroviaria`, `confirmacionDefinitivaCPEFerroviaria`, `nuevoDestinoDestinatarioCPEFerroviaria`, `regresoOrigenCPEFerroviaria`, `desvioCPEFerroviaria`                              |
| Comunes     | `confirmarArriboCPE`, `descargadoDestinoCPE`, `rechazoCPE`, `anularCPE`, `informarContingencia`, `cerrarContingenciaCPE` (según `cartaPorte.tipoCPE`; manual §2.9: también para automotor DG, ferroviaria DG y ductos, ver [DG](#derivados-granarios-dg)) |

```ts
import { ArcaAgro, TIPO_CPE } from '@ramiidv/arca-agro';

declare const agro: ArcaAgro; // la del inicio rápido
declare const agroDestino: ArcaAgro; // la del destino (ver examples/carta-de-porte.ts)
declare const cuitDestino: string;

const cartaPorte = { tipoCPE: TIPO_CPE.AUTOMOTOR, sucursal: 1, nroOrden: 15 };

// Las informa el destino (con su propia instancia de ArcaAgro: su CUIT y su certificado).
await agroDestino.cpe.confirmarArriboCPE({ cuitSolicitante: cuitDestino, cartaPorte });
await agroDestino.cpe.confirmacionDefinitivaCPEAutomotor({
  cuitSolicitante: cuitDestino,
  cartaPorte,
  pesoBrutoDescarga: 41900,
  pesoTaraDescarga: 12000,
});
await agro.cpe.anularCPE({ cartaPorte, anulacionMotivo: 3, anulacionObservaciones: 'Error de carga' });
await agro.cpe.informarContingencia({ cartaPorte, contingencia: { concepto: 'C', descripcion: 'Desperfecto mecánico' } });
```

**Ediciones:** ARCA **anula los CUIT opcionales que no se informan** en `editarCPEAutomotor`,
`editarCPEFerroviaria` y `editarCPEConfirmada*` ("Si no informa el campo, se anula la CUIT existente",
manual §3.2). Para mantenerlos, pasalos de nuevo o usá `{ preservarIntervinientes: true }`: el SDK
consulta la CPE (después de validar los datos; si la consulta falla, la edición no se envía) y completa
con el valor vigente los CUIT que no pasaste (`undefined`). Para quitar uno, pasalo como `null`.
No es atómico: son dos llamadas (consulta y edición), así que si otro usuario o sistema edita la CPE
entre ambas, sus cambios en esos CUIT se pisan con los valores leídos en la consulta.

```ts
import type { ArcaAgro } from '@ramiidv/arca-agro';

declare const agro: ArcaAgro;
declare const cuit: { destinatario: string; chofer: string; transportista: string; destino: string };

await agro.cpe.editarCPEAutomotor(
  {
    nroCTG: '010100012345',
    cuitDestinatario: cuit.destinatario,
    cuitChofer: cuit.chofer,
    cuitTransportista: cuit.transportista,
    destino: { cuit: cuit.destino, esDestinoCampo: false, codProvincia: 12, codLocalidad: 5244, planta: 1938 },
    pesoBruto: 41000,
    codGrano: 23,
    cuitCorredorVentaPrimaria: null, // se quita; el resto de los intervinientes se mantiene
  },
  { preservarIntervinientes: true },
);
```

Además del XSD, se validan reglas del manual: hasta 3 dominios (2144), código de turno (2244), cosecha de
4 dígitos (2073), formato del RENSPA (2153), motivos de anulación y rechazo 1 a 3 (2220, 2225), motivo de
contingencia según el tipo de CPE (§4.2: G solo en ferroviaria y ferroviaria DG; en ductos DG, A, C, D, E
o F), conceptos de cierre y de desactivación A a C y rango de `consultarCPEPorDestino` de hasta 3 días (2152).

**Consultas** (se reintentan ante errores transitorios). Las listas sin resultados devuelven `[]`, también cuando el único error que informa ARCA es el 800 ("No existen solicitudes para los parámetros indicados", con el que ARCA responde, por ejemplo, `consultarCPEPorDestino`, `consultarCPEPPendientesDeResolucion` y `consultarPlantas` sin resultados). Con cualquier otro error se lanza `ArcaAgroServiceError`, nunca una lista vacía; fuera de las listas el 800 también es un error.

| Método                                                                                      | Devuelve                                         |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `consultarCPEAutomotor({ cartaPorte \| nroCTG, cuitSolicitante? })`                         | `CPEAutomotorDetalle`                            |
| `consultarCPEFerroviaria({ cartaPorte \| nroCTG, cuitSolicitante? })`                       | `CPEFerroviariaDetalle`                          |
| `consultaCPEFerroviariaPorNroOperativo(nroOperativo)`                                       | `OperativoFerroviarioCPE`                        |
| `consultarCPEPorDestino({ planta, fechaPartidaDesde, fechaPartidaHasta, tipoCartaPorte? })` | `CPEResumen[]`                                   |
| `consultarCPEPPendientesDeResolucion({ perfil, planta? })`                                  | `CPEResumen[]`                                   |
| `consultarUltNroOrden(sucursal, tipoCPE)` / `siguienteNroOrden(...)`                        | `number` (si ARCA no devuelve `nroOrden`, lanza) |
| `consultarProvincias()`, `consultarLocalidadesPorProvincia(codProvincia)`                   | `CodigoDescripcion[]`                            |
| `consultarTiposGrano()`, `consultarCategoriasSemillas()`, `consultarUnidadesMedida()`       | `CodigoDescripcion[]`                            |
| `consultarVariedadesSemillas(codGrano?)`                                                    | `VariedadSemillaCPE[]`                           |
| `consultarTiposEmbalaje()`                                                                  | `TipoEmbalajeCPE[]` (con sus unidades de medida) |
| `consultarPlantas(cuit)`                                                                    | `PlantaCPE[]`                                    |
| `consultarLocalidadesProductor(cuit)`                                                       | `LocalidadProductorCPE[]`                        |
| `consultarRenspa(cuit, codProvincia)`                                                       | `RenspaCPE[]`                                    |
| `consultarDomiciliosPorCUIT(cuit)`                                                          | `DomicilioCPE[]`                                 |
| `dummy()`                                                                                   | `ServerStatus` (sin autenticación)               |

#### Derivados granarios (DG)

Mismas reglas que en granos: las emisiones nunca se reintentan, `autorizar*` devuelve el detalle (`cabecera.nroCTG` siempre presente) y el resto `CPEResultado`. El manual (§2.9) indica qué método corresponde a cada tipo de CPE: automotor DG y ferroviaria DG usan los comunes de arriba (`confirmarArriboCPE`, `descargadoDestinoCPE`, `rechazoCPE`, `anularCPE`, `informarContingencia`, `cerrarContingenciaCPE`); ductos, los mismos salvo `descargadoDestinoCPE` (no aplica); la emitida en destino, `confirmarArriboCPE` y para el resto sus métodos `*EmisionDestinoDG`. La carga se informa con `codGrano` + `codDerivadoGranario` (`consultarDerivadosGranarios`), `tipoEmbalaje` y `unidadMedida` (`consultarTiposEmbalaje`), y los domicilios de origen/destino con `DomicilioPUC` (`{ tipo: 1 | 3, orden }`, de `consultarDomiciliosPorCUIT`).

| Circuito                    | Emisiones                                                                                                                                                                                                                                                                                                                                                                                                      | Consultas                                                                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Automotor DG (284)          | `autorizarCPEAutomotorDG`, `editarCPEDGAutomotor`, `editarCPEDGConfirmadaAutomotor`, `confirmacionDefinitivaCPEAutomotorDG`, `desvioCPEAutomotorDG`, `nuevoDestinoDestinatarioCPEAutomotorDG`, `regresoOrigenCPEAutomotorDG`                                                                                                                                                                                   | `consultarCPEAutomotorDG` → `CPEAutomotorDGDetalle`                                                                                             |
| Ferroviaria DG (285)        | `autorizarCPEFerroviariaDG`, `editarCPEDGFerroviaria`, `editarCPEDGConfirmadaFerroviaria`, `confirmacionDefinitivaCPEFerroviariaDG`, `desvioCPEFerroviariaDG`, `nuevoDestinoDestinatarioCPEFerroviariaDG`, `regresoOrigenCPEFerroviariaDG`                                                                                                                                                                     | `consultarCPEFerroviariaDG` → `CPEFerroviariaDGDetalle`                                                                                         |
| Pendientes de emisión (PE)  | `aceptarEmisionDG`, `rechazarEmisionDG` (automotor y ferroviaria DG)                                                                                                                                                                                                                                                                                                                                           | `consultarCPEDGPendienteActivacion(planta)` → `CPEDGPendiente[]`                                                                                |
| Emitida en destino DG (286) | `autorizarCPEEmisionDestinoDG`, `aceptarEmisionDestinoDG` / `rechazarEmisionDestinoDG` (el origen, estado PO), `anularCPEEmisionDestinoDG`, `informarContingenciaEmisionDestinoDG`, `cerrarContingenciaCPEEmisionDestinoDG`, `descargadoDestinoCPEEmisionDestinoDG`, `nuevoDestinoDestinatarioCPEEmisionDestinoDG`, `regresoOrigenCPEEmisionDestinoDG`; edición, confirmación y desvío con los de automotor DG | `consultarCPEEmisionDestinoDG` → `CPEEmisionDestinoDGDetalle`; `consultarCPEEmitidasDestinoDGPendientesActivacion(planta)` → `CPEDGPendiente[]` |
| Ductos DG (287)             | `editarCPEDGDuctos`, `editarCPEConfirmadaDuctos`, `confirmacionDefinitivaCPEDuctosDG`                                                                                                                                                                                                                                                                                                                          | `consultarCPEDuctos` → `CPEDuctosDetalle`                                                                                                       |
| Paramétricas                |                                                                                                                                                                                                                                                                                                                                                                                                                | `consultarDerivadosGranarios()` → `DerivadoGranarioCPE[]`, `consultarPlantasDG(cuit)` → `PlantaDGCPE[]`                                         |

Las operaciones `*EmisionDestinoDG` llevan además `cuitDestino`. Las consultas de detalle DG aceptan `cartaPorte` o `nroCTG` (y `cuitSolicitante?`, `cuitTitularPlanta?` salvo ductos).

`autorizarCPEDuctosDG` no está: el manual la discontinuó en la versión 2.1.0 (13/02/2026), aunque sigue en el WSDL. Tampoco está `nuevoDestinatarioCPEDuctosDG` (§2.10.57), que el manual describe pero el WSDL no publica.

```ts
import { TIPO_CPE } from '@ramiidv/arca-agro';
import type { ArcaAgro } from '@ramiidv/arca-agro';

declare const agro: ArcaAgro;
declare const cuit: { destino: string; transportista: string; chofer: string; pagador: string };

const sucursal = 1;
const nroOrden = await agro.cpe.siguienteNroOrden(sucursal, TIPO_CPE.AUTOMOTOR_DG);
const cpe = await agro.cpe.autorizarCPEAutomotorDG({
  cabecera: { tipoCP: TIPO_CPE.AUTOMOTOR_DG, sucursal, nroOrden },
  origen: { esUsuarioIndustria: false, planta: 500, domicilioOrigen: { tipo: 3, orden: 1 } },
  datosCarga: {
    codGrano: 23,
    codDerivadoGranario: 101, // consultarDerivadosGranarios()
    pesoBruto: 40000,
    pesoTara: 12000,
    tipoEmbalaje: 1, // a granel: sin cantidadUnidades ni kgLitroM3
    unidadMedida: 1,
  },
  destino: { cuit: cuit.destino, planta: 1938, domicilioDestino: { tipo: 3, orden: 1 } },
  destinatario: { cuit: cuit.destino },
  transporte: {
    cuitTransportista: cuit.transportista,
    dominio: ['AB123CD'],
    fechaHoraPartida: new Date(),
    kmRecorrer: 250,
    cuitChofer: cuit.chofer,
    cuitPagadorFlete: cuit.pagador,
  },
});
console.log(cpe.cabecera.nroCTG);
```

Además del XSD se validan reglas del manual (§3.2): `DomicilioPUC.tipo` 1 o 3 (2223, 2224), de 1 a 10 precintos en ferroviaria DG (2212), y en `autorizar*DG` `cuitTitularPlanta` solo con `esUsuarioIndustria: true`, `cantidadUnidades` y `kgLitroM3` solo si el embalaje no es a granel (`tipoEmbalaje` 1) y `fechaLote` solo con `lote`. Las ediciones DG no tienen `preservarIntervinientes`: el manual no indica que anulen los CUIT no informados.

### WSLPG (`agro.lpg`)

`liquidacion` sigue `LpgLiquidacionBaseType` del XSD; `deducciones`, `retenciones` y `percepciones` van como hermanos (arrays). Los códigos de actividad, operación, puerto, grano, deducción y retención salen de las paramétricas.

| Grupo                           | Emisiones (nunca se reintentan)                                                                                                         | Consultas                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Liquidación primaria            | `liquidacionAutorizar`, `lpgAnularContraDocumento`, `asociarLiquidacionAContrato`                                                       | `liquidacionXCoeConsultar(coe, { pdf? })`, `liquidacionXNroOrdenConsultar(ptoEmision, nroOrden)`, `liquidacionUltimoNroOrdenConsultar(ptoEmision)`, `liquidacionPorContratoConsultar(params)` (COEs)                                                                                                                                                                                                                                          |
| Anticipos                       | `lpgAutorizarAnticipo`, `lpgCancelarAnticipo`                                                                                           |                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Ajustes                         | `liquidacionAjustarUnificado`, `liquidacionAjustarContrato`                                                                             | `ajusteXCoeConsultar(coe, { pdf? })`, `ajusteXNroOrdenConsultar(ptoEmision, nroOrden)`, `ajustePorContratoConsultar(nroContrato)`                                                                                                                                                                                                                                                                                                             |
| Liquidación secundaria (`lsg*`) | `lsgAutorizar`, `lsgAjustarXCoe`, `lsgAjustarXContrato`, `lsgAsociarAContrato`, `lsgAnularContraDocumento`                              | `lsgConsultarXCoe(coe, { pdf? })`, `lsgConsultarXNroOrden(ptoEmision, nroOrden)`, `lsgConsultarUltimoNroOrden(ptoEmision)`, `lsgConsultarXContrato(params)` (COEs)                                                                                                                                                                                                                                                                            |
| Certificación (`cg*`)           | `cgAutorizar`, `cgInformarCalidad`, `cgSolicitarAnulacion`, `cgConfirmarAnulacion`                                                      | `cgConsultarXCoe(coe, { pdf? })`, `cgConsultarXNroOrden(ptoEmision, nroOrden)`, `cgConsultarUltimoNroOrden(ptoEmision)`, `cgBuscarCtg(params)`, `cgBuscarCertConSaldoDisponible(params)`                                                                                                                                                                                                                                                      |
| Paramétricas                    |                                                                                                                                         | `provinciasConsultar`, `localidadXProvinciaConsultar(codProvincia)`, `tipoGranoConsultar`, `puertoConsultar`, `tipoActividadConsultar`, `tipoActividadRepresentadoConsultar`, `tipoOperacionXActividadConsultar(nroActLiquida)`, `tipoDeduccionConsultar`, `tipoRetencionConsultar`, `tipoCertificadoDepositoConsultar`, `codigoGradoReferenciaConsultar`, `codigoGradoEntregadoXTipoGranoConsultar(codGrano)`, `campaniasConsultar`, `dummy` |

```ts
import type { ArcaAgro } from '@ramiidv/arca-agro';

declare const agro: ArcaAgro;
declare const coe: string;
declare const ptoEmision: number;
declare const nroOrden: number;

await agro.lpg.liquidacionXCoeConsultar(coe, { pdf: true }); // { liquidacion?, autorizacion, pdf?, eventos, advertencias? }
await agro.lpg.lpgAnularContraDocumento({ anulacionBase: { puntoEmision: ptoEmision, nroOrden, coeAnular: coe } });
await agro.lpg.liquidacionAjustarUnificado({
  // Mismo contador de números de orden que las liquidaciones y los contradocumentos.
  ajusteBase: { ptoEmision, nroOrden: nroOrden + 1, coeAjustado: coe, codLocalidad: 3, codProv: 1 },
  ajusteDebito: { diferenciaPesoNeto: 0, diferenciaPrecioOperacion: 1000, diferenciaPrecioFleteTn: 0 },
});
const { liquidaciones } = await agro.lpg.lsgConsultarXCoe(coe); // un ajuste con crédito y débito trae dos
```

- **Anulación:** `lpgAnularContraDocumento` (y `lsgAnularContraDocumento` en la secundaria) anula generando un **contradocumento**: una nueva liquidación con la misma información que la anulada (manual WSLPG §2.4.47). Consume un número de orden del punto de emisión y arranca en estado `PA` (pendiente de aceptación): el vendedor la acepta desde el sistema web. Devuelve lo mismo que `liquidacionXCoeConsultar`. `liquidacionAnular` y `lsgAnular` siguen en el WSDL pero el manual los discontinuó (v1.21 y v1.22): el SDK no los expone.
- **Certificación:** `cgAutorizar` lleva solo el bloque de `cabecera.tipoCertificado`: `primaria` (P), `retiroTransferencia` (R o T), `preexistente` o `preexistenteFusion` (E). `cabecera.cuitCorredor` acepta `0` (sin corredor). `cgInformarCalidad` devuelve la certificación como `cgConsultarXCoe`.
- **Anticipos:** `lpgAutorizarAnticipo({ anticipo: { liquidacion, retenciones?, deducciones? } })` devuelve lo mismo que `liquidacionAutorizar`; `lpgCancelarAnticipo({ coe, ptoEmision, nroOrden, pdf? })` cancela el anticipo con una nueva liquidación (el XSD exige `pdf`: si no se informa, se envía `N`).
- **Validaciones del manual**, además del XSD: códigos de grado `G1`, `G2`, `G3`, `FG`, `F1`, `F2`, `F3` (§3.1), `tipoCertificadoDeposito` `'332'`, el bloque de `cgAutorizar` según su `tipoCertificado`, `ajusteCredito` y/o `ajusteDebito` en los ajustes (unificado, por contrato y `lsg*`, error 3010), la calidad de `cgInformarCalidad` (`codGrado` y/o `valorFactor`, 3018; `valorGrado` solo con `codGrado`, 3017; no con `G1`-`G3`, 3014; obligatorio con `FG` y `F1`-`F3`, 3015) y, en `liquidacionAutorizar` (§2.4.2.3), `esLiquidacionPropia` si liquida el comprador una compraventa (1609), `actuaCorredor` si no es liquidación propia (1617), `codGradoEnt` y/o `factorEnt` (1631), `valGradoEnt` solo con `codGradoEnt` (1634) y el peso y la procedencia sin certificado solo sin `certificados` (1644, 1646; sin `certificados`, ARCA rechaza con 1646 un `pesoNetoSinCertificado` sin `codLocalidadProcedenciaSinCertificado` ni `codProvProcedenciaSinCertificado`).
- **Sin registros:** las consultas de listas (`liquidacionPorContratoConsultar`, `lsgConsultarXContrato`, `cgBuscarCtg`, `cgBuscarCertConSaldoDisponible` y las paramétricas) devuelven `[]` cuando el único error que informa ARCA es el 600 ("No existen datos...", manual WSLPG §1.7; un 1021 al lado no cambia el resultado). En las demás operaciones el 600 es un error.

### Validación local

Los métodos validan antes de enviar. Para validar de antemano (ej: en un formulario): `validateAutorizarCPEAutomotor`, `validateAutorizarCPEFerroviaria`, `validateEditarCPEAutomotor`, `validateEditarCPEFerroviaria`, `validateEditarCPEConfirmada`, `validateConfirmacionDefinitivaCPEAutomotor`, `validateConfirmacionDefinitivaCPEFerroviaria`, `validateAutorizarCPEAutomotorDG`, `validateAutorizarCPEFerroviariaDG`, `validateAutorizarCPEEmisionDestinoDG`, `validateLiquidacion`, `validateAjusteUnificado`, `validateAjusteContrato`, `validateAutorizarAnticipo`, `validateCgAutorizar`, `validateCgInformarCalidad`, `validateLsgAutorizar`, `validateLsgAjustarXCoe` y `validateLsgAjustarXContrato`. Lanzan `ArcaValidationError` con `details[]`.

### Tipos exportados

Todos los requests y respuestas están tipados; los nombres de los campos son los del XSD.

- **Configuración y comunes:** `ArcaAgroConfig`, `AgroServiceStatus`, `CallOptions`, `CuitInput`, `FechaInput`, `FechaHoraInput`, `CodigoDescripcion`, `ConAdvertencias`, `ServerStatus`, `ArcaEvent`, `AccessTicket`, `TicketStorage` (con `MemoryTicketStorage` y `FileTicketStorage`), `WsaaClient`. Los sub-clientes `CpeClient` y `LpgClient` se exportan solo como tipos (se usan como `agro.cpe` y `agro.lpg`).
- **WSCPE, requests:** `CartaPorteId`, `DestinoCPE`, `DestinatarioCPE`, `RetiroProductorCPE`, `IntervinientesCPE`, `CoordenadaGMS`, `CoordenadasGPSCPE`, `OrigenCPEAutomotor`, `SemillaCPE`, `TransporteAutomotorModificaCPE`, `RamalCPE`, `TransporteFerroviariaModificaCPE`, `EditarCPEOptions`; por operación: `AutorizarCPEAutomotorParams`, `AutorizarCPEFerroviariaParams`, `ConsultarCPEParams`, `EditarCPEAutomotorParams`, `EditarCPEFerroviariaParams`, `EditarCPEConfirmadaParams`, `AnularCPEParams`, `RechazoCPEParams`, `SolicitanteCartaPorteParams`, `ConfirmacionDefinitivaCPEAutomotorParams`, `ConfirmacionDefinitivaCPEFerroviariaParams`, `NuevoDestinoDestinatarioCPEAutomotorParams`, `NuevoDestinoDestinatarioCPEFerroviariaParams`, `RegresoOrigenCPEAutomotorParams`, `RegresoOrigenCPEFerroviariaParams`, `DesvioCPEAutomotorParams`, `DesvioCPEFerroviariaParams`, `InformarContingenciaParams`, `CerrarContingenciaCPEParams`, `ConsultarCPEPorDestinoParams`, `ConsultarCPEPendientesParams`.
- **WSCPE DG, requests:** `DomicilioPUCCPE`, `OrigenCPEDG`, `DestinoCPEDG`, `DestinoPlantaCPEDG`, `IntervinientesCPEDG`, `DatosCargaCPEDG`, `TransporteAutomotorCPEDG`, `TransporteFerroviariaCPEDG`, `TransporteAutomotorModificaCPEDG`, `EditarCargaCPEDG`, `EditarFleteCPEDG`, `ConCuitDestino`; por operación: `AutorizarCPEAutomotorDGParams`, `AutorizarCPEEmisionDestinoDGParams`, `AutorizarCPEFerroviariaDGParams`, `ConsultarCPEDGParams`, `EditarCPEDGAutomotorParams`, `EditarCPEDGFerroviariaParams`, `EditarCPEDGDuctosParams`, `EditarCPEDGConfirmadaParams`, `ConfirmacionDefinitivaCPEAutomotorDGParams`, `ConfirmacionDefinitivaCPEFerroviariaDGParams`, `ConfirmacionDefinitivaCPEDuctosDGParams`, `DesvioCPEAutomotorDGParams`, `DesvioCPEFerroviariaDGParams`, `NuevoDestinoDestinatarioCPEAutomotorDGParams`, `NuevoDestinoDestinatarioCPEFerroviariaDGParams`, `NuevoDestinoDestinatarioCPEEmisionDestinoDGParams`, `RegresoOrigenCPEAutomotorDGParams`, `RegresoOrigenCPEFerroviariaDGParams`, `RegresoOrigenCPEEmisionDestinoDGParams`, `SolicitanteDestinoCartaPorteParams`, `AnularCPEEmisionDestinoDGParams`, `InformarContingenciaEmisionDestinoDGParams`, `CerrarContingenciaCPEEmisionDestinoDGParams`.
- **WSCPE, respuestas:** `CPEResultado`, `CabeceraCPE`, `MetadataCPE`, `DestinoCPERespuesta`, `CPEAutomotorDetalle`, `CPEFerroviariaDetalle`, `CPEResumen`, `OperativoFerroviarioCPE`, `PlantaCPE`, `CoordenadaCPE`, `LocalidadProductorCPE`, `VariedadSemillaCPE`, `RenspaCPE`, `DomicilioCPE`, `TipoEmbalajeCPE`; DG: `CPEAutomotorDGDetalle`, `CPEFerroviariaDGDetalle`, `CPEEmisionDestinoDGDetalle`, `CPEDuctosDetalle`, `IntervinientesCPEDGRespuesta`, `CPEDGPendiente`, `DerivadoGranarioCPE`, `PlantaDGCPE`.
- **WSLPG, requests:** `SiNo`, `GradoLpg`, `LiquidacionAutorizarParams` (`LiquidacionLpg`, `DeduccionLpg`, `RetencionLpg`, `PercepcionLpg`, `CertificadoDepositoLpg`), `AjusteUnificadoParams` (`AjusteCreditoDebitoLpg`, `FusionLpg`), `AjusteContratoParams` (`AjustePorImporteLpg`), `AsociarAContratoParams`, `LiquidacionPorContratoParams`, `AutorizarAnticipoParams` (`LiquidacionAnticipoLpg`), `CancelarAnticipoParams`, `AnulacionContraDocumentoParams`, `CgAutorizarParams` (`MermasCg`), `CgInformarCalidadParams` (`CalidadCg`), `CgBuscarCtgParams`, `CgBuscarCertConSaldoDisponibleParams`, `LsgAutorizarParams` (`LiquidacionSecundariaLsg`, `DeduccionLsg`, `PercepcionLsg`, `FacturaPapelLsg`), `LsgAjustarXCoeParams` y `LsgAjustarXContratoParams` (`AjusteLsg`).
- **WSLPG, respuestas:** `LiquidacionResultado` (`LiquidacionAutorizadaLpg`, `DeduccionLiquidadaLpg`, `RetencionLiquidadaLpg`), `LiquidacionConsultaResultado` (`LiquidacionConsultadaLpg`), `AjusteUnificadoResultado`, `AjusteContratoResultado`, `AjusteConsultaResultado` (`AjusteUnificadoLpg`, `AjusteCreditoDebitoResultadoLpg`, `ImporteAjustadoLpg`), `CertificacionResultado` (`CertificacionAutorizadaLpg`), `CertificacionConsultaResultado` (`MermasCgRespuesta`), `AnulacionCertificacionResultado`, `CtgCertificableLpg`, `CertificadoConSaldoLpg`, `GradoEntregadoLpg`, `LsgAutorizarResultado` (`LiquidacionSecundariaAutorizadaLsg`), `LsgConsultaResultado` (`LiquidacionesLsg`, `LiquidacionSecundariaConsultadaLsg`), `LsgAjusteResultado` (`AjusteCreditoDebitoResultadoLsg`, `TotalesUnificadosLsg`).
- **Errores:** `ArcaError` (base), `ArcaValidationError` (`ValidationErrorDetail`), `ArcaServiceError` / `ArcaAgroServiceError` (`ServiceErrorDetail`), `ArcaRechazoError`, `ArcaResponseError` / `ArcaAgroResponseError`, `ArcaSoapError`, `ArcaAuthError`, `ArcaTicketVigenteError`, `CpeFaultException` (ver [Manejo de errores](#manejo-de-errores)).

### Formatos

- Los montos se redondean a los decimales del XSD (`fractionDigits`), mitad al par (Round Half Even, manual WSLPG §4.2): `8.565` → `8.56`, `8.575` → `8.58`.
- `xsd:date` acepta `Date` o `AAAAMMDD` / `AAAA-MM-DD`.
- `xsd:dateTime` acepta `Date` (se envía en hora de Argentina, con `-03:00`) o un string ISO-8601 con segundos, que se envía tal cual.
- En las respuestas, los IDs largos (`nroCTG`, `coe`) y los `xs:string` (ej: `codigo` de las paramétricas) son `string`; los CUIT y montos son `number`.

**`dateTime`:** un `Date` se envía en hora de Argentina con `-03:00` (válido según el XSD). El manual WSCPE (§4.5) muestra el formato sin zona horaria: para enviarlo así, pasá el string (ej: `'2026-11-02T08:00:00'`), que se envía tal cual.

## Manejo de errores

| Error                                                  | Cuándo                                                                                                                                                                                                                                                    |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ArcaValidationError`                                  | Datos inválidos, antes de llamar a ARCA: campo obligatorio faltante, campo desconocido, CUIT con dígito verificador incorrecto, `NaN`/`Infinity`, rangos y largos del XSD, fechas. `details[]` trae cada campo con su ruta (ej: `transporte.dominio[0]`). |
| `ArcaAgroServiceError` (extiende `ArcaServiceError`)   | ARCA rechazó la operación: `errores.error[]` (y en WSLPG también `erroresFormato.error[]`). Trae `errors[]`, `service`, `method`, `response` (el nodo completo) y `uncertain`.                                                                            |
| `ArcaSoapError`                                        | Red, timeout, HTTP o SOAP Fault. `uncertain` indica si ARCA pudo haber procesado el request; `faultDetail` trae el `<detail>` del Fault.                                                                                                                  |
| `ArcaAgroResponseError` (extiende `ArcaResponseError`) | La respuesta no trae un dato imprescindible (`nroCTG` al autorizar, `coe` al liquidar, `nroOrden` al consultar el último) o, en una consulta, no tiene la forma del XSD. `uncertain` es `true` en emisiones.                                              |
| `ArcaAuthError` / `ArcaTicketVigenteError`             | Errores de WSAA.                                                                                                                                                                                                                                          |

Un `<error>` sin código (o con código no numérico) cuenta como error; solo se ignora el código explícito `0`.

Lo que devuelve una emisión siempre es una operación aceptada. WSCPE y WSLPG no tienen un `resultado: 'R'`: ARCA rechaza una emisión informando `errores`, así que el rechazo llega como `ArcaAgroServiceError` y este SDK no lanza `ArcaRechazoError` (el error de `@ramiidv/arca-common` para los servicios que responden `resultado: 'R'`). Las dos clases extienden `ArcaServiceError`: un `catch` de esa clase cubre los rechazos de todos los SDKs.

### Errores admitidos: `advertencias`

ARCA informa algunos errores en `errores` **sin rechazar la operación**: WSCPE **550** y WSLPG **1021**, "Error al generar el archivo pdf" (estado de la operación: Aceptada). En ese caso el SDK no lanza: devuelve el resultado (sin `pdf`) con el error en `advertencias`. Las operaciones que devuelven listas o números no tienen `pdf` ni `advertencias`: si ARCA informa uno de estos errores, se ignora.

```ts
import { ArcaAgro, TIPO_CPE } from '@ramiidv/arca-agro';
import type { AutorizarCPEAutomotorParams } from '@ramiidv/arca-agro';

declare const agro: ArcaAgro;
declare const params: AutorizarCPEAutomotorParams;

const cpe = await agro.cpe.autorizarCPEAutomotor(params);
for (const a of cpe.advertencias ?? []) console.warn(`[${a.code}] ${a.msg}`); // [550] Error al generar el archivo pdf.
if (!cpe.pdf) {
  // La CPE está autorizada: la constancia se puede pedir más tarde.
  const { sucursal, nroOrden } = params.cabecera;
  const detalle = await agro.cpe.consultarCPEAutomotor({ cartaPorte: { tipoCPE: TIPO_CPE.AUTOMOTOR, sucursal, nroOrden } });
  console.log(detalle.pdf ? 'PDF recuperado' : 'Todavía sin PDF');
}
```

Si junto con un 550 viene otro error, se lanza `ArcaAgroServiceError` con todos.

### Emisiones y resultado incierto

Las emisiones (en WSCPE, todas las operaciones salvo las consultas; en WSLPG, autorizar, anular por contradocumento, ajustar, asociar a contrato, anticipos y las `cg*` de autorización, calidad y anulación) **nunca se reintentan**. Las consultas sí, ante errores transitorios.

Una emisión puede terminar con `uncertain: true`, es decir, ARCA **pudo haberla procesado**:

- `ArcaSoapError`: timeout, conexión cortada, HTTP 5xx o SOAP Fault `Server`. Los Faults `Client` no son inciertos (ARCA rechazó el request sin procesarlo).
- `ArcaAgroResponseError`: la respuesta no trae el identificador (`nroCTG`, `coe`).
- `ArcaAgroServiceError`: la respuesta trae errores **y también** el resultado (`cabecera.nroCTG` o `cabecera.estado` en WSCPE; `autorizacion.coe`, `ajusteUnificado.coe`, `ajusteContrato.coe`, o `coe` en los ajustes `lsg*` en WSLPG). `cgSolicitarAnulacion` y `cgConfirmarAnulacion` no detectan este caso: ante cualquier error, verificá con `cgConsultarXCoe`. En `asociarLiquidacionAContrato`, `lsgAsociarAContrato` y `cgInformarCalidad` un error no es incierto: operan sobre un comprobante existente y el COE de la respuesta es el que se informó.

En una emisión aceptada, un campo secundario de la respuesta que no tiene la forma del XSD se omite: no vuelve incierta una operación que ARCA aceptó.

### Recuperar una emisión incierta

**No reintentes a ciegas**: consultá primero.

- **CPE** (manual WSCPE §1.3): `consultarUltNroOrden(sucursal, tipoCPE)`. Si es menor que el `nroOrden` que enviaste, no se emitió: reintentá con el mismo número. Si es mayor o igual, consultá la CPE con `consultarCPEAutomotor({ cartaPorte: { tipoCPE, sucursal, nroOrden } })` (o la consulta de su tipo: `consultarCPEFerroviaria`, `consultarCPEAutomotorDG`, etc.) y **comprobá que sea la tuya** (destino, dominio, fecha de partida): otro proceso pudo haber usado ese número. Para las demás operaciones, consultá la CPE y mirá `cabecera.estado`.
- **Liquidación, anticipo (autorizar o cancelar) y anulación por contradocumento**: todos consumen un número de orden del punto de emisión. `liquidacionUltimoNroOrdenConsultar(ptoEmision)`: si es menor que el `nroOrden` que enviaste, no se emitió; si no, `liquidacionXNroOrdenConsultar(ptoEmision, nroOrden)` (para un contradocumento, si no aparece ahí probá `ajusteXNroOrdenConsultar`: el manual §2.4.47 lo describe como un ajuste unificado). Un contradocumento recién emitido está en estado `PA` (pendiente de aceptación del vendedor, manual WSLPG §2.4.6.2), no `AN`.
- **Asociación a contrato y calidad**: no generan un COE nuevo. `liquidacionXCoeConsultar(coe)` (mirá `autorizacion.numeroContrato`), `lsgConsultarXCoe(coe)` o `cgConsultarXCoe(coe)` (mirá `primaria.calidad`).
- **Ajuste** (unificado o por contrato): el número de orden es el **mismo contador** que el de las liquidaciones (manual WSLPG §1.9.1): `liquidacionUltimoNroOrdenConsultar(ptoEmision)` + `ajusteXNroOrdenConsultar(ptoEmision, nroOrden)`.
- **Liquidación secundaria** (autorizar, ajustar, contradocumento): `lsgConsultarUltimoNroOrden(ptoEmision)` + `lsgConsultarXNroOrden(ptoEmision, nroOrden)`.
- **Certificación**: `cgConsultarUltimoNroOrden(ptoEmision)` + `cgConsultarXNroOrden(ptoEmision, nroOrden)`. Para una anulación, `cgConsultarXCoe(coe)` y mirá `autorizacion.estado`.

```ts
import { ArcaAgro, ArcaAgroResponseError, ArcaAgroServiceError, ArcaSoapError } from '@ramiidv/arca-agro';
import type { AutorizarCPEAutomotorParams, CPEAutomotorDetalle } from '@ramiidv/arca-agro';

declare const agro: ArcaAgro;

const digitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const segundos = (v?: Date | string) => (v === undefined ? Number.NaN : Math.floor(new Date(v).getTime() / 1000));

/** ¿La CPE consultada es la que intentamos autorizar? */
function esLaMisma(cpe: CPEAutomotorDetalle, p: AutorizarCPEAutomotorParams): boolean {
  return (
    digitos(cpe.destino?.cuit) === digitos(p.destino.cuit) &&
    cpe.destino?.planta === p.destino.planta &&
    (cpe.transporte?.dominio ?? []).join() === p.transporte.dominio.join() &&
    segundos(cpe.transporte?.fechaHoraPartida) === segundos(p.transporte.fechaHoraPartida)
  );
}

async function autorizar(params: AutorizarCPEAutomotorParams): Promise<CPEAutomotorDetalle> {
  try {
    return await agro.cpe.autorizarCPEAutomotor(params);
  } catch (e) {
    const incierto =
      (e instanceof ArcaSoapError || e instanceof ArcaAgroServiceError || e instanceof ArcaAgroResponseError) &&
      e.uncertain;
    if (!incierto) throw e;
    const { tipoCP, sucursal, nroOrden } = params.cabecera;
    if ((await agro.cpe.consultarUltNroOrden(sucursal, tipoCP)) < nroOrden) {
      return agro.cpe.autorizarCPEAutomotor(params); // no se emitió
    }
    const cpe = await agro.cpe.consultarCPEAutomotor({ cartaPorte: { tipoCPE: tipoCP, sucursal, nroOrden } });
    if (esLaMisma(cpe, params)) return cpe;
    throw new Error(`El número de orden ${nroOrden} lo usó otra CPE (CTG ${cpe.cabecera.nroCTG})`);
  }
}
```

### SOAP Fault de WSCPE (`Exception`)

Ante algunos errores WSCPE responde un SOAP Fault con un `<detail><Exception>` (`uuid`, `timestamp`, `businessErrorId`, `exceptionDetails`, `serverName`). Viene en `ArcaSoapError.faultDetail`; `cpeFaultException(error)` lo devuelve como objeto (o `undefined`):

```ts
import { ArcaAgro, cpeFaultException } from '@ramiidv/arca-agro';

declare const agro: ArcaAgro;

try {
  await agro.cpe.consultarProvincias();
} catch (e) {
  const ex = cpeFaultException(e);
  if (ex) console.error(`businessErrorId=${ex.businessErrorId} uuid=${ex.uuid}: ${ex.exceptionDetails}`);
  throw e;
}
```

## Eventos

`onEvent` (o `agro.on(tipo, handler)` / `agro.off`) recibe `auth:login`, `auth:cache-hit`, `auth:clock-skew`, `auth:storage-error`, `request:start`, `request:end`, `request:retry` y `request:error` (ver `ArcaEvent` en `@ramiidv/arca-common`). Los errores de los handlers se ignoran.

```ts
import { ArcaAgro } from '@ramiidv/arca-agro';

declare const agro: ArcaAgro;

agro.on('request:end', (e) => {
  if (e.type === 'request:end') console.log(`${e.method} en ${e.durationMs} ms`);
});
agro.on('request:retry', (e) => console.warn('Reintento', e));
```

## Entornos

| Servicio | Homologación                                            | Producción                                           |
| -------- | ------------------------------------------------------- | ---------------------------------------------------- |
| WSCPE    | `https://cpea-ws-qaext.afip.gob.ar/wscpe/services/soap` | `https://cpea-ws.afip.gob.ar/wscpe/services/soap`    |
| WSLPG    | `https://fwshomo.afip.gov.ar/wslpg/LpgService`          | `https://serviciosjava.afip.gob.ar/wslpg/LpgService` |

Los endpoints están en `ENDPOINTS` (`ENDPOINTS.cpe` y `ENDPOINTS.lpg`, cada uno `{ testing, production }`, las mismas claves que `endpoints` de la configuración), y los ids de servicio de WSAA en `WSAA_SERVICES` (`wscpe`, `wslpg`); los namespaces en `CPE_NAMESPACE` (`https://serviciosjava.afip.gob.ar/wscpe/`) y `LPG_NAMESPACE` (`http://serviciosjava.afip.gob.ar/wslpg/`). Los de WSAA están en `WSAA_ENDPOINTS` de `@ramiidv/arca-common`.

## Ejemplos

En [examples](https://github.com/ramiidv/arca-sdks/tree/main/packages/agro/examples): circuito completo de una Carta de Porte automotor (`carta-de-porte.ts`), liquidación primaria de granos con anulación por contradocumento (`liquidacion-granos.ts`) y manejo de errores con recuperación de emisiones inciertas (`manejo-errores.ts`).

## Licencia

MIT
