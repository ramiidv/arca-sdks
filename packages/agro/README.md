# @ramiidv/arca-agro

SDK para los servicios web agropecuarios de ARCA (ex AFIP), Argentina:

- **WSCPE**: Carta de Porte Electrónica (granos, automotor y ferroviaria). Reemplazó al CTG (RG 5017/2021).
- **WSLPG**: Liquidación Primaria de Granos y certificación primaria.

> **WSCTG ya no existe.** El Código de Trazabilidad de Granos fue derogado el 1/11/2021 y reemplazado por la Carta de Porte Electrónica; sus endpoints responden 404. Desde la versión 0.3.0 este paquete no lo incluye. El número de CTG ahora lo asigna WSCPE al autorizar la CPE (`cabecera.nroCTG`).

## Instalación

```bash
npm install @ramiidv/arca-agro @ramiidv/arca-common
```

## Requisitos

- Node.js >= 18
- Certificado digital y clave privada emitidos por ARCA, autorizados en WSAA para `wscpe` y/o `wslpg`.

## Inicio rápido

```ts
import fs from 'node:fs';
import { FileTicketStorage } from '@ramiidv/arca-common';
import { ArcaAgro, TIPO_CPE } from '@ramiidv/arca-agro';

const agro = new ArcaAgro({
  cuit: '20-12345678-6', // CUIT representada (se valida el dígito verificador)
  cert: fs.readFileSync('cert.pem', 'utf-8'),
  key: fs.readFileSync('key.pem', 'utf-8'),
  production: false, // true para producción
  ticketStorage: new FileTicketStorage('.arca-tickets'), // recomendado: persiste el TA entre reinicios
});
```

La autenticación WSAA es automática: el ticket se cachea y se renueva cuando vence.

Todos los métodos aceptan un último argumento opcional `{ signal }` (`AbortSignal`) para cancelar la llamada.

## WSCPE: Carta de Porte Electrónica

Los requests siguen el XSD oficial de WSCPE (mismos nombres y anidamiento). El SDK arma el XML en el orden del XSD, valida los datos antes de enviarlos y devuelve objetos tipados.

Tipos de carta de porte (`TIPO_CPE`): `74` automotor, `75` ferroviaria, `274` automotor flete corto.

### Autorizar una CPE automotor

```ts
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

cpe.cabecera.nroCTG; // '010100012345' (string)
cpe.cabecera.estado; // 'AC'
cpe.pdf; // constancia en base64
```

> **`siguienteNroOrden` no es atómico.** Hace `consultarUltNroOrden + 1`: dos procesos que lo llamen a la vez obtienen el mismo número y ARCA rechaza la segunda autorización. Si emitís en paralelo para la misma sucursal y tipo, serializá las emisiones o llevá tu propio contador.

### Circuito automotor

```ts
const cartaPorte = { tipoCPE: TIPO_CPE.AUTOMOTOR, sucursal: 1, nroOrden: 15 };

await agro.cpe.confirmarArriboCPE({ cuitSolicitante, cartaPorte });
await agro.cpe.confirmacionDefinitivaCPEAutomotor({
  cuitSolicitante,
  cartaPorte,
  pesoBrutoDescarga: 41900,
  pesoTaraDescarga: 12000,
});
await agro.cpe.descargadoDestinoCPE({ cuitSolicitante, cartaPorte });
await agro.cpe.rechazoCPE({ cuitSolicitante, cartaPorte, rechazoMotivo: 2, rechazoObservaciones: 'Humedad' });
await agro.cpe.anularCPE({ cartaPorte, anulacionMotivo: 3, anulacionObservaciones: 'Error de carga' });
await agro.cpe.editarCPEAutomotor({
  nroCTG,
  cuitDestinatario,
  cuitChofer,
  cuitTransportista,
  destino,
  pesoBruto,
  codGrano,
});
await agro.cpe.editarCPEConfirmadaAutomotor({ nroCTG, intervinientes: { cuitCorredorVentaPrimaria } });
await agro.cpe.nuevoDestinoDestinatarioCPEAutomotor({
  cartaPorte,
  destino,
  transporte: { fechaHoraPartida, kmRecorrer },
});
await agro.cpe.regresoOrigenCPEAutomotor({ cartaPorte, transporte: { fechaHoraPartida, kmRecorrer } });
await agro.cpe.desvioCPEAutomotor({ cuitSolicitante, cartaPorte, destino, transporte });
await agro.cpe.informarContingencia({
  cartaPorte,
  contingencia: { concepto: 'C', descripcion: 'Desperfecto mecánico' },
});
await agro.cpe.cerrarContingenciaCPE({ cartaPorte, concepto: 'A' });

const detalle = await agro.cpe.consultarCPEAutomotor({ nroCTG: '010100012345' }); // o { cartaPorte }
```

Las operaciones que modifican una CPE devuelven `CPEResultado` (`{ cabecera?, pdf?, metadata? }`).

### Circuito ferroviario

`autorizarCPEFerroviaria`, `consultarCPEFerroviaria`, `editarCPEFerroviaria`, `editarCPEConfirmadaFerroviaria`, `confirmacionDefinitivaCPEFerroviaria`, `nuevoDestinoDestinatarioCPEFerroviaria`, `regresoOrigenCPEFerroviaria`, `desvioCPEFerroviaria` y `consultaCPEFerroviariaPorNroOperativo`.

### Consultas y paramétricas

```ts
await agro.cpe.consultarUltNroOrden(1, TIPO_CPE.AUTOMOTOR); // número; si ARCA no lo devuelve, lanza
await agro.cpe.consultarCPEPorDestino({
  planta: 1938,
  fechaPartidaDesde: '2026-11-01',
  fechaPartidaHasta: '2026-11-07',
});
await agro.cpe.consultarCPEPPendientesDeResolucion({ perfil: 'D', planta: 1938 });
await agro.cpe.consultarProvincias();
await agro.cpe.consultarLocalidadesPorProvincia(12);
await agro.cpe.consultarTiposGrano();
await agro.cpe.consultarPlantas('30500011129');
await agro.cpe.consultarLocalidadesProductor('20123456786');
await agro.cpe.consultarCategoriasSemillas();
await agro.cpe.consultarVariedadesSemillas(23);
await agro.cpe.dummy();
```

Las listas sin resultados devuelven `[]`; si ARCA devuelve errores, se lanza `ArcaAgroServiceError` (nunca una lista vacía).

### No soportado en WSCPE

El circuito de **derivados granarios** (CPE DG, tipos 284-287: `autorizarCPEAutomotorDG`, `autorizarCPEFerroviariaDG`, `autorizarCPEDuctosDG`, `autorizarCPEEmisionDestinoDG`, etc.), `consultarCPEDuctos`, `consultarRenspa`, `consultarDomiciliosPorCUIT` y las paramétricas de DG (`consultarTiposEmbalaje`, `consultarUnidadesMedida`, `consultarDerivadosGranarios`, `consultarPlantasDG`) todavía no están implementados.

## WSLPG: Liquidación Primaria de Granos

`liquidacion` sigue `LpgLiquidacionBaseType` del XSD; `deducciones`, `retenciones` y `percepciones` van como hermanos (arrays).

```ts
const ptoEmision = 1;
const nroOrden = (await agro.lpg.liquidacionUltimoNroOrdenConsultar(ptoEmision)) + 1;

const { autorizacion, eventos } = await agro.lpg.liquidacionAutorizar({
  liquidacion: {
    ptoEmision,
    nroOrden,
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

autorizacion.coe; // '330100012345' (string)
autorizacion.totalNetoAPagar; // number
```

Los códigos de actividad, operación, puerto, grano, deducción y retención salen de las paramétricas.

```ts
await agro.lpg.liquidacionXCoeConsultar(coe, { pdf: true }); // { liquidacion, autorizacion, pdf, eventos }
await agro.lpg.liquidacionXNroOrdenConsultar(ptoEmision, nroOrden);
await agro.lpg.liquidacionAnular(coe);                         // { coe, resultado, pdf?, eventos }
await agro.lpg.liquidacionAjustarUnificado({
  ajusteBase: { ptoEmision, nroOrden, coeAjustado: coe, codLocalidad: 3, codProv: 1 },
  ajusteDebito: { diferenciaPesoNeto: 0, diferenciaPrecioOperacion: 1000, diferenciaPrecioFleteTn: 0 },
});

// Certificación primaria
await agro.lpg.cgConsultarUltimoNroOrden(ptoEmision);
await agro.lpg.cgAutorizar({ cabecera: { ... }, primaria: { ... } }); // o retiroTransferencia / preexistente
await agro.lpg.cgSolicitarAnulacion(coe);
await agro.lpg.cgConfirmarAnulacion(coe, { pdf: true });

// Paramétricas
await agro.lpg.tipoGranoConsultar();
await agro.lpg.puertoConsultar();
await agro.lpg.provinciasConsultar();
await agro.lpg.localidadXProvinciaConsultar(1);
await agro.lpg.tipoActividadConsultar();
await agro.lpg.tipoActividadRepresentadoConsultar();
await agro.lpg.tipoOperacionXActividadConsultar(40);
await agro.lpg.tipoDeduccionConsultar();
await agro.lpg.tipoRetencionConsultar();
await agro.lpg.tipoCertificadoDepositoConsultar();
await agro.lpg.codigoGradoReferenciaConsultar();
await agro.lpg.codigoGradoEntregadoXTipoGranoConsultar(2);
await agro.lpg.campaniasConsultar();
await agro.lpg.dummy();
```

### No soportado en WSLPG

Liquidación secundaria (`lsg*`), anticipos (`lpgAutorizarAnticipo`, `lpgCancelarAnticipo`), anulación contra documento, ajuste por contrato (`liquidacionAjustarContrato`, `asociarLiquidacionAContrato`, `*PorContratoConsultar`, `ajusteXCoeConsultar`, `ajusteXNroOrdenConsultar`) y el resto de las operaciones de certificación (`cgBuscarCtg`, `cgBuscarCertConSaldoDisponible`, `cgConsultarXCoe`, `cgConsultarXNroOrden`, `cgInformarCalidad`).

## Errores

| Error                                                | Cuándo                                                                                                                                                                                                                                                    |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ArcaValidationError`                                | Datos inválidos, antes de llamar a ARCA: campo obligatorio faltante, campo desconocido, CUIT con dígito verificador incorrecto, `NaN`/`Infinity`, rangos y largos del XSD, fechas. `details[]` trae cada campo con su ruta (ej: `transporte.dominio[0]`). |
| `ArcaAgroServiceError` (extiende `ArcaServiceError`) | ARCA rechazó la operación: `errores.error[]` (y en WSLPG también `erroresFormato.error[]`). `errors[]`, `service`, `method` y `response` (el nodo completo devuelto).                                                                                     |
| `ArcaSoapError`                                      | Red, timeout, HTTP o SOAP Fault. `uncertain` indica si ARCA pudo haber procesado el request.                                                                                                                                                              |
| `ArcaAgroResponseError`                              | La respuesta no trae un dato imprescindible (ej: `nroCTG` al autorizar, `coe` al liquidar, `nroOrden` al consultar el último). `uncertain` es `true` en emisiones.                                                                                        |
| `ArcaAuthError` / `ArcaTicketVigenteError`           | Errores de WSAA.                                                                                                                                                                                                                                          |

Los montos se redondean a los decimales del XSD (`fractionDigits`). Las fechas `xsd:date` aceptan `Date` o `AAAAMMDD`/`AAAA-MM-DD`; las `xsd:dateTime` aceptan `Date` (se envía en hora de Argentina, `-03:00`) o un string ISO-8601.

En las respuestas, los campos `xs:string` (ej: `codigo` de las paramétricas) son `string`, los IDs largos (`nroCTG`, `coe`) son `string`, los CUIT y montos son `number`.

## Emisiones y reintentos

Las operaciones que crean o modifican algo en ARCA **nunca se reintentan**:

- WSCPE: `autorizarCPEAutomotor`, `autorizarCPEFerroviaria`, `confirmarArriboCPE`, `confirmacionDefinitivaCPE*`, `descargadoDestinoCPE`, `rechazoCPE`, `anularCPE`, `editarCPE*`, `nuevoDestinoDestinatarioCPE*`, `regresoOrigenCPE*`, `desvioCPE*`, `informarContingencia`, `cerrarContingenciaCPE`.
- WSLPG: `liquidacionAutorizar`, `liquidacionAnular`, `liquidacionAjustarUnificado`, `cgAutorizar`, `cgSolicitarAnulacion`, `cgConfirmarAnulacion`.

Las consultas se reintentan ante errores transitorios (`retries`, default 1).

### Recuperar una emisión incierta

Si una emisión falla con `error.uncertain === true` (timeout, conexión cortada, HTTP 5xx, SOAP Fault, respuesta incompleta), ARCA pudo haberla procesado. **No reintentes a ciegas**: consultá primero.

- **CPE** (manual WSCPE §1.3): `consultarUltNroOrden(sucursal, tipoCPE)`. Si es `>=` al `nroOrden` que enviaste, la CPE se autorizó: obtenela con `consultarCPEAutomotor({ cartaPorte: { tipoCPE, sucursal, nroOrden } })` (o `consultarCPEFerroviaria`). Si no, reintentá con el mismo `nroOrden`. Para las demás operaciones, consultá la CPE y mirá `cabecera.estado`.
- **Liquidación**: `liquidacionUltimoNroOrdenConsultar(ptoEmision)` y `liquidacionXNroOrdenConsultar(ptoEmision, nroOrden)`. Para anulaciones y ajustes, `liquidacionXCoeConsultar(coe)` y mirá `autorizacion.estado`.
- **Certificación**: `cgConsultarUltimoNroOrden(ptoEmision)`.

```ts
try {
  return await agro.cpe.autorizarCPEAutomotor(params);
} catch (e) {
  if (!((e instanceof ArcaSoapError || e instanceof ArcaAgroResponseError) && e.uncertain)) throw e;
  const { tipoCP, sucursal, nroOrden } = params.cabecera;
  if ((await agro.cpe.consultarUltNroOrden(sucursal, tipoCP)) >= nroOrden) {
    return agro.cpe.consultarCPEAutomotor({ cartaPorte: { tipoCPE: tipoCP, sucursal, nroOrden } });
  }
  return agro.cpe.autorizarCPEAutomotor(params); // no se emitió
}
```

## Estado de los servicios

```ts
const estado = await agro.status();
// { cpe: { ok: true, status: { appserver, dbserver, authserver } }, lpg: { ok: false, error } }
```

Usa `Promise.allSettled`: la caída de un servicio no oculta el estado del otro.

## Eventos

```ts
agro.on('auth:login', (e) => console.log(`Login ${e.service}`));
agro.on('request:end', (e) => console.log(`${e.method} en ${e.durationMs}ms`));
agro.on('request:retry', (e) => console.warn(`Reintento #${e.attempt}`));
agro.on('request:error', (e) => console.error(`Error en ${e.method}`));
```

También se puede pasar `onEvent` en la configuración. Los errores de los handlers se ignoran.

## Configuración

`ArcaAgroConfig` extiende `ArcaBaseConfig` de `@ramiidv/arca-common`.

| Opción                            | Tipo                            | Default       | Descripción                                                 |
| --------------------------------- | ------------------------------- | ------------- | ----------------------------------------------------------- |
| `cuit`                            | `number \| string`              | **requerido** | CUIT representada (con o sin guiones)                       |
| `cert` / `key`                    | `string`                        | **requerido** | Certificado y clave privada PEM                             |
| `production`                      | `boolean`                       | `false`       | Entorno de producción                                       |
| `timeout`                         | `number`                        | `30000`       | Timeout HTTP (ms)                                           |
| `retries`                         | `number`                        | `1`           | Reintentos de consultas (las emisiones nunca se reintentan) |
| `retryDelayMs`                    | `number`                        | `1000`        | Delay base entre reintentos (ms)                            |
| `tokenTTLMinutes`                 | `number`                        | `720`         | Vida del ticket WSAA                                        |
| `ticketStorage`                   | `TicketStorage`                 | memoria       | Persistencia del ticket WSAA (recomendado en producción)    |
| `clockOffsetMs` / `autoClockSkew` |                                 | `0` / `true`  | Desfase de reloj con ARCA                                   |
| `loginErrorCooldownMs`            | `number`                        | `60000`       | Espera tras un login WSAA fallido                           |
| `fetch`                           | `typeof fetch`                  | global        | `fetch` propio (proxy, tests)                               |
| `legacyTls`                       | `'auto' \| 'never' \| 'always'` | `'auto'`      | Transporte TLS legacy                                       |
| `endpoints`                       | `{ cpe?, lpg?, wsaa? }`         | oficiales     | Endpoints propios                                           |
| `onEvent`                         | `function`                      |               | Callback de eventos                                         |

`clearAuthCache()` (async) invalida los tickets de WSCPE y WSLPG.

## Endpoints

| Servicio | Homologación                                            | Producción                                           |
| -------- | ------------------------------------------------------- | ---------------------------------------------------- |
| WSCPE    | `https://cpea-ws-qaext.afip.gob.ar/wscpe/services/soap` | `https://cpea-ws.afip.gob.ar/wscpe/services/soap`    |
| WSLPG    | `https://fwshomo.afip.gov.ar/wslpg/LpgService`          | `https://serviciosjava.afip.gob.ar/wslpg/LpgService` |

Namespaces: WSCPE `https://serviciosjava.afip.gob.ar/wscpe/`, WSLPG `http://serviciosjava.afip.gob.ar/wslpg/`.

## Licencia

MIT
