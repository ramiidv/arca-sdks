import { describe, expect, it } from 'vitest';
import { credenciales, usuario } from '../env.js';

const CERT = '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----';
const KEY = '-----BEGIN PRIVATE KEY-----\nBBBB\n-----END PRIVATE KEY-----';
const base = { ARCA_TEST_CERT: CERT, ARCA_TEST_KEY: KEY, ARCA_TEST_CUIT: '20123456786' };

describe('credenciales', () => {
  it('sin certificado, clave o CUIT devuelve undefined', () => {
    expect(credenciales({})).toBeUndefined();
    expect(credenciales({ ...base, ARCA_TEST_CUIT: '' })).toBeUndefined();
    expect(credenciales({ ...base, ARCA_TEST_KEY: '  ' })).toBeUndefined();
  });

  it('sin PERFIL asume ri y lo marca como no explícito; defaults de servicios y punto de venta', () => {
    expect(credenciales(base)).toMatchObject({
      cuit: '20123456786',
      cert: CERT,
      key: KEY,
      perfil: 'ri',
      perfilExplicito: false,
      ptoVta: 1,
      ticketsDir: undefined,
    });
  });

  it('lee perfil, servicios, punto de venta y tickets', () => {
    const c = credenciales({
      ...base,
      ARCA_TEST_PERFIL: 'monotributo',
      ARCA_TEST_SERVICES: 'wsfe, wscdc',
      ARCA_TEST_PTO_VTA: '3',
      ARCA_TEST_TICKETS_DIR: '.tickets',
    });
    expect(c).toMatchObject({ perfil: 'monotributo', perfilExplicito: true, ptoVta: 3, ticketsDir: '.tickets' });
    expect([...c!.servicios]).toEqual(['wsfe', 'wscdc']);
  });

  it('normaliza la CUIT con guiones y rechaza una que no tenga 11 dígitos, sin mostrar el valor', () => {
    expect(credenciales({ ...base, ARCA_TEST_CUIT: '20-12345678-6' })?.cuit).toBe('20123456786');
    expect(() => credenciales({ ...base, ARCA_TEST_CUIT: '2012345678' })).toThrow(
      /^ARCA_TEST_CUIT debe ser una CUIT de 11 dígitos$/,
    );
  });

  it('un punto de venta que no es un entero positivo es un error', () => {
    for (const ptoVta of ['abc', '0', '1.5']) {
      expect(() => credenciales({ ...base, ARCA_TEST_PTO_VTA: ptoVta })).toThrow(/ARCA_TEST_PTO_VTA/);
    }
  });

  it('usuario no lee el certificado ni la clave; credenciales sí', () => {
    const rutas = { ...base, ARCA_TEST_CERT: './no-existe.crt', ARCA_TEST_KEY: './no-existe.key' };
    expect(usuario(rutas)).toMatchObject({ cuit: '20123456786', perfil: 'ri' });
    expect(usuario(rutas)).not.toHaveProperty('cert');
    expect(() => credenciales(rutas)).toThrow(/ENOENT/);
  });

  it('un PERFIL desconocido es un error', () => {
    expect(() => credenciales({ ...base, ARCA_TEST_PERFIL: 'exento' })).toThrow(
      /ARCA_TEST_PERFIL debe ser ri o monotributo/,
    );
  });

  it('usa el prefijo dado (contraparte) e ignora las del principal', () => {
    const vars = Object.fromEntries(
      Object.entries(base).map(([k, v]) => [k.replace('ARCA_TEST_', 'ARCA_TEST_CONTRAPARTE_'), v]),
    );
    expect(credenciales(vars)).toBeUndefined();
    expect(credenciales(vars, 'ARCA_TEST_CONTRAPARTE_')?.cuit).toBe('20123456786');
    expect(credenciales(base, 'ARCA_TEST_CONTRAPARTE_')).toBeUndefined();
  });
});
