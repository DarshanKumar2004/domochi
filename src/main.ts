import Phaser from 'phaser';
import { gameConfig } from './config';
import { SaveService } from './systems/SaveService';
import { setSave } from './systems/services';
import { createDefaultStorage } from './systems/storage';

async function start(): Promise<void> {
  // Load the save before Phaser starts, so every scene can read it synchronously.
  setSave(await SaveService.load(createDefaultStorage()));

  const game = new Phaser.Game(gameConfig);
  // Exposed for Playwright scene-flow tests.
  (window as unknown as { __game: Phaser.Game }).__game = game;
}

void start();
