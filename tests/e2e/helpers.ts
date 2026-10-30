import { expect, test, type Page } from '@playwright/test';

// Helpers that drive the game through window.__game (exposed in src/main.ts).

type AnyObj = {
  name?: string;
  visible?: boolean;
  list?: AnyObj[];
  getBounds?: () => { centerX: number; centerY: number };
};

type GameHandle = {
  scale: { width: number; height: number };
  scene: {
    isActive(k: string): boolean;
    isSleeping(k: string): boolean;
    getScenes(active: boolean): { sys: { settings: { key: string } } }[];
    getScene(k: string): { children: { list: unknown[] } };
  };
};

export async function waitForScene(page: Page, key: string, active = true): Promise<void> {
  await page.waitForFunction(
    ([k, want]) => {
      const g = (window as unknown as { __game?: GameHandle }).__game;
      return (g?.scene.isActive(k) ?? false) === want;
    },
    [key, active] as const,
  );
}

/** Active scenes, ordered bottom to top. */
export async function activeScenes(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const g = (window as unknown as { __game: GameHandle }).__game;
    return g.scene.getScenes(true).map((s) => s.sys.settings.key);
  });
}

export async function isSleeping(page: Page, key: string): Promise<boolean> {
  return page.evaluate((k) => (window as unknown as { __game: GameHandle }).__game.scene.isSleeping(k), key);
}

export async function gameSize(page: Page): Promise<{ width: number; height: number }> {
  return page.evaluate(() => {
    const g = (window as unknown as { __game: GameHandle }).__game;
    return { width: g.scale.width, height: g.scale.height };
  });
}

/**
 * Assert the canvas covers the whole browser viewport (no shrunken box, no bars),
 * waiting up to `timeout` for post-rotation settling.
 */
export async function expectFillsScreen(page: Page, timeout = 2000): Promise<void> {
  await expect
    .poll(
      async () => {
        const box = await page.locator('#game canvas').boundingBox();
        const vp = page.viewportSize()!;
        if (!box) return 'no canvas';
        const off = Math.max(Math.abs(box.x), Math.abs(box.y), Math.abs(box.width - vp.width), Math.abs(box.height - vp.height));
        return off <= 2 ? 'fills' : `canvas ${box.width}x${box.height} at ${box.x},${box.y} vs viewport ${vp.width}x${vp.height}`;
      },
      { timeout },
    )
    .toBe('fills');
}

/** Assert `key` is drawn above every other active scene (popups must cover the tab bar). */
export async function expectOnTop(page: Page, key: string): Promise<void> {
  const scenes = await activeScenes(page);
  expect(scenes.at(-1)).toBe(key);
}

/** Find a named, visible game object (searching inside containers) and return its centre in game coordinates. */
export async function findNamed(page: Page, sceneKey: string, name: string): Promise<{ x: number; y: number }> {
  const handle = await page.waitForFunction(
    ([sk, n]) => {
      const g = (window as unknown as { __game: GameHandle }).__game;
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

/** Convert game coordinates to page (CSS pixel) coordinates. */
export async function toPage(page: Page, x: number, y: number): Promise<{ px: number; py: number }> {
  const box = await page.locator('#game canvas').boundingBox();
  expect(box).not.toBeNull();
  const { width } = await gameSize(page);
  const scale = box!.width / width;
  return { px: box!.x + x * scale, py: box!.y + y * scale };
}

/** Press and hold the pointer on a named object; returns a release function. */
export async function holdNamed(page: Page, sceneKey: string, name: string): Promise<() => Promise<void>> {
  const p = await findNamed(page, sceneKey, name);
  const { px, py } = await toPage(page, p.x, p.y);
  await page.mouse.move(px, py);
  await page.mouse.down();
  return () => page.mouse.up();
}

/** Drag from a named object's centre by (dx, dy) game pixels. */
export async function dragFromNamed(page: Page, sceneKey: string, name: string, dx: number, dy: number): Promise<void> {
  const p = await findNamed(page, sceneKey, name);
  const from = await toPage(page, p.x, p.y);
  const to = await toPage(page, p.x + dx, p.y + dy);
  await page.mouse.move(from.px, from.py);
  await page.mouse.down();
  await page.mouse.move(to.px, to.py, { steps: 8 });
  await page.mouse.up();
}

/** Stop the real-time game clock so a test controls time exactly with advance(). */
export async function pauseClock(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __setClockPaused(p: boolean): void }).__setClockPaused(true));
}

/** Advance the game clock in small steps, like real frames (customers, fryer…). */
export async function advance(page: Page, ms: number, stepMs = 100): Promise<void> {
  await page.evaluate(
    ([total, step]) => {
      const s = (window as unknown as { __session: { tick(ms: number): void } }).__session;
      for (let t = 0; t < total; t += step) s.tick(Math.min(step, total - t));
    },
    [ms, stepMs] as const,
  );
}

/** Tap (touch devices) or click (desktop) a point given in game coordinates. */
export async function tapGame(page: Page, x: number, y: number): Promise<void> {
  const { px, py } = await toPage(page, x, y);
  // Tapped points must be on screen, or the layout put something out of reach.
  const vp = page.viewportSize()!;
  expect(px).toBeGreaterThanOrEqual(0);
  expect(py).toBeGreaterThanOrEqual(0);
  expect(px).toBeLessThanOrEqual(vp.width);
  expect(py).toBeLessThanOrEqual(vp.height);

  if (test.info().project.use.hasTouch) await page.touchscreen.tap(px, py);
  else await page.mouse.click(px, py);
}

export async function tapNamed(page: Page, sceneKey: string, name: string): Promise<void> {
  const p = await findNamed(page, sceneKey, name);
  await tapGame(page, p.x, p.y);
}

/** Screenshot into test-results/screens/<project>/<name>.png. */
export async function shot(page: Page, name: string): Promise<void> {
  // Let tweens settle a moment so screenshots are representative.
  await page.waitForTimeout(250);
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}/${name}.png` });
}

/** Skip the tutorial on first load by pre-seeding the save. */
export async function seedTutorialDone(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (!localStorage.getItem('domochi.save')) {
      localStorage.setItem('domochi.save', JSON.stringify({ tutorialDone: true }));
    }
  });
}
