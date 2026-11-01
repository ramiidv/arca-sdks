# @ramiidv/arca-empleados

SDK de TypeScript que genera el archivo TXT de **"Ingreso masivo de datos – Relaciones laborales"** del
servicio **Simplificación Registral** de ARCA (ex AFIP): altas, bajas y modificaciones de relaciones
laborales en registros de ancho fijo de 130 posiciones.

- No hace llamadas a servicios web: ARCA no expone un web service para esto. El archivo se sube a mano
  en Simplificación Registral → Relaciones laborales → Carga Masiva → Nuevo → Cargar Archivo → Enviar.
- Fuente del formato: [Manual de Ayuda de Simplificación Registral (ARCA, feb. 2025), pág. 24](https://www.arca.gob.ar/simplificacionregistral/ayuda/documentos/SR_Manual-de-Ayuda_20250218_definitivo.pdf).

> **¿Y el F.935?** Las versiones 0.1/0.2 de este paquete hablaban de "archivos F935" con registros
> `00`–`05` separados por `|`. Ese formato no existe: el F.935 era el archivo encriptado que generaba
> el viejo aplicativo "Mi Simplificación – Ingreso Masivo de Datos v2.0", que ya no se usa. El formato
> vigente es el TXT de ancho fijo que describe el manual, y es el que genera la versión 0.3.0.

## Instalación

```bash
npm install @ramiidv/arca-empleados
```

Requiere Node.js 18 o superior. ESM.

## Uso

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
  .modificacion({ cuil: '20-34567890-6', retribucion: 1200000 });

const { buffer, contenido, lineas, resumen } = sr.generar();
writeFileSync('relaciones-laborales.txt', buffer); // ISO-8859-1 + CRLF
```

Los códigos (modalidad de contrato, obra social, situación de revista, sucursal, actividad, puesto,
convenio, categoría, tipo de servicio, modalidad de liquidación) se obtienen en el propio servicio con
**"Ver tablas informativas de códigos"**. ARCA no publica esas tablas en un documento público, así que el
SDK no las trae: valida solo que cada código sea numérico/alfanumérico y entre en su campo.

### API

| Método | Movimiento | Descripción |
| --- | --- | --- |
| `alta(datos)` | `AT` | Alta de relación laboral |
| `baja(datos)` | `BT` | Baja (la fecha de baja va en `fechaFin`) |
| `modificacion(datos)` | `MR` | Modificación |
| `novedad({ movimiento, ...datos })` | `AT`/`BT`/`MR`/`NA`/`NB` | Cualquier código; única vía para `NA` y `NB` |
| `altasMasivas([...])`, `bajasMasivas([...])`, `modificacionesMasivas([...])`, `novedadesMasivas([...])` | | **Atómicas**: validan todo y, si algo falla, no agregan nada |
| `generar()` | | `{ contenido, lineas, encoding, buffer, resumen }` |
| `registros` | | Copia de los registros agregados (modificarla no afecta al builder) |
| `cantidad`, `resumen()`, `limpiar()` | | |

Cada registro se valida y se serializa **al agregarlo**: si falla, se lanza el error y no se agrega.

Funciones sueltas (uso avanzado): `serializarRegistro`, `serializarArchivo`, `codificarArchivo`,
`formatFechaSR` (fecha → `AAAA/MM/DD`; distinto del `formatDate` de common, que da `AAAAMMDD`),
`validateRegistro`, `validateCuilTrabajador`, `DISENO_REGISTRO`, `CAMPOS_OBLIGATORIOS`.

### Configuración

```ts
new ArcaEmpleados({
  strict: true, // default
  serializacion: {
    eol: '\r\n',              // o '\n'
    eolFinal: true,           // fin de línea después del último registro
    encoding: 'latin1',       // o 'ascii'
    noRepresentables: 'error', // o 'transliterar' (quita diacríticos: Ñ→N, Ú→U)
    numericoVacio: 'ceros',   // o 'espacios'
  },
});
```

- `strict: true`: formato + reglas de negocio (CUIL con prefijo de persona física 20/23/24/27 y dígito
  verificador, campos obligatorios por movimiento, rectificación `00`–`05`, marca `0`–`9`,
  `fechaFin ≥ fechaInicio`). Todos los errores se informan juntos en `ArcaValidationError.details`.
- `strict: false`: solo formato (que el registro entre en las 130 posiciones). Datos que no son un
  objeto o un movimiento inválido dan `ArcaValidationError`; un valor que no entra en su campo da
  `ArcaSerializationError` con `field`, `desde`, `hasta` y `value`.

## Diseño de registro (oficial)

Un único tipo de registro, `01`, de 130 posiciones. Tabla transcripta del manual (pág. 24):

| Pos. | Campo (propiedad) | Tipo | Long. | Formato |
| --- | --- | --- | --- | --- |
| 1-2 | Tipo de registro | N | 2 | `01` |
| 3-4 | Código de movimiento (`movimiento`) | A | 2 | `AT`, `BT`, `MR`, `NA`, `NB` |
| 5-15 | CUIL del empleado (`cuil`) | N | 11 | |
| 16 | Marca de trabajador agropecuario (`trabajadorAgropecuario`) | A | 1 | |
| 17-19 | Modalidad de contrato (`modalidadContrato`) | N | 3 | |
| 20-29 | Fecha de inicio de rel. laboral (`fechaInicio`) | A | 10 | `AAAA/MM/DD` |
| 30-39 | Fecha de fin de rel. laboral (`fechaFin`) | A | 10 | `AAAA/MM/DD` |
| 40-45 | Código obra social (`obraSocial`) | N | 6 | |
| 46-47 | Situación de revista (`situacionRevista`) | N | 2 | |
| 48-57 | Fecha recepción telegrama de renuncia (`fechaTelegramaRenuncia`) | A | 10 | `AAAA/MM/DD` |
| 58-72 | Retribución pactada (`retribucion`) | N | 15 | |
| 73 | Modalidad de liquidación (`modalidadLiquidacion`) | N | 1 | |
| 74-78 | Sucursal – domicilio de desempeño (`sucursal`) | N | 5 | |
| 79-84 | Actividad en el domicilio de desempeño (`actividad`) | N | 6 | |
| 85-88 | Puesto desempeñado (`puesto`) | A | 4 | |
| 89-90 | Rectificación (`rectificacion`) | N | 2 | `00`–`05` |
| 91-100 | Convenio colectivo de trabajo (`cct`) | A | 10 | |
| 101-106 | Categoría profesional (`categoriaProfesional`) | N | 6 | |
| 107-109 | Tipo de servicio (`tipoServicio`) | N | 3 | |
| 110-119 | Fecha de suspensión servicios temporarios (`fechaSuspensionServiciosTemporarios`) | A | 10 | `AAAA/MM/DD` |
| 120-129 | Número formulario agropecuario (`numeroFormularioAgropecuario`) | N | 10 | |
| 130 | Marca licencia COVID / tipo de contrato CCG (`marcaCovidTipoContratoCCG`) | N | 1 | `0`–`9` |

### Qué es oficial y qué es convención

**Oficial (manual):** las posiciones, largos y tipos de la tabla; el formato `AAAA/MM/DD` de las fechas;
los códigos `AT,BT,MR,NA,NB`; rectificación `00`–`05`; la marca de la posición 130 (`0`–`9`, default
`0`); que la retribución se informa "con indicación de centavos"; que el CCT `9999/99` es "excluido de
convenio"; los datos mínimos del alta (RG 5508/2024): CUIL, domicilio de desempeño, fecha de inicio,
modalidad de contratación, obra social y fecha de fin si el contrato es a plazo fijo.

**Convención no documentada por ARCA** (la habitual en los diseños de registro de ARCA; configurable
donde se indica):

| Tema | Lo que hace el SDK | Configurable |
| --- | --- | --- |
| Numéricos | Ceros a la izquierda | — |
| Numérico no informado | Ceros (salvo rectificación y marca 130, siempre `0`) | `numericoVacio: 'espacios'` |
| Alfanuméricos | Espacios a la derecha; sin cambiar mayúsculas | — |
| Fecha no informada | 10 espacios | — |
| Retribución | 2 decimales implícitos, sin separador: `1500.5` → `000000000150050`. Más de 2 decimales es error (no se redondea) | — |
| Codificación | ISO-8859-1 (`Buffer` en latin1, 1 byte por caracter) | `encoding: 'ascii'` |
| Caracteres no representables | Error | `noRepresentables: 'transliterar'` |
| Fin de línea | CRLF, también después del último registro | `eol`, `eolFinal` |
| Fechas `Date` | Se toma la fecha calendario de Argentina (`America/Argentina/Buenos_Aires`) | Pasá un string `AAAA-MM-DD` para fijarla literal |
| Marca de trabajador agropecuario | Se escribe el caracter que pases (el manual no dice cuál) | — |

**No verificado / no documentado:**

- El significado de `NA` y `NB`. El manual los lista sin describirlos (`AT`, `BT` y `MR` = alta, baja y
  modificación coinciden con la RG 3399/2012). Se pueden usar con `novedad()`; el SDK solo exige el CUIL.
- El significado de cada valor de "Rectificación" y de la marca de la posición 130.
- Qué campos exige ARCA para `BT`, `MR`, `NA` y `NB`. El SDK exige: `AT` → `cuil`, `fechaInicio`,
  `modalidadContrato`, `obraSocial`, `sucursal`; `BT` → `cuil`, `fechaFin`; el resto → `cuil`
  (`CAMPOS_OBLIGATORIOS`). La fecha de fin obligatoria para contratos a plazo fijo no se puede chequear
  sin la tabla de modalidades. El servicio de ARCA hace su propia validación al importar el archivo y
  muestra los rechazos en el listado de novedades.

Nada se trunca en silencio: un valor que no entra en su campo, `NaN`, un número negativo o con decimales
en un campo de código, un tipo incorrecto, una fecha inexistente, un salto de línea o un caracter no
representable lanzan `ArcaSerializationError`.

## Errores

| Clase | Cuándo |
| --- | --- |
| `ArcaValidationError` (de common) | Reglas de negocio, datos que no son un objeto, movimiento inválido, `generar()` sin registros. `details[]` por campo; en las operaciones masivas el campo es `"[i].campo"` y `cause` es el error original (o un `AggregateError` con uno por registro). |
| `ArcaSerializationError` | Un valor no se puede escribir en el formato. `field`, `desde`, `hasta`, `value`, `indice` (en `serializarArchivo`), `cause`. |
| `ArcaEmpleadosError` | Base de los errores propios (acepta `{ cause }`). |

## Licencia

MIT
