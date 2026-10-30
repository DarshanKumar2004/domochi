import { expect, test, type Page } from '@playwright/test';
import { SceneKeys } from '../../src/scenes/sceneKeys';
import { advance, boundsNamed, drawPath, findNamed, pauseClock, seedTutorialDone, shot, tapNamed, waitForScene } from './helpers';

interface JobView {
  done: boolean;
  step?: { kind: 'base' | 'drizzle'; glazeId: string; style: string; donutIndex: number };
  guides: { x0: number; y0: number; x1: number; y1: number }[];
}
type SessionView = {
  activeGlazeJob?: JobView;
  fryer: { balance: { secondsPerSide: number; topFactorFloating: number } };
  ticket(n: number): { results: { glaze?: { score: number } } };
};

const job = (page: Page) =>
  page.evaluate(() => {
    const j = (window as unknown as { __session: SessionView }).__session.activeGlazeJob;
    return j ? { done: j.done, step: j.step && { ...j.step }, guides: j.guides } : null;
  });

/** Fry two good donuts onto the rack, then take the first customer's order. */
async function friedOrderReady(page: Page): Promise<void> {
  await seedTutorialDone(page);
  await page.goto('/?seed=7');
  await tapNamed(page, SceneKeys.Preload, 'prompt-start');
  await waitForScene(page, SceneKeys.Lobby);
  await pauseClock(page);
  await tapNamed(page, SceneKeys.Hud, 'tab-Fry');
  await waitForScene(page, SceneKeys.Fry);
  await advance(page, 8000);
  const b = await page.evaluate(() => (window as unknown as { __session: SessionView }).__session.fryer.balance);
  await tapNamed(page, SceneKeys.Fry, 'btn-drop');
  await tapNamed(page, SceneKeys.Fry, 'btn-drop');
  await advance(page, b.secondsPerSide * 1000);
  await page.evaluate(() => (window as unknown as { __session: { fryer: { flipAll(): void } } }).__session.fryer.flipAll());
  await advance(page, b.secondsPerSide * (1 - b.topFactorFloating) * 1000);
  await tapNamed(page, SceneKeys.Fry, 'btn-pull-all');

  await tapNamed(page, SceneKeys.Hud, 'tab-Lobby');
  await advance(page, 2000);
  await tapNamed(page, SceneKeys.Lobby, 'customer-front');
  await waitForScene(page, SceneKeys.Order);
  await tapNamed(page, SceneKeys.Order, 'btn-take-order');
  await findNamed(page, SceneKeys.Lobby, 'waiting-1');
}

/** Pick the right glaze for each step and paint it like a careful player. */
async function glazeEverything(page: Page, shotPrefix = 'glaze-2'): Promise<void> {
  let n = 0;
  for (;;) {
    const j = await job(page);
    if (!j || j.done || !j.step) break;
    await tapNamed(page, SceneKeys.Glaze, `bowl-${j.step.glazeId}`);
    const d = await boundsNamed(page, SceneKeys.Glaze, 'glaze-donut');
    const cx = d.x + d.w / 2;
    const cy = d.y + d.h / 2;
    const half = d.w / 2;
    if (j.step.kind === 'drizzle') {
      // Trace each dashed guide.
      for (const g of j.guides) {
        const pts = Array.from({ length: 8 }, (_, k) => {
          const t = k / 7;
          return { x: cx + (g.x0 + (g.x1 - g.x0) * t) * half * 0.9, y: cy + (g.y0 + (g.y1 - g.y0) * t) * half * 0.9 };
        });
        await drawPath(page, pts);
      }
    } else {
      // Circle around the ring a few times, like a careful player.
      for (const r of [0.5, 0.64, 0.78]) {
        await drawPath(
          page,
          Array.from({ length: 21 }, (_, k) => ({ x: cx + Math.cos((k / 20) * Math.PI * 2) * r * half, y: cy + Math.sin((k / 20) * Math.PI * 2) * r * half })),
        );
      }
    }
    await shot(page, `${shotPrefix}-step-${++n}-${j.step.kind}`);
    await tapNamed(page, SceneKeys.Glaze, 'btn-glaze-done');
    await page.waitForTimeout(150);
  }
}

test('glaze an order: grab from the rack, pick each glaze, paint, drizzle along the guides', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await friedOrderReady(page);

  await tapNamed(page, SceneKeys.Hud, 'tab-Glaze');
  await waitForScene(page, SceneKeys.Glaze);
  await shot(page, 'glaze-1-not-fried');
  await tapNamed(page, SceneKeys.Glaze, 'btn-glaze-rack');
  await expect.poll(async () => (await job(page))?.step?.kind).toBe('base');

  await glazeEverything(page);

  const score = await page.evaluate(() => (window as unknown as { __session: SessionView }).__session.ticket(1).results.glaze?.score);
  expect(score).toBeGreaterThanOrEqual(70);
  await findNamed(page, SceneKeys.Hud, 'ticket-1-glazed');
  await shot(page, 'glaze-3-done');

  expect(errors).toEqual([]);
});

test('strawberry gets a white icing drizzle along the guides', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await friedOrderReady(page);
  // Make this order a single strawberry so the drizzle step is exercised.
  await page.evaluate(() => {
    const t = (window as unknown as { __session: { ticket(n: number): { order: { flavors: string[] } } } }).__session.ticket(1);
    t.order.flavors = ['strawberry'];
  });
  await tapNamed(page, SceneKeys.Hud, 'tab-Glaze');
  await waitForScene(page, SceneKeys.Glaze);
  await tapNamed(page, SceneKeys.Glaze, 'btn-glaze-rack');
  await glazeEverything(page, 'glaze-strawberry');
  const score = await page.evaluate(() => (window as unknown as { __session: SessionView }).__session.ticket(1).results.glaze?.score);
  expect(score).toBeGreaterThanOrEqual(70);
  expect(errors).toEqual([]);
});
