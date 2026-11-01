import { expect, test, type Page } from '@playwright/test';
import { SceneKeys } from '../../src/scenes/sceneKeys';
import balanceJson from '../../src/data/balance.json' with { type: 'json' };
import { stirDough, advance, boundsNamed, drawPath, isVisibleNamed, pauseClock, shot, tapNamed, toPage, waitForScene, holdNamed } from './helpers';

type Slot = { down: number; up: number; flips: number } | null;
interface SessionView {
  isTutorial: boolean;
  fryer: { slots: Slot[] };
  shelf: unknown[];
  boxCount: number;
  toppingWork: { pieces: unknown[] } | null;
  ticket(no: number): { status: string; order: { flavors: string[] } } | undefined;
}
const S = (page: Page) => <T>(fn: (s: SessionView) => T) => page.evaluate(`(${fn.toString()})(window.__session)`) as Promise<T>;

/** Ethan's current line. */
const line = (page: Page) =>
  page.evaluate(() => {
    type O = { name?: string; list?: O[]; text?: string };
    const g = (window as unknown as { __game: { scene: { getScene(k: string): { children: { list: O[] } } } } }).__game;
    const bubble = g.scene.getScene('TutorialScene').children.list.find((o) => o.name === 'tutorial-bubble')!;
    return bubble.list!.find((o) => typeof o.text === 'string')!.text!;
  });

/** Cook in small steps until slot 0 matches. */
async function cookUntil(page: Page, ok: (d: NonNullable<Slot>) => boolean): Promise<void> {
  const s = S(page);
  for (let k = 0; k < 300; k++) {
    const d = await s((x) => x.fryer.slots[0]);
    if (d && ok(d)) return;
    await advance(page, 100);
  }
  throw new Error('never got there');
}

test('the guided first order: mochi the donut walks you through every station', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const s = S(page);

  // First launch (no save): the tutorial runs over the real game.
  await page.goto('/?seed=7');
  await tapNamed(page, SceneKeys.Preload, 'prompt-start');
  await waitForScene(page, SceneKeys.Tutorial);
  await waitForScene(page, SceneKeys.Lobby);
  await pauseClock(page);
  expect(await s((x) => x.isTutorial)).toBe(true);
  expect(await line(page)).toContain("I'm mochi");
  expect(await isVisibleNamed(page, SceneKeys.Tutorial, 'tutorial-mascot')).toBe(true);
  for (let i = 0; i < 3; i++) await tapNamed(page, SceneKeys.Tutorial, 'btn-tutorial-next');

  // The scripted customer arrives; the hand points at them.
  await advance(page, 2500);
  await expect.poll(() => line(page)).toContain('tap them');
  await expect.poll(() => isVisibleNamed(page, SceneKeys.Tutorial, 'tutorial-hand')).toBe(true);
  await shot(page, 'tutorial-1-customer');
  await tapNamed(page, SceneKeys.Lobby, 'customer-front');
  await waitForScene(page, SceneKeys.Order);
  await expect.poll(() => line(page)).toContain('Take order');
  await tapNamed(page, SceneKeys.Order, 'btn-take-order');
  await waitForScene(page, SceneKeys.Order, false);
  expect(await s((x) => x.ticket(1)!.order.flavors)).toEqual(['cookies-and-cream']);

  // First the dough: mochi sends you to the Dough station and points at each ingredient in turn.
  await expect.poll(() => line(page)).toContain('Dough station');
  await shot(page, 'tutorial-2-go-to-dough');
  await tapNamed(page, SceneKeys.Hud, 'tab-Dough');
  await waitForScene(page, SceneKeys.Dough);
  await expect.poll(() => line(page)).toContain('scoop');
  await shot(page, 'tutorial-2b-scoop');
  for (const [id, n] of Object.entries(balanceJson.dough.recipe)) for (let i = 0; i < n; i++) await tapNamed(page, SceneKeys.Dough, `bin-${id}`);
  await expect.poll(() => line(page)).toContain('stir');
  await stirDough(page);
  await expect.poll(() => line(page)).toContain('Into the tub');
  await tapNamed(page, SceneKeys.Dough, 'btn-dough-done');

  // Now the fryer.
  await expect.poll(() => line(page)).toContain('Fry station');
  await tapNamed(page, SceneKeys.Hud, 'tab-Fry');
  await waitForScene(page, SceneKeys.Fry);
  await advance(page, 12_000); // the oil heats up
  // The oil's a little low: top it up first.
  await expect.poll(() => line(page)).toContain('+ oil');
  await shot(page, 'tutorial-3a-oil');
  await tapNamed(page, SceneKeys.Fry, 'btn-add-oil');
  await expect.poll(() => line(page)).toContain('Drop');
  await tapNamed(page, SceneKeys.Fry, 'btn-drop');
  // Mochi donuts float: hold the grate a moment.
  await expect.poll(() => line(page)).toContain('hold the grate');
  await shot(page, 'tutorial-3b-grate');
  const letGo = await holdNamed(page, SceneKeys.Fry, 'btn-grate');
  await page.waitForTimeout(1600);
  await letGo();
  await page.waitForTimeout(400);
  await expect.poll(() => line(page)).toContain('flip');
  await cookUntil(page, (d) => Math.abs(d.down - 1) <= 0.1);
  await tapNamed(page, SceneKeys.Fry, 'fry-donut-0');
  await expect.poll(() => line(page)).toContain('rack');
  await cookUntil(page, (d) => Math.abs(d.down - 1) <= 0.1 && d.up >= 0.9);
  await shot(page, 'tutorial-3-pull');
  await tapNamed(page, SceneKeys.Fry, 'btn-pull-all');

  // Glaze
  await expect.poll(() => line(page)).toContain('Glaze station');
  await tapNamed(page, SceneKeys.Hud, 'tab-Glaze');
  await waitForScene(page, SceneKeys.Glaze);
  await tapNamed(page, SceneKeys.Glaze, 'glaze-tray-0');
  await expect.poll(() => line(page)).toContain('tap that cup');
  await tapNamed(page, SceneKeys.Glaze, 'cup-cookies-and-cream');
  await expect.poll(() => line(page)).toContain('dashed loops');
  const d = await boundsNamed(page, SceneKeys.Glaze, 'glaze-donut');
  const [cx, cy, half] = [d.x + d.w / 2, d.y + d.h / 2, d.w / 2];
  for (const r of [0.5, 0.65, 0.8]) {
    await drawPath(page, Array.from({ length: 21 }, (_, k) => ({ x: cx + Math.cos((k / 20) * Math.PI * 2) * r * half, y: cy + Math.sin((k / 20) * Math.PI * 2) * r * half })));
  }
  await expect.poll(() => line(page)).toContain('Done');
  await tapNamed(page, SceneKeys.Glaze, 'btn-glaze-done');

  // Toppings: shake round the ring until Ethan's happy.
  await expect.poll(() => line(page)).toContain('Toppings station');
  await tapNamed(page, SceneKeys.Hud, 'tab-Toppings');
  await waitForScene(page, SceneKeys.Toppings);
  await tapNamed(page, SceneKeys.Toppings, 'toppings-shelf-0');
  await expect.poll(() => s((x) => !!x.toppingWork)).toBe(true);
  if ((await line(page)).includes('that jar')) await tapNamed(page, SceneKeys.Toppings, 'jar-crushed-cookies');
  await expect.poll(() => line(page)).toContain('shake');
  const b = await boundsNamed(page, SceneKeys.Toppings, 'toppings-donut');
  const pts = await Promise.all(
    Array.from({ length: 41 }, (_, k) => toPage(page, b.x + b.w / 2 + Math.cos((k / 40) * Math.PI * 2) * 0.65 * (b.w / 2), b.y + b.h / 2 + Math.sin((k / 40) * Math.PI * 2) * 0.65 * (b.w / 2))),
  );
  await page.mouse.move(pts[0]!.px, pts[0]!.py);
  await page.mouse.down();
  for (let k = 1; k < pts.length * 3; k++) {
    const p = pts[k % pts.length]!;
    await page.mouse.move(p.px, p.py);
    if (k % 4 === 0 && (await line(page)).includes('Done')) break;
  }
  await page.mouse.up();
  await expect.poll(() => line(page)).toContain('Done');
  await tapNamed(page, SceneKeys.Toppings, 'btn-toppings-done');

  // Box and serve
  await expect.poll(() => line(page)).toContain('Box station');
  await tapNamed(page, SceneKeys.Hud, 'tab-Box');
  await waitForScene(page, SceneKeys.Box);
  await tapNamed(page, SceneKeys.Box, 'box-shelf-0');
  await expect.poll(() => s((x) => x.boxCount)).toBe(1);
  await expect.poll(() => line(page)).toContain('close the lid');
  await tapNamed(page, SceneKeys.Box, 'btn-serve');
  await waitForScene(page, SceneKeys.Serve);
  await expect.poll(() => line(page)).toContain('every station gets a score');
  await shot(page, 'tutorial-4-card');
  await tapNamed(page, SceneKeys.Serve, 'btn-serve-done');
  await waitForScene(page, SceneKeys.Serve, false);
  expect(await isVisibleNamed(page, SceneKeys.DaySummary, 'day-summary').catch(() => false)).toBe(false);

  // Wrap-up, then the real day opens.
  await expect.poll(() => line(page)).toContain('you did it');
  await tapNamed(page, SceneKeys.Tutorial, 'btn-tutorial-next');
  await tapNamed(page, SceneKeys.Tutorial, 'btn-tutorial-next');
  await waitForScene(page, SceneKeys.Tutorial, false);
  await waitForScene(page, SceneKeys.Lobby);
  await expect.poll(() => s((x) => x.isTutorial)).toBe(false);
  const saved = JSON.parse((await page.evaluate(() => localStorage.getItem('domochi.save'))) ?? '{}');
  expect(saved.tutorialDone).toBe(true);
  expect(saved.day).toBe(1);
  expect(errors).toEqual([]);
});
