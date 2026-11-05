import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { request } from 'node:http';
import { parsePreviewArgs, verifyChecksum, tunnelURL, createPreviewServer } from '../scripts/mobile-preview.js';

test('phone preview validates port and startup options', () => {
  assert.equal(parsePreviewArgs([]).port, 4175);
  assert.equal(parsePreviewArgs(['--skip-build', '--local-only', '--port', '4176']).port, 4176);
  for (const args of [['--port', '0'], ['--port', '4175;bad'], ['--timeout', '0'], ['--anything']]) assert.throws(() => parsePreviewArgs(args));
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
