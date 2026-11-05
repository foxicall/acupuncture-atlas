import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  CALIBRATION_BOUNDS, CALIBRATION_STORAGE_KEY, CALIBRATION_MODEL,
  createCalibrationOverride, calibrationEnvelope, parseCalibration,
  mergeCalibration, loadCalibration, saveCalibration, setCalibration,
  removeCalibration, clearCalibration, overridesFromExport,
} from '../src/lib/calibration.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const points = JSON.parse(await readFile(resolve(root, 'src/data/acupoints.json'), 'utf8'));
const patch = (id = 'LI4') => ({ id, position: [.92, -.49, .03], normal: [0, 0, -1] });
function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key), values };
}

test('a manual placement merges into the full atlas without changing teaching content', () => {
  const before = structuredClone(points);
  const result = mergeCalibration(points, [patch()]);
  assert.equal(result.length, points.length);
  assert.deepEqual(points, before);
  const original = points.find(p => p.id === 'LI4');
  const changed = result.find(p => p.id === 'LI4');
  assert.deepEqual(changed.position, patch().position);
  assert.deepEqual(changed.normal, patch().normal);
  assert.equal(changed.coordinatePrecision, 'manual');
  assert.deepEqual(changed.calibration, { method: 'surface-raycast', model: CALIBRATION_MODEL });
  assert.equal('surfaceProjection' in changed, false);
  for (const key of ['technique', 'docs', 'sources', 'angleDegrees', 'angleSource', 'reviewStatus', 'meridian']) assert.deepEqual(changed[key], original[key]);
  assert.deepEqual(result.find(p => p.id === 'LU1'), points.find(p => p.id === 'LU1'));
  const hostile = mergeCalibration(points, [{ ...patch(), docs: ['fake.md'], technique: { method: 'untrusted' } }]).find(p => p.id === 'LI4');
  assert.deepEqual(hostile.technique, original.technique);
  assert.deepEqual(hostile.docs, original.docs);
});

test('validation rejects invalid bounds, non-finite vectors, unknown IDs, and non-unit normals', () => {
  const bad = [
    { ...patch(), id: 'LI999' }, { ...patch(), position: [NaN, 0, 0] }, { ...patch(), position: [Infinity, 0, 0] },
    { ...patch(), position: [0, 0] }, { ...patch(), position: ['0', 0, 0] },
    { ...patch(), position: [CALIBRATION_BOUNDS.x[1] + .01, 0, 0] }, { ...patch(), position: [0, -1.86, 0] },
    { ...patch(), position: [0, 0, .51] }, { ...patch(), normal: [0, 0, 0] }, { ...patch(), normal: [0, 0, 2] },
    { ...patch(), normal: [0, NaN, 1] }, { ...patch(), coordinatePrecision: 'clinical' },
    { ...patch(), calibration: { method: 'guessed', model: CALIBRATION_MODEL } },
    { ...patch(), calibration: { method: 'surface-raycast', model: 'another.glb' } },
  ];
  for (const record of bad) assert.throws(() => createCalibrationOverride(record, points), { name: 'CalibrationError' });
  assert.throws(() => mergeCalibration(points, [patch(), patch()]));
  const unit = createCalibrationOverride({ ...patch(), normal: [.6, .8, 0] }, points);
  assert.ok(Math.abs(Math.hypot(...unit.normal) - 1) < 1e-12);
});

test('local point updates persist independently and preserve other point placements', () => {
  const storage = memoryStorage();
  storage.setItem('other-app', 'keep');
  assert.deepEqual(loadCalibration(storage, points), { ok: true, overrides: [], error: null });
  assert.equal(setCalibration(storage, points, patch()).ok, true);
  assert.equal(setCalibration(storage, points, patch('LU1')).ok, true);
  const updated = setCalibration(storage, points, { ...patch(), position: [.93, -.50, .02] });
  assert.equal(updated.ok, true); assert.equal(updated.overrides.length, 2);
  const loaded = loadCalibration(storage, points);
  assert.equal(loaded.overrides.find(p => p.id === 'LI4').position[0], .93);
  assert.deepEqual(loaded.overrides.find(p => p.id === 'LU1').position, patch('LU1').position);
  assert.equal(removeCalibration(storage, points, 'LI4').overrides.length, 1);
  assert.equal(removeCalibration(storage, points, 'unknown').ok, false);
  assert.equal(clearCalibration(storage).ok, true);
  assert.equal(storage.getItem(CALIBRATION_STORAGE_KEY), null);
  assert.equal(storage.getItem('other-app'), 'keep');
});

test('malformed or unavailable storage reports errors without overwriting previous data', () => {
  const storage = memoryStorage();
  for (const raw of ['{', '{}', '{"version":99,"overrides":[]}', JSON.stringify({ version: 1, model: CALIBRATION_MODEL, overrides: [patch()] })]) {
    storage.setItem(CALIBRATION_STORAGE_KEY, raw);
    assert.equal(loadCalibration(storage, points).ok, false);
    assert.equal(setCalibration(storage, points, patch()).ok, false);
    assert.equal(storage.getItem(CALIBRATION_STORAGE_KEY), raw);
  }
  const unavailable = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('denied'); } };
  assert.match(loadCalibration(unavailable, points).error, /denied/);
  assert.match(saveCalibration(unavailable, points, [patch()]).error, /quota/);
  assert.equal(clearCalibration(unavailable).ok, false);
  assert.equal(loadCalibration(undefined, points).ok, false);
});

test('persistent envelopes and full exports round-trip only manual coordinate fields', () => {
  const records = [createCalibrationOverride(patch(), points)];
  const envelope = calibrationEnvelope(records, points);
  assert.deepEqual(parseCalibration(JSON.stringify(envelope), points), records);
  const exported = mergeCalibration(points, records);
  assert.deepEqual(overridesFromExport(exported, points), records);
  assert.throws(() => overridesFromExport(exported.slice(1), points));
  const duplicate = structuredClone(exported); duplicate[0] = duplicate[1];
  assert.throws(() => overridesFromExport(duplicate, points));
  const unknown = structuredClone(exported); unknown[0].id = 'unknown';
  assert.throws(() => overridesFromExport(unknown, points));
  const malformed = structuredClone(exported); malformed[0].position[0] = null;
  assert.throws(() => overridesFromExport(malformed, points));
  const corrupted = structuredClone(exported); corrupted[0].normal = [0, 0, 3];
  assert.throws(() => overridesFromExport(corrupted, points));
});

test('CLI imports persist through source regeneration and retain previous manual placements', async () => {
  const fixture = await mkdtemp(resolve(tmpdir(), 'atlas-calibration-'));
  try {
    await mkdir(resolve(fixture, 'scripts'), { recursive: true });
    await mkdir(resolve(fixture, 'src/lib'), { recursive: true });
    await mkdir(resolve(fixture, 'src/data'), { recursive: true });
    await mkdir(resolve(fixture, 'public/models'), { recursive: true });
    await writeFile(resolve(fixture, 'package.json'), '{"type":"module"}\n');
    for (const file of ['scripts/import-calibration.js', 'scripts/generate-acupoints.js', 'src/lib/calibration.js', 'src/lib/needle-data.js', 'public/models/acupuncture_body.glb']) await cp(resolve(root, file), resolve(fixture, file));
    await cp(resolve(root, 'docs'), resolve(fixture, 'docs'), { recursive: true });
    await writeFile(resolve(fixture, 'src/data/acupoints.json'), JSON.stringify(points));
    await writeFile(resolve(fixture, 'src/data/calibration-overrides.json'), JSON.stringify(calibrationEnvelope([patch('LU1')], points)));
    const exported = mergeCalibration(points, [patch()]);
    // A downloaded file cannot change source material through this importer.
    exported.find(p => p.id === 'LI4').technique = { method: 'untrusted injected method' };
    const downloaded = resolve(fixture, 'download.json');
    await writeFile(downloaded, JSON.stringify(exported));
    execFileSync(process.execPath, [resolve(fixture, 'scripts/import-calibration.js'), downloaded], { cwd: fixture });
    const retained = parseCalibration(await readFile(resolve(fixture, 'src/data/calibration-overrides.json'), 'utf8'), points);
    assert.deepEqual(new Set(retained.map(p => p.id)), new Set(['LI4', 'LU1']));
    const imported = JSON.parse(await readFile(resolve(fixture, 'src/data/acupoints.json'), 'utf8'));
    assert.deepEqual(imported.find(p => p.id === 'LI4').technique, points.find(p => p.id === 'LI4').technique);
    execFileSync(process.execPath, [resolve(fixture, 'scripts/generate-acupoints.js')], { cwd: fixture });
    const regenerated = JSON.parse(await readFile(resolve(fixture, 'src/data/acupoints.json'), 'utf8'));
    for (const id of ['LI4', 'LU1']) {
      const actual = regenerated.find(p => p.id === id);
      assert.equal(actual.coordinatePrecision, 'manual');
      assert.deepEqual(actual.position, patch(id).position);
      assert.equal('surfaceProjection' in actual, false);
      assert.deepEqual(actual.technique, points.find(p => p.id === id).technique);
    }
    // A malformed import fails before changing either persistent file.
    const savedOverrides = await readFile(resolve(fixture, 'src/data/calibration-overrides.json'), 'utf8');
    await writeFile(downloaded, '[{"id":"LI4"}]');
    assert.throws(() => execFileSync(process.execPath, [resolve(fixture, 'scripts/import-calibration.js'), downloaded], { cwd: fixture, stdio: 'pipe' }));
    assert.equal(await readFile(resolve(fixture, 'src/data/calibration-overrides.json'), 'utf8'), savedOverrides);
  } finally { await rm(fixture, { recursive: true, force: true }); }
});
