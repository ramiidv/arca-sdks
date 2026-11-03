---
'@ramiidv/arca-mtxca': minor
---

Revisión contra el manual de WSMTXCA v0.25.8.

**Corrección:** `informarComprobanteCAEA` ya no rechaza localmente un ítem con condición de IVA 1, 2 o 3 e `importeIVA` distinto de 0: en CAEA esa regla solo observa (1122). Los mensajes de las validaciones de ítems en CAEA citan su numeración (1100-1121) en lugar de la de CAE.

Nuevas validaciones locales (CAE / CAEA):

- Datos adicionales de FCE: 21 (CBU) y 27 (`ADC`/`SCA`) obligatorios en 201 y 206, 22 (`S`/`N`) obligatorio en las notas, 21-23 solo en FCE y con `c1` (326-336 / 925-934); dato adicional 5 (337-340 / 935-938).
- Comprobantes asociados de FCE: la factura asocia 88, 91, 990 o 995; la nota lleva un solo asociado FCE, con `cuit` y que sea el del emisor; en una anulación, qué tipo revierte cada nota (208, 209, 210, 212, 214 / 808, 809, 810, 812, 814). Período de asociados: no en notas FCE ni en las facturas 1, 51, 201 y 206 (159, 162 / 777, 780).
- Compradores (CAE): más de uno, con el receptor informado, CUIT/CUIL/CDI, sin repetir, porcentaje mayor a 0 y menor a 100, distintos del emisor, suman 100, con el receptor como uno de los de mayor porcentaje (420-429). En FCE no se admiten (433). Los documentos se comparan como se envían (number o string, con o sin guiones).
- Sujeto No Categorizado (23000000000): solo en 6, 7 u 8 con `condicionIVAReceptor` 7 (342 / 889) y, en CAE, con el tributo 13 si hay importe gravado (145).
- CAEA: concepto (713), receptor de clase A y FCE con CUIT (718, 733) y subtotales de IVA (715).
- `informarAjusteIVACAEA` exige `fechaHoraGen` (754).
- Largos del manual: `codigoMtx` 13, `otrosTributos[].descripcion` 25, `c1`-`c6` 50, `actividades` de hasta 6 dígitos.
- `validateComprobanteCAE(c, { cuitEmisor })` y `validateComprobanteCAEA(c, { cuitEmisor })` aceptan el CUIT del emisor (nuevo tipo `ContextoReglas`), que habilita las reglas 426 y 210 / 810; `autorizar` e `informarComprobanteCAEA` lo pasan solos.

`validarImportes: false` sigue desactivando todas las reglas de negocio locales (no solo las de importes); ahora lo dicen el JSDoc y el README.

El pre-redondeo propio de los decimales se reemplazó por el de `dec()` de common, que ahora redondea mitad al par.
