import Phaser from 'phaser';
import { ASSET_FILES, queueAssetFile } from '../assets/files';
import { ensurePlaceholderTextures } from '../assets/placeholders';
import { save } from '../systems/services';
import { GAME_WIDTH } from '../ui/layout';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
import { Truck } from '../ui/Truck';
import { startMainGame } from './flow';
import { SceneKeys } from './sceneKeys';

/**
 * Minimum time the loading screen shows, so the truck and Ethan are seen even
 * when loading is instant. UI pacing only, not game balance.
 */
const MIN_SHOW_MS = 1200;
const BAR_WIDTH = 700;
const BAR_HEIGHT = 44;

export class PreloadScene extends Phaser.Scene {
  private barFill!: Phaser.GameObjects.Rectangle;
  private prompt!: Phaser.GameObjects.Text;
  private loadProgress = 0;
  private elapsed = 0;
  private ready = false;

  constructor() {
    super(SceneKeys.Preload);
  }

  preload(): void {
    this.loadProgress = 0;
    this.elapsed = 0;
    this.ready = false;
    const cx = GAME_WIDTH / 2;

    this.add
      .text(cx, 300, 'Domochi Donuts', {
        fontFamily: FONT_FAMILY,
        fontSize: '110px',
        fontStyle: 'bold',
        color: CSS.cream,
      })
      .setOrigin(0.5);
    this.add
      .text(cx, 410, 'Fresh mochi donuts · Lafayette, LA', {
        fontFamily: FONT_FAMILY,
        fontSize: '44px',
        color: CSS.muted,
      })
      .setOrigin(0.5);

    new Truck(this, cx, 880);

    const barY = 1340;
    this.add.rectangle(cx, barY, BAR_WIDTH + 16, BAR_HEIGHT + 16, COLORS.tabBar).setOrigin(0.5);
    this.barFill = this.add
      .rectangle(cx - BAR_WIDTH / 2, barY, BAR_WIDTH, BAR_HEIGHT, COLORS.pink)
      .setOrigin(0, 0.5)
      .setScale(0, 1);

    this.prompt = this.add
      .text(cx, 1520, 'Tap to start', {
        fontFamily: FONT_FAMILY,
        fontSize: '72px',
        fontStyle: 'bold',
        color: CSS.pink,
      })
      .setOrigin(0.5)
      .setName('prompt-start')
      .setVisible(false);

    this.load.on(Phaser.Loader.Events.PROGRESS, (value: number) => {
      this.loadProgress = value;
    });
    for (const file of ASSET_FILES) {
      if (!file.boot) queueAssetFile(this, file);
    }
  }

  create(): void {
    ensurePlaceholderTextures(this);
    this.loadProgress = 1;
  }

  override update(_time: number, delta: number): void {
    if (this.ready) return;
    this.elapsed += delta;
    const shown = Math.min(this.loadProgress, this.elapsed / MIN_SHOW_MS);
    this.barFill.scaleX = shown;
    if (shown >= 1) this.showPrompt();
  }

  private showPrompt(): void {
    this.ready = true;
    this.prompt.setVisible(true);
    this.tweens.add({ targets: this.prompt, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });
    this.input.once(Phaser.Input.Events.POINTER_DOWN, () => {
      if (save().data.tutorialDone) startMainGame(this);
      else this.scene.start(SceneKeys.Tutorial);
    });
  }
}
