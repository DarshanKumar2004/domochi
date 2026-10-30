import Phaser from 'phaser';
import { TextureKeys } from '../assets/keys';
import { save } from '../systems/services';
import { Button } from '../ui/Button';
import { GAME_WIDTH, PLAY_AREA_HEIGHT } from '../ui/layout';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
import { Truck } from '../ui/Truck';
import { SceneKeys } from './sceneKeys';

const GROUND_Y = 1000;
const LINE_Y = 1480;

/** The truck's parking lot. Phase 1: static line of placeholder customers. */
export class LobbyScene extends Phaser.Scene {
  private dayText!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKeys.Lobby);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.sky);
    this.add.rectangle(0, GROUND_Y, GAME_WIDTH, PLAY_AREA_HEIGHT - GROUND_Y, COLORS.asphalt).setOrigin(0);
    for (let x = 60; x < GAME_WIDTH; x += 240) {
      this.add.rectangle(x, GROUND_Y + 60, 120, 14, 0xe8e8e8).setOrigin(0, 0.5);
    }

    new Truck(this, GAME_WIDTH / 2, 640).setScale(0.9);

    // Waiting area (customers move here after ordering, Phase 2).
    this.add.rectangle(200, LINE_Y - 20, 300, 260, 0xffffff, 0.12).setStrokeStyle(6, 0xffffff, 0.5);
    this.add
      .text(200, LINE_Y + 150, 'Waiting', { fontFamily: FONT_FAMILY, fontSize: '40px', color: CSS.cream })
      .setOrigin(0.5);

    // Customer line: front of the line is on the left.
    const lineX = [560, 760, 960];
    lineX.forEach((x, i) => {
      const c = this.add.image(x, LINE_Y + 110, TextureKeys.Customer).setOrigin(0.5, 1);
      if (i === 0) {
        c.setName('customer-front').setInteractive({ useHandCursor: true });
        c.on(Phaser.Input.Events.POINTER_UP, () => this.openOrder());
      } else {
        c.setAlpha(0.85);
      }
    });
    const nextTag = this.add
      .text(lineX[0] ?? 0, LINE_Y - 290, 'Tap me!', {
        fontFamily: FONT_FAMILY,
        fontSize: '42px',
        fontStyle: 'bold',
        color: CSS.ink,
        backgroundColor: CSS.cream,
        padding: { x: 18, y: 10 },
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: nextTag, y: nextTag.y - 16, duration: 500, yoyo: true, repeat: -1 });

    this.dayText = this.add.text(40, 50, '', {
      fontFamily: FONT_FAMILY,
      fontSize: '56px',
      fontStyle: 'bold',
      color: CSS.ink,
    });
    this.refreshHeader();
    this.events.on(Phaser.Scenes.Events.WAKE, this.refreshHeader, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.WAKE, this.refreshHeader, this);
    });

    new Button(this, GAME_WIDTH - 170, 90, 'Settings', () => this.openOverlay(SceneKeys.Settings), {
      width: 280,
      height: 120,
      fontSize: 44,
      name: 'btn-settings',
    });
  }

  private refreshHeader(): void {
    this.dayText.setText(`Day ${save().data.day}`);
  }

  private openOrder(): void {
    this.openOverlay(SceneKeys.Order);
  }

  private openOverlay(key: typeof SceneKeys.Order | typeof SceneKeys.Settings): void {
    if (!this.scene.isActive(key)) this.scene.launch(key);
  }
}
