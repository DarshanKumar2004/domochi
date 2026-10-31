import Phaser from 'phaser';
import { createGameConfig } from './config';
import { SaveService } from './systems/SaveService';
import { audio, hasSession, session, setClockPaused, setSave, setSeed } from './systems/services';
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

  // Exposed for Playwright tests.
  const w = window as unknown as { __game: Phaser.Game; __session?: unknown; __setClockPaused: (p: boolean) => void };
  w.__game = game;
  w.__setClockPaused = setClockPaused;
  Object.defineProperty(w, '__session', { get: () => (hasSession() ? session() : undefined) });
}

void start();
