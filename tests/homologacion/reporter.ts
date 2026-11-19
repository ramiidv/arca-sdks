/**
 * Reporter de `npm run test:homologacion`: escribe `homologacion-reporte.md` con
 * el resultado de cada test de integración, para sumarlo a HOMOLOGACION.md o
 * pegarlo en un issue "Reporte de homologación".
 *
 * El reporte no lleva CUIT, certificado, clave, tokens, CAE ni mensajes de error
 * (pueden traer datos del contribuyente): solo fecha, commit, versiones, perfil,
 * servicios y el estado de cada test. Antes de escribirlo verifica que no
 * aparezca ninguna CUIT (de las variables `ARCA_TEST_*` ni con forma de CUIT) ni
 * un PEM; si aparece, no lo escribe.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Reporter, TestModule, TestRunEndReason, TestState } from 'vitest/node';
import { arcaTestVars, type Usuario, usuario } from './env.js';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const SALIDA = 'homologacion-reporte.md';

const ESTADOS: Record<TestState | 'no-cargo', string> = {
  passed: 'pasó',
  failed: 'falló',
  skipped: 'salteado',
  pending: 'pendiente',
  'no-cargo': 'falló (el archivo no cargó)',
};

function git(...args: string[]): string | undefined {
  try {
    return execFileSync('git', args, { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return undefined;
  }
}

function versiones(): string {
  const dir = `${RAIZ}packages`;
  return readdirSync(dir)
    .sort()
    .map((p) => JSON.parse(readFileSync(`${dir}/${p}/package.json`, 'utf8')) as { name: string; version: string })
    .map((pkg) => `${pkg.name.replace('@ramiidv/arca-', '')} ${pkg.version}`)
    .join(', ');
}

/** `packages/cdc/tests/...` → `cdc`; `tests/homologacion/cruces.test.ts` → `cruces`. */
function grupo(moduleId: string): string {
  const rel = relative(RAIZ, moduleId).split(/[\\/]/);
  return rel[0] === 'packages' ? rel[1]! : rel.at(-1)!.replace(/\.test\.ts$/, '');
}

/** Las CUIT de las variables, con y sin guiones, que no pueden aparecer en el reporte. */
export function datosPrivados(vars: Record<string, string>): string[] {
  return Object.entries(vars)
    .filter(([k]) => /CUIT/.test(k))
    .map(([, v]) => v.replace(/\D/g, ''))
    .filter((c) => c.length === 11)
    .flatMap((c) => [c, `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}`]);
}

/** Lo que el reporte usa de un `TestModule` de vitest. */
export interface ModuloReporte {
  moduleId: string;
  state(): string;
  children: { allTests(): Iterable<{ fullName: string; result(): { state: TestState } }> };
}

export interface EntradaReporte {
  modulos: readonly ModuloReporte[];
  vars: Record<string, string>;
  erroresNoManejados: number;
  motivo: TestRunEndReason;
  fecha: string;
  commit: string;
  sucio: boolean;
  versiones: string;
  node: string;
}

const listaServicios = (u: Usuario) => [...u.servicios].sort().join(', ') || 'ninguno (solo los dummy)';

/**
 * El texto del reporte, o el motivo por el que no se genera: faltan las
 * credenciales o el perfil, o el texto tendría una CUIT o un PEM.
 */
export function generarReporte(e: EntradaReporte): { reporte: string } | { error: string } {
  const principal = usuario(e.vars);
  if (!principal) return { error: 'faltan ARCA_TEST_CERT, ARCA_TEST_KEY o ARCA_TEST_CUIT: los tests se saltearon' };
  if (!principal.perfilExplicito) {
    return { error: 'definí ARCA_TEST_PERFIL (ri o monotributo): el reporte indica el perfil del usuario' };
  }
  const contraparte = usuario(e.vars, 'ARCA_TEST_CONTRAPARTE_');
  if (contraparte && !contraparte.perfilExplicito) {
    return { error: 'definí ARCA_TEST_CONTRAPARTE_PERFIL (ri o monotributo): los cruces dependen del perfil' };
  }

  const filas: string[] = [];
  const total = { pasaron: 0, fallaron: 0, salteados: 0 };
  for (const mod of [...e.modulos].sort((a, b) => a.moduleId.localeCompare(b.moduleId))) {
    const tests = [...mod.children.allTests()];
    // Un archivo que no cargó (error al importarlo) no tiene tests: cuenta como una falla.
    if (mod.state() === 'failed' && tests.length === 0) {
      total.fallaron++;
      filas.push(`| ${grupo(mod.moduleId)} | (archivo) | ${ESTADOS['no-cargo']} |`);
    }
    for (const test of tests) {
      const estado = test.result().state;
      if (estado === 'passed') total.pasaron++;
      else if (estado === 'failed') total.fallaron++;
      else total.salteados++;
      filas.push(`| ${grupo(mod.moduleId)} | ${test.fullName.replaceAll('|', '\\|')} | ${ESTADOS[estado]} |`);
    }
  }

  // Los cruces solo corren con un usuario de cada perfil.
  const cruces = contraparte && contraparte.perfil !== principal.perfil ? contraparte : undefined;
  const perfiles = cruces ? `${principal.perfil} + ${cruces.perfil} (cruces)` : principal.perfil;
  const servicios =
    cruces && listaServicios(cruces) !== listaServicios(principal)
      ? `${principal.perfil}: ${listaServicios(principal)}; ${cruces.perfil}: ${listaServicios(cruces)}`
      : listaServicios(principal);
  const avisos = [
    e.motivo === 'interrupted' ? '- **La corrida se interrumpió**: el resultado está incompleto.' : undefined,
    e.erroresNoManejados > 0 ? `- **Errores no manejados**: ${e.erroresNoManejados}` : undefined,
  ].filter((a) => a !== undefined);

  const reporte = [
    `### ${e.fecha} · ${perfiles}`,
    '',
    `- Commit: \`${e.commit}\`${e.sucio ? ' (con cambios sin commitear)' : ''}`,
    `- Paquetes: ${e.versiones}`,
    `- Node: ${e.node}`,
    `- Servicios autorizados: ${servicios}`,
    `- Resultado: ${total.pasaron} pasaron, ${total.fallaron} fallaron, ${total.salteados} salteados (${e.modulos.length} archivos)`,
    ...avisos,
    '',
    '<details><summary>Detalle por test</summary>',
    '',
    '| Paquete | Test | Resultado |',
    '| --- | --- | --- |',
    ...filas,
    '',
    '</details>',
    '',
  ].join('\n');

  const privado =
    datosPrivados(e.vars).some((dato) => reporte.includes(dato)) ||
    /(?<!\d)\d{2}-?\d{8}-?\d(?!\d)/.test(reporte) ||
    reporte.includes('-----BEGIN');
  if (privado) return { error: 'el reporte incluía una CUIT o un PEM: no se escribió' };
  return { reporte };
}

export default class HomologacionReporter implements Reporter {
  onTestRunEnd(
    testModules: ReadonlyArray<TestModule>,
    unhandledErrors: ReadonlyArray<unknown>,
    reason: TestRunEndReason,
  ): void {
    try {
      const r = generarReporte({
        modulos: testModules,
        vars: arcaTestVars(),
        erroresNoManejados: unhandledErrors.length,
        motivo: reason,
        fecha: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date()),
        commit: git('rev-parse', '--short', 'HEAD') ?? 'desconocido',
        sucio: Boolean(git('status', '--porcelain', '--untracked-files=no')),
        versiones: versiones(),
        node: process.version,
      });
      if ('error' in r) {
        this.error(r.error);
      } else {
        writeFileSync(`${RAIZ}${SALIDA}`, r.reporte);
        console.log(`\nReporte de homologación: ${SALIDA} (sin CUIT ni certificados)\n`);
      }
    } catch (err) {
      // Solo el mensaje propio (variables mal cargadas), nunca un valor.
      this.error(err instanceof Error ? err.message : 'error inesperado');
    }
  }

  private error(mensaje: string): void {
    console.error(`\nReporte de homologación no generado: ${mensaje}\n`);
    process.exitCode = 1;
  }
}
