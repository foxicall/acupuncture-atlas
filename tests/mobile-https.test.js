import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:https';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLanPreview, parsePreviewArgs, lanUrls } from '../scripts/mobile-preview.js';
import { localHttpsConfig } from '../scripts/local-https.js';

// Temporary test-only CA/leaf keys: no machine/browser trust stores are changed.
function openssl(args) { execFileSync('openssl', args, { stdio: 'ignore' }); }
function makeCA(dir, name) {
  const cert = path.join(dir, `${name}.pem`);
  const key = path.join(dir, `${name}-key.pem`);
  openssl(['req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes', '-days', '1', '-subj', `/CN=${name}`, '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign', '-keyout', key, '-out', cert]);
  return { cert, key };
}
async function makeLeaf(dir, ca, addresses) {
  const cert = path.join(dir, 'atlas.pem');
  const key = path.join(dir, 'atlas-key.pem');
  const csr = path.join(dir, 'atlas.csr');
  const extensions = path.join(dir, 'atlas-extensions.cnf');
  await writeFile(extensions, `basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost,${addresses.map(ip => `IP:${ip}`).join(',')}\n`);
  openssl(['req', '-new', '-newkey', 'rsa:2048', '-sha256', '-nodes', '-subj', '/CN=Atlas test server', '-keyout', key, '-out', csr]);
  openssl(['x509', '-req', '-sha256', '-days', '1', '-in', csr, '-CA', ca.cert, '-CAkey', ca.key, '-CAcreateserial', '-extfile', extensions, '-out', cert]);
  return { cert, key };
}
function secureGet(url, ca) {
  return new Promise((resolve, reject) => {
    const req = request(url, { ca, agent: false }, response => {
      const chunks = [];
      const authorized = response.socket.authorized;
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, authorized, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject); req.end();
  });
}
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'atlas-https-'));
  const dist = path.join(root, 'dist');
  await mkdir(dist);
  await writeFile(path.join(dist, 'index.html'), '<!doctype html><title>HTTPS atlas</title><h1>Verified HTTPS atlas</h1>');
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, dist };
}
function closeAfter(t, server) {
  t.after(async () => { server.httpServer.closeAllConnections?.(); await server.close(); });
}

test('HTTPS CLI defaults, explicit ports and paired certificate paths are validated', () => {
  assert.equal(parsePreviewArgs([]).port, 4175);
  assert.equal(parsePreviewArgs(['--https']).port, 8080);
  assert.equal(parsePreviewArgs(['--https', '--port', '8443']).port, 8443);
  assert.equal(parsePreviewArgs(['--port', '8443', '--https']).port, 8443);
  const custom = parsePreviewArgs(['--cert', '.certs/atlas.pem', '--key', '.certs/atlas-key.pem']);
  assert.equal(custom.https, true);
  assert.equal(custom.port, 8080);
  for (const args of [['--cert', 'only.pem'], ['--key', 'only-key.pem'], ['--https', '--tunnel']]) assert.throws(() => parsePreviewArgs(args));
});

test('basic-ssl localhost TLS is verifiable with an explicit test CA; DNS domains do not become IP SAN', async t => {
  const dirs = await fixture(t);
  const address = lanUrls(os.networkInterfaces(), 8080)[0];
  const ip = address ? new URL(address).hostname : '192.0.2.15';
  const server = await createLanPreview(0, { ...dirs, https: true, domains: ['localhost', ip], certDir: path.join(dirs.root, 'basic-ssl') });
  closeAfter(t, server);
  const port = server.httpServer.address().port;
  const certificate = new X509Certificate(server.config.preview.https.cert);
  assert.equal(certificate.checkHost('localhost'), 'localhost');
  assert.equal(certificate.checkIP('127.0.0.1'), '127.0.0.1');
  const response = await secureGet(`https://127.0.0.1:${port}/`, certificate.toString());
  assert.equal(response.status, 200);
  assert.equal(response.authorized, true);
  // plugin-basic-ssl@2.3 domains are DNS entries; acknowledging this prevents a
  // misleading promise that proceeding past a warning makes LAN PWA trusted.
  assert.equal(certificate.checkIP(ip), undefined);
  if (address) await assert.rejects(secureGet(`https://${ip}:${port}/`, certificate.toString()), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' });
});

test('custom CA-signed IP-SAN certificate serves LAN HTTPS with verification and rejects an unrelated CA', async t => {
  const dirs = await fixture(t);
  const address = lanUrls(os.networkInterfaces(), 8080)[0];
  const ip = address ? new URL(address).hostname : '127.0.0.1';
  const ca = makeCA(dirs.root, 'Atlas Test Root');
  const wrongCA = makeCA(dirs.root, 'Unrelated Test Root');
  const leaf = await makeLeaf(dirs.root, ca, [...new Set(['127.0.0.1', ip])]);
  await assert.rejects(localHttpsConfig({ ...dirs, cert: leaf.cert }), /both|pair/i);
  await assert.rejects(localHttpsConfig({ ...dirs, cert: leaf.cert, key: wrongCA.key }), /do not match|mismatch/i);
  const server = await createLanPreview(0, { ...dirs, https: true, cert: leaf.cert, key: leaf.key, certDir: path.join(dirs.root, 'unused-basic-ssl') });
  closeAfter(t, server);
  const port = server.httpServer.address().port;
  const certificate = new X509Certificate(await readFile(leaf.cert));
  assert.equal(certificate.checkIP(ip), ip);
  const caPEM = await readFile(ca.cert);
  const response = await secureGet(`https://${ip}:${port}/`, caPEM);
  assert.equal(response.status, 200);
  assert.equal(response.authorized, true);
  assert.match(response.body, /Verified HTTPS atlas/);
  await assert.rejects(secureGet(`https://${ip}:${port}/`, await readFile(wrongCA.cert)), /certificate|self.signed|issuer/i);
});

test('an occupied HTTPS preview port fails clearly instead of moving or stopping the existing server', async t => {
  const dirs = await fixture(t);
  const occupied = createServer((_, res) => res.end('existing service'));
  await new Promise(resolve => occupied.listen(0, '0.0.0.0', resolve));
  t.after(() => new Promise(resolve => occupied.close(resolve)));
  const port = occupied.address().port;
  await assert.rejects(createLanPreview(port, { ...dirs, https: true, certDir: path.join(dirs.root, 'basic-ssl') }), /already in use|EADDRINUSE/i);
  assert.equal(occupied.listening, true);
});
