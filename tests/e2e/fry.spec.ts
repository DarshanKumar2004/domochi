import { expect, test, type Page } from '@playwright/test';
import { SceneKeys } from '../../src/scenes/sceneKeys';
import { advance, dragFromNamed, findNamed, holdNamed, pauseClock, seedTutorialDone, shot, tapNamed, waitForScene } from './helpers';

interface SlotView {
  down: number;
  up: number;
  flips: number;
}
interface FryerView {
  temp: number;
  target: number;
  grateHeld: boolean;
  slots: (SlotView | null)[];
  balance: { secondsPerSide: number; topFactorFloating: number; burntAt: number };
}
type SessionView = {
  fryer: FryerView;
  rack: unknown[];
  trashed: number;
  ticket(n: number): { order: { flavors: string[] }; results: { fry?: { score: number } } };
};

const fryer = (page: Page) =>
  page.evaluate(() => {
    const f = (window as unknown as { __session: SessionView }).__session.fryer;
    return { temp: f.temp, target: f.target, grateHeld: f.grateHeld, slots: f.slots.map((d) => d && { ...d }), balance: f.balance };
  });
const rackSize = (page: Page) => page.evaluate(() => (window as unknown as { __session: SessionView }).__session.rack.length);
const trashed = (page: Page) => page.evaluate(() => (window as unknown as { __session: SessionView }).__session.trashed);

async function startAtFryer(page: Page): Promise<void> {
  await seedTutorialDone(page);
  await page.goto('/?seed=7');
  await tapNamed(page, SceneKeys.Preload, 'prompt-start');
  await waitForScene(page, SceneKeys.Lobby);
  await pauseClock(page); // the test drives time, so slow screenshots can't burn anything
  await tapNamed(page, SceneKeys.Hud, 'tab-Fry');
  await waitForScene(page, SceneKeys.Fry);
  await advance(page, 8000); // let the oil heat up
}

/** Drag a donut in the vat to a named target's centre (plus an x offset). */
async function dragDonutTo(page: Page, slot: number, targetName: string, offsetX = 0): Promise<void> {
  const donut = await findNamed(page, SceneKeys.Fry, `fry-donut-${slot}`);
  const target = await findNamed(page, SceneKeys.Fry, targetName);
  await dragFromNamed(page, SceneKeys.Fry, `fry-donut-${slot}`, target.x + offsetX - donut.x, target.y - donut.y);
}

test('fry one at a time: drop, flip individually, grate, dial, rack, then an order uses them', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await startAtFryer(page);
  const b = (await fryer(page)).balance;

  // Two drops = two donuts, in slots 0 and 1.
  await tapNamed(page, SceneKeys.Fry, 'btn-drop');
  await page.waitForTimeout(300);
  await shot(page, 'fry-1-dropping');
  await tapNamed(page, SceneKeys.Fry, 'btn-drop');
  await expect.poll(async () => (await fryer(page)).slots.filter(Boolean).length).toBe(2);

  // Cook the undersides, then flip just donut 0, then donut 1.
  await advance(page, b.secondsPerSide * 1000);
  await page.waitForTimeout(700); // let the drop animation settle so the donuts are in place
  await tapNamed(page, SceneKeys.Fry, 'fry-donut-0');
  await expect.poll(async () => (await fryer(page)).slots[0]?.flips).toBe(1);
  expect((await fryer(page)).slots[1]?.flips).toBe(0);
  await tapNamed(page, SceneKeys.Fry, 'fry-donut-1');
  await expect.poll(async () => (await fryer(page)).slots[1]?.flips).toBe(1);
  await shot(page, 'fry-2-flipped');

  // Holding the grate presses them under; letting go releases it.
  const release = await holdNamed(page, SceneKeys.Fry, 'btn-grate');
  await expect.poll(async () => (await fryer(page)).grateHeld).toBe(true);
  await release();
  await expect.poll(async () => (await fryer(page)).grateHeld).toBe(false);

  // Turning the dial to the right raises the setting.
  const before = (await fryer(page)).target;
  await dragFromNamed(page, SceneKeys.Fry, 'fry-dial', 110, 0);
  await expect.poll(async () => (await fryer(page)).target).toBeGreaterThan(before);

  // Second sides cook; drag donut 0 onto the rack, then "Pull all" the rest.
  await advance(page, b.secondsPerSide * (1 - b.topFactorFloating) * 1000 - 300);
  await dragDonutTo(page, 0, 'fry-rack', 150);
  await expect.poll(() => rackSize(page)).toBe(1);
  await tapNamed(page, SceneKeys.Fry, 'btn-pull-all');
  await expect.poll(() => rackSize(page)).toBe(2);
  await page.waitForTimeout(600);
  await shot(page, 'fry-3-rack');

  // A customer orders (1–2 donuts on day 1) and their ticket uses the rack.
  await tapNamed(page, SceneKeys.Hud, 'tab-Lobby');
  await advance(page, 2000);
  await tapNamed(page, SceneKeys.Lobby, 'customer-front');
  await waitForScene(page, SceneKeys.Order);
  await tapNamed(page, SceneKeys.Order, 'btn-take-order');
  await findNamed(page, SceneKeys.Lobby, 'waiting-1');
  await tapNamed(page, SceneKeys.Hud, 'tab-Fry');
  await shot(page, 'fry-4-use-rack');
  await tapNamed(page, SceneKeys.Fry, 'btn-use-rack');
  await findNamed(page, SceneKeys.Hud, 'ticket-1-fried');
  const score = await page.evaluate(() => (window as unknown as { __session: SessionView }).__session.ticket(1).results.fry?.score);
  expect(score).toBeGreaterThanOrEqual(70);

  // Serve it: the result card shows the same fry score.
  await tapNamed(page, SceneKeys.Hud, 'tab-Box');
  await tapNamed(page, SceneKeys.Box, 'btn-serve');
  await waitForScene(page, SceneKeys.Lobby);
  await tapNamed(page, SceneKeys.Lobby, 'waiting-1');
  await waitForScene(page, SceneKeys.Serve);
  const shown = await page.evaluate(() => {
    const g = (window as unknown as { __game: { scene: { getScene(k: string): { children: { list: { list?: { name: string; text?: string }[] }[] } } } } }).__game;
    for (const o of g.scene.getScene('ServeScene').children.list) for (const c of o.list ?? []) if (c.name === 'serve-fry') return c.text;
    return null;
  });
  expect(shown).toBe(String(score));

  expect(errors).toEqual([]);
});

test('trash a donut by dragging it to the bin; a forgotten donut burns and is thrown out', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await startAtFryer(page);
  const b = (await fryer(page)).balance;

  await tapNamed(page, SceneKeys.Fry, 'btn-drop');
  await page.waitForTimeout(700);
  await dragDonutTo(page, 0, 'fry-trash');
  await expect.poll(() => trashed(page)).toBe(1);
  expect((await fryer(page)).slots[0]).toBeNull();

  // Drop another and walk away from it.
  await tapNamed(page, SceneKeys.Fry, 'btn-drop');
  await advance(page, (b.secondsPerSide * b.burntAt + 4) * 1000);
  await expect.poll(() => trashed(page)).toBe(2);
  expect((await fryer(page)).slots[0]).toBeNull();
  await page.waitForTimeout(250);
  await shot(page, 'fry-5-burnt');

  expect(errors).toEqual([]);
});
