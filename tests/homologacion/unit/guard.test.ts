import type { EventEmitter } from 'node:events';
import http from 'node:http';
import http2 from 'node:http2';
import https, { request } from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { describe, expect, it } from 'vitest';
import { HOSTS_HOMOLOGACION, hostDeConnect } from '../guard.js';

const BLOQUEADO = /guard de homologación: conexión a .* bloqueada/;

/** El primer `error` que emite `emisor` (los bloqueos llegan como un error de red). */
const errorDe = (emisor: EventEmitter) => new Promise<Error>((resolve) => emisor.once('error', resolve));

describe('guard de homologación', () => {
  it('permite los hosts de homologación de WSAA y de los ENDPOINTS de cada paquete', () => {
    for (const host of [
      'wsaahomo.afip.gov.ar',
      'wswhomo.afip.gov.ar',
      'fwshomo.afip.gov.ar',
      'awshomo.afip.gov.ar',
      'cpea-ws-qaext.afip.gob.ar',
      'ws-aplicativos-reca.homo.afip.gob.ar',
    ]) {
      expect(HOSTS_HOMOLOGACION).toContain(host);
    }
    for (const host of HOSTS_HOMOLOGACION) expect(host).toMatch(/homo|qaext/);
  });

  it.each([
    'https://wsaa.afip.gov.ar/ws/services/LoginCms',
    'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
    'https://example.com/',
  ])('bloquea fetch a %s', async (url) => {
    await expect(fetch(url)).rejects.toThrow(BLOQUEADO);
    await expect(fetch(new URL(url))).rejects.toThrow(BLOQUEADO);
    await expect(fetch(new Request(url))).rejects.toThrow(BLOQUEADO);
  });

  it('bloquea node:https, también con el import con nombre y con options que cambian el host', async () => {
    const casos = [
      () => request('https://servicios1.afip.gov.ar/wsfev1/service.asmx'),
      () => https.request('https://wsaahomo.afip.gov.ar/ws/services/LoginCms', { hostname: 'example.com' }),
      () => https.request({ host: 'aws.afip.gov.ar', path: '/' }),
      () => https.get(new URL('https://wsaa.afip.gov.ar/')),
    ];
    for (const crear of casos) {
      const req = crear();
      const error = errorDe(req);
      req.end();
      await expect(error).resolves.toHaveProperty('message', expect.stringMatching(BLOQUEADO));
    }
  });

  it('bloquea node:http, tls, net y http2', async () => {
    const req = http.request('http://example.com/');
    const errorHttp = errorDe(req);
    req.end();
    await expect(errorHttp).resolves.toHaveProperty('message', expect.stringMatching(BLOQUEADO));
    await expect(errorDe(tls.connect({ host: 'example.com', port: 443 }))).resolves.toHaveProperty(
      'message',
      expect.stringMatching(BLOQUEADO),
    );
    await expect(errorDe(net.connect(443, 'servicios1.afip.gov.ar'))).resolves.toHaveProperty(
      'message',
      expect.stringMatching(BLOQUEADO),
    );
    const sesion = http2.connect('https://example.com');
    await expect(errorDe(sesion)).resolves.toHaveProperty('message', expect.stringMatching(BLOQUEADO));
    sesion.destroy();
  });
});

describe('hostDeConnect', () => {
  it.each<[unknown[], string | undefined]>([
    [[{ host: 'WSAAHOMO.afip.gov.ar.', port: 443 }], 'wsaahomo.afip.gov.ar'],
    [[[{ host: 'example.com', port: 443 }, () => {}]], 'example.com'],
    [[{ port: 443 }], 'localhost'],
    [[443, 'example.com'], 'example.com'],
    [['443', 'example.com'], 'example.com'],
    [[443], 'localhost'],
    [[{ host: '[::1]', port: 443 }], '::1'],
    [[{ path: '/tmp/vitest.sock' }], undefined],
    [['/tmp/vitest.sock'], undefined],
  ])('%j → %s', (args, host) => {
    expect(hostDeConnect(args)).toBe(host);
  });
});
