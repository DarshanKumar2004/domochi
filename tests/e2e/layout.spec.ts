import { expect, test, type Page } from '@playwright/test';
import { SceneKeys } from '../../src/scenes/sceneKeys';
import { expectFillsScreen, gameSize, seedTutorialDone, tapNamed, waitForScene } from './helpers';

async function bootToLobby(page: Page): Promise<void> {
  await seedTutorialDone(page);
  await page.goto('/');
  await tapNamed(page, SceneKeys.Preload, 'prompt-start');
  await waitForScene(page, SceneKeys.Lobby);
}

test('game fills the screen on load', async ({ page }) => {
  await bootToLobby(page);
  await expectFillsScreen(page);
});

// Regression: "after rotating to landscape and back, the game is a small box".
test('rapid back-and-forth rotation ends full screen in the right orientation', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone-portrait', 'rotation is simulated from the portrait phone only');
  await bootToLobby(page);
  const portrait = page.viewportSize()!;
  const landscape = { width: portrait.height, height: portrait.width };

  // A real rotation fires several resizes while sizes are still changing.
  for (const vp of [landscape, portrait, landscape, portrait, landscape]) {
    await page.setViewportSize(vp);
    await page.waitForTimeout(30);
  }
  await expectFillsScreen(page);
  let size = await gameSize(page);
  expect(size.width).toBeGreaterThan(size.height);

  await page.setViewportSize(portrait);
  await expectFillsScreen(page);
  size = await gameSize(page);
  expect(size.height).toBeGreaterThan(size.width);
});

// Mid-rotation the canvas is briefly the old orientation's size. It must never
// widen the page, or mobile browsers zoom out and the game gets stuck small.
test('an oversized canvas never widens or zooms out the page', async ({ page }, info) => {
  test.skip(!info.project.use.isMobile, 'zoom-to-fit only happens on mobile browsers');
  await bootToLobby(page);
  const before = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight, scroll: document.documentElement.scrollWidth }));
  await page.evaluate(() => {
    const c = document.querySelector('#game canvas') as HTMLCanvasElement;
    c.style.width = `${window.innerWidth * 3}px`;
    c.style.height = `${window.innerHeight * 3}px`;
  });
  await page.waitForTimeout(100);
  const after = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight, scroll: document.documentElement.scrollWidth }));
  expect(after).toEqual(before);
  // And the game re-fits itself afterwards.
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await expectFillsScreen(page);
});
