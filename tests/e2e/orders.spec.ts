import { expect, test, type Page } from '@playwright/test';
import { SceneKeys } from '../../src/scenes/sceneKeys';
import { advance, findNamed, seedTutorialDone, shot, tapGame, tapNamed, toPage, waitForScene } from './helpers';

type SessionView = { servedCount: number; customer(id: number): { state: string }; ticket(n: number): { customerId: number; status: string } };
const served = (page: Page) => page.evaluate(() => (window as unknown as { __session: SessionView }).__session.servedCount);
const ticketStatus = (page: Page, n: number) => page.evaluate((k) => (window as unknown as { __session: SessionView }).__session.ticket(k).status, n);

async function takeFrontOrder(page: Page, expectTicket: number): Promise<void> {
  await tapNamed(page, SceneKeys.Lobby, 'customer-front');
  await waitForScene(page, SceneKeys.Order);
  await tapNamed(page, SceneKeys.Order, 'btn-take-order');
  await waitForScene(page, SceneKeys.Order, false);
  await findNamed(page, SceneKeys.Lobby, `waiting-${expectTicket}`);
}

async function twoOrders(page: Page): Promise<void> {
  await seedTutorialDone(page);
  await page.goto('/?seed=7');
  await tapNamed(page, SceneKeys.Preload, 'prompt-start');
  await waitForScene(page, SceneKeys.Lobby);
  await takeFrontOrder(page, 1);
  await advance(page, 20_000); // next customer arrives
  await takeFrontOrder(page, 2);
}

test('closing the box serves the selected ticket’s customer automatically', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await twoOrders(page);
  await shot(page, 'orders-two-waiting');

  // Select #2 on the rail and serve it: customer #2 gets their box without any tapping.
  await tapNamed(page, SceneKeys.Hud, 'ticket-2');
  await tapNamed(page, SceneKeys.Hud, 'tab-Box');
  await waitForScene(page, SceneKeys.Box);
  await tapNamed(page, SceneKeys.Box, 'btn-serve');
  await waitForScene(page, SceneKeys.Serve);
  expect(await ticketStatus(page, 2)).toBe('served');
  expect(await ticketStatus(page, 1)).toBe('open');
  await shot(page, 'orders-served-2');
  await tapNamed(page, SceneKeys.Serve, 'btn-serve-done');
  await waitForScene(page, SceneKeys.Serve, false);

  // #1 is selected next and serves the same way.
  await tapNamed(page, SceneKeys.Hud, 'tab-Box');
  await tapNamed(page, SceneKeys.Box, 'btn-serve');
  await waitForScene(page, SceneKeys.Serve);
  expect(await served(page)).toBe(2);

  expect(errors).toEqual([]);
});

test('double-tap a ticket on the rail to see it big with each recipe', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await twoOrders(page);

  // Two quick taps on the same spot (position worked out once, so the taps are as close as a finger's).
  const t = await findNamed(page, SceneKeys.Hud, 'ticket-1');
  const p = await toPage(page, t.x, t.y);
  if (test.info().project.use.hasTouch) {
    // Raw touch events: Playwright's emulated tap is slower than a real finger's double-tap.
    // 120 ms apart, like a quick real double-tap (several frames, so the rebuilt rail is tappable).
    const cdp = await page.context().newCDPSession(page);
    for (let i = 0; i < 2; i++) {
      if (i) await page.waitForTimeout(120);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.px, y: p.py }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    await cdp.detach();
  } else {
    await page.mouse.click(p.px, p.py);
    await page.mouse.click(p.px, p.py);
  }
  await waitForScene(page, SceneKeys.TicketView);
  await findNamed(page, SceneKeys.TicketView, 'ticket-view');
  await shot(page, 'orders-ticket-view');

  // Tap anywhere to close.
  await tapGame(page, 40, 40);
  await waitForScene(page, SceneKeys.TicketView, false);
  expect(errors).toEqual([]);
});
