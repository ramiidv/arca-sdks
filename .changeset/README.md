# Changesets

Cada PR que cambia un paquete publicado agrega un changeset (`npm run changeset`):
qué paquetes cambian y si es patch, minor o major. Al mergear a `main`, el
workflow de release abre (o actualiza) el PR "chore: version packages"; al mergear ese
PR, y con la aprobación del environment `npm-publish`, se publican en npm los
paquetes con versión nueva, en orden de dependencias.
