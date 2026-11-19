# Corridas en ARCA homologación

Registro de las corridas de los tests de integración contra ARCA homologación,
el entorno de pruebas de ARCA. Cada corrida sale de `npm run test:homologacion`,
que escribe un reporte sin CUIT, certificados, claves, tokens ni CAE: solo la
fecha, el commit, las versiones de los paquetes, el perfil del contribuyente, los
servicios autorizados y el resultado de cada test.

## Correrlos

1. Generá un certificado de homologación en WSASS y autorizalo en los servicios
   que quieras probar ([arca-common: Primeros pasos](packages/common/README.md#primeros-pasos)).
2. Cargá las variables `ARCA_TEST_*` en un `.env` en la raíz, con
   `ARCA_TEST_PERFIL` (`ri` o `monotributo`). Están descriptas en
   [Desarrollo](README.md#desarrollo). Para los cruces entre un responsable
   inscripto y un monotributista, sumá el segundo usuario con el prefijo
   `ARCA_TEST_CONTRAPARTE_`.
3. `npm install && npm run test:homologacion`. Los tests corren con un guard de
   red que bloquea cualquier conexión a un host que no sea de homologación.

El reporte queda en `homologacion-reporte.md`. Si faltan las credenciales o el
perfil, no se genera y el comando termina con error. Tampoco se escribe si el
texto tiene una CUIT o un PEM. Un archivo de test que no carga cuenta como una
falla.

## Reportar una corrida

Abrí un issue con la plantilla
[Reporte de homologación](https://github.com/ramiidv/arca-sdks/issues/new?template=reporte-homologacion.yml)
y pegá el contenido de `homologacion-reporte.md`. Las corridas reportadas se
suman a la lista de abajo.

## Corridas

De la más reciente a la más antigua.

### 2026-11-19 · ri + monotributo (cruces)

- Commit: `d973cdc`
- Paquetes: agro 0.8.3, cdc 0.8.3, common 0.10.1, empleados 0.6.1, facturacion 7.0.3, fecred 0.8.2, mtxca 0.8.3, padron 0.9.2, sire 0.7.3
- Node: v24.18.0
- Servicios autorizados: sire-ws, ws_sr_constancia_inscripcion, ws_sr_padron_a10, ws_sr_padron_a100, ws_sr_padron_a13, ws_sr_padron_a4, wscdc, wscpe, wsfe, wsfecred, wsfex, wslpg, wsmtxca
- Resultado: 25 pasaron, 0 fallaron, 0 salteados (8 archivos)

<details><summary>Detalle por test</summary>

| Paquete | Test | Resultado |
| --- | --- | --- |
| agro | integración WSCPE/WSLPG (homologación) > status (dummy de WSCPE y WSLPG) | pasó |
| agro | integración WSCPE/WSLPG (homologación) > WSCPE: consultarProvincias | pasó |
| agro | integración WSCPE/WSLPG (homologación) > WSLPG: tipoGranoConsultar | pasó |
| cdc | integración WSCDC (homologación) > status (ComprobanteDummy) | pasó |
| cdc | integración WSCDC (homologación) > getTiposCbte | pasó |
| facturacion | integración WSFEv1 (homologación, perfil ri) > status (FEDummy/FEXDummy) | pasó |
| facturacion | integración WSFEv1 (homologación, perfil ri) > login con TA persistido: una segunda instancia reutiliza el ticket del storage | pasó |
| facturacion | integración WSFEv1 (homologación, perfil ri) > factura B a consumidor final con precios finales | pasó |
| facturacion | integración WSFEv1 (homologación, perfil ri) > factura A a un CUIT responsable inscripto | pasó |
| facturacion | integración WSFEv1 (homologación, perfil ri) > nota de crédito asociada a la factura A | pasó |
| facturacion | integración WSFEv1 (homologación, perfil ri) > recuperarComprobante sobre un número ya emitido → autorizado con el mismo CAE | pasó |
| facturacion | integración WSFEv1 (homologación, perfil ri) > recuperarComprobante sobre el próximo número → no_emitido | pasó |
| fecred | integración WSFECRED (homologación) > status (dummy) | pasó |
| fecred | integración WSFECRED (homologación) > consultarTiposRetenciones | pasó |
| mtxca | integración WSMTXCA (homologación) > status (dummy) | pasó |
| mtxca | integración WSMTXCA (homologación) > getTiposComprobante | pasó |
| padron | integración Padrón (homologación) > status (dummy de cada servicio) | pasó |
| padron | integración Padrón (homologación) > getParametros (A100, provincias) | pasó |
| sire | integración SIRE (homologación) > status (dummy) | pasó |
| cruces | cruces RI ↔ monotributista (homologación) > el RI le emite una Factura A al monotributista | pasó |
| cruces | cruces RI ↔ monotributista (homologación) > el monotributista le emite una Factura C al RI | pasó |
| cruces | cruces RI ↔ monotributista (homologación) > el RI constata la Factura C del monotributista | pasó |
| cruces | cruces RI ↔ monotributista (homologación) > el monotributista constata la Factura A del RI | pasó |
| cruces | cruces RI ↔ monotributista (homologación) > una constatación con otro importe total se rechaza (110) | pasó |
| cruces | cruces RI ↔ monotributista (homologación) > WSFEX: el Id es por CUIT (el mismo Id se autoriza en las dos) | pasó |

</details>

### 2026-11-19 · monotributo

- Commit: `d973cdc`
- Paquetes: agro 0.8.3, cdc 0.8.3, common 0.10.1, empleados 0.6.1, facturacion 7.0.3, fecred 0.8.2, mtxca 0.8.3, padron 0.9.2, sire 0.7.3
- Node: v24.18.0
- Servicios autorizados: sire-ws, ws_sr_constancia_inscripcion, ws_sr_padron_a10, ws_sr_padron_a100, ws_sr_padron_a13, ws_sr_padron_a4, wscdc, wscpe, wsfe, wsfecred, wsfex, wslpg, wsmtxca
- Resultado: 19 pasaron, 0 fallaron, 6 salteados (8 archivos)

<details><summary>Detalle por test</summary>

| Paquete | Test | Resultado |
| --- | --- | --- |
| agro | integración WSCPE/WSLPG (homologación) > status (dummy de WSCPE y WSLPG) | pasó |
| agro | integración WSCPE/WSLPG (homologación) > WSCPE: consultarProvincias | pasó |
| agro | integración WSCPE/WSLPG (homologación) > WSLPG: tipoGranoConsultar | pasó |
| cdc | integración WSCDC (homologación) > status (ComprobanteDummy) | pasó |
| cdc | integración WSCDC (homologación) > getTiposCbte | pasó |
| facturacion | integración WSFEv1 (homologación, perfil monotributo) > status (FEDummy/FEXDummy) | pasó |
| facturacion | integración WSFEv1 (homologación, perfil monotributo) > login con TA persistido: una segunda instancia reutiliza el ticket del storage | pasó |
| facturacion | integración WSFEv1 (homologación, perfil monotributo) > factura C a consumidor final con precios finales | pasó |
| facturacion | integración WSFEv1 (homologación, perfil monotributo) > factura C a un CUIT responsable inscripto | pasó |
| facturacion | integración WSFEv1 (homologación, perfil monotributo) > nota de crédito asociada a la factura C | pasó |
| facturacion | integración WSFEv1 (homologación, perfil monotributo) > recuperarComprobante sobre un número ya emitido → autorizado con el mismo CAE | pasó |
| facturacion | integración WSFEv1 (homologación, perfil monotributo) > recuperarComprobante sobre el próximo número → no_emitido | pasó |
| fecred | integración WSFECRED (homologación) > status (dummy) | pasó |
| fecred | integración WSFECRED (homologación) > consultarTiposRetenciones | pasó |
| mtxca | integración WSMTXCA (homologación) > status (dummy) | pasó |
| mtxca | integración WSMTXCA (homologación) > getTiposComprobante | pasó |
| padron | integración Padrón (homologación) > status (dummy de cada servicio) | pasó |
| padron | integración Padrón (homologación) > getParametros (A100, provincias) | pasó |
| sire | integración SIRE (homologación) > status (dummy) | pasó |
| cruces | cruces RI ↔ monotributista (homologación) > el RI le emite una Factura A al monotributista | salteado |
| cruces | cruces RI ↔ monotributista (homologación) > el monotributista le emite una Factura C al RI | salteado |
| cruces | cruces RI ↔ monotributista (homologación) > el RI constata la Factura C del monotributista | salteado |
| cruces | cruces RI ↔ monotributista (homologación) > el monotributista constata la Factura A del RI | salteado |
| cruces | cruces RI ↔ monotributista (homologación) > una constatación con otro importe total se rechaza (110) | salteado |
| cruces | cruces RI ↔ monotributista (homologación) > WSFEX: el Id es por CUIT (el mismo Id se autoriza en las dos) | salteado |

</details>

### 2026-11-03 · ri

Registrada a mano, antes de `npm run test:homologacion`: los 19 tests de
integración de entonces (sin perfil ni cruces) pasaron con un responsable
inscripto autorizado en los 13 servicios.
