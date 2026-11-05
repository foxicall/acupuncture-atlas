import { test, expect } from '@playwright/test';

async function ready(page, target = '/') {
  await page.goto(target);
  await expect(page.locator('#viewer')).toHaveAttribute('data-loaded', 'true');
  await expect.poll(() => page.evaluate(() => window.__atlas?.modelLoaded)).toBe(true);
}

async function openDirectory(page) {
  const mobileSearch = page.locator('[data-open-list]');
  if (await mobileSearch.isVisible()) await mobileSearch.click();
  await expect(page.getByRole('searchbox', { name: '搜尋穴位', exact: true })).toBeVisible();
}

async function pick(page, code) {
  await openDirectory(page);
  await page.getByRole('searchbox', { name: '搜尋穴位', exact: true }).fill(code);
  await page.locator(`.point-row[data-id="${code}"]`).click();
}

test('loads the GLB model, real technique source and responsive layout', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await ready(page);
  await expect(page.locator('.point-title h2')).toHaveText('合谷');
  await expect(page.locator('.technique-fields')).toContainText('體表定位');
  await expect(page.locator('.technique-fields')).toContainText('安全與禁忌');
  await expect(page.locator('.source-link').first()).toBeAttached();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `/tmp/atlas-${testInfo.project.name}.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test('searching and selecting LI4 drives hash, sheet and active selection', async ({ page }, testInfo) => {
  await ready(page);
  await pick(page, 'ST36');
  await expect(page).toHaveURL(/#point=ST36$/);
  await expect(page.locator('.point-title h2')).toHaveText('足三里');
  await pick(page, 'LI4');
  await expect(page).toHaveURL(/#point=LI4$/);
  await expect(page.locator('.point-title h2')).toHaveText('合谷');
  await expect.poll(() => page.evaluate(() => window.__atlas.selectedId)).toBe('LI4');
  await expect(page.locator('.point-row[data-id="LI4"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.directory')).not.toHaveClass(/is-open/);
  await page.getByRole('button', { name: '聚焦穴位', exact: true }).click();
  await expect(page.locator('#viewer canvas')).toBeVisible();
  await page.screenshot({ path: `/tmp/atlas-focus-${testInfo.project.name}.png`, fullPage: true });
});

test('opens the selected source Markdown in the library and returns', async ({ page }, testInfo) => {
  await ready(page);
  await page.getByRole('button', { name: '閱讀講義', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '課程教材庫' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('[data-document-body]')).toContainText('合谷');
  await expect(page.locator('[data-document-body] h1')).toHaveCount(1);
  await page.screenshot({ path: `/tmp/atlas-source-${testInfo.project.name}.png`, fullPage: true });
  if (testInfo.project.name === 'mobile') {
    await page.locator('[data-library-back]').click();
    await expect(page.getByRole('searchbox', { name: '搜尋教材', exact: true })).toBeVisible();
  }
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.point-title h2')).toHaveText('合谷');
});

test('meridian filter and missing search show honest results and clear properly', async ({ page }) => {
  await ready(page);
  await openDirectory(page);
  await page.getByRole('combobox', { name: '經絡篩選' }).selectOption({ label: '手陽明大腸經' });
  const count = await page.locator('.point-row').count();
  expect(count).toBeGreaterThan(0);
  for (const label of await page.locator('.point-row small').allTextContents()) expect(label).toBe('手陽明大腸經');
  await expect(page.locator('[data-result-count]')).toHaveText(`${count} 個穴位`);
  await page.getByRole('searchbox', { name: '搜尋穴位', exact: true }).fill('does-not-exist-zzz');
  await expect(page.locator('.point-list .empty-state')).toContainText('沒有符合的穴位');
  await expect(page.locator('[data-result-count]')).toHaveText('0 個穴位');
  await page.locator('[data-clear]').click();
  await expect(page.getByRole('combobox', { name: '經絡篩選' })).toHaveValue('');
  expect(await page.locator('.point-row').count()).toBeGreaterThan(count);
});

test('front, back, zoom and reset controls change the rendered view', async ({ page }) => {
  await ready(page);
  const canvas = page.locator('#viewer canvas');
  await page.locator('[data-reset]').click();
  const front = await canvas.screenshot();
  await page.locator('[data-back]').click();
  await expect(page.locator('[data-back]')).toHaveClass(/is-active/);
  const back = await canvas.screenshot();
  expect(back.equals(front)).toBe(false);
  await page.locator('[data-front]').click();
  await expect(page.locator('[data-front]')).toHaveClass(/is-active/);
  const normal = await canvas.screenshot();
  await page.locator('[data-zoom-in]').click();
  const zoom = await canvas.screenshot();
  expect(zoom.equals(normal)).toBe(false);
  await page.locator('[data-zoom-out]').click();
  await page.locator('[data-reset]').click();
  await expect(page.locator('[data-front]')).toHaveClass(/is-active/);
});

test('canvas hotspot picking selects the point through mouse or touch', async ({ page }, testInfo) => {
  await ready(page);
  await pick(page, 'ST36');
  await page.locator('[data-reset]').click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const label = page.locator('.hotspot-label');
  await expect(label).toBeVisible();
  const bounds = await label.boundingBox();
  expect(bounds).not.toBeNull();
  const dot = { x: bounds.x - 14, y: bounds.y + bounds.height / 2 };
  await pick(page, 'LI4');
  // Clear search so both featured landmarks are present in the canvas.
  await openDirectory(page);
  await page.getByRole('searchbox', { name: '搜尋穴位', exact: true }).fill('');
  if (await page.locator('[data-close-list]').isVisible()) await page.locator('[data-close-list]').click();
  await page.locator('[data-reset]').click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  if (testInfo.project.name === 'desktop') await page.mouse.click(dot.x, dot.y);
  else await page.touchscreen.tap(dot.x, dot.y);
  await expect.poll(() => page.evaluate(() => window.__atlas.selectedId)).toBe('ST36');
  await expect(page).toHaveURL(/#point=ST36$/);
  await expect(page.locator('.point-title h2')).toHaveText('足三里');
});

test('mobile directory supports close, Escape, keyboard shortcut and selection', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Mobile-only directory interaction');
  await ready(page);
  await page.locator('[data-open-list]').click();
  await expect(page.locator('.directory')).toHaveAttribute('aria-modal', 'true');
  await expect(page.getByRole('searchbox', { name: '搜尋穴位', exact: true })).toBeFocused();
  await page.locator('[data-close-list]').click();
  await expect(page.locator('[data-open-list]')).toBeFocused();
  await page.keyboard.press('/');
  await expect(page.locator('.directory')).toHaveClass(/is-open/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.directory')).not.toHaveClass(/is-open/);
  await expect(page.locator('[data-open-list]')).toBeFocused();
  await pick(page, 'LU1');
  await expect(page.locator('.directory')).not.toHaveClass(/is-open/);
  await expect(page.locator('.point-title h2')).toHaveText('中府');
  await page.locator('[data-close-sheet]').click();
  await expect(page.locator('[data-reopen]')).toBeVisible();
  await page.locator('[data-reopen]').click();
  await expect(page.locator('.technique-sheet')).not.toHaveClass(/is-collapsed/);
});

test('model and Markdown remain usable after an offline reload', async ({ page, context }) => {
  await ready(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  });
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const urls = (await Promise.all(keys.map(async key => (await (await caches.open(key)).keys()).map(request => request.url)))).flat();
    return urls.map(url => new URL(url).pathname);
  });
  expect(cached.some(url => url.endsWith('/models/acupuncture_body.glb'))).toBe(true);
  expect(cached.some(url => /\/assets\/.*\.js$/.test(url))).toBe(true);
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.locator('#viewer')).toHaveAttribute('data-loaded', 'true');
    await expect.poll(() => page.evaluate(() => window.__atlas?.modelLoaded)).toBe(true);
    await pick(page, 'LU1');
    await expect(page.locator('.point-title h2')).toHaveText('中府');
    await page.getByRole('button', { name: '閱讀講義', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '課程教材庫' })).toBeVisible();
    await expect(page.locator('[data-document-body]')).toContainText('中府');
  } finally { await context.setOffline(false); }
});
