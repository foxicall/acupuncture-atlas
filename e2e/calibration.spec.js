import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const storageKey = 'acupuncture-atlas:calibration:v1';
const originalPoints = JSON.parse(await readFile(new URL('../src/data/acupoints.json', import.meta.url), 'utf8'));
const originalLI4 = originalPoints.find(point => point.id === 'LI4');

async function ready(page) {
  await page.goto('/');
  await expect(page.locator('#viewer')).toHaveAttribute('data-loaded', 'true');
  await expect.poll(() => page.evaluate(() => window.__atlas?.modelLoaded)).toBe(true);
  await expect(page.locator('.point-title h2')).toHaveText('合谷');
}

async function enableCalibration(page) {
  await page.locator('[data-calibration-toggle]').click();
  await expect(page.locator('[data-calibration-toggle]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-calibration-panel]')).toBeVisible();
  await page.locator('[data-reset]').click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function canvasPosition(page, x = 0.5, y = 0.5) {
  const bounds = await page.locator('#viewer canvas').boundingBox();
  expect(bounds).not.toBeNull();
  return { x: bounds.x + bounds.width * x, y: bounds.y + bounds.height * y };
}

async function tap(page, testInfo, position) {
  if (testInfo.project.name === 'desktop') await page.mouse.click(position.x, position.y);
  else await page.touchscreen.tap(position.x, position.y);
}

async function sampleSurface(page, testInfo) {
  await tap(page, testInfo, await canvasPosition(page));
  await expect(page.locator('#viewer')).toHaveAttribute('data-calibration-marker', 'true');
  const text = await page.locator('[data-calibration-coordinates]').innerText();
  expect(text).toMatch(/"x"\s*:\s*-?\d+\.\d{3}/);
  expect(text).toMatch(/"y"\s*:\s*-?\d+\.\d{3}/);
  expect(text).toMatch(/"z"\s*:\s*-?\d+\.\d{3}/);
  const coordinate = JSON.parse(text);
  return { text, position: [coordinate.x, coordinate.y, coordinate.z] };
}

async function exportedPoints(page) {
  const downloadEvent = page.waitForEvent('download');
  await page.locator('[data-calibration-export]').click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/acupoints.*\.json$/);
  expect(await download.failure()).toBeNull();
  const points = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(Array.isArray(points)).toBe(true);
  expect(points).toHaveLength(originalPoints.length);
  expect(new Set(points.map(point => point.id)).size).toBe(originalPoints.length);
  return points;
}

function assertManualPoint(point, samplePosition) {
  expect(point.coordinatePrecision).toBe('manual');
  expect(point.calibration).toMatchObject({ method: 'surface-raycast', model: 'acupuncture_body.glb' });
  expect(point.position).toHaveLength(3);
  expect(point.normal).toHaveLength(3);
  for (let i = 0; i < 3; i++) {
    expect(Number.isFinite(point.position[i])).toBe(true);
    expect(Number.isFinite(point.normal[i])).toBe(true);
    expect(Math.abs(point.position[i] - samplePosition[i])).toBeLessThanOrEqual(0.00051);
  }
  expect(Math.hypot(...point.normal)).toBeCloseTo(1, 3);
}

test('calibration is opt-in, keeps the current selection and closes cleanly', async ({ page }) => {
  await ready(page);
  const toggle = page.locator('[data-calibration-toggle]');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-calibration-panel]')).toBeHidden();
  await enableCalibration(page);
  await expect(page.locator('[data-calibration-coordinates]')).toContainText('點擊人體表面取點');
  await expect(page.locator('[data-calibration-bind]')).toBeDisabled();
  await expect(page.locator('[data-calibration-copy]')).toBeDisabled();
  expect(await page.evaluate(() => window.__atlas.selectedId)).toBe('LI4');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-calibration-panel]')).toBeHidden();
  await expect(page.locator('#viewer')).not.toHaveAttribute('data-calibration-marker', 'true');
  await expect(page.locator('.point-title h2')).toHaveText('合谷');
});

test('surface coordinates copy, bind, export, persist and reset without changing other points', async ({ page, context }, testInfo) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await ready(page);
  await enableCalibration(page);
  const sample = await sampleSurface(page, testInfo);
  await page.screenshot({ path: `/tmp/atlas-sprint-calibration-${testInfo.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => window.__atlas.selectedId)).toBe('LI4');
  await page.locator('[data-calibration-copy]').click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(sample.text);
  await page.locator('[data-calibration-bind]').click();
  await expect.poll(() => page.evaluate(key => Boolean(localStorage.getItem(key)), storageKey)).toBe(true);
  const points = await exportedPoints(page);
  const manualLI4 = points.find(point => point.id === 'LI4');
  assertManualPoint(manualLI4, sample.position);
  expect(points.filter(point => point.id !== 'LI4')).toEqual(originalPoints.filter(point => point.id !== 'LI4'));
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
  expect(stored).toMatchObject({ version: 1, model: 'acupuncture_body.glb' });
  expect(stored.overrides.find(point => point.id === 'LI4').position).toEqual(manualLI4.position);
  await page.reload();
  await expect(page.locator('#viewer')).toHaveAttribute('data-loaded', 'true');
  await expect(page.locator('[data-calibration-toggle]')).toHaveAttribute('aria-pressed', 'false');
  await enableCalibration(page);
  expect((await exportedPoints(page)).find(point => point.id === 'LI4')).toEqual(manualLI4);
  await page.locator('[data-calibration-reset]').click();
  const reset = (await exportedPoints(page)).find(point => point.id === 'LI4');
  expect(reset).toEqual(originalLI4);
  const resetStorage = await page.evaluate(key => {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value).overrides : [];
  }, storageKey);
  expect(resetStorage.some(point => point.id === 'LI4')).toBe(false);
  await page.locator('[data-calibration-toggle]').click();
  await expect(page.locator('#viewer')).not.toHaveAttribute('data-calibration-marker', 'true');
});

test('blank taps, orbit drags and two-finger gestures cannot record a calibration sample', async ({ page, context }, testInfo) => {
  await ready(page);
  await enableCalibration(page);
  const coords = page.locator('[data-calibration-coordinates]');
  const initial = await coords.innerText();
  await tap(page, testInfo, await canvasPosition(page, 0.04, 0.45));
  await expect(coords).toHaveText(initial);
  await expect(page.locator('#viewer')).not.toHaveAttribute('data-calibration-marker', 'true');
  const start = await canvasPosition(page, 0.47, 0.45);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 65, start.y + 20, { steps: 8 });
  await page.mouse.up();
  await expect(coords).toHaveText(initial);
  await expect(page.locator('#viewer')).not.toHaveAttribute('data-calibration-marker', 'true');
  // CDP dispatches real simultaneous touches; independent pointer dispatches would not
  // exercise OrbitControls' two-finger path or the picker multi-touch guard.
  const cdp = await context.newCDPSession(page);
  const center = await canvasPosition(page);
  const touches = delta => [
    { x: center.x - delta, y: center.y, id: 1, radiusX: 4, radiusY: 4, force: 1 },
    { x: center.x + delta, y: center.y, id: 2, radiusX: 4, radiusY: 4, force: 1 },
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touches(12) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touches(20) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await expect(coords).toHaveText(initial);
  await expect(page.locator('#viewer')).not.toHaveAttribute('data-calibration-marker', 'true');
  expect(await page.evaluate(() => window.__atlas.selectedId)).toBe('LI4');
  await page.locator('[data-reset]').click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const sample = await sampleSurface(page, testInfo);
  await tap(page, testInfo, await canvasPosition(page, 0.04, 0.45));
  await expect(coords).toHaveText(sample.text);
});

test('denied clipboard access preserves the sample and offers a useful retry', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: () => Promise.reject(new DOMException('Clipboard blocked by browser policy', 'NotAllowedError')),
    });
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await ready(page);
  await enableCalibration(page);
  const sample = await sampleSurface(page, testInfo);
  await page.locator('[data-calibration-copy]').click();
  await expect(page.locator('[data-calibration-status]')).toContainText('複製');
  await expect(page.locator('[data-calibration-copy]')).toBeEnabled();
  await expect(page.locator('[data-calibration-coordinates]')).toHaveText(sample.text);
  await page.locator('[data-calibration-copy]').click();
  await expect(page.locator('[data-calibration-coordinates]')).toHaveText(sample.text);
  expect(errors).toEqual([]);
});

test('malformed saved calibration stays recoverable while a new session placement can export', async ({ page }, testInfo) => {
  const damaged = '{incomplete-calibration';
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: storageKey, value: damaged });
  await ready(page);
  await enableCalibration(page);
  const sample = await sampleSurface(page, testInfo);
  await page.locator('[data-calibration-bind]').click();
  await expect(page.locator('[data-calibration-status]')).toContainText('儲存失敗');
  expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBe(damaged);
  const exported = await exportedPoints(page);
  assertManualPoint(exported.find(point => point.id === 'LI4'), sample.position);
});

test('manual coordinates, the model and original Markdown survive an offline PWA reload', async ({ page, context }, testInfo) => {
  await ready(page);
  await enableCalibration(page);
  const sample = await sampleSurface(page, testInfo);
  await page.locator('[data-calibration-bind]').click();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  });
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.locator('#viewer')).toHaveAttribute('data-loaded', 'true');
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    await enableCalibration(page);
    const saved = (await exportedPoints(page)).find(point => point.id === 'LI4');
    assertManualPoint(saved, sample.position);
    await page.locator('[data-calibration-toggle]').click();
    await page.getByRole('button', { name: '閱讀講義', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '課程教材庫' })).toBeVisible();
    await expect(page.locator('[data-document-body]')).toContainText('合谷');
  } finally {
    await context.setOffline(false);
  }
});
