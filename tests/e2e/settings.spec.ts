import { expect, test } from '@playwright/test';
import { SceneKeys } from '../../src/scenes/sceneKeys';
import { boundsNamed, seedTutorialDone, tapGame, tapNamed, waitForScene } from './helpers';

test('volume sliders follow the finger', async ({ page }) => {
  await seedTutorialDone(page);
  await page.goto('/?seed=7');
  await tapNamed(page, SceneKeys.Preload, 'prompt-start');
  await waitForScene(page, SceneKeys.Lobby);
  await tapNamed(page, SceneKeys.Hud, 'btn-settings');
  await waitForScene(page, SceneKeys.Settings);
  const b = await boundsNamed(page, SceneKeys.Settings, 'slider-music');
  // The saved music volume (saved when the finger lifts).
  const vol = () => page.evaluate(() => JSON.parse(localStorage.getItem('domochi.save') ?? '{}').settings?.musicVolume as number | undefined);
  // Tap at a quarter along the track (the hit area has a knob's width of margin each side).
  await tapGame(page, b.x + b.w * 0.25, b.y + b.h / 2);
  await expect.poll(vol).toBeLessThan(0.4);
  await tapGame(page, b.x + b.w * 0.8, b.y + b.h / 2);
  await expect.poll(vol).toBeGreaterThan(0.7);
});
