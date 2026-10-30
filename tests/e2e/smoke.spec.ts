import { expect, test } from '@playwright/test';

test('game boots into BootScene and responds to a tap', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await page.waitForFunction(() => {
    const g = (window as unknown as { __game?: { scene: { isActive(k: string): boolean } } }).__game;
    return g?.scene.isActive('BootScene') ?? false;
  });

  const canvas = page.locator('#game canvas');
  await expect(canvas).toBeVisible();
  await page.screenshot({ path: 'test-results/screens/boot.png' });

  await canvas.tap();
  await page.screenshot({ path: 'test-results/screens/boot-tapped.png' });

  expect(errors).toEqual([]);
});
