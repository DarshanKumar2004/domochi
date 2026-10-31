import { expect, test, type Page } from '@playwright/test';
import { SceneKeys } from '../../src/scenes/sceneKeys';
import { advance, findNamed, pauseClock, seedTutorialDone, shot, tapNamed, waitForScene } from './helpers';

interface SessionView {
  day: number;
  customersToday: number;
  servedCount: number;
  line: { id: number; state: string }[];
  activeTicket?: { no: number };
  takeOrder(id: number): { no: number };
  finishOrdering(id: number): void;
  serveActiveTicket(): unknown;
  dropDonut(): number;
  pullAll(): number[];
  startGlazing(i: number): { pour(g: string, a: number, b: number, c: number, d: number): boolean } | null;
  finishGlazing(): unknown;
  boxDonut(i: number): number;
}
const S = (page: Page) => <T>(fn: (s: SessionView) => T) => page.evaluate(`(${fn.toString()})(window.__session)`) as Promise<T>;

/** Wait for the next customer, take their order and box one quick strawberry. */
async function orderAndPack(page: Page): Promise<void> {
  const s = S(page);
  for (let k = 0; k < 120 && !(await s((x) => x.line.some((c) => c.state === 'inLine'))); k++) await advance(page, 1000);
  await s((x) => {
    const front = x.line[0]!;
    x.takeOrder(front.id);
    x.finishOrdering(front.id);
    x.dropDonut();
    x.pullAll();
    x.startGlazing(0)!.pour('strawberry', -0.6, -0.3, 0.6, -0.3);
    x.finishGlazing();
    x.boxDonut(0);
    return 0;
  });
}

test('a whole day: serve everyone, see the summary, bank the money and start day 2', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const s = S(page);

  await seedTutorialDone(page);
  await page.goto('/?seed=7');
  await tapNamed(page, SceneKeys.Preload, 'prompt-start');
  await waitForScene(page, SceneKeys.Lobby);
  await pauseClock(page);
  const total = await s((x) => x.customersToday);

  // Everyone but the last customer is served straight through the session.
  for (let i = 0; i < total - 1; i++) {
    await orderAndPack(page);
    await s((x) => x.serveActiveTicket());
    await advance(page, 8000); // the next customer comes a little after a serve
  }

  // The last one through the Box station: the result card shows the order score and tip.
  await orderAndPack(page);
  await tapNamed(page, SceneKeys.Hud, 'tab-Box');
  await waitForScene(page, SceneKeys.Box);
  await tapNamed(page, SceneKeys.Box, 'btn-serve');
  await waitForScene(page, SceneKeys.Serve);
  await findNamed(page, SceneKeys.Serve, 'serve-total');
  await findNamed(page, SceneKeys.Serve, 'serve-tip');
  await shot(page, 'day-1-serve-card');
  await tapNamed(page, SceneKeys.Serve, 'btn-serve-done');

  // That was the last customer: the day summary.
  await waitForScene(page, SceneKeys.DaySummary);
  await findNamed(page, SceneKeys.DaySummary, 'summary-total');
  await shot(page, 'day-2-summary');
  const unlocks = await page.evaluate(() => {
    const sc = (window as unknown as { __game: { scene: { getScene(k: string): { children: { list: { name?: string; list?: { name?: string; text?: string }[] }[] } } } } }).__game.scene.getScene('DaySummaryScene');
    const card = sc.children.list.find((o) => o.name === 'day-summary')!;
    return card.list!.find((o) => o.name === 'summary-unlocks')!.text;
  });
  expect(unlocks).toContain('chocolate hazelnut'); // unlocks on day 2

  await tapNamed(page, SceneKeys.DaySummary, 'btn-next-day');
  await waitForScene(page, SceneKeys.DaySummary, false);
  await waitForScene(page, SceneKeys.Lobby);
  await waitForScene(page, SceneKeys.Hud);
  expect(await s((x) => x.day)).toBe(2);
  expect(await s((x) => x.servedCount)).toBe(0);
  const saved = JSON.parse((await page.evaluate(() => localStorage.getItem('domochi.save'))) ?? '{}');
  expect(saved.day).toBe(2);
  expect(saved.money).toBeGreaterThan(0);
  expect(saved.served).toBe(total);
  await shot(page, 'day-3-day-two');

  // Reloading keeps you on day 2.
  await page.reload();
  await tapNamed(page, SceneKeys.Preload, 'prompt-start');
  await waitForScene(page, SceneKeys.Lobby);
  expect(await s((x) => x.day)).toBe(2);
  expect(errors).toEqual([]);
});
