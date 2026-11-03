import { describe, it, expect } from 'vitest';
import { validateFacturarOpts, validateFacturarExpoOpts, validateInvoiceRequest } from '../src/validation.js';
import { IvaTipo, CbteTipo, DocTipo, CondicionIva, TributoTipo } from '../src/constants.js';

describe('validateFacturarOpts', () => {
  const validOpts = {
    ptoVta: 1,
    cbteTipo: CbteTipo.FACTURA_B,
    items: [{ neto: 100, iva: IvaTipo.IVA_21 }],
  };

  it('acepta opts válidos', () => {
    expect(() => validateFacturarOpts(validOpts)).not.toThrow();
  });

  it('rechaza ptoVta 0', () => {
    expect(() => validateFacturarOpts({ ...validOpts, ptoVta: 0 })).toThrow('ptoVta');
  });

  it('rechaza items vacío', () => {
    expect(() => validateFacturarOpts({ ...validOpts, items: [] })).toThrow('items');
  });

  it('rechaza neto negativo', () => {
    expect(() =>
      validateFacturarOpts({
        ...validOpts,
        items: [{ neto: -10, iva: IvaTipo.IVA_21 }],
      }),
    ).toThrow('negativo');
  });

  it('rechaza iva + exento en mismo item', () => {
    expect(() =>
      validateFacturarOpts({
        ...validOpts,
        items: [{ neto: 100, iva: IvaTipo.IVA_21, exento: true }],
      }),
    ).toThrow('iva');
  });

  it('rechaza moneda extranjera sin cotización', () => {
    expect(() =>
      validateFacturarOpts({
        ...validOpts,
        moneda: 'DOL',
      }),
    ).toThrow('cotizacion');
  });

  it('rechaza Factura A sin condicionIva', () => {
    expect(() =>
      validateFacturarOpts({
        ...validOpts,
        docTipo: DocTipo.CUIT,
        docNro: 30712345671,
      }),
    ).toThrow('condicionIva');
  });

  it('acepta Factura A con condicionIva', () => {
    expect(() =>
      validateFacturarOpts({
        ...validOpts,
        docTipo: DocTipo.CUIT,
        docNro: 30712345671,
        condicionIva: CondicionIva.RESPONSABLE_INSCRIPTO,
      }),
    ).not.toThrow();
  });

  it('no requiere condicionIva para consumidor final', () => {
    expect(
      () => validateFacturarOpts(validOpts), // default docTipo=99
    ).not.toThrow();
  });

  it('rechaza servicio incompleto', () => {
    expect(() =>
      validateFacturarOpts({
        ...validOpts,
        servicio: { desde: '20260301', hasta: '20260331', vtoPago: '' as any },
      }),
    ).toThrow('vtoPago');
  });
});

describe('validateFacturarExpoOpts', () => {
  const validOpts = {
    ptoVta: 1,
    cbteTipo: CbteTipo.FACTURA_E,
    tipoExpo: 1,
    pais: 212,
    cliente: {
      nombre: 'ACME',
      cuitPais: 55000002126,
      domicilio: '123 Main St',
      idImpositivo: 'XX',
    },
    moneda: 'DOL',
    cotizacion: 1200,
    formaPago: 'Wire',
    incoterms: 'FOB',
    items: [{ codigo: 'X', descripcion: 'Y', cantidad: 1, unidad: 7, precioUnitario: 10 }],
  };

  it('acepta opts válidos', () => {
    expect(() => validateFacturarExpoOpts(validOpts)).not.toThrow();
  });

  it('incoterms es obligatorio solo en Factura E de bienes (1640)', () => {
    expect(() => validateFacturarExpoOpts({ ...validOpts, incoterms: undefined })).toThrow(
      expect.objectContaining({ field: 'incoterms', message: expect.stringContaining('1640') }),
    );
    expect(() => validateFacturarExpoOpts({ ...validOpts, tipoExpo: 2, incoterms: undefined })).not.toThrow();
    expect(() =>
      validateFacturarExpoOpts({
        ...validOpts,
        cbteTipo: CbteTipo.NOTA_CREDITO_E,
        formaPago: undefined,
        incoterms: undefined,
      }),
    ).not.toThrow();
  });

  it('incotermsDes sin incoterms → 1641', () => {
    expect(() =>
      validateFacturarExpoOpts({ ...validOpts, tipoExpo: 2, incoterms: undefined, incotermsDes: 'Free on board' }),
    ).toThrow(expect.objectContaining({ field: 'incoterms', message: expect.stringContaining('1641') }));
  });

  it('rechaza sin tipoExpo', () => {
    expect(() => validateFacturarExpoOpts({ ...validOpts, tipoExpo: 0 as any })).toThrow('tipoExpo');
  });

  it('rechaza sin cliente.domicilio', () => {
    expect(() =>
      validateFacturarExpoOpts({
        ...validOpts,
        cliente: { ...validOpts.cliente, domicilio: '' },
      }),
    ).toThrow('domicilio');
  });

  it('rechaza sin cliente', () => {
    expect(() => validateFacturarExpoOpts({ ...validOpts, cliente: undefined as any })).toThrow('cliente');
  });

  it('rechaza sin moneda', () => {
    expect(() => validateFacturarExpoOpts({ ...validOpts, moneda: '' })).toThrow('moneda');
  });

  it('rechaza item sin descripción', () => {
    expect(() =>
      validateFacturarExpoOpts({
        ...validOpts,
        items: [{ codigo: 'X', descripcion: '', cantidad: 1, unidad: 7, precioUnitario: 10 }],
      }),
    ).toThrow('descripcion');
  });
});

describe('validateInvoiceRequest', () => {
  it('rechaza sin ptoVta', () => {
    expect(() =>
      validateInvoiceRequest({
        ptoVta: 0,
        cbteTipo: 6,
        invoices: [
          {
            cbteDesde: 1,
            cbteHasta: 1,
            cbteFch: '20260328',
            impTotal: 121,
            impTotConc: 0,
            impNeto: 100,
            impOpEx: 0,
            impTrib: 0,
            impIva: 21,
            monId: 'PES',
            monCotiz: 1,
            concepto: 1,
            docTipo: 99,
            docNro: 0,
          },
        ],
      }),
    ).toThrow('ptoVta');
  });

  it('rechaza invoices vacío', () => {
    expect(() => validateInvoiceRequest({ ptoVta: 1, cbteTipo: 6, invoices: [] })).toThrow('invoices');
  });
});

describe('validateInvoiceRequest (raw)', () => {
  const inv = {
    concepto: 1,
    docTipo: 99,
    docNro: 0,
    cbteDesde: 1,
    cbteHasta: 1,
    cbteFch: '20261030',
    impTotal: 121,
    impTotConc: 0,
    impNeto: 100,
    impOpEx: 0,
    impTrib: 0,
    impIva: 21,
    monId: 'PES',
    monCotiz: 1,
    condicionIvaReceptorId: 5,
    iva: [{ id: 5, baseImp: 100, importe: 21 }],
  };
  const req = (extra: Record<string, unknown>) => ({ ptoVta: 1, cbteTipo: 6, invoices: [{ ...inv, ...extra }] });

  it('acepta un detalle válido', () => {
    expect(() => validateInvoiceRequest(req({}))).not.toThrow();
  });

  it.each([
    ['cbteFch inexistente', { cbteFch: '20261399' }, 'cbteFch'],
    ['cbteFch con guiones', { cbteFch: '2026-10-30' }, 'cbteFch'],
    ['fchServDesde inválida', { fchServDesde: '20261132' }, 'fchServDesde'],
    ['PES con monCotiz 2', { monCotiz: 2 }, 'monCotiz'],
    ['DOL sin monCotiz ni canMisMonExt S', { monId: 'DOL', monCotiz: undefined }, 'monCotiz'],
    ['canMisMonExt S con PES', { canMisMonExt: 'S' }, 'canMisMonExt'],
    ['impTotal NaN', { impTotal: Number.NaN }, 'impTotal'],
  ])('rechaza %s', (_, extra, field) => {
    expect(() => validateInvoiceRequest(req(extra) as never)).toThrow(field);
  });

  it('DOL con canMisMonExt S puede omitir monCotiz', () => {
    expect(() =>
      validateInvoiceRequest(req({ monId: 'DOL', monCotiz: undefined, canMisMonExt: 'S' }) as never),
    ).not.toThrow();
  });

  it('condicionIvaReceptorId es obligatorio también con docTipo 99 (10246)', () => {
    expect(() => validateInvoiceRequest(req({ condicionIvaReceptorId: undefined }) as never)).toThrow('10246');
  });

  it.each([
    ['impTotal distinto de la suma (10048)', { impTotal: 125 }, '10048'],
    ['impIva distinto de la suma de iva[] (10023)', { iva: [{ id: 5, baseImp: 100, importe: 20 }] }, '10023'],
    ['impIva sin array iva (10023)', { iva: undefined }, '10023'],
    ['impTrib sin tributos (10029)', { impTrib: 5, impTotal: 126 }, '10029'],
    [
      'impTrib distinto de la suma de tributos[] (10029)',
      { impTrib: 5, impTotal: 126, tributos: [{ id: 99, baseImp: 100, alic: 3, importe: 3 }] },
      '10029',
    ],
  ])('rechaza %s', (_, extra, codigo) => {
    expect(() => validateInvoiceRequest(req(extra) as never)).toThrow(codigo);
  });

  it('acepta diferencias dentro del margen del manual (0,01 por elemento)', () => {
    expect(() =>
      validateInvoiceRequest(
        req({
          impTotal: 121.01,
          impTrib: 0.01,
          tributos: [{ id: 99, baseImp: 1, alic: 1, importe: 0.01 }],
          iva: [{ id: 5, baseImp: 100, importe: 20.995 }],
        }) as never,
      ),
    ).not.toThrow();
  });
});

describe('validateFacturarOpts: vtoPago y FCE MiPyME', () => {
  const CUIT_RECEPTOR = 30712345671;
  const fce = {
    ptoVta: 1,
    cbteTipo: CbteTipo.FCE_FACTURA_A,
    docTipo: DocTipo.CUIT,
    docNro: CUIT_RECEPTOR,
    condicionIva: CondicionIva.RESPONSABLE_INSCRIPTO,
    fecha: '20261030',
    items: [{ neto: 100, iva: IvaTipo.IVA_21 }],
    opcionales: [
      { id: '2101', valor: '0110599500000041817221' },
      { id: '27', valor: 'SCA' },
    ],
  };
  const asociada = [{ tipo: CbteTipo.FCE_FACTURA_A, ptoVta: 1, nro: 10, cuit: 20123456786, fecha: '20261020' }];

  it('factura FCE con concepto 1 y vtoPago es válida', () => {
    expect(() => validateFacturarOpts({ ...fce, vtoPago: '20261130' })).not.toThrow();
  });

  it('factura FCE sin vtoPago → 10163 (también con concepto 1)', () => {
    expect(() => validateFacturarOpts(fce)).toThrow('10163');
  });

  it('factura FCE de servicios acepta vtoPago dentro de servicio', () => {
    expect(() =>
      validateFacturarOpts({ ...fce, servicio: { desde: '20261001', hasta: '20261031', vtoPago: '20261130' } }),
    ).not.toThrow();
  });

  it('NC FCE concepto 1 con vtoPago solo si es de anulación (10175)', () => {
    const nc = {
      ...fce,
      cbteTipo: CbteTipo.FCE_NOTA_CREDITO_A,
      cbtesAsoc: asociada,
      opcionales: [{ id: '22', valor: 'N' }],
    };
    expect(() => validateFacturarOpts({ ...nc, vtoPago: '20261130' })).toThrow('10175');
    expect(() =>
      validateFacturarOpts({ ...nc, vtoPago: '20261130', opcionales: [{ id: '22', valor: 'S' }] }),
    ).not.toThrow();
    expect(() => validateFacturarOpts(nc)).not.toThrow();
  });

  it('concepto 1 fuera de FCE no admite vtoPago (10031/10033)', () => {
    expect(() =>
      validateFacturarOpts({ ptoVta: 1, cbteTipo: CbteTipo.FACTURA_B, items: [{ neto: 1 }], vtoPago: '20261130' }),
    ).toThrow('10031');
  });

  it('servicios: vtoPago en servicio o en la raíz (10049), no los dos distintos', () => {
    const base = { ptoVta: 1, cbteTipo: CbteTipo.FACTURA_B, items: [{ neto: 1 }] };
    const servicio = { desde: '20261001', hasta: '20261031' };
    expect(() => validateFacturarOpts({ ...base, servicio })).toThrow('10049');
    expect(() => validateFacturarOpts({ ...base, servicio, vtoPago: '20261110' })).not.toThrow();
    expect(() =>
      validateFacturarOpts({ ...base, servicio: { ...servicio, vtoPago: '20261111' }, vtoPago: '20261110' }),
    ).toThrow('vtoPago');
  });

  it('vtoPago anterior a la fecha del comprobante → 10036', () => {
    expect(() => validateFacturarOpts({ ...fce, vtoPago: '20261001' })).toThrow('10036');
  });

  it('FCE requiere receptor con CUIT', () => {
    expect(() =>
      validateFacturarOpts({
        ...fce,
        cbteTipo: CbteTipo.FCE_FACTURA_B,
        docTipo: DocTipo.DNI,
        docNro: 12345678,
        condicionIva: CondicionIva.EXENTO,
        vtoPago: '20261130',
      }),
    ).toThrow('docTipo 80');
  });

  it('NC/ND FCE sin cbtesAsoc → 10153', () => {
    expect(() => validateFacturarOpts({ ...fce, cbteTipo: CbteTipo.FCE_NOTA_DEBITO_A, opcionales: [] })).toThrow(
      '10153',
    );
  });
});

describe('validateFacturarOpts: opcionales FCE MiPyME (10165-10173, 10214-10216)', () => {
  const CBU = { id: '2101', valor: '0110599500000041817221' };
  const SCA = { id: '27', valor: 'SCA' };
  const factura = {
    ptoVta: 1,
    cbteTipo: CbteTipo.FCE_FACTURA_A,
    docTipo: DocTipo.CUIT,
    docNro: 30712345671,
    condicionIva: CondicionIva.RESPONSABLE_INSCRIPTO,
    fecha: '20261030',
    vtoPago: '20261130',
    items: [{ neto: 100, iva: IvaTipo.IVA_21 }],
    opcionales: [CBU, SCA],
  };
  const nc = {
    ...factura,
    cbteTipo: CbteTipo.FCE_NOTA_CREDITO_A,
    vtoPago: undefined,
    cbtesAsoc: [{ tipo: CbteTipo.FCE_FACTURA_A, ptoVta: 1, nro: 10, cuit: 20123456786, fecha: '20261020' }],
    opcionales: [{ id: '22', valor: 'N' }],
  };

  it('factura y NC FCE con sus opcionales son válidas', () => {
    expect(() => validateFacturarOpts(factura)).not.toThrow();
    expect(() => validateFacturarOpts({ ...factura, opcionales: [CBU, { id: '27', valor: 'ADC' }] })).not.toThrow();
    expect(() => validateFacturarOpts(nc)).not.toThrow();
  });

  it('factura FCE sin CBU → 10168', () => {
    expect(() => validateFacturarOpts({ ...factura, opcionales: [SCA] })).toThrow('10168');
  });

  it('factura FCE sin 27 → 10216; con otro valor → 10214/10215', () => {
    expect(() => validateFacturarOpts({ ...factura, opcionales: [CBU] })).toThrow('10216');
    expect(() => validateFacturarOpts({ ...factura, opcionales: [CBU, { id: '27', valor: 'XXX' }] })).toThrow(
      expect.objectContaining({ field: 'opcionales[1].valor', message: expect.stringContaining('10214/10215') }),
    );
  });

  it('factura FCE con 22 → 10171', () => {
    expect(() => validateFacturarOpts({ ...factura, opcionales: [CBU, SCA, { id: '22', valor: 'N' }] })).toThrow(
      '10171',
    );
  });

  it('CBU de 22 dígitos (10165) y alias de 6 a 20 caracteres (10166)', () => {
    expect(() => validateFacturarOpts({ ...factura, opcionales: [{ id: '2101', valor: '123' }, SCA] })).toThrow(
      '10165',
    );
    expect(() =>
      validateFacturarOpts({ ...factura, opcionales: [CBU, SCA, { id: '2102', valor: 'mi.alias.mp' }] }),
    ).not.toThrow();
    expect(() => validateFacturarOpts({ ...factura, opcionales: [CBU, SCA, { id: '2102', valor: 'abc' }] })).toThrow(
      '10166',
    );
  });

  it('NC/ND FCE sin 22 → 10173; con otro valor → 10167', () => {
    expect(() => validateFacturarOpts({ ...nc, opcionales: [] })).toThrow('10173');
    expect(() => validateFacturarOpts({ ...nc, opcionales: [{ id: '22', valor: 'X' }] })).toThrow('10167');
  });

  it('NC/ND FCE con CBU, alias o 27 → 10172', () => {
    for (const extra of [CBU, { id: '2102', valor: 'mi.alias.mp' }, SCA])
      expect(() => validateFacturarOpts({ ...nc, opcionales: [{ id: '22', valor: 'N' }, extra] })).toThrow('10172');
  });

  it('comprobantes que no son FCE no llevan 2101, 2102, 22 ni 27 → 10169', () => {
    const b = { ptoVta: 1, cbteTipo: CbteTipo.FACTURA_B, items: [{ neto: 1 }] };
    for (const op of [CBU, { id: '2102', valor: 'mi.alias.mp' }, { id: '22', valor: 'N' }, SCA])
      expect(() => validateFacturarOpts({ ...b, opcionales: [op] })).toThrow(
        expect.objectContaining({ field: 'opcionales[0].id', message: expect.stringContaining('10169') }),
      );
    expect(() => validateFacturarOpts({ ...b, opcionales: [{ id: '5', valor: '12345678' }] })).not.toThrow();
  });
});

describe('validateFacturarOpts: reglas del manual WSFEv1 v4.7', () => {
  const base = { ptoVta: 1, items: [{ neto: 100, iva: IvaTipo.IVA_21 }] };

  it('NC/ND sin cbtesAsoc ni periodoAsoc → 10197', () => {
    expect(() => validateFacturarOpts({ ...base, cbteTipo: CbteTipo.NOTA_CREDITO_B })).toThrow('10197');
    expect(() =>
      validateFacturarOpts({
        ...base,
        cbteTipo: CbteTipo.NOTA_CREDITO_B,
        periodoAsoc: { desde: '20261001', hasta: '20261031' },
      }),
    ).not.toThrow();
  });

  it.each([CbteTipo.FACTURA_M, CbteTipo.LIQUIDACION_A, CbteTipo.CBTE_A_ANEXO_I_RG1415])(
    'tipo %i (clase A / M) exige receptor con CUIT y condición de clase A',
    (cbteTipo) => {
      expect(() => validateFacturarOpts({ ...base, cbteTipo })).toThrow('10013');
      expect(() =>
        validateFacturarOpts({
          ...base,
          cbteTipo,
          docTipo: DocTipo.CUIT,
          docNro: 30712345671,
          condicionIva: CondicionIva.EXENTO,
        }),
      ).toThrow('10243');
    },
  );

  it('B a No Categorizado (23000000000) con gravado exige el tributo 13 (10067/10283)', () => {
    const nc = {
      ...base,
      cbteTipo: CbteTipo.FACTURA_B,
      docTipo: DocTipo.CUIT,
      docNro: 23000000000,
      condicionIva: CondicionIva.NO_CATEGORIZADO,
    };
    expect(() => validateFacturarOpts(nc)).toThrow('10067');
    expect(() =>
      validateFacturarOpts({
        ...nc,
        tributos: [
          { id: TributoTipo.PERCEP_IVA_NO_CATEGORIZADO, desc: 'Percepción', baseImp: 100, alic: 10.5, importe: 10.5 },
        ],
      }),
    ).not.toThrow();
  });

  describe('compradores (10135-10147)', () => {
    const receptor = {
      ...base,
      cbteTipo: CbteTipo.FACTURA_A,
      docTipo: DocTipo.CUIT,
      docNro: 30712345671,
      condicionIva: CondicionIva.RESPONSABLE_INSCRIPTO,
    };
    const ok = [
      { docTipo: DocTipo.CUIT, docNro: 30712345671, porcentaje: 60 },
      { docTipo: DocTipo.CUIT, docNro: 20111111112, porcentaje: 40 },
    ];

    it('acepta compradores válidos', () => {
      expect(() => validateFacturarOpts({ ...receptor, compradores: ok })).not.toThrow();
    });

    it.each([
      ['un solo comprador', [{ ...ok[0], porcentaje: 100 }], '10145'],
      ['porcentajes que no suman 100', [ok[0], { ...ok[1], porcentaje: 30 }], '10147'],
      [
        'repetidos',
        [
          { ...ok[0], porcentaje: 50 },
          { ...ok[0], porcentaje: 50 },
        ],
        '10141',
      ],
      ['DNI', [ok[0], { ...ok[1], docTipo: DocTipo.DNI }], '10137'],
      [
        'el receptor no es el de mayor porcentaje',
        [
          { ...ok[0], porcentaje: 40 },
          { ...ok[1], porcentaje: 60 },
        ],
        '10146',
      ],
    ])('rechaza %s', (_, compradores, codigo) => {
      expect(() => validateFacturarOpts({ ...receptor, compradores })).toThrow(codigo);
    });
  });
});
