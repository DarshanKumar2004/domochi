import Phaser from 'phaser';

/**
 * Give a text a soft, rounded background instead of Phaser's square one: a
 * plate drawn just behind it that follows it (position, size, visibility,
 * fading, scale) every frame, and goes away with it. Returns the text.
 */
export function roundBg<T extends Phaser.GameObjects.Text>(text: T, color: number, alpha = 1, radius = 22): T {
  const scene = text.scene;
  // The text keeps its padding (so the plate has room) but loses the square fill.
  text.setBackgroundColor('rgba(0,0,0,0)');
  const plate = scene.add.graphics();
  let last = '';
  const sync = () => {
    if (!text.active) return;
    const visible = text.visible && text.alpha > 0;
    const b = text.getBounds();
    const key = `${visible}|${b.x.toFixed(1)}|${b.y.toFixed(1)}|${b.width.toFixed(1)}|${b.height.toFixed(1)}|${text.alpha.toFixed(2)}|${text.depth}`;
    if (key === last) return;
    last = key;
    plate.setDepth(text.depth - 0.001).setVisible(visible).setAlpha(text.alpha);
    plate.clear();
    if (!visible) return;
    plate.fillStyle(color, alpha);
    plate.fillRoundedRect(b.x, b.y, b.width, b.height, Math.min(radius, b.height / 2));
  };
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, sync);
  text.once(Phaser.GameObjects.Events.DESTROY, () => {
    scene.events.off(Phaser.Scenes.Events.POST_UPDATE, sync);
    plate.destroy();
  });
  sync();
  return text;
}
