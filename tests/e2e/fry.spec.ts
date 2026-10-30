import { expect, test, type Page } from '@playwright/test';
import { SceneKeys } from '../../src/scenes/sceneKeys';
import { advance, dragFromNamed, pauseClock, findNamed, holdNamed, seedTutorialDone, shot, tapNamed, waitForScene } from './helpers';

interface FryerView {
  temp: number;
  target: number;
  grateHeld: boolean;
  batch: { count: number; down: number[]; up: number[]; flips: number } | null;
}

const fryer = (page: Page) =>
  page.evaluate(() => {
    const f = (window as unknown as { __session: { fryer: FryerView } }).__session.fryer;
    return { temp: f.temp, target: f.target, grateHeld: f.grateHeld, batch: f.batch && { ...f.batch } };
  });

test('fry an order: heat, drop, flip, grate, dial, pull, then serve it', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await seedTutorialDone(page);
  await page.goto('/?seed=7');
  await tapNamed(page, SceneKeys.Preload, 'prompt-start');
  await waitForScene(page, SceneKeys.Lobby);
  await tapNamed(page, SceneKeys.Lobby, 'customer-front');
  await waitForScene(page, SceneKeys.Order);
  await tapNamed(page, SceneKeys.Order, 'btn-take-order');
  await findNamed(page, SceneKeys.Lobby, 'waiting-1');

  await tapNamed(page, SceneKeys.Hud, 'tab-Fry');
  await waitForScene(page, SceneKeys.Fry);
  // From here the test drives time, so slow screenshots can't burn the donuts.
  await pauseClock(page);
  await shot(page, 'fry-1-ready');

  // Let the oil come up to temperature, then drop the donuts.
  await advance(page, 8000);
  expect((await fryer(page)).temp).toBeGreaterThan(340);
  await tapNamed(page, SceneKeys.Fry, 'btn-fry-primary');
  await expect.poll(async () => (await fryer(page)).batch?.count ?? 0).toBeGreaterThan(0);

  // Watch the depositor drop them in, then cook the underside, flip, cook the other side.
  await page.waitForTimeout(250);
  await shot(page, 'fry-1b-dropping');
  const side = await page.evaluate(() => (window as unknown as { __session: { fryer: { balance: { secondsPerSide: number; topFactorFloating: number } } } }).__session.fryer.balance);
  await advance(page, side.secondsPerSide * 1000);
  await shot(page, 'fry-2-cooking');
  await tapNamed(page, SceneKeys.Fry, 'btn-flip');
  await expect.poll(async () => (await fryer(page)).batch?.flips).toBe(1);

  // Holding the grate presses the donuts under; letting go releases it.
  const release = await holdNamed(page, SceneKeys.Fry, 'btn-grate');
  await expect.poll(async () => (await fryer(page)).grateHeld).toBe(true);
  await shot(page, 'fry-3-grate-held');
  await release();
  await expect.poll(async () => (await fryer(page)).grateHeld).toBe(false);

  // The floating top already cooked a little, so the second side needs a bit less time.
  await advance(page, side.secondsPerSide * (1 - side.topFactorFloating) * 1000 - 300);

  // Turning the dial to the right raises the target temperature.
  const before = (await fryer(page)).target;
  await dragFromNamed(page, SceneKeys.Fry, 'fry-dial', 110, 0);
  await expect.poll(async () => (await fryer(page)).target).toBeGreaterThan(before);

  // Pull: score shows on the station, the ticket is marked fried.
  await tapNamed(page, SceneKeys.Fry, 'btn-fry-primary');
  await findNamed(page, SceneKeys.Fry, 'fry-result');
  await shot(page, 'fry-4-result');
  const score = await page.evaluate(
    () => (window as unknown as { __session: { ticket(n: number): { results: { fry?: { score: number } } } } }).__session.ticket(1).results.fry?.score,
  );
  expect(score).toBeGreaterThanOrEqual(70);
  await findNamed(page, SceneKeys.Hud, 'ticket-1-fried');

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
  await shot(page, 'fry-5-served');

  expect(errors).toEqual([]);
});

test('prep a batch before any order, then give it to an order from the rack', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const rackSize = () => page.evaluate(() => (window as unknown as { __session: { rack: unknown[] } }).__session.rack.length);

  await seedTutorialDone(page);
  await page.goto('/?seed=7');
  await tapNamed(page, SceneKeys.Preload, 'prompt-start');
  await waitForScene(page, SceneKeys.Lobby);
  await pauseClock(page); // no customers until we say so

  // No order yet: Drop becomes a prep batch.
  await tapNamed(page, SceneKeys.Hud, 'tab-Fry');
  await waitForScene(page, SceneKeys.Fry);
  await advance(page, 8000);
  await tapNamed(page, SceneKeys.Fry, 'btn-fry-primary');
  await expect.poll(async () => (await fryer(page)).batch?.count).toBe(3);
  await advance(page, 9000);
  await tapNamed(page, SceneKeys.Fry, 'btn-flip');
  await advance(page, 8000);
  await tapNamed(page, SceneKeys.Fry, 'btn-fry-primary');
  await expect.poll(rackSize).toBe(3);
  await page.waitForTimeout(700); // donuts fly to the rack
  await shot(page, 'fry-6-rack');

  // A customer orders; their ticket takes donuts from the rack instead of frying fresh.
  await tapNamed(page, SceneKeys.Hud, 'tab-Lobby');
  await advance(page, 2000);
  await tapNamed(page, SceneKeys.Lobby, 'customer-front');
  await waitForScene(page, SceneKeys.Order);
  await tapNamed(page, SceneKeys.Order, 'btn-take-order');
  await findNamed(page, SceneKeys.Lobby, 'waiting-1');
  const need = await page.evaluate(() => (window as unknown as { __session: { ticket(n: number): { order: { flavors: string[] } } } }).__session.ticket(1).order.flavors.length);

  await tapNamed(page, SceneKeys.Hud, 'tab-Fry');
  await waitForScene(page, SceneKeys.Fry);
  await shot(page, 'fry-7-use-rack');
  await tapNamed(page, SceneKeys.Fry, 'btn-use-rack');
  await findNamed(page, SceneKeys.Hud, 'ticket-1-fried');
  expect(await rackSize()).toBe(3 - need);

  expect(errors).toEqual([]);
});
