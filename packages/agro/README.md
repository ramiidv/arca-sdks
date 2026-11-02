# @ramiidv/arca-agro

[![npm](https://img.shields.io/npm/v/@ramiidv/arca-agro)](https://www.npmjs.com/package/@ramiidv/arca-agro)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node >= 20.19](https://img.shields.io/badge/node-%3E%3D20.19-brightgreen)](https://nodejs.org)

SDK en TypeScript para los web services agropecuarios de **ARCA** (ex AFIP):

- **WSCPE**: Carta de Porte Electrónica de granos (automotor y ferroviaria). Reemplazó al CTG (RG 5017/2021).
- **WSLPG**: Liquidación Primaria de Granos, ajustes y certificación primaria.

Los requests siguen el XSD de los WSDL oficiales (mismos nombres y anidamiento): el SDK arma el XML en el orden del XSD, valida los datos antes de enviarlos y devuelve objetos tipados. La autenticación con WSAA es automática.

Fuentes: [Manual WSCPE v2.0.3](https://www.afip.gob.ar/ws/documentos/manual_wscpe_version-2-0-3.pdf), [Manual WSLPG](https://www.afip.gob.ar/ws/WSLiquiGranos/manual-wslpg.pdf) y los WSDL de homologación.

> **WSCTG ya no existe.** El Código de Trazabilidad de Granos se derogó el 1/11/2021 y sus endpoints responden 404. El número de CTG ahora lo asigna WSCPE al autorizar la carta de porte (`cabecera.nroCTG`).

## Instalación

```bash
npm install @ramiidv/arca-agro
```

## Requisitos

- Node >= 20.19. Solo ESM; desde CommonJS se carga con `require()` (require(esm)).
- Certificado digital X.509 y clave privada de ARCA, con los servicios **`wscpe`** y/o **`wslpg`** asociados
  - **Homologación**: [WSASS](https://wsass-homo.afip.gob.ar/wsass/portal/main.aspx)
  - **Producción**: [Administración de Certificados Digitales](https://www.afip.gob.ar/ws/documentacion/certificados.asp)

## Inicio rápido

```ts
import fs from 'node:fs';
import { ArcaAgro, FileTicketStorage, TIPO_CPE } from '@ramiidv/arca-agro';

const agro = new ArcaAgro({
  cuit: '20-12345678-6', // CUIT representada (se valida el dígito verificador)
  cert: fs.readFileSync('cert.pem', 'utf-8'),
  key: fs.readFileSync('key.pem', 'utf-8'),
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
    codPuerto: 14,
    codGrano: 31,
    cuitVendedor: '30712345671',
    nroIngBrutoVendedor: 900123,
    liquidaCorredor: 'N',
    fechaPrecioOperacion: '2026-10-30',
    precioRefTn: 250000,
    precioFleteTn: 0,
    campaniaPPal: 2526,
    codLocalidadProcedencia: 3,
    codProvProcedencia: 1,
    pesoNetoSinCertificado: 30000,
  },
  deducciones: [{ codigoConcepto: 'CO', comisionGastosAdm: 1.5, alicuotaIva: 21 }],
  retenciones: [{ codigoConcepto: 'RG', baseCalculo: 7500000, alicuota: 2 }],
});
console.log(autorizacion.coe, autorizacion.totalNetoAPagar); // '330100012345' 8130274.01
```

> **`siguienteNroOrden` no es atómico.** Hace `consultarUltNroOrden + 1`: dos procesos que lo llamen a la vez obtienen el mismo número y ARCA rechaza la segunda autorización. Si emitís en paralelo para la misma sucursal y tipo, serializá las emisiones o llevá tu propio contador. Lo mismo vale para el número de orden de WSLPG.

## Configuración

`ArcaAgroConfig` extiende `ArcaSdkConfig` de `@ramiidv/arca-common`:

| Opción                                                                               | Tipo                            | Default            | Descripción                                                                                                   |
| ------------------------------------------------------------------------------------ | ------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `cert`, `key`                                                                        | `string`                        | —                  | Certificado y clave privada (PEM)                                                                             |
| `keyPassphrase`                                                                      | `string`                        | —                  | Contraseña de la clave, si está encriptada                                                                    |
| `cuit`                                                                               | `number \| string`              | —                  | CUIT representada (con o sin guiones); se valida el dígito verificador                                        |
| `production`                                                                         | `boolean`                       | `false`            | Homologación o producción                                                                                     |
| `timeout`                                                                            | `number`                        | `30000`            | Timeout HTTP (ms)                                                                                             |
| `retries` / `retryDelayMs`                                                           | `number`                        | `1` / `1000`       | Reintentos de **consultas** (las emisiones nunca se reintentan)                                               |
| `tokenTTLMinutes`                                                                    | `number`                        | `720`              | Vigencia del TRA pedida a WSAA                                                                                |
| `ticketStorage`                                                                      | `TicketStorage`                 | memoria            | Persistencia del TA (recomendado en producción: `FileTicketStorage` o propio)                                 |
| `clockOffsetMs`, `autoClockSkew`, `loginErrorCooldownMs`, `permanentErrorCooldownMs` |                                 |                    | Opciones de WSAA (ver `@ramiidv/arca-common`)                                                                 |
| `fetch`                                                                              | `typeof fetch`                  | `globalThis.fetch` | `fetch` propio (proxy, tests)                                                                                 |
| `legacyTls`                                                                          | `'auto' \| 'never' \| 'always'` | `'auto'`           | Transporte TLS legacy                                                                                         |
| `onEvent`                                                                            | `(e: ArcaEvent) => void`        | —                  | Eventos `auth:*` y `request:*`                                                                                |
| `wsaa`                                                                               | `WsaaClient`                    | —                  | `WsaaClient` compartido con otros SDKs (mismo certificado); tiene que ser del mismo entorno (`production`)    |
| `signal`                                                                             | `AbortSignal`                   | —                  | Cancela todas las llamadas de la instancia (ej: al apagar la app); se combina con el `signal` de cada llamada |
| `endpoints`                                                                          | `{ cpe?, lpg?, wsaa? }`         | oficiales          | Endpoints propios (ej: un proxy)                                                                              |

Todos los métodos aceptan un último parámetro opcional `opts?: CallOptions` (`{ signal }`) para cancelar la llamada. `clearAuthCache()` (async) invalida los tickets de WSCPE y WSLPG; `status()` consulta el `dummy` de los dos servicios en paralelo (con `statusOf` de common: la caída de uno no oculta el estado del otro).

## API

### WSCPE (`agro.cpe`)

Tipos de carta de porte (`TIPO_CPE`): `74` automotor, `75` ferroviaria, `274` automotor flete corto. Estados: `ESTADOS_CPE`.

**Emisiones** (nunca se reintentan). `autorizar*` devuelve el detalle de la CPE (`cabecera.nroCTG` siempre presente); el resto devuelve `CPEResultado` (`{ cabecera?, pdf?, metadata?, advertencias? }`).

| Circuito    | Métodos                                                                                                                                                                                                                                                                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automotor   | `autorizarCPEAutomotor`, `editarCPEAutomotor`, `editarCPEConfirmadaAutomotor`, `confirmarArriboCPE`, `confirmacionDefinitivaCPEAutomotor`, `descargadoDestinoCPE`, `rechazoCPE`, `anularCPE`, `nuevoDestinoDestinatarioCPEAutomotor`, `regresoOrigenCPEAutomotor`, `desvioCPEAutomotor`, `informarContingencia`, `cerrarContingenciaCPE` |
| Ferroviario | `autorizarCPEFerroviaria`, `editarCPEFerroviaria`, `editarCPEConfirmadaFerroviaria`, `confirmacionDefinitivaCPEFerroviaria`, `nuevoDestinoDestinatarioCPEFerroviaria`, `regresoOrigenCPEFerroviaria`, `desvioCPEFerroviaria`                                                                                                             |

```ts
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

**Consultas** (se reintentan ante errores transitorios). Las listas sin resultados devuelven `[]`; si ARCA devuelve errores se lanza `ArcaAgroServiceError`, nunca una lista vacía.

| Método                                                                                | Devuelve                                         |
| ------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `consultarCPEAutomotor({ cartaPorte } \| { nroCTG })`                                 | `CPEAutomotorDetalle`                            |
| `consultarCPEFerroviaria({ cartaPorte } \| { nroCTG })`                               | `CPEFerroviariaDetalle`                          |
| `consultaCPEFerroviariaPorNroOperativo(nroOperativo)`                                 | `OperativoFerroviarioCPE`                        |
| `consultarCPEPorDestino({ planta, fechaPartidaDesde, fechaPartidaHasta })`            | `CPEResumen[]`                                   |
| `consultarCPEPPendientesDeResolucion({ perfil, planta? })`                            | `CPEResumen[]`                                   |
| `consultarUltNroOrden(sucursal, tipoCPE)` / `siguienteNroOrden(...)`                  | `number` (si ARCA no devuelve `nroOrden`, lanza) |
| `consultarProvincias()`, `consultarLocalidadesPorProvincia(codProvincia)`             | `CodigoDescripcion[]`                            |
| `consultarTiposGrano()`, `consultarCategoriasSemillas()`, `consultarUnidadesMedida()` | `CodigoDescripcion[]`                            |
| `consultarVariedadesSemillas(codGrano?)`                                              | `VariedadSemillaCPE[]`                           |
| `consultarTiposEmbalaje()`                                                            | `TipoEmbalajeCPE[]` (con sus unidades de medida) |
| `consultarPlantas(cuit)`                                                              | `PlantaCPE[]`                                    |
| `consultarLocalidadesProductor(cuit)`                                                 | `LocalidadProductorCPE[]`                        |
| `consultarRenspa(cuit, codProvincia)`                                                 | `RenspaCPE[]`                                    |
| `consultarDomiciliosPorCUIT(cuit)`                                                    | `DomicilioCPE[]`                                 |
| `dummy()`                                                                             | `ServerStatus` (sin autenticación)               |

**No implementado en WSCPE:** el circuito de **derivados granarios** (CPE DG): `autorizarCPEAutomotorDG`, `autorizarCPEFerroviariaDG`, `autorizarCPEDuctosDG`, `autorizarCPEEmisionDestinoDG`, `aceptarEmisionDG`, `aceptarEmisionDestinoDG`, `rechazarEmisionDG`, `rechazarEmisionDestinoDG`, las variantes `*DG` / `*Ductos` / `*EmisionDestinoDG` de editar, confirmar, desviar, regresar, nuevo destino, anular, contingencia y descarga, y las consultas `consultarCPEAutomotorDG`, `consultarCPEFerroviariaDG`, `consultarCPEDuctos`, `consultarCPEEmisionDestinoDG`, `consultarCPEDGPendienteActivacion`, `consultarCPEEmitidasDestinoDGPendientesActivacion`, `consultarDerivadosGranarios` y `consultarPlantasDG`.

### WSLPG (`agro.lpg`)

`liquidacion` sigue `LpgLiquidacionBaseType` del XSD; `deducciones`, `retenciones` y `percepciones` van como hermanos (arrays). Los códigos de actividad, operación, puerto, grano, deducción y retención salen de las paramétricas.

| Grupo                 | Emisiones (nunca se reintentan)                               | Consultas                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Liquidación primaria  | `liquidacionAutorizar`, `liquidacionAnular`                   | `liquidacionXCoeConsultar(coe, { pdf? })`, `liquidacionXNroOrdenConsultar(ptoEmision, nroOrden)`, `liquidacionUltimoNroOrdenConsultar(ptoEmision)`, `liquidacionPorContratoConsultar(params)` (COEs)                                                                                                                                                                                                   |
| Ajustes               | `liquidacionAjustarUnificado`                                 | `ajusteXCoeConsultar(coe, { pdf? })`, `ajusteXNroOrdenConsultar(ptoEmision, nroOrden)`, `ajustePorContratoConsultar(nroContrato)`                                                                                                                                                                                                                                                                      |
| Certificación (`cg*`) | `cgAutorizar`, `cgSolicitarAnulacion`, `cgConfirmarAnulacion` | `cgConsultarXCoe(coe, { pdf? })`, `cgConsultarXNroOrden(ptoEmision, nroOrden)`, `cgConsultarUltimoNroOrden(ptoEmision)`, `cgBuscarCtg(params)`, `cgBuscarCertConSaldoDisponible(params)`                                                                                                                                                                                                               |
| Paramétricas          |                                                               | `provinciasConsultar`, `localidadXProvinciaConsultar`, `tipoGranoConsultar`, `puertoConsultar`, `tipoActividadConsultar`, `tipoActividadRepresentadoConsultar`, `tipoOperacionXActividadConsultar`, `tipoDeduccionConsultar`, `tipoRetencionConsultar`, `tipoCertificadoDepositoConsultar`, `codigoGradoReferenciaConsultar`, `codigoGradoEntregadoXTipoGranoConsultar`, `campaniasConsultar`, `dummy` |

```ts
await agro.lpg.liquidacionXCoeConsultar(coe, { pdf: true }); // { liquidacion?, autorizacion, pdf?, eventos, advertencias? }
await agro.lpg.liquidacionAnular(coe); // { coe?, resultado?: 'A', pdf?, eventos }; resultado 'R' → ArcaAgroServiceError
await agro.lpg.liquidacionAjustarUnificado({
  ajusteBase: { ptoEmision, nroOrden, coeAjustado: coe, codLocalidad: 3, codProv: 1 },
  ajusteDebito: { diferenciaPesoNeto: 0, diferenciaPrecioOperacion: 1000, diferenciaPrecioFleteTn: 0 },
});
await agro.lpg.cgAutorizar({ cabecera: { /* ... */ cuitCorredor: 0 }, primaria: { /* ... */ } }); // cuitCorredor 0: sin corredor
```

**No implementado en WSLPG:** liquidación secundaria (`lsgAutorizar`, `lsgAnular`, `lsgAnularContraDocumento`, `lsgAjustarXCoe`, `lsgAjustarXContrato`, `lsgAsociarAContrato`, `lsgConsultarXCoe`, `lsgConsultarXNroOrden`, `lsgConsultarXContrato`, `lsgConsultarUltimoNroOrden`), anticipos (`lpgAutorizarAnticipo`, `lpgCancelarAnticipo`), `lpgAnularContraDocumento`, `liquidacionAjustarContrato`, `asociarLiquidacionAContrato` y `cgInformarCalidad`.

### Validación local

Los métodos validan antes de enviar. Para validar de antemano (ej: en un formulario): `validateAutorizarCPEAutomotor`, `validateAutorizarCPEFerroviaria`, `validateEditarCPEAutomotor`, `validateEditarCPEFerroviaria`, `validateEditarCPEConfirmada`, `validateConfirmacionDefinitivaCPEAutomotor`, `validateConfirmacionDefinitivaCPEFerroviaria`, `validateLiquidacion`, `validateAjusteUnificado` y `validateCgAutorizar`. Lanzan `ArcaValidationError` con `details[]`.

### Formatos

- Los montos se redondean a los decimales del XSD (`fractionDigits`).
- `xsd:date` acepta `Date` o `AAAAMMDD` / `AAAA-MM-DD`.
- `xsd:dateTime` acepta `Date` (se envía en hora de Argentina, con `-03:00`) o un string ISO-8601, que se envía tal cual.
- En las respuestas, los IDs largos (`nroCTG`, `coe`) y los `xs:string` (ej: `codigo` de las paramétricas) son `string`; los CUIT y montos son `number`.

**Pendiente de verificar con ARCA:** el manual WSCPE (§4.5) muestra los `dateTime` como `aaaa-MM-ddThh:MM:ss`, sin zona horaria. El SDK envía `-03:00`, que es válido según el XSD, pero no está verificado contra homologación. Si ARCA lo rechazara, pasá el string sin zona (ej: `'2026-11-02T08:00:00'`), que se envía tal cual.

## Manejo de errores

| Error                                                | Cuándo                                                                                                                                                                                                                                                    |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ArcaValidationError`                                | Datos inválidos, antes de llamar a ARCA: campo obligatorio faltante, campo desconocido, CUIT con dígito verificador incorrecto, `NaN`/`Infinity`, rangos y largos del XSD, fechas. `details[]` trae cada campo con su ruta (ej: `transporte.dominio[0]`). |
| `ArcaAgroServiceError` (extiende `ArcaServiceError`) | ARCA rechazó la operación: `errores.error[]` (y en WSLPG también `erroresFormato.error[]`), o `liquidacionAnular` respondió `resultado: 'R'`. Trae `errors[]`, `service`, `method`, `response` (el nodo completo) y `uncertain`.                          |
| `ArcaSoapError`                                      | Red, timeout, HTTP o SOAP Fault. `uncertain` indica si ARCA pudo haber procesado el request; `faultDetail` trae el `<detail>` del Fault.                                                                                                                  |
| `ArcaAgroResponseError`                              | La respuesta no trae un dato imprescindible (`nroCTG` al autorizar, `coe` al liquidar, `nroOrden` al consultar el último) o, en una consulta, no tiene la forma del XSD. `uncertain` es `true` en emisiones.                                              |
| `ArcaAuthError` / `ArcaTicketVigenteError`           | Errores de WSAA.                                                                                                                                                                                                                                          |

Un `<error>` sin código (o con código no numérico) cuenta como error; solo se ignora el código explícito `0`.

### Errores admitidos: `advertencias`

ARCA informa algunos errores en `errores` **sin rechazar la operación**: WSCPE **550** y WSLPG **1021**, "Error al generar el archivo pdf" (estado de la operación: Aceptada). En ese caso el SDK no lanza: devuelve el resultado (sin `pdf`) con el error en `advertencias`. Las operaciones que devuelven listas o números no tienen `pdf` y no reciben estos errores.

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

Las emisiones (autorizar, editar, confirmar, anular, ajustar, `cg*` de autorización y anulación) **nunca se reintentan**. Las consultas sí, ante errores transitorios.

Una emisión puede terminar con `uncertain: true`, es decir, ARCA **pudo haberla procesado**:

- `ArcaSoapError`: timeout, conexión cortada, HTTP 5xx o SOAP Fault `Server`. Los Faults `Client` no son inciertos (ARCA rechazó el request sin procesarlo).
- `ArcaAgroResponseError`: la respuesta no trae el identificador (`nroCTG`, `coe`).
- `ArcaAgroServiceError`: la respuesta trae errores **y también** el resultado (`cabecera.nroCTG` o `cabecera.estado` en WSCPE; `autorizacion.coe`, `ajusteUnificado.coe` o `resultado: 'A'` en WSLPG).

En una emisión aceptada, un campo secundario de la respuesta que no tiene la forma del XSD se omite: no vuelve incierta una operación que ARCA aceptó.

### Recuperar una emisión incierta

**No reintentes a ciegas**: consultá primero.

- **CPE** (manual WSCPE §1.3): `consultarUltNroOrden(sucursal, tipoCPE)`. Si es menor que el `nroOrden` que enviaste, no se emitió: reintentá con el mismo número. Si es mayor o igual, consultá la CPE con `consultarCPEAutomotor({ cartaPorte: { tipoCPE, sucursal, nroOrden } })` (o `consultarCPEFerroviaria`) y **comprobá que sea la tuya** (destino, dominio, fecha de partida): otro proceso pudo haber usado ese número. Para las demás operaciones, consultá la CPE y mirá `cabecera.estado`.
- **Liquidación**: `liquidacionUltimoNroOrdenConsultar(ptoEmision)` + `liquidacionXNroOrdenConsultar(ptoEmision, nroOrden)`. Para una anulación, `liquidacionXCoeConsultar(coe)` y mirá `autorizacion.estado` (`AN`).
- **Ajuste**: el número de orden es el **mismo contador** que el de las liquidaciones (manual WSLPG §1.9.1): `liquidacionUltimoNroOrdenConsultar(ptoEmision)` + `ajusteXNroOrdenConsultar(ptoEmision, nroOrden)`.
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

Los endpoints están en `CPE_ENDPOINTS` y `LPG_ENDPOINTS`; los namespaces en `CPE_NAMESPACE` (`https://serviciosjava.afip.gob.ar/wscpe/`) y `LPG_NAMESPACE` (`http://serviciosjava.afip.gob.ar/wslpg/`). Los de WSAA están en `WSAA_ENDPOINTS` de `@ramiidv/arca-common`.

## Ejemplos

En [examples](https://github.com/ramiidv/arca-sdks/tree/main/packages/agro/examples): circuito completo de una Carta de Porte automotor (`carta-de-porte.ts`), liquidación primaria de granos (`liquidacion-granos.ts`) y manejo de errores con recuperación de emisiones inciertas (`manejo-errores.ts`).

## Licencia

MIT
