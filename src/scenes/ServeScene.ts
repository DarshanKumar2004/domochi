import Phaser from 'phaser';
import { orderVerdict } from '../systems/score';
import type { PackedDonut } from '../systems/GameSession';
import { audio, balance, menu, session } from '../systems/services';
import { shareDonut } from '../ui/share';
import { Button } from '../ui/Button';
import { addCard, beginOverlay } from '../ui/overlay';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
import { onLayout } from '../ui/viewport';
import { SceneKeys } from './sceneKeys';

const CARD_W = 860;
const CARD_H = 1100;

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
    // A donut off a moldy tray gets a "funky" comment; a gift in the box gets its own happy line.
    const funky = r?.funky ?? 0;
    const thanks = cust && score ? (funky > 0 ? s.funkyLine(funky) : score.gifts > 0 ? s.giftLine() : s.thanksLine(cust, score.tier)) : '';

    // Everything lives in one container centred on the screen, laid out relative to the card centre.
    const card = this.add.container(0, 0, [addCard(this, CARD_W, CARD_H)]);
    const text = (x: number, y: number, str: string, size: number, opts: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {}) =>
      this.add.text(x, y, str, { fontFamily: FONT_FAMILY, fontSize: `${size}px`, color: CSS.ink, ...opts });
    card.add(text(0, -470, `Order #${this.ticketNo} ${ticket?.delivery ? 'picked up!' : 'served!'}`, 68, { fontStyle: 'bold' }).setOrigin(0.5));
    card.add(text(0, -370, `"${thanks}"`, 40, { fontStyle: 'italic', align: 'center', wordWrap: { width: CARD_W - 120 } }).setOrigin(0.5).setName('serve-thanks'));

    const val = (x: { score: number } | undefined) => (x ? String(x.score) : '—');
    const sideVal = (x: { score: number; missing: number }) => (x.missing ? `${x.score}  (${x.missing} missing!)` : String(x.score));
    const rows: [string, string][] = [
      ['Fry', val(r?.fry)],
      ['Glaze', val(r?.glaze)],
      ['Toppings', val(r?.toppings)],
      ['Box', r?.napkin ? `${val(r.box)}  (napkin!)` : val(r?.box)],
      ...(r?.sides?.kolache ? [['Kolaches', sideVal(r.sides.kolache)] as [string, string]] : []),
      ...(r?.sides?.onigiri ? [['Onigiri', sideVal(r.sides.onigiri)] as [string, string]] : []),
      ['Wait', score ? `${score.wait}  (${Math.round(this.waitMs / 1000)}s)` : `${Math.round(this.waitMs / 1000)}s`],
    ];
    // Kolaches and onigiri make the list longer: closer rows, a little smaller.
    const step = rows.length > 5 ? 330 / (rows.length + 0.2) : 66;
    const font = rows.length > 5 ? 40 : 46;
    rows.forEach(([label, value], i) => {
      const y = -265 + i * step;
      card.add(text(-340, y, label, font).setOrigin(0, 0.5));
      card.add(text(340, y, value, font).setOrigin(1, 0.5).setName(`serve-${label.toLowerCase()}`));
    });
    const line = this.add.graphics();
    line.lineStyle(4, COLORS.ink, 0.2);
    line.lineBetween(-360, 65, 360, 65);
    card.add(line);

    if (score && r) {
      card.add(text(0, 125, `${score.total}  ·  ${orderVerdict(score.total, balance.scoring)}`, 64, { fontStyle: 'bold' }).setOrigin(0.5).setName('serve-total'));
      card.add(
        text(
          0,
          210,
          this.payLine(score.tip, score.giftTip, r.sale ?? 0, r.price ?? r.sale ?? 0),
          score.giftTip > 0 || (r.sale ?? 0) < (r.price ?? 0) ? 32 : 40,
          { color: (r.sale ?? 0) < (r.price ?? 0) ? '#b03a3a' : '#6b5d52', align: 'center', wordWrap: { width: CARD_W - 80 } },
        )
          .setOrigin(0.5)
          .setName('serve-tip'),
      );
    }
    if (score) audio().play(score.tip > 0 ? 'cash' : 'tap');
    // A regular got to know you a bit better (or not).
    const reg = r?.regular;
    if (reg) {
      const max = balance.regulars.maxLevel;
      const hearts = '♥'.repeat(reg.after) + '♡'.repeat(Math.max(0, max - reg.after));
      const how =
        reg.after >= balance.regulars.usualAt && reg.before < balance.regulars.usualAt
          ? 'knows you now: next time, "the usual!"'
          : reg.after > reg.before
            ? 'likes you more!'
            : reg.after < reg.before
              ? 'was a bit let down'
              : 'is a regular';
      card.add(text(0, 300, `${reg.name} ${how}  ${hearts}`, 36, { fontStyle: 'bold', color: '#b0406a', align: 'center', wordWrap: { width: CARD_W - 80 } }).setOrigin(0.5).setName('serve-regular'));
    }

    // Share the best donut in the box (a picture for Instagram and friends).
    let best: PackedDonut | undefined;
    for (const p of r?.packed ?? []) if (p.donut && (!best || p.glazeScore + p.toppingScore > best.glazeScore + best.toppingScore)) best = p;
    const share = best?.donut;
    const flavor = best ? menu.flavors.find((f) => f.id === best.flavorId) : undefined;
    if (share && score) {
      card.add(
        new Button(this, -255, 440, 'Share', () => {
          void shareDonut(this, {
            donut: share,
            title: `my ${flavor?.name ?? 'mochi'} mochi donut`,
            subtitle: `order score ${score.total} · ${orderVerdict(score.total, balance.scoring)}`,
          });
        }, { width: 290, fill: COLORS.dough, name: 'btn-share' }),
      );
    }
    card.add(new Button(this, share && score ? 165 : 0, 440, 'Back to lobby', () => this.close(), { width: share && score ? 480 : 520, name: 'btn-serve-done' }));

    onLayout(this, (v) => {
      const scale = Math.min(1, (v.height - 40) / CARD_H, (v.width - 40) / CARD_W);
      card.setPosition(v.width / 2, v.height / 2).setScale(scale);
    });
  }

  /** What they paid: full price and a tip, less for a poor order, nothing (and a dip in the tip jar) for an awful one. */
  private payLine(tip: number, giftTip: number, sale: number, price: number): string {
    const $ = (n: number) => `$${n.toFixed(2)}`;
    if (sale === 0 && price > 0) return `they wouldn't pay for that!${tip < 0 ? `\nand took ${$(-tip)} back out of the tip jar` : ''}`;
    if (sale < price) return `they only paid ${$(sale)} of ${$(price)}${tip > 0 ? ` · tip ${$(tip)}` : ' · no tip'}`;
    return `tip ${$(tip)}${giftTip > 0 ? ` (+${$(giftTip)} for the gift)` : ''}   ·   sold for ${$(sale)}`;
  }

  /** Back to the lobby (via an invite, if they made one); if that was the last customer, the day is done. */
  private close(): void {
    const s = session();
    if (s.ticket(this.ticketNo)?.results.invite) this.scene.launch(SceneKeys.Invite);
    else if (s.isDayComplete && !s.isTutorial) this.scene.launch(SceneKeys.DaySummary);
    this.scene.stop();
  }
}
