/**
 * Ejemplo: alta (AT) de una relación laboral en el archivo de ingreso masivo
 * de Simplificación Registral.
 *
 * Los códigos (modalidad de contrato, obra social, sucursal, actividad, puesto,
 * convenio, categoría...) salen de "Ver tablas informativas de códigos" en el
 * propio servicio de Simplificación Registral. Los de este ejemplo son ilustrativos.
 */
import { writeFileSync } from 'node:fs';
import { ArcaEmpleados } from '@ramiidv/arca-empleados';

const sr = new ArcaEmpleados();

sr.alta({
  cuil: '20-12345678-6',
  fechaInicio: '2026-11-02', // string AAAA-MM-DD: se toma literal, sin corrimientos de zona horaria
  modalidadContrato: 8,
  obraSocial: '126205',
  sucursal: 1,
  // Datos que, según RG 5508/2024, se pueden completar hasta la primera liquidación:
  actividad: 620100,
  situacionRevista: 1,
  retribucion: 850000.5, // se escribe con 2 decimales implícitos: 000000085000050
  modalidadLiquidacion: 3,
  puesto: '2512',
  cct: '9999/99', // excluido de convenio
});

const { buffer, lineas, resumen } = sr.generar();
writeFileSync('relaciones-laborales.txt', buffer); // ISO-8859-1, CRLF

console.log(lineas[0]); // 130 caracteres
console.log(resumen);
