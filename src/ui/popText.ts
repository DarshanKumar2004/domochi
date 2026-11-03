import Phaser from 'phaser';
import { CSS, FONT_FAMILY } from './theme';

/** A short word for a 0–100 score, for the pop-ups. */
export function scoreWord(score: number): string {
  if (score >= 90) return 'perfect!';
  if (score >= 70) return 'nice!';
  if (score >= 45) return 'okay';
  return 'oops';
}

/** The pop-up's colour for a 0–100 score: gold, green, orange, red. */
function scoreColor(score: number): string {
  if (score >= 90) return '#f2b632';
  if (score >= 70) return '#7fd1ae';
  if (score >= 45) return '#f0a23a';
  return '#ff8a7a';
}

/**
 * A score that floats up and fades where something just happened ("92 perfect!"):
 * the station's quick feedback, so you know how that went without waiting
 * for the result card. `score` is 0–100; `label` replaces the word.
 */
export function popScore(scene: Phaser.Scene, x: number, y: number, score: number, label?: string): void {
  const s = Math.round(score);
  const t = scene.add
    .text(x, y, `${s}  ${label ?? scoreWord(s)}`, {
      fontFamily: FONT_FAMILY,
      fontSize: '52px',
      fontStyle: 'bold',
      color: scoreColor(s),
      stroke: CSS.ink,
      strokeThickness: 10,
    })
    .setOrigin(0.5)
    .setDepth(60)
    .setScale(0.6)
    .setName('score-pop');
  scene.tweens.add({ targets: t, scale: 1, duration: 180, ease: 'Back.Out' });
  scene.tweens.add({ targets: t, y: y - 110, alpha: 0, delay: 650, duration: 650, ease: 'Cubic.In', onComplete: () => t.destroy() });
}
