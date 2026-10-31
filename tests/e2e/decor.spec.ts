import { expect, test } from '@playwright/test';
import { SceneKeys } from '../../src/scenes/sceneKeys';
import { findNamed, isVisibleNamed, shot, tapNamed, waitForScene } from './helpers';

test('decorations bought at the store show on the lot', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('domochi.save', JSON.stringify({ tutorialDone: true, day: 61, money: 50, decor: ['flowers', 'lights', 'table', 'neon', 'mural'] }));
  });
  await page.goto('/?seed=7');
  await tapNamed(page, SceneKeys.Preload, 'prompt-start');
  await waitForScene(page, SceneKeys.Lobby);
  await findNamed(page, SceneKeys.Lobby, 'lobby-checklist');
  expect(await isVisibleNamed(page, SceneKeys.Lobby, 'decor-neon')).toBe(true);
  await page.waitForTimeout(400);
  await shot(page, 'decor-1-lot');
  expect(errors).toEqual([]);
});
