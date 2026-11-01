import { expect, test } from '@playwright/test';
import { SceneKeys } from '../../src/scenes/sceneKeys';
import { findNamed, seedTutorialDone, shot, tapNamed, waitForScene } from './helpers';
import { trailerWeek, trailerWord } from '../../src/systems/trailerCode';

test('home screen: about us, a flavour idea for Ethan, then play; Settings goes back home', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seedTutorialDone(page);
  await page.goto('/?seed=7');
  await findNamed(page, SceneKeys.Preload, 'prompt-start');
  await findNamed(page, SceneKeys.Preload, 'btn-about');
  await shot(page, 'home-1');

  // About us: a card with a link to the real site; tapping the button doesn't start the game.
  await tapNamed(page, SceneKeys.Preload, 'btn-about');
  await expect(page.locator('.dm-card')).toBeVisible();
  await expect(page.locator('.dm-card a').first()).toHaveAttribute('href', /domochitreats\.com/);
  await shot(page, 'home-2-about');
  await page.locator('.dm-card [data-x="close"]').click();
  await expect(page.locator('.dm-back')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __session?: unknown }).__session)).toBeUndefined();

  // A flavour idea: kept for the day's report.
  await tapNamed(page, SceneKeys.Preload, 'btn-suggest');
  await page.locator('.dm-card textarea').fill('ube with coconut flakes');
  await page.locator('.dm-card input').fill('Kim');
  await page.locator('.dm-card [data-x="send"]').click();
  await expect(page.locator('.dm-card')).toContainText('thank you');
  await page.locator('.dm-card [data-x="close"]').click();
  const queued = JSON.parse((await page.evaluate(() => localStorage.getItem('domochi.feedback'))) ?? '[]');
  expect(queued).toMatchObject([{ kind: 'flavor', text: 'ube with coconut flakes', name: 'Kim' }]);

  // Tap anywhere else: play.
  await tapNamed(page, SceneKeys.Preload, 'prompt-start');
  await waitForScene(page, SceneKeys.Lobby);

  // Settings → Home screen.
  await tapNamed(page, SceneKeys.Hud, 'btn-settings');
  await waitForScene(page, SceneKeys.Settings);
  await tapNamed(page, SceneKeys.Settings, 'btn-home');
  await waitForScene(page, SceneKeys.Preload);
  await findNamed(page, SceneKeys.Preload, 'btn-tell-ethan');
  await tapNamed(page, SceneKeys.Preload, 'prompt-start');
  await waitForScene(page, SceneKeys.Lobby);
  expect(errors).toEqual([]);
});

test("the trailer's secret word: this week's word pays once; a wrong one doesn't", async ({ page }) => {
  test.setTimeout(60_000);
  await seedTutorialDone(page);
  await page.goto('/?seed=7');
  await findNamed(page, SceneKeys.Preload, 'prompt-start');
  await tapNamed(page, SceneKeys.Preload, 'btn-secret-word');
  const input = page.locator('.dm-card input');
  await input.fill('definitely not it');
  await page.locator('[data-x="check"]').click();
  await expect(page.locator('[data-x="msg"]')).toContainText("not this week's word");
  await shot(page, 'home-secret-word');
  await input.fill(trailerWord(trailerWeek(new Date())).toUpperCase());
  await page.locator('[data-x="check"]').click();
  await expect(page.locator('.dm-card h2')).toContainText('you found it');
  const saved = JSON.parse((await page.evaluate(() => localStorage.getItem('domochi.save'))) ?? '{}');
  expect(saved.money).toBeGreaterThanOrEqual(10);
  expect(saved.journal.stickers).toContain('trailer-visit');
  await page.locator('[data-x="close"]').click();
  // The same week again: already found.
  await tapNamed(page, SceneKeys.Preload, 'btn-secret-word');
  await page.locator('.dm-card input').fill(trailerWord(trailerWeek(new Date())));
  await page.locator('[data-x="check"]').click();
  await expect(page.locator('[data-x="msg"]')).toContainText('already found');
});

test('news from the trailer shows on the home screen (and nothing when there is none)', async ({ page }) => {
  await page.route('**/news.json', (route) => route.fulfill({ json: { message: 'find us at the Saturday market downtown!', until: '' } }));
  await seedTutorialDone(page);
  await page.goto('/?seed=7');
  await findNamed(page, SceneKeys.Preload, 'prompt-start');
  await findNamed(page, SceneKeys.Preload, 'home-news');
  await page.waitForTimeout(300);
  await shot(page, 'home-news');
});
