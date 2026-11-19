---
"@ramiidv/arca-mtxca": patch
---

- `new MtxcaClient()` sin `endpoint` (o con uno que no es `https://`) lanza `ArcaValidationError`, como los clientes de los demás paquetes, en lugar de `TypeError`.
- Docs: `autorizarAjusteIVA` e `informarAjusteIVACAEA` validan, además del XSD, el dígito verificador de las CUIT/CUIL (tipo de documento 80/86, también en compradores). No aplican las reglas de importes de `autorizar`.
