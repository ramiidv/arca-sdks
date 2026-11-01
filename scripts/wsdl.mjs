#!/usr/bin/env node
/**
 * Snapshots de los WSDL oficiales de ARCA (y los XSD que importan), guardados
 * en packages/<paquete>/wsdl/. Los tests de contrato comparan los schemas de
 * cada SDK contra estos archivos.
 *
 *   node scripts/wsdl.mjs           verifica que los snapshots coincidan con
 *                                   los WSDL publicados (exit 1 si ARCA cambió algo)
 *   node scripts/wsdl.mjs --write   actualiza los snapshots
 *   node scripts/wsdl.mjs padron    sólo los de un paquete
 *
 * Se usan los WSDL de producción: el de homologación de WSMTXCA está roto
 * (tipos reemplazados por DummyResponseType) y el contrato es el mismo.
 */
import { request } from 'node:https';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Paquete → archivo → URL del WSDL. */
const MANIFEST = {
  common: {
    'wsaa.wsdl': 'https://wsaa.afip.gov.ar/ws/services/LoginCms?wsdl',
  },
  facturacion: {
    'wsfev1.wsdl': 'https://servicios1.afip.gov.ar/wsfev1/service.asmx?WSDL',
    'wsfexv1.wsdl': 'https://servicios1.afip.gov.ar/wsfexv1/service.asmx?WSDL',
  },
  cdc: {
    'wscdc.wsdl': 'https://servicios1.afip.gov.ar/WSCDC/service.asmx?WSDL',
  },
  padron: {
    'a4.wsdl': 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA4?wsdl',
    'a5.wsdl': 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5?wsdl',
    'a10.wsdl': 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA10?wsdl',
    'a13.wsdl': 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA13?wsdl',
    'a100.wsdl': 'https://aws.afip.gov.ar/sr-parametros/webservices/parameterServiceA100?wsdl',
  },
  mtxca: {
    'wsmtxca.wsdl': 'https://serviciosjava.afip.gob.ar/wsmtxca/services/MTXCAService?wsdl',
  },
  fecred: {
    'wsfecred.wsdl': 'https://serviciosjava.afip.gob.ar/wsfecred/FECredService?wsdl',
  },
  agro: {
    'wscpe.wsdl': 'https://cpea-ws.afip.gob.ar/wscpe/services/soap?wsdl',
    'wslpg.wsdl': 'https://serviciosjava.afip.gob.ar/wslpg/LpgService?wsdl',
  },
  sire: {
    'sire-c2005.wsdl': 'https://ws-aplicativos-reca.afip.gob.ar/sire/ws/v1/c2005/2005?wsdl',
  },
};

/** GET con el transporte TLS legacy (SECLEVEL=1): algunos hosts de ARCA usan DH de 1024 bits. */
function get(url, redirects = 3) {
  return new Promise((resolve, reject) => {
    const req = request(url, { ciphers: 'DEFAULT@SECLEVEL=1', timeout: 30_000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        resolve(get(new URL(res.headers.location, url).href, redirects - 1));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode !== 200) reject(new Error(`${url}: HTTP ${res.statusCode}`));
        else resolve(body);
      });
    });
    req.on('timeout', () => req.destroy(new Error(`${url}: timeout`)));
    req.on('error', reject);
    req.end();
  });
}

/** `schemaLocation` de los `xsd:import`/`xsd:include` (XSD externos). */
function schemaLocations(xml) {
  return [...xml.matchAll(/<(?:\w+:)?(?:import|include)\b[^>]*\bschemaLocation="([^"]+)"/g)].map((m) => m[1]);
}

/** Baja un WSDL y sus XSD externos: { nombreArchivo: contenido }. */
async function download(file, url) {
  const out = { [file]: await get(url) };
  const seen = new Set([url]);
  const queue = schemaLocations(out[file]).map((loc) => new URL(loc, url).href);
  while (queue.length > 0) {
    const xsdUrl = queue.shift();
    if (seen.has(xsdUrl)) continue;
    seen.add(xsdUrl);
    const name = `${file.replace(/\.wsdl$/, '')}.${new URL(xsdUrl).pathname.split('/').pop() || 'schema.xsd'}`;
    out[name] = await get(xsdUrl);
    queue.push(...schemaLocations(out[name]).map((loc) => new URL(loc, xsdUrl).href));
  }
  return out;
}

/** Normaliza saltos de línea y espacios finales, para que los diffs sean de contenido. */
const normalize = (s) => `${s.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trimEnd()}\n`;

const args = process.argv.slice(2);
const write = args.includes('--write');
const only = args.filter((a) => !a.startsWith('--'));
const packages = only.length > 0 ? only : Object.keys(MANIFEST);

let changed = 0;
let failed = 0;
for (const pkg of packages) {
  const files = MANIFEST[pkg];
  if (!files) throw new Error(`Paquete desconocido: ${pkg}`);
  const dir = join(root, 'packages', pkg, 'wsdl');
  for (const [file, url] of Object.entries(files)) {
    let docs;
    try {
      docs = await download(file, url);
    } catch (err) {
      failed++;
      console.error(`ERROR ${pkg}/${file}: ${err.message}`);
      continue;
    }
    for (const [name, content] of Object.entries(docs)) {
      const path = join(dir, name);
      const next = normalize(content);
      const prev = existsSync(path) ? readFileSync(path, 'utf8') : undefined;
      if (prev === next) {
        console.log(`igual   ${pkg}/wsdl/${name}`);
        continue;
      }
      changed++;
      if (write) {
        mkdirSync(dir, { recursive: true });
        writeFileSync(path, next);
        console.log(`${prev === undefined ? 'nuevo ' : 'cambió '} ${pkg}/wsdl/${name}`);
      } else {
        console.error(`${prev === undefined ? 'FALTA ' : 'CAMBIÓ'} ${pkg}/wsdl/${name} (${url})`);
      }
    }
  }
}

if (failed > 0) process.exitCode = 1;
if (!write && changed > 0) {
  console.error(`\n${changed} archivo(s) distintos de lo publicado por ARCA: revisá los cambios y corré con --write.`);
  process.exitCode = 1;
}
