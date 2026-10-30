import Phaser from 'phaser';
import { TextureKeys } from '../assets/keys';
import { save } from '../systems/services';
import { Button } from '../ui/Button';
import type { Viewport } from '../ui/layout';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
import { Truck } from '../ui/Truck';
import { onLayout } from '../ui/viewport';
import { SceneKeys } from './sceneKeys';

/** Positions inside the content area, per orientation. */
const LAYOUT = {
  portrait: {
    groundY: 1000,
    // Truck y puts the wheels on the ground line.
    truck: { x: 540, y: 760, scale: 0.9 },
    sign: { x: 120, feetY: 1130, scale: 0.75 },
    line: { x: [560, 760, 960], feetY: 1590 },
    tagY: 1190,
    waiting: { x: 200, y: 1460, labelY: 1630 },
  },
  landscape: {
    groundY: 560,
    truck: { x: 480, y: 365, scale: 0.75 },
    sign: { x: 880, feetY: 670, scale: 0.7 },
    line: { x: [1060, 1260, 1460], feetY: 880 },
    tagY: 480,
    waiting: { x: 1740, y: 700, labelY: 870 },
  },
} as const;

/** The lot by domochi's trailer. Phase 1: static line of placeholder customers. */
export class LobbyScene extends Phaser.Scene {
  private dayText!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKeys.Lobby);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.sky);
    const ground = this.add.graphics();
    const truck = new Truck(this, 0, 0);
    const sign = this.add.image(0, 0, TextureKeys.SignAFrame).setOrigin(0.5, 1);

    // Waiting area (customers move here after ordering, Phase 2).
    const waiting = this.add.rectangle(0, 0, 300, 260, 0xffffff, 0.25).setStrokeStyle(6, COLORS.ink, 0.35);
    const waitingLabel = this.add
      .text(0, 0, 'Waiting', { fontFamily: FONT_FAMILY, fontSize: '40px', color: CSS.ink })
      .setOrigin(0.5);

    // Customer line: front of the line is nearest the truck.
    const customers = [0, 1, 2].map((i) => {
      const c = this.add.image(0, 0, TextureKeys.Customer).setOrigin(0.5, 1);
      if (i === 0) {
        c.setName('customer-front').setInteractive({ useHandCursor: true });
        c.on(Phaser.Input.Events.POINTER_UP, () => this.openOverlay(SceneKeys.Order));
      } else {
        c.setAlpha(0.85);
      }
      return c;
    });
    const tag = this.add
      .text(0, 0, 'Tap me!', {
        fontFamily: FONT_FAMILY,
        fontSize: '42px',
        fontStyle: 'bold',
        color: CSS.ink,
        backgroundColor: CSS.cream,
        padding: { x: 18, y: 10 },
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: tag, scale: 1.1, duration: 500, yoyo: true, repeat: -1 });

    this.dayText = this.add.text(0, 0, '', {
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

    const settings = new Button(this, 0, 0, 'Settings', () => this.openOverlay(SceneKeys.Settings), {
      width: 280,
      height: 120,
      fontSize: 44,
      name: 'btn-settings',
    });

    onLayout(this, (v: Viewport) => {
      const L = LAYOUT[v.orientation];
      const c = v.content;
      const groundY = c.y + L.groundY;

      // The ground fills the whole screen width and runs under the tab bar.
      ground.clear();
      ground.fillStyle(COLORS.concrete);
      ground.fillRect(0, groundY, v.width, v.height - groundY);
      ground.fillStyle(0xf4f2ee);
      for (let x = 60; x < v.width; x += 240) ground.fillRect(x, groundY + 53, 120, 14);

      truck.setPosition(c.x + L.truck.x, c.y + L.truck.y).setScale(L.truck.scale);
      sign.setPosition(c.x + L.sign.x, c.y + L.sign.feetY).setScale(L.sign.scale);
      customers.forEach((cust, i) => cust.setPosition(c.x + (L.line.x[i] ?? 0), c.y + L.line.feetY));
      tag.setPosition(c.x + L.line.x[0], c.y + L.tagY);
      waiting.setPosition(c.x + L.waiting.x, c.y + L.waiting.y);
      waitingLabel.setPosition(c.x + L.waiting.x, c.y + L.waiting.labelY);

      // HUD chrome hugs the real screen corners, not the safe area.
      this.dayText.setPosition(40, 50);
      settings.setPosition(v.width - 170, 90);
    });
  }

  private refreshHeader(): void {
    this.dayText.setText(`Day ${save().data.day}`);
  }

  private openOverlay(key: typeof SceneKeys.Order | typeof SceneKeys.Settings): void {
    if (!this.scene.isActive(key)) this.scene.launch(key);
  }
}
