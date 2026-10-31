import { expect, test, type Page } from '@playwright/test';
import balanceJson from '../../src/data/balance.json' with { type: 'json' };
import { SceneKeys } from '../../src/scenes/sceneKeys';
import { advance, findNamed, isVisibleNamed, pauseClock, seedTutorialDone, shot, tapNamed, waitForScene, openDay } from './helpers';

interface SessionView {
  day: number;
  customersToday: number;
  servedCount: number;
  timeUp: boolean;
  phase: string;
  stockOf(id: string): number;
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

test('a whole day: serve until the clock runs out, close, see the summary, shop for supplies and start day 2', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const s = S(page);

  await seedTutorialDone(page);
  await page.goto('/?seed=7');
  await tapNamed(page, SceneKeys.Preload, 'prompt-start');
  await waitForScene(page, SceneKeys.Lobby);
  await pauseClock(page);
  await openDay(page); // dough made and the window open (helpers)

  // Two customers: the first served straight through the session...
  await orderAndPack(page);
  await s((x) => x.serveActiveTicket());
  await advance(page, 8000); // the next customer comes a little after a serve
  // ...the second's order taken, then the clock runs out: the window closes, the line goes home.
  await orderAndPack(page);
  expect(await s((x) => x.timeUp)).toBe(false);
  await advance(page, balanceJson.day.lengthSec * 1000, 250);
  expect(await s((x) => x.timeUp)).toBe(true);
  expect(await s((x) => x.phase)).toBe('open'); // one order still to finish
  await findNamed(page, SceneKeys.Lobby, 'btn-send-home');
  await shot(page, 'day-0-time-up');
  const total = 2;

  // The last one through the Box station: the result card shows the order score and tip.
  await tapNamed(page, SceneKeys.Hud, 'tab-Box');
  await waitForScene(page, SceneKeys.Box);
  await tapNamed(page, SceneKeys.Box, 'btn-serve');
  await waitForScene(page, SceneKeys.Serve);
  await findNamed(page, SceneKeys.Serve, 'serve-total');
  await findNamed(page, SceneKeys.Serve, 'serve-tip');
  await shot(page, 'day-1-serve-card');
  // Share the donut: no share sheet in a desktop test browser, so the picture downloads.
  const btn = await page.evaluate(() => {
    const sc = (window as unknown as { __game: { scene: { getScene(k: string): { children: { list: { list?: { name?: string }[] }[] } } } } }).__game.scene.getScene('ServeScene');
    return sc.children.list.some((o) => o.list?.some((x) => x.name === 'btn-share'));
  });
  if (btn) {
    const download = page.waitForEvent('download', { timeout: 10_000 }).catch(() => null);
    await tapNamed(page, SceneKeys.Serve, 'btn-share');
    const file = await download;
    if (file) expect(file.suggestedFilename()).toBe('my-domochi-donut.png');
  }
  await tapNamed(page, SceneKeys.Serve, 'btn-serve-done');

  // That was the last customer: closing time. Close up (skipping the clean-up), then the day summary.
  await waitForScene(page, SceneKeys.Serve, false);
  await findNamed(page, SceneKeys.Lobby, 'lobby-checklist');
  await shot(page, 'day-1b-closing');
  await tapNamed(page, SceneKeys.Lobby, 'btn-close-up');
  await waitForScene(page, SceneKeys.DaySummary);
  await findNamed(page, SceneKeys.DaySummary, 'summary-total');
  await shot(page, 'day-2-summary');
  const unlocks = await page.evaluate(() => {
    const sc = (window as unknown as { __game: { scene: { getScene(k: string): { children: { list: { name?: string; list?: { name?: string; text?: string }[] }[] } } } } }).__game.scene.getScene('DaySummaryScene');
    const card = sc.children.list.find((o) => o.name === 'day-summary')!;
    return card.list!.find((o) => o.name === 'summary-unlocks')!.text;
  });
  expect(unlocks).toContain('same menu tomorrow'); // chocolate hazelnut waits for day 4

  // On to the supply store: buy a pack of eggs (with a little cash slipped in to be sure there's enough).
  await page.evaluate(() => ((window as unknown as { __save: { data: { money: number } } }).__save.data.money += 20));
  await tapNamed(page, SceneKeys.DaySummary, 'btn-next-day');
  await waitForScene(page, SceneKeys.DaySummary, false);
  await waitForScene(page, SceneKeys.Store);
  const before = JSON.parse((await page.evaluate(() => localStorage.getItem('domochi.save'))) ?? '{}');
  await shot(page, 'day-2b-store');
  await tapNamed(page, SceneKeys.Store, 'store-egg');
  const egg = balanceJson.supplies.items.find((i) => i.id === 'egg')!;
  await expect.poll(async () => JSON.parse((await page.evaluate(() => localStorage.getItem('domochi.save'))) ?? '{}').stock?.egg).toBe(before.stock.egg + egg.pack);
  const after = JSON.parse((await page.evaluate(() => localStorage.getItem('domochi.save'))) ?? '{}');
  expect(after.money).toBeLessThan(before.money);
  await tapNamed(page, SceneKeys.Store, 'btn-store-done');
  await waitForScene(page, SceneKeys.Store, false);
  await waitForScene(page, SceneKeys.Lobby);
  await waitForScene(page, SceneKeys.Hud);
  expect(await s((x) => x.day)).toBe(2);
  expect(await s((x) => x.servedCount)).toBe(0);
  const saved = JSON.parse((await page.evaluate(() => localStorage.getItem('domochi.save'))) ?? '{}');
  expect(saved.day).toBe(2);
  expect(saved.money).toBeCloseTo(after.money, 2);
  expect(saved.served).toBe(total);
  // Day 2 starts with what was left of yesterday's stock, plus what was bought.
  expect(await s((x) => x.stockOf('egg'))).toBe(after.stock.egg);
  await shot(page, 'day-3-day-two');

  // mochi's journal: day 1's page is written, with the "opening day" sticker.
  expect(saved.journal.pages.map((p: { day: number }) => p.day)).toEqual([1]);
  expect(saved.journal.stickers).toContain('first-day');
  await tapNamed(page, SceneKeys.Lobby, 'btn-journal');
  await waitForScene(page, SceneKeys.Journal);
  await findNamed(page, SceneKeys.Journal, 'journal-sticker-count'); // new stickers: it opens on the sticker book
  await shot(page, 'day-4-journal-stickers');
  await tapNamed(page, SceneKeys.Journal, 'journal-tab-pages');
  await findNamed(page, SceneKeys.Journal, 'journal-note');
  await page.waitForTimeout(300);
  await shot(page, 'day-5-journal-page');
  await tapNamed(page, SceneKeys.Journal, 'btn-journal-close');
  await waitForScene(page, SceneKeys.Journal, false);

  // One of Ethan's friends drops by: their message stays until it's tapped.
  await page.evaluate(() =>
    (window as unknown as { __session: { events: { emit(e: string, d: unknown): void } } }).__session.events.emit('friend', {
      name: 'Maya',
      line: "hey! Ethan said you're low on eggs. here's 4!",
      itemId: 'egg',
      qty: 4,
    }),
  );
  await findNamed(page, SceneKeys.Lobby, 'friend-bubble');
  await page.waitForTimeout(4000);
  await shot(page, 'day-6-friend');
  await findNamed(page, SceneKeys.Lobby, 'friend-bubble'); // still there
  await tapNamed(page, SceneKeys.Lobby, 'friend-bubble');
  await expect.poll(() => isVisibleNamed(page, SceneKeys.Lobby, 'friend-bubble')).toBe(false);

  // Reloading keeps you on day 2.
  await page.reload();
  await tapNamed(page, SceneKeys.Preload, 'prompt-start');
  await waitForScene(page, SceneKeys.Lobby);
  expect(await s((x) => x.day)).toBe(2);
  expect(errors).toEqual([]);
});
