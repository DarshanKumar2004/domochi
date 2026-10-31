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

test('back after a while: the crew made some money', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('domochi.save', JSON.stringify({ tutorialDone: true, day: 80, money: 10, staff: ['mai'], lastSeen: Date.now() - 6 * 3_600_000 }));
  });
  await page.goto('/?seed=7');
  await tapNamed(page, SceneKeys.Preload, 'prompt-start');
  await waitForScene(page, SceneKeys.Lobby);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const sc = (window as unknown as { __game: { scene: { getScene(k: string): { children: { list: { name?: string; text?: string; visible?: boolean }[] } } } } }).__game.scene.getScene('HudScene');
        const t = sc.children.list.find((o) => o.name === 'hud-toast');
        return t?.visible ? t.text : '';
      }),
    )
    .toContain('while you were away');
  await shot(page, 'crew-1-away');
  const saved = JSON.parse((await page.evaluate(() => localStorage.getItem('domochi.save'))) ?? '{}');
  expect(saved.money).toBeGreaterThan(10);
});
