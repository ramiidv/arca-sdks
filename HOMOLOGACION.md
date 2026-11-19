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
