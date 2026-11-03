/**
 * Ejemplo: Carta de Porte Electrónica automotor (WSCPE), circuito completo.
 *
 * 1. Paramétricas (provincias, localidades, granos, plantas)
 * 2. Número de orden + autorización (tipo 74)
 * 3. Arribo y confirmación definitiva (las informa el destino, con su propia
 *    CUIT y certificado) y consulta
 */
import fs from 'node:fs';
import { ArcaAgro, FileTicketStorage, TIPO_CPE } from '@ramiidv/arca-agro';

const CUIT = '20123456786'; // CUIT representada (homologación: el de tu certificado)
const CUIT_DESTINO = '30500011129'; // planta de destino: otra empresa, con su propio certificado

const agro = new ArcaAgro({
  cuit: CUIT,
  cert: fs.readFileSync('./certs/certificado.crt', 'utf-8'),
  key: fs.readFileSync('./certs/clave.key', 'utf-8'),
  production: false, // homologación
  ticketStorage: new FileTicketStorage('.arca-tickets'), // persiste el TA entre reinicios
  onEvent: (event) => console.log(`[${event.type}]`, 'method' in event ? event.method : ''),
});

// El destino opera con su propia instancia (su CUIT y su certificado).
const agroDestino = new ArcaAgro({
  cuit: CUIT_DESTINO,
  cert: fs.readFileSync('cert-destino.pem', 'utf-8'),
  key: fs.readFileSync('key-destino.pem', 'utf-8'),
  production: false,
  ticketStorage: new FileTicketStorage('.arca-tickets'),
});

async function main() {
  // 1. Paramétricas
  const provincias = await agro.cpe.consultarProvincias();
  console.log('Provincias:', provincias.slice(0, 3));
  const localidades = await agro.cpe.consultarLocalidadesPorProvincia(12);
  console.log('Localidades de Santa Fe:', localidades.length);
  const granos = await agro.cpe.consultarTiposGrano();
  console.log('Granos:', granos.slice(0, 3));
  const plantas = await agro.cpe.consultarPlantas(CUIT_DESTINO);
  console.log('Plantas del destino:', plantas);

  // 2. Autorización. Ojo: siguienteNroOrden no es atómico (ver README).
  const sucursal = 1;
  const nroOrden = await agro.cpe.siguienteNroOrden(sucursal, TIPO_CPE.AUTOMOTOR);

  const cpe = await agro.cpe.autorizarCPEAutomotor({
    cabecera: { tipoCP: TIPO_CPE.AUTOMOTOR, cuitSolicitante: CUIT, sucursal, nroOrden },
    origen: { productor: { codProvincia: 1, codLocalidad: 10270 } },
    correspondeRetiroProductor: false,
    esSolicitanteCampo: true,
    datosCarga: { codGrano: 23, cosecha: 2526, pesoBruto: 42000, pesoTara: 12000 },
    destino: { cuit: CUIT_DESTINO, esDestinoCampo: false, codProvincia: 12, codLocalidad: 5244, planta: 1938 },
    destinatario: { cuit: CUIT_DESTINO },
    transporte: {
      cuitTransportista: '20999888772',
      dominio: ['AB123CD'],
      fechaHoraPartida: new Date(Date.now() + 60 * 60 * 1000),
      kmRecorrer: 250,
      cuitChofer: '27300000008',
      tarifa: 1500.5,
      cuitPagadorFlete: '30712345671',
      mercaderiaFumigada: false,
    },
  });
  console.log('CTG:', cpe.cabecera.nroCTG, 'estado:', cpe.cabecera.estado);
  if (cpe.pdf) fs.writeFileSync(`cpe-${cpe.cabecera.nroCTG}.pdf`, Buffer.from(cpe.pdf, 'base64'));
  // Error 550: la CPE quedó autorizada pero ARCA no generó el PDF.
  for (const a of cpe.advertencias ?? []) console.warn(`Advertencia [${a.code}] ${a.msg}`);

  const cartaPorte = { tipoCPE: TIPO_CPE.AUTOMOTOR, sucursal, nroOrden };

  // 3. Arribo y confirmación definitiva: las informa el destino, con su instancia.
  await agroDestino.cpe.confirmarArriboCPE({ cuitSolicitante: CUIT_DESTINO, cartaPorte });
  const confirmada = await agroDestino.cpe.confirmacionDefinitivaCPEAutomotor({
    cuitSolicitante: CUIT_DESTINO,
    cartaPorte,
    pesoBrutoDescarga: 41900,
    pesoTaraDescarga: 12000,
  });
  console.log('Estado:', confirmada.cabecera?.estado);

  const detalle = await agro.cpe.consultarCPEAutomotor({ nroCTG: cpe.cabecera.nroCTG });
  console.log('Detalle:', detalle.cabecera, detalle.datosCarga);

  const recibidas = await agroDestino.cpe.consultarCPEPorDestino({
    planta: 1938,
    fechaPartidaDesde: '2026-11-01',
    fechaPartidaHasta: '2026-11-07',
  });
  console.log('CPE con destino en la planta:', recibidas.length);
}

main().catch(console.error);
