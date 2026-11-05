import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const dist = path.resolve(process.argv[2] || 'dist');
const manifest = JSON.parse(await readFile(path.join(dist, 'manifest.json'), 'utf8'));
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.start_url, './');
assert.equal(manifest.scope, './');
for (const icon of manifest.icons) {
  const bytes = await readFile(path.join(dist, icon.src));
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${icon.src}: invalid PNG`);
  const [width, height] = icon.sizes.split('x').map(Number);
  assert.equal(bytes.readUInt32BE(16), width);
  assert.equal(bytes.readUInt32BE(20), height);
}
const sw = await readFile(path.join(dist, 'sw.js'), 'utf8');
for (const needle of ['index.html', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png', 'models/acupuncture_body.glb']) {
  assert.ok(sw.includes(needle), `${needle} missing from offline precache`);
}
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(async entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : path.join(dir, entry.name)))).flat();
}
for (const file of await walk(path.join(dist, 'models'))) {
  assert.ok((await stat(file)).size <= 20 * 1024 * 1024, `${file} exceeds the 20 MB offline cache limit`);
}
for (const file of await walk(path.join(dist, 'assets'))) {
  if (!/\.(js|css|woff2)$/.test(file)) continue;
  const relative = path.relative(dist, file).split(path.sep).join('/');
  assert.ok(sw.includes(relative), `${relative} missing from offline precache (this can omit bundled course text)`);
}
console.log('PWA build verified: standalone manifest, PNG dimensions, all app/course/font assets and 3D model precache.');
