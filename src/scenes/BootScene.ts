import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { ringBallCenters, ringBallRadius } from '../stations/donutGeometry';

/** Phase 0 placeholder: proves Phaser, scaling and touch input work. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2 - 150;

    this.add
      .text(cx, 380, 'Domochi Donuts', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '110px',
        fontStyle: 'bold',
        color: '#fff4e0',
      })
      .setOrigin(0.5);

    const donut = this.add.container(cx, cy);
    const g = this.add.graphics();
    const ringRadius = 190;
    const ballRadius = ringBallRadius(ringRadius);
    for (const p of ringBallCenters(0, 0, ringRadius)) {
      g.fillStyle(COLORS.dough, 1);
      g.fillCircle(p.x, p.y, ballRadius);
      g.lineStyle(6, 0xb8854a, 1);
      g.strokeCircle(p.x, p.y, ballRadius);
    }
    donut.add(g);

    this.tweens.add({ targets: donut, angle: 360, duration: 12000, repeat: -1 });

    const prompt = this.add
      .text(cx, GAME_HEIGHT - 420, 'Tap to start', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '64px',
        color: '#f28cb1',
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });

    this.input.once('pointerdown', () => {
      prompt.setText("Let's make donuts!");
    });
  }
}
