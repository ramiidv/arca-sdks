/**
 * Credenciales y configuración de los SDKs para los tests de integración.
 *
 * - `principal`: el usuario de `ARCA_TEST_*` (los tests se saltean sin él).
 * - `contraparte`: un segundo usuario, de otro perfil, en `ARCA_TEST_CONTRAPARTE_*`
 *   (solo para los cruces de `cruces.test.ts`).
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileTicketStorage } from '@ramiidv/arca-common';
import { type Credenciales, credenciales, type Usuario } from './env.js';

export const principal = credenciales(process.env);
export const contraparte = credenciales(process.env, 'ARCA_TEST_CONTRAPARTE_');

/** `true` si todos los usuarios dados están definidos y autorizados en el servicio. */
export function autorizado(servicio: string, ...usuarios: (Usuario | undefined)[]): boolean {
  return usuarios.every((u) => u?.servicios.has(servicio));
}

/** Directorio del `FileTicketStorage` del usuario (default: `<tmp>/arca-test-tickets`). */
export function ticketsDir(usuario: Credenciales): string {
  return usuario.ticketsDir ?? join(tmpdir(), 'arca-test-tickets');
}

/**
 * Configuración de un SDK en homologación. El storage de tickets se conserva
 * entre corridas a propósito: WSAA rechaza un login nuevo mientras el ticket
 * anterior siga vigente.
 */
export function configSdk(usuario: Credenciales) {
  return {
    cuit: usuario.cuit,
    cert: usuario.cert,
    key: usuario.key,
    production: false,
    ticketStorage: new FileTicketStorage(ticketsDir(usuario)),
  };
}
