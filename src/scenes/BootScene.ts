import Phaser from 'phaser';
import { ASSET_FILES, queueAssetFile } from '../assets/files';
import { TextureKeys } from '../assets/keys';
import { createAnimations, ensurePlaceholderTextures } from '../assets/placeholders';
import { SceneKeys } from './sceneKeys';

/** Loads just what the loading screen needs (truck + Ethan), then hands off to Preload. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Boot);
  }

  preload(): void {
    for (const file of ASSET_FILES) {
      if (file.boot) queueAssetFile(this, file);
    }
  }

  create(): void {
    ensurePlaceholderTextures(this, [TextureKeys.Truck, TextureKeys.Ethan]);
    createAnimations(this);
    this.scene.start(SceneKeys.Preload);
  }
}
