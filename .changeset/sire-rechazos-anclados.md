---
"@ramiidv/arca-sire": patch
---

Los Faults `soapenv:Server` solo se clasifican como rechazo (`ArcaSireServiceError`) cuando el mensaje empieza con `XML invalido` o `Request mal formado`. Antes bastaba con que contuviera "no cumple el schema" en cualquier posición, y un error de sistema con ese texto podía informarse como rechazo seguro en lugar de `ArcaSoapError` con `uncertain: true`. Los Faults `soapenv:Client` siguen siendo rechazos.
