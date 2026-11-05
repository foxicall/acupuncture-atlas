/** Import a full downloaded atlas while retaining original teaching content. */
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calibrationEnvelope, mergeCalibration, overridesFromExport, parseCalibration } from '../src/lib/calibration.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2];
if (!input || process.argv.length !== 3) {
  console.error('Usage: node scripts/import-calibration.js /path/to/acupoints-calibrated.json');
  process.exitCode = 1;
} else {
  const pointsPath = resolve(root, 'src/data/acupoints.json');
  const overridesPath = resolve(root, 'src/data/calibration-overrides.json');
  let pendingPath;
  try {
    const points = JSON.parse(await readFile(pointsPath, 'utf8'));
    const exported = JSON.parse(await readFile(resolve(input), 'utf8'));
    const incoming = overridesFromExport(exported, points);
    let existing = [];
    try { existing = parseCalibration(await readFile(overridesPath, 'utf8'), points); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    // Import is additive: a fresh download does not delete manual placements
    // previously checked into the reusable overrides file.
    const byId = new Map(existing.map(record => [record.id, record]));
    for (const record of incoming) byId.set(record.id, record);
    const envelope = calibrationEnvelope([...byId.values()], points);
    const merged = mergeCalibration(points, envelope.overrides);
    // Persist overrides first. A failed atlas write is recoverable by running
    // data:generate, which replays this file against freshly generated source data.
    pendingPath = `${overridesPath}.${process.pid}.tmp`;
    await writeFile(pendingPath, JSON.stringify(envelope, null, 2) + '\n', { flag: 'wx' });
    await rename(pendingPath, overridesPath); pendingPath = null;
    pendingPath = `${pointsPath}.${process.pid}.tmp`;
    await writeFile(pendingPath, JSON.stringify(merged, null, 2) + '\n', { flag: 'wx' });
    await rename(pendingPath, pointsPath); pendingPath = null;
    console.log(`Imported ${incoming.length} manual placements; retained ${envelope.overrides.length} persistent overrides across ${merged.length} points. Teaching content was preserved.`);
  } catch (error) {
    console.error(`Calibration import failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (pendingPath) await unlink(pendingPath).catch(() => {});
  }
}
