/**
 * Ejemplo: constancia de inscripción y condición frente al IVA
 *
 * Para facturarle a un receptor identificado hay que informar su condición
 * frente al IVA (CondicionIVAReceptorId, RG 5616). Este ejemplo la obtiene del
 * padrón y elige el tipo de comprobante.
 *
 * Requiere que el certificado tenga autorizado ws_sr_constancia_inscripcion.
 */
import { readFileSync } from 'fs';
import { ArcaPadron, FileTicketStorage, condicionIvaDesdePadron } from '@ramiidv/arca-padron';

const padron = new ArcaPadron({
  cert: readFileSync('./cert.pem', 'utf-8'),
  key: readFileSync('./key.pem', 'utf-8'),
  cuit: '20123456786',
  production: false,
  ticketStorage: new FileTicketStorage('./.arca-tickets'),
});

async function main() {
  const constancia = await padron.getConstanciaInscripcion('30712345671');

  if (constancia.errorConstancia) {
    console.warn('ARCA no emitió la constancia:', constancia.errorConstancia.error.join('; '));
  }
  if (constancia.errorRegimenGeneral || constancia.errorMonotributo) {
    console.warn('Constancia parcial:', constancia.errorRegimenGeneral?.error, constancia.errorMonotributo?.error);
  }

  console.log(constancia.razonSocial ?? `${constancia.apellido} ${constancia.nombre}`);
  console.log('Domicilio fiscal:', constancia.domicilioFiscal?.direccion, constancia.domicilioFiscal?.localidad);

  const { condicionIva, motivo } = condicionIvaDesdePadron(constancia);
  console.log('Condición frente al IVA:', condicionIva, '-', motivo);

  if (condicionIva === null) {
    // El padrón no alcanza: decidir según la operación (por ejemplo, preguntarle al cliente).
    return;
  }

  // Con @ramiidv/arca-facturacion:
  //   const cbteTipo = resolverCbteTipo(CondicionIva.RESPONSABLE_INSCRIPTO, condicionIva);
  //   await arca.facturar({ ptoVta, cbteTipo, docTipo: DocTipo.CUIT, docNro, condicionIva, items });
}

/** Hasta 250 CUITs en una llamada: las inexistentes vuelven con errorConstancia. */
async function lote() {
  const constancias = await padron.getConstanciasInscripcion(['20224107030', '27015942210']);
  for (const c of constancias) {
    const { condicionIva, motivo } = condicionIvaDesdePadron(c);
    console.log(c.idPersona, condicionIva, motivo);
  }
}

main().then(lote).catch(console.error);
