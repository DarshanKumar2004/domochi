import Phaser from 'phaser';
import { createGameConfig } from './config';
import { SaveService } from './systems/SaveService';
import { audio, hasSession, save, session, setClockPaused, setSave, setSeed } from './systems/services';
import { createDefaultStorage } from './systems/storage';
import { measureGameSize, watchContainerSize } from './ui/viewport';

async function start(): Promise<void> {
  // Load the save before Phaser starts, so every scene can read it synchronously.
  setSave(await SaveService.load(createDefaultStorage()));

  // ?seed=123 makes customers and orders reproducible (handy for testing and bug reports).
  const seed = Number(new URLSearchParams(window.location.search).get('seed'));
  setSeed(Number.isInteger(seed) && seed > 0 ? seed : null);

  const container = document.getElementById('game')!;
  const size = measureGameSize(container);
  const game = new Phaser.Game(createGameConfig(size.width, size.height));
  watchContainerSize(game, container);
  // Hush when the tab or app goes to the background.
  document.addEventListener('visibilitychange', () => audio().setSuspended(document.hidden));
  // ...and pick the sound back up on the next tap if the phone paused it.
  document.addEventListener('pointerdown', () => audio().wake(), { capture: true, passive: true });
  // Clicking back into the window (or returning to the tab) brings the music back too.
  window.addEventListener('focus', () => audio().wake());
  window.addEventListener('pageshow', () => audio().wake());

  // Exposed for Playwright tests.
  const w = window as unknown as { __game: Phaser.Game; __session?: unknown; __save: unknown; __setClockPaused: (p: boolean) => void };
  w.__game = game;
  w.__save = save();
  w.__setClockPaused = setClockPaused;
  Object.defineProperty(w, '__session', { get: () => (hasSession() ? session() : undefined) });
}

void start();
