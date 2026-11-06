import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const points = JSON.parse(readFileSync(new URL('../src/data/acupoints.json', import.meta.url)));
const symptomIds = label => points.filter(p => p.indications.includes(label)).map(p => p.id).sort();
async function ready(page) {
  await page.goto('/');
  await expect(page.locator('#viewer')).toHaveAttribute('data-loaded', 'true');
}
async function expectGroup(page, ids) {
  await expect.poll(() => page.evaluate(() => window.__atlas.highlightedPointIds.sort())).toEqual(ids);
  await expect.poll(() => page.evaluate(() => window.__atlas.visiblePointIds.sort())).toEqual(ids);
  await expect.poll(() => page.evaluate(() => window.__atlas.groupPointsInFrame)).toBe(true);
}
async function directory(page) {
  if (await page.locator('[data-open-list]').isVisible()) await page.locator('[data-open-list]').click();
}

test('symptom group highlights all body sides, fits the camera, and links to the sheet', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await ready(page);
  await page.locator('[data-clinical-value="頭痛"]').click();
  await expectGroup(page, symptomIds('頭痛'));
  await expect(page.locator('.group-navigation')).toContainText('頭痛');
  await expect(page.locator('.clinical-summary')).toContainText('主要對應病症');
  await expect(page.locator('.clinical-summary')).toContainText('手法速查摘要');
  // LI4's reducing method is sourced to a cold-treatment row, not headache.
  await expect(page.locator('.technique-summary')).toContainText('本症狀未載明');
  await page.locator('[data-fit-group]').click();
  await expectGroup(page, symptomIds('頭痛'));
  await expect(page.locator('#viewer canvas')).toBeVisible();
  expect((await page.locator('#viewer').boundingBox()).height).toBeGreaterThan(120);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `/tmp/atlas-clinical-${testInfo.project.name}.png`, fullPage: true });
  await page.locator('[data-group-point="GB20"]').click();
  await expect(page.locator('.point-title h2')).toHaveText('風池');
  await expect(page.locator('[data-summary-angle]')).toHaveText('斜刺');
  await expect(page.locator('[data-danger-warning]')).toContainText('高風險');
  expect(errors).toEqual([]);
});

test('technique/category switching replaces stale filters and clears back to all points', async ({ page }) => {
  await ready(page);
  if (await page.locator('.compact-category').isVisible()) await page.locator('.compact-category').selectOption('胸腹消化');
  else await page.locator('[data-category="胸腹消化"]').click();
  await expectGroup(page, points.filter(p => p.symptomCategories.includes('胸腹消化')).map(p => p.id).sort());
  await page.getByRole('tab', { name: /針法索引/ }).click();
  await page.locator('[data-clinical-value="透刺"]').click();
  await expectGroup(page, points.filter(p => p.techniqueType.includes('透刺')).map(p => p.id).sort());
  await expect(page.locator('[data-clinical-value="強刺激瀉法"]')).toBeDisabled();
  await page.locator('[data-clinical-value=""]').click();
  await expect.poll(() => page.evaluate(() => window.__atlas.highlightedPointIds)).toEqual([]);
  await expect(page.locator('.point-row')).toHaveCount(points.length);
  await page.getByRole('tab', { name: /針法索引/ }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: /症狀索引/ })).toHaveAttribute('aria-selected', 'true');
});

test('partial symptom search offers point and group destinations, including empty results', async ({ page }) => {
  await ready(page);
  await directory(page);
  const search = page.getByRole('searchbox', { name: '搜尋穴位', exact: true });
  await search.fill('牙');
  await expect(page.locator('[data-symptom="牙痛"]')).toBeVisible();
  await expect(page.locator('[data-suggestion-point="LI4"]')).toBeVisible();
  await page.locator('[data-symptom="牙痛"]').click();
  await expectGroup(page, symptomIds('牙痛'));
  await directory(page);
  await search.fill('失眠');
  await page.locator('[data-symptom="失眠"]').click();
  await expectGroup(page, symptomIds('失眠'));
  await directory(page);
  await search.fill('does-not-exist');
  await expect(page.locator('[data-result-count]')).toHaveText('0 個穴位');
  await expect.poll(() => page.evaluate(() => window.__atlas.visiblePointIds)).toEqual([]);
  await page.locator('[data-clear]').click();
  await expect(page.locator('.point-row')).toHaveCount(points.length);
});

test('clinical navigation remains available when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) { return type.includes('webgl') ? null : getContext.call(this, type, ...args); };
  });
  await page.goto('/');
  await expect(page.locator('[data-model-status]')).toContainText('無法啟用 3D');
  await page.locator('[data-clinical-value="失眠"]').click();
  await expect(page.locator('.group-navigation')).toContainText('失眠');
  await expect(page.locator('.point-row')).toHaveCount(symptomIds('失眠').length);
});
