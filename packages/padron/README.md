# @ramiidv/arca-padron

SDK de TypeScript para los web services de Padron de ARCA (ex AFIP): Constancia de Inscripcion
(`ws_sr_constancia_inscripcion`, ex A5), A4 (datos completos), A10 y A13 (datos basicos) y A100
(tablas de parametros). Incluye `condicionIvaDesdePadron` para obtener la condicion frente al IVA
que pide la factura electronica (`CondicionIVAReceptorId`).

## Caracteristicas

- Unica dependencia: `@ramiidv/arca-common` (WSAA, SOAP, validadores); usa `fetch` nativo (Node 18+)
- ESM y CommonJS (funciona con `import` y con `require`, incluido TypeScript con `"module": "CommonJS"`)
- TypeScript estricto con tipos completos
- Cache automatico de tokens WSAA, con persistencia opcional (`ticketStorage`) y ajuste de reloj
- Cancelacion con `AbortSignal` (global o por llamada)
- Reintentos con backoff exponencial ante errores transitorios (nunca ante un SOAP Fault)
- Errores de negocio tipados: `ArcaPadronServiceError` con `reason` (`inexistente`, `inactiva`, ...)
- Validacion local de CUIT (digito verificador) antes de llamar a ARCA
- Sistema de eventos para monitoreo

## Instalacion

```bash
npm install @ramiidv/arca-padron
```

## Inicio rapido

```typescript
import { readFileSync } from 'fs';
import { ArcaPadron, FileTicketStorage } from '@ramiidv/arca-padron';

const padron = new ArcaPadron({
  cert: readFileSync('./cert.pem', 'utf-8'),
  key: readFileSync('./key.pem', 'utf-8'),
  cuit: '20123456786',
  production: false, // false = homologacion
  ticketStorage: new FileTicketStorage('./.arca-tickets'), // recomendado
});

// Constancia de inscripcion (ex A5) + condicion frente al IVA para facturar
import { condicionIvaDesdePadron } from '@ramiidv/arca-padron';
const constancia = await padron.getConstanciaInscripcion('30712345671');
const { condicionIva, motivo } = condicionIvaDesdePadron(constancia);
// condicionIva: CondicionIva.RESPONSABLE_INSCRIPTO (1), motivo: "Inscripto en IVA (impuesto 30)."

// Consulta completa (A4)
const contribuyente = await padron.getPersona('20-11111111-2'); // con o sin guiones
console.log(contribuyente.tipoPersona, contribuyente.nombre);

// Consulta basica (A10)
const contribuyenteBasico = await padron.getPersonaBasic('20111111112');
console.log(contribuyenteBasico.domicilio?.[0]?.direccion);

// Tablas de parametros (A100)
import { CollectionName } from '@ramiidv/arca-padron';
const provincias = await padron.getParametros(CollectionName.PROVINCIA);
console.log(provincias.length, 'provincias');
```

## Configuracion

`ArcaPadronConfig` extiende `ArcaBaseConfig` de `@ramiidv/arca-common`:

```typescript
interface ArcaPadronConfig extends ArcaBaseConfig {
  // De ArcaBaseConfig:
  cert: string;                 // Certificado X.509 en formato PEM
  key: string;                  // Clave privada en formato PEM
  cuit: string | number;        // CUIT representada (se valida el digito verificador)
  production?: boolean;         // default: false (homologacion)
  timeout?: number;             // ms por request (default: 30000)
  retries?: number;             // reintentos ante errores transitorios (default: 1)
  retryDelayMs?: number;        // backoff exponencial (default: 1000)
  tokenTTLMinutes?: number;     // vigencia pedida a WSAA (default: 720)
  onEvent?: (event: ArcaEvent) => void;
  ticketStorage?: TicketStorage;     // persistencia de tickets WSAA (recomendado)
  clockOffsetMs?: number;            // relojARCA - relojLocal en ms (default: 0)
  autoClockSkew?: boolean;           // default: true
  loginErrorCooldownMs?: number;     // default: 60000
  fetch?: typeof fetch;              // fetch propio (proxy, mTLS, tests)
  legacyTls?: 'auto' | 'never' | 'always';
  // Propias de Padron:
  signal?: AbortSignal;              // cancela todas las llamadas de la instancia
  wsaa?: WsaaClient;                 // WsaaClient compartido (ej: arca.wsaa de arca-facturacion)
  endpoints?: { wsaa?: string; a5?: string; a4?: string; a10?: string; a13?: string; a100?: string };
}
```

> **Persisti el Ticket de Acceso.** WSAA rechaza el login si ya hay un TA vigente para el
> certificado y servicio. Sin `ticketStorage`, un reinicio del proceso te deja sin poder consultar
> hasta que venza (hasta 12 horas, `ArcaTicketVigenteError`). Ver `TicketStorage` en
> [`@ramiidv/arca-common`](https://github.com/ramiidv/arca-common).

Si usas tambien `@ramiidv/arca-facturacion` con el mismo certificado, comparti el cliente WSAA:

```typescript
const arca = new Arca({ cuit, cert, key, ticketStorage });
const padron = new ArcaPadron({ cuit, cert, key, wsaa: arca.wsaa });
```

Todos los metodos aceptan un ultimo parametro opcional `{ signal }`. Las CUIT se aceptan con o sin
guiones (`'20-11111111-2'`, `'20111111112'` o `20111111112`): se validan localmente (digito
verificador) y se envian normalizadas; una CUIT invalida lanza `ArcaValidationError` sin llamar a ARCA.

Todas las operaciones de Padron son consultas (no modifican nada en ARCA): se pueden reintentar sin
riesgo.

## API

### Metodos de alto nivel

#### `getConstanciaInscripcion(cuit): Promise<PersonaA5>`

Constancia de inscripcion via `ws_sr_constancia_inscripcion` (metodo `getPersona_v2`). Reemplaza a
Padron A5 (`ws_sr_padron_a5`), deprecado por ARCA. Incluye datos generales, domicilio fiscal,
caracterizaciones, regimen general (impuestos, actividades, regimenes), monotributo (categoria,
impuestos, actividad, `componenteDeSociedad`) y, si ARCA no puede emitir la constancia (o una parte),
`errorConstancia` / `errorRegimenGeneral` / `errorMonotributo`: esos casos se devuelven, no se lanzan.

```typescript
const constancia = await padron.getConstanciaInscripcion('30712345671');
constancia.domicilioFiscal;        // { direccion, localidad, codPostal, idProvincia, ... }
constancia.impuestos;              // impuestos de ambos regimenes
constancia.monotributo?.categoria; // { idCategoria, descripcionCategoria, ... }
```

#### `getConstanciasInscripcion(cuits): Promise<PersonaA5[]>`

Hasta 250 CUITs en una llamada (`getPersonaList_v2`). Las CUITs inexistentes no hacen fallar la
consulta: vuelven como una persona con `errorConstancia.error = ['No existe persona con ese Id']`.

```typescript
const constancias = await padron.getConstanciasInscripcion(['20224107030', '27015942210']);
for (const c of constancias) {
  if (c.errorConstancia) console.warn(c.idPersona, c.errorConstancia.error);
}
```

#### `condicionIvaDesdePadron(persona): { condicionIva: CondicionIva | null; motivo: string }`

Funcion pura (no consulta ARCA). Acepta una constancia (`PersonaA5`) o una persona de A4:

| Padron | `condicionIva` |
| --- | --- |
| Monotributo activo (impuesto 20 activo; si no figura el 20, la categoria) | `MONOTRIBUTISTA` (6) |
| Monotributo social (categorias 61, 99, 100 y proyectos productivos 101-104) | `MONOTRIBUTO_SOCIAL` (13) |
| Trabajador independiente promovido (por la descripcion de la categoria) | `MONOTRIBUTO_INDEPENDIENTE_PROMOVIDO` (16) |
| IVA (impuesto 30) `ACTIVO` / `ACTIVO EN TRAMITE` / `AC` | `RESPONSABLE_INSCRIPTO` (1) |
| IVA (impuesto 30) `EXENTO` / `EXENTO EN TRAMITE` / `EX`, o impuesto 32 | `EXENTO` (4) |
| Impuesto 34 (IVA no alcanzado) | `IVA_NO_ALCANZADO` (15) |
| Ninguno de los anteriores, constancia no emitida o con errores | `null` (con el motivo) |

Los impuestos en `BAJA PROVISORIA`, `BAJA DEFINITIVA` o `NO APORTANTE` no cuentan (un impuesto 20
en baja no se considera monotributo aunque haya categoria). Si el padron no alcanza, devuelve `null`
en lugar de asumir consumidor final: decidilo segun la operacion. Si ARCA informo
`errorRegimenGeneral` / `errorMonotributo`, el motivo los incluye.

Fuentes: manual de `ws_sr_constancia_inscripcion` v4.1 (impuestos 20 y 30, estado `AC`, categorias
de monotributo del anexo 5.3) y manual de `ws_sr_padron_a4` v1.3 §5.3 (TipoEstado). Los impuestos 32
y 34 no figuran en los manuales: se reconocen por id o por su descripcion. La categoria 98
(`B ASOCIADO COOPERATIVA`) se trata como monotributo comun.

#### `getPersonaA13(cuit): Promise<PersonaA13>` y `getPersonaA13V2(cuit)`

Datos basicos via `ws_sr_padron_a13`. `getPersona` falla con `reason: 'inactiva'` si la clave esta
inactiva; `getPersonaV2` (manual A13 v1.4) devuelve los datos igual (con `estadoClave: 'INACTIVO'`).

#### `getIdPersonaListByDocumento(documento): Promise<string[]>`

CUIT/CUIL asociados a un numero de documento (A13). Acepta puntos y espacios (`'11.709.676'`).
Devuelve `[]` si ARCA no informa claves.

#### `getPersona(cuit): Promise<PersonaA4>`

Obtiene los datos completos de un contribuyente via ws_sr_padron_a4. Autentica automaticamente con WSAA.

```typescript
const contribuyente = await padron.getPersona('20111111112');
```

#### `getPersonaBasic(cuit): Promise<PersonaA10>`

Obtiene los datos basicos de un contribuyente via ws_sr_padron_a10.

```typescript
const contribuyenteBasico = await padron.getPersonaBasic('20111111112');
```

#### `getParametros(collection: string): Promise<ParameterRecord[]>`

Obtiene una tabla de parametros via ws_sr_padron_a100. `id`, `descripcion` y los `value` de los
atributos se devuelven tal cual los envia ARCA (`"10.50"` sigue siendo `"10.50"`). Lanza
`ArcaPadronError` si la respuesta no trae `parameterCollection`; una coleccion vacia devuelve `[]`.

```typescript
import { CollectionName } from '@ramiidv/arca-padron';

const provincias = await padron.getParametros(CollectionName.PROVINCIA);
const tiposDocumento = await padron.getParametros(CollectionName.TIPO_DOCUMENTO);
const tiposRelacion = await padron.getParametros(CollectionName.TIPO_RELACION);
```

Colecciones disponibles (enum `CollectionName`, manual A100 v2.1 anexo 5.1): `PROVINCIA`, `TIPO_DOCUMENTO`, `TIPO_DOMICILIO`, `TIPO_CLAVE`, `TIPO_EMPRESA_JURIDICA`, `TIPO_EMPRESA_JURIDICA_SUBGRUPO`, `TIPO_RELACION`, `TIPO_SUBTIPO_RELACION`, `TIPO_COMPONENTE_SOCIEDAD`, `TIPO_RELACION_COMPONENTE_SOC`, `TIPO_EMAIL`, `TIPO_TELEFONO`, `TIPO_RESIDENCIA`, `TIPO_DATO_ADICIONAL_DOMICILIO`, `ORGANISMO_INFORMANTE`, `ORGANISMO_CONTROL`, `PROVINCIA_SOCIEDAD_ORG`, `SEXO`, `CALLE`, `LOCALIDAD`, `AUTONOMO_MONOTRIBUTO`, `REGIMEN`, `TIPO_REGIMEN`, `CARACTERIZACION`, `TIPO_ARCHIVO`, `ACTIVIDAD_RUBRO`, `RUBRO_ACTIVIDAD`, `ACTIVIDAD_OCUPACIONAL`.
La coleccion de categorias de monotributo no se incluye porque su nombre aparece cortado en el manual.

#### `status(): Promise<PadronStatus>`

Verifica el estado de los servicios (`dummy`, no requiere autenticacion). Consulta los cinco en
paralelo con `Promise.allSettled`: cada uno es un `PromiseSettledResult<ServerStatus>`, asi que un
servicio caido no oculta el estado de los demas.

```typescript
const estado = await padron.status();
if (estado.a4.status === 'fulfilled') console.log(estado.a4.value.appserver); // "OK"
else console.error('A4 caido:', estado.a4.reason);
```

### Acceso a clientes de bajo nivel

Para casos avanzados, se pueden usar los clientes individuales directamente:

```typescript
const padron = new ArcaPadron({ /* ... */ });

// Obtener ticket de acceso manualmente
const ticket = await padron.wsaa.getAccessTicket('ws_sr_padron_a4');

const credenciales = {
  Token: ticket.token,
  Sign: ticket.sign,
  CuitRepresentada: '20123456786',
};

// Llamar directamente al servicio
const contribuyente = await padron.a4.getPersona(credenciales, '20111111112');
// Tambien: padron.a5.getPersona / getPersonaList, padron.a13.getPersonaV2, padron.a100.getParameterCollectionByName
```

Clientes disponibles: `padron.wsaa`, `padron.a5` (constancia), `padron.a4`, `padron.a10`,
`padron.a13`, `padron.a100`.

## Tipos de respuesta

Los campos `xs:string` de los WSDL (codigos postales, datos adicionales, numeros de inscripcion,
documentos) y los `xs:long` (CUIT, actividades, telefonos) se devuelven siempre como `string`, aunque
sean numericos. Los elementos `xsi:nil` se tratan como ausentes.

### PersonaA4 (datos completos)

```typescript
interface PersonaA4 {
  idPersona: string;
  tipoPersona: 'FISICA' | 'JURIDICA';
  tipoClave?: string;
  estadoClave?: string;
  apellido?: string;
  nombre?: string;
  razonSocial?: string;
  numeroDocumento?: string;
  tipoDocumento?: string;
  fechaNacimiento?: string;
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
}
```

### PersonaA10 (datos basicos)

```typescript
interface PersonaA10 {
  idPersona: string;
  tipoPersona: 'FISICA' | 'JURIDICA';
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
}
```

### ParameterRecord (tablas A100)

```typescript
interface ParameterRecord {
  id: string;
  descripcion: string;
  atributos?: ParameterAttribute[];
}

interface ParameterAttribute {
  name: string;
  value?: string; // tal cual lo envia ARCA (xs:string)
}
```

## Manejo de errores

```
Error
  └── ArcaError (base, de @ramiidv/arca-common)
        ├── ArcaPadronError (respuesta de ARCA sin un dato obligatorio, ej: personaReturn sin persona)
        ├── ArcaAuthError (errores de WSAA)
        │     └── ArcaTicketVigenteError (TA vigente que no esta en memoria ni en el storage)
        ├── ArcaValidationError (CUIT o documento invalido: no se llamo a ARCA)
        ├── ArcaServiceError
        │     └── ArcaPadronServiceError (errores de negocio: reason + errors + cause)
        └── ArcaSoapError (HTTP/red/timeout y SOAP Faults no reconocidos)
```

Todos tienen un `code` estable y `instanceof` funciona aunque haya mas de una copia del paquete
cargada. ARCA informa los errores de negocio como SOAP Fault; el SDK reconoce los textos de los
manuales y los convierte en `ArcaPadronServiceError` con un `reason` tipado (el `ArcaSoapError`
original queda en `cause`). No se reintentan.

| `reason` | Mensaje de ARCA |
| --- | --- |
| `inexistente` | "La Clave (CUIT/CUIL) consultada es inexistente", "No existe persona con ese Id" |
| `inactiva` | "La clave (CUIT/CUIL) consultada se encuentra INACTIVA" (A13: usar `getPersonaA13V2`) |
| `id_invalido` | "El Id de la persona no es valido" |
| `no_autorizado` | "No autorizado, par token/sign invalido.", "Falta token y/o sign.", "Debe enviar la CUIT representada", "Este token no le permite actuar en representacion de la CUIT ..." |

Un SOAP Fault con otro texto queda como `ArcaSoapError` (con `faultString`). En la constancia de
inscripcion, los motivos por los que ARCA no emite la constancia (CUIT limitada, domicilio
incompleto, etc.) no son excepciones: vienen en `errorConstancia`, `errorRegimenGeneral` y
`errorMonotributo`.

```typescript
import {
  ArcaAuthError,
  ArcaPadronServiceError,
  ArcaSoapError,
  ArcaValidationError,
} from '@ramiidv/arca-padron';

try {
  await padron.getPersona('20111111112');
} catch (error) {
  if (error instanceof ArcaValidationError) {
    console.error('CUIT invalida:', error.message);
  } else if (error instanceof ArcaPadronServiceError) {
    if (error.reason === 'inexistente') console.error('La CUIT no existe');
    else if (error.reason === 'inactiva') console.error('La CUIT esta inactiva');
    else console.error(error.errors[0]?.msg);
  } else if (error instanceof ArcaAuthError) {
    console.error('Error de autenticacion:', error.message);
  } else if (error instanceof ArcaSoapError) {
    console.error('Error HTTP/red:', error.statusCode, error.message);
  }
}
```

## Eventos

El SDK emite eventos para monitoreo y debugging:

```typescript
const padron = new ArcaPadron({
  // ...
  onEvent: (evento) => {
    switch (evento.type) {
      case 'auth:login':
        console.log(`Login para ${evento.service}`);
        break;
      case 'auth:cache-hit':
        console.log(`Token reutilizado para ${evento.service} (${evento.source})`);
        break;
      case 'request:start':
        console.log(`Inicio ${evento.method}`);
        break;
      case 'request:end':
        console.log(`Fin ${evento.method} (${evento.durationMs}ms)`);
        break;
      case 'request:retry':
        console.log(`Reintento #${evento.attempt}`);
        break;
      case 'request:error':
        console.log(`Error: ${evento.error.message}`);
        break;
    }
  },
});
```

## Enums utiles

```typescript
import {
  Provincia,
  TipoDomicilio,
  TipoPersona,
  ImpuestoId,
  CollectionName,
} from '@ramiidv/arca-padron';

// Verificar si el contribuyente esta inscripto en IVA (mejor: condicionIvaDesdePadron)
const tieneIva = contribuyente.impuesto?.some(
  (imp) => imp.idImpuesto === ImpuestoId.IVA_RESPONSABLE_INSCRIPTO && imp.estado?.startsWith('ACTIVO')
);

// ImpuestoId.MONOTRIBUTO = 20, IVA_RESPONSABLE_INSCRIPTO = 30, BIENES_PERSONALES = 180,
// EMPLEADOR = 301, AUTONOMOS = 308 (manuales de ARCA). IVA_EXENTO (32) e IVA_NO_ALCANZADO (34)
// no figuran en los manuales del padron.
//
// `TipoDocumento` esta deprecado: es `DocTipo` (codigos numericos de WSFEv1), no el
// `tipoDocumento` string del padron ("DNI", "LC"...).
```

## Requisitos

- Node.js >= 18 (soporte nativo de `fetch`)
- Certificado digital emitido por ARCA/AFIP
- Autorizacion para los servicios web correspondientes: `ws_sr_constancia_inscripcion`,
  `ws_sr_padron_a4`, `ws_sr_padron_a10`, `ws_sr_padron_a13`, `ws_sr_padron_a100` (cada uno por separado)

## Licencia

MIT
