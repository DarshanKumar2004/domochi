import { expect, test, type Page } from '@playwright/test';
import { SceneKeys } from '../../src/scenes/sceneKeys';
import { advance, boundsNamed, dragNamedOnto, findNamed, pauseClock, seedTutorialDone, shot, tapNamed, toPage, isVisibleNamed, waitForScene } from './helpers';

type Donut = { id: number };
interface SessionView {
  shelf: Donut[];
  box: (Donut | undefined)[];
  boxCount: number;
  boxSize: number;
  toppingWork: { countOn(id: string): number; pieces: unknown[] } | null;
  flavorOf(d: Donut): string | null;
  ticket(no: number): { status: string; order: { flavors: string[] }; results: { box?: { score: number; gifts: number }; toppings?: { score: number }; score?: { gifts: number; giftTip: number } } } | undefined;
}
const session = (page: Page) => <T>(fn: (s: SessionView) => T) =>
  page.evaluate(`(${fn.toString()})(window.__session)`) as Promise<T>;

/** Where on the shelf a donut of this flavour is (-1 if none). */
function shelfIndexOf(page: Page, flavorId: string): Promise<number> {
  return page.evaluate((id) => {
    const x = (window as unknown as { __session: SessionView }).__session;
    return x.shelf.findIndex((d) => x.flavorOf(d) === id);
  }, flavorId);
}

/**
 * Glaze donuts for these recipes straight through the session (frying and
 * glazing by hand are covered by fry.spec and glaze.spec).
 */
async function makeGlazed(page: Page, recipes: { glaze: string; drizzle?: string }[]): Promise<void> {
  await page.evaluate((list) => {
    type W = { pour(g: string, a: number, b: number, c: number, d: number): boolean };
    const s = (window as unknown as { __session: { dropDonut(): number; pullAll(): number[]; startGlazing(i: number): W | null; finishGlazing(): unknown } }).__session;
    for (const r of list) {
      s.dropDonut();
      s.pullAll();
      const w = s.startGlazing(0)!;
      for (const rad of [0.5, 0.65, 0.8]) {
        for (let k = 0; k < 48; k++) {
          const a0 = (k / 48) * Math.PI * 2;
          const a1 = ((k + 1) / 48) * Math.PI * 2;
          w.pour(r.glaze, Math.cos(a0) * rad, Math.sin(a0) * rad, Math.cos(a1) * rad, Math.sin(a1) * rad);
        }
      }
      if (r.drizzle) for (const y of [-0.6, 0, 0.6]) w.pour(r.drizzle, -Math.sqrt(0.64 - y * y), y, Math.sqrt(0.64 - y * y), y);
      s.finishGlazing();
    }
  }, recipes);
}

/**
 * Shake the selected jar round (and round) the ring until about `target` pieces
 * are on, like a player watching the donut. A fixed path would give a different
 * amount on a slow test machine.
 */
async function shakeRing(page: Page, target = 40): Promise<void> {
  const d = await boundsNamed(page, SceneKeys.Toppings, 'toppings-donut');
  const cx = d.x + d.w / 2;
  const cy = d.y + d.h / 2;
  const r = 0.65 * (d.w / 2);
  const pts = await Promise.all(
    Array.from({ length: 41 }, (_, k) => toPage(page, cx + Math.cos((k / 40) * Math.PI * 2) * r, cy + Math.sin((k / 40) * Math.PI * 2) * r)),
  );
  await page.mouse.move(pts[0]!.px, pts[0]!.py);
  await page.mouse.down();
  const count = () => page.evaluate(() => (window as unknown as { __session: SessionView }).__session.toppingWork!.pieces.length);
  for (let k = 1; k < pts.length * 3; k++) {
    const p = pts[k % pts.length]!;
    await page.mouse.move(p.px, p.py);
    if (k % 4 === 0 && (await count()) >= target - 4) break;
  }
  await page.mouse.up();
  await page.waitForTimeout(500); // let the last pieces land
}

test('toppings by hand, then pack the box in the ticket order and close the lid', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const s = session(page);

  await seedTutorialDone(page);
  await page.goto('/?seed=7');
  await tapNamed(page, SceneKeys.Preload, 'prompt-start');
  await waitForScene(page, SceneKeys.Lobby);
  await pauseClock(page);
  await advance(page, 2000);
  await tapNamed(page, SceneKeys.Lobby, 'customer-front');
  await waitForScene(page, SceneKeys.Order);
  await tapNamed(page, SceneKeys.Order, 'btn-take-order');
  await waitForScene(page, SceneKeys.Order, false);
  const flavors = await s((x) => x.ticket(1)!.order.flavors);

  // Glaze one donut per ordered flavour, plus a cookies & cream to top by hand.
  const recipes: Record<string, { glaze: string; drizzle?: string }> = {
    strawberry: { glaze: 'strawberry', drizzle: 'white-icing' },
    'cookies-and-cream': { glaze: 'cookies-and-cream' },
  };
  const needCookies = flavors.filter((f) => f === 'cookies-and-cream').length;
  await makeGlazed(page, [...flavors.map((f) => recipes[f]!), ...(needCookies ? [] : [recipes['cookies-and-cream']!])]);

  // Toppings: every plain cookies & cream gets its crumbs, shaken on by hand.
  await tapNamed(page, SceneKeys.Hud, 'tab-Toppings');
  await waitForScene(page, SceneKeys.Toppings);
  await shot(page, 'toppings-1-shelf');
  for (let n = 0; n < Math.max(1, needCookies); n++) {
    // The plain ones are glazed cookies & cream that don't match a flavour yet.
    const idx = await s((x) => x.shelf.findIndex((d) => x.flavorOf(d) === null));
    expect(idx).toBeGreaterThanOrEqual(0);
    // Tap it onto the board the first time, drag it there after that.
    if (n === 0) await tapNamed(page, SceneKeys.Toppings, `toppings-shelf-${idx}`);
    else await dragNamedOnto(page, SceneKeys.Toppings, `toppings-shelf-${idx}`, 'toppings-board');
    await expect.poll(() => s((x) => !!x.toppingWork)).toBe(true);
    await tapNamed(page, SceneKeys.Toppings, 'jar-crushed-cookies');
    await expect.poll(() => isVisibleNamed(page, SceneKeys.Toppings, 'toppings-guide-ring')).toBe(true); // where to shake
    await shakeRing(page);
    const on = await s((x) => x.toppingWork!.countOn('crushed-cookies'));
    expect(on).toBeGreaterThanOrEqual(20);
    if (n === 0) await shot(page, 'toppings-2-shaken');
    await tapNamed(page, SceneKeys.Toppings, 'btn-toppings-done');
    await expect.poll(() => s((x) => !!x.toppingWork)).toBe(false);
  }
  expect(await s((x) => x.shelf.filter((d) => x.flavorOf(d) === 'cookies-and-cream').length)).toBe(Math.max(1, needCookies));

  // Box: tap shelf donuts in the ticket's order. Tapping a boxed one takes it back out.
  await tapNamed(page, SceneKeys.Hud, 'tab-Box');
  await waitForScene(page, SceneKeys.Box);
  await shot(page, 'box-1-empty');
  for (let i = 0; i < flavors.length; i++) {
    const idx = await shelfIndexOf(page, flavors[i]!);
    await tapNamed(page, SceneKeys.Box, `box-shelf-${idx}`);
    await expect.poll(() => s((x) => x.boxCount)).toBe(i + 1);
  }
  await findNamed(page, SceneKeys.Box, 'box-slot-0');
  await tapNamed(page, SceneKeys.Box, 'box-slot-0');
  await expect.poll(() => s((x) => x.boxCount)).toBe(flavors.length - 1);
  // Put it back in slot 1 (the first free one).
  const back = await shelfIndexOf(page, flavors[0]!);
  await tapNamed(page, SceneKeys.Box, `box-shelf-${back}`);
  await expect.poll(() => s((x) => x.boxCount)).toBe(flavors.length);
  await shot(page, 'box-2-packed');

  // A bigger box leaves room for a gift: an extra strawberry, on the house.
  await tapNamed(page, SceneKeys.Box, 'box-size-flight');
  await expect.poll(() => s((x) => x.boxSize)).toBe(6);
  await makeGlazed(page, [recipes.strawberry!]);
  await tapNamed(page, SceneKeys.Box, `box-shelf-${await shelfIndexOf(page, 'strawberry')}`);
  await expect.poll(() => s((x) => x.boxCount)).toBe(flavors.length + 1);
  await shot(page, 'box-2b-gift');

  await tapNamed(page, SceneKeys.Box, 'btn-serve');
  await page.waitForTimeout(150);
  await shot(page, 'box-3-lid');
  await waitForScene(page, SceneKeys.Serve);
  const r = await s((x) => x.ticket(1)!);
  expect(r.status).toBe('served');
  expect(r.results.box!.score).toBe(100);
  expect(r.results.toppings!.score).toBeGreaterThan(50);
  expect(r.results.box!.gifts).toBe(1);
  expect(r.results.score!.giftTip).toBeGreaterThan(0);
  await shot(page, 'box-4-served');

  expect(errors).toEqual([]);
});
