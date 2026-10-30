import { expect, type Page } from '@playwright/test';
import { GAME_WIDTH } from '../../src/ui/layout';

// Helpers that drive the game through window.__game (exposed in src/main.ts).

type AnyObj = {
  name?: string;
  visible?: boolean;
  list?: AnyObj[];
  getBounds?: () => { centerX: number; centerY: number };
};

export async function waitForScene(page: Page, key: string, active = true): Promise<void> {
  await page.waitForFunction(
    ([k, want]) => {
      const g = (window as unknown as { __game?: { scene: { isActive(k: string): boolean } } }).__game;
      return (g?.scene.isActive(k) ?? false) === want;
    },
    [key, active] as const,
  );
}

export async function activeScenes(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const g = (window as unknown as { __game: { scene: { getScenes(active: boolean): { sys: { settings: { key: string } } }[] } } }).__game;
    return g.scene.getScenes(true).map((s) => s.sys.settings.key);
  });
}

/** Assert `key` is drawn above every other active scene (popups must cover the tab bar). */
export async function expectOnTop(page: Page, key: string): Promise<void> {
  const scenes = await activeScenes(page); // ordered bottom to top
  expect(scenes.at(-1)).toBe(key);
}

/** Find a named, visible game object (searching inside containers) and return its centre in game coordinates. */
async function findNamed(page: Page, sceneKey: string, name: string): Promise<{ x: number; y: number }> {
  const handle = await page.waitForFunction(
    ([sk, n]) => {
      const g = (window as unknown as { __game: { scene: { getScene(k: string): { children: { list: unknown[] } } } } }).__game;
      const stack = [...g.scene.getScene(sk).children.list] as AnyObj[];
      while (stack.length) {
        const o = stack.pop()!;
        if (o.name === n && o.visible !== false && o.getBounds) {
          const b = o.getBounds();
          return { x: b.centerX, y: b.centerY };
        }
        if (o.list) stack.push(...o.list);
      }
      return null;
    },
    [sceneKey, name] as const,
  );
  return (await handle.jsonValue()) as { x: number; y: number };
}

/** Tap a point given in game coordinates (1080×1920). */
export async function tapGame(page: Page, x: number, y: number): Promise<void> {
  const box = await page.locator('#game canvas').boundingBox();
  expect(box).not.toBeNull();
  const scale = box!.width / GAME_WIDTH;
  await page.touchscreen.tap(box!.x + x * scale, box!.y + y * scale);
}

export async function tapNamed(page: Page, sceneKey: string, name: string): Promise<void> {
  const p = await findNamed(page, sceneKey, name);
  await tapGame(page, p.x, p.y);
}

export async function shot(page: Page, name: string): Promise<void> {
  // Let tweens settle a moment so screenshots are representative.
  await page.waitForTimeout(250);
  await page.screenshot({ path: `test-results/screens/${name}.png` });
}
