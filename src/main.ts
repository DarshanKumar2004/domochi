import Phaser from 'phaser';
import { createGameConfig } from './config';
import { SaveService } from './systems/SaveService';
import { setSave } from './systems/services';
import { createDefaultStorage } from './systems/storage';
import { measureGameSize, watchContainerSize } from './ui/viewport';

async function start(): Promise<void> {
  // Load the save before Phaser starts, so every scene can read it synchronously.
  setSave(await SaveService.load(createDefaultStorage()));

  const container = document.getElementById('game')!;
  const size = measureGameSize(container);
  const game = new Phaser.Game(createGameConfig(size.width, size.height));
  watchContainerSize(game, container);

  // Exposed for Playwright scene-flow tests.
  (window as unknown as { __game: Phaser.Game }).__game = game;
}

void start();
