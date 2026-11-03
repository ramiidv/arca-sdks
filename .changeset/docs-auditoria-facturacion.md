---
'@ramiidv/arca-facturacion': minor
---

Validaciones locales nuevas del manual de WSFEv1 y de WSFEX (lanzan `ArcaValidationError` sin llamar a ARCA):

- Facturas FCE MiPyME (201, 206, 211): los opcionales 2101 (CBU) y 27 (`SCA` o `ADC`) son obligatorios y no se acepta el 22 (validaciones 10168, 10216, 10214/10215, 10171).
- NC/ND FCE MiPyME: el opcional 22 (anulación `S` o `N`) es obligatorio y no se aceptan 2101, 2102 ni 27 (validaciones 10173, 10167, 10172).
- FCE: el 2101 son 22 dígitos y el 2102 (alias) de 6 a 20 caracteres (validaciones 10165, 10166).
- Los comprobantes que no son FCE no aceptan los opcionales 2101, 2102, 22 ni 27 (validación 10169).
- Factura E (19) de bienes (`tipoExpo` 1): `incoterms` es obligatorio (validación 1640), e `incotermsDes` requiere `incoterms` (1641).

Documentación: glosario y pasos previos (certificado, relación con el servicio, punto de venta), `permanentErrorCooldownMs` y las opciones que se ignoran con `wsaa` compartido, campos opcionales de `FacturaResult`, `clearAuthCache()` async, ejemplo FCE con el opcional 27 y ejemplos con `ticketStorage`, código de país y CUIT país de EE.UU. corregidos (212, 55000002126) y ejemplo de emisión segura sin importar de `@ramiidv/arca-common` y guardando la fecha como `YYYYMMDD` (`intento.fecha`) para poder reenviarla después de persistirla en JSON.
