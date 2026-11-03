# @ramiidv/arca-empleados

SDK de TypeScript que genera el archivo TXT de **"Ingreso masivo de datos – Relaciones laborales"** del
servicio **Simplificación Registral** de ARCA (ex AFIP): altas, bajas y modificaciones de relaciones
laborales en registros de ancho fijo de 130 posiciones.

- No hace llamadas a servicios web: ARCA no expone un web service para esto. El archivo se sube a mano
  en Simplificación Registral → Relaciones laborales → Carga Masiva → Nuevo → Cargar Archivo → Enviar.
  El manual presenta la Carga Masiva como la vía para registrar varias relaciones laborales en un solo
  archivo (pág. 21).
- Fuente del formato: [Manual de Ayuda de Simplificación Registral (ARCA, feb. 2025), pág. 24](https://www.arca.gob.ar/simplificacionregistral/ayuda/documentos/SR_Manual-de-Ayuda_20250218_definitivo.pdf).
- Lo que el manual no define (relleno, codificación, fin de línea) sigue las
  [convenciones del formato](#convenciones-del-formato). Revisá el archivo cargado en Simplificación
  Registral ("Ver el archivo cargado") antes de enviarlo.

## Instalación

```bash
npm install @ramiidv/arca-empleados
```

## Requisitos

- Node.js >= 20.19. Solo ESM; también funciona desde CommonJS porque Node ≥ 20.19 permite cargar módulos ESM con `require()`.
- Clave fiscal con acceso al servicio **Simplificación Registral** para subir el archivo (el SDK no
  necesita certificado digital).
- Los códigos (modalidad de contrato, obra social, situación de revista, sucursal, actividad, puesto,
  convenio, categoría, tipo de servicio, modalidad de liquidación) se obtienen en el propio servicio con
  **"Ver tablas informativas de códigos"**. ARCA no publica esas tablas en un documento público, así que
  el SDK no las trae: valida solo que cada código sea numérico/alfanumérico y entre en su campo.

## Inicio rápido

```ts
import { writeFileSync } from 'node:fs';
import { ArcaEmpleados } from '@ramiidv/arca-empleados';

const sr = new ArcaEmpleados();

sr.alta({
  cuil: '20-12345678-6',
  fechaInicio: '2026-11-02',
  modalidadContrato: 8,
  obraSocial: '126205',
  sucursal: 1,
  retribucion: 850000.5,
  cct: '9999/99',
})
  .baja({ cuil: '27-11111111-7', fechaInicio: '2024-03-01', fechaFin: '2026-10-31' })
  .modificacion({ cuil: '20-34567890-6', fechaInicio: '2025-01-02', retribucion: 1200000 });

const { buffer, contenido, lineas, resumen } = sr.generar();
writeFileSync('relaciones-laborales.txt', buffer); // ISO-8859-1 + CRLF
```

## Configuración

```ts
import { ArcaEmpleados } from '@ramiidv/arca-empleados';

const sr = new ArcaEmpleados({
  strict: true, // default
  fechaReferencia: '2026-11-01', // "hoy" para el límite de 90 días del alta (default: fecha actual en Argentina)
  serializacion: {
    eol: '\r\n', // o '\n'
    eolFinal: true, // fin de línea después del último registro
    encoding: 'latin1', // o 'ascii'
    noRepresentables: 'error', // o 'transliterar' (con encoding 'ascii': Ñ→N, Ú→U)
    numericoVacio: 'ceros', // o 'espacios' (ver advertencia abajo)
  },
});
```

| Opción                           | Default         | Descripción                                                                                                                                     |
| -------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `strict`                         | `true`          | Formato + reglas de negocio. `false`: solo formato.                                                                                             |
| `fechaReferencia`                | hoy (Argentina) | Fecha de la novedad para validar que el alta no supere los 90 días de anticipación.                                                             |
| `serializacion.eol`              | `'\r\n'`        | Fin de línea.                                                                                                                                   |
| `serializacion.eolFinal`         | `true`          | Fin de línea después del último registro.                                                                                                       |
| `serializacion.encoding`         | `'latin1'`      | ISO-8859-1 o `'ascii'`.                                                                                                                         |
| `serializacion.noRepresentables` | `'error'`       | Con `'transliterar'`, un caracter no representable en el encoding pierde el diacrítico (con `'ascii'`: Ñ→N); si aún no es representable, lanza. |
| `serializacion.numericoVacio`    | `'ceros'`       | Cómo se escribe un numérico no informado: `'ceros'` o `'espacios'` (salvo rectificación y marca 130, siempre `0`).                              |

- `strict: true`: formato + reglas de negocio: CUIL con prefijo de persona física 20/23/24/27 y dígito
  verificador; campos obligatorios por movimiento (`CAMPOS_OBLIGATORIOS`); rectificación `00`–`05`;
  `fechaFin ≥ fechaInicio`; en un alta, `fechaInicio` como máximo 90 días después de `fechaReferencia`
  (manual, pág. 19). Todos los errores se informan juntos en `ArcaValidationError.details`, incluidos
  los de formato.
- `strict: false`: solo formato (que el registro entre en las 130 posiciones). Un valor que no entra en
  su campo da `ArcaSerializationError` (el primero que falla).
- **En ambos modos** se rechaza (`ArcaValidationError`) una propiedad que no es del diseño de registro:
  un nombre mal escrito (`retribucon`, `obraSocal`) dejaría el campo vacío en silencio.

> **Modificaciones y bajas (`MR`, `BT`):** informá todos los campos vigentes de la relación. Con el
> default (`numericoVacio: 'ceros'`) un numérico no informado se escribe en ceros (ej: `000000` en obra
> social); con `numericoVacio: 'espacios'` va en blanco.

## API

| Método                                                                                                  | Movimiento               | Descripción                                                         |
| ------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------- |
| `alta(datos)`                                                                                           | `AT`                     | Alta de relación laboral                                            |
| `baja(datos)`                                                                                           | `BT`                     | Baja (la fecha de baja va en `fechaFin`)                            |
| `modificacion(datos)`                                                                                   | `MR`                     | Modificación                                                        |
| `novedad({ movimiento, ...datos })`                                                                     | `AT`/`BT`/`MR`/`NA`/`NB` | Cualquier código; única vía para `NA` y `NB`                        |
| `altasMasivas([...])`, `bajasMasivas([...])`, `modificacionesMasivas([...])`, `novedadesMasivas([...])` |                          | **Atómicas**: validan todo y, si algo falla, no agregan nada        |
| `generar()`                                                                                             |                          | `{ contenido, lineas, encoding, buffer, resumen }`                  |
| `registros`                                                                                             |                          | Copia de los registros agregados (modificarla no afecta al builder) |
| `cantidad`, `resumen()`, `limpiar()`                                                                    |                          |                                                                     |

Cada registro se valida y se serializa **al agregarlo**: si falla, se lanza el error y no se agrega.

Campos obligatorios en modo `strict` (`CAMPOS_OBLIGATORIOS`):

| Movimiento       | Campos                                                               |
| ---------------- | -------------------------------------------------------------------- |
| `AT`             | `cuil`, `fechaInicio`, `modalidadContrato`, `obraSocial`, `sucursal` |
| `BT`             | `cuil`, `fechaInicio`, `fechaFin`                                    |
| `MR`, `NA`, `NB` | `cuil`, `fechaInicio`                                                |

`fechaInicio` es obligatoria en todos los movimientos por la nota de la pantalla de ingreso masivo
(manual, pág. 23): "fecha inicio de vínculo son obligatorios para todos los eventos". Los datos mínimos
del alta son los de la RG 5508/2024. La fecha de fin es obligatoria en un alta a plazo fijo y ARCA la
rechaza en un contrato por tiempo indeterminado (manual, pág. 19), pero el SDK no lo puede chequear sin
la tabla de modalidades.

Funciones sueltas (uso avanzado): `serializarRegistro`, `serializarArchivo`, `codificarArchivo`,
`formatFechaSR` (fecha → `AAAA/MM/DD`; distinto del `formatDate` de common, que da `AAAAMMDD`),
`validateRegistro(registro, opcionesSerializacion?, { fechaReferencia? })`, `validateCuilTrabajador`,
`DISENO_REGISTRO`, `CAMPOS_OBLIGATORIOS`.

### Diseño de registro (oficial)

Un único tipo de registro, `01`, de 130 posiciones. Tabla transcripta del manual (pág. 24):

| Pos.    | Campo (propiedad)                                                                 | Tipo | Long. | Formato                      |
| ------- | --------------------------------------------------------------------------------- | ---- | ----- | ---------------------------- |
| 1-2     | Tipo de registro                                                                  | N    | 2     | `01`                         |
| 3-4     | Código de movimiento (`movimiento`)                                               | A    | 2     | `AT`, `BT`, `MR`, `NA`, `NB` |
| 5-15    | CUIL del empleado (`cuil`)                                                        | N    | 11    |                              |
| 16      | Marca de trabajador agropecuario (`trabajadorAgropecuario`)                       | A    | 1     |                              |
| 17-19   | Modalidad de contrato (`modalidadContrato`)                                       | N    | 3     |                              |
| 20-29   | Fecha de inicio de rel. laboral (`fechaInicio`)                                   | A    | 10    | `AAAA/MM/DD`                 |
| 30-39   | Fecha de fin de rel. laboral (`fechaFin`)                                         | A    | 10    | `AAAA/MM/DD`                 |
| 40-45   | Código obra social (`obraSocial`)                                                 | N    | 6     |                              |
| 46-47   | Situación de revista (`situacionRevista`)                                         | N    | 2     |                              |
| 48-57   | Fecha recepción telegrama de renuncia (`fechaTelegramaRenuncia`)                  | A    | 10    | `AAAA/MM/DD`                 |
| 58-72   | Retribución pactada (`retribucion`)                                               | N    | 15    |                              |
| 73      | Modalidad de liquidación (`modalidadLiquidacion`)                                 | N    | 1     |                              |
| 74-78   | Sucursal – domicilio de desempeño (`sucursal`)                                    | N    | 5     |                              |
| 79-84   | Actividad en el domicilio de desempeño (`actividad`)                              | N    | 6     |                              |
| 85-88   | Puesto desempeñado (`puesto`)                                                     | A    | 4     |                              |
| 89-90   | Rectificación (`rectificacion`)                                                   | N    | 2     | `00`–`05`                    |
| 91-100  | Convenio colectivo de trabajo (`cct`)                                             | A    | 10    |                              |
| 101-106 | Categoría profesional (`categoriaProfesional`)                                    | N    | 6     |                              |
| 107-109 | Tipo de servicio (`tipoServicio`)                                                 | N    | 3     |                              |
| 110-119 | Fecha de suspensión servicios temporarios (`fechaSuspensionServiciosTemporarios`) | A    | 10    | `AAAA/MM/DD`                 |
| 120-129 | Número formulario agropecuario (`numeroFormularioAgropecuario`)                   | N    | 10    |                              |
| 130     | Marca licencia COVID / tipo de contrato CCG (`marcaCovidTipoContratoCCG`)         | N    | 1     | `0`–`9`                      |

**Oficial (manual):** las posiciones, largos y tipos de la tabla; el formato `AAAA/MM/DD` de las fechas;
los códigos `AT,BT,MR,NA,NB`; rectificación `00`–`05`; la marca de la posición 130 (`0`–`9`, default
`0`); que la retribución se informa "con indicación de centavos"; que el CCT `9999/99` es "excluido de
convenio"; los datos mínimos del alta (RG 5508/2024); que la fecha de inicio es obligatoria en todos los
eventos (pág. 23); que el alta se puede comunicar hasta 90 días antes del inicio (pág. 19).

**Convención del SDK** (la habitual en los diseños de registro de ARCA, configurable donde se indica):
numéricos con ceros a la izquierda; alfanuméricos con espacios a la derecha y sin cambiar mayúsculas;
fechas no informadas como 10 espacios; un `Date` se convierte a la fecha calendario de Argentina (pasá un
string `AAAA-MM-DD` para fijarla literal).

Nada se trunca en silencio: un valor que no entra en su campo, `NaN`, un número negativo o con decimales
en un campo de código, un tipo incorrecto, una fecha inexistente, un salto de línea o un caracter no
representable dan error. Con el builder en modo `strict` (default) llegan como `ArcaValidationError`
(uno por campo en `details`); con `strict: false` o con `serializarRegistro`/`serializarArchivo`, como
`ArcaSerializationError`.

## Convenciones del formato

El manual solo publica la tabla del diseño de registro. Lo que no define se resuelve así:

| Tema                             | Lo que hace el SDK                                                                                                                                                                         | Configurable                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| Relleno de campos vacíos         | Numéricos no informados en ceros (salvo rectificación y marca 130, siempre `0`); alfanuméricos y fechas en espacios. Ver [Configuración](#configuración) para `MR`/`BT`. | `numericoVacio: 'espacios'`    |
| Formato de la retribución        | 2 decimales implícitos, sin separador: `1500.5` → `000000000150050`. Más de 2 decimales es error (no se redondea). El manual solo dice "con indicación de centavos".                       | —                              |
| Codificación                     | ISO-8859-1 (`Buffer` en latin1, 1 byte por caracter); caracteres no representables dan error.                                                                                              | `encoding`, `noRepresentables` |
| Fin de línea                     | CRLF, también después del último registro.                                                                                                                                                 | `eol`, `eolFinal`              |
| Significado de `NA` y `NB`       | El manual los lista sin describirlos (`AT`, `BT` y `MR` coinciden con la RG 3399/2012). Se aceptan con `novedad()`.                                                                        | —                              |
| Marca de trabajador agropecuario | Se escribe el caracter que pases: el manual no dice cuál es el valor de la marca.                                                                                                          | —                              |
| Rectificación y marca 130        | Se validan los rangos, pero el manual no describe el significado de cada valor.                                                                                                            | —                              |
| Campos exigidos por movimiento   | Los de `CAMPOS_OBLIGATORIOS`. ARCA hace su propia validación al importar y muestra los rechazos en el listado de novedades.                                                                | `strict: false`                |

## Manejo de errores

| Clase                             | Cuándo                                                                                                                                                                                                                                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ArcaValidationError` (de common) | Propiedades desconocidas, datos que no son un objeto, movimiento inválido, `generar()` sin registros y, en modo `strict` (default), reglas de negocio y errores de formato. `details[]` por campo; en las operaciones masivas el campo es `"[i].campo"` y `cause` es el error original (o un `AggregateError` con uno por registro). |
| `ArcaSerializationError`          | Un valor no se puede escribir en el formato, con `strict: false` o con `serializarRegistro`/`serializarArchivo`. `field`, `desde`, `hasta`, `value`, `indice` (en `serializarArchivo`), `cause`.                                                                                                                                     |
| `ArcaEmpleadosError`              | Base de los errores propios (acepta `{ cause }`).                                                                                                                                                                                                                                                                                    |

```ts
import { ArcaEmpleados, ArcaSerializationError, ArcaValidationError } from '@ramiidv/arca-empleados';

const datos = { cuil: '20-12345678-7', fechaInicio: '2026-02-30', obraSocial: '1234567' };

// strict (default): formato y reglas de negocio juntos en details.
try {
  new ArcaEmpleados().alta(datos);
} catch (e) {
  if (e instanceof ArcaValidationError) {
    for (const d of e.details) console.error(`${d.field}: ${d.message}`); // fechaInicio, obraSocial, cuil, ...
  }
}

// strict: false: solo formato; el primer valor que no se puede escribir.
try {
  new ArcaEmpleados({ strict: false }).alta(datos);
} catch (e) {
  if (e instanceof ArcaSerializationError) {
    console.error(e.field, e.desde, e.hasta, e.message); // fechaInicio 20 29 ...
  }
}
```

## Ejemplos

En [`examples/`](https://github.com/ramiidv/arca-sdks/tree/main/packages/empleados/examples): alta,
baja y modificación, carga masiva y manejo de errores.

## Licencia

MIT
