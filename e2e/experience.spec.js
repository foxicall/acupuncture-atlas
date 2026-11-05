import { test, expect } from '@playwright/test';

async function ready(page) {
  await page.goto('/');
  await expect(page.locator('#viewer')).toHaveAttribute('data-loaded', 'true');
  await expect.poll(() => page.evaluate(() => window.__atlas?.modelLoaded)).toBe(true);
}

async function openDirectory(page) {
  if (await page.locator('[data-open-list]').isVisible()) await page.locator('[data-open-list]').click();
  await expect(page.getByRole('searchbox', { name: '搜尋穴位', exact: true })).toBeVisible();
}

async function choosePoint(page, id) {
  await openDirectory(page);
  await page.getByRole('searchbox', { name: '搜尋穴位', exact: true }).fill(id);
  await page.locator(`.point-row[data-id="${id}"]`).click();
  await expect.poll(() => page.evaluate(() => window.__atlas.selectedId)).toBe(id);
}

async function dragTouch(context, page, locator, deltaY) {
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
  const session = await context.newCDPSession(page);
  const touch = dy => [{ x, y: y + dy, id: 1, radiusX: 5, radiusY: 5, force: 1 }];
  try {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touch(0) });
    for (let i = 1; i <= 6; i++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touch(deltaY * i / 6) });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await session.detach(); }
}

test('the atlas meridian control synchronizes the directory and filters 3D labels', async ({ page }, testInfo) => {
  await ready(page);
  const atlasFilter = page.getByRole('combobox', { name: '圖譜經絡篩選', exact: true });
  await expect(atlasFilter).toBeVisible();
  await atlasFilter.selectOption({ label: '手太陰肺經' });
  await expect(page.locator('.directory select')).toHaveValue('手太陰肺經');
  await expect.poll(async () => {
    const ids = await page.evaluate(() => window.__atlas?.visiblePointIds || []);
    return ids.length > 0 && ids.every(id => /^LU\d+$/.test(id));
  }).toBe(true);
  const labels = page.locator('.meridian-label:visible');
  await expect.poll(() => labels.count()).toBeGreaterThan(0);
  for (const id of await labels.evaluateAll(elements => elements.map(element => element.dataset.id))) expect(id).toMatch(/^LU\d+$/);
  await page.screenshot({ path: `/tmp/atlas-sprint-meridian-${testInfo.project.name}.png`, fullPage: true });
  await openDirectory(page);
  await expect(page.locator('[data-result-count]')).toContainText('個穴位');
  for (const meridian of await page.locator('.point-row small').allTextContents()) expect(meridian).toBe('手太陰肺經');
  await page.getByRole('combobox', { name: '經絡篩選', exact: true }).selectOption({ label: '手陽明大腸經' });
  await expect(atlasFilter.locator('option:checked')).toHaveText('手陽明大腸經');
  await expect.poll(async () => {
    const ids = await page.evaluate(() => window.__atlas?.visiblePointIds || []);
    return ids.length > 0 && ids.every(id => /^LI\d+$/.test(id));
  }).toBe(true);
  await page.getByRole('combobox', { name: '經絡篩選', exact: true }).selectOption('');
  await expect(atlasFilter).toHaveValue('');
  // A point outside the default featured subset must remain visible when all
  // filters are cleared. Strict meridian filtering still hides outside points.
  await page.getByRole('searchbox', { name: '搜尋穴位', exact: true }).fill('LI2');
  await page.locator('.point-row[data-id="LI2"]').click();
  await openDirectory(page);
  await page.getByRole('searchbox', { name: '搜尋穴位', exact: true }).fill('');
  if (await page.locator('[data-close-list]').isVisible()) await page.locator('[data-close-list]').click();
  await expect.poll(() => page.evaluate(() => window.__atlas.selectedId)).toBe('LI2');
  await expect.poll(() => page.evaluate(() => window.__atlas.visiblePointIds.includes('LI2'))).toBe(true);
});

test('high-risk points show their source-backed warning and the selected needle has a visible body', async ({ page }, testInfo) => {
  await ready(page);
  for (const id of ['LU1', 'ST12', 'GB20', 'GB21', 'GV15']) {
    await choosePoint(page, id);
    const warning = page.locator('[data-danger-warning]');
    await expect(warning).toBeAttached();
    if (testInfo.project.name !== 'mobile') await expect(warning).toBeVisible();
    const body = await warning.innerText();
    expect(body.length).toBeGreaterThan(15);
    if (id === 'LU1') expect(body).toContain('氣胸');
    await expect(page.locator('[data-danger-source]').first()).toBeAttached();
  }
  await choosePoint(page, 'LU1');
  // The source offers unnumbered alternatives for LU1, so a concrete needle
  // vector would invent precision. LI4's explicit perpendicular method can render.
  await expect.poll(() => page.evaluate(() => window.__atlas?.needleVisible)).toBe(false);
  await page.screenshot({ path: `/tmp/atlas-sprint-danger-${testInfo.project.name}.png`, fullPage: true });
  await choosePoint(page, 'LI4');
  await page.locator('[data-focus]').click();
  await expect.poll(() => page.evaluate(() => window.__atlas?.needleVisible)).toBe(true);
  await page.screenshot({ path: `/tmp/atlas-sprint-needle-${testInfo.project.name}.png`, fullPage: true });
  await choosePoint(page, 'LU1');
  await page.locator('[data-danger-source]').first().click();
  await expect(page.getByRole('dialog', { name: '課程教材庫' })).toBeVisible();
  await expect(page.locator('[data-document-body]')).toContainText('中府');
});

test('the mobile technique sheet drags from its peek to the full original Markdown and back', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'The draggable bottom sheet is the mobile layout.');
  await ready(page);
  const sheet = page.locator('.technique-sheet');
  const handle = page.locator('[data-sheet-drag]');
  await expect(handle).toBeVisible();
  await expect(handle).toHaveAttribute('aria-expanded', 'false');
  const viewport = page.viewportSize();
  const peek = await sheet.boundingBox();
  expect(peek.height).toBeGreaterThan(viewport.height * 0.25);
  expect(peek.height).toBeLessThan(viewport.height * 0.45);
  await page.screenshot({ path: '/tmp/atlas-sprint-mobile-sheet-peek.png', fullPage: true });
  await dragTouch(context, page, handle, -110);
  await expect(sheet).toHaveClass(/is-expanded/);
  await expect(handle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-sheet-original]')).toBeVisible();
  await expect(page.locator('[data-sheet-original]')).toContainText('合谷');
  await expect(page.locator('[data-sheet-original] h1')).toHaveCount(1);
  const expanded = await sheet.boundingBox();
  expect(expanded.height).toBeGreaterThanOrEqual(viewport.height * 0.9);
  expect(expanded.y).toBeLessThanOrEqual(8);
  await page.screenshot({ path: '/tmp/atlas-sprint-mobile-sheet-expanded.png', fullPage: true });
  await dragTouch(context, page, handle, 110);
  await expect(sheet).not.toHaveClass(/is-expanded/);
  await expect(handle).toHaveAttribute('aria-expanded', 'false');
  await handle.click();
  await expect(sheet).toHaveClass(/is-expanded/);
  await page.keyboard.press('Escape');
  await expect(sheet).not.toHaveClass(/is-expanded/);
  await expect(handle).toHaveAttribute('aria-expanded', 'false');
});

test('the calibration panel fits the phone and leaves the model available to sample', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Capture the dedicated phone calibration layout.');
  await ready(page);
  await page.locator('[data-calibration-toggle]').click();
  await expect(page.locator('[data-calibration-panel]')).toBeVisible();
  await page.locator('[data-reset]').click();
  const canvas = await page.locator('#viewer canvas').boundingBox();
  expect(canvas.height).toBeGreaterThan(120);
  await page.touchscreen.tap(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await expect(page.locator('#viewer')).toHaveAttribute('data-calibration-marker', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/atlas-sprint-mobile-calibration-panel.png', fullPage: true });
});
