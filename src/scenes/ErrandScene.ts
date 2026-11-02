import Phaser from 'phaser';
import type { Errand } from '../systems/supplies';
import { audio } from '../systems/services';
import { Button } from '../ui/Button';
import { addCard, beginOverlay } from '../ui/overlay';
import { CSS, FONT_FAMILY } from '../ui/theme';
import { onLayout } from '../ui/viewport';
import { SceneKeys } from './sceneKeys';

const CARD_W = 860;
const CARD_H = 800;

const money = (n: number) => `$${n.toFixed(2)}`;

/**
 * You were out of baking materials, so one of Ethan's friends ran to the
 * store: here's what they brought, and what it cost (the supplies plus a
 * little fee for their trouble, paid from your cash). You can't bake without
 * it, so there's nothing to decide.
 */
export class ErrandScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Errand);
  }

  create(data: { name?: string; line?: string; errand?: Errand }): void {
    beginOverlay(this);
    const e = data.errand;
    if (!e) {
      this.scene.stop();
      return;
    }
    audio().play('cash');
    const card = this.add.container(0, 0, [addCard(this, CARD_W, CARD_H)]).setName('errand-card');
    const text = (y: number, s: string, size: number, opts: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {}) =>
      this.add.text(0, y, s, { fontFamily: FONT_FAMILY, fontSize: `${size}px`, color: CSS.ink, align: 'center', wordWrap: { width: CARD_W - 120 }, ...opts }).setOrigin(0.5);
    const total = e.cost + e.fee;
    const packs = e.items.map((i) => `${i.packs} ${i.name}`).join('  ·  ');
    // Stacked top to bottom, each under the last (the friend's line can run long).
    let y = -CARD_H / 2 + 70;
    const stack = (t: Phaser.GameObjects.Text, gap: number) => {
      t.setOrigin(0.5, 0).setY(y);
      y += t.height + gap;
      card.add(t);
    };
    stack(text(0, `${data.name ?? 'a friend'} swung by!`, 64, { fontStyle: 'bold' }), 24);
    stack(text(0, `"${data.line ?? 'I ran to the store for you!'}"`, 40, { fontStyle: 'italic' }), 30);
    stack(text(0, packs, 36, { fontStyle: 'bold', color: '#6b5d52' }), 20);
    stack(text(0, `supplies ${money(e.cost)} + ${money(e.fee)} for the errand = ${money(total)}\n(paid from your cash)`, 36, { color: '#6b5d52' }).setName('errand-total'), 0);
    card.add(new Button(this, 0, 270, 'Thanks!', () => this.close(), { width: 520, name: 'btn-errand-ok' }));

    onLayout(this, (v) => {
      const scale = Math.min(1, (v.height - 40) / CARD_H, (v.width - 40) / CARD_W);
      card.setPosition(v.width / 2, v.height / 2).setScale(scale);
    });
  }

  private close(): void {
    audio().play('tap');
    this.scene.stop();
  }
}
