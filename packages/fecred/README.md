# @ramiidv/arca-fecred

[![npm](https://img.shields.io/npm/v/@ramiidv/arca-fecred)](https://www.npmjs.com/package/@ramiidv/arca-fecred)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

SDK en TypeScript para el web service **WSFECRED** (FECredService) de **ARCA** (ex AFIP): Factura de Crédito Electrónica MiPyME (Ley 27.440).

Cubre todas las operaciones del WSDL: obligación de recepción, cuentas corrientes, comprobantes, historial de estados, remitos, aceptación, rechazo, cancelación total, rechazo de notas de débito/crédito, opción de transferencia, Agentes de Depósito Colectivo y tablas de parámetros.

> **0.3.0 es un cambio incompatible**: la versión anterior no funcionaba contra ARCA (namespace, auth y nombres de operaciones incorrectos). Ver [CHANGELOG](./CHANGELOG.md).

## Instalación

```bash
npm install @ramiidv/arca-fecred
```

Requisitos: Node.js >= 18 y un certificado de ARCA con el servicio `wsfecred` autorizado
([WSASS homologación](https://wsass-homo.afip.gob.ar/wsass/portal/main.aspx) o
[Administración de Certificados Digitales](https://www.afip.gob.ar/ws/documentacion/certificados.asp) en producción).

## Uso rápido

```typescript
import { readFileSync } from 'fs';
import { ArcaFecred, FileTicketStorage } from '@ramiidv/arca-fecred';

const fecred = new ArcaFecred({
  cert: readFileSync('./cert.pem', 'utf-8'),
  key: readFileSync('./key.pem', 'utf-8'),
  cuit: '20-12345678-6',          // CUIT representada (number o string, con o sin guiones)
  production: false,
  ticketStorage: new FileTicketStorage('./.arca-tickets'),
});

// ¿La CUIT receptora está obligada a recibir FCE?
const { obligado, montoDesde } = await fecred.consultarMontoObligadoRecepcion({
  cuitConsultada: '30712345671',
  fechaEmision: '2026-11-01',
});

// Cuentas corrientes recibidas en octubre (paginado)
const { ctasCtes, hayMas } = await fecred.consultarCtasCtes({
  rol: 'Receptor',
  fecha: { tipo: 'Emision', desde: '2026-10-01', hasta: '2026-10-31' },
});

// Aceptar una FCE
const r = await fecred.aceptarFECred({
  idCtaCte: { codCtaCte: ctasCtes[0].codCtaCte },
  saldoAceptado: ctasCtes[0].saldo,
  codMoneda: ctasCtes[0].codMoneda,
  cotizacionMonedaUlt: 1,
});
console.log(r.resultado); // 'A' o 'O' (un rechazo se lanza como ArcaServiceError)
```

## Configuración

`ArcaFecredConfig` extiende `ArcaBaseConfig` de `@ramiidv/arca-common`:

| Opción | Tipo | Default | Descripción |
| --- | --- | --- | --- |
| `cert`, `key` | `string` | — | Certificado y clave privada (PEM) |
| `cuit` | `number \| string` | — | CUIT representada; se valida el dígito verificador y se envía como 11 dígitos |
| `production` | `boolean` | `false` | Homologación o producción |
| `timeout` | `number` | `30000` | Timeout HTTP (ms) |
| `retries` / `retryDelayMs` | `number` | `1` / `1000` | Reintentos de **consultas** (las operaciones nunca se reintentan) |
| `tokenTTLMinutes` | `number` | `720` | Vigencia pedida a WSAA |
| `ticketStorage` | `TicketStorage` | — | Persistencia del TA (recomendado en producción: `FileTicketStorage` o propio) |
| `clockOffsetMs`, `autoClockSkew`, `loginErrorCooldownMs` | | | Opciones de WSAA (ver arca-common) |
| `fetch` | `typeof fetch` | `globalThis.fetch` | `fetch` propio (proxy, tests) |
| `legacyTls` | `'auto' \| 'never' \| 'always'` | `'auto'` | Transporte TLS legacy |
| `onEvent` | `(e: ArcaEvent) => void` | — | Eventos `auth:*` y `request:*` |
| `wsaa` | `WsaaClient` | — | `WsaaClient` propio (compartir tickets entre SDKs) |
| `endpoints` | `{ wsfecred?, wsaa? }` | — | Sobrescribe las URLs |

Todos los métodos aceptan un último parámetro opcional `opts?: CallOptions` (`{ signal }`) para cancelar.

## Operaciones

Fuente: WSDL de FECredService (`https://fwshomo.afip.gob.ar/wsfecred/FECredService?wsdl`). Los nombres de campos siguen el XSD.

### Consultas (se reintentan ante errores transitorios)

| Método | Operación | Devuelve |
| --- | --- | --- |
| `status()` | `dummy` | `{ appserver, dbserver, authserver }` |
| `consultarMontoObligadoRecepcion({ cuitConsultada, fechaEmision })` | idem | `{ obligado, montoDesde?, evento?, observaciones }` |
| `consultarObligadoRecepcion(cuit)` | idem | `{ obligado, desde?, ... }` (campo `respuesta` del WS) |
| `consultarCtasCtes({ rol, cuitContraparte?, fecha?, estadoCtaCte?, nroPagina?, opcionTransferencia? })` | idem | `{ ctasCtes: InfoCtaCte[], nroPagina?, hayMas?, ... }` |
| `consultarCtaCte(idCtaCte)` | idem | `{ ctaCte: CuentaCorriente, ... }` |
| `consultarComprobantes({ rol, cuitContraparte?, codTipoCmp?, estadoCmp?, fecha?, codCtaCte?, estadoCtaCte?, nroPagina? })` | idem | `{ comprobantes: Comprobante[], nroPagina?, hayMas?, ... }` |
| `consultarHistorialEstadosComprobante(idComprobante)` | idem | `{ idComprobante, estados }` |
| `consultarHistorialEstadosCtaCte(idCtaCte)` | idem | `{ idCtaCte, estados }` |
| `obtenerRemitos(idComprobante)` | idem | `IdComprobante[]` |
| `consultarCuentasEnAgtDptoCltv()` | idem | `{ cuentas, ... }` |
| `consultarFacturasAgtDptoCltv({ idCtaCte?, fecha? })` | idem | `{ facturas, ... }` |
| `consultarTiposRetenciones()` | idem | `{ codigoJurisdiccion, descripcionJurisdiccion, porcentajeRetencion }[]` |
| `consultarTiposFormasCancelacion()` | idem | `{ codigo, descripcion }[]` |
| `consultarTiposMotivosRechazo()` | idem | `{ codigo, descripcion }[]` |
| `consultarTiposAjustesOperacion()` | idem | `{ codigo, descripcion }[]` |

### Operaciones que cambian estado (emisiones: nunca se reintentan)

| Método | Operación | Devuelve |
| --- | --- | --- |
| `aceptarFECred({ idCtaCte, saldoAceptado, codMoneda, cotizacionMonedaUlt, ... })` | idem | `{ resultado: 'A' \| 'O', idCtaCte, evento?, observaciones }` |
| `rechazarFECred({ idCtaCte, motivos })` | idem | idem |
| `informarCancelacionTotalFECred({ idCtaCte, formasCancelacion, importeCancelacion })` | idem | idem |
| `modificarOpcionTransferencia({ idCtaCte, opcionTransferencia })` | idem | idem |
| `informarFacturaAgtDptoCltv({ idCtaCte, ctaAgente })` | idem | idem |
| `rechazarNotaDC({ idComprobante, motivos })` | idem | `{ resultado, idComprobante, ... }` |

`aceptarFECred` acepta además los opcionales del XSD: `confirmarNotasDC` (`{ acepta, idNota }[]`), `formasCancelacion`, `retenciones` (`{ codTipo, importe, porcentaje, descMotivo? }[]`), `ajustesOperacion` (`{ codigo, importe }[]`), `tipoCancelacion` (`'PAR' | 'TOT'`), `importeCancelado`, `importeTotalRetPesos`, `importeEmbargoPesos`, `informaCBU` y `cbuComprador`.

### Identificadores

```typescript
// IdCtaCteType es un xsd:choice: por código de cuenta corriente o por factura
const porCodigo = { codCtaCte: '1234567890' };
const porFactura = { idFactura: { cuitEmisor: '30712345671', codTipoCmp: 201, ptoVta: 3, nroCmp: 125 } };

await fecred.consultarCtaCte(porFactura);
```

Las respuestas devuelven `codCtaCte`, CUITs y `codAutorizacion` (CAE) como **string**; importes como `number`; fechas como el string que envía ARCA; los `S`/`N` como `boolean`.

### Paginado

`consultarCtasCtes` y `consultarComprobantes` devuelven `nroPagina` y `hayMas`. Pedí la página siguiente con `nroPagina`.

### Tablas de códigos

Los códigos de formas de cancelación, motivos de rechazo, ajustes de operación y retenciones **no están en el WSDL**: obtenelos con `consultarTipos*()`. El SDK solo exporta las enumeraciones definidas en el XSD:
`RolCtaCte`, `EstadoCtaCte` (`Modificable`, `Aceptada`, `Rechazada`, `CanceladaTotal`, `InformadaAgDpto`), `EstadoComprobante`, `TipoFechaFiltro`, `OpcionTransferencia` (`SCA`, `ADC`), `TipoCancelacion` (`PAR`, `TOT`), `TipoAceptacion` y `Resultado`. Se pueden usar como `RolCtaCte.RECEPTOR` o con el literal (`'Receptor'`).

## Errores

| Clase | Cuándo |
| --- | --- |
| `ArcaValidationError` | Datos inválidos (CUIT con dígito verificador incorrecto, fechas inexistentes, importes NaN/negativos, textos fuera de 3..250, CBU inválido, etc.). No se llega a pedir el ticket ni a llamar a ARCA. `field` indica el parámetro. |
| `ArcaServiceError` | ARCA devolvió `arrayErrores` o `arrayErroresFormato`, o una operación terminó con `resultado = 'R'`. `errors: { code, msg, rawCode? }[]` (`rawCode` para los códigos alfanuméricos de `arrayErroresFormato`). |
| `ArcaSoapError` | HTTP, timeout, SOAP Fault (ej: `wscommon_005`/`wscommon_007` de auth) o respuesta sin un campo obligatorio del XSD. `uncertain` indica si ARCA pudo haber procesado el request. |
| `ArcaAuthError` / `ArcaTicketVigenteError` | Falla de WSAA / ya hay un TA vigente que no está en el `ticketStorage`. |

Las observaciones (`arrayObservaciones`) y el `evento` no son errores: vienen en el resultado.

### Resultado incierto en operaciones

Las emisiones (`aceptarFECred`, `rechazarFECred`, `informarCancelacionTotalFECred`, `rechazarNotaDC`, `modificarOpcionTransferencia`, `informarFacturaAgtDptoCltv`) se envían una sola vez. Si la respuesta se pierde (timeout, conexión cortada, HTTP 5xx, respuesta ilegible) se lanza `ArcaSoapError` con `uncertain = true`: la operación **pudo haberse registrado**. Antes de reintentar, consultá el estado:

```typescript
try {
  await fecred.aceptarFECred(params);
} catch (e) {
  if (e instanceof ArcaSoapError && e.uncertain) {
    const { estados } = await fecred.consultarHistorialEstadosCtaCte(params.idCtaCte);
    // o consultarCtaCte(params.idCtaCte) → ctaCte.estadoCtaCte.estado
    // Si ya figura Aceptada/Rechazada, no reintentar.
  }
  throw e;
}
```

## Cliente de bajo nivel

`fecred.fecred` es un `FecredClient`: los mismos métodos con las credenciales como primer parámetro y respuestas tipadas.

```typescript
const ticket = await fecred.wsaa.getAccessTicket('wsfecred');
const auth = { token: ticket.token, sign: ticket.sign, cuitRepresentada: '20123456786' };
const tipos = await fecred.fecred.consultarTiposMotivosRechazo(auth);
```

Detalles del protocolo (verificados contra homologación): namespace `http://ar.gob.afip.wsfecred/FECredService/`, wrapper `<operacionRequest>`, header `SOAPAction` = namespace + operación (obligatorio), `dummy` con Body vacío.

## Entornos

| Entorno | WSFECRED |
| --- | --- |
| Homologación | `https://fwshomo.afip.gob.ar/wsfecred/FECredService` |
| Producción | `https://serviciosjava.afip.gob.ar/wsfecred/FECredService` |

Los endpoints de WSAA están en `WSAA_ENDPOINTS` de `@ramiidv/arca-common`.

## Licencia

MIT
