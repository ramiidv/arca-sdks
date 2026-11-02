import { describe, expect, it } from 'vitest';
import forge from 'node-forge';
import { ArcaValidationError, certificateInfo, WsaaClient } from '../src/index.js';
import { testCert } from '../src/testing.js';

/** Certificado con el sujeto como los de ARCA (CN + SERIALNUMBER=CUIT ...). */
function arcaLikeCert(): { cert: string; key: string } {
  const keys = forge.pki.rsa.generateKeyPair(512);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '0a';
  cert.validity.notBefore = new Date('2026-01-01T00:00:00Z');
  cert.validity.notAfter = new Date('2028-01-01T00:00:00Z');
  cert.setSubject([
    { name: 'commonName', value: 'miapp' },
    { name: 'serialNumber', value: 'CUIT 20123456786' },
  ]);
  cert.setIssuer([
    { name: 'commonName', value: 'Computadores Test' },
    { name: 'organizationName', value: 'AFIP' },
    { name: 'countryName', value: 'AR' },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { cert: forge.pki.certificateToPem(cert), key: forge.pki.privateKeyToPem(keys.privateKey) };
}

describe('certificateInfo', () => {
  it('devuelve sujeto, emisor, vigencia y CUIT', () => {
    const info = certificateInfo(arcaLikeCert().cert);
    expect(info).toEqual({
      subject: 'CN=miapp, SERIALNUMBER=CUIT 20123456786',
      issuer: 'CN=Computadores Test, O=AFIP, C=AR',
      notBefore: new Date('2026-01-01T00:00:00Z'),
      notAfter: new Date('2028-01-01T00:00:00Z'),
      cuit: '20123456786',
    });
  });

  it('sin serialNumber no hay cuit', () => {
    const info = certificateInfo(testCert().cert);
    expect(info.subject).toBe('CN=test');
    expect(info).not.toHaveProperty('cuit');
  });

  it('un PEM inválido lanza ArcaValidationError', () => {
    expect(() => certificateInfo('no es un pem')).toThrow(ArcaValidationError);
    expect(() => certificateInfo('-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----')).toThrow(
      ArcaValidationError,
    );
  });
});

describe('WsaaClient: certificado y clave', () => {
  it('valida el certificado y la clave al construir', () => {
    const { cert, key } = testCert();
    expect(() => new WsaaClient({ cert: 'CERT', key })).toThrow(/Certificado inválido/);
    expect(() => new WsaaClient({ cert, key: 'KEY' })).toThrow(/Clave privada inválida/);
    const err = (() => {
      try {
        new WsaaClient({ cert, key: 'KEY' });
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(ArcaValidationError);
    expect((err as ArcaValidationError).field).toBe('key');
  });

  it('rechaza una clave que no corresponde al certificado', () => {
    const { cert } = testCert();
    const other = forge.pki.privateKeyToPem(forge.pki.rsa.generateKeyPair(512).privateKey);
    expect(() => new WsaaClient({ cert, key: other })).toThrow(/no corresponde al certificado/);
  });

  it('acepta claves PKCS#8 y encriptadas con keyPassphrase', () => {
    const { cert, key } = testCert();
    const privateKey = forge.pki.privateKeyFromPem(key);
    const pkcs8 = forge.pki.privateKeyInfoToPem(forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(privateKey)));
    expect(() => new WsaaClient({ cert, key: pkcs8 })).not.toThrow();

    const encrypted = forge.pki.encryptRsaPrivateKey(privateKey, 'secreto', { algorithm: 'aes128' });
    expect(encrypted).toMatch(/ENCRYPTED PRIVATE KEY/);
    expect(() => new WsaaClient({ cert, key: encrypted, keyPassphrase: 'secreto' })).not.toThrow();
    expect(() => new WsaaClient({ cert, key: encrypted })).toThrow(/keyPassphrase/);
    expect(() => new WsaaClient({ cert, key: encrypted, keyPassphrase: 'otra' })).toThrow(ArcaValidationError);

    const legacy = forge.pki.encryptRsaPrivateKey(privateKey, 'secreto', { legacy: true, algorithm: 'aes128' });
    expect(legacy).toMatch(/Proc-Type: 4,ENCRYPTED/);
    expect(() => new WsaaClient({ cert, key: legacy, keyPassphrase: 'secreto' })).not.toThrow();
  });
});
