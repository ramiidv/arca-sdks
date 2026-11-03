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
        cbteTipo: CbteTipo.FACTURA_A,
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

describe('validateFacturarOpts: reglas del manual WSFEv1 v4.8', () => {
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

  it('B a No Categorizado con otros tributos y sin el 13: la 10283 solo observa, no se rechaza', () => {
    expect(() =>
      validateFacturarOpts({
        ...base,
        cbteTipo: CbteTipo.FACTURA_B,
        docTipo: DocTipo.CUIT,
        docNro: 23000000000,
        condicionIva: CondicionIva.NO_CATEGORIZADO,
        tributos: [{ id: TributoTipo.PERCEP_IIBB, desc: 'IIBB', baseImp: 100, alic: 3, importe: 3 }],
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

describe('validateFacturarOpts: más reglas del manual WSFEv1 v4.8', () => {
  const base = { ptoVta: 1, items: [{ neto: 100, iva: IvaTipo.IVA_21 }] };
  const cuit = (docNro = 30712345671) => ({ docTipo: DocTipo.CUIT, docNro });
  const B = { ...base, cbteTipo: CbteTipo.FACTURA_B };
  const A = { ...base, cbteTipo: CbteTipo.FACTURA_A, ...cuit(), condicionIva: CondicionIva.RESPONSABLE_INSCRIPTO };

  it('10243: condición frente al IVA del receptor por clase (B y 49)', () => {
    expect(() => validateFacturarOpts({ ...B, ...cuit(), condicionIva: CondicionIva.MONOTRIBUTISTA })).toThrow('10243');
    expect(() => validateFacturarOpts({ ...B, ...cuit(), condicionIva: CondicionIva.EXENTO })).not.toThrow();
    expect(() =>
      validateFacturarOpts({
        ...base,
        cbteTipo: CbteTipo.FACTURA_C,
        ...cuit(),
        condicionIva: CondicionIva.MONOTRIBUTISTA,
      }),
    ).not.toThrow();
  });

  it('tipo 49 (Bienes Usados): concepto 1, opcionales 91 y 93, receptor consumidor final', () => {
    const usados = {
      ...base,
      cbteTipo: CbteTipo.COMPRA_BIENES_USADOS,
      docTipo: DocTipo.DNI,
      docNro: 30111222,
      condicionIva: CondicionIva.CONSUMIDOR_FINAL,
      opcionales: [
        { id: '91', valor: 'Juan Pérez' },
        { id: '93', valor: 'Calle 123' },
      ],
    };
    expect(() => validateFacturarOpts(usados)).not.toThrow();
    expect(() => validateFacturarOpts({ ...usados, opcionales: [{ id: '91', valor: 'Juan Pérez' }] })).toThrow('10084');
    expect(() => validateFacturarOpts({ ...usados, opcionales: [] })).toThrow('10078');
    expect(() => validateFacturarOpts({ ...usados, condicionIva: CondicionIva.EXENTO })).toThrow('10243');
    expect(() =>
      validateFacturarOpts({ ...usados, servicio: { desde: '20261001', hasta: '20261031', vtoPago: '20261130' } }),
    ).toThrow('10085');
  });

  it('docTipo 31 (FCI CNV): docNro de hasta 4 dígitos y condición 15', () => {
    const fci = {
      ...B,
      docTipo: DocTipo.FONDO_COMUN_INVERSION_CNV,
      docNro: 1234,
      condicionIva: CondicionIva.IVA_NO_ALCANZADO,
    };
    expect(() => validateFacturarOpts(fci)).not.toThrow();
    expect(() => validateFacturarOpts({ ...fci, docNro: 12345 })).toThrow('10271');
    expect(() => validateFacturarOpts({ ...fci, condicionIva: CondicionIva.EXENTO })).toThrow('10272');
  });

  it('10015: docTipo 99 con docNro distinto de 0', () => {
    expect(() => validateFacturarOpts({ ...B, docTipo: DocTipo.CONSUMIDOR_FINAL, docNro: 123 })).toThrow('10015');
  });

  it('10069 / 10140: el receptor y los compradores no pueden ser el emisor', () => {
    expect(() => validateFacturarOpts(A, { cuitEmisor: 30712345671 })).toThrow('10069');
    const compradores = [
      { docTipo: DocTipo.CUIT, docNro: 30712345671, porcentaje: 60 },
      { docTipo: DocTipo.CUIT, docNro: 20123456786, porcentaje: 40 },
    ];
    expect(() => validateFacturarOpts({ ...A, compradores }, { cuitEmisor: 20123456786 })).toThrow('10140');
  });

  it('10068: tipos que no admiten opcionales', () => {
    expect(() =>
      validateFacturarOpts({ ...base, cbteTipo: CbteTipo.NOTA_VENTA_CONTADO_B, opcionales: [{ id: '5', valor: 'x' }] }),
    ).toThrow('10068');
  });

  it('10040: tipos y asociados admitidos', () => {
    const asoc = (tipo: number) => [{ tipo, ptoVta: 1, nro: 10 }];
    expect(() => validateFacturarOpts({ ...base, cbteTipo: CbteTipo.FACTURA_C, cbtesAsoc: asoc(88) })).toThrow('10040');
    expect(() => validateFacturarOpts({ ...B, cbtesAsoc: asoc(CbteTipo.FACTURA_B) })).toThrow('10040');
    expect(() => validateFacturarOpts({ ...B, cbtesAsoc: asoc(88) })).not.toThrow();
    expect(() =>
      validateFacturarOpts({ ...base, cbteTipo: CbteTipo.NOTA_CREDITO_B, cbtesAsoc: asoc(CbteTipo.FACTURA_A) }),
    ).toThrow('10040');
    expect(() =>
      validateFacturarOpts({ ...base, cbteTipo: CbteTipo.NOTA_CREDITO_B, cbtesAsoc: asoc(CbteTipo.RECIBO_B) }),
    ).not.toThrow();
  });

  it('seguros de caución: 2901/2902 en A y B 1-3/6-8, de hasta 30 caracteres y en igual cantidad', () => {
    const caucion = [
      { id: '2901', valor: 'POL-1' },
      { id: '2902', valor: 'END-1' },
    ];
    expect(() => validateFacturarOpts({ ...A, opcionales: caucion })).not.toThrow();
    expect(() => validateFacturarOpts({ ...A, opcionales: [caucion[0]] })).toThrow('10281');
    expect(() =>
      validateFacturarOpts({ ...A, opcionales: [caucion[0], { id: '2902', valor: 'x'.repeat(31) }] }),
    ).toThrow('10276');
    expect(() => validateFacturarOpts({ ...base, cbteTipo: CbteTipo.FACTURA_C, opcionales: caucion })).toThrow('10273');
  });

  it('compradores: no en FCE (10194), solo concepto 1 (10150), CUIT de 11 dígitos (10139)', () => {
    const compradores = [
      { docTipo: DocTipo.CUIT, docNro: 30712345671, porcentaje: 60 },
      { docTipo: DocTipo.CUIL, docNro: 20111111112, porcentaje: 40 },
    ];
    expect(() =>
      validateFacturarOpts({
        ...A,
        compradores,
        servicio: { desde: '20261001', hasta: '20261031', vtoPago: '20261130' },
      }),
    ).toThrow('10150');
    expect(() =>
      validateFacturarOpts({ ...A, compradores: [compradores[0], { ...compradores[1], docNro: 2011111111 }] }),
    ).toThrow('10139');
    expect(() =>
      validateFacturarOpts({
        ...A,
        cbteTipo: CbteTipo.FCE_FACTURA_A,
        compradores,
        vtoPago: '20991130',
        opcionales: [
          { id: '2101', valor: '0110599500000041817221' },
          { id: '27', valor: 'SCA' },
        ],
      }),
    ).toThrow('10194');
  });
});

describe('validateFacturarOpts: NC/ND FCE (10151, 10158, 10164, 10178, 10183)', () => {
  const nota = {
    ptoVta: 1,
    cbteTipo: CbteTipo.FCE_NOTA_CREDITO_A,
    docTipo: DocTipo.CUIT,
    docNro: 30712345671,
    condicionIva: CondicionIva.RESPONSABLE_INSCRIPTO,
    items: [{ neto: 100, iva: IvaTipo.IVA_21 }],
    opcionales: [{ id: '22', valor: 'N' }],
  };
  const factura = { tipo: CbteTipo.FCE_FACTURA_A, ptoVta: 1, nro: 10, cuit: 20123456786, fecha: '20261020' };

  it('sin anulación: una sola factura FCE más remitos (10156, 10157); en una anulación, sin remitos (10183)', () => {
    const remito = { ...factura, tipo: 91 };
    expect(() => validateFacturarOpts({ ...nota, cbtesAsoc: [factura, remito] })).not.toThrow();
    expect(() => validateFacturarOpts({ ...nota, cbtesAsoc: [remito] })).toThrow('10156');
    expect(() => validateFacturarOpts({ ...nota, cbtesAsoc: [factura, { ...factura, nro: 11 }] })).toThrow('10156');
    expect(() =>
      validateFacturarOpts({ ...nota, opcionales: [{ id: '22', valor: 'S' }], cbtesAsoc: [factura, remito] }),
    ).toThrow('10183');
  });

  it('el asociado lleva cuit y fecha', () => {
    expect(() => validateFacturarOpts({ ...nota, cbtesAsoc: [factura] })).not.toThrow();
    expect(() => validateFacturarOpts({ ...nota, cbtesAsoc: [{ ...factura, cuit: undefined }] })).toThrow('10151');
    expect(() => validateFacturarOpts({ ...nota, cbtesAsoc: [{ ...factura, fecha: undefined }] })).toThrow('10158');
  });

  it('anulación: la ND asocia una NC y la NC una factura o ND', () => {
    const anulacion = { ...nota, opcionales: [{ id: '22', valor: 'S' }] };
    expect(() => validateFacturarOpts({ ...anulacion, cbtesAsoc: [factura] })).not.toThrow();
    expect(() =>
      validateFacturarOpts({ ...anulacion, cbtesAsoc: [{ ...factura, tipo: CbteTipo.FCE_NOTA_CREDITO_A }] }),
    ).toThrow('10183');
    expect(() =>
      validateFacturarOpts({ ...anulacion, cbteTipo: CbteTipo.FCE_NOTA_DEBITO_A, cbtesAsoc: [factura] }),
    ).toThrow('10183');
  });

  it('receptor 23000000000 (10178) y vtoPago anterior a hoy (10164)', () => {
    expect(() =>
      validateFacturarOpts({
        ...nota,
        docNro: 23000000000,
        cbtesAsoc: [factura],
      }),
    ).toThrow('10178');
    const anulacion = { ...nota, opcionales: [{ id: '22', valor: 'S' }], cbtesAsoc: [factura] };
    expect(() =>
      validateFacturarOpts({ ...anulacion, vtoPago: '20261105' }, { ahora: new Date('2026-11-10T12:00:00-03:00') }),
    ).toThrow('10164');
  });
});

describe('validateFacturarExpoOpts: manual WSFEX 3.1.1', () => {
  const expo = {
    ptoVta: 1,
    cbteTipo: CbteTipo.FACTURA_E,
    tipoExpo: 2,
    pais: 212,
    cliente: { nombre: 'ACME', cuitPais: 55000002126, domicilio: '123 Main St' },
    moneda: 'DOL',
    formaPago: 'Wire',
    items: [{ codigo: 'X', descripcion: 'Y', cantidad: 1, unidad: 7, precioUnitario: 10 }],
  };

  it('1602: con canMisMonExt "S" la cotización se puede omitir', () => {
    expect(() => validateFacturarExpoOpts({ ...expo, canMisMonExt: 'S' })).not.toThrow();
    expect(() => validateFacturarExpoOpts(expo)).toThrow('1602');
  });

  it('1600/1601/1605: hasta 4 enteros, PES con 1, canMisMonExt solo en Factura E en moneda extranjera', () => {
    expect(() => validateFacturarExpoOpts({ ...expo, cotizacion: 10000 })).toThrow('1600');
    expect(() => validateFacturarExpoOpts({ ...expo, moneda: 'PES', cotizacion: 2 })).toThrow('1601');
    expect(() => validateFacturarExpoOpts({ ...expo, moneda: 'PES', cotizacion: 1, canMisMonExt: 'S' })).toThrow(
      '1605',
    );
    const cbtesAsoc = [{ cbteTipo: 19, cbtePuntoVta: 1, cbteNro: 5, cbteCuit: 20123456786 }];
    expect(() =>
      validateFacturarExpoOpts({
        ...expo,
        cbteTipo: CbteTipo.NOTA_CREDITO_E,
        cotizacion: 1200,
        canMisMonExt: 'N',
        cbtesAsoc,
      }),
    ).toThrow('1605');
  });

  it('asociados: 1755, 1754 y 2047', () => {
    const asoc = (cbteTipo: number) => ({ cbteTipo, cbtePuntoVta: 1, cbteNro: 5, cbteCuit: 20123456786 });
    expect(() => validateFacturarExpoOpts({ ...expo, cotizacion: 1200, cbtesAsoc: [asoc(19)] })).toThrow('1755');
    expect(() =>
      validateFacturarExpoOpts({ ...expo, cotizacion: 1200, cbtesAsoc: [asoc(88), asoc(89)] }),
    ).not.toThrow();
    const nc = { ...expo, cbteTipo: CbteTipo.NOTA_CREDITO_E, cotizacion: 1200 };
    expect(() => validateFacturarExpoOpts(nc)).toThrow('2047');
    expect(() => validateFacturarExpoOpts({ ...nc, cbtesAsoc: [asoc(19), asoc(19)] })).toThrow('1754');
    expect(() => validateFacturarExpoOpts({ ...nc, cbtesAsoc: [asoc(19)] })).not.toThrow();
  });
});

describe('validateFacturarOpts: casos borde del manual WSFEv1 v4.8', () => {
  const base = { ptoVta: 1, items: [{ neto: 100, iva: IvaTipo.IVA_21 }] };
  const A = {
    ...base,
    cbteTipo: CbteTipo.FACTURA_A,
    docTipo: DocTipo.CUIT,
    docNro: 30712345671,
    condicionIva: CondicionIva.RESPONSABLE_INSCRIPTO,
  };

  it('10015: docNro obligatorio fuera de docTipo 99; el tipo 49 no admite docTipo 99', () => {
    const B = { ...base, cbteTipo: CbteTipo.FACTURA_B, condicionIva: CondicionIva.CONSUMIDOR_FINAL };
    expect(() => validateFacturarOpts({ ...B, docTipo: DocTipo.DNI })).toThrow('10015');
    expect(() => validateFacturarOpts({ ...B, docTipo: DocTipo.DNI, docNro: 0 })).toThrow('10015');
    expect(() => validateFacturarOpts({ ...B, docTipo: DocTipo.DNI, docNro: 30111222 })).not.toThrow();
    expect(() => validateFacturarOpts({ ...B, docTipo: DocTipo.CONSUMIDOR_FINAL })).not.toThrow();
    expect(() =>
      validateFacturarOpts({
        ...B,
        cbteTipo: CbteTipo.COMPRA_BIENES_USADOS,
        opcionales: [
          { id: '91', valor: 'Juan Pérez' },
          { id: '93', valor: 'Calle 123' },
        ],
      }),
    ).toThrow('10015');
  });

  it('10069: también con CUIL; sin cuitEmisor no se valida', () => {
    const cuil = {
      ...base,
      cbteTipo: CbteTipo.FACTURA_B,
      docTipo: DocTipo.CUIL,
      docNro: 20123456786,
      condicionIva: CondicionIva.CONSUMIDOR_FINAL,
    };
    expect(() => validateFacturarOpts(cuil, { cuitEmisor: 20123456786 })).toThrow('10069');
    expect(() => validateFacturarOpts(cuil)).not.toThrow();
  });

  it('10067: un tributo que redondea a 0 no cuenta como ImpTrib > 0', () => {
    const noCat = {
      ...base,
      cbteTipo: CbteTipo.FACTURA_B,
      docTipo: DocTipo.CUIT,
      docNro: 23000000000,
      condicionIva: CondicionIva.NO_CATEGORIZADO,
    };
    const tributo = (importe: number) => [{ id: TributoTipo.IMPUESTOS_INTERNOS, baseImp: 100, alic: 0, importe }];
    expect(() => validateFacturarOpts({ ...noCat, tributos: tributo(0.004) })).toThrow('10067');
    expect(() => validateFacturarOpts({ ...noCat, tributos: tributo(0.01) })).not.toThrow();
  });

  describe('compradores: 10143, 10145 y empates en 10146', () => {
    const c = (docNro: number, porcentaje: number) => ({ docTipo: DocTipo.CUIT, docNro, porcentaje });

    it('con empate en el mayor porcentaje alcanza con que el receptor sea uno de ellos', () => {
      expect(() => validateFacturarOpts({ ...A, compradores: [c(20111111112, 50), c(30712345671, 50)] })).not.toThrow();
    });

    it('el receptor tiene que estar entre los compradores (10145)', () => {
      expect(() => validateFacturarOpts({ ...A, compradores: [c(20111111112, 60), c(20123456786, 40)] })).toThrow(
        '10145',
      );
    });

    it('porcentaje con más de 2 decimales (10143)', () => {
      expect(() =>
        validateFacturarOpts({ ...A, compradores: [c(30712345671, 66.665), c(20111111112, 33.335)] }),
      ).toThrow('10143');
    });
  });

  describe('NC/ND FCE: asociados según anulación (10156/10157, 10183)', () => {
    const nota = {
      ptoVta: 1,
      cbteTipo: CbteTipo.FCE_NOTA_DEBITO_A,
      docTipo: DocTipo.CUIT,
      docNro: 30712345671,
      condicionIva: CondicionIva.RESPONSABLE_INSCRIPTO,
      items: [{ neto: 100, iva: IvaTipo.IVA_21 }],
    };
    const asoc = (tipo: number) => [{ tipo, ptoVta: 1, nro: 10, cuit: 20123456786, fecha: '20261020' }];
    const anulacion = (valor: 'S' | 'N') => ({ opcionales: [{ id: '22', valor }] });

    it('sin anulación solo asocian la factura FCE', () => {
      expect(() => validateFacturarOpts({ ...nota, ...anulacion('N'), cbtesAsoc: asoc(201) })).not.toThrow();
      expect(() => validateFacturarOpts({ ...nota, ...anulacion('N'), cbtesAsoc: asoc(203) })).toThrow('10157');
    });

    it('de anulación, la ND asocia una NC', () => {
      expect(() => validateFacturarOpts({ ...nota, ...anulacion('S'), cbtesAsoc: asoc(203) })).not.toThrow();
    });

    it('cbtesAsoc incompleto se rechaza antes que las reglas de la tabla', () => {
      expect(() =>
        validateFacturarOpts({ ...nota, ...anulacion('N'), cbtesAsoc: [{ tipo: 201, ptoVta: 1, nro: 0 }] }),
      ).toThrow('cbtesAsoc.nro es requerido');
    });
  });

  it('10164: compara con la fecha de hoy en Argentina (no en UTC)', () => {
    const factura = {
      ...A,
      cbteTipo: CbteTipo.FCE_FACTURA_A,
      opcionales: [
        { id: '2101', valor: '0110599500000041817221' },
        { id: '27', valor: 'SCA' },
      ],
      fecha: '20261109',
      vtoPago: '20261109',
    };
    // 02:00 UTC del 10/11 son las 23:00 del 09/11 en Argentina.
    expect(() => validateFacturarOpts(factura, { ahora: new Date('2026-11-10T02:00:00Z') })).not.toThrow();
    expect(() => validateFacturarOpts(factura, { ahora: new Date('2026-11-10T04:00:00Z') })).toThrow('10164');
  });
});

describe('validateFacturarExpoOpts: 1605 con PES', () => {
  it('con PES no se informa canMisMonExt, ni siquiera "N"', () => {
    const expo = {
      ptoVta: 1,
      cbteTipo: CbteTipo.FACTURA_E,
      tipoExpo: 2,
      pais: 212,
      cliente: { nombre: 'ACME', cuitPais: 55000002126, domicilio: '123 Main St' },
      moneda: 'PES',
      cotizacion: 1,
      formaPago: 'Wire',
      items: [{ codigo: 'X', descripcion: 'Y', cantidad: 1, unidad: 7, precioUnitario: 10 }],
    };
    expect(() => validateFacturarExpoOpts(expo)).not.toThrow();
    expect(() => validateFacturarExpoOpts({ ...expo, canMisMonExt: 'N' })).toThrow('1605');
  });
});
