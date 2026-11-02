/**
 * Lectura y validación del certificado X.509 y la clave privada que se usan
 * para firmar el TRA de WSAA.
 */
import forge from 'node-forge';
import { ArcaValidationError } from './errors.js';

/** Datos de un certificado X.509 (ver `certificateInfo`). */
export interface CertificateInfo {
  /** Sujeto del certificado (ej: `"CN=miapp, SERIALNUMBER=CUIT 20123456786"`). */
  subject: string;
  /** Emisor del certificado (ej: `"CN=Computadores, O=AFIP, C=AR, SERIALNUMBER=CUIT 33693450239"`). */
  issuer: string;
  /** Inicio de la vigencia. */
  notBefore: Date;
  /** Fin de la vigencia. */
  notAfter: Date;
  /** CUIT del titular, del atributo `serialNumber` del sujeto (`"CUIT 20123456786"`), si lo tiene. */
  cuit?: string;
}

/** Certificado y clave ya parseados. @internal */
export interface ParsedCredentials {
  certificate: forge.pki.Certificate;
  privateKey: forge.pki.rsa.PrivateKey;
}

function invalid(field: 'cert' | 'key', message: string, cause?: unknown): ArcaValidationError {
  return new ArcaValidationError(
    `${field === 'cert' ? 'Certificado inválido' : 'Clave privada inválida'}: ${message}`,
    [{ field, message }],
    field,
    cause !== undefined ? { cause } : undefined,
  );
}

function parseCertificate(pem: string): forge.pki.Certificate {
  if (typeof pem !== 'string' || !pem.includes('-----BEGIN CERTIFICATE-----')) {
    throw invalid('cert', 'se esperaba un certificado X.509 en formato PEM (-----BEGIN CERTIFICATE-----)');
  }
  try {
    return forge.pki.certificateFromPem(pem);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw invalid('cert', `no se pudo leer el PEM (debe ser un certificado RSA): ${detail}`, error);
  }
}

function parsePrivateKey(pem: string, passphrase: string | undefined): forge.pki.rsa.PrivateKey {
  if (typeof pem !== 'string' || !/-----BEGIN (RSA |ENCRYPTED )?PRIVATE KEY-----/.test(pem)) {
    throw invalid('key', 'se esperaba una clave privada RSA en formato PEM (-----BEGIN PRIVATE KEY-----)');
  }
  const encrypted = pem.includes('ENCRYPTED');
  if (encrypted && passphrase === undefined) {
    throw invalid('key', 'la clave está encriptada: indicá la contraseña en keyPassphrase');
  }
  let key: forge.pki.PrivateKey | null;
  try {
    key = encrypted ? forge.pki.decryptRsaPrivateKey(pem, passphrase as string) : forge.pki.privateKeyFromPem(pem);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw invalid('key', `no se pudo leer el PEM (debe ser una clave RSA): ${detail}`, error);
  }
  if (!key) throw invalid('key', 'no se pudo desencriptar (contraseña incorrecta)');
  return key as forge.pki.rsa.PrivateKey;
}

/**
 * Parsea el certificado y la clave, y verifica que la clave corresponda al
 * certificado. @internal
 *
 * @throws ArcaValidationError si alguno es inválido o no se corresponden.
 */
export function parseCredentials(cert: string, key: string, passphrase?: string): ParsedCredentials {
  const certificate = parseCertificate(cert);
  const privateKey = parsePrivateKey(key, passphrase);
  const publicKey = certificate.publicKey as forge.pki.rsa.PublicKey;
  if (publicKey.n.compareTo(privateKey.n) !== 0 || publicKey.e.compareTo(privateKey.e) !== 0) {
    throw invalid('key', 'no corresponde al certificado (la clave pública del certificado es otra)');
  }
  return { certificate, privateKey };
}

function nameToString(attributes: forge.pki.CertificateField[]): string {
  return attributes
    .map((a) => `${a.shortName ?? (a.name ? a.name.toUpperCase() : a.type)}=${String(a.value)}`)
    .join(', ');
}

/**
 * Datos de un certificado X.509 en PEM: sujeto, emisor, vigencia y CUIT del
 * titular (los certificados de ARCA la llevan en el `serialNumber` del sujeto:
 * `"CUIT 20123456786"`).
 *
 * @example
 * ```ts
 * const info = certificateInfo(fs.readFileSync('cert.pem', 'utf8'));
 * if (info.notAfter.getTime() - Date.now() < 30 * 86_400_000) console.warn('El certificado vence pronto');
 * ```
 *
 * @throws ArcaValidationError si el PEM no es un certificado válido.
 */
export function certificateInfo(pem: string): CertificateInfo {
  const certificate = parseCertificate(pem);
  const serial = certificate.subject.getField({ name: 'serialNumber' }) as forge.pki.CertificateField | null;
  const match = serial ? /CUIT\s*(\d{11})/i.exec(String(serial.value)) : null;
  const info: CertificateInfo = {
    subject: nameToString(certificate.subject.attributes),
    issuer: nameToString(certificate.issuer.attributes),
    notBefore: certificate.validity.notBefore,
    notAfter: certificate.validity.notAfter,
  };
  if (match) info.cuit = match[1];
  return info;
}
