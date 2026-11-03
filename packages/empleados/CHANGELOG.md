# Changelog

## 0.5.1

### Patch Changes

- 1cccecc: Documentación corregida: con el builder en modo `strict` (default) los errores de formato llegan como `ArcaValidationError` (en `details`); `ArcaSerializationError` sale con `strict: false` o con `serializarRegistro`/`serializarArchivo`. El ejemplo de manejo de errores ahora muestra los dos casos. `noRepresentables: 'transliterar'` solo cambia los caracteres no representables en el encoding (con `latin1` se conservan Ñ y Ú). Referencias al manual corregidas (pág. 19 para el plazo de 90 días del alta y la fecha de fin).
- Updated dependencies [1cccecc]
- Updated dependencies [bd57c86]
  - @ramiidv/arca-common@0.8.0

## 0.5.0

### Minor Changes

- 0630298: Auditoría contra el manual de Simplificación Registral.
  
  **Cambios de comportamiento:**
  
  - Las propiedades que no son del diseño de registro se rechazan con `ArcaValidationError`, en modo `strict` y no estricto (en `serializarRegistro`, `ArcaSerializationError`). Antes se ignoraban: un nombre mal escrito como `retribucon` u `obraSocal` generaba el registro con el campo vacío.
  - `fechaInicio` es obligatoria en todos los movimientos en modo `strict` (`BT`, `MR`, `NA` y `NB` además de `AT`), según la nota de la pantalla de ingreso masivo: "fecha inicio de vínculo son obligatorios para todos los eventos" (manual, pág. 23).
  - En modo `strict`, un alta (`AT`) con `fechaInicio` más de 90 días posterior a la fecha de la novedad se rechaza (manual, pág. 18). La fecha de referencia es la de hoy en Argentina, configurable con la nueva opción `fechaReferencia` (también en `validateRegistro(registro, opciones, { fechaReferencia })`).
  
  Otros cambios:
  
  - `validateRegistro` con un movimiento como `"constructor"` o `"toString"` daba `TypeError`; ahora da `ArcaValidationError`.
  - `VALORES_MARCA_COVID_CCG` queda deprecado (el campo N(1) ya acota los valores).
  - Nuevo tipo `OpcionesValidacion`.
  - README: secciones de requisitos (Node >= 20.19, solo ESM, `require(esm)`) y "Convenciones del formato" (relleno de campos vacíos, formato de la retribución, codificación y fin de línea, `NA`/`NB`, marca agropecuaria), y una advertencia sobre los numéricos no informados en `MR`/`BT` con `numericoVacio: 'ceros'` (el default no cambia).

### Patch Changes

- Updated dependencies [b152f08]
  - @ramiidv/arca-common@0.7.0

## 0.4.1

### Patch Changes

- Updated dependencies [87f58c1]
  - @ramiidv/arca-common@0.6.0

## 0.4.0

### Minor Changes

- bed68e8: Paquetes solo ESM y Node >= 20.19. `arca-common`, `arca-facturacion` y
  `arca-padron` dejan de publicar un build CommonJS: desde CommonJS se cargan con
  `require()` (require(esm), Node >= 20.19 / 22.12). Todos los paquetes pasan a
  requerir Node >= 20.19.0 (Node 18 y 20 sin soporte). El código vive ahora en el
  monorepo `arca-sdks`.

### Patch Changes

- Updated dependencies [8c02c30]
- Updated dependencies [f8bd053]
- Updated dependencies [242fb5f]
- Updated dependencies [fd438bc]
- Updated dependencies [bed68e8]
- Updated dependencies [20ecf7d]
- Updated dependencies [b86db00]
  - @ramiidv/arca-common@0.5.0

## 0.3.0 (2026-11-01)

Reescritura del serializador según el diseño de registro oficial del
[Manual de Ayuda de Simplificación Registral (ARCA, feb. 2025), pág. 24](https://www.arca.gob.ar/simplificacionregistral/ayuda/documentos/SR_Manual-de-Ayuda_20250218_definitivo.pdf).
Las versiones anteriores generaban un formato inventado que ARCA no acepta.

### Breaking
- El archivo pasa a ser TXT de **ancho fijo de 130 posiciones** con un único tipo de registro `01` y
  código de movimiento `AT`/`BT`/`MR`/`NA`/`NB`. Se eliminaron el header `00`, los registros `01`–`05`
  delimitados por `|` y todo lo asociado: datos complementarios, CBU, relaciones familiares y domicilio
  de explotación (`datosComplementarios()`, `cbu()`, `relacionFamiliar()`, `domicilioExplotacion()`),
  que no forman parte del formato oficial.
- Se abandona el nombre "F935" (era el archivo encriptado del viejo aplicativo "Mi Simplificación –
  Ingreso Masivo de Datos v2.0", ya discontinuado). Tipos nuevos: `DatosRelacionLaboral`,
  `RegistroRelacionLaboral`, `ArchivoIngresoMasivo`, `ResumenIngresoMasivo`, `OpcionesSerializacion`.
  Se eliminaron `F935Registro*`, `F935Archivo`, `F935Output`, `F935Resumen`, `AltaEmpleado`,
  `BajaEmpleado`, `ModificacionEmpleado`, `DatosComplementarios`, `DatosCBU`, `RelacionFamiliar`,
  `DomicilioExplotacion` (sin alias: la forma de los datos cambió por completo).
- `ArcaEmpleadosConfig`: se quitan `cuitEmpleador` y `razonSocial` (el archivo no los lleva); se agregan
  `serializacion` y se mantiene `strict`. El constructor no requiere argumentos.
- Campos renombrados según el manual: `modalidadContratacion` → `modalidadContrato`,
  `actividadEconomica` → `actividad`, `fechaBaja` → `fechaFin` (en `BT`), `remuneracion` → `retribucion`,
  `puestoDesempenado` → `puesto`, `convenioColectivo` → `cct`; `motivoBaja` y `domicilioExplotacion` no
  existen en el formato (el domicilio se informa con el código de `sucursal`).
- `generar()` devuelve `{ contenido, lineas, encoding, buffer, resumen }`.
- Constantes: se eliminaron todas las tablas sin fuente verificable (`ModalidadContratacion`,
  `SituacionRevista`, `MotivoBaja`, `NivelEducacion`, `EstadoCivil`, `TipoRelacionFamiliar`, `Provincia`
  local, `TipoServicio`, `ModalidadLiquidacion`, `TipoOperacion`, `TipoCuenta`, `Escolaridad`, sus
  `*_DESCRIPCION` y `MODALIDADES_CON_FECHA_FIN`). Quedan solo los valores del manual: `CodigoMovimiento`,
  `VALORES_RECTIFICACION`, `VALORES_MARCA_COVID_CCG`, `LONGITUD_REGISTRO`, `TIPO_REGISTRO`.
- Ya no se re-exportan los validadores de common (`validateCuil`, `normalizeCuil`, `formatCuil`,
  `validateCBU`, `validateFecha`, `validateFechaRango`); usá `@ramiidv/arca-common` directamente.
  `formatDate` (que daba `DDMMAAAA`) se reemplaza por `formatFechaSR` (`AAAA/MM/DD`), para no chocar
  con el `formatDate` de common.
- Serializadores reemplazados por `serializarRegistro`, `serializarArchivo` y `codificarArchivo`.
- Dependencia `@ramiidv/arca-common` `^0.4.0`.

### Features
- API por movimiento: `alta` (AT), `baja` (BT), `modificacion` (MR) y `novedad` (cualquier código,
  incluidos `NA`/`NB`), más `altasMasivas`, `bajasMasivas`, `modificacionesMasivas` y
  `novedadesMasivas`, **atómicas** (si un registro falla no se agrega ninguno; los errores llevan
  el índice: `"[i].campo"`).
- Opciones de serialización configurables: fin de línea (CRLF por defecto), fin de línea final,
  codificación (`latin1` por defecto, o `ascii`), transliteración de caracteres no representables y
  relleno de numéricos vacíos.
- `generar().buffer` (ISO-8859-1) listo para escribir a disco; `codificarArchivo()`.
- `DISENO_REGISTRO` (tabla del manual), `CAMPOS_OBLIGATORIOS`, `validateRegistro`,
  `validateCuilTrabajador` (prefijos 20/23/24/27 + dígito verificador).
- `ArcaSerializationError` con `field`, `desde`, `hasta`, `value`, `indice` y `cause`;
  `ArcaEmpleadosError` acepta `{ cause }`.
- `package.json`: `sideEffects: false`, `exports.import`, `prepublishOnly` con clean + build + test.

### Fixes
- Ningún valor se trunca en silencio: exceso de largo, `NaN`, `Infinity`, negativos, decimales en
  códigos, más de 2 decimales en la retribución, tipos incorrectos, fechas inexistentes, caracteres de
  control y caracteres no representables lanzan `ArcaSerializationError`.
- Fechas en formato `AAAA/MM/DD` (antes `DDMMAAAA`) y sin corrimientos por zona horaria: los `Date` se
  toman en hora de Argentina y los strings `AAAA-MM-DD` se respetan literalmente.
- `strict: false` con datos inválidos daba `TypeError: Cannot read properties of undefined`; ahora da
  `ArcaValidationError` / `ArcaSerializationError` explícitos.
- `registros` devolvía los objetos internos (mutables); ahora devuelve copias, y los datos se copian
  al agregarlos.
- README y `llms.txt` decían `@ramiidv/arca-empleados-sdk`; el paquete es `@ramiidv/arca-empleados`.
  `repository`/`bugs` apuntan a `github.com/ramiidv/arca-empleados`.

## 0.2.0 (2026-06-03)

### Fixes
- Dependencia `@ramiidv/arca-common` `^0.2.0` (corrige el dígito verificador de CBU); tests de CBU y
  ejemplos con CBUs válidos.
- `publishConfig.access: public`; `homepage` a arca-sdk.dev.

### Chore
- Workflows de CI (Node 18/20/22) y de release.

## 0.1.0 (2026-03-31)

### Features
- Initial release
- F935 file generation for employee management (Mi Simplificación)
- Alta (hiring), Baja (termination), Modificación (changes)
- Datos complementarios, CBU registration, relaciones familiares, domicilio de explotación
- Bulk operations (altasMasivas, bajasMasivas)
- Full CUIL/CBU/date validation (from @ramiidv/arca-common)
- Record-level validation for all operation types
- Complete F935 serialization with pipe-delimited format
