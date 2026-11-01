import { expect, test, type Page } from '@playwright/test';
import balanceJson from '../../src/data/balance.json' with { type: 'json' };
import { SceneKeys } from '../../src/scenes/sceneKeys';
import { advance, boundsNamed, drawPath, findNamed, isVisibleNamed, openDay, pauseClock, seedTutorialDone, shot, tapNamed, toPage, waitForScene, stirDough } from './helpers';

interface SessionView {
  phase: string;
  dough: number;
  oilDirt: number;
  line: { id: number; state: string }[];
  pickups: unknown[];
  cleanup: { glazeTray: boolean; toppingsTray: boolean; oil: boolean; bowl: boolean };
  inviteWasAccepted: boolean;
  messOn(t: string): number;
  addMess(t: string, n: number): void;
  takeOrder(id: number): unknown;
  finishOrdering(id: number): void;
  serveActiveTicket(): unknown;
  dropDonut(): number;
  pullAll(): number[];
  trashRack(): number;
  summary(): { tidy: boolean | null; tidyBonus: number };
}
const S = (page: Page) => <T>(fn: (s: SessionView) => T) => page.evaluate(`(${fn.toString()})(window.__session)`) as Promise<T>;

async function start(page: Page, save: object): Promise<void> {
  await page.addInitScript((s) => {
    if (!localStorage.getItem('domochi.save')) localStorage.setItem('domochi.save', JSON.stringify(s));
  }, save);
  await page.goto('/?seed=7');
  await tapNamed(page, SceneKeys.Preload, 'prompt-start');
  await waitForScene(page, SceneKeys.Lobby);
  await pauseClock(page);
}

/** Stir: circles round the bowl until the dough is smooth. */
async function stir(page: Page): Promise<void> {
  const b = await boundsNamed(page, SceneKeys.Dough, 'dough-stir');
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const r = Math.min(b.w, b.h) * 0.3;
  const pts = await Promise.all(Array.from({ length: 17 }, (_, k) => toPage(page, cx + Math.cos((k / 16) * Math.PI * 2) * r, cy + Math.sin((k / 16) * Math.PI * 2) * r * 0.5)));
  await page.mouse.move(pts[0]!.px, pts[0]!.py);
  await page.mouse.down();
  for (let turn = 0; turn < balanceJson.dough.stirTurns + 1; turn++) {
    for (const p of pts.slice(1)) {
      await page.mouse.move(p.px, p.py);
      await page.waitForTimeout(20);
    }
  }
  await page.mouse.up();
}

test('a full day: make the dough, open the window, then clean up and close for the tidy bonus', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const s = S(page);
  await start(page, { tutorialDone: true, day: 1 });

  // Morning: closed, no dough, nobody comes.
  expect(await s((x) => x.phase)).toBe('prep');
  await advance(page, 30_000);
  expect(await s((x) => x.line.length)).toBe(0);

  // Dough station: scoop the recipe, stir it smooth, tip it in the tub.
  await tapNamed(page, SceneKeys.Hud, 'tab-Dough');
  await waitForScene(page, SceneKeys.Dough);
  await shot(page, 'dough-1-empty');
  for (const [id, n] of Object.entries(balanceJson.dough.recipe)) for (let i = 0; i < n; i++) await tapNamed(page, SceneKeys.Dough, `bin-${id}`);
  await page.waitForTimeout(400);
  await shot(page, 'dough-2-scooped');
  await stir(page);
  await shot(page, 'dough-3-stirred');
  await tapNamed(page, SceneKeys.Dough, 'btn-dough-done');
  await expect.poll(() => s((x) => x.dough)).toBe(balanceJson.dough.batchSize);

  // Open the window: a customer comes.
  await tapNamed(page, SceneKeys.Hud, 'tab-Lobby');
  await waitForScene(page, SceneKeys.Lobby);
  await tapNamed(page, SceneKeys.Lobby, 'btn-open');
  expect(await s((x) => x.phase)).toBe('open');
  await advance(page, 3000);
  await findNamed(page, SceneKeys.Lobby, 'customer-front');

  // Make a mess (fry, spill on both trays), then serve everyone: closing time.
  await s((x) => {
    x.dropDonut();
    x.pullAll();
    x.trashRack();
    x.addMess('glaze', 20);
    x.addMess('toppings', 20);
    return 0;
  });
  // Serve the first customer, then let the clock run out: the line goes home, and it's closing time.
  await s((x) => {
    const front = x.line.find((c) => c.state === 'inLine')!;
    x.takeOrder(front.id);
    x.finishOrdering(front.id);
    x.serveActiveTicket();
    return 0;
  });
  await advance(page, balanceJson.day.lengthSec * 1000, 250);
  expect(await s((x) => x.phase)).toBe('closing');
  await findNamed(page, SceneKeys.Lobby, 'btn-close-up');
  await shot(page, 'close-1-checklist');

  // Wipe both trays with the sponge, and filter the oil.
  for (const [tab, scene, zone, tray] of [
    ['Glaze', SceneKeys.Glaze, 'glaze-board', 'glaze'],
    ['Toppings', SceneKeys.Toppings, 'toppings-board', 'toppings'],
  ] as const) {
    await tapNamed(page, SceneKeys.Hud, `tab-${tab}`);
    await waitForScene(page, scene);
    const b = await boundsNamed(page, scene, zone);
    for (let k = 0; k < 6 && (await s(new Function('x', `return x.messOn('${tray}')`) as (x: SessionView) => number)) > 0; k++) {
      await drawPath(page, [
        { x: b.x + b.w * 0.2, y: b.y + b.h * (0.2 + k * 0.1) },
        { x: b.x + b.w * 0.8, y: b.y + b.h * (0.25 + k * 0.1) },
        { x: b.x + b.w * 0.2, y: b.y + b.h * (0.3 + k * 0.1) },
        { x: b.x + b.w * 0.8, y: b.y + b.h * (0.35 + k * 0.1) },
      ]);
    }
    expect(await s(new Function('x', `return x.messOn('${tray}')`) as (x: SessionView) => number)).toBe(0);
  }
  await tapNamed(page, SceneKeys.Hud, 'tab-Fry');
  await waitForScene(page, SceneKeys.Fry);
  await tapNamed(page, SceneKeys.Fry, 'btn-filter-oil');
  await expect.poll(() => s((x) => x.oilDirt)).toBe(0);
  // And wash the dough bowl: scrub round the empty bowl.
  await tapNamed(page, SceneKeys.Hud, 'tab-Dough');
  await waitForScene(page, SceneKeys.Dough);
  await stirDough(page);
  expect(await s((x) => x.cleanup)).toEqual({ glazeTray: true, toppingsTray: true, oil: true, bowl: true });

  await tapNamed(page, SceneKeys.Hud, 'tab-Lobby');
  await waitForScene(page, SceneKeys.Lobby);
  await tapNamed(page, SceneKeys.Lobby, 'btn-close-up');
  await waitForScene(page, SceneKeys.DaySummary);
  await findNamed(page, SceneKeys.DaySummary, 'summary-cleanup');
  expect(await s((x) => x.summary().tidy)).toBe(true);
  await shot(page, 'close-2-summary');
  expect(errors).toEqual([]);
});

test('day 2 has morning pickups on the rail; a pop-up day has the booth; invites can be accepted', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const s = S(page);

  // Day 2: pickups listed with their countdown, and "to go" tickets on the rail.
  await start(page, { tutorialDone: true, day: 2 });
  expect(await s((x) => x.pickups.length)).toBe(balanceJson.deliveries.byDay[1]);
  await findNamed(page, SceneKeys.Lobby, 'lobby-pickups');
  await shot(page, 'pickups-1-lobby');

  // An invite (forced here; in play it comes by chance after a happy order).
  await page.evaluate(() => {
    (window as unknown as { __session: { inviteId: string } }).__session.inviteId = 'birthday';
    (window as unknown as { __game: { scene: { start(k: string): void } } }).__game.scene.start('InviteScene');
  });
  await waitForScene(page, SceneKeys.Invite);
  await findNamed(page, SceneKeys.Invite, 'invite-card');
  await shot(page, 'invite-1-card');
  await tapNamed(page, SceneKeys.Invite, 'btn-invite-accept');
  await waitForScene(page, SceneKeys.Invite, false);
  expect(await s((x) => x.inviteWasAccepted)).toBe(true);

  // A booked pop-up day: the booth instead of the trailer, no pickups.
  // (Seeded as the new page loads: leaving the old one saves its day in progress.)
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded-popup')) {
      sessionStorage.setItem('seeded-popup', '1');
      localStorage.setItem('domochi.save', JSON.stringify({ tutorialDone: true, day: 3, event: { id: 'tailgate', day: 3 } }));
    }
  });
  await page.reload();
  await tapNamed(page, SceneKeys.Preload, 'prompt-start');
  await waitForScene(page, SceneKeys.Lobby);
  expect(await isVisibleNamed(page, SceneKeys.Lobby, 'popup-booth')).toBe(true);
  await shot(page, 'popup-1-downtown');
  expect(await s((x) => x.pickups.length)).toBe(0);
  await shot(page, 'popup-1-booth');
  expect(errors).toEqual([]);
});

test('a reload mid-day picks the day back up (clock, phase, orders)', async ({ page }) => {
  test.setTimeout(90_000);
  type V = { phase: string; timeLeftMs: number; openTickets: { no: number }[] };
  const s = <T>(fn: (x: V) => T) => page.evaluate(`(${fn.toString()})(window.__session)`) as Promise<T>;
  await seedTutorialDone(page);
  await page.goto('/?seed=7');
  await tapNamed(page, SceneKeys.Preload, 'prompt-start');
  await waitForScene(page, SceneKeys.Lobby);
  await pauseClock(page);
  await openDay(page);
  await advance(page, 40_000);
  const left = await s((x) => x.timeLeftMs);
  const tickets = await s((x) => x.openTickets.length);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.waitForTimeout(300);
  await page.reload();
  await tapNamed(page, SceneKeys.Preload, 'prompt-start');
  await waitForScene(page, SceneKeys.Lobby);
  expect(await s((x) => x.phase)).toBe('open');
  expect(await s((x) => x.timeLeftMs)).toBeLessThanOrEqual(left);
  expect(await s((x) => x.timeLeftMs)).toBeGreaterThan(left - 15_000);
  expect(await s((x) => x.openTickets.length)).toBe(tickets);
});
