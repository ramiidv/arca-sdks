import { readFileSync } from 'node:fs';
import type { Schema } from '@ramiidv/arca-common/schema';
import { checkSchemaAgainstXsd, loadXsdTypes } from '@ramiidv/arca-common/testing';
import { describe, expect, it } from 'vitest';
import * as C from '../src/cpe-schemas.js';
import * as L from '../src/lpg-schemas.js';
import { list, obj, str, wrapped } from '../src/schema.js';

const wsdl = (file: string) => readFileSync(new URL(`../wsdl/${file}`, import.meta.url), 'utf8');

type Direction = 'request' | 'response';
type Case = [string, Schema, string, Direction, (readonly string[])?];

// ---------------------------------------------------------------------------
// WSCPE: `<Op>Req` = { auth, solicitud }, `<Op>Resp` = { respuesta }
// ---------------------------------------------------------------------------

const cpeTypes = loadXsdTypes(wsdl('wscpe.wsdl'));

/** Auth que arma `CpeClient` (no es un schema del DSL). */
const CPE_AUTH: Schema = { token: str(), sign: str(), cuitRepresentada: str() };
const cpeReq = (solicitud?: Schema): Schema =>
  solicitud ? { auth: obj(CPE_AUTH), solicitud: obj(solicitud) } : { auth: obj(CPE_AUTH) };
const cpeResp = (respuesta: Schema): Schema => ({ respuesta: obj(respuesta) });
const cpeLista = (item: string, schema: Schema): Schema => cpeResp({ [item]: list(obj(schema), 0) });

const cpeCases: Case[] = [
  // Tipos compartidos (también se recorren dentro de las operaciones)
  ['CartaPorte', C.CARTA_PORTE, 'CartaPorte', 'request'],

  // Requests
  ['autorizarCPEAutomotor', cpeReq(C.AUTORIZAR_AUTOMOTOR), 'AutorizarCPEAutomotorReq', 'request'],
  ['consultarCPEAutomotor', cpeReq(C.CONSULTAR_CPE), 'ConsultarCPEAutomotorReq', 'request'],
  ['editarCPEAutomotor', cpeReq(C.EDITAR_AUTOMOTOR), 'EditarCPEAutomotorReq', 'request'],
  ['editarCPEConfirmadaAutomotor', cpeReq(C.EDITAR_CONFIRMADA), 'EditarCPEConfirmadaAutomotorReq', 'request'],
  ['confirmarArriboCPE', cpeReq(C.SOLICITANTE_CARTA_PORTE), 'ConfirmarArriboCPEReq', 'request'],
  [
    'confirmacionDefinitivaCPEAutomotor',
    cpeReq(C.CONFIRMACION_AUTOMOTOR),
    'ConfirmacionDefinitivaCPEAutomotorReq',
    'request',
  ],
  ['descargadoDestinoCPE', cpeReq(C.SOLICITANTE_CARTA_PORTE), 'DescargadoDestinoCPEReq', 'request'],
  ['rechazoCPE', cpeReq(C.RECHAZO), 'RechazoCPEReq', 'request'],
  ['anularCPE', cpeReq(C.ANULAR), 'AnularCPEReq', 'request'],
  [
    'nuevoDestinoDestinatarioCPEAutomotor',
    cpeReq(C.NUEVO_DESTINO_AUTOMOTOR),
    'NuevoDestinoDestinatarioCPEAutomotorReq',
    'request',
  ],
  ['regresoOrigenCPEAutomotor', cpeReq(C.REGRESO_ORIGEN_AUTOMOTOR), 'RegresoOrigenCPEAutomotorReq', 'request'],
  ['desvioCPEAutomotor', cpeReq(C.DESVIO_AUTOMOTOR), 'DesvioCPEAutomotorReq', 'request'],
  ['informarContingencia', cpeReq(C.INFORMAR_CONTINGENCIA), 'InformarContingenciaReq', 'request'],
  ['cerrarContingenciaCPE', cpeReq(C.CERRAR_CONTINGENCIA), 'CerrarContingenciaCPEReq', 'request'],
  ['autorizarCPEFerroviaria', cpeReq(C.AUTORIZAR_FERROVIARIA), 'AutorizarCPEFerroviariaReq', 'request'],
  ['consultarCPEFerroviaria', cpeReq(C.CONSULTAR_CPE), 'ConsultarCPEFerroviariaReq', 'request'],
  ['editarCPEFerroviaria', cpeReq(C.EDITAR_FERROVIARIA), 'EditarCPEFerroviariaReq', 'request'],
  ['editarCPEConfirmadaFerroviaria', cpeReq(C.EDITAR_CONFIRMADA), 'EditarCPEConfirmadaFerroviariaReq', 'request'],
  [
    'confirmacionDefinitivaCPEFerroviaria',
    cpeReq(C.CONFIRMACION_FERROVIARIA),
    'ConfirmacionDefinitivaCPEFerroviariaReq',
    'request',
  ],
  [
    'nuevoDestinoDestinatarioCPEFerroviaria',
    cpeReq(C.NUEVO_DESTINO_FERROVIARIA),
    'NuevoDestinoDestinatarioCPEFerroviariaReq',
    'request',
  ],
  ['regresoOrigenCPEFerroviaria', cpeReq(C.REGRESO_ORIGEN_FERROVIARIA), 'RegresoOrigenCPEFerroviariaReq', 'request'],
  ['desvioCPEFerroviaria', cpeReq(C.DESVIO_FERROVIARIA), 'DesvioCPEFerroviariaReq', 'request'],
  [
    'consultaCPEFerroviariaPorNroOperativo',
    cpeReq(C.CONSULTAR_POR_NRO_OPERATIVO),
    'ConsultaCPEFerroviariaPorNroOperativoReq',
    'request',
  ],
  ['consultarCPEPorDestino', cpeReq(C.CONSULTAR_POR_DESTINO), 'ConsultarCPEPorDestinoReq', 'request'],
  [
    'consultarCPEPPendientesDeResolucion',
    cpeReq(C.CONSULTAR_PENDIENTES),
    'ConsultarCPEPPendientesDeResolucionReq',
    'request',
  ],
  ['consultarUltNroOrden', cpeReq(C.CONSULTAR_ULT_NRO_ORDEN), 'ConsultarUltNroOrdenReq', 'request'],
  ['consultarProvincias', cpeReq(), 'ConsultarProvinciasReq', 'request'],
  [
    'consultarLocalidadesPorProvincia',
    cpeReq(C.CONSULTAR_LOCALIDADES),
    'ConsultarLocalidadesPorProvinciaReq',
    'request',
  ],
  ['consultarTiposGrano', cpeReq(), 'ConsultarTiposGranoReq', 'request'],
  ['consultarPlantas', cpeReq(C.SOLICITUD_CUIT), 'ConsultarPlantasReq', 'request'],
  ['consultarLocalidadesProductor', cpeReq(C.SOLICITUD_CUIT), 'ConsultarLocalidadesProductorReq', 'request'],
  ['consultarCategoriasSemillas', cpeReq(), 'ConsultarCategoriasSemillasReq', 'request'],
  // `codGrano` va directo bajo el Req, sin `solicitud`.
  [
    'consultarVariedadesSemillas',
    { auth: obj(CPE_AUTH), ...C.CONSULTAR_VARIEDADES },
    'ConsultarVariedadesSemillasReq',
    'request',
  ],
  // Sin `solicitud`: los campos van directo bajo el Req.
  ['consultarRenspa', { auth: obj(CPE_AUTH), ...C.CONSULTAR_RENSPA }, 'ConsultarRenspaReq', 'request'],
  [
    'consultarDomiciliosPorCUIT',
    { auth: obj(CPE_AUTH), ...C.CONSULTAR_DOMICILIOS },
    'ConsultarDomiciliosPorCUITReq',
    'request',
  ],
  ['consultarTiposEmbalaje', cpeReq(), 'ConsultarTiposEmbalajeReq', 'request'],
  ['consultarUnidadesMedida', cpeReq(), 'ConsultarUnidadesMedidaReq', 'request'],
  // El elemento de respuesta de consultarRenspa es `...Res`, no `...Resp`.
  ['consultarRenspa (respuesta)', cpeLista('renspa', C.R_RENSPA), 'ConsultarRenspaRes', 'response'],

  // Respuestas
  ...(
    [
      ['autorizarCPEAutomotor', C.R_DETALLE_AUTOMOTOR],
      ['consultarCPEAutomotor', C.R_DETALLE_AUTOMOTOR],
      ['autorizarCPEFerroviaria', C.R_DETALLE_FERROVIARIA],
      ['consultarCPEFerroviaria', C.R_DETALLE_FERROVIARIA],
      ['consultaCPEFerroviariaPorNroOperativo', C.R_OPERATIVO_FERROVIARIO],
      ['consultarUltNroOrden', C.R_ULT_NRO_ORDEN],
      // Operaciones que responden CartaPorteRespuesta (`#operar`).
      ...[
        'editarCPEAutomotor',
        'editarCPEConfirmadaAutomotor',
        'confirmarArriboCPE',
        'confirmacionDefinitivaCPEAutomotor',
        'descargadoDestinoCPE',
        'rechazoCPE',
        'anularCPE',
        'nuevoDestinoDestinatarioCPEAutomotor',
        'regresoOrigenCPEAutomotor',
        'desvioCPEAutomotor',
        'informarContingencia',
        'cerrarContingenciaCPE',
        'editarCPEFerroviaria',
        'editarCPEConfirmadaFerroviaria',
        'confirmacionDefinitivaCPEFerroviaria',
        'nuevoDestinoDestinatarioCPEFerroviaria',
        'regresoOrigenCPEFerroviaria',
        'desvioCPEFerroviaria',
      ].map((m): [string, Schema] => [m, C.R_CARTA_PORTE]),
    ] as [string, Schema][]
  ).map(([m, s]): Case => [`${m} (respuesta)`, cpeResp(s), `${m[0].toUpperCase()}${m.slice(1)}Resp`, 'response']),
  ...(
    [
      ['consultarCPEPorDestino', 'cartaPorte', C.R_CPE_RESUMEN],
      ['consultarCPEPPendientesDeResolucion', 'cartaPorte', C.R_CPE_RESUMEN],
      ['consultarProvincias', 'provincia', C.R_CODIGO_DESCRIPCION],
      ['consultarLocalidadesPorProvincia', 'localidad', C.R_CODIGO_DESCRIPCION],
      ['consultarTiposGrano', 'grano', C.R_CODIGO_DESCRIPCION],
      ['consultarPlantas', 'planta', C.R_PLANTA],
      ['consultarLocalidadesProductor', 'localidad', C.R_LOCALIDAD_PRODUCTOR],
      ['consultarCategoriasSemillas', 'categoria', C.R_CODIGO_DESCRIPCION],
      ['consultarVariedadesSemillas', 'variedad', C.R_VARIEDAD_SEMILLA],
      ['consultarDomiciliosPorCUIT', 'domicilio', C.R_DOMICILIO],
      ['consultarTiposEmbalaje', 'tipoEmbalaje', C.R_TIPO_EMBALAJE],
      ['consultarUnidadesMedida', 'unidadMedida', C.R_CODIGO_DESCRIPCION],
    ] as [string, string, Schema][]
  ).map(
    ([m, item, s]): Case => [
      `${m} (respuesta)`,
      cpeLista(item, s),
      `${m[0].toUpperCase()}${m.slice(1)}Resp`,
      'response',
    ],
  ),
];

describe('contrato con el XSD oficial de WSCPE', () => {
  it.each(cpeCases)('%s', (_, schema, type, direction, ignore) => {
    expect(checkSchemaAgainstXsd(schema, type, cpeTypes, { direction, ignore })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// WSLPG: `<op>Req` = { auth, ...body }, `<op>Resp` = { <x>Return }
// ---------------------------------------------------------------------------

const lpgTypes = loadXsdTypes(wsdl('wslpg.wsdl'));

/** `LpgAuthType` que arma `LpgClient`. */
const LPG_AUTH: Schema = { token: str(), sign: str(), cuit: str() };
const lpgReq = (body: Schema = {}): Schema => ({ auth: obj(LPG_AUTH), ...body });

/** Nombre del único hijo del elemento `<op>Resp` (el `*Return` que common desenvuelve). */
function lpgReturnName(resp: string): string {
  const el = lpgTypes.elements.get(resp);
  const type = el?.type ? lpgTypes.complexTypes.get(el.type) : el?.inline;
  const [child] = type?.elements ?? [];
  if (!child) throw new Error(`${resp}: no existe o no tiene hijos en el XSD`);
  return child.name;
}
const lpgResp = (resp: string, schema: Schema): Case => [
  resp,
  { [lpgReturnName(resp)]: obj(schema) },
  resp,
  'response',
];
const lpgParametrica = (resp: string, container: string, item = 'codigoDescripcion', schema = L.R_CODIGO_DESCRIPCION) =>
  lpgResp(resp, { [container]: wrapped(item, obj(schema), 0) });

const lpgCases: Case[] = [
  // Tipos compartidos (también se recorren dentro de las operaciones)
  ['LpgLiquidacionBaseType', L.LIQUIDACION_BASE, 'LpgLiquidacionBaseType', 'request'],
  ['LpgLiquidacionBaseType (respuesta)', L.R_LIQUIDACION_BASE, 'LpgLiquidacionBaseType', 'response'],
  ['LpgLiquidacionRespType', L.R_LIQUIDACION_AUTORIZADA, 'LpgLiquidacionRespType', 'response'],
  ['LpgArrEventoType (eventos)', L.R_EVENTOS, 'LpgLiqReturnType', 'response'],

  // Requests
  ['liquidacionReq', lpgReq(L.LIQUIDACION_AUTORIZAR), 'liquidacionReq', 'request'],
  ['liqConsXCoeReq', lpgReq(L.CONSULTA_X_COE), 'liqConsXCoeReq', 'request'],
  ['liqConsXNroOrdenReq', lpgReq(L.CONSULTA_X_NRO_ORDEN), 'liqConsXNroOrdenReq', 'request'],
  ['liqUltNroOrdenReq', lpgReq(L.ULT_NRO_ORDEN), 'liqUltNroOrdenReq', 'request'],
  ['anulacionReq', lpgReq(L.ANULACION), 'anulacionReq', 'request'],
  ['ajustarUnificadoReq', lpgReq(L.AJUSTE_UNIFICADO), 'ajustarUnificadoReq', 'request'],
  ['cgAutorizarReq', lpgReq(L.CG_AUTORIZAR), 'cgAutorizarReq', 'request'],
  ['cgSolicitarAnulacionReq', lpgReq(L.CONSULTA_X_COE), 'cgSolicitarAnulacionReq', 'request'],
  ['cgConfirmarAnulacionReq', lpgReq(L.CONSULTA_X_COE), 'cgConfirmarAnulacionReq', 'request'],
  ['cgConsultarUltimoNroOrdenReq', lpgReq(L.ULT_NRO_ORDEN), 'cgConsultarUltimoNroOrdenReq', 'request'],
  ['cgConsultarXCoeReq', lpgReq(L.CONSULTA_X_COE), 'cgConsultarXCoeReq', 'request'],
  ['CgConsultarXNroOrdenReq', lpgReq(L.CONSULTA_X_NRO_ORDEN), 'CgConsultarXNroOrdenReq', 'request'],
  ['ajusteXCoeConsReq', lpgReq(L.CONSULTA_X_COE), 'ajusteXCoeConsReq', 'request'],
  ['ajusteXNroOrdenConsReq', lpgReq(L.CONSULTA_X_NRO_ORDEN), 'ajusteXNroOrdenConsReq', 'request'],
  ['ajustePorContratoConsultarReq', lpgReq(L.AJUSTE_POR_CONTRATO), 'ajustePorContratoConsultarReq', 'request'],
  ['liquidacionPorContratoConsultarReq', lpgReq(L.LIQ_POR_CONTRATO), 'liquidacionPorContratoConsultarReq', 'request'],
  ['cgBuscarCtgReq', lpgReq(L.CG_BUSCAR_CTG), 'cgBuscarCtgReq', 'request'],
  ['cgBuscarCertConSaldoDisponibleReq', lpgReq(L.CG_BUSCAR_CERT_SALDO), 'cgBuscarCertConSaldoDisponibleReq', 'request'],
  ['localidadReq', lpgReq(L.LOCALIDADES), 'localidadReq', 'request'],
  ['tipoOperacionReq', lpgReq(L.TIPO_OPERACION), 'tipoOperacionReq', 'request'],
  ['gradoEntregadoReq', lpgReq(L.GRADO_ENTREGADO), 'gradoEntregadoReq', 'request'],
  ...[
    'provinciasReq',
    'puertoReq',
    'tipoActividadReq',
    'tipoActividadRepresentadoReq',
    'tipoCertificadoDepReq',
    'tipoRetencionReq',
    'tipoDeduccionReq',
    'tipoGranoReq',
    'gradoReferenciaReq',
    'campaniaReq',
  ].map((req): Case => [req, lpgReq(), req, 'request']),

  // Respuestas
  lpgResp('liquidacionResp', L.R_LIQ_RETURN),
  lpgResp('liqConsXCoeResp', L.R_LIQ_CONS_RETURN),
  lpgResp('liqConsXNroOrdenResp', L.R_LIQ_CONS_RETURN),
  lpgResp('liqUltNroOrdenResp', L.R_ULT_NRO_ORDEN),
  lpgResp('anulacionResp', L.R_ANULACION_RETURN),
  lpgResp('ajustarUnificadoResp', L.R_AJUSTE_UNIFICADO_RETURN),
  lpgResp('cgAutorizarResp', L.R_CG_AUTORIZAR_RETURN),
  lpgResp('cgSolicitarAnulacionResp', L.R_CG_ANULACION_RETURN),
  lpgResp('cgConfirmarAnulacionResp', L.R_CG_ANULACION_RETURN),
  lpgResp('cgConsultarUltimoNroOrdenResp', L.R_ULT_NRO_ORDEN),
  lpgResp('cgConsultarXCoeResp', L.R_CG_CONSULTAR_RETURN),
  lpgResp('CgConsultarXNroOrdenResp', L.R_CG_CONSULTAR_RETURN),
  lpgResp('ajusteXcoeConsResp', L.R_AJUSTE_CONS_RETURN),
  lpgResp('ajusteXNroOrdenConsResp', L.R_AJUSTE_CONS_RETURN),
  lpgResp('ajustePorContratoConsultarResp', L.R_AJUSTE_CONS_RETURN),
  lpgResp('liquidacionPorContratoConsultarResp', L.R_LIQ_POR_CONTRATO_RETURN),
  lpgResp('cgBuscarCtgResp', L.R_CG_BUSCAR_CTG_RETURN),
  lpgResp('cgBuscarCertConSaldoDisponibleResp', L.R_CG_BUSCAR_CERT_SALDO_RETURN),
  lpgParametrica('provinciasResp', 'provincias'),
  lpgParametrica('localidadResp', 'localidades'),
  lpgParametrica('tipoOperacionResp', 'tiposOperacion'),
  lpgParametrica('puertoResp', 'puertos'),
  lpgParametrica('tipoActividadResp', 'tiposActividad'),
  lpgParametrica('tipoActividadRepresentadoResp', 'tiposActividad'),
  lpgParametrica('tipoCertificadoDepResp', 'tiposCertDep'),
  lpgParametrica('tipoRetencionResp', 'tiposRetencion'),
  lpgParametrica('tipoDeduccionResp', 'tiposDeduccion'),
  lpgParametrica('tipoGranoResp', 'granos'),
  lpgParametrica('gradoReferenciaResp', 'gradosRef'),
  lpgParametrica('gradoEntregadoResp', 'gradoEnt', 'gradoEnt', L.R_GRADO_ENTREGADO),
  lpgParametrica('campaniaResp', 'campanias'),
];

describe('contrato con el XSD oficial de WSLPG', () => {
  it.each(lpgCases)('%s', (_, schema, type, direction, ignore) => {
    expect(checkSchemaAgainstXsd(schema, type, lpgTypes, { direction, ignore })).toEqual([]);
  });
});
