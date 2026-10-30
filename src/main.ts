import Phaser from 'phaser';
import { createGameConfig } from './config';
import { SaveService } from './systems/SaveService';
import { hasSession, session, setSave, setSeed } from './systems/services';
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

  // Exposed for Playwright tests.
  const w = window as unknown as { __game: Phaser.Game; __session?: unknown };
  w.__game = game;
  Object.defineProperty(w, '__session', { get: () => (hasSession() ? session() : undefined) });
}

void start();
