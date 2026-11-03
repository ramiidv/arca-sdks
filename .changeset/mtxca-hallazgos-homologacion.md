---
'@ramiidv/arca-mtxca': patch
---

- **Condiciones de IVA 8 (5%) y 9 (2,5%)**: `consultarCondicionesIVA` las devuelve y ARCA autoriza comprobantes con ítems y subtotales de IVA en esas condiciones, pero la validación local los rechazaba ("condición de IVA 8 desconocida", 400, 110). Se agregan `CodigoCondicionIVA.IVA_5` (8) y `CodigoCondicionIVA.IVA_2_5` (9), sus alícuotas en `ALICUOTAS_IVA` (0,05 y 0,025), y cuentan como gravadas (110) y con subtotal de IVA (127, 400, 403, 715).
- **Sujeto No Categorizado (145)**: ARCA rechaza con 145 solo cuando el comprobante no trae `otrosTributos`; con otro tributo y sin el 13 lo autoriza con la observación 150. La validación local ya no rechaza ese segundo caso.
- **Período de comprobantes asociados (162 / 780)**: ARCA rechaza el período también en la Factura B (6), aunque el manual no la nombre. La validación local ahora lo rechaza en todas las facturas (1, 6, 51, 201 y 206); las notas de débito y crédito lo siguen admitiendo.
