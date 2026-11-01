/**
 * Ejemplo: baja (BT) y modificación (MR) de relaciones laborales.
 */
import { writeFileSync } from 'node:fs';
import { ArcaEmpleados } from '@ramiidv/arca-empleados';

const sr = new ArcaEmpleados();

// Baja: la fecha de baja va en `fechaFin`.
sr.baja({
  cuil: '27-11111111-7',
  fechaInicio: '2024-03-01',
  fechaFin: '2026-10-31',
  fechaTelegramaRenuncia: '2026-10-15',
});

// Modificación de la retribución pactada.
sr.modificacion({
  cuil: '20-34567890-6',
  fechaInicio: '2025-01-02',
  retribucion: 1200000,
});

writeFileSync('relaciones-laborales.txt', sr.generar().buffer);
