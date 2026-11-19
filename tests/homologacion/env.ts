/**
 * Variables `ARCA_TEST_*` de los tests de integración contra ARCA homologación.
 * Sin dependencias de los paquetes: lo usan `vitest.config.ts` y el reporter
 * (proceso principal) y los tests (workers).
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const ENV_FILE = fileURLToPath(new URL('../../.env', import.meta.url));

/**
 * Las variables `ARCA_TEST_*` del `.env` de la raíz que no estén ya en el
 * entorno (las del entorno tienen prioridad).
 */
export function arcaTestEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  if (!existsSync(ENV_FILE)) return {};
  const vars = parseEnv(readFileSync(ENV_FILE, 'utf8'));
  return Object.fromEntries(
    Object.entries(vars).filter(
      (entry): entry is [string, string] =>
        entry[0].startsWith('ARCA_TEST_') && entry[1] !== undefined && env[entry[0]] === undefined,
    ),
  );
}

/** Las variables `ARCA_TEST_*` efectivas: las del entorno más las del `.env`. */
export function arcaTestVars(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const delEntorno = Object.entries(env).filter(
    (entry): entry is [string, string] => entry[0].startsWith('ARCA_TEST_') && entry[1] !== undefined,
  );
  return { ...arcaTestEnv(env), ...Object.fromEntries(delEntorno) };
}

export const PERFILES = ['ri', 'monotributo'] as const;
/** Condición del contribuyente del certificado: responsable inscripto o monotributista. */
export type Perfil = (typeof PERFILES)[number];

/** Datos de un usuario de homologación, sin leer el certificado ni la clave. */
export interface Usuario {
  /** 11 dígitos, sin guiones. */
  cuit: string;
  perfil: Perfil;
  /** `true` si el perfil vino de `<prefijo>PERFIL` (si no, se asume `ri`). */
  perfilExplicito: boolean;
  /** Servicios autorizados al certificado en WSASS. */
  servicios: ReadonlySet<string>;
  ticketsDir: string | undefined;
  /** Punto de venta de WSFE y WSFEX (default: 1). */
  ptoVta: number;
}

export interface Credenciales extends Usuario {
  /** Contenido PEM del certificado. */
  cert: string;
  /** Contenido PEM de la clave privada. */
  key: string;
}

type Vars = Readonly<Record<string, string | undefined>>;

const leer = (vars: Vars, prefijo: string) => (nombre: string) => vars[`${prefijo}${nombre}`]?.trim() || undefined;

/** CUIT de 11 dígitos, con o sin guiones; si no, un error con el nombre de la variable (sin el valor). */
export function normalizarCuit(valor: string, variable: string): string {
  const cuit = valor.replace(/[-\s]/g, '');
  if (!/^\d{11}$/.test(cuit)) throw new Error(`${variable} debe ser una CUIT de 11 dígitos`);
  return cuit;
}

/**
 * El usuario con el prefijo dado (`ARCA_TEST_` para el principal,
 * `ARCA_TEST_CONTRAPARTE_` para el de los cruces), o `undefined` si falta el
 * certificado, la clave o la CUIT. No lee los archivos del certificado ni de la clave.
 */
export function usuario(vars: Vars, prefijo = 'ARCA_TEST_'): Usuario | undefined {
  const v = leer(vars, prefijo);
  const cuit = v('CUIT');
  if (!v('CERT') || !v('KEY') || !cuit) return undefined;

  const perfil = v('PERFIL') ?? 'ri';
  if (!(PERFILES as readonly string[]).includes(perfil)) {
    throw new Error(`${prefijo}PERFIL debe ser ${PERFILES.join(' o ')} (vino "${perfil}")`);
  }
  const ptoVta = Number(v('PTO_VTA') ?? 1);
  if (!Number.isInteger(ptoVta) || ptoVta < 1) {
    throw new Error(`${prefijo}PTO_VTA debe ser un número de punto de venta (entero positivo)`);
  }
  return {
    cuit: normalizarCuit(cuit, `${prefijo}CUIT`),
    perfil: perfil as Perfil,
    perfilExplicito: v('PERFIL') !== undefined,
    servicios: new Set((v('SERVICES') ?? '').split(',').map((s) => s.trim())),
    ticketsDir: v('TICKETS_DIR'),
    ptoVta,
  };
}

const pem = (value: string) => (value.includes('-----BEGIN') ? value : readFileSync(value, 'utf8'));

/** Como `usuario`, más el contenido PEM del certificado y de la clave (o la ruta a cada archivo). */
export function credenciales(vars: Vars, prefijo = 'ARCA_TEST_'): Credenciales | undefined {
  const u = usuario(vars, prefijo);
  if (!u) return undefined;
  const v = leer(vars, prefijo);
  return { ...u, cert: pem(v('CERT')!), key: pem(v('KEY')!) };
}
