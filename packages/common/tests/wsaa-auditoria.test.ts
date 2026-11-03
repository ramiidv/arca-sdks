import { createVerify, createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import forge from 'node-forge';
import { WsaaClient } from '../src/wsaa.js';
import { MemoryTicketStorage } from '../src/ticket-storage.js';
import { ArcaAuthError, ArcaSoapError, ArcaValidationError } from '../src/errors.js';
import { WSAA_ENDPOINTS } from '../src/constants.js';
import { hangingReply, mockFetch as recordingFetch } from '../src/testing.js';
import type { ArcaEvent } from '../src/types.js';
import { loginResponse, mockFetch, soapEnvelope, soapFault, testCert, xmlResponse } from './helpers.js';

const HOUR = 3_600_000;

function client(extra: Partial<ConstructorParameters<typeof WsaaClient>[0]> = {}) {
  return new WsaaClient({ ...testCert(), retries: 0, ...extra });
}

const fault = (code: string, msg = 'error', headers: Record<string, string> = {}) =>
  xmlResponse(soapFault(`ns1:${code}`, msg), 500, headers);
const ok = (token = 'T1', expiration = new Date(Date.now() + 12 * HOUR)) =>
  xmlResponse(loginResponse(token, expiration));

/** Respuesta de loginCms con un TA (XML) armado a mano. */
function taResponse(ta: string): Response {
  const escaped = ta.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return xmlResponse(
    soapEnvelope(
      `<loginCmsResponse xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov"><loginCmsReturn>${escaped}</loginCmsReturn></loginCmsResponse>`,
    ),
  );
}

function bodyOf(fetch: ReturnType<typeof mockFetch>, call: number): string {
  return (fetch.mock.calls[call] as unknown as [string, RequestInit])[1].body as string;
}

/** ASN.1 del CMS firmado (SignedData) que viaja en `<in0>`. */
function cmsOf(body: string): forge.asn1.Asn1 {
  const b64 = /<in0>([^<]+)<\/in0>/.exec(body)![1];
  return forge.asn1.fromDer(forge.util.decode64(b64));
}

/** TRA (XML) contenido en el CMS. */
function traOf(body: string): string {
  const p7 = forge.pkcs7.messageFromAsn1(cmsOf(body)) as unknown as {
    rawCapture: { content: { value: Array<{ value: string | Array<{ value: string }> }> } };
  };
  const first = p7.rawCapture.content.value[0];
  const bytes = typeof first.value === 'string' ? first.value : first.value.map((v) => v.value).join('');
  return forge.util.decodeUtf8(bytes);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WsaaClient: errores no reintentables (spec WSAA)', () => {
  it.each([
    'cms.cert.expired',
    'cms.sign.invalid',
    'cms.cert.untrusted',
    'coe.notAuthorized',
    'xml.bad',
    'wsn.notFound',
  ])('%s bloquea el servicio hasta resetLoginCooldown/clearTicket', async (code) => {
    const fetch = mockFetch(fault(code, 'rechazado'));
    const wsaa = client();
    const first = await wsaa.getAccessTicket('wsfe').catch((e) => e);
    expect(first).toBeInstanceOf(ArcaAuthError);
    expect(first).toMatchObject({ faultCode: `ns1:${code}`, statusCode: 500, retryable: false });
    expect(first.cause).toBeInstanceOf(ArcaSoapError);
    expect(first.message).toMatch(/no se resuelve reintentando/);

    const second = await wsaa.getAccessTicket('wsfe').catch((e) => e);
    expect(second).toBeInstanceOf(ArcaAuthError);
    expect(second).toMatchObject({ faultCode: `ns1:${code}`, retryable: false });
    expect(second.message).toMatch(/resetLoginCooldown\("wsfe"\)/);
    expect(second.message).toMatch(/clearTicket\("wsfe"\)/);
    expect(fetch).toHaveBeenCalledTimes(1);

    wsaa.resetLoginCooldown('wsfe');
    mockFetch(ok());
    expect((await wsaa.getAccessTicket('wsfe')).token).toBe('T1');
  });

  it('no vence con el tiempo (default) y clearAllTickets lo limpia', async () => {
    const fetch = mockFetch(fault('cms.cert.expired'));
    const wsaa = client({ loginErrorCooldownMs: 1 });
    await wsaa.getAccessTicket('wsfe').catch(() => {});
    await new Promise((r) => setTimeout(r, 10));
    await expect(wsaa.getAccessTicket('wsfe')).rejects.toBeInstanceOf(ArcaAuthError);
    expect(fetch).toHaveBeenCalledTimes(1);

    await wsaa.clearAllTickets();
    mockFetch(ok());
    expect((await wsaa.getAccessTicket('wsfe')).token).toBe('T1');
  });

  it('permanentErrorCooldownMs limita la espera; 0 la desactiva', async () => {
    mockFetch(fault('coe.notAuthorized'));
    const wsaa = client({ permanentErrorCooldownMs: 20 });
    await wsaa.getAccessTicket('wsfe').catch(() => {});
    const blocked = await wsaa.getAccessTicket('wsfe').catch((e) => e);
    expect(blocked.message).toMatch(/permanentErrorCooldownMs/);
    await new Promise((r) => setTimeout(r, 30));
    mockFetch(ok());
    expect((await wsaa.getAccessTicket('wsfe')).token).toBe('T1');

    const fetch = mockFetch(fault('coe.notAuthorized'), fault('coe.notAuthorized'));
    const noBlock = client({ permanentErrorCooldownMs: 0 });
    await noBlock.getAccessTicket('wsfe').catch(() => {});
    await noBlock.getAccessTicket('wsfe').catch(() => {});
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('resetLoginCooldown() sin servicio limpia todas las esperas, sin borrar tickets', async () => {
    const storage = new MemoryTicketStorage();
    const wsaa = client({ ticketStorage: storage });
    mockFetch(ok('A'), fault('coe.notAuthorized'));
    await wsaa.getAccessTicket('wsfe');
    await wsaa.getAccessTicket('wsmtxca').catch(() => {});
    wsaa.resetLoginCooldown();
    expect((await storage.get(wsaa.ticketKey('wsfe')))?.token).toBe('A');
    mockFetch(ok('B'));
    expect((await wsaa.getAccessTicket('wsmtxca')).token).toBe('B');
  });
});

describe('WsaaClient: errores transitorios', () => {
  it.each(['wsaa.unavailable', 'wsaa.internalError', 'wsn.unavailable'])(
    '%s: espera de loginErrorCooldownMs, retryable',
    async (code) => {
      const fetch = mockFetch(fault(code));
      const wsaa = client();
      const first = await wsaa.getAccessTicket('wsfe').catch((e) => e);
      expect(first).toMatchObject({ faultCode: `ns1:${code}`, retryable: true });
      const second = await wsaa.getAccessTicket('wsfe').catch((e) => e);
      expect(second.message).toMatch(/loginErrorCooldownMs/);
      expect(second.retryable).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it('desfase de reloj que sigue después de corregir el offset: inicia la espera', async () => {
    const date = { date: new Date(Date.now() + 2 * HOUR).toUTCString() };
    const fetch = mockFetch(
      fault('xml.generationTime.invalid', 'generationTime posee formato o dato inválido', date),
      fault('xml.generationTime.invalid', 'generationTime posee formato o dato inválido', date),
    );
    const wsaa = client();
    const first = await wsaa.getAccessTicket('wsfe').catch((e) => e);
    expect(first).toMatchObject({ faultCode: 'ns1:xml.generationTime.invalid', retryable: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    const second = await wsaa.getAccessTicket('wsfe').catch((e) => e);
    expect(second.message).toMatch(/loginErrorCooldownMs/);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('con un ticket por vencer, la espera devuelve ese ticket sin llamar a WSAA', async () => {
    const storage = new MemoryTicketStorage();
    const wsaa = client({ ticketStorage: storage });
    await storage.set(wsaa.ticketKey('wsfe'), {
      token: 'POR_VENCER',
      sign: 's',
      expirationTime: new Date(Date.now() + 90_000).toISOString(),
    });
    const fetch = mockFetch(fault('wsaa.unavailable'));
    await expect(wsaa.getAccessTicket('wsfe')).rejects.toBeInstanceOf(ArcaAuthError);
    expect((await wsaa.getAccessTicket('wsfe')).token).toBe('POR_VENCER');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('WsaaClient: reintentos del login', () => {
  it('reintenta solo si es seguro que el request no se envió', async () => {
    const notSent = new TypeError('fetch failed', { cause: Object.assign(new Error('x'), { code: 'ECONNREFUSED' }) });
    const fetch = mockFetch(notSent, ok());
    const events: ArcaEvent[] = [];
    const wsaa = client({ retries: 2, retryDelayMs: 1, onEvent: (e) => events.push(e) });
    expect((await wsaa.getAccessTicket('wsfe')).token).toBe('T1');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(events.filter((e) => e.type === 'request:retry')).toHaveLength(1);
  });

  it('no reintenta un 5xx sin Fault: va a la espera', async () => {
    const fetch = mockFetch(xmlResponse('Bad gateway', 502), ok());
    const wsaa = client({ retries: 3, retryDelayMs: 1 });
    const err = await wsaa.getAccessTicket('wsfe').catch((e) => e);
    expect(err).toMatchObject({ statusCode: 502, retryable: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(wsaa.getAccessTicket('wsfe')).rejects.toThrow(/loginErrorCooldownMs/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('no reintenta un timeout (incierto): va a la espera', async () => {
    const fetch = recordingFetch(hangingReply(), hangingReply());
    const wsaa = client({ retries: 3, retryDelayMs: 1, timeout: 20, fetch });
    const err = await wsaa.getAccessTicket('wsfe').catch((e) => e);
    expect(err).toBeInstanceOf(ArcaAuthError);
    expect(err.cause).toMatchObject({ uncertain: true });
    expect(fetch.calls).toHaveLength(1);
    await expect(wsaa.getAccessTicket('wsfe')).rejects.toThrow(/loginErrorCooldownMs/);
    expect(fetch.calls).toHaveLength(1);
  });
});

describe('WsaaClient: validaciones de configuración', () => {
  it('tokenTTLMinutes entre 1 y 1440', () => {
    for (const ttl of [0, 1441, -5, Number.NaN, Infinity]) {
      expect(() => client({ tokenTTLMinutes: ttl })).toThrow(ArcaValidationError);
    }
    expect(() => client({ tokenTTLMinutes: 1 })).not.toThrow();
    expect(() => client({ tokenTTLMinutes: 1440 })).not.toThrow();
  });

  it('nombre de servicio: empieza con letra, 3 a 32 letras, dígitos, _ o -', async () => {
    const fetch = mockFetch();
    const wsaa = client();
    for (const service of ['ws', 'wsfe;drop', 'a'.repeat(33), 'ws fe', '', '1wsfe', '_wsfe', '-wsfe']) {
      await expect(wsaa.getAccessTicket(service)).rejects.toBeInstanceOf(ArcaValidationError);
    }
    expect(fetch).not.toHaveBeenCalled();
    mockFetch(ok('A'), ok('B'));
    expect((await wsaa.getAccessTicket('ws_sr_padron_a13')).token).toBe('A');
    expect((await wsaa.getAccessTicket('sire-ws')).token).toBe('B');
  });

  it('production refleja el entorno de WSAA', () => {
    expect(client().production).toBe(false);
    expect(client({ production: true }).production).toBe(true);
    expect(client({ endpoint: WSAA_ENDPOINTS.production }).production).toBe(true);
    expect(client({ endpoint: WSAA_ENDPOINTS.testing, production: true }).production).toBe(false);
    expect(client({ endpoint: 'https://proxy.test/wsaa', production: true }).production).toBe(true);
    expect(client({ endpoint: 'https://proxy.test/wsaa' }).production).toBe(false);
  });
});

describe('WsaaClient: respuesta de loginCms', () => {
  const header = (exp: string) =>
    `<header><generationTime>${new Date().toISOString()}</generationTime><expirationTime>${exp}</expirationTime></header>`;
  const credentials = '<credentials><token>T</token><sign>S</sign></credentials>';
  const future = () => new Date(Date.now() + 12 * HOUR).toISOString();

  it('sin loginCmsReturn', async () => {
    mockFetch(
      xmlResponse(
        soapEnvelope(
          '<loginCmsResponse xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov"><x>1</x></loginCmsResponse>',
        ),
      ),
    );
    const err = await client()
      .getAccessTicket('wsfe')
      .catch((e) => e);
    expect(err).toBeInstanceOf(ArcaAuthError);
    expect(err.message).toMatch(/falta loginCmsReturn/);
    expect(err.retryable).toBe(true);
  });

  it.each([
    ['sin loginTicketResponse', '<otro/>', /falta loginTicketResponse/],
    ['sin credentials', `<loginTicketResponse>${header(future())}</loginTicketResponse>`, /falta credentials/],
    [
      'sin token',
      `<loginTicketResponse>${header(future())}<credentials><sign>S</sign></credentials></loginTicketResponse>`,
      /falta token o sign/,
    ],
    [
      'sin sign',
      `<loginTicketResponse>${header(future())}<credentials><token>T</token></credentials></loginTicketResponse>`,
      /falta token o sign/,
    ],
    [
      'expirationTime ilegible',
      `<loginTicketResponse>${header('mañana')}${credentials}</loginTicketResponse>`,
      /expirationTime ilegible/,
    ],
    [
      'expirationTime en el pasado',
      `<loginTicketResponse>${header(new Date(Date.now() - 60_000).toISOString())}${credentials}</loginTicketResponse>`,
      /no es posterior a la hora actual/,
    ],
  ])('%s → ArcaAuthError', async (_name, ta, message) => {
    mockFetch(taResponse(ta));
    const err = await client()
      .getAccessTicket('wsfe')
      .catch((e) => e);
    expect(err).toBeInstanceOf(ArcaAuthError);
    expect(err.message).toMatch(message);
  });

  it('TA sin header: vence a las 12 horas (no según tokenTTLMinutes)', async () => {
    mockFetch(taResponse(`<loginTicketResponse>${credentials}</loginTicketResponse>`));
    const ticket = await client({ tokenTTLMinutes: 60 }).getAccessTicket('wsfe');
    const lifetime = Date.parse(ticket.expirationTime) - Date.now();
    expect(Math.abs(lifetime - 12 * HOUR)).toBeLessThan(5_000);
    expect(ticket.token).toBe('T');
  });
});

describe('WsaaClient: TRA y firma CMS', () => {
  it('el TRA tiene service, generationTime (ahora - 2 min, con offset) y expirationTime (tokenTTLMinutes)', async () => {
    const fetch = mockFetch(ok());
    const offset = 5 * 60_000;
    await client({ tokenTTLMinutes: 30, clockOffsetMs: offset }).getAccessTicket('wsfe');
    const tra = traOf(bodyOf(fetch, 0));
    expect(tra).toMatch(/<service>wsfe<\/service>/);
    const gen = Date.parse(/<generationTime>([^<]+)</.exec(tra)![1]);
    const exp = Date.parse(/<expirationTime>([^<]+)</.exec(tra)![1]);
    const now = Date.now() + offset;
    expect(Math.abs(gen - (now - 2 * 60_000))).toBeLessThan(5_000);
    expect(Math.abs(exp - (now + 30 * 60_000))).toBeLessThan(5_000);
  });

  it('por defecto el TRA vence 10 minutos después de la hora actual', async () => {
    const fetch = mockFetch(ok());
    await client().getAccessTicket('wsfe');
    const tra = traOf(bodyOf(fetch, 0));
    const exp = Date.parse(/<expirationTime>([^<]+)</.exec(tra)![1]);
    expect(Math.abs(exp - (Date.now() + 10 * 60_000))).toBeLessThan(5_000);
  });

  it('con tokenTTLMinutes 1440 el TRA vence 24 horas después de su generationTime', async () => {
    const fetch = mockFetch(ok());
    await client({ tokenTTLMinutes: 1440 }).getAccessTicket('wsfe');
    const tra = traOf(bodyOf(fetch, 0));
    const gen = Date.parse(/<generationTime>([^<]+)</.exec(tra)![1]);
    const exp = Date.parse(/<expirationTime>([^<]+)</.exec(tra)![1]);
    expect(exp - gen).toBe(24 * HOUR);
  });

  it('la firma CMS (SHA-256, atributos autenticados) verifica con la clave pública del certificado', async () => {
    const fetch = mockFetch(ok());
    await client().getAccessTicket('wsfe');
    const body = bodyOf(fetch, 0);
    const tra = traOf(body);

    // SignedData → signerInfos[0]: [0] IMPLICIT authenticatedAttributes y encryptedDigest.
    const signedData = (cmsOf(body).value[1] as forge.asn1.Asn1).value[0] as forge.asn1.Asn1;
    const parts = signedData.value as forge.asn1.Asn1[];
    const signerInfos = parts[parts.length - 1].value as forge.asn1.Asn1[];
    const signer = signerInfos[0].value as forge.asn1.Asn1[];
    const attrs = signer.find((n) => n.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && n.type === 0)!;
    const signature = signer[signer.length - 1].value as string;

    // Se firma el SET de atributos (no el [0] IMPLICIT).
    const attrsSet = forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.SET,
      true,
      attrs.value as forge.asn1.Asn1[],
    );
    const verifier = createVerify('sha256');
    verifier.update(Buffer.from(forge.asn1.toDer(attrsSet).getBytes(), 'binary'));
    expect(verifier.verify(testCert().cert, Buffer.from(signature, 'binary'))).toBe(true);

    // El atributo messageDigest es el SHA-256 del TRA.
    const digest = createHash('sha256').update(tra, 'utf8').digest('binary');
    const digestAttr = (attrs.value as forge.asn1.Asn1[]).find(
      (a) => forge.asn1.derToOid((a.value as forge.asn1.Asn1[])[0].value as string) === forge.pki.oids.messageDigest,
    )!;
    const digestValue = ((digestAttr.value as forge.asn1.Asn1[])[1].value as forge.asn1.Asn1[])[0].value;
    expect(digestValue).toBe(digest);
  });
});

describe('WsaaClient: concurrencia y storage', () => {
  it('logins concurrentes de servicios distintos no se mezclan', async () => {
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      const service = /<service>([^<]+)</.exec(traOf(init.body as string))![1];
      await new Promise((r) => setTimeout(r, service === 'wsfe' ? 20 : 1));
      return ok(`T-${service}`);
    });
    const wsaa = client({ fetch: fetch as unknown as typeof globalThis.fetch });
    const [a, b, c] = await Promise.all([
      wsaa.getAccessTicket('wsfe'),
      wsaa.getAccessTicket('wsmtxca'),
      wsaa.getAccessTicket('wsfe'),
    ]);
    expect(a.token).toBe('T-wsfe');
    expect(b.token).toBe('T-wsmtxca');
    expect(c).toBe(a);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('clearAllTickets borra del storage los tickets de todos los servicios', async () => {
    const storage = new MemoryTicketStorage();
    const wsaa = client({ ticketStorage: storage });
    mockFetch(ok('A'), ok('B'));
    await wsaa.getAccessTicket('wsfe');
    await wsaa.getAccessTicket('wscdc');
    expect(await storage.get(wsaa.ticketKey('wscdc'))).not.toBeNull();
    await wsaa.clearAllTickets();
    expect(await storage.get(wsaa.ticketKey('wsfe'))).toBeNull();
    expect(await storage.get(wsaa.ticketKey('wscdc'))).toBeNull();
  });
});
