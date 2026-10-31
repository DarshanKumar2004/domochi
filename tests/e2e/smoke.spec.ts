import { expect, test } from '@playwright/test';
import { SceneKeys } from '../../src/scenes/sceneKeys';
import {
  activeScenes,
  expectFillsScreen,
  expectOnTop,
  findNamed,
  gameSize,
  isSleeping,
  seedTutorialDone,
  shot,
  tapNamed,
  waitForScene,
} from './helpers';

// Runs once per Playwright project: phone portrait, phone landscape, desktop.
test('full scene flow', async ({ page }) => {
  // One long walk through the whole game; the 30 s default is too tight when projects run in parallel.
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  // Loading screen → first run goes to the tutorial
  await page.goto('/');
  await waitForScene(page, SceneKeys.Preload);
  await shot(page, '01-preload-loading');
  await tapNamed(page, SceneKeys.Preload, 'prompt-start'); // waits until the prompt is visible
  await waitForScene(page, SceneKeys.Tutorial);
  await shot(page, '02-tutorial');

  // The tutorial coaches over the live game. Advance one line, then skip.
  await waitForScene(page, SceneKeys.Lobby);
  await tapNamed(page, SceneKeys.Tutorial, 'btn-tutorial-next');
  await shot(page, '03-tutorial-line2');
  await tapNamed(page, SceneKeys.Tutorial, 'btn-skip');
  await waitForScene(page, SceneKeys.Tutorial, false);
  await waitForScene(page, SceneKeys.Lobby);
  await waitForScene(page, SceneKeys.Hud);

  // The first customer walks up to the window
  await findNamed(page, SceneKeys.Lobby, 'customer-front');
  await shot(page, '04-lobby');

  // Order popup: they say their order and a ticket is written
  await tapNamed(page, SceneKeys.Lobby, 'customer-front');
  await waitForScene(page, SceneKeys.Order);
  await expectOnTop(page, SceneKeys.Order);
  await shot(page, '05-order');
  await tapNamed(page, SceneKeys.Order, 'btn-take-order');
  await waitForScene(page, SceneKeys.Order, false);
  await findNamed(page, SceneKeys.Hud, 'ticket-1');
  await findNamed(page, SceneKeys.Lobby, 'waiting-1');
  await shot(page, '05b-lobby-waiting');

  // Every station via the tab bar
  const stations = [
    ['Fry', SceneKeys.Fry],
    ['Glaze', SceneKeys.Glaze],
    ['Toppings', SceneKeys.Toppings],
    ['Box', SceneKeys.Box],
  ] as const;
  for (const [label, key] of stations) {
    await tapNamed(page, SceneKeys.Hud, `tab-${label}`);
    await waitForScene(page, key);
    await shot(page, `06-station-${label.toLowerCase()}`);
  }
  // Only one station is running at a time; the rest sleep.
  const running = await activeScenes(page);
  expect(running.filter((k) => [SceneKeys.Lobby, SceneKeys.Fry, SceneKeys.Glaze, SceneKeys.Toppings].includes(k as never))).toEqual([]);

  // Put one (quickly made) donut in the box; closing the lid hands it straight to
  // customer #1 and shows the result card in the Lobby. (pack.spec makes them by hand.)
  await page.evaluate(() => {
    type W = { pour(g: string, a: number, b: number, c: number, d: number): boolean };
    const s = (window as unknown as {
      __session: { dropDonut(): number; pullAll(): number[]; startGlazing(i: number): W | null; finishGlazing(): unknown; boxDonut(i: number): number };
    }).__session;
    s.dropDonut();
    s.pullAll();
    s.startGlazing(0)!.pour('strawberry', -0.6, -0.3, 0.6, -0.3);
    s.finishGlazing();
    s.boxDonut(0);
  });
  await findNamed(page, SceneKeys.Box, 'box-slot-0');
  await shot(page, '06b-station-box-packed');
  await tapNamed(page, SceneKeys.Box, 'btn-serve');
  await waitForScene(page, SceneKeys.Lobby);
  await waitForScene(page, SceneKeys.Serve);
  await expectOnTop(page, SceneKeys.Serve);
  await shot(page, '07-serve');
  await tapNamed(page, SceneKeys.Serve, 'btn-serve-done');
  await waitForScene(page, SceneKeys.Serve, false);

  // Stations we left are asleep (state kept), and returning wakes them
  expect(await isSleeping(page, SceneKeys.Fry)).toBe(true);
  await tapNamed(page, SceneKeys.Hud, 'tab-Fry');
  await waitForScene(page, SceneKeys.Fry);
  await tapNamed(page, SceneKeys.Hud, 'tab-Lobby');
  await waitForScene(page, SceneKeys.Lobby);

  // Settings
  await tapNamed(page, SceneKeys.Hud, 'btn-settings');
  await waitForScene(page, SceneKeys.Settings);
  await expectOnTop(page, SceneKeys.Settings);
  await shot(page, '08-settings');
  await tapNamed(page, SceneKeys.Settings, 'btn-close-settings');
  await waitForScene(page, SceneKeys.Settings, false);

  // Save persists: a reload skips the tutorial
  await page.reload();
  await tapNamed(page, SceneKeys.Preload, 'prompt-start');
  await waitForScene(page, SceneKeys.Lobby);
  expect(await activeScenes(page)).not.toContain(SceneKeys.Tutorial);

  // Replay tutorial from Settings
  await tapNamed(page, SceneKeys.Hud, 'btn-settings');
  await waitForScene(page, SceneKeys.Settings);
  await tapNamed(page, SceneKeys.Settings, 'btn-replay-tutorial');
  await waitForScene(page, SceneKeys.Tutorial);
  expect(await activeScenes(page)).toEqual(expect.arrayContaining([SceneKeys.Tutorial, SceneKeys.Lobby, SceneKeys.Hud]));
  expect(await activeScenes(page)).not.toContain(SceneKeys.Settings);
  await tapNamed(page, SceneKeys.Tutorial, 'btn-skip');
  await waitForScene(page, SceneKeys.Tutorial, false);
  await waitForScene(page, SceneKeys.Lobby);

  // Reset progress (two taps) brings the tutorial back
  await tapNamed(page, SceneKeys.Hud, 'btn-settings');
  await waitForScene(page, SceneKeys.Settings);
  await tapNamed(page, SceneKeys.Settings, 'btn-reset');
  await shot(page, '09-settings-confirm-reset');
  await tapNamed(page, SceneKeys.Settings, 'btn-reset');
  await waitForScene(page, SceneKeys.Tutorial);
  const saved = await page.evaluate(() => localStorage.getItem('domochi.save'));
  expect(JSON.parse(saved ?? '{}').tutorialDone).toBe(false);

  expect(errors).toEqual([]);
});

test('rotating the phone switches layout without losing state', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone-portrait', 'rotation is simulated from the portrait phone only');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await seedTutorialDone(page);
  await page.goto('/');
  await tapNamed(page, SceneKeys.Preload, 'prompt-start');
  await waitForScene(page, SceneKeys.Lobby);

  // Go to a station and open nothing else, then rotate.
  await tapNamed(page, SceneKeys.Hud, 'tab-Glaze');
  await waitForScene(page, SceneKeys.Glaze);
  const portrait = await gameSize(page);
  expect(portrait.height).toBeGreaterThan(portrait.width);

  const vp = page.viewportSize()!;
  await page.setViewportSize({ width: vp.height, height: vp.width });
  await page.waitForFunction(() => {
    const g = (window as unknown as { __game: { scale: { width: number; height: number } } }).__game;
    return g.scale.width > g.scale.height;
  });
  await expectFillsScreen(page);
  await shot(page, 'rotated-glaze-landscape');

  // Same station still showing, sleeping Lobby kept, tabs still work after the relayout.
  expect(await activeScenes(page)).toEqual(expect.arrayContaining([SceneKeys.Glaze, SceneKeys.Hud]));
  expect(await isSleeping(page, SceneKeys.Lobby)).toBe(true);
  await tapNamed(page, SceneKeys.Hud, 'tab-Lobby');
  await waitForScene(page, SceneKeys.Lobby);
  await shot(page, 'rotated-lobby-landscape');

  // Sleeping scenes were re-laid-out too: the Lobby customer is reachable in landscape.
  await tapNamed(page, SceneKeys.Lobby, 'customer-front');
  await waitForScene(page, SceneKeys.Order);
  await shot(page, 'rotated-order-landscape');

  // And back to portrait.
  await page.setViewportSize(vp);
  await page.waitForFunction(() => {
    const g = (window as unknown as { __game: { scale: { width: number; height: number } } }).__game;
    return g.scale.height > g.scale.width;
  });
  await expectFillsScreen(page);
  await shot(page, 'rotated-back-order-portrait');
  await tapNamed(page, SceneKeys.Order, 'btn-take-order');
  await waitForScene(page, SceneKeys.Order, false);

  expect(errors).toEqual([]);
});
