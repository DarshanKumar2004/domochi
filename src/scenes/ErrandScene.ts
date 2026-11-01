import Phaser from 'phaser';
import { audio, session } from '../systems/services';
import { Button } from '../ui/Button';
import { addCard, beginOverlay } from '../ui/overlay';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
import { onLayout } from '../ui/viewport';
import { SceneKeys } from './sceneKeys';

const CARD_W = 860;
const CARD_H = 920;

const money = (n: number) => `$${n.toFixed(2)}`;

/**
 * You're out of baking materials and one of Ethan's friends offers a run to
 * the store: they bring the supplies, and you pay for them plus a little fee
 * for their trouble. Or not.
 */
export class ErrandScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Errand);
  }

  create(data: { name?: string; line?: string }): void {
    beginOverlay(this);
    const e = session().errandOffer;
    if (!e) {
      this.scene.stop();
      return;
    }
    audio().play('chime');
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
    stack(text(0, `"${data.line ?? 'want me to run to the store?'}"`, 40, { fontStyle: 'italic' }), 30);
    stack(text(0, packs, 36, { fontStyle: 'bold', color: '#6b5d52' }), 20);
    stack(text(0, `supplies ${money(e.cost)} + ${money(e.fee)} for the errand = ${money(total)}`, 36, { color: '#6b5d52' }).setName('errand-total'), 0);
    card.add(new Button(this, 0, 170, `Yes please! (${money(total)})`, () => this.answer(true), { width: 620, name: 'btn-errand-yes' }));
    card.add(new Button(this, 0, 330, 'No thanks', () => this.answer(false), { width: 620, fill: COLORS.dough, name: 'btn-errand-no' }));

    onLayout(this, (v) => {
      const scale = Math.min(1, (v.height - 40) / CARD_H, (v.width - 40) / CARD_W);
      card.setPosition(v.width / 2, v.height / 2).setScale(scale);
    });
  }

  private answer(yes: boolean): void {
    if (session().answerErrand(yes)) audio().play('cash');
    this.scene.stop();
  }
}
