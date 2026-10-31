import { expect, test, type Page } from '@playwright/test';
import { SceneKeys } from '../../src/scenes/sceneKeys';
import { advance, boundsNamed, dragNamedOnto, drawPath, pauseClock, seedTutorialDone, shot, tapNamed, toPage, isVisibleNamed, waitForScene, openDay } from './helpers';

interface SessionView {
  rack: unknown[];
  shelf: { layers: { kind: string; glazeId: string; coverage: number }[] }[];
  trashed: number;
  glazeWork: { hasGlaze: boolean } | null;
  fryer: { flipAll(): void; balance: { secondsPerSide: number; topFactorFloating: number } };
}
const S = (page: Page) => ({
  rack: () => page.evaluate(() => (window as unknown as { __session: SessionView }).__session.rack.length),
  shelf: () => page.evaluate(() => (window as unknown as { __session: SessionView }).__session.shelf.length),
  trashed: () => page.evaluate(() => (window as unknown as { __session: SessionView }).__session.trashed),
  working: () => page.evaluate(() => !!(window as unknown as { __session: SessionView }).__session.glazeWork),
  shelfLayers: (i: number) =>
    page.evaluate((k) => (window as unknown as { __session: SessionView }).__session.shelf[k]!.layers.map((l) => ({ kind: l.kind, glazeId: l.glazeId, coverage: l.coverage })), i),
});

/** Fry n good donuts onto the rack, then go to the Glaze station. */
async function rackThenGlaze(page: Page, n: number): Promise<void> {
  await seedTutorialDone(page);
  await page.goto('/?seed=7');
  await tapNamed(page, SceneKeys.Preload, 'prompt-start');
  await waitForScene(page, SceneKeys.Lobby);
  await openDay(page); // dough made and the window open (helpers)
  await pauseClock(page);
  await tapNamed(page, SceneKeys.Hud, 'tab-Fry');
  await waitForScene(page, SceneKeys.Fry);
  await advance(page, 12_000);
  const b = await page.evaluate(() => (window as unknown as { __session: SessionView }).__session.fryer.balance);
  for (let i = 0; i < n; i++) await tapNamed(page, SceneKeys.Fry, 'btn-drop');
  await advance(page, b.secondsPerSide * 1000);
  await page.evaluate(() => (window as unknown as { __session: SessionView }).__session.fryer.flipAll());
  await advance(page, b.secondsPerSide * (1 - b.topFactorFloating) * 1000);
  await tapNamed(page, SceneKeys.Fry, 'btn-pull-all');
  await tapNamed(page, SceneKeys.Hud, 'tab-Glaze');
  await waitForScene(page, SceneKeys.Glaze);
}

/** Board geometry in game coordinates. */
async function board(page: Page) {
  const d = await boundsNamed(page, SceneKeys.Glaze, 'glaze-donut');
  return { cx: d.x + d.w / 2, cy: d.y + d.h / 2, half: d.w / 2 };
}

async function pourRing(page: Page): Promise<void> {
  const { cx, cy, half } = await board(page);
  for (const r of [0.5, 0.65, 0.8]) {
    await drawPath(page, Array.from({ length: 21 }, (_, k) => ({ x: cx + Math.cos((k / 20) * Math.PI * 2) * r * half, y: cy + Math.sin((k / 20) * Math.PI * 2) * r * half })));
  }
  await page.waitForTimeout(400); // let the last drops land
}

async function zigzag(page: Page): Promise<void> {
  const { cx, cy, half } = await board(page);
  await drawPath(page, Array.from({ length: 9 }, (_, k) => ({ x: cx + (k % 2 ? 0.8 : -0.8) * half, y: cy + (-0.75 + (1.5 * k) / 8) * half })));
  await page.waitForTimeout(400);
}

test('glaze from the tray: pour with the tilted cup, drizzle, done → shelf; redo trashes', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const s = S(page);
  await rackThenGlaze(page, 3);
  await shot(page, 'glaze-1-tray');

  // Strawberry: glaze, then a white icing drizzle.
  await tapNamed(page, SceneKeys.Glaze, 'glaze-tray-0');
  await expect.poll(s.working).toBe(true);
  await tapNamed(page, SceneKeys.Glaze, 'cup-strawberry');
  // Guides come from the supply store: none yet, so none showing.
  await page.waitForTimeout(200);
  expect(await isVisibleNamed(page, SceneKeys.Glaze, 'glaze-guide-base')).toBe(false);
  await page.evaluate(() => {
    const w = window as unknown as { __save: { data: { guides: string[] } }; __session: { events: { emit(e: string, d?: unknown): void } } };
    w.__save.data.guides.push('base', 'strawberry');
    w.__session.events.emit('changed');
  });
  await expect.poll(() => isVisibleNamed(page, SceneKeys.Glaze, 'glaze-guide-base')).toBe(true); // dashed loops to pour along
  // Hold mid-pour for a screenshot of the tilted cup and falling glaze.
  const { cx, cy, half } = await board(page);
  const a = await toPage(page, cx - 0.5 * half, cy - 0.4 * half);
  const b = await toPage(page, cx + 0.3 * half, cy - 0.6 * half);
  await page.mouse.move(a.px, a.py);
  await page.mouse.down();
  await page.mouse.move(b.px, b.py, { steps: 4 });
  await shot(page, 'glaze-2-pouring');
  await page.mouse.up();
  await pourRing(page);
  await tapNamed(page, SceneKeys.Glaze, 'cup-white-icing');
  await expect.poll(() => isVisibleNamed(page, SceneKeys.Glaze, 'glaze-guide-drizzle')).toBe(true); // dashed stripes
  await zigzag(page);
  await shot(page, 'glaze-3-drizzled');
  await tapNamed(page, SceneKeys.Glaze, 'btn-glaze-done');
  await expect.poll(s.shelf).toBe(1);
  const layers = await s.shelfLayers(0);
  expect(layers.map((l) => [l.kind, l.glazeId])).toEqual([
    ['base', 'strawberry'],
    ['drizzle', 'white-icing'],
  ]);
  expect(layers[0]!.coverage).toBeGreaterThan(0.8);

  // Cookies & cream, dragged from the rack onto the board this time: just the glaze,
  // with a slip off the edge that stays on the tray when the donut leaves.
  await dragNamedOnto(page, SceneKeys.Glaze, 'glaze-tray-0', 'glaze-board');
  await expect.poll(s.working).toBe(true);
  await tapNamed(page, SceneKeys.Glaze, 'cup-cookies-and-cream');
  await pourRing(page);
  {
    const g = await board(page);
    await drawPath(page, [
      { x: g.cx + 0.98 * g.half, y: g.cy - 0.9 * g.half },
      { x: g.cx + 1.12 * g.half, y: g.cy },
      { x: g.cx + 0.98 * g.half, y: g.cy + 0.9 * g.half },
    ]);
    await page.waitForTimeout(400);
  }
  await shot(page, 'glaze-4-cookies-and-cream');
  await tapNamed(page, SceneKeys.Glaze, 'btn-glaze-done');
  await expect.poll(s.shelf).toBe(2);

  // Redo = throw this donut away.
  await tapNamed(page, SceneKeys.Glaze, 'glaze-tray-0');
  await tapNamed(page, SceneKeys.Glaze, 'btn-glaze-redo');
  await expect.poll(s.trashed).toBe(1);
  expect(await s.rack()).toBe(0);
  expect(await s.working()).toBe(false);
  await page.waitForTimeout(500);
  await shot(page, 'glaze-5-shelf');

  // One shelf donut can be dragged into the trash on its own.
  await dragNamedOnto(page, SceneKeys.Glaze, 'glaze-shelf-1', 'glaze-trash');
  await expect.poll(s.shelf).toBe(1);

  expect(errors).toEqual([]);
});
