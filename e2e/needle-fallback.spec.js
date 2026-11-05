import { test, expect } from '@playwright/test';

const unknownNeedleMessage = '進針角度與向量：待專業校準';

async function ready(page) {
  await page.goto('/');
  await expect(page.locator('#viewer')).toHaveAttribute('data-loaded', 'true');
  await expect.poll(() => page.evaluate(() => window.__atlas?.modelLoaded)).toBe(true);
}

async function choosePoint(page, id) {
  if (await page.locator('[data-open-list]').isVisible()) await page.locator('[data-open-list]').click();
  const search = page.getByRole('searchbox', { name: '搜尋穴位', exact: true });
  await expect(search).toBeVisible();
  await search.fill(id);
  await page.locator(`.point-row[data-id="${id}"]`).click();
  await expect.poll(() => page.evaluate(() => window.__atlas.selectedId)).toBe(id);
}

async function expectNoNeedle(page) {
  await expect.poll(() => page.evaluate(() => window.__atlas?.needleVisible)).toBe(false);
  // A hidden stale mesh could reappear when visibility/mode changes. Confirm the
  // old needle has actually been removed from the scene, rather than only hidden.
  await expect.poll(() => page.evaluate(() => window.__atlas?.needleMeshCount)).toBe(0);
  await expect(page.locator('.geometry-note')).toContainText(unknownNeedleMessage);
}

test('a real point without a calibrated vector stays usable without fabricating a needle', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await ready(page);
  await choosePoint(page, 'LU1');
  await expect(page.locator('.point-title h2')).toHaveText('中府');
  await expectNoNeedle(page);
  const canvas = page.locator('#viewer canvas');
  await page.locator('[data-reset]').click();
  const fullBody = await canvas.screenshot();
  await page.locator('[data-focus]').click();
  const focusedBody = await canvas.screenshot();
  expect(focusedBody.equals(fullBody)).toBe(false);
  await expectNoNeedle(page);
  await expect(page.locator('.hotspot-label')).toContainText('中府');
  await page.locator('.geometry-note').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `/tmp/atlas-needle-fallback-${testInfo.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: '閱讀講義', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '課程教材庫' })).toBeVisible();
  await expect(page.locator('[data-document-body]')).toContainText('中府');
  await expect(page.locator('[data-document-body] h1')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '課程教材庫' })).not.toBeVisible();
  await expectNoNeedle(page);
  expect(errors).toEqual([]);
});

test('switching between a valid LI4 vector and unknown LU1 removes every stale needle mesh', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await ready(page);
  await choosePoint(page, 'LI4');
  await expect(page.locator('.point-title h2')).toHaveText('合谷');
  await expect.poll(() => page.evaluate(() => window.__atlas?.needleVisible)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__atlas?.needleMeshCount)).toBeGreaterThan(0);
  await expect(page.locator('.geometry-note')).not.toContainText(unknownNeedleMessage);
  await choosePoint(page, 'LU1');
  await expectNoNeedle(page);
  await choosePoint(page, 'LI4');
  await expect.poll(() => page.evaluate(() => window.__atlas?.needleVisible)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__atlas?.needleMeshCount)).toBeGreaterThan(0);
  await choosePoint(page, 'LU1');
  await expectNoNeedle(page);
  expect(errors).toEqual([]);
});
