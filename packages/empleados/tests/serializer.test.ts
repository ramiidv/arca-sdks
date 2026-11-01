import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ArcaEmpleadosError,
  ArcaError,
  ArcaSerializationError,
  ArcaValidationError,
  DISENO_REGISTRO,
  LONGITUD_REGISTRO,
  codificarArchivo,
  formatFechaSR,
  serializarArchivo,
  serializarRegistro,
} from '../src/index.js';
import type { RegistroRelacionLaboral } from '../src/index.js';

const CUIL = '20-12345678-6';

/** Devuelve el contenido de un campo según el diseño de registro (posiciones 1-based). */
function campo(linea: string, nombre: string): string {
  const c = DISENO_REGISTRO.find((d) => d.campo === nombre);
  if (!c) throw new Error(`campo ${nombre} no existe`);
  return linea.slice(c.desde - 1, c.hasta);
}

const ALTA: RegistroRelacionLaboral = {
  movimiento: 'AT',
  cuil: CUIL,
  trabajadorAgropecuario: 'S',
  modalidadContrato: 8,
  fechaInicio: '2026-11-02',
  obraSocial: '126205',
  situacionRevista: 1,
  retribucion: 1500,
  modalidadLiquidacion: 3,
  sucursal: 1,
  actividad: 620100,
  puesto: '2512',
  cct: '130/75',
  categoriaProfesional: 123,
};

describe('diseño de registro', () => {
  it('cubre las posiciones 1 a 130 sin huecos ni solapamientos (manual pág. 24)', () => {
    let pos = 1;
    for (const c of DISENO_REGISTRO) {
      expect(c.desde).toBe(pos);
      expect(c.longitud).toBe(c.hasta - c.desde + 1);
      pos = c.hasta + 1;
    }
    expect(pos - 1).toBe(LONGITUD_REGISTRO);
    expect(DISENO_REGISTRO).toHaveLength(22);
  });

  it('tiene las posiciones y tipos del manual', () => {
    const tabla = DISENO_REGISTRO.map((c) => `${c.campo}:${c.desde}-${c.hasta}:${c.tipo}`);
    expect(tabla).toEqual([
      'tipoRegistro:1-2:N',
      'movimiento:3-4:A',
      'cuil:5-15:N',
      'trabajadorAgropecuario:16-16:A',
      'modalidadContrato:17-19:N',
      'fechaInicio:20-29:F',
      'fechaFin:30-39:F',
      'obraSocial:40-45:N',
      'situacionRevista:46-47:N',
      'fechaTelegramaRenuncia:48-57:F',
      'retribucion:58-72:N',
      'modalidadLiquidacion:73-73:N',
      'sucursal:74-78:N',
      'actividad:79-84:N',
      'puesto:85-88:A',
      'rectificacion:89-90:N',
      'cct:91-100:A',
      'categoriaProfesional:101-106:N',
      'tipoServicio:107-109:N',
      'fechaSuspensionServiciosTemporarios:110-119:F',
      'numeroFormularioAgropecuario:120-129:N',
      'marcaCovidTipoContratoCCG:130-130:N',
    ]);
  });
});

describe('golden: registro 01', () => {
  it('AT', () => {
    const linea = serializarRegistro(ALTA);
    const esperado =
      '01' + // 1-2 tipo
      'AT' + // 3-4 movimiento
      '20123456786' + // 5-15 CUIL
      'S' + // 16 agropecuario
      '008' + // 17-19 modalidad
      '2026/11/02' + // 20-29 inicio
      ' '.repeat(10) + // 30-39 fin
      '126205' + // 40-45 obra social
      '01' + // 46-47 situación revista
      ' '.repeat(10) + // 48-57 telegrama
      '000000000150000' + // 58-72 retribución (2 decimales implícitos)
      '3' + // 73 modalidad liquidación
      '00001' + // 74-78 sucursal
      '620100' + // 79-84 actividad
      '2512' + // 85-88 puesto
      '00' + // 89-90 rectificación
      '130/75    ' + // 91-100 CCT
      '000123' + // 101-106 categoría
      '000' + // 107-109 tipo servicio
      ' '.repeat(10) + // 110-119 fecha suspensión
      '0000000000' + // 120-129 formulario agropecuario
      '0'; // 130 marca COVID/CCG
    expect(linea).toHaveLength(130);
    expect(linea).toBe(esperado);
    expect(campo(linea, 'cuil')).toBe('20123456786');
    expect(campo(linea, 'fechaInicio')).toBe('2026/11/02');
    expect(campo(linea, 'cct')).toBe('130/75    ');
  });

  it('BT', () => {
    const linea = serializarRegistro({
      movimiento: 'BT',
      cuil: '27111111117',
      fechaInicio: '2025-03-01',
      fechaFin: '2026-10-31',
      fechaTelegramaRenuncia: '20261015',
    });
    expect(linea).toHaveLength(130);
    expect(linea).toBe(
      '01BT27111111117' + ' ' + '000' + '2025/03/01' + '2026/10/31' + '000000' + '00' + '2026/10/15' +
      '0'.repeat(15) + '0' + '00000' + '000000' + '    ' + '00' + ' '.repeat(10) + '000000' + '000' +
      ' '.repeat(10) + '0'.repeat(10) + '0',
    );
  });

  it('MR con rectificación y fecha de suspensión', () => {
    const linea = serializarRegistro({
      movimiento: 'MR',
      cuil: 20345678906,
      retribucion: 2345678.9,
      rectificacion: 2,
      fechaSuspensionServiciosTemporarios: '2026/11/05',
      numeroFormularioAgropecuario: '42',
      marcaCovidTipoContratoCCG: 3,
    });
    expect(linea).toHaveLength(130);
    expect(campo(linea, 'tipoRegistro')).toBe('01');
    expect(campo(linea, 'movimiento')).toBe('MR');
    expect(campo(linea, 'cuil')).toBe('20345678906');
    expect(campo(linea, 'retribucion')).toBe('000000234567890');
    expect(campo(linea, 'rectificacion')).toBe('02');
    expect(campo(linea, 'fechaSuspensionServiciosTemporarios')).toBe('2026/11/05');
    expect(campo(linea, 'numeroFormularioAgropecuario')).toBe('0000000042');
    expect(campo(linea, 'marcaCovidTipoContratoCCG')).toBe('3');
    expect(campo(linea, 'fechaInicio')).toBe(' '.repeat(10));
  });

  it('numericoVacio: espacios', () => {
    const linea = serializarRegistro({ movimiento: 'MR', cuil: CUIL }, { numericoVacio: 'espacios' });
    expect(campo(linea, 'obraSocial')).toBe('      ');
    expect(campo(linea, 'retribucion')).toBe(' '.repeat(15));
    // Rectificación y marca 130 tienen default 0 según el manual.
    expect(campo(linea, 'rectificacion')).toBe('00');
    expect(campo(linea, 'marcaCovidTipoContratoCCG')).toBe('0');
  });
});

describe('fechas AAAA/MM/DD', () => {
  afterEach(() => vi.unstubAllEnvs());

  for (const tz of ['UTC', 'America/Argentina/Buenos_Aires', 'Pacific/Kiritimati', 'America/Los_Angeles']) {
    it(`independientes de la zona horaria del proceso (TZ=${tz})`, () => {
      vi.stubEnv('TZ', tz);
      expect(formatFechaSR('2026-11-02')).toBe('2026/11/02');
      expect(formatFechaSR('20261102')).toBe('2026/11/02');
      expect(formatFechaSR('2026/11/02')).toBe('2026/11/02');
      // 01:00 UTC del 2 = 22:00 del 1 en Argentina
      expect(formatFechaSR(new Date('2026-11-02T01:00:00Z'))).toBe('2026/11/01');
      expect(formatFechaSR(new Date('2026-11-02T15:00:00Z'))).toBe('2026/11/02');
    });
  }

  it('rechaza fechas inexistentes, formatos mezclados y tipos incorrectos', () => {
    expect(() => formatFechaSR('2026-02-30')).toThrow(ArcaValidationError);
    expect(() => formatFechaSR('2026-13-01')).toThrow(ArcaValidationError);
    expect(() => formatFechaSR('2026-11/02')).toThrow(ArcaValidationError);
    expect(() => formatFechaSR('02/11/2026')).toThrow(ArcaValidationError);
    expect(() => formatFechaSR(new Date('nope'))).toThrow(ArcaValidationError);
    expect(() => formatFechaSR(20261102 as unknown as string)).toThrow(ArcaValidationError);
  });

  it('una fecha inválida en un registro es ArcaSerializationError con cause', () => {
    try {
      serializarRegistro({ movimiento: 'AT', cuil: CUIL, fechaInicio: '2026-02-30' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ArcaSerializationError);
      const err = e as ArcaSerializationError;
      expect(err.field).toBe('fechaInicio');
      expect(err.desde).toBe(20);
      expect(err.hasta).toBe(29);
      expect(err.cause).toBeInstanceOf(ArcaValidationError);
    }
  });
});

describe('padding y overflow por campo (sin truncado silencioso)', () => {
  const base: RegistroRelacionLaboral = { movimiento: 'MR', cuil: CUIL };
  const serial = (extra: Partial<RegistroRelacionLaboral>) => serializarRegistro({ ...base, ...extra });

  it('obra social N6', () => {
    expect(campo(serial({ obraSocial: 208 }), 'obraSocial')).toBe('000208');
    expect(campo(serial({ obraSocial: '000208' }), 'obraSocial')).toBe('000208');
    expect(campo(serial({ obraSocial: 999999 }), 'obraSocial')).toBe('999999');
    expect(() => serial({ obraSocial: '1262050' })).toThrow(/admite 6/);
    expect(() => serial({ obraSocial: 1000000 })).toThrow(ArcaSerializationError);
  });

  it('puesto A4', () => {
    expect(campo(serial({ puesto: '12' }), 'puesto')).toBe('12  ');
    expect(campo(serial({ puesto: '9999' }), 'puesto')).toBe('9999');
    expect(() => serial({ puesto: '12345' })).toThrow(/admite 4/);
  });

  it('CCT A10', () => {
    expect(campo(serial({ cct: '9999/99' }), 'cct')).toBe('9999/99   ');
    expect(campo(serial({ cct: '1234567890' }), 'cct')).toBe('1234567890');
    expect(() => serial({ cct: '12345678901' })).toThrow(/admite 10/);
  });

  it('retribución N15 con 2 decimales implícitos', () => {
    expect(campo(serial({ retribucion: 0 }), 'retribucion')).toBe('0'.repeat(15));
    expect(campo(serial({ retribucion: 0.01 }), 'retribucion')).toBe('000000000000001');
    expect(campo(serial({ retribucion: 1234.56 }), 'retribucion')).toBe('000000000123456');
    expect(campo(serial({ retribucion: 9999999999999.99 }), 'retribucion')).toBe('999999999999999');
    expect(() => serial({ retribucion: 10000000000000 })).toThrow(/admite 15/);
    expect(() => serial({ retribucion: 1.234 })).toThrow(/2 decimales/);
  });

  it('CUIL debe tener 11 dígitos', () => {
    expect(() => serializarRegistro({ movimiento: 'AT', cuil: '2012345678' })).toThrow(/11 dígitos/);
    expect(() => serializarRegistro({ movimiento: 'AT', cuil: '201234567861' })).toThrow(/11 dígitos/);
    expect(() => serializarRegistro({ movimiento: 'AT' } as RegistroRelacionLaboral)).toThrow(/obligatorio/);
  });

  it('agropecuario A1', () => {
    expect(campo(serial({}), 'trabajadorAgropecuario')).toBe(' ');
    expect(() => serial({ trabajadorAgropecuario: 'SI' })).toThrow(/admite 1/);
  });
});

describe('códigos inválidos y tipos incorrectos', () => {
  const base: RegistroRelacionLaboral = { movimiento: 'MR', cuil: CUIL };
  const bad = (extra: Record<string, unknown>) => () => serializarRegistro({ ...base, ...extra } as RegistroRelacionLaboral);

  it.each([
    ['NaN', { modalidadContrato: NaN }],
    ['negativo', { modalidadContrato: -1 }],
    ['decimal', { situacionRevista: 1.5 }],
    ['Infinity', { sucursal: Infinity }],
    ['string no numérico', { actividad: '62A100' }],
    ['string con espacios', { obraSocial: ' 12' }],
    ['boolean', { tipoServicio: true }],
    ['objeto', { categoriaProfesional: {} }],
    ['retribución NaN', { retribucion: NaN }],
    ['retribución Infinity', { retribucion: Infinity }],
    ['retribución negativa', { retribucion: -1 }],
    ['retribución string', { retribucion: '100' }],
    ['alfanumérico number', { puesto: 1234 }],
    ['fecha number', { fechaFin: 20261102 }],
    ['marca 130 de 2 dígitos', { marcaCovidTipoContratoCCG: 10 }],
    ['movimiento inválido', { movimiento: 'XX' }],
    ['movimiento en minúsculas', { movimiento: 'at' }],
  ])('%s', (_n, extra) => {
    expect(bad(extra)).toThrow(ArcaSerializationError);
  });

  it('registro que no es objeto: error claro', () => {
    expect(() => serializarRegistro(undefined as unknown as RegistroRelacionLaboral)).toThrow(/debe ser un objeto/);
    expect(() => serializarRegistro(null as unknown as RegistroRelacionLaboral)).toThrow(ArcaSerializationError);
  });
});

describe('caracteres y encoding', () => {
  const base: RegistroRelacionLaboral = { movimiento: 'MR', cuil: CUIL };

  it('ñ y acentos son válidos en ISO-8859-1 (default) y ocupan 1 byte', () => {
    const linea = serializarRegistro({ ...base, cct: 'ÑANDÚ' });
    expect(campo(linea, 'cct')).toBe('ÑANDÚ     ');
    const buf = codificarArchivo(linea);
    expect(buf).toHaveLength(130);
    expect(buf[90]).toBe(0xd1); // Ñ en latin1
  });

  it('forma descompuesta (NFD) se normaliza a NFC antes de medir', () => {
    const nfd = 'Ñ'; // N + tilde combinante
    expect(campo(serializarRegistro({ ...base, puesto: nfd }), 'puesto')).toBe('Ñ   ');
  });

  it('caracter fuera de ISO-8859-1: error por defecto', () => {
    expect(() => serializarRegistro({ ...base, cct: 'A€' })).toThrow(/no es representable/);
    expect(() => serializarRegistro({ ...base, cct: '😀' })).toThrow(ArcaSerializationError);
  });

  it('ASCII: error o transliteración', () => {
    expect(() => serializarRegistro({ ...base, cct: 'ÑANDÚ' }, { encoding: 'ascii' })).toThrow(/ASCII/);
    const linea = serializarRegistro({ ...base, cct: 'ÑANDÚ' }, { encoding: 'ascii', noRepresentables: 'transliterar' });
    expect(campo(linea, 'cct')).toBe('NANDU     ');
    expect(() =>
      serializarRegistro({ ...base, cct: '😀' }, { encoding: 'ascii', noRepresentables: 'transliterar' }),
    ).toThrow(ArcaSerializationError);
  });

  it('caracteres de control prohibidos (romperían el ancho fijo)', () => {
    expect(() => serializarRegistro({ ...base, cct: 'A\r\nB' })).toThrow(/control/);
    expect(() => serializarRegistro({ ...base, puesto: '\t' })).toThrow(/control/);
  });

  it('codificarArchivo valida la codificación', () => {
    expect(() => codificarArchivo('€')).toThrow(ArcaSerializationError);
    expect(() => codificarArchivo('ñ', 'ascii')).toThrow(ArcaSerializationError);
    expect([...codificarArchivo('ñ')]).toEqual([0xf1]);
  });
});

describe('archivo', () => {
  const r1: RegistroRelacionLaboral = { movimiento: 'MR', cuil: CUIL };
  const r2: RegistroRelacionLaboral = { movimiento: 'NB', cuil: '27111111117' };

  it('CRLF por defecto, con fin de línea final', () => {
    const txt = serializarArchivo([r1, r2]);
    expect(txt).toHaveLength(2 * 132);
    expect(txt.slice(130, 132)).toBe('\r\n');
    expect(txt.endsWith('\r\n')).toBe(true);
    expect(txt.split('\r\n')).toEqual([expect.any(String), expect.any(String), '']);
  });

  it('eol LF y sin fin de línea final', () => {
    const txt = serializarArchivo([r1, r2], { eol: '\n', eolFinal: false });
    expect(txt).toHaveLength(130 + 1 + 130);
    expect(txt).not.toContain('\r');
  });

  it('opciones inválidas', () => {
    expect(() => serializarArchivo([r1], { eol: '\r' as '\n' })).toThrow(TypeError);
    expect(() => serializarArchivo([r1], { encoding: 'utf8' as 'latin1' })).toThrow(TypeError);
  });

  it('error en un registro: indica el índice y conserva cause', () => {
    try {
      serializarArchivo([r1, { ...r2, obraSocial: '1234567' }]);
      expect.unreachable();
    } catch (e) {
      const err = e as ArcaSerializationError;
      expect(err).toBeInstanceOf(ArcaSerializationError);
      expect(err.indice).toBe(1);
      expect(err.field).toBe('obraSocial');
      expect(err.message).toMatch(/^Registro 1:/);
      expect(err.cause).toBeInstanceOf(ArcaSerializationError);
    }
  });

  it('jerarquía de errores', () => {
    const err = new ArcaSerializationError('x', { cause: 'c' });
    expect(err).toBeInstanceOf(ArcaEmpleadosError);
    expect(err).toBeInstanceOf(ArcaError);
    expect(err.code).toBe('ARCA_SERIALIZATION_ERROR');
    expect(err.cause).toBe('c');
    expect(new ArcaEmpleadosError('y', { cause: 1 }).cause).toBe(1);
  });
});
