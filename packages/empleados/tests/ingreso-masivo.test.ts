import { describe, expect, it } from 'vitest';
import {
  ArcaEmpleados,
  ArcaSerializationError,
  ArcaValidationError,
  CAMPOS_OBLIGATORIOS,
  validateCuilTrabajador,
  validateRegistro,
} from '../src/index.js';
import type { AltaRelacionLaboral, RegistroRelacionLaboral } from '../src/index.js';

const alta = (cuil: string | number = '20-12345678-6'): AltaRelacionLaboral => ({
  cuil,
  fechaInicio: '2026-11-02',
  modalidadContrato: 8,
  obraSocial: '126205',
  sucursal: 1,
});

function capturar(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error('no lanzó');
}

describe('validateCuilTrabajador', () => {
  it('acepta prefijos de persona física con dígito verificador correcto', () => {
    expect(validateCuilTrabajador('20-12345678-6')).toBe('20123456786');
    expect(validateCuilTrabajador(27111111117)).toBe('27111111117');
    expect(validateCuilTrabajador('23987654325')).toBe('23987654325');
  });

  it('rechaza prefijos de persona jurídica', () => {
    expect(() => validateCuilTrabajador('30-71234567-1')).toThrow(/persona física/);
  });

  it('rechaza dígito verificador incorrecto conservando cause', () => {
    const e = capturar(() => validateCuilTrabajador('20123456787')) as ArcaValidationError;
    expect(e).toBeInstanceOf(ArcaValidationError);
    expect(e.message).toMatch(/^CUIL/);
    expect(e.field).toBe('cuil');
    expect(e.cause).toBeInstanceOf(ArcaValidationError);
  });
});

describe('validateRegistro', () => {
  it('campos obligatorios por movimiento', () => {
    expect(CAMPOS_OBLIGATORIOS.AT).toEqual(['cuil', 'fechaInicio', 'modalidadContrato', 'obraSocial', 'sucursal']);
    const e = capturar(() => validateRegistro({ movimiento: 'AT', cuil: '20123456786' })) as ArcaValidationError;
    expect(e.details.map((d) => d.field)).toEqual(['fechaInicio', 'modalidadContrato', 'obraSocial', 'sucursal']);
    expect(() => validateRegistro({ movimiento: 'BT', cuil: '20123456786' })).toThrow(/fechaFin/);
    expect(() => validateRegistro({ movimiento: 'BT', cuil: '20123456786', fechaFin: '2026-11-30' })).not.toThrow();
    expect(() => validateRegistro({ movimiento: 'MR', cuil: '20123456786' })).not.toThrow();
    expect(() => validateRegistro({ movimiento: 'NA', cuil: '20123456786' })).not.toThrow();
    expect(() => validateRegistro({ movimiento: 'NB', cuil: '20123456786' })).not.toThrow();
  });

  it('informa todos los errores (formato + negocio) juntos', () => {
    const e = capturar(() =>
      validateRegistro({ ...alta('20123456787'), movimiento: 'AT', obraSocial: '1234567', retribucion: NaN, rectificacion: 6 }),
    ) as ArcaValidationError;
    const campos = e.details.map((d) => d.field);
    expect(campos).toEqual(expect.arrayContaining(['obraSocial', 'retribucion', 'cuil', 'rectificacion']));
  });

  it('fechaFin anterior a fechaInicio', () => {
    expect(() => validateRegistro({ ...alta(), movimiento: 'AT', fechaFin: '2026-11-01' })).toThrow(/anterior/);
    expect(() => validateRegistro({ ...alta(), movimiento: 'AT', fechaFin: '2026-11-02' })).not.toThrow();
  });

  it('rectificación 00-05 y marca 0-9', () => {
    expect(() => validateRegistro({ movimiento: 'MR', cuil: '20123456786', rectificacion: 5 })).not.toThrow();
    expect(() => validateRegistro({ movimiento: 'MR', cuil: '20123456786', rectificacion: '06' })).toThrow(/rectificacion/);
    expect(() => validateRegistro({ movimiento: 'MR', cuil: '20123456786', marcaCovidTipoContratoCCG: 9 })).not.toThrow();
  });

  it('no-objeto: error claro', () => {
    expect(() => validateRegistro(undefined as unknown as RegistroRelacionLaboral)).toThrow(/debe ser un objeto/);
  });
});

describe('ArcaEmpleados', () => {
  it('alta, baja y modificación generan registros 01 de 130 posiciones', () => {
    const sr = new ArcaEmpleados()
      .alta(alta())
      .baja({ cuil: '27111111117', fechaInicio: '2025-03-01', fechaFin: '2026-10-31' })
      .modificacion({ cuil: '20345678906', retribucion: 2000.5 })
      .novedad({ movimiento: 'NA', cuil: '23987654325' });
    const out = sr.generar();
    expect(out.lineas).toHaveLength(4);
    for (const l of out.lineas) {
      expect(l).toHaveLength(130);
      expect(l.slice(0, 2)).toBe('01');
    }
    expect(out.lineas.map((l) => l.slice(2, 4))).toEqual(['AT', 'BT', 'MR', 'NA']);
    expect(out.contenido).toBe(out.lineas.join('\r\n') + '\r\n');
    expect(out.encoding).toBe('latin1');
    expect(out.buffer).toHaveLength(4 * 132);
    expect(out.resumen).toEqual({ totalRegistros: 4, altas: 1, bajas: 1, modificaciones: 1, na: 1, nb: 0 });
  });

  it('opciones de serialización (LF, ASCII con transliteración)', () => {
    const out = new ArcaEmpleados({ serializacion: { eol: '\n', encoding: 'ascii', noRepresentables: 'transliterar' } })
      .alta({ ...alta(), cct: 'ÑU' })
      .generar();
    expect(out.contenido).toBe(out.lineas[0] + '\n');
    expect(out.lineas[0].slice(90, 100)).toBe('NU        ');
    expect(out.encoding).toBe('ascii');
  });

  it('valida las opciones en el constructor', () => {
    expect(() => new ArcaEmpleados({ serializacion: { eol: 'x' as '\n' } })).toThrow(TypeError);
    expect(() => new ArcaEmpleados({ strict: 'no' as unknown as boolean })).toThrow(TypeError);
  });

  it('strict (default) rechaza CUIL con dígito verificador incorrecto y faltantes', () => {
    const sr = new ArcaEmpleados();
    expect(() => sr.alta(alta('20123456787'))).toThrow(ArcaValidationError);
    expect(() => sr.alta({ cuil: '20123456786' })).toThrow(/fechaInicio/);
    expect(sr.cantidad).toBe(0);
  });

  it('strict:false da errores claros, no TypeError', () => {
    const sr = new ArcaEmpleados({ strict: false });
    for (const v of [undefined, null, 'x', 42, []]) {
      const e = capturar(() => sr.alta(v as unknown as AltaRelacionLaboral));
      expect(e).toBeInstanceOf(ArcaValidationError);
      expect((e as Error).message).toMatch(/objeto/);
      expect((e as Error).message).not.toMatch(/Cannot read properties/);
    }
    expect(capturar(() => sr.novedad(undefined as unknown as RegistroRelacionLaboral))).toBeInstanceOf(ArcaValidationError);
    expect(() => sr.novedad({ movimiento: 'ZZ' } as unknown as RegistroRelacionLaboral)).toThrow(/movimiento inválido/);
    // reglas de negocio no se aplican...
    sr.alta({ cuil: '20123456787' });
    expect(sr.cantidad).toBe(1);
    // ...pero el formato sí, con error explícito
    const e = capturar(() => sr.alta({ cuil: '20123456786', obraSocial: '1234567' })) as ArcaSerializationError;
    expect(e).toBeInstanceOf(ArcaSerializationError);
    expect(e.field).toBe('obraSocial');
    expect(capturar(() => sr.alta({} as AltaRelacionLaboral))).toBeInstanceOf(ArcaSerializationError);
    expect(sr.cantidad).toBe(1);
  });

  it('rechaza un movimiento distinto al del método', () => {
    expect(() => new ArcaEmpleados().alta({ ...alta(), movimiento: 'BT' } as AltaRelacionLaboral)).toThrow(/movimiento/);
  });

  it('operaciones masivas atómicas', () => {
    const sr = new ArcaEmpleados().alta(alta());
    const e = capturar(() =>
      sr.altasMasivas([alta('27111111117'), alta('20123456787'), { ...alta('20345678906'), obraSocial: 'abc' }]),
    ) as ArcaValidationError;
    expect(e).toBeInstanceOf(ArcaValidationError);
    expect(e.message).toMatch(/2 de 3 registros inválidos; no se agregó ninguno/);
    expect(e.details.map((d) => d.field)).toEqual(expect.arrayContaining(['[1].cuil', '[2].obraSocial']));
    expect(e.cause).toBeInstanceOf(AggregateError);
    expect((e.cause as AggregateError).errors).toHaveLength(2);
    expect(sr.cantidad).toBe(1);

    sr.altasMasivas([alta('27111111117'), alta('20345678906')]);
    sr.bajasMasivas([{ cuil: '23987654325', fechaFin: '2026-11-30' }]);
    sr.modificacionesMasivas([{ cuil: '23987654325', puesto: '12' }]);
    expect(sr.resumen()).toMatchObject({ totalRegistros: 5, altas: 3, bajas: 1, modificaciones: 1 });
  });

  it('masivas: un solo error conserva el error original como cause', () => {
    const e = capturar(() => new ArcaEmpleados().bajasMasivas([{ cuil: '20123456786' }])) as ArcaValidationError;
    expect(e.cause).toBeInstanceOf(ArcaValidationError);
    expect(e.details[0].field).toBe('[0].fechaFin');
  });

  it('masivas en modo no estricto: errores de formato se agregan con cause', () => {
    const e = capturar(() =>
      new ArcaEmpleados({ strict: false }).novedadesMasivas([{ movimiento: 'MR', cuil: '1' }]),
    ) as ArcaValidationError;
    expect(e).toBeInstanceOf(ArcaValidationError);
    expect(e.details[0].field).toBe('[0].cuil');
    expect(e.cause).toBeInstanceOf(ArcaSerializationError);
  });

  it('masivas: rechaza no-arrays', () => {
    expect(() => new ArcaEmpleados().altasMasivas(undefined as unknown as AltaRelacionLaboral[])).toThrow(ArcaValidationError);
  });

  it('registros no expone datos mutables', () => {
    const fecha = new Date('2026-11-02T15:00:00Z');
    const datos = { ...alta(), fechaInicio: fecha };
    const sr = new ArcaEmpleados().alta(datos);
    // mutar el input después de agregarlo no cambia el registro
    fecha.setUTCFullYear(2000);
    datos.obraSocial = '999999';
    const regs = sr.registros;
    expect(regs[0].movimiento).toBe('AT');
    expect(regs[0].obraSocial).toBe('126205');
    expect((regs[0].fechaInicio as Date).getUTCFullYear()).toBe(2026);
    // mutar lo devuelto tampoco
    regs[0].obraSocial = '1';
    (regs[0].fechaInicio as Date).setUTCFullYear(1999);
    regs.push({ movimiento: 'MR', cuil: '1' });
    expect(sr.registros).toHaveLength(1);
    expect(sr.registros[0].obraSocial).toBe('126205');
    expect((sr.registros[0].fechaInicio as Date).getUTCFullYear()).toBe(2026);
    expect(sr.generar().lineas[0].slice(19, 29)).toBe('2026/11/02');
  });

  it('generar sin registros lanza; limpiar vacía', () => {
    expect(() => new ArcaEmpleados().generar()).toThrow(ArcaValidationError);
    const sr = new ArcaEmpleados().alta(alta()).limpiar();
    expect(sr.cantidad).toBe(0);
  });
});
