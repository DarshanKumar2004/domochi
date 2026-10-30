import Phaser from 'phaser';
import { createGameConfig } from './config';
import { SaveService } from './systems/SaveService';
import { setSave } from './systems/services';
import { createDefaultStorage } from './systems/storage';
import { gameSizeFor } from './ui/layout';
import { watchWindowSize } from './ui/viewport';

async function start(): Promise<void> {
  // Load the save before Phaser starts, so every scene can read it synchronously.
  setSave(await SaveService.load(createDefaultStorage()));

  const size = gameSizeFor(window.innerWidth, window.innerHeight);
  const game = new Phaser.Game(createGameConfig(size.width, size.height));
  watchWindowSize(game);

  // Exposed for Playwright scene-flow tests.
  (window as unknown as { __game: Phaser.Game }).__game = game;
}

void start();
