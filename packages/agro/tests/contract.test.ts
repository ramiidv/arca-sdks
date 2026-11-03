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
  ...dgCases(),
];

/**
 * Derivados granarios: [operación, solicitud (`null`: solo auth), respuesta,
 * ítem si la respuesta es una lista, elemento base si no es `<Operacion>`].
 */
function dgCases(): Case[] {
  const ops: [string, Schema | null, Schema, string?, string?][] = [
    ['autorizarCPEAutomotorDG', C.AUTORIZAR_AUTOMOTOR_DG, C.R_DETALLE_AUTOMOTOR_DG],
    ['consultarCPEAutomotorDG', C.CONSULTAR_CPE_DG, C.R_DETALLE_AUTOMOTOR_DG],
    ['editarCPEDGAutomotor', C.EDITAR_AUTOMOTOR_DG, C.R_CARTA_PORTE],
    [
      'editarCPEDGConfirmadaAutomotor',
      C.EDITAR_CONFIRMADA_DG,
      C.R_CARTA_PORTE,
      undefined,
      'EditarCPEConfirmadaAutomotorDg',
    ],
    ['confirmacionDefinitivaCPEAutomotorDG', C.CONFIRMACION_AUTOMOTOR_DG, C.R_CARTA_PORTE],
    ['desvioCPEAutomotorDG', C.DESVIO_AUTOMOTOR_DG, C.R_CARTA_PORTE],
    ['nuevoDestinoDestinatarioCPEAutomotorDG', C.NUEVO_DESTINO_AUTOMOTOR_DG, C.R_CARTA_PORTE],
    ['regresoOrigenCPEAutomotorDG', C.REGRESO_ORIGEN_AUTOMOTOR_DG, C.R_CARTA_PORTE],
    ['autorizarCPEFerroviariaDG', C.AUTORIZAR_FERROVIARIA_DG, C.R_DETALLE_FERROVIARIA_DG],
    ['consultarCPEFerroviariaDG', C.CONSULTAR_CPE_DG, C.R_DETALLE_FERROVIARIA_DG],
    ['editarCPEDGFerroviaria', C.EDITAR_FERROVIARIA_DG, C.R_CARTA_PORTE],
    [
      'editarCPEDGConfirmadaFerroviaria',
      C.EDITAR_CONFIRMADA_DG,
      C.R_CARTA_PORTE,
      undefined,
      'EditarCPEConfirmadaFerroviariaDg',
    ],
    ['confirmacionDefinitivaCPEFerroviariaDG', C.CONFIRMACION_FERROVIARIA_DG, C.R_CARTA_PORTE],
    ['desvioCPEFerroviariaDG', C.DESVIO_FERROVIARIA_DG, C.R_CARTA_PORTE],
    ['nuevoDestinoDestinatarioCPEFerroviariaDG', C.NUEVO_DESTINO_FERROVIARIA_DG, C.R_CARTA_PORTE],
    ['regresoOrigenCPEFerroviariaDG', C.REGRESO_ORIGEN_FERROVIARIA_DG, C.R_CARTA_PORTE],
    ['consultarCPEDGPendienteActivacion', C.CONSULTAR_POR_PLANTA, C.R_CPE_DG_PENDIENTE, 'cartaPorte'],
    ['aceptarEmisionDG', C.SOLICITANTE_CARTA_PORTE, C.R_CARTA_PORTE],
    ['rechazarEmisionDG', C.SOLICITANTE_CARTA_PORTE, C.R_CARTA_PORTE],
    ['autorizarCPEEmisionDestinoDG', C.AUTORIZAR_EMISION_DESTINO_DG, C.R_DETALLE_EMISION_DESTINO_DG],
    ['consultarCPEEmisionDestinoDG', C.CONSULTAR_CPE_DG, C.R_DETALLE_EMISION_DESTINO_DG],
    ['consultarCPEEmitidasDestinoDGPendientesActivacion', C.CONSULTAR_POR_PLANTA, C.R_CPE_DG_PENDIENTE, 'cartaPorte'],
    ['aceptarEmisionDestinoDG', C.SOLICITANTE_DESTINO_CARTA_PORTE, C.R_CARTA_PORTE],
    ['rechazarEmisionDestinoDG', C.SOLICITANTE_DESTINO_CARTA_PORTE, C.R_CARTA_PORTE],
    ['anularCPEEmisionDestinoDG', C.ANULAR_EMISION_DESTINO_DG, C.R_CARTA_PORTE],
    ['informarContingenciaEmisionDestinoDG', C.INFORMAR_CONTINGENCIA_EMISION_DESTINO_DG, C.R_CARTA_PORTE],
    ['cerrarContingenciaCPEEmisionDestinoDG', C.CERRAR_CONTINGENCIA_EMISION_DESTINO_DG, C.R_CARTA_PORTE],
    ['descargadoDestinoCPEEmisionDestinoDG', C.SOLICITANTE_DESTINO_CARTA_PORTE, C.R_CARTA_PORTE],
    ['nuevoDestinoDestinatarioCPEEmisionDestinoDG', C.NUEVO_DESTINO_EMISION_DESTINO_DG, C.R_CARTA_PORTE],
    ['regresoOrigenCPEEmisionDestinoDG', C.REGRESO_ORIGEN_EMISION_DESTINO_DG, C.R_CARTA_PORTE],
    ['consultarCPEDuctos', C.CONSULTAR_CPE_DUCTOS, C.R_DETALLE_DUCTOS_DG],
    ['editarCPEDGDuctos', C.EDITAR_DUCTOS_DG, C.R_CARTA_PORTE],
    ['editarCPEConfirmadaDuctos', C.EDITAR_CONFIRMADA_DG, C.R_CARTA_PORTE],
    ['confirmacionDefinitivaCPEDuctosDG', C.CONFIRMACION_DUCTOS_DG, C.R_CARTA_PORTE],
    ['consultarPlantasDG', C.SOLICITUD_CUIT, C.R_PLANTA_DG, 'planta'],
    ['consultarDerivadosGranarios', null, C.R_DERIVADO_GRANARIO, 'derivadoGranario'],
  ];
  return ops.flatMap(([m, req, resp, item, base = `${m[0].toUpperCase()}${m.slice(1)}`]): Case[] => [
    [m, cpeReq(req ?? undefined), `${base}Req`, 'request'],
    [`${m} (respuesta)`, item ? cpeLista(item, resp) : cpeResp(resp), `${base}Resp`, 'response'],
  ]);
}

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
  ['LpgAnularContraDocumentoReq', lpgReq(L.ANULAR_CONTRA_DOCUMENTO), 'LpgAnularContraDocumentoReq', 'request'],
  ['ajustarContratoReq', lpgReq(L.AJUSTE_CONTRATO), 'ajustarContratoReq', 'request'],
  ['asociarLiqAContratoReq', lpgReq(L.ASOCIAR_A_CONTRATO), 'asociarLiqAContratoReq', 'request'],
  ['LpgAutorizarAnticipoReq', lpgReq(L.AUTORIZAR_ANTICIPO), 'LpgAutorizarAnticipoReq', 'request'],
  // El WSDL declara además complexTypes vacíos con el nombre de algunos elementos
  // (LpgCancelarAnticipoReq/Resp, lsgConsultarXCoeReq): se compara contra el tipo del elemento.
  ['LpgCancelarAnticipoReq', lpgReq(L.CANCELAR_ANTICIPO), 'LpgCancelarAnticipoReqType', 'request'],
  ['CgInformarCalidadReq', lpgReq(L.CG_INFORMAR_CALIDAD), 'CgInformarCalidadReq', 'request'],
  ['lsgAutorizarReq', lpgReq(L.LSG_AUTORIZAR), 'lsgAutorizarReq', 'request'],
  ['lsgConsultarXCoeReq', lpgReq(L.CONSULTA_X_COE), 'LpgLiqConsXCoeReqType', 'request'],
  ['lsgConsultarXNroOrdenReq', lpgReq(L.CONSULTA_X_NRO_ORDEN), 'lsgConsultarXNroOrdenReq', 'request'],
  ['lsgConsultarUltimoNroOrdenReq', lpgReq(L.ULT_NRO_ORDEN), 'lsgConsultarUltimoNroOrdenReq', 'request'],
  ['lsgConsultarXContratoReq', lpgReq(L.LIQ_POR_CONTRATO), 'lsgConsultarXContratoReq', 'request'],
  ['lsgAnularReq', lpgReq(L.CONSULTA_X_COE), 'lsgAnularReq', 'request'],
  ['LsgAnularContraDocumentoReq', lpgReq(L.ANULAR_CONTRA_DOCUMENTO), 'LsgAnularContraDocumentoReq', 'request'],
  ['lsgAjustarXCoeReq', lpgReq(L.LSG_AJUSTAR_X_COE), 'lsgAjustarXCoeReq', 'request'],
  ['lsgAjustarXContratoReq', lpgReq(L.LSG_AJUSTAR_X_CONTRATO), 'lsgAjustarXContratoReq', 'request'],
  ['lsgAsociarAContratoReq', lpgReq(L.ASOCIAR_A_CONTRATO), 'lsgAsociarAContratoReq', 'request'],
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
  lpgResp('LpgAnularContraDocumentoResp', L.R_LIQ_CONS_RETURN),
  lpgResp('ajustarContratoResp', L.R_AJUSTE_CONTRATO_RETURN),
  lpgResp('asociarLiqAContratoResp', L.R_LIQ_CONS_RETURN),
  lpgResp('LpgAutorizarAnticipoResp', L.R_LIQ_RETURN),
  ['LpgCancelarAnticipoResp', { liqConsReturn: obj(L.R_LIQ_CONS_RETURN) }, 'LpgLiqConsRespType', 'response'],
  lpgResp('CgInformarCalidadResp', L.R_CG_CONSULTAR_RETURN),
  lpgResp('lsgAutorizarResp', L.R_LSG_AUTORIZAR_RETURN),
  lpgResp('lsgConsultarXCoeResp', L.R_LSG_CONSULTA_RETURN),
  lpgResp('lsgConsultarXNroOrdenResp', L.R_LSG_CONSULTA_RETURN),
  lpgResp('lsgConsultarUltimoNroOrdenResp', L.R_ULT_NRO_ORDEN),
  lpgResp('lsgConsultarXContratoResp', L.R_LIQ_POR_CONTRATO_RETURN),
  lpgResp('lsgAnularResp', L.R_ANULACION_RETURN),
  lpgResp('LsgAnularContraDocumentoResp', L.R_LIQ_CONS_RETURN),
  lpgResp('lsgAjustarXCoeResp', L.R_LSG_AJUSTE_RETURN),
  lpgResp('lsgAjustarXContratoResp', L.R_LSG_AJUSTE_RETURN),
  lpgResp('lsgAsociarAContratoResp', L.R_LSG_CONSULTA_RETURN),
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
