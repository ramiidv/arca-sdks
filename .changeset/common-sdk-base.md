---

## '@ramiidv/arca-common': minor

Nueva base para los SDKs: `ArcaSdkBase` (CUIT, `WsaaClient` propio o
compartido, transporte, eventos `on`/`off`, `signal` global, endpoints por
entorno, `clearAuthCache`), `SoapServiceClient`, `createWsaaClient`,
`transportOptions` y `parseServerStatus`. Nuevo subpath
`@ramiidv/arca-common/testing` con `mockFetch`, `mockFetchByMethod`,
`soapResponse`, `soapFault`, `fakeTicketStorage`, `testCert`, `requestParams`,
`childOrder` y más, sin dependencias de un framework de tests.
