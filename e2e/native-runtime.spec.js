import { test, expect } from '@playwright/test';

// This exercises the browser bundle's native branch through Capacitor's bridge
// detection. It is not an Android WebView, installed APK, or device test.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { window.androidBridge = { postMessage() {} }; });
});

async function ready(page) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('#viewer')).toHaveAttribute('data-loaded', 'true');
  await expect.poll(() => page.evaluate(() => window.__atlas?.modelLoaded)).toBe(true);
}

async function expectEmbeddedRuntime(page) {
  await expect(page.locator('[data-install]')).toBeHidden();
  await expect(page.locator('[data-install]')).toHaveAttribute('hidden', '');
  // The connection control is intentionally hidden at narrow widths; its text
  // still verifies the native status instead of applying a visibility assertion.
  await expect(page.locator('[data-connection] span')).toHaveText('離線教材已內嵌');
  const workers = await page.evaluate(async () => ({
    supported: 'serviceWorker' in navigator,
    registrations: (await navigator.serviceWorker.getRegistrations()).length,
    controlled: navigator.serviceWorker.controller !== null,
  }));
  expect(workers).toEqual({ supported: true, registrations: 0, controlled: false });
}

async function pick(page, id) {
  if (await page.locator('[data-open-list]').isVisible()) await page.locator('[data-open-list]').click();
  await page.getByRole('searchbox', { name: '搜尋穴位', exact: true }).fill(id);
  await page.locator(`.point-row[data-id="${id}"]`).click();
  await expect.poll(() => page.evaluate(() => window.__atlas.selectedId)).toBe(id);
}

test('the simulated native branch embeds the offline label and reads already loaded teaching content', async ({ page, context }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await ready(page);
  await expectEmbeddedRuntime(page);
  await context.setOffline(true);
  try {
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
    await expectEmbeddedRuntime(page);
    await pick(page, 'LU1');
    await expect(page.locator('.point-title h2')).toHaveText('中府');
    await page.getByRole('button', { name: '閱讀講義', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '課程教材庫' })).toBeVisible();
    await expect(page.locator('[data-document-body]')).toContainText('中府');
    await expect(page.locator('[data-document-body] h1')).toHaveCount(1);
    await page.screenshot({ path: `/tmp/atlas-native-simulated-docs-${testInfo.project.name}.png`, fullPage: true });
    await expectEmbeddedRuntime(page);
    expect(errors).toEqual([]);
  } finally {
    await context.setOffline(false);
  }
});

test('the simulated native branch resets and reloads online with own-origin assets and no service worker', async ({ page }) => {
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await ready(page);
  await expectEmbeddedRuntime(page);
  const origin = new URL(page.url()).origin;
  await pick(page, 'ST36');
  const canvas = page.locator('#viewer canvas');
  const focused = await canvas.screenshot();
  await page.locator('[data-reset]').click();
  const reset = await canvas.screenshot();
  expect(reset.equals(focused)).toBe(false);
  // Keep the page online: a browser HTTP server cannot prove an APK's packaged
  // asset loading on an offline first launch or reload.
  expect(await page.evaluate(() => navigator.onLine)).toBe(true);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('#viewer')).toHaveAttribute('data-loaded', 'true');
  await expect(page.locator('.point-title h2')).toHaveText('足三里');
  await expectEmbeddedRuntime(page);
  expect(requests.some(url => new URL(url).pathname.endsWith('/models/acupuncture_body.glb'))).toBe(true);
  expect(requests.some(url => /\/assets\/.*\.js$/.test(new URL(url).pathname))).toBe(true);
  expect(requests.filter(url => new URL(url).origin !== origin)).toEqual([]);
  expect(errors).toEqual([]);
});
