# Changelog

## 0.1.0 (2026-03-31)

### Features
- Initial release
- WSCPE (Carta de Porte Electronica) - Electronic bill of lading for grain transport
- WSCTG (Codigo de Trazabilidad de Granos) - Grain traceability codes
- WSLPG (Liquidacion Primaria de Granos) - Primary grain settlement/liquidation
- Auto-handles WSAA authentication for all 3 services
- Retry with exponential backoff on transient errors
- Event system for logging/debugging
