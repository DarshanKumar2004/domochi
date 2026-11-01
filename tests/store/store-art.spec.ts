import { test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { SceneKeys } from '../../src/scenes/sceneKeys';
import { advance, boundsNamed, drawPath, openDay, pauseClock, seedStockedDay, tapNamed, waitForScene } from '../e2e/helpers';

// Screenshots for the Google Play listing, written to store/.
// Pop-up notes (a new sticker, the weather) would cover the game: tuck them away first.
const out = async (page: Page, name: string) => {
  await page.evaluate(() => {
    const g = (window as unknown as { __game: { scene: { getScene(k: string): { children?: { list: { name?: string; setVisible?(v: boolean): void }[] } } | null } } }).__game;
    const hud = g.scene.getScene('HudScene') as unknown as { toastQueue?: unknown[]; children?: { list: { name?: string; setVisible?(v: boolean): void }[] } } | null;
    if (hud?.toastQueue) hud.toastQueue.length = 0;
    hud?.children?.list.find((o) => o.name === 'hud-toast')?.setVisible?.(false);
  });
  await page.waitForTimeout(250); // let the game draw a frame without them
  await page.screenshot({ path: `store/screenshot-${test.info().project.name}-${name}.png` });
};

test('store screenshots', async ({ page }) => {
  await seedStockedDay(page, 24); // a sunny day, with every flavour from the first month
  await page.addInitScript(() => {
    const s = JSON.parse(localStorage.getItem('domochi.save') ?? '{}');
    if (s.money === undefined) localStorage.setItem('domochi.save', JSON.stringify({ ...s, money: 86.5 }));
  });
  await page.goto('/?seed=11');
  await waitForScene(page, SceneKeys.Preload);
  await page.waitForTimeout(1500);
  await out(page, '1-home');
  await tapNamed(page, SceneKeys.Preload, 'prompt-start');
  await waitForScene(page, SceneKeys.Lobby);
  await pauseClock(page);
  await openDay(page);
  await advance(page, 75_000); // a line forms
  await page.waitForTimeout(1500);
  await out(page, '2-lobby');

  // The fryer: a few rings bubbling away.
  await tapNamed(page, SceneKeys.Hud, 'tab-Fry');
  await waitForScene(page, SceneKeys.Fry);
  for (let i = 0; i < 4; i++) await tapNamed(page, SceneKeys.Fry, 'btn-drop');
  await advance(page, 9000);
  await page.waitForTimeout(800);
  await out(page, '3-fry');

  // Glazing: a strawberry ring half poured.
  await page.evaluate(() => {
    const s = (window as unknown as { __session: { fryer: { flipAll(): void }; pullAll(): number[]; startGlazing(i: number): { pour(g: string, a: number, b: number, c: number, d: number): boolean } | null } }).__session;
    s.fryer.flipAll();
  });
  await advance(page, 9000);
  await tapNamed(page, SceneKeys.Fry, 'btn-pull-all');
  await tapNamed(page, SceneKeys.Hud, 'tab-Glaze');
  await waitForScene(page, SceneKeys.Glaze);
  await tapNamed(page, SceneKeys.Glaze, 'glaze-tray-0');
  await tapNamed(page, SceneKeys.Glaze, 'cup-strawberry');
  const d = await boundsNamed(page, SceneKeys.Glaze, 'glaze-donut');
  const cx = d.x + d.w / 2;
  const cy = d.y + d.h / 2;
  const half = d.w / 2;
  for (const r of [0.5, 0.65, 0.8]) await drawPath(page, Array.from({ length: 15 }, (_, k) => ({ x: cx + Math.cos((k / 20) * Math.PI * 2) * r * half, y: cy + Math.sin((k / 20) * Math.PI * 2) * r * half })));
  await page.waitForTimeout(1000);
  await out(page, '4-glaze');

  // A great day's summary.
  await page.evaluate(() => {
    const w = window as unknown as { __session: { summary(): object }; __game: { scene: { start(k: string): void } } };
    const real = w.__session.summary.bind(w.__session);
    w.__session.summary = () => ({
      ...real(),
      served: 14,
      averageScore: 94,
      bestScore: 99,
      tiers: { great: 11, good: 3, okay: 0, bad: 0 },
      gifts: 2,
      sales: 96,
      tips: 21.5,
      wasted: 1,
      wasteCost: 0.48,
      suppliesCost: 18.4,
      profit: 102.1,
      goal: 'serve 11 orders',
      goalBonus: 3,
      bestStreak: 9,
    });
    w.__game.scene.start('DaySummaryScene');
  });
  await waitForScene(page, SceneKeys.DaySummary);
  await page.waitForTimeout(2000);
  await out(page, '5-summary');
});

test('feature graphic and icon', async ({ page }) => {
  test.skip(test.info().project.name !== 'landscape');
  const logo = 'data:image/png;base64,' + readFileSync('public/assets/logo.png').toString('base64');
  const lobby = 'data:image/png;base64,' + readFileSync('store/screenshot-landscape-2-lobby.png').toString('base64');
  await page.setViewportSize({ width: 1024, height: 500 });
  await page.setContent(`<!doctype html><html><body style="margin:0">
    <div style="width:1024px;height:500px;background:#fffaf0;display:flex;align-items:center;gap:28px;padding:0 34px;box-sizing:border-box;font-family:system-ui,sans-serif;color:#1f1a17">
      <div style="flex:0 0 330px;text-align:center">
        <img src="${logo}" style="width:300px">
        <div style="font-size:30px;font-weight:700;margin-top:8px">the mochi donut game</div>
        <div style="font-size:20px;color:#6b5d52;margin-top:4px">fry · glaze · top · serve</div>
      </div>
      <img src="${lobby}" style="flex:1;min-width:0;border:6px solid #1f1a17;border-radius:24px;box-shadow:0 8px 0 rgba(0,0,0,.2)">
    </div></body></html>`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'store/feature-graphic.png' });
});
