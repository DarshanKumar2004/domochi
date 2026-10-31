import Phaser from 'phaser';
import { orderVerdict } from '../systems/score';
import { audio, balance, session } from '../systems/services';
import { Button } from '../ui/Button';
import { addCard, beginOverlay } from '../ui/overlay';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
import { onLayout } from '../ui/viewport';
import { SceneKeys } from './sceneKeys';

const CARD_W = 860;
const CARD_H = 1000;

/** Result card after handing an order over: each station's score, the order score, the reaction and the tip. */
export class ServeScene extends Phaser.Scene {
  private ticketNo = 0;
  private waitMs = 0;

  constructor() {
    super(SceneKeys.Serve);
  }

  init(data: { ticketNo: number; waitMs: number }): void {
    this.ticketNo = data.ticketNo;
    this.waitMs = data.waitMs;
  }

  create(): void {
    beginOverlay(this);
    const s = session();
    const ticket = s.ticket(this.ticketNo);
    const cust = ticket ? s.customer(ticket.customerId) : undefined;
    const r = ticket?.results;
    const score = r?.score;
    // A gift in the box gets its own happy line.
    const thanks = cust && score ? (score.gifts > 0 ? s.giftLine() : s.thanksLine(cust, score.tier)) : '';

    // Everything lives in one container centred on the screen, laid out relative to the card centre.
    const card = this.add.container(0, 0, [addCard(this, CARD_W, CARD_H)]);
    const text = (x: number, y: number, str: string, size: number, opts: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {}) =>
      this.add.text(x, y, str, { fontFamily: FONT_FAMILY, fontSize: `${size}px`, color: CSS.ink, ...opts });
    card.add(text(0, -425, `Order #${this.ticketNo} served!`, 68, { fontStyle: 'bold' }).setOrigin(0.5));
    card.add(text(0, -335, `"${thanks}"`, 40, { fontStyle: 'italic', align: 'center', wordWrap: { width: CARD_W - 120 } }).setOrigin(0.5).setName('serve-thanks'));

    const val = (x: { score: number } | undefined) => (x ? String(x.score) : '—');
    const rows: [string, string][] = [
      ['Fry', val(r?.fry)],
      ['Glaze', val(r?.glaze)],
      ['Toppings', val(r?.toppings)],
      ['Box', val(r?.box)],
      ['Wait', score ? `${score.wait}  (${Math.round(this.waitMs / 1000)}s)` : `${Math.round(this.waitMs / 1000)}s`],
    ];
    rows.forEach(([label, value], i) => {
      const y = -235 + i * 66;
      card.add(text(-340, y, label, 46).setOrigin(0, 0.5));
      card.add(text(340, y, value, 46).setOrigin(1, 0.5).setName(`serve-${label.toLowerCase()}`));
    });
    const line = this.add.graphics();
    line.lineStyle(4, COLORS.ink, 0.2);
    line.lineBetween(-360, 95, 360, 95);
    card.add(line);

    if (score) {
      card.add(text(0, 160, `${score.total}  ·  ${orderVerdict(score.total, balance.scoring)}`, 64, { fontStyle: 'bold' }).setOrigin(0.5).setName('serve-total'));
      card.add(
        text(
          0,
          245,
          `tip $${score.tip.toFixed(2)}${score.giftTip > 0 ? ` (+$${score.giftTip.toFixed(2)} for the gift)` : ''}   ·   sold for $${(r?.sale ?? 0).toFixed(2)}`,
          score.giftTip > 0 ? 34 : 40,
          { color: '#6b5d52' },
        )
          .setOrigin(0.5)
          .setName('serve-tip'),
      );
    }
    if (score) audio().play(score.tip > 0 ? 'cash' : 'tap');
    card.add(new Button(this, 0, 380, 'Back to lobby', () => this.close(), { name: 'btn-serve-done' }));

    onLayout(this, (v) => {
      const scale = Math.min(1, (v.height - 40) / CARD_H, (v.width - 40) / CARD_W);
      card.setPosition(v.width / 2, v.height / 2).setScale(scale);
    });
  }

  /** Back to the lobby; if that was the last customer, the day is done. */
  private close(): void {
    if (session().isDayComplete && !session().isTutorial) this.scene.launch(SceneKeys.DaySummary);
    this.scene.stop();
  }
}
