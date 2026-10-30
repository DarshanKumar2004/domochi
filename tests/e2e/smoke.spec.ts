import { expect, test } from '@playwright/test';
import { SceneKeys } from '../../src/scenes/sceneKeys';
import { activeScenes, expectOnTop, shot, tapGame, tapNamed, waitForScene } from './helpers';

test('full Phase 1 scene flow on a phone', async ({ page }) => {
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

  // Advance one line, then skip
  await tapGame(page, 540, 1200);
  await shot(page, '03-tutorial-line2');
  await tapNamed(page, SceneKeys.Tutorial, 'btn-skip');
  await waitForScene(page, SceneKeys.Lobby);
  await waitForScene(page, SceneKeys.Hud);
  await shot(page, '04-lobby');

  // Order popup
  await tapNamed(page, SceneKeys.Lobby, 'customer-front');
  await waitForScene(page, SceneKeys.Order);
  await expectOnTop(page, SceneKeys.Order);
  await shot(page, '05-order');
  await tapNamed(page, SceneKeys.Order, 'btn-take-order');
  await waitForScene(page, SceneKeys.Order, false);

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

  // Serving cuts back to the Lobby with the result card
  await tapNamed(page, SceneKeys.Box, 'btn-serve');
  await waitForScene(page, SceneKeys.Serve);
  await expectOnTop(page, SceneKeys.Serve);
  await waitForScene(page, SceneKeys.Lobby);
  await shot(page, '07-serve');
  await tapNamed(page, SceneKeys.Serve, 'btn-serve-done');
  await waitForScene(page, SceneKeys.Serve, false);

  // Stations we left are asleep (state kept), and returning wakes them
  const frySleeping = await page.evaluate(
    (k) => (window as unknown as { __game: { scene: { isSleeping(k: string): boolean } } }).__game.scene.isSleeping(k),
    SceneKeys.Fry,
  );
  expect(frySleeping).toBe(true);
  await tapNamed(page, SceneKeys.Hud, 'tab-Fry');
  await waitForScene(page, SceneKeys.Fry);
  await tapNamed(page, SceneKeys.Hud, 'tab-Lobby');
  await waitForScene(page, SceneKeys.Lobby);

  // Settings
  await tapNamed(page, SceneKeys.Lobby, 'btn-settings');
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
  await tapNamed(page, SceneKeys.Lobby, 'btn-settings');
  await waitForScene(page, SceneKeys.Settings);
  await tapNamed(page, SceneKeys.Settings, 'btn-replay-tutorial');
  await waitForScene(page, SceneKeys.Tutorial);
  expect(await activeScenes(page)).toEqual([SceneKeys.Tutorial]);
  await tapNamed(page, SceneKeys.Tutorial, 'btn-skip');
  await waitForScene(page, SceneKeys.Lobby);

  // Reset progress (two taps) brings the tutorial back
  await tapNamed(page, SceneKeys.Lobby, 'btn-settings');
  await waitForScene(page, SceneKeys.Settings);
  await tapNamed(page, SceneKeys.Settings, 'btn-reset');
  await shot(page, '09-settings-confirm-reset');
  await tapNamed(page, SceneKeys.Settings, 'btn-reset');
  await waitForScene(page, SceneKeys.Tutorial);
  const saved = await page.evaluate(() => localStorage.getItem('domochi.save'));
  expect(JSON.parse(saved ?? '{}').tutorialDone).toBe(false);

  expect(errors).toEqual([]);
});
