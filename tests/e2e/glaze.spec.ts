import { expect, test, type Page } from '@playwright/test';
import { SceneKeys } from '../../src/scenes/sceneKeys';
import { advance, boundsNamed, dragNamedOnto, drawPath, pauseClock, seedStockedDay, shot, tapNamed, toPage, isVisibleNamed, waitForScene, openDay } from './helpers';

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
  await seedStockedDay(page); // every glaze out (strawberry, cookies & cream)
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

test('pouring on an empty tray spot splatters the tray (the ring area too: no donut is there)', async ({ page }) => {
  test.setTimeout(120_000);
  await rackThenGlaze(page, 1);
  // One donut on the first spot; the second spot stays empty.
  await tapNamed(page, SceneKeys.Glaze, 'glaze-tray-0');
  await tapNamed(page, SceneKeys.Glaze, 'cup-strawberry');
  type Board = { x: number; y: number; size: number; messKey: string };
  const spot = await page.evaluate(() => {
    const sc = (window as unknown as { __game: { scene: { getScene(k: string): { boards: Board[] } } } }).__game.scene.getScene('GlazeScene');
    const b = sc.boards[1]!;
    return { x: b.x, y: b.y, half: b.size / 2, key: b.messKey };
  });
  const mess = () => page.evaluate(() => (window as unknown as { __session: { messOn(t: string): number } }).__session.messOn('glaze'));
  const before = await mess();
  // Pour round the empty spot's ring, where a donut would sit.
  await drawPath(page, Array.from({ length: 21 }, (_, k) => ({ x: spot.x + Math.cos((k / 20) * Math.PI * 2) * 0.62 * spot.half, y: spot.y + Math.sin((k / 20) * Math.PI * 2) * 0.62 * spot.half })));
  await page.waitForTimeout(500);
  expect(await mess()).toBeGreaterThan(before);
  // The mess canvas has glaze right on the ring (it isn't cut out as if a donut were there).
  const alpha = await page.evaluate((key) => {
    const tex = (window as unknown as { __game: { textures: { get(k: string): { getSourceImage(): HTMLCanvasElement } } } }).__game.textures.get(key);
    const c = tex.getSourceImage();
    const ctx = c.getContext('2d')!;
    let hits = 0;
    const s = c.width;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      // Ring radius 0.62 of the donut, inside the padded mess canvas (pad 0.15 each side).
      const px = Math.round(s / 2 + (Math.cos(a) * 0.62 * s) / 2 / 1.3);
      const py = Math.round(s / 2 + (Math.sin(a) * 0.62 * s) / 2 / 1.3);
      if (ctx.getImageData(px, py, 1, 1).data[3]! > 0) hits++;
    }
    return hits;
  }, spot.key);
  expect(alpha).toBeGreaterThan(8);
  // And the donut on the first spot is untouched.
  const working = await page.evaluate(() => (window as unknown as { __session: { glazeBoards: ({ hasGlaze: boolean } | null)[] } }).__session.glazeBoards[0]!.hasGlaze);
  expect(working).toBe(false);
  await shot(page, 'glaze-6-empty-spot-splat');
});

test('scrubbing the tray mid-day (donut on it) leaves everything tappable', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
  await rackThenGlaze(page, 1);
  await tapNamed(page, SceneKeys.Glaze, 'glaze-tray-0');
  await page.evaluate(() => (window as unknown as { __session: { addMess(t: string, n: number): void } }).__session.addMess('glaze', 20));
  const z = await boundsNamed(page, SceneKeys.Glaze, 'glaze-board');
  for (let k = 0; k < 6; k++) {
    await drawPath(page, [
      { x: z.x + z.w * 0.03, y: z.y + z.h * 0.1 },
      { x: z.x + z.w * 0.97, y: z.y + z.h * 0.05 },
      { x: z.x + z.w * 0.03, y: z.y + z.h * 0.95 },
      { x: z.x + z.w * 0.97, y: z.y + z.h * 0.9 },
    ]);
  }
  await page.waitForTimeout(300);
  await tapNamed(page, SceneKeys.Glaze, 'cup-strawberry');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __game: { scene: { getScene(k: string): { selectedCup: string | null } } } }).__game.scene.getScene('GlazeScene').selectedCup)).toBe('strawberry');
  await tapNamed(page, SceneKeys.Hud, 'tab-Fry');
  await waitForScene(page, SceneKeys.Fry);
  expect(errors).toEqual([]);
});
