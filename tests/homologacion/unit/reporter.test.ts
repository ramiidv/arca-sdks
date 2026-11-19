import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { TestState } from 'vitest/node';
import { datosPrivados, type EntradaReporte, generarReporte, type ModuloReporte } from '../reporter.js';

const RAIZ = fileURLToPath(new URL('../../../', import.meta.url));

const modulo = (ruta: string, tests: [string, TestState][], estado = 'passed'): ModuloReporte => ({
  moduleId: `${RAIZ}${ruta}`,
  state: () => estado,
  children: { allTests: () => tests.map(([fullName, state]) => ({ fullName, result: () => ({ state }) })) },
});

const VARS = {
  ARCA_TEST_CERT: './certs/ri.crt',
  ARCA_TEST_KEY: './certs/ri.key',
  ARCA_TEST_CUIT: '20-12345678-6',
  ARCA_TEST_PERFIL: 'ri',
  ARCA_TEST_SERVICES: 'wsfe,wscdc',
};

const entrada = (cambios: Partial<EntradaReporte> = {}): EntradaReporte => ({
  modulos: [
    modulo('packages/cdc/tests/integration/homologacion.test.ts', [
      ['integración WSCDC > status', 'passed'],
      ['integración WSCDC > getTiposCbte', 'skipped'],
    ]),
    modulo('tests/homologacion/cruces.test.ts', [['cruces > el RI le emite una Factura A | B', 'failed']]),
  ],
  vars: VARS,
  erroresNoManejados: 0,
  motivo: 'passed',
  fecha: '2026-11-19',
  commit: 'abc1234',
  sucio: false,
  versiones: 'cdc 0.8.4, common 0.10.1',
  node: 'v24.18.0',
  ...cambios,
});

describe('generarReporte', () => {
  it('arma el reporte con el estado de cada test, sin la CUIT ni las rutas de los certificados', () => {
    const r = generarReporte(entrada());
    expect(r).not.toHaveProperty('error');
    const { reporte } = r as { reporte: string };
    expect(reporte).toContain('### 2026-11-19 · ri');
    expect(reporte).toContain('- Commit: `abc1234`\n');
    expect(reporte).toContain('- Servicios autorizados: wscdc, wsfe');
    expect(reporte).toContain('- Resultado: 1 pasaron, 1 fallaron, 1 salteados (2 archivos)');
    expect(reporte).toContain('| cdc | integración WSCDC > status | pasó |');
    expect(reporte).toContain('| cdc | integración WSCDC > getTiposCbte | salteado |');
    expect(reporte).toContain('| cruces | cruces > el RI le emite una Factura A \\| B | falló |');
    expect(reporte).not.toMatch(/\d{11}|\d{2}-\d{8}-\d|certs\/|-----BEGIN/);
  });

  it('un archivo que no cargó cuenta como falla; avisa interrupciones y errores no manejados', () => {
    const r = generarReporte(
      entrada({
        modulos: [modulo('packages/agro/tests/integration/homologacion.test.ts', [], 'failed')],
        motivo: 'interrupted',
        erroresNoManejados: 2,
        sucio: true,
      }),
    ) as { reporte: string };
    expect(r.reporte).toContain('| agro | (archivo) | falló (el archivo no cargó) |');
    expect(r.reporte).toContain('- Resultado: 0 pasaron, 1 fallaron, 0 salteados (1 archivos)');
    expect(r.reporte).toContain('**La corrida se interrumpió**');
    expect(r.reporte).toContain('**Errores no manejados**: 2');
    expect(r.reporte).toContain('(con cambios sin commitear)');
  });

  it('con una contraparte de otro perfil indica los cruces y los servicios de cada uno', () => {
    const { reporte } = generarReporte(
      entrada({
        vars: {
          ...VARS,
          ARCA_TEST_CONTRAPARTE_CERT: './certs/mono.crt',
          ARCA_TEST_CONTRAPARTE_KEY: './certs/mono.key',
          ARCA_TEST_CONTRAPARTE_CUIT: '27111111111',
          ARCA_TEST_CONTRAPARTE_PERFIL: 'monotributo',
          ARCA_TEST_CONTRAPARTE_SERVICES: 'wsfe',
        },
      }),
    ) as { reporte: string };
    expect(reporte).toContain('### 2026-11-19 · ri + monotributo (cruces)');
    expect(reporte).toContain('- Servicios autorizados: ri: wscdc, wsfe; monotributo: wsfe');
  });

  it.each<[string, Partial<EntradaReporte>, RegExp]>([
    ['sin credenciales', { vars: { ARCA_TEST_PERFIL: 'ri' } }, /faltan ARCA_TEST_CERT/],
    ['sin perfil', { vars: { ...VARS, ARCA_TEST_PERFIL: '' } }, /definí ARCA_TEST_PERFIL/],
    [
      'con contraparte sin perfil',
      {
        vars: {
          ...VARS,
          ARCA_TEST_CONTRAPARTE_CERT: 'x',
          ARCA_TEST_CONTRAPARTE_KEY: 'x',
          ARCA_TEST_CONTRAPARTE_CUIT: '27111111111',
        },
      },
      /definí ARCA_TEST_CONTRAPARTE_PERFIL/,
    ],
  ])('no se genera %s', (_, cambios, error) => {
    expect(generarReporte(entrada(cambios))).toEqual({ error: expect.stringMatching(error) });
  });

  it.each([
    ['la CUIT de las variables', 'factura a 20123456786'],
    ['la CUIT con guiones', 'factura a 20-12345678-6'],
    ['otra CUIT', 'factura a 30712345671'],
    ['un PEM', '-----BEGIN CERTIFICATE-----'],
  ])('no se genera si un test incluye %s', (_, nombre) => {
    const modulos = [modulo('packages/cdc/tests/integration/homologacion.test.ts', [[nombre, 'passed']])];
    expect(generarReporte(entrada({ modulos }))).toEqual({ error: expect.stringMatching(/CUIT o un PEM/) });
  });
});

describe('datosPrivados', () => {
  it('toma las CUIT de todas las variables, con y sin guiones', () => {
    expect(
      datosPrivados({
        ARCA_TEST_CUIT: '20123456786',
        ARCA_TEST_CONTRAPARTE_CUIT: '27-11111111-1',
        ARCA_TEST_SERVICES: 'wsfe',
      }),
    ).toEqual(['20123456786', '20-12345678-6', '27111111111', '27-11111111-1']);
  });

  it('ignora valores que no son una CUIT', () => {
    expect(datosPrivados({ ARCA_TEST_CUIT: '', ARCA_TEST_PTO_VTA: '20123456786' })).toEqual([]);
  });
});
