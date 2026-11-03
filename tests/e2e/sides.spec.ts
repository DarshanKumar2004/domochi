import { expect, test, type Page } from '@playwright/test';
import balanceJson from '../../src/data/balance.json' with { type: 'json' };
import { SceneKeys } from '../../src/scenes/sceneKeys';
import { advance, boundsNamed, dragNamedOnto, holdNamed, openDay, pauseClock, seedStockedDay, shot, tapGame, tapNamed, waitForScene } from './helpers';

// Kolaches (Bake station) and onigiri (Rice station), played through the UI.

interface Side {
  filling: string | null;
  fill: number;
  shape: number;
  wash: number;
  proof: number;
  baked: number;
  rice: number;
  presses: number[];
  nori: number | null;
}
interface SessionView {
  bakery: { pan: (Side | null)[]; rack: Side[]; inOven: boolean; temp: number };
  riceStation: { cooker: string; portions: number; board: Side | null; tray: Side[] };
  activeTicket?: { no: number; sidePacks?: { kolache?: unknown[]; onigiri?: unknown[] } };
  sidesToPack: string[];
  selectTicket(no: number): boolean;
  openTickets: { no: number }[];
}
const view = <T>(page: Page, fn: (s: SessionView) => T) => page.evaluate(`(${fn.toString()})(window.__session)`) as Promise<T>;

/** Day 60: every kolache and onigiri on the menu, everything stocked. One order with a kolache and an onigiri. */
async function start(page: Page): Promise<void> {
  await seedStockedDay(page, 60);
  await page.goto('/?seed=11');
  await tapNamed(page, SceneKeys.Preload, 'prompt-start');
  await waitForScene(page, SceneKeys.Lobby);
  await openDay(page);
  await pauseClock(page);
  // A walk-up's order with one of each (through the session, so the test doesn't hang on chance).
  await page.evaluate(() => {
    type S = {
      tick(ms: number): void;
      line: { id: number }[];
      takeOrder(id: number): { order: { kolaches?: string[]; onigiri?: string[] } };
      finishOrdering(id: number): void;
    };
    const s = (window as unknown as { __session: S }).__session;
    for (let i = 0; i < 200 && !s.line.length; i++) s.tick(100);
    const c = s.line[0]!;
    const t = s.takeOrder(c.id);
    t.order.kolaches = ['jalapeno-cheddar-sausage-kolache'];
    t.order.onigiri = ['tuna-onigiri'];
    s.finishOrdering(c.id);
  });
}

test('bake a kolache and make an onigiri, pack both for the order', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);
  const no = await view(page, (s) => s.openTickets.at(-1)!.no);
  await view(page, (s) => s.selectTicket(s.openTickets.at(-1)!.no));

  // ---- Bake ----
  await tapNamed(page, SceneKeys.Hud, 'tab-Bake');
  await waitForScene(page, SceneKeys.Bake);
  await tapNamed(page, SceneKeys.Bake, 'bake-pan-0');
  await expect.poll(() => view(page, (s) => !!s.bakery.pan[0])).toBe(true);
  await tapNamed(page, SceneKeys.Bake, 'bake-filling-jalapeno-cheddar-sausage');
  await expect.poll(() => view(page, (s) => s.bakery.pan[0]?.filling)).toBe('jalapeno-cheddar-sausage');
  // Hold the spoon, then fold & pinch, about the right time each.
  for (const [name, perSec] of [['bake-spoon', balanceJson.bake.fill.perSec], ['bake-shape', balanceJson.bake.shape.perSec]] as const) {
    const release = await holdNamed(page, SceneKeys.Bake, name);
    await advance(page, (1 / perSec) * 1000);
    await release();
  }
  const k = await view(page, (s) => s.bakery.pan[0]!);
  expect(k.fill).toBeGreaterThan(0.85);
  expect(k.shape).toBeGreaterThan(0.85);
  // Egg wash: drag the brush across it twice.
  for (let i = 0; i < 2; i++) await dragNamedOnto(page, SceneKeys.Bake, 'bake-brush', 'bake-pan-0', i ? 40 : -40);
  await expect.poll(() => view(page, (s) => s.bakery.pan[0]!.wash)).toBeGreaterThan(0.2);
  await advance(page, (1 / balanceJson.bake.proof.perSec) * 1000 - 3000); // let it rise
  await shot(page, 'bake-1-ready-for-oven');
  await tapNamed(page, SceneKeys.Bake, 'btn-oven');
  await expect.poll(() => view(page, (s) => s.bakery.inOven)).toBe(true);
  await advance(page, 6000);
  await shot(page, 'bake-2-in-oven');
  // Bake to golden: watch it, like a player would.
  for (let i = 0; i < 60; i++) {
    if ((await view(page, (s) => s.bakery.pan.find(Boolean)?.baked ?? 0)) >= 0.97) break;
    await advance(page, 500);
  }
  await tapNamed(page, SceneKeys.Bake, 'btn-oven');
  await expect.poll(() => view(page, (s) => s.bakery.rack.length)).toBe(1);
  await tapNamed(page, SceneKeys.Bake, 'kolache-ready-0');
  await tapNamed(page, SceneKeys.Bake, 'btn-close-kolache');
  await expect.poll(() => view(page, (s) => !!s.activeTicket?.sidePacks?.kolache)).toBe(true);
  await shot(page, 'bake-3-packed');

  // ---- Rice ----
  await tapNamed(page, SceneKeys.Hud, 'tab-Rice');
  await waitForScene(page, SceneKeys.Rice);
  // Set the water to the rice line (tap the slider in the middle), then cook.
  await tapNamed(page, SceneKeys.Rice, 'rice-water');
  await tapNamed(page, SceneKeys.Rice, 'btn-cook-rice');
  await expect.poll(() => view(page, (s) => s.riceStation.cooker)).toBe('cooking');
  await shot(page, 'rice-1-cooking');
  await advance(page, balanceJson.rice.cooker.cookSec * 1000 + 500);
  await expect.poll(() => view(page, (s) => s.riceStation.cooker)).toBe('ready');
  const scoop = await holdNamed(page, SceneKeys.Rice, 'rice-scoop');
  await advance(page, (1 / balanceJson.rice.scoop.perSec) * 1000);
  await scoop();
  await expect.poll(() => view(page, (s) => s.riceStation.board?.rice ?? 0)).toBeGreaterThan(0.5);
  await tapNamed(page, SceneKeys.Rice, 'rice-filling-tuna');
  const board = await boundsNamed(page, SceneKeys.Rice, 'rice-board');
  await tapGame(page, board.x + board.w / 2, board.y + board.h / 2);
  await expect.poll(() => view(page, (s) => s.riceStation.board?.filling)).toBe('tuna');
  for (let i = 0; i < balanceJson.rice.press.count; i++) {
    const up = await holdNamed(page, SceneKeys.Rice, 'rice-press');
    await advance(page, 400);
    await up();
  }
  await expect.poll(() => view(page, (s) => s.riceStation.board?.presses.length)).toBe(balanceJson.rice.press.count);
  await dragNamedOnto(page, SceneKeys.Rice, 'rice-nori', 'rice-board');
  await expect.poll(() => view(page, (s) => s.riceStation.board?.nori)).not.toBeNull();
  await shot(page, 'rice-2-wrapped');
  await tapNamed(page, SceneKeys.Rice, 'btn-rice-done');
  await expect.poll(() => view(page, (s) => s.riceStation.tray.length)).toBe(1);
  await tapNamed(page, SceneKeys.Rice, 'onigiri-ready-0');
  await tapNamed(page, SceneKeys.Rice, 'btn-close-onigiri');
  await expect.poll(() => view(page, (s) => s.sidesToPack.length)).toBe(0);
  await shot(page, 'rice-3-packed');

  // The Box station knows they're packed; the ticket view lists them.
  await tapNamed(page, SceneKeys.Hud, 'tab-Box');
  await waitForScene(page, SceneKeys.Box);
  await shot(page, 'box-with-sides');
  expect(await view(page, (s) => s.activeTicket?.no)).toBe(no);
  expect(errors).toEqual([]);
});

test('the Bake and Rice tabs only show once kolaches and onigiri are on the menu', async ({ page }) => {
  await seedStockedDay(page, 3);
  await page.goto('/');
  await tapNamed(page, SceneKeys.Preload, 'prompt-start');
  await waitForScene(page, SceneKeys.Lobby);
  const tabs = await page.evaluate(() => {
    type O = { name?: string; list?: O[] };
    const g = (window as unknown as { __game: { scene: { getScene(k: string): { children: { list: O[] } } } } }).__game;
    const out: string[] = [];
    const stack = [...g.scene.getScene('HudScene').children.list];
    while (stack.length) {
      const o = stack.pop()!;
      if (o.name?.startsWith('tab-')) out.push(o.name);
      if (o.list) stack.push(...o.list);
    }
    return out;
  });
  expect(tabs).not.toContain('tab-Bake');
  expect(tabs).not.toContain('tab-Rice');
  expect(tabs).toContain('tab-Box');
});
