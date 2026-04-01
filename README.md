# @ramiidv/arca-agro

SDK para los servicios web agropecuarios de ARCA (ex AFIP), Argentina. Integra tres servicios en un solo paquete:

- **WSCPE** - Carta de Porte Electrónica (transporte de granos por vía automotor)
- **WSCTG** - Código de Trazabilidad de Granos (seguimiento del transporte)
- **WSLPG** - Liquidación Primaria de Granos (liquidaciones y certificaciones)

## Instalación

```bash
npm install @ramiidv/arca-agro @ramiidv/arca-common
```

## Requisitos

- Node.js >= 18
- Certificado digital y clave privada emitidos por ARCA
- Autorización en los servicios `wscpe`, `wsctg` y/o `wslpg` en WSAA

## Inicio rápido

```ts
import { ArcaAgro } from '@ramiidv/arca-agro';
import fs from 'node:fs';

const agro = new ArcaAgro({
  cuit: 20123456789,
  cert: fs.readFileSync('cert.pem', 'utf-8'),
  key: fs.readFileSync('key.pem', 'utf-8'),
  production: false, // true para producción
});
```

La autenticación WSAA se maneja automáticamente. Los tokens se cachean y renuevan según sea necesario.

## WSCPE - Carta de Porte Electrónica

```ts
// Autorizar una carta de porte
const resultado = await agro.cpe.autorizarCPEAutomotor({
  cuitTitularCartaPorte: 20123456789,
  sucursal: 1,
  nroOrden: 1,
  codTipoCartaPorte: 1,
  codGrano: 23, // soja
  codLocalidadProcedencia: 10001,
  codProvProcedencia: 1,
  codLocalidadDestino: 20001,
  codProvDestino: 12,
  cuitDestino: 30111222333,
  plantaDestino: 1,
  pesoNeto: 30000,
  pesoBruto: 32000,
  pesoTara: 2000,
  patente: 'ABC123',
  cuitTransportista: 20999888777,
  fechaEmision: '2026-03-31',
});

// Confirmar arribo
await agro.cpe.confirmadoArriboCPE({
  nroCTG: resultado.nroCTG!,
  nroCartaPorte: resultado.nroCartaPorte!,
  cuitDestino: 30111222333,
  pesoNeto: 29800,
  fechaArribo: '2026-04-01',
});

// Consultar CPEs
const cpes = await agro.cpe.consultarCPE({
  fechaDesde: '2026-03-01',
  fechaHasta: '2026-03-31',
  codGrano: 23,
});

// Rechazar / Anular
await agro.cpe.rechazoCPE({ nroCTG: 12345, nroCartaPorte: 67890, codMotivo: 1 });
await agro.cpe.anularCPE({ nroCTG: 12345, nroCartaPorte: 67890, codMotivo: 2 });

// Obtener constancia PDF (base64)
const pdfBase64 = await agro.cpe.consultarConstanciaCPEPDF(12345);

// Obtener siguiente número de orden
const nroOrden = await agro.cpe.siguienteNroOrden(1);

// Estado del servicio
const status = await agro.cpe.dummy();
```

## WSCTG - Código de Trazabilidad de Granos

```ts
// Solicitar un CTG
const ctg = await agro.ctg.solicitarCTGInicial({
  nroCartaPorte: 67890,
  codEspecie: 23,
  cuitDestino: 30111222333,
  cuitDestinatario: 30111222333,
  codLocalidadOrigen: 10001,
  codLocalidadDestino: 20001,
  codCosecha: 2526,
  pesoNeto: 30000,
});

// Confirmar arribo
await agro.ctg.confirmarArribo({
  nroCTG: ctg.nroCTG!,
  nroCartaPorte: 67890,
  cuitDestino: 30111222333,
  pesoNeto: 29800,
  fechaArribo: '2026-04-01',
});

// Consultar CTGs
const ctgs = await agro.ctg.consultarCTG({
  fechaDesde: '2026-03-01',
  fechaHasta: '2026-03-31',
});

// Exportar a Excel (base64)
const excelBase64 = await agro.ctg.consultarCTGExcel({
  fechaDesde: '2026-03-01',
  fechaHasta: '2026-03-31',
});

// Rechazar / Anular
await agro.ctg.rechazarCTG({ nroCTG: 123, nroCartaPorte: 456, codMotivo: 1 });
await agro.ctg.anularCTG({ nroCTG: 123, nroCartaPorte: 456, codMotivo: 2 });

// CTGs activos
const activos = await agro.ctg.obtenerCTGActivos();

// Constancia PDF (base64)
const pdf = await agro.ctg.consultarConstanciaCTGPDF(12345);

// Estado del servicio
const status = await agro.ctg.dummy();
```

## WSLPG - Liquidación Primaria de Granos

```ts
// Autorizar una liquidación
const liq = await agro.lpg.liquidacionAutorizar({
  cuitComprador: 30111222333,
  cuitVendedor: 20123456789,
  codGrano: 23,
  pesoNeto: 30000,
  precioRefTn: 350000,
});

// Consultar liquidaciones
const liquidaciones = await agro.lpg.liquidacionConsultar({
  fechaDesde: '2026-03-01',
  fechaHasta: '2026-03-31',
});

// Anular liquidación
await agro.lpg.liquidacionAnular(1, 100);

// Ajuste unificado
await agro.lpg.liquidacionAjustarUnificado({
  nroOrdenOriginal: 100,
  ptoEmisionOriginal: 1,
  tipoAjuste: 'credito',
  liquidacion: { pesoNeto: 29500 },
});

// Autorizar certificación
const cert = await agro.lpg.certificacionAutorizar({
  tipoCertificacion: 1,
  cuitDepositante: 20123456789,
  codGrano: 23,
  pesoNeto: 30000,
});

// Anular certificación
await agro.lpg.certificacionAnular(1, cert.nroCertificacion!);

// Consultar parámetros (tipos de grano, grados, puertos, etc.)
const granos = await agro.lpg.consultarParametros('tipoGranoConsultar');

// Estado del servicio
const status = await agro.lpg.dummy();
```

## Verificar todos los servicios

```ts
const status = await agro.serverStatus();
// { cpe: { appserver, dbserver, authserver }, ctg: { ... }, lpg: { ... } }
```

## Clientes de bajo nivel

Para control total sobre la autenticación, se pueden usar los clientes individuales directamente:

```ts
import { CpeClient, CtgClient, LpgClient } from '@ramiidv/arca-agro';
import { WsaaClient } from '@ramiidv/arca-common';

const wsaa = new WsaaClient({ cert, key, production: false });
const cpeClient = new CpeClient(false, { timeoutMs: 60000 });

const ticket = await wsaa.getAccessTicket('wscpe');
const auth = { Token: ticket.token, Sign: ticket.sign, Cuit: 20123456789 };

const resultado = await cpeClient.autorizarCPEAutomotor(auth, { ... });
```

## Eventos

```ts
agro.on('auth:login', (e) => console.log(`Login ${e.service} en ${e.durationMs}ms`));
agro.on('request:end', (e) => console.log(`${e.method} completado en ${e.durationMs}ms`));
agro.on('request:retry', (e) => console.warn(`Reintento #${e.attempt}: ${e.error}`));
agro.on('request:error', (e) => console.error(`Error en ${e.method}: ${e.error}`));
```

## Manejo de errores

```ts
import {
  ArcaAuthError,
  ArcaSoapError,
  ArcaServiceError,
} from '@ramiidv/arca-agro';

try {
  await agro.cpe.autorizarCPEAutomotor({ ... });
} catch (error) {
  if (error instanceof ArcaServiceError) {
    // Errores de negocio (datos inválidos, CPE rechazada, etc.)
    console.error('Errores:', error.errors);
  } else if (error instanceof ArcaSoapError) {
    // Error de comunicación SOAP / HTTP
    console.error('Error SOAP:', error.message, error.statusCode);
  } else if (error instanceof ArcaAuthError) {
    // Error de autenticación WSAA
    console.error('Error auth:', error.message);
  }
}
```

## Configuración

| Opción | Tipo | Default | Descripción |
|--------|------|---------|-------------|
| `cuit` | `number` | **requerido** | CUIT del contribuyente |
| `cert` | `string` | **requerido** | Certificado X.509 en formato PEM |
| `key` | `string` | **requerido** | Clave privada en formato PEM |
| `production` | `boolean` | `false` | Usar entorno de producción |
| `tokenTTLMinutes` | `number` | `720` | Tiempo de vida del token WSAA (minutos) |
| `requestTimeoutMs` | `number` | `30000` | Timeout para requests HTTP (ms) |
| `retries` | `number` | `1` | Reintentos en errores transitorios |
| `retryDelayMs` | `number` | `1000` | Delay base entre reintentos (ms) |
| `onEvent` | `function` | `undefined` | Callback para eventos del SDK |

## Endpoints

| Servicio | Homologación | Producción |
|----------|-------------|------------|
| WSCPE | `https://fwshomo.afip.gov.ar/wscpe/services/soap` | `https://serviciosjava.afip.gob.ar/wscpe/services/soap` |
| WSCTG | `https://fwshomo.afip.gov.ar/wsctg/services/CTGService_v4.0` | `https://serviciosjava.afip.gob.ar/wsctg/services/CTGService_v4.0` |
| WSLPG | `https://fwshomo.afip.gov.ar/wslpg/LpgService` | `https://serviciosjava.afip.gob.ar/wslpg/LpgService` |

## Licencia

MIT
