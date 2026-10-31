import { expect, test, type Page } from '@playwright/test';
import { SceneKeys } from '../../src/scenes/sceneKeys';
import { advance, doubleTapNamed, dragFromNamed, dragNamedOnto, holdNamed, pauseClock, seedTutorialDone, shot, tapNamed, isVisibleNamed, waitForScene } from './helpers';

interface SlotView {
  down: number;
  up: number;
  flips: number;
}
interface FryerView {
  temp: number;
  target: number;
  oil: number;
  grateHeld: boolean;
  slots: (SlotView | null)[];
  balance: { secondsPerSide: number; topFactorFloating: number; burntAt: number };
}
type SessionView = { fryer: FryerView; rack: unknown[]; trashed: number };

const fryer = (page: Page) =>
  page.evaluate(() => {
    const f = (window as unknown as { __session: SessionView }).__session.fryer;
    return { temp: f.temp, target: f.target, oil: f.oil, grateHeld: f.grateHeld, slots: f.slots.map((d) => d && { ...d }), balance: f.balance };
  });
const rackSize = (page: Page) => page.evaluate(() => (window as unknown as { __session: SessionView }).__session.rack.length);
const trashed = (page: Page) => page.evaluate(() => (window as unknown as { __session: SessionView }).__session.trashed);

async function startAtFryer(page: Page): Promise<void> {
  await seedTutorialDone(page);
  await page.goto('/?seed=7');
  await tapNamed(page, SceneKeys.Preload, 'prompt-start');
  await waitForScene(page, SceneKeys.Lobby);
  await pauseClock(page); // the test drives time, so slow screenshots can't burn anything
  await tapNamed(page, SceneKeys.Hud, 'tab-Fry');
  await waitForScene(page, SceneKeys.Fry);
  await advance(page, 8000); // let the oil heat up
}

test('fry one at a time: drop, flip individually, grate, dial, drag to the rack, pull all', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await startAtFryer(page);
  const b = (await fryer(page)).balance;

  await tapNamed(page, SceneKeys.Fry, 'btn-drop');
  await page.waitForTimeout(300);
  await shot(page, 'fry-1-dropping');
  await tapNamed(page, SceneKeys.Fry, 'btn-drop');
  await expect.poll(async () => (await fryer(page)).slots.filter(Boolean).length).toBe(2);

  // Cook the undersides; the golden band on each meter shows when to flip.
  await advance(page, b.secondsPerSide * 1000);
  // Golden underside: the donuts hop with a puff of steam (time to flip).
  await expect.poll(() => isVisibleNamed(page, SceneKeys.Fry, 'fry-steam')).toBe(true);
  await page.waitForTimeout(700);
  await shot(page, 'fry-2-golden-band');
  await tapNamed(page, SceneKeys.Fry, 'fry-donut-0');
  await expect.poll(async () => (await fryer(page)).slots[0]?.flips).toBe(1);
  expect((await fryer(page)).slots[1]?.flips).toBe(0);
  await tapNamed(page, SceneKeys.Fry, 'fry-donut-1');
  await expect.poll(async () => (await fryer(page)).slots[1]?.flips).toBe(1);

  const release = await holdNamed(page, SceneKeys.Fry, 'btn-grate');
  await expect.poll(async () => (await fryer(page)).grateHeld).toBe(true);
  await release();
  await expect.poll(async () => (await fryer(page)).grateHeld).toBe(false);

  const before = (await fryer(page)).target;
  await dragFromNamed(page, SceneKeys.Fry, 'fry-dial', 110, 0);
  await expect.poll(async () => (await fryer(page)).target).toBeGreaterThan(before);

  await advance(page, b.secondsPerSide * (1 - b.topFactorFloating) * 1000 - 300);
  await dragNamedOnto(page, SceneKeys.Fry, 'fry-donut-0', 'fry-rack', 150);
  await expect.poll(() => rackSize(page)).toBe(1);
  await tapNamed(page, SceneKeys.Fry, 'btn-pull-all');
  await expect.poll(() => rackSize(page)).toBe(2);
  await page.waitForTimeout(600);
  await shot(page, 'fry-3-rack');

  expect(errors).toEqual([]);
});

test('golden cues: a hop and steam when a side is golden, steam while ready to pull', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await startAtFryer(page);
  await tapNamed(page, SceneKeys.Fry, 'btn-drop');
  await page.waitForTimeout(700);
  const golden = (v: number) => Math.abs(v - 1) <= 0.1;
  /** Cook in small steps until the donut in slot 0 matches. */
  const cookUntil = async (ok: (d: SlotView) => boolean) => {
    for (let k = 0; k < 200 && !ok((await fryer(page)).slots[0]!); k++) await advance(page, 100);
    expect(ok((await fryer(page)).slots[0]!)).toBe(true);
  };

  // Underside golden: hop + puff (time to flip).
  await cookUntil((d) => golden(d.down));
  await expect.poll(() => isVisibleNamed(page, SceneKeys.Fry, 'fry-steam')).toBe(true);
  await tapNamed(page, SceneKeys.Fry, 'fry-donut-0');
  await expect.poll(async () => (await fryer(page)).slots[0]?.flips).toBe(1);

  // Second side golden too: it keeps steaming (ready to pull).
  await cookUntil((d) => golden(d.down) && d.up >= 0.9);
  await page.waitForTimeout(1000); // longer than one puff lasts: new ones keep coming
  await expect.poll(() => isVisibleNamed(page, SceneKeys.Fry, 'fry-steam')).toBe(true);
  await shot(page, 'fry-2b-steaming');
  expect(errors).toEqual([]);
});

test('trash: drag a donut from the oil, and one from the rack, into the bin; burnt ones go by themselves', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await startAtFryer(page);
  const b = (await fryer(page)).balance;

  // From the oil
  await tapNamed(page, SceneKeys.Fry, 'btn-drop');
  await page.waitForTimeout(700);
  await dragNamedOnto(page, SceneKeys.Fry, 'fry-donut-0', 'fry-trash');
  await expect.poll(() => trashed(page)).toBe(1);
  expect((await fryer(page)).slots[0]).toBeNull();

  // From the rack: three donuts, throw just the middle one away
  for (let i = 0; i < 3; i++) await tapNamed(page, SceneKeys.Fry, 'btn-drop');
  await advance(page, 2000);
  await tapNamed(page, SceneKeys.Fry, 'btn-pull-all');
  await expect.poll(() => rackSize(page)).toBe(3);
  await page.waitForTimeout(600);
  await dragNamedOnto(page, SceneKeys.Fry, 'fry-rack-1', 'fry-trash');
  await expect.poll(() => rackSize(page)).toBe(2);
  expect(await trashed(page)).toBe(2);

  // The whole rack: grab the tray (by its label) and slide it into the bin…
  await dragNamedOnto(page, SceneKeys.Fry, 'fry-rack', 'fry-trash');
  await expect.poll(() => rackSize(page)).toBe(0);
  expect(await trashed(page)).toBe(4);
  // …or double-tap the bin.
  for (let i = 0; i < 2; i++) await tapNamed(page, SceneKeys.Fry, 'btn-drop');
  await advance(page, 2000);
  await tapNamed(page, SceneKeys.Fry, 'btn-pull-all');
  await expect.poll(() => rackSize(page)).toBe(2);
  await doubleTapNamed(page, SceneKeys.Fry, 'fry-trash');
  await expect.poll(() => rackSize(page)).toBe(0);
  expect(await trashed(page)).toBe(6);

  // Forgotten in the oil: burns and is thrown out automatically
  await tapNamed(page, SceneKeys.Fry, 'btn-drop');
  await advance(page, (b.secondsPerSide * b.burntAt + 4) * 1000);
  await expect.poll(() => trashed(page)).toBe(7);
  await page.waitForTimeout(250);
  await shot(page, 'fry-4-burnt');

  expect(errors).toEqual([]);
});

test('low oil runs hot: the dial’s green zone slides down so redialling to green fixes it', async ({ page }) => {
  test.setTimeout(60_000);
  await startAtFryer(page);
  await page.evaluate(() => {
    const f = (window as unknown as { __session: { fryer: { oil: number } } }).__session.fryer;
    f.oil = 0.5; // half a vat: settles 30°F hotter than the dial says
  });
  await advance(page, 15_000);
  const hot = await fryer(page);
  expect(hot.temp).toBeGreaterThan(360);
  await page.waitForTimeout(200);
  await shot(page, 'fry-5-drift-arc');
  // Setting the dial to the middle of where the green arc now is brings the oil back in range.
  await page.evaluate(() => {
    const f = (window as unknown as { __session: { fryer: { setTarget(t: number): void } } }).__session.fryer;
    f.setTarget(320);
  });
  await advance(page, 15_000);
  const t = (await fryer(page)).temp;
  expect(t).toBeGreaterThanOrEqual(340);
  expect(t).toBeLessThanOrEqual(360);
});
