/** Visual, manual surface placement only. Never marks a point clinically calibrated. */
import { withNeedleData } from './needle-data.js';
export const CALIBRATION_STORAGE_KEY = 'acupuncture-atlas:calibration:v1';
export const CALIBRATION_VERSION = 1;
export const CALIBRATION_MODEL = 'acupuncture_body.glb';
export const CALIBRATION_BOUNDS = Object.freeze({
  x: Object.freeze([-1.2, 1.2]),
  y: Object.freeze([-1.85, 1.85]),
  z: Object.freeze([-0.5, 0.5]),
});
const axes = ['x', 'y', 'z'];
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const errorText = error => error instanceof Error ? error.message : String(error);

export class CalibrationError extends Error {
  constructor(message) { super(message); this.name = 'CalibrationError'; }
}

function knownIds(points) {
  if (!Array.isArray(points) || points.some(point => !point || typeof point.id !== 'string')) throw new CalibrationError('穴位資料格式錯誤。');
  const ids = new Set(points.map(point => point.id));
  if (ids.size !== points.length) throw new CalibrationError('穴位資料有重複代碼。');
  return ids;
}

function vector(value, label) {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) throw new CalibrationError(`${label}必須包含三個有限數值。`);
  return [...value];
}

/** Validate a single whitelisted placement patch; ignore all clinical/doc fields. */
export function createCalibrationOverride(patch, points) {
  const ids = knownIds(points);
  if (!plainObject(patch) || typeof patch.id !== 'string' || !ids.has(patch.id)) throw new CalibrationError('校準包含未知穴位代碼。');
  if (patch.coordinatePrecision !== undefined && patch.coordinatePrecision !== 'manual') throw new CalibrationError('校準必須標示為 manual。');
  const position = vector(patch.position, '座標');
  for (let i = 0; i < 3; i++) {
    const [min, max] = CALIBRATION_BOUNDS[axes[i]];
    if (position[i] < min || position[i] > max) throw new CalibrationError(`座標 ${axes[i]} 超出人體模型範圍。`);
  }
  const normal = vector(patch.normal, '表面法向');
  const magnitude = Math.hypot(...normal);
  if (Math.abs(magnitude - 1) > 0.0001) throw new CalibrationError('表面法向必須是非零單位向量。');
  // Correct insignificant raycaster/JSON floating point drift, never a zero vector.
  const unitNormal = normal.map(value => value / magnitude);
  const calibration = { method: 'surface-raycast', model: CALIBRATION_MODEL };
  if (patch.calibration !== undefined) {
    if (!plainObject(patch.calibration) || patch.calibration.method !== calibration.method || patch.calibration.model !== CALIBRATION_MODEL) throw new CalibrationError('校準方式或模型版本不符。');
    if (patch.calibration.updatedAt !== undefined) {
      if (typeof patch.calibration.updatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(patch.calibration.updatedAt) || !Number.isFinite(Date.parse(patch.calibration.updatedAt))) throw new CalibrationError('校準時間格式錯誤。');
      calibration.updatedAt = patch.calibration.updatedAt;
    }
  }
  return { id: patch.id, position, normal: unitNormal, coordinatePrecision: 'manual', calibration };
}

function validatedOverrides(overrides, points) {
  if (!Array.isArray(overrides)) throw new CalibrationError('校準 overrides 必須是陣列。');
  if (overrides.length > points.length) throw new CalibrationError('校準數量超出穴位總數。');
  const result = overrides.map(patch => createCalibrationOverride(patch, points));
  const ids = new Set(result.map(record => record.id));
  if (ids.size !== result.length) throw new CalibrationError('校準包含重複穴位代碼。');
  return result;
}

/** Persistent format shared by localStorage and src/data/calibration-overrides.json. */
export function calibrationEnvelope(overrides, points) {
  return {
    version: CALIBRATION_VERSION,
    model: CALIBRATION_MODEL,
    overrides: validatedOverrides(overrides, points).sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true })),
  };
}

/** Throws on malformed data so a bad saved record cannot silently reset the atlas. */
export function parseCalibration(raw, points) {
  let parsed;
  try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch { throw new CalibrationError('校準 JSON 無法解析。'); }
  if (!plainObject(parsed) || parsed.version !== CALIBRATION_VERSION || parsed.model !== CALIBRATION_MODEL) throw new CalibrationError('校準儲存格式或模型版本不符。');
  if (!Array.isArray(parsed.overrides) || parsed.overrides.some(record => !plainObject(record) || record.coordinatePrecision !== 'manual' || !plainObject(record.calibration))) throw new CalibrationError('校準紀錄缺少必要中繼資料。');
  return validatedOverrides(parsed.overrides, points);
}

/** Merge only placement fields into the full array, preserving source/clinical metadata. */
export function mergeCalibration(points, overrides) {
  const records = new Map(validatedOverrides(overrides, points).map(record => [record.id, record]));
  return points.map(point => {
    const patch = records.get(point.id);
    if (!patch) return withNeedleData({ ...point, position: [...point.position], normal: [...point.normal] });
    // A historical projection onto the generated seed mesh no longer describes
    // this manually picked placement. Do not leave that metadata behind.
    const { surfaceProjection, calibration: previousCalibration, ...retained } = point;
    return withNeedleData({ ...retained, ...patch });
  });
}

/** Read errors and malformed storage are explicit and leave storage untouched. */
export function loadCalibration(storage, points) {
  try {
    const raw = storage.getItem(CALIBRATION_STORAGE_KEY);
    return { ok: true, overrides: raw === null ? [] : parseCalibration(raw, points), error: null };
  } catch (error) { return { ok: false, overrides: [], error: `無法讀取校準設定：${errorText(error)}` }; }
}

export function saveCalibration(storage, points, overrides) {
  try {
    const envelope = calibrationEnvelope(overrides, points);
    storage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(envelope));
    return { ok: true, overrides: envelope.overrides, error: null };
  } catch (error) { return { ok: false, overrides: [], error: `無法儲存校準設定：${errorText(error)}` }; }
}

/** Upsert one placement while retaining every other locally calibrated point. */
export function setCalibration(storage, points, patch) {
  const loaded = loadCalibration(storage, points);
  if (!loaded.ok) return loaded;
  try {
    const record = createCalibrationOverride(patch, points);
    const overrides = loaded.overrides.filter(existing => existing.id !== record.id);
    const saved = saveCalibration(storage, points, [...overrides, record]);
    return saved.ok ? saved : { ...saved, overrides: loaded.overrides };
  } catch (error) { return { ok: false, overrides: loaded.overrides, error: `無法儲存校準設定：${errorText(error)}` }; }
}

export function removeCalibration(storage, points, id) {
  const loaded = loadCalibration(storage, points);
  if (!loaded.ok) return loaded;
  if (!knownIds(points).has(id)) return { ok: false, overrides: loaded.overrides, error: '校準包含未知穴位代碼。' };
  const saved = saveCalibration(storage, points, loaded.overrides.filter(record => record.id !== id));
  return saved.ok ? saved : { ...saved, overrides: loaded.overrides };
}

export function clearCalibration(storage) {
  try { storage.removeItem(CALIBRATION_STORAGE_KEY); return { ok: true, error: null }; }
  catch (error) { return { ok: false, error: `無法清除校準設定：${errorText(error)}` }; }
}

/** Import a complete exported atlas, only accepting manual placement fields. */
export function overridesFromExport(exported, points) {
  const ids = knownIds(points);
  if (!Array.isArray(exported) || exported.length !== points.length) throw new CalibrationError('匯入檔必須是完整穴位陣列。');
  const importedIds = new Set();
  const overrides = [];
  for (const point of exported) {
    if (!plainObject(point) || !ids.has(point.id) || importedIds.has(point.id)) throw new CalibrationError('匯入檔包含未知或重複穴位代碼。');
    importedIds.add(point.id);
    // Validate all exported vectors, including non-manual entries, so NaN/null
    // corruption is reported rather than silently discarded.
    createCalibrationOverride({ id: point.id, position: point.position, normal: point.normal }, points);
    if (point.coordinatePrecision === 'manual') {
      if (!plainObject(point.calibration)) throw new CalibrationError('手動校準缺少模型中繼資料。');
      overrides.push(createCalibrationOverride(point, points));
    }
    else if (!['schematic', 'regional'].includes(point.coordinatePrecision)) throw new CalibrationError('匯入檔包含未知座標類型。');
  }
  return overrides;
}
