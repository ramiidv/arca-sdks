# @ramiidv/arca-padron

[![npm](https://img.shields.io/npm/v/@ramiidv/arca-padron)](https://www.npmjs.com/package/@ramiidv/arca-padron)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node >= 22.12](https://img.shields.io/badge/node-%3E%3D22.12-brightgreen)](https://nodejs.org)

SDK en TypeScript para los web services de **Padrón** de **ARCA** (ex AFIP): Constancia de Inscripción
(`ws_sr_constancia_inscripcion`, ex A5), A4 (datos completos), A10 y A13 (datos básicos) y A100
(tablas de parámetros). Incluye `condicionIvaDesdePadron` para obtener la condición frente al IVA que
pide la factura electrónica (`CondicionIVAReceptorId`, RG 5616).

- Única dependencia: `@ramiidv/arca-common` (WSAA, SOAP, validadores); usa `fetch` nativo.
- Caché de tickets WSAA con persistencia opcional (`ticketStorage`) y ajuste de reloj.
- Cancelación con `AbortSignal` (global o por llamada).
- Reintentos con backoff exponencial ante errores transitorios (nunca ante un SOAP Fault): todas las
  operaciones son consultas.
- Errores de negocio tipados: `ArcaPadronServiceError` con `reason` (`inexistente`, `inactiva`...).
- Validación local de CUIT (dígito verificador) antes de llamar a ARCA.

Fuentes: WSDL oficiales (`wsdl/`), manual de
[`ws_sr_constancia_inscripcion` v4.1](https://www.afip.gob.ar/ws/WSCI/manual_ws_sr_ws_constancia_inscripcion.pdf)
y manuales de [A4 v1.3](https://www.arca.gob.ar/ws/ws_sr_padron_a4/manual_ws_sr_padron_a4_v1.3.pdf),
[A10 v1.2](https://www.arca.gob.ar/ws/ws_sr_padron_a10/manual_ws_sr_padron_a10_v1.2.pdf),
[A13 v1.4](https://www.arca.gob.ar/ws/ws-padron-a13/manual-ws-sr-padron-a13-v1.4.pdf) y
[A100 v2.1](https://www.arca.gob.ar/ws/ws_sr_padron_a100/manual_ws_sr_padron_a100_v2.1.pdf).

## Glosario

- **Constancia de inscripción** (`ws_sr_constancia_inscripcion`, ex A5): los datos de la constancia
  de inscripción de un contribuyente (domicilio fiscal, impuestos, actividades, monotributo).
- **A4, A10, A13, A100**: "Alcance" de cada servicio de consulta al padrón de ARCA. A4: datos
  completos (impuestos, regímenes, relaciones); A10: versión mínima (datos básicos y domicilios);
  A13: datos básicos y búsqueda de CUIT por documento; A100: tablas de parámetros del padrón.
- **CUIT representada**: la CUIT en nombre de la que se consulta (`cuit` de la config); la que se
  consulta es otra (`idPersona`).

## Instalación

```bash
npm install @ramiidv/arca-padron
```

## Requisitos

- Node.js >= 22.12. Solo ESM; desde CommonJS se carga con `require()` (require(esm)).
- Certificado digital X.509 y clave privada de ARCA, con cada servicio que uses asociado por
  separado: `ws_sr_constancia_inscripcion`, `ws_sr_padron_a4`, `ws_sr_padron_a10`,
  `ws_sr_padron_a13`, `ws_sr_padron_a100`. En homologación se asocian en
  [WSASS](https://wsass-homo.afip.gob.ar/wsass/portal/main.aspx) (creando una autorización por
  servicio); en producción, con el "Administrador de Relaciones de Clave Fiscal". Sin la
  asociación, WSAA responde `coe.notAuthorized` (`ArcaAuthError`). Paso a paso en
  [arca-common: Primeros pasos](../common/README.md#primeros-pasos).
- Según el [catálogo de web services de ARCA](https://www.arca.gob.ar/ws/documentacion/catalogo.asp),
  algunos servicios requieren autorizaciones y acuerdos especiales con ARCA para usarlos.

## Inicio rápido

```typescript
import { readFileSync } from 'node:fs';
import { ArcaPadron, CollectionName, FileTicketStorage, condicionIvaDesdePadron } from '@ramiidv/arca-padron';

const padron = new ArcaPadron({
  cert: readFileSync('./certs/certificado.crt', 'utf-8'),
  key: readFileSync('./certs/clave.key', 'utf-8'),
  cuit: '20123456786', // CUIT representada (quien consulta)
  production: false, // false = homologación
  ticketStorage: new FileTicketStorage('./.arca-tickets'), // recomendado
});

// Constancia de inscripción (ex A5) + condición frente al IVA para facturar
const constancia = await padron.getConstanciaInscripcion('30712345671');
const { condicionIva, motivo } = condicionIvaDesdePadron(constancia);
// condicionIva: CondicionIva.RESPONSABLE_INSCRIPTO (1), motivo: "Inscripto en IVA (impuesto 30)."
console.log(condicionIva, motivo);

// Consulta completa (A4)
const contribuyente = await padron.getPersona('20-11111111-2'); // con o sin guiones
console.log(contribuyente.tipoPersona, contribuyente.nombre);

// Consulta básica (A10)
const basico = await padron.getPersonaBasic('20111111112');
console.log(basico.domicilio?.[0]?.direccion);

// Tablas de parámetros (A100)
const provincias = await padron.getParametros(CollectionName.PROVINCIA);
console.log(provincias.length, 'provincias');
```

## Configuración

`ArcaPadronConfig` extiende `ArcaSdkConfig` de `@ramiidv/arca-common`:

| Opción                                                                                                                 | Tipo                                     | Default            | Descripción                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `cert`, `key`                                                                                                          | `string`                                 | —                  | Certificado y clave privada (PEM)                                                                             |
| `keyPassphrase`                                                                                                        | `string`                                 | —                  | Contraseña de la clave, si está encriptada                                                                    |
| `cuit`                                                                                                                 | `number \| string`                       | —                  | CUIT representada; se valida el dígito verificador y se envía como 11 dígitos                                 |
| `production`                                                                                                           | `boolean`                                | `false`            | Homologación o producción                                                                                     |
| `timeout`                                                                                                              | `number`                                 | `30000`            | Timeout HTTP (ms)                                                                                             |
| `retries` / `retryDelayMs`                                                                                             | `number`                                 | `1` / `1000`       | Reintentos ante errores transitorios (nunca ante un SOAP Fault)                                               |
| `tokenTTLMinutes`                                                                                                      | `number`                                 | `720`              | Vigencia del TRA pedida a WSAA                                                                                |
| `ticketStorage`                                                                                                        | `TicketStorage`                          | —                  | Persistencia del TA (recomendado: `FileTicketStorage` o propio)                                               |
| `clockOffsetMs`, `autoClockSkew`, `loginErrorCooldownMs`, `permanentErrorCooldownMs`, `alreadyAuthenticatedCooldownMs` |                                          |                    | Opciones de WSAA (ver `@ramiidv/arca-common`)                                                                 |
| `fetch`                                                                                                                | `typeof fetch`                           | `globalThis.fetch` | `fetch` propio (proxy, tests)                                                                                 |
| `legacyTls`                                                                                                            | `'auto' \| 'never' \| 'always'`          | `'auto'`           | Transporte TLS legacy                                                                                         |
| `onEvent`                                                                                                              | `(e: ArcaEvent) => void`                 | —                  | Eventos `auth:*` y `request:*`                                                                                |
| `wsaa`                                                                                                                 | `WsaaClient`                             | —                  | `WsaaClient` compartido con otros SDKs (mismo certificado); tiene que ser del mismo entorno (`production`)    |
| `signal`                                                                                                               | `AbortSignal`                            | —                  | Cancela todas las llamadas de la instancia (ej: al apagar la app); se combina con el `signal` de cada llamada |
| `endpoints`                                                                                                            | `{ wsaa?, a5?, a4?, a10?, a13?, a100? }` | —                  | Sobrescribe las URLs                                                                                          |

> **Persistí el Ticket de Acceso.** WSAA rechaza el login si ya emitió un TA para el certificado y
> servicio dentro del lapso de retención. Sin `ticketStorage`, un reinicio del proceso te deja sin poder consultar
> durante el lapso de retención de WSAA (minutos), con `ArcaTicketVigenteError`. Ver `TicketStorage` en
> [`@ramiidv/arca-common`](https://github.com/ramiidv/arca-sdks/tree/main/packages/common).

Si usás también `@ramiidv/arca-facturacion` con el mismo certificado, compartí el cliente WSAA:

```typescript
import { readFileSync } from 'node:fs';
import { ArcaFacturacion } from '@ramiidv/arca-facturacion';
import { ArcaPadron, FileTicketStorage } from '@ramiidv/arca-padron';

const cert = readFileSync('./certs/certificado.crt', 'utf-8');
const key = readFileSync('./certs/clave.key', 'utf-8');
const cuit = '20123456786';

const facturacion = new ArcaFacturacion({ cuit, cert, key, ticketStorage: new FileTicketStorage('./.arca-tickets') });
const padron = new ArcaPadron({ cuit, cert, key, wsaa: facturacion.wsaa });
```

Todos los métodos aceptan un último parámetro opcional `{ signal }`. Las CUIT se aceptan con o sin
guiones (`'20-11111111-2'`, `'20111111112'` o `20111111112`): se validan localmente (dígito
verificador) y se envían normalizadas; una CUIT inválida lanza `ArcaValidationError` sin llamar a
ARCA (salvo en `getConstanciasInscripcion`, ver abajo).

## API

| Método                                   | Servicio / operación                               | Devuelve                       |
| ---------------------------------------- | -------------------------------------------------- | ------------------------------ |
| `getConstanciaInscripcion(cuit)`         | `ws_sr_constancia_inscripcion` `getPersona_v2`     | `PersonaA5`                    |
| `getConstanciasInscripcion(cuits)`       | `ws_sr_constancia_inscripcion` `getPersonaList_v2` | `ListaPadron<PersonaA5>`       |
| `getPersona(cuit)`                       | `ws_sr_padron_a4` `getPersona`                     | `PersonaA4`                    |
| `getPersonaBasic(cuit)`                  | `ws_sr_padron_a10` `getPersona`                    | `PersonaA10`                   |
| `getPersonaA13(cuit)`                    | `ws_sr_padron_a13` `getPersona`                    | `PersonaA13`                   |
| `getPersonaA13V2(cuit)`                  | `ws_sr_padron_a13` `getPersonaV2`                  | `PersonaA13`                   |
| `getIdPersonaListByDocumento(documento)` | `ws_sr_padron_a13` `getIdPersonaListByDocumento`   | `ListaPadron<string>`          |
| `getParametros(collection)`              | `ws_sr_padron_a100` `getParameterCollectionByName` | `ListaPadron<ParameterRecord>` |
| `status()`                               | `dummy` de los cinco servicios (sin auth)          | `PadronStatus`                 |
| `clearAuthCache()`                       | — (ver abajo)                                      | `Promise<void>`                |

`clearAuthCache()` es async y borra los tickets de los cinco servicios (memoria y `ticketStorage`).
**Ojo:** WSAA rechaza los pedidos de un ticket nuevo durante un lapso de retención (minutos), así
que borrar un TA vigente puede dejarte sin acceso durante ese lapso. Ante un error de autorización
(`ArcaAuthError`, o `reason: 'no_autorizado'`) no lo uses: corregí la causa en ARCA. Es solo para un ticket dañado
(ej: cambiaste de certificado).

### `getConstanciaInscripcion(cuit): Promise<PersonaA5>`

Constancia de inscripción vía `ws_sr_constancia_inscripcion` (método `getPersona_v2`). Reemplaza a
Padrón A5 (`ws_sr_padron_a5`), deprecado por ARCA. Incluye datos generales, domicilio fiscal,
caracterizaciones, régimen general (impuestos, actividades, regímenes), monotributo (categoría,
impuestos, actividad, `componenteDeSociedad`) y, si ARCA no puede emitir la constancia (o una parte),
`errorConstancia` / `errorRegimenGeneral` / `errorMonotributo`: esos casos se devuelven, no se lanzan.

La excepción es la CUIT inexistente: tanto si ARCA la informa como SOAP Fault como si la informa en
`errorConstancia` ("No existe persona con ese Id"), se lanza `ArcaPadronServiceError` con
`reason: 'inexistente'`.

```typescript
const constancia = await padron.getConstanciaInscripcion('30712345671');
constancia.domicilioFiscal; // { direccion, localidad, codPostal, idProvincia, ... }
constancia.impuestos; // impuestos de ambos regímenes
constancia.monotributo?.categoria; // { idCategoria, descripcionCategoria, ... }
constancia.metadata; // { fechaHora, servidor } de la respuesta, si ARCA lo informó
```

### `getConstanciasInscripcion(cuits): Promise<ListaPadron<PersonaA5>>`

Hasta 250 CUITs (`MAX_PERSONA_LIST`) en una llamada (`getPersonaList_v2`), en el orden de
`cuits`. Los problemas de una CUIT no hacen fallar la consulta (ARCA informa por clave, manual v4.1
§3.3.3): vuelven en el `errorConstancia` de su persona.

- CUIT inexistente: `errorConstancia.error = ['No existe persona con ese Id']` (lo informa ARCA).
- CUIT inválida (formato o dígito verificador): **no se envía a ARCA**; vuelve con `idPersona` igual al
  valor recibido y el motivo en `errorConstancia.error` (`'CUIT inválido: "…". … No se consultó a ARCA.'`).
  Si todas son inválidas, no se llama a ARCA.
- Persona que ARCA devuelve con datos inválidos: vuelve con el detalle en `errorConstancia` (si trae
  alguna CUIT; si no, se omite).

Una lista vacía o de más de `MAX_PERSONA_LIST` (250) elementos lanza `ArcaValidationError`.

```typescript
const constancias = await padron.getConstanciasInscripcion(['20224107030', '27015942210']);
for (const c of constancias) {
  if (c.errorConstancia) console.warn(c.idPersona, c.errorConstancia.error);
}
```

### `condicionIvaDesdePadron(persona): { condicionIva: CondicionIva | null; motivo: string }`

Función pura (no consulta ARCA). Acepta una constancia (`PersonaA5`) o una persona de A4:

| Padrón                                                                      | `condicionIva`                             |
| --------------------------------------------------------------------------- | ------------------------------------------ |
| Monotributo activo (impuesto 20 activo; si no figura el 20, la categoría)   | `MONOTRIBUTISTA` (6)                       |
| Monotributo social (categorías 61, 99, 100 y proyectos productivos 101-104) | `MONOTRIBUTO_SOCIAL` (13)                  |
| Trabajador independiente promovido (por la descripción de la categoría)     | `MONOTRIBUTO_INDEPENDIENTE_PROMOVIDO` (16) |
| IVA (impuesto 30) `ACTIVO` / `ACTIVO EN TRAMITE` / `AC`                     | `RESPONSABLE_INSCRIPTO` (1)                |
| IVA (impuesto 30) `EXENTO` / `EXENTO EN TRAMITE` / `EX`, o impuesto 32      | `EXENTO` (4)                               |
| Impuesto 34 (IVA no alcanzado)                                              | `IVA_NO_ALCANZADO` (15)                    |
| Impuesto 33 (IVA responsable no inscripto, categoría eliminada)             | `null` (con un motivo propio)              |
| Ninguno de los anteriores, o constancia no emitida                          | `null` (con el motivo)                     |

Si figuran a la vez monotributo e IVA activos, prioriza monotributo. Los impuestos en
`BAJA PROVISORIA`, `BAJA DEFINITIVA` o `NO APORTANTE` no cuentan (un impuesto 20 en baja no se
considera monotributo aunque haya categoría). Si el padrón no alcanza, devuelve `null` en lugar de
asumir consumidor final: decidilo según la operación.

Si ARCA informó errores (`errorConstancia`, por ejemplo una CUIT limitada en los términos de la RG
3832/16; `errorRegimenGeneral`; `errorMonotributo`) o la CUIT no está activa, **el motivo lo advierte
siempre**, también cuando se pudo determinar la condición: revisalo antes de facturar.

Fuentes: manual de `ws_sr_constancia_inscripcion` v4.1 (impuestos 20 y 30, estado `AC`, categorías
de monotributo del anexo 5.3) y manual de `ws_sr_padron_a4` v1.3 §5.3 (TipoEstado). Los impuestos 32,
33 y 34 no figuran en los manuales: se reconocen por id (y el 32 y el 34, también por su descripción).
La categoría 98 (`B ASOCIADO COOPERATIVA`) se trata como monotributo común.

### `getPersonaA13(cuit)` y `getPersonaA13V2(cuit)`: `Promise<PersonaA13>`

Datos básicos vía `ws_sr_padron_a13`. `getPersona` falla con `reason: 'inactiva'` si la clave está
inactiva; `getPersonaV2` (manual A13 v1.4) devuelve los datos igual (con `estadoClave: 'INACTIVO'`).

### `getIdPersonaListByDocumento(documento): Promise<ListaPadron<string>>`

CUIT/CUIL asociados a un número de documento (A13). Acepta puntos, espacios y guiones
(`'11.709.676'`) y de 1 a 11 dígitos; vacío, no numérico o más largo lanza `ArcaValidationError`.
Devuelve `[]` si ARCA no informa claves.

### `getPersona(cuit): Promise<PersonaA4>` y `getPersonaBasic(cuit): Promise<PersonaA10>`

Datos completos (`ws_sr_padron_a4`: domicilios, impuestos, actividades, regímenes, relaciones,
categorías, emails, teléfonos) y básicos (`ws_sr_padron_a10`: datos generales, dependencia y
domicilios) de un contribuyente.

### `getParametros(collection): Promise<ListaPadron<ParameterRecord>>`

Tabla de parámetros vía `ws_sr_padron_a100`. `id`, `descripcion` y los `value` de los atributos se
devuelven tal cual los envía ARCA (`"10.50"` sigue siendo `"10.50"`). Lanza `ArcaPadronError` si la
respuesta no trae `parameterCollection`; una colección vacía devuelve `[]`. Un nombre vacío lanza
`ArcaValidationError` sin llamar a ARCA.

```typescript
const provincias = await padron.getParametros(CollectionName.PROVINCIA);
const tiposDocumento = await padron.getParametros(CollectionName.TIPO_DOCUMENTO);
```

Colecciones disponibles (enum `CollectionName`, manual A100 v2.1 anexo 5.1): `PROVINCIA`,
`TIPO_DOCUMENTO`, `TIPO_DOMICILIO`, `TIPO_CLAVE`, `TIPO_EMPRESA_JURIDICA`,
`TIPO_EMPRESA_JURIDICA_SUBGRUPO`, `TIPO_RELACION`, `TIPO_SUBTIPO_RELACION`, `TIPO_COMPONENTE_SOCIEDAD`,
`TIPO_RELACION_COMPONENTE_SOC`, `TIPO_EMAIL`, `TIPO_TELEFONO`, `TIPO_RESIDENCIA`,
`TIPO_DATO_ADICIONAL_DOMICILIO`, `ORGANISMO_INFORMANTE`, `ORGANISMO_CONTROL`, `PROVINCIA_SOCIEDAD_ORG`,
`SEXO`, `CALLE`, `LOCALIDAD`, `AUTONOMO_MONOTRIBUTO`, `REGIMEN`, `TIPO_REGIMEN`, `CARACTERIZACION`,
`TIPO_ARCHIVO`, `ACTIVIDAD_RUBRO`, `RUBRO_ACTIVIDAD`, `ACTIVIDAD_OCUPACIONAL`. La colección de
categorías de monotributo no se incluye porque su nombre aparece cortado en el manual.

### `status(): Promise<PadronStatus>`

Estado de los cinco servicios (`dummy`, sin autenticación), en paralelo. Cada uno es un
`ServiceStatus` de arca-common: `ok` es `true` solo si el servicio respondió y sus tres servidores
(`appserver`, `dbserver`, `authserver`) están en `OK`. Si respondió con alguno en otro estado (ej:
`dbserver: 'ERROR'`), `ok` es `false` y `status` tiene lo que informó ARCA; si no respondió, `ok` es
`false` sin `status`. Un servicio caído no oculta el estado de los demás.

```typescript
const estado = await padron.status();
if (estado.a4.ok) console.log('A4 disponible');
else console.error('A4 no disponible:', estado.a4.error.message, estado.a4.status);
```

Los `dummy()` de los clientes de bajo nivel devuelven lo que informa ARCA sin evaluarlo: usá
`serverStatusOk(status)` de `@ramiidv/arca-common`.

### `metadata` de las respuestas

ARCA informa en cada respuesta la fecha/hora de proceso y el servidor (`metadata`). Las personas
(`PersonaA4`, `PersonaA10`, `PersonaA13`, `PersonaA5`) lo traen en `persona.metadata`; las listas
(`ListaPadron<T>`), en `lista.metadata`, una propiedad no enumerable del array (no aparece al
iterar, serializar ni copiar el array). Si ARCA no lo informa, la propiedad no está.

### Clientes de bajo nivel

Para casos avanzados, se pueden usar los clientes de cada servicio directamente: `padron.wsaa`,
`padron.a5` (constancia: `getPersona`, `getPersonaList`), `padron.a4`, `padron.a10`, `padron.a13`
(`getPersona`, `getPersonaV2`, `getIdPersonaListByDocumento`) y `padron.a100`
(`getParameterCollectionByName`). Reciben las credenciales (`WsAuth`) como primer argumento:

```typescript
import { readFileSync } from 'node:fs';
import { ArcaPadron, SERVICE_IDS } from '@ramiidv/arca-padron';
import type { WsAuth } from '@ramiidv/arca-padron';

const padron = new ArcaPadron({
  cert: readFileSync('./certs/certificado.crt', 'utf-8'),
  key: readFileSync('./certs/clave.key', 'utf-8'),
  cuit: '20123456786',
});

const ticket = await padron.wsaa.getAccessTicket(SERVICE_IDS.a4);
const credenciales: WsAuth = { token: ticket.token, sign: ticket.sign, cuitRepresentada: '20123456786' };

const contribuyente = await padron.a4.getPersona(credenciales, '20111111112');
console.log(contribuyente.idPersona);
```

También se pueden crear sueltos, con la misma configuración que los clientes de bajo nivel de todos
los SDKs (`ServiceClientConfig` de `@ramiidv/arca-common`, reexportado junto con `ServiceTransport` y
`ServiceEndpoints`): `{ endpoint, transport? }`. El namespace lo fija cada cliente (ver `NAMESPACES`):

```typescript
import { ENDPOINTS, PadronA4Client } from '@ramiidv/arca-padron';

const a4 = new PadronA4Client({
  endpoint: ENDPOINTS.a4.testing,
  transport: { timeout: 10_000, retries: 2, onEvent: (e) => console.log(e.type) },
});
const estado = await a4.dummy();
```

### Tipos de respuesta

Los campos `xs:string` de los WSDL (códigos postales, datos adicionales, números de inscripción,
documentos) y los `xs:long` (CUIT, actividades, teléfonos) se devuelven siempre como `string`, aunque
sean numéricos. Los `xs:dateTime` (`fechaContratoSocial`, `fechaNacimiento`, `ffRelacion`,
`metadata.fechaHora`...) se devuelven como el string que envía ARCA, sin convertir a `Date`. Los
elementos `xsi:nil` se tratan como ausentes. `tipoPersona` es `'FISICA' | 'JURIDICA'`, pero el SDK no
rechaza otro valor: lo devuelve tal cual (`TipoPersonaPadron`).

#### PersonaA5 (constancia de inscripción)

```typescript
interface PersonaA5 {
  idPersona: string;
  tipoPersona?: TipoPersonaPadron;
  tipoClave?: string;
  estadoClave?: string;
  nombre?: string;
  apellido?: string;
  razonSocial?: string;
  mesCierre?: number;
  fechaContratoSocial?: string; // xs:dateTime
  fechaFallecimiento?: string; // xs:dateTime
  esSucesion?: string;
  domicilioFiscal?: DomicilioA5;
  dependencia?: DependenciaA5;
  caracterizacion?: CaracterizacionA5[];
  regimenGeneral?: { impuestos: ImpuestoA5[]; actividades: ActividadA5[]; regimenes: RegimenA5[]; categoriaAutonomo?: CategoriaA5 };
  monotributo?: {
    impuestos: ImpuestoA5[];
    actividades: ActividadA5[];
    actividadMonotributista?: ActividadA5;
    categoria?: CategoriaA5;
    componenteDeSociedad?: ComponenteSociedadA5[];
  };
  impuestos: ImpuestoA5[]; // de ambos regímenes, juntos
  errorConstancia?: { error: string[]; idPersona?: string; nombre?: string; apellido?: string };
  errorRegimenGeneral?: { error: string[]; mensaje?: string };
  errorMonotributo?: { error: string[]; mensaje?: string };
  metadata?: PadronMetadata;
}
```

#### PersonaA13

```typescript
interface PersonaA13 {
  idPersona: string;
  tipoPersona: TipoPersonaPadron;
  tipoClave?: string;
  estadoClave?: string;
  nombre?: string;
  apellido?: string;
  razonSocial?: string;
  numeroDocumento?: string;
  tipoDocumento?: string;
  formaJuridica?: string;
  mesCierre?: number;
  fechaNacimiento?: string; // xs:dateTime
  fechaFallecimiento?: string; // xs:dateTime
  fechaContratoSocial?: string; // xs:dateTime
  idActividadPrincipal?: string;
  descripcionActividadPrincipal?: string;
  periodoActividadPrincipal?: number;
  claveInactivaAsociada?: string[];
  domicilio?: DomicilioA13[]; // calle, numero, piso, oficinaDptoLocal, codigoPostal, estadoDomicilio...
  metadata?: PadronMetadata;
}
```

#### PersonaA4 (datos completos)

```typescript
interface PersonaA4 {
  idPersona: string;
  tipoPersona: TipoPersonaPadron;
  tipoClave?: string;
  estadoClave?: string;
  apellido?: string;
  nombre?: string;
  razonSocial?: string;
  numeroDocumento?: string;
  tipoDocumento?: string;
  fechaNacimiento?: string; // xs:dateTime (también las demás fecha*)
  sexo?: string;
  numeroInscripcion?: string;
  formaJuridica?: string;
  mesCierre?: number;
  fechaInscripcion?: string;
  fechaContratoSocial?: string;
  fechaFallecimiento?: string;
  fechaJubilado?: string;
  fechaVencimientoMigracion?: string;
  localidadInscripcion?: string;
  provinciaInscripcion?: string;
  organismoInscripcion?: string;
  organismoOriginante?: string;
  tipoOrganismoOriginante?: string;
  tipoResidencia?: string;
  porcentajeCapitalNacional?: number;
  cantidadSociosEmpresaMono?: number;
  leyJubilacion?: number;
  dependencia?: DependenciaA4;
  claveInactivaAsociada?: string[];
  domicilio?: DomicilioA4[];
  impuesto?: ImpuestoA4[];
  actividad?: ActividadA4[];
  regimen?: RegimenA4[];
  relacion?: RelacionA4[];
  categoria?: CategoriaA4[];
  email?: EmailA4[];
  telefono?: TelefonoA4[];
  metadata?: PadronMetadata;
}
```

#### PersonaA10 (datos básicos)

```typescript
interface PersonaA10 {
  idPersona: string;
  tipoPersona: TipoPersonaPadron;
  tipoClave?: string;
  estadoClave?: string;
  nombre?: string;
  apellido?: string;
  razonSocial?: string;
  numeroDocumento?: string;
  tipoDocumento?: string;
  idActividadPrincipal?: string;
  descripcionActividadPrincipal?: string;
  dependencia?: DependenciaA10;
  claveInactivaAsociada?: string[];
  domicilio?: DomicilioA10[];
  metadata?: PadronMetadata;
}
```

#### ParameterRecord (tablas A100) y metadata

```typescript
interface ParameterRecord {
  id: string;
  descripcion: string;
  atributos?: { name: string; value?: string }[]; // value tal cual lo envía ARCA (xs:string)
}

interface PadronMetadata {
  fechaHora?: string; // xs:dateTime
  servidor?: string;
}

type ListaPadron<T> = T[] & { metadata?: PadronMetadata };
```

## Manejo de errores

```text
Error
  └── ArcaError (base, de @ramiidv/arca-common)
        ├── ArcaResponseError (respuesta inválida de ARCA)
        │     └── ArcaPadronError (respuesta sin un dato obligatorio, ej: personaReturn sin persona)
        ├── ArcaAuthError (errores de WSAA)
        │     └── ArcaTicketVigenteError (TA vigente que no está en memoria ni en el storage)
        ├── ArcaValidationError (CUIT o documento inválido: no se llamó a ARCA)
        ├── ArcaServiceError
        │     └── ArcaPadronServiceError (errores de negocio: reason + errors + cause)
        └── ArcaSoapError (HTTP/red/timeout y SOAP Faults no reconocidos)
```

Todos tienen un `code` estable y `instanceof` funciona aunque haya más de una copia del paquete
cargada. ARCA informa los errores de negocio como SOAP Fault; el SDK reconoce los textos de los
manuales y los convierte en `ArcaPadronServiceError` con un `reason` tipado (el `ArcaSoapError`
original queda en `cause`). No se reintentan.

| `reason`        | Mensaje de ARCA                                                                                                                                                            |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inexistente`   | "La Clave (CUIT/CUIL) consultada es inexistente", "No existe persona con ese Id" (Fault, o `errorConstancia` en `getConstanciaInscripcion`)                                |
| `inactiva`      | "La clave (CUIT/CUIL) consultada se encuentra INACTIVA" (A13: usar `getPersonaA13V2`)                                                                                      |
| `id_invalido`   | "El Id de la persona no es valido"                                                                                                                                         |
| `no_autorizado` | "No autorizado, par token/sign invalido.", "Falta token y/o sign.", "Debe enviar la CUIT representada", "Este token no le permite actuar en representacion de la CUIT ..." |

Un SOAP Fault con otro texto queda como `ArcaSoapError` (con `faultString`): el SDK no emite
`reason: 'otro'`, que es solo el default del constructor de `ArcaPadronServiceError`. En la
constancia de inscripción, los motivos por los que ARCA no emite la constancia (CUIT limitada, domicilio
incompleto, etc.) no son excepciones: vienen en `errorConstancia`, `errorRegimenGeneral` y
`errorMonotributo`.

```typescript
import { readFileSync } from 'node:fs';
import {
  ArcaAuthError,
  ArcaPadron,
  ArcaPadronServiceError,
  ArcaSoapError,
  ArcaValidationError,
} from '@ramiidv/arca-padron';

const padron = new ArcaPadron({
  cert: readFileSync('./certs/certificado.crt', 'utf-8'),
  key: readFileSync('./certs/clave.key', 'utf-8'),
  cuit: '20123456786',
});

try {
  await padron.getPersona('20111111112');
} catch (error) {
  if (error instanceof ArcaValidationError) {
    console.error('CUIT inválida:', error.message);
  } else if (error instanceof ArcaPadronServiceError) {
    if (error.reason === 'inexistente') console.error('La CUIT no existe');
    else if (error.reason === 'inactiva') console.error('La CUIT está inactiva');
    else console.error(error.errors[0]?.msg);
  } else if (error instanceof ArcaAuthError) {
    console.error('Error de autenticación:', error.message);
  } else if (error instanceof ArcaSoapError) {
    console.error('Error HTTP/red:', error.statusCode, error.message);
  }
}
```

## Eventos

`onEvent` (o `padron.on(tipo, handler)`) recibe `auth:login`, `auth:cache-hit`, `auth:clock-skew`,
`auth:storage-error`, `request:start`, `request:end`, `request:retry` y `request:error` (ver
`ArcaEvent` en `@ramiidv/arca-common`):

```typescript
import { readFileSync } from 'node:fs';
import { ArcaPadron } from '@ramiidv/arca-padron';

const padron = new ArcaPadron({
  cert: readFileSync('./certs/certificado.crt', 'utf-8'),
  key: readFileSync('./certs/clave.key', 'utf-8'),
  cuit: '20123456786',
  onEvent: (evento) => {
    if (evento.type === 'request:end') console.log(`${evento.method}: ${evento.durationMs}ms`);
    if (evento.type === 'request:retry') console.log(`Reintento #${evento.attempt} de ${evento.method}`);
  },
});
```

## Entornos

| Servicio                       | Homologación                                                                 | Producción                                                               |
| ------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `ws_sr_constancia_inscripcion` | `https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5`         | `https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5`         |
| `ws_sr_padron_a4`              | `https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA4`         | `https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA4`         |
| `ws_sr_padron_a10`             | `https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA10`        | `https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA10`        |
| `ws_sr_padron_a13`             | `https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA13`        | `https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA13`        |
| `ws_sr_padron_a100`            | `https://awshomo.afip.gov.ar/sr-parametros/webservices/parameterServiceA100` | `https://aws.afip.gov.ar/sr-parametros/webservices/parameterServiceA100` |

El manual de la constancia de inscripción (v4.1) publica los hosts `awshomo.arca.gob.ar` /
`aws.arca.gob.ar`. El SDK usa `awshomo.afip.gov.ar` / `aws.afip.gov.ar`: son los `soap:address` de
los WSDL oficiales de los cinco servicios y los que publica el manual de A13 (v1.4), y responden
igual. Para usar otro host, pasá `endpoints` (con las mismas claves que `ENDPOINTS`).

Constantes exportadas, con las claves `a5`, `a4`, `a10`, `a13` y `a100`:

- `ENDPOINTS`: URLs por entorno (`{ testing, production }`, `ServiceEndpoints` de arca-common).
- `NAMESPACES`: namespace del WSDL de cada servicio.
- `SERVICE_IDS`: id de WSAA de cada servicio (`ws_sr_constancia_inscripcion`, `ws_sr_padron_a4`...).

Las URLs de WSAA están en `WSAA_ENDPOINTS` de `@ramiidv/arca-common`.

### Enums útiles

- `ImpuestoId`: `MONOTRIBUTO` (20), `IVA_RESPONSABLE_INSCRIPTO` (30), `BIENES_PERSONALES` (180),
  `EMPLEADOR` (301), `AUTONOMOS` (308)... (manuales de ARCA). `IVA_EXENTO` (32),
  `IVA_RESPONSABLE_NO_INSCRIPTO` (33) e `IVA_NO_ALCANZADO` (34) no figuran en los manuales del padrón.
- `TipoDomicilio`: `FISCAL`, `LEGAL_REAL` (`'LEGAL/REAL'`) y `LOCALES_Y_ESTABLECIMIENTOS` (solo A4), los
  valores de los manuales.
- `EstadoClave`: `ACTIVO`, `INACTIVO`, los únicos que documentan los manuales ("limitada" aparece en
  el texto de `errorConstancia`, no en `estadoClave`).
- `TipoPersona`, `CollectionName`, `Provincia`, `CondicionIva`.
- `DocTipo` son los códigos numéricos de WSFEv1, no el `tipoDocumento` string del padrón ("DNI", "LC"...).

## Ejemplos

En [examples](https://github.com/ramiidv/arca-sdks/tree/main/packages/padron/examples): constancia de
inscripción y condición frente al IVA, consultas A4 y A10, tablas de parámetros y manejo de errores.

## Licencia

MIT
