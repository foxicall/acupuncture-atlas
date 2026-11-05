import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { request } from 'node:http';
import { parsePreviewArgs, verifyChecksum, tunnelURL, createPreviewServer, lanUrls, createLanPreview } from '../scripts/mobile-preview.js';

test('phone preview validates port and startup options', () => {
  assert.equal(parsePreviewArgs([]).port, 4175);
  assert.equal(parsePreviewArgs([]).tunnel, false);
  assert.equal(parsePreviewArgs(['--tunnel']).tunnel, true);
  assert.equal(parsePreviewArgs(['--skip-build', '--local-only', '--port', '4176']).port, 4176);
  for (const args of [['--port', '0'], ['--port', '4175;bad'], ['--timeout', '0'], ['--anything'], ['--tunnel', '--local-only']]) assert.throws(() => parsePreviewArgs(args));
});

test('cloudflared must match official SHA-256 before use', () => {
  const bytes = Buffer.from('verified artifact');
  const digest = createHash('sha256').update(bytes).digest('hex');
  assert.equal(verifyChecksum(bytes, digest), digest);
  assert.throws(() => verifyChecksum(Buffer.from('changed'), digest), /verification failed/);
  assert.throws(() => verifyChecksum(bytes, 'not-a-hash'));
});

test('only accepts HTTPS quick-tunnel URLs from cloudflared output', () => {
  assert.equal(tunnelURL('INFO https://quiet-atlas-needle.trycloudflare.com ready'), 'https://quiet-atlas-needle.trycloudflare.com');
  assert.equal(tunnelURL('https://example.com/'), null);
  assert.equal(tunnelURL('http://quiet-atlas.trycloudflare.com'), null);
});

test('phone preview serves only dist files and rejects traversal, symlinks and foreign hosts', async t => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'atlas-preview-'));
  const outside = path.join(temp, 'secret.txt');
  const dist = path.join(temp, 'dist');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(dist);
  await writeFile(path.join(dist, 'index.html'), '<h1>Atlas</h1>');
  await writeFile(outside, 'not served');
  await symlink(outside, path.join(dist, 'escape.txt'));
  const server = await createPreviewServer(dist, 4178);
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(temp, { recursive: true, force: true }); });
  const home = await fetch('http://127.0.0.1:4178/');
  assert.equal(home.status, 200);
  assert.equal(await home.text(), '<h1>Atlas</h1>');
  assert.equal((await fetch('http://127.0.0.1:4178/escape.txt')).status, 403);
  assert.equal((await fetch('http://127.0.0.1:4178/%2e%2e%2fsecret.txt')).status, 403);
  const foreignHostStatus = await new Promise((resolve, reject) => {
    const req = request('http://127.0.0.1:4178/', { headers: { Host: 'untrusted.example' } }, response => { response.resume(); resolve(response.statusCode); });
    req.on('error', reject); req.end();
  });
  assert.equal(foreignHostStatus, 403);
  assert.equal((await fetch('http://127.0.0.1:4178/', { method: 'POST' })).status, 405);
});


test('LAN URL formatter uses actual IPv4 addresses and omits loopback, link-local and virtual adapters', () => {
  const item = (address, extra = {}) => ({ address, family: 'IPv4', internal: false, ...extra });
  const interfaces = {
    lo: [item('127.0.0.1', { internal: true })],
    en0: [item('192.168.50.12'), item('fe80::1', { family: 'IPv6' }), item('169.254.1.2')],
    eth0: [item('10.20.30.40'), item('192.168.50.12')],
    docker0: [item('172.17.0.1')],
    'vEthernet (WSL)': [item('172.18.0.1')],
    'Local Area Connection': [item('192.168.0.20', { family: 4 })],
    bad: [item('192.168.2.3/24'), item('0.0.0.0'), item('224.0.0.1'), item('255.255.255.255'), item('192.168.1.2:8080')],
  };
  assert.deepEqual(lanUrls(interfaces, 4175), ['http://192.168.50.12:4175/', 'http://10.20.30.40:4175/', 'http://192.168.0.20:4175/']);
  assert.deepEqual(lanUrls({ lo: [item('127.0.0.1')] }, 4175), []);
  assert.throws(() => lanUrls(interfaces, 0), /Invalid LAN preview port/);
});

test('Vite LAN preview binds all interfaces and serves built HTML without building', async t => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'atlas-vite-preview-'));
  const dist = path.join(temp, 'dist');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(dist);
  await writeFile(path.join(dist, 'index.html'), '<!doctype html><title>LAN Atlas</title><h1>Built atlas</h1>');
  const server = await createLanPreview(4179, { root: temp, dist });
  t.after(async () => { server.httpServer.closeAllConnections(); await server.close(); await rm(temp, { recursive: true, force: true }); });
  assert.equal(server.httpServer.address().address, '0.0.0.0');
  assert.equal(server.config.preview.host, '0.0.0.0');
  assert.notEqual(server.config.preview.allowedHosts, true);
  const response = await fetch('http://127.0.0.1:4179/');
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Built atlas/);
  const address = lanUrls(os.networkInterfaces(), 4179)[0];
  if (address) assert.equal((await fetch(address)).status, 200);
  const foreignHostStatus = await new Promise((resolve, reject) => {
    const req = request('http://127.0.0.1:4179/', { headers: { Host: 'untrusted.example' } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.end();
  });
  assert.equal(foreignHostStatus, 403);
});
