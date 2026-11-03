---
'@ramiidv/arca-agro': patch
---

Correcciones a partir de pruebas contra homologación de ARCA.

WSCPE:

- **Corrección:** las consultas de listas (`consultarCPEPorDestino`, `consultarCPEPPendientesDeResolucion`, `consultarCPEDGPendienteActivacion`, `consultarCPEEmitidasDestinoDGPendientesActivacion` y las paramétricas, como `consultarPlantas` y `consultarPlantasDG`) devuelven `[]` cuando el único error que informa ARCA es el 800 ("No existen solicitudes para los parámetros indicados"), en lugar de lanzar `ArcaAgroServiceError`. Un 550 al lado no cambia el resultado; con otro error se lanza con todos. En las emisiones y en las consultas de una CPE el 800 sigue siendo un error.

WSLPG:

- `liquidacionAutorizar` y `validateLiquidacion` validan localmente reglas del manual §2.4.2.3: `esLiquidacionPropia` si liquida el comprador una compraventa (1609), `actuaCorredor` si no es liquidación propia (1617), `codGradoEnt` y/o `factorEnt` (1631), `valGradoEnt` solo con `codGradoEnt` (1634) y, con `certificados`, sin `pesoNetoSinCertificado` ni procedencia sin certificado (1644, 1646). Sin `certificados`, un `pesoNetoSinCertificado` sin `codLocalidadProcedenciaSinCertificado` ni `codProvProcedenciaSinCertificado` se rechaza (1646: no está en el manual, lo responde homologación).
- El ejemplo de `liquidacionAutorizar` del README y de `examples/liquidacion-granos.ts` informa `esLiquidacionPropia`, `actuaCorredor`, el grado entregado y la procedencia sin certificado: el anterior lo rechazaba ARCA (1609, 1631, 1646).
