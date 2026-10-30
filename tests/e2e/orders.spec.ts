import { expect, test, type Page } from '@playwright/test';
import { SceneKeys } from '../../src/scenes/sceneKeys';
import { findNamed, seedTutorialDone, shot, tapNamed, waitForScene } from './helpers';

/** Advance the game clock (customers arrive on a timer). */
async function advance(page: Page, ms: number): Promise<void> {
  await page.evaluate((t) => (window as unknown as { __session: { tick(ms: number): void } }).__session.tick(t), ms);
}

async function takeFrontOrder(page: Page, expectTicket: number): Promise<void> {
  await tapNamed(page, SceneKeys.Lobby, 'customer-front');
  await waitForScene(page, SceneKeys.Order);
  await tapNamed(page, SceneKeys.Order, 'btn-take-order');
  await waitForScene(page, SceneKeys.Order, false);
  await findNamed(page, SceneKeys.Lobby, `waiting-${expectTicket}`);
}

test('two customers: wrong customer refuses the box, right one gets served', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await seedTutorialDone(page);
  await page.goto('/?seed=7');
  await tapNamed(page, SceneKeys.Preload, 'prompt-start');
  await waitForScene(page, SceneKeys.Lobby);

  await takeFrontOrder(page, 1);
  await advance(page, 20_000); // next customer arrives
  await takeFrontOrder(page, 2);
  await shot(page, 'orders-two-waiting');

  // Work on #2 instead of #1 by tapping its ticket on the rail
  await tapNamed(page, SceneKeys.Hud, 'ticket-2');
  await tapNamed(page, SceneKeys.Hud, 'tab-Box');
  await waitForScene(page, SceneKeys.Box);
  await shot(page, 'orders-box-ticket-2');
  await tapNamed(page, SceneKeys.Box, 'btn-serve');
  await waitForScene(page, SceneKeys.Lobby);

  // Customer #1 says it's not theirs; nothing is served
  await tapNamed(page, SceneKeys.Lobby, 'waiting-1');
  await findNamed(page, SceneKeys.Lobby, 'bubble-customer');
  await shot(page, 'orders-not-mine');
  expect(await page.evaluate(() => (window as unknown as { __session: { servedCount: number } }).__session.servedCount)).toBe(0);

  // Customer #2 takes it
  await tapNamed(page, SceneKeys.Lobby, 'waiting-2');
  await waitForScene(page, SceneKeys.Serve);
  await shot(page, 'orders-served-2');
  await tapNamed(page, SceneKeys.Serve, 'btn-serve-done');
  await waitForScene(page, SceneKeys.Serve, false);
  expect(await page.evaluate(() => (window as unknown as { __session: { servedCount: number } }).__session.servedCount)).toBe(1);

  // #1 is now the active ticket and can be served the same way
  await tapNamed(page, SceneKeys.Hud, 'tab-Box');
  await tapNamed(page, SceneKeys.Box, 'btn-serve');
  await waitForScene(page, SceneKeys.Lobby);
  await tapNamed(page, SceneKeys.Lobby, 'waiting-1');
  await waitForScene(page, SceneKeys.Serve);
  await tapNamed(page, SceneKeys.Serve, 'btn-serve-done');
  expect(await page.evaluate(() => (window as unknown as { __session: { servedCount: number } }).__session.servedCount)).toBe(2);

  expect(errors).toEqual([]);
});
