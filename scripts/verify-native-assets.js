import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';

const config = JSON.parse(await readFile('capacitor.config.json', 'utf8'));
assert.equal(config.appId, 'com.acupuncture.atlas');
assert.equal(config.appName, '針灸3D圖譜');
assert.equal(config.webDir, 'dist');
assert.ok(!config.server?.url, 'APK must load bundled files, not a remote development URL.');
const nativeRoot = 'android/app/src/main/assets';
const synced = JSON.parse(await readFile(path.join(nativeRoot, 'capacitor.config.json'), 'utf8'));
assert.equal(synced.appId, config.appId);
assert.ok(!synced.server?.url, 'Synced APK config must not use a remote URL.');
const html = await readFile('dist/index.html', 'utf8');
assert.match(html, /src="\/assets\//, 'Capacitor build must use the root Vite base.');
async function files(root, prefix = '') {
  const result = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await files(root, relative));
    else result.push(relative);
  }
  return result;
}
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const assets = await files('dist');
for (const relative of assets) {
  const [built, embedded] = await Promise.all([readFile(path.join('dist', relative)), readFile(path.join(nativeRoot, 'public', relative))]);
  assert.equal(digest(embedded), digest(built), `Missing or stale native asset: ${relative}`);
}
const model = await readFile(path.join(nativeRoot, 'public/models/acupuncture_body.glb'));
assert.equal(model.subarray(0, 4).toString(), 'glTF');
assert.equal(model.readUInt32LE(8), model.length);
console.log(`Android assets verified: ${assets.length} identical web files, bundled course JavaScript and GLB model; no remote server URL.`);
