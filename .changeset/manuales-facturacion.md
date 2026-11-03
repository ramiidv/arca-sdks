---
'@ramiidv/arca-facturacion': minor
---

Revisión contra el manual de WSFEv1 v4.8 y el de WSFEX 3.1.1.

**Cambio de comportamiento: redondeo mitad al par.** Los importes que calcula la API simplificada (`calcularTotales`, `facturar`, `facturarExpo`, el QR) y los decimales de la API raw se redondean con Round Half Even, el criterio de los manuales de WSFEv1 y WSFEX: `1.005` → `1.00`, `1.015` → `1.02`.

WSFEX:

- Con `canMisMonExt: 'S'` en moneda extranjera la cotización se puede omitir: ARCA registra la cotización oficial (validación 1602). `FacturarExpoOpts.cotizacion` y `WsfexInvoice.monedaCtz` pasan a ser opcionales.
- Nuevas validaciones locales: PES con cotización 1 (1601), cotización de hasta 4 enteros (1600), `canMisMonExt` solo en Factura E en moneda extranjera, tampoco `'N'` con PES (1605), la Factura E solo asocia remitos 88, 89, 91, 993 y 994 (1755), un solo asociado salvo remitos 88/89 (1754) y las NC/ND de servicios llevan asociados (2047).

WSFEv1:

- `notaCredito`/`notaDebito` infieren el tipo también cuando el original es una nota, un recibo u otro comprobante de la clase (`FCE_NOTA_DEBITO_A` → `FCE_NOTA_CREDITO_A`, `RECIBO_B` → `NOTA_CREDITO_B`). En FCE, una NC no se infiere desde otra NC ni una ND desde otra ND (validaciones 10157 y 10183). `NOTA_CREDITO_MAP`/`NOTA_DEBITO_MAP` salen de la nueva tabla `CBTES_ASOCIABLES` (validación 10040).
- B al No Categorizado (23000000000) con otros tributos y sin el tributo 13 ya no se rechaza localmente: es la validación 10283, que solo observa. Sin tributos sigue siendo la 10067.
- Nuevas validaciones locales: condición frente al IVA del receptor en clase B y en el tipo 49 (10243); tipo 49 con concepto 1 y opcionales 91 y 93 (10085, 10078, 10084); `docTipo` 31 (FCI CNV) con `docNro` de hasta 4 dígitos y condición 15 (10271, 10272); `docTipo` 99 con `docNro` 0, `docNro` obligatorio con cualquier otro `docTipo` y el tipo 49 sin `docTipo` 99 (10015); el receptor y los compradores no pueden ser el emisor (10069, 10140); `cbtesAsoc` solo en los tipos y con los asociados del manual (10040); `opcionales` solo en los tipos que los admiten (10068); opcionales de Seguros de Caución 2901/2902 (10273-10276, 10280, 10281); NC/ND FCE con `cuit` y `fecha` en cada asociado (10151, 10158), que sin anulación asocian una sola factura FCE y, además, remitos (10156/10157), y asociados de una anulación, sin remitos (10183); FCE sin el receptor 23000000000 (10178) y con `vtoPago` no anterior a hoy (10164); compradores solo en A, B, C o M (no FCE), con concepto 1, CUIT de 11 dígitos y porcentajes de 2 decimales (10134, 10150, 10194, 10139, 10143); con empate en el mayor porcentaje alcanza con que el receptor sea uno de ellos (10146); cotización de hasta 4 enteros.
- Documentación: citas del manual WSFEv1 v4.8 y WSFEX 3.1.1.
