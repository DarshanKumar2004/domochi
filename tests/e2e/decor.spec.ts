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
    localStorage.setItem('domochi.save', JSON.stringify({ tutorialDone: true, day: 80, money: 10, staff: ['geo'], lastSeen: Date.now() - 6 * 3_600_000 }));
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

test('day 110: mochi invites you onto the crew and asks your name', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('domochi.save', JSON.stringify({ tutorialDone: true, day: 111, money: 5, staff: ['geo', 'bruce'] }));
  });
  await page.goto('/?seed=7');
  await tapNamed(page, SceneKeys.Preload, 'prompt-start');
  await waitForScene(page, SceneKeys.Lobby);
  await page.evaluate(() => (window as unknown as { __game: { scene: { start(k: string): void } } }).__game.scene.start('StoreScene'));
  await waitForScene(page, SceneKeys.Store);
  // Scroll to the crew, then tap "join".
  await page.evaluate(() => {
    const sc = (window as unknown as { __game: { scene: { getScene(k: string): { scrollTo(n: number): void; maxScroll: number } } } }).__game.scene.getScene('StoreScene');
    sc.scrollTo(sc.maxScroll);
  });
  await page.waitForTimeout(300);
  await tapNamed(page, SceneKeys.Store, 'store-hire-you');
  await expect(page.locator('.dm-card')).toContainText("what's your name");
  await shot(page, 'crew-2-invite');
  await page.locator('.dm-card input').fill('Kim');
  await page.locator('.dm-card [data-x="join"]').click();
  await expect(page.locator('.dm-card')).toContainText('welcome to the team, Kim');
  await page.locator('.dm-card [data-x="close"]').click();
  const saved = JSON.parse((await page.evaluate(() => localStorage.getItem('domochi.save'))) ?? '{}');
  expect(saved.playerName).toBe('Kim');
  expect(saved.staff).toContain('you');
});

test('a three-star day from day 50 earns a coupon for the trailer', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('domochi.save', JSON.stringify({ tutorialDone: true, day: 55, money: 5 }));
  });
  await page.goto('/?seed=7');
  await tapNamed(page, SceneKeys.Preload, 'prompt-start');
  await waitForScene(page, SceneKeys.Lobby);
  // A great day (pretend), then the summary.
  await page.evaluate(() => {
    const w = window as unknown as { __session: { summary(): object }; __game: { scene: { start(k: string): void } } };
    const real = w.__session.summary.bind(w.__session);
    w.__session.summary = () => ({ ...real(), served: 9, averageScore: 93, bestScore: 99 });
    w.__game.scene.start('DaySummaryScene');
  });
  await waitForScene(page, SceneKeys.DaySummary);
  await findNamed(page, SceneKeys.DaySummary, 'summary-coupon');
  await page.waitForTimeout(1200);
  await shot(page, 'coupon-1-summary');
});

test("out of rice flour with money in the bank: a friend offers a store run, for a fee", async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const stock = { 'rice-flour': 0, tapioca: 4, sugar: 4, milk: 8, egg: 4, 'box-single': 6, 'box-trio': 6, oil: 2, 'glaze-powdered-sugar': 12, 'glaze-strawberry': 12, 'glaze-white-icing': 12 };
    localStorage.setItem('domochi.save', JSON.stringify({ tutorialDone: true, day: 4, money: 50, stock }));
  });
  await page.goto('/?seed=7');
  await tapNamed(page, SceneKeys.Preload, 'prompt-start');
  await waitForScene(page, SceneKeys.Lobby);
  await waitForScene(page, SceneKeys.Errand);
  await findNamed(page, SceneKeys.Errand, 'errand-total');
  await shot(page, 'errand-1-offer');
  await tapNamed(page, SceneKeys.Errand, 'btn-errand-yes');
  await waitForScene(page, SceneKeys.Errand, false);
  const after = await page.evaluate(() => {
    const s = (window as unknown as { __session: { cash: number; stockOf(id: string): number; outOfMaterials: boolean } }).__session;
    return { cash: s.cash, flour: s.stockOf('rice-flour'), out: s.outOfMaterials };
  });
  expect(after.flour).toBeGreaterThan(0);
  expect(after.out).toBe(false);
  expect(after.cash).toBeLessThan(50);
});
