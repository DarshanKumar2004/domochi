import Phaser from 'phaser';
import { gameConfig } from './config';

const game = new Phaser.Game(gameConfig);

// Exposed for Playwright scene-flow tests.
(window as unknown as { __game: Phaser.Game }).__game = game;
