import Phaser from 'phaser';
import { session } from '../systems/services';
import { Button } from '../ui/Button';
import { addCard, beginOverlay } from '../ui/overlay';
import { CSS, FONT_FAMILY } from '../ui/theme';
import { onLayout } from '../ui/viewport';
import { SceneKeys } from './sceneKeys';

const ROWS = ['Glaze', 'Toppings', 'Box'];
const CARD_W = 860;
const CARD_H = 900; // fits both orientations (landscape height is 1080)

/** Result card after handing an order over. Station scores and tips arrive in Phase 6. */
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
    // Until scoring exists (Phase 6), every order gets a 'good' reaction.
    const thanks = cust ? s.thanksLine(cust, 'good') : '';

    // Everything lives in one container centred on the screen, laid out relative to the card centre.
    const card = this.add.container(0, 0, [addCard(this, CARD_W, CARD_H)]);
    card.add(
      this.add
        .text(0, -370, `Order #${this.ticketNo} served!`, { fontFamily: FONT_FAMILY, fontSize: '72px', fontStyle: 'bold', color: CSS.ink })
        .setOrigin(0.5),
    );
    card.add(
      this.add
        .text(0, -270, `"${thanks}"`, {
          fontFamily: FONT_FAMILY,
          fontSize: '42px',
          fontStyle: 'italic',
          color: CSS.ink,
          align: 'center',
          wordWrap: { width: CARD_W - 120 },
        })
        .setOrigin(0.5),
    );

    const rowStyle = { fontFamily: FONT_FAMILY, fontSize: '50px', color: CSS.ink };
    const fry = ticket?.results.fry;
    const rows: [string, string][] = [
      ['Fry', fry ? String(fry.score) : 'not fried'],
      ...ROWS.map((r): [string, string] => [r, '—']),
      ['Wait time', `${Math.round(this.waitMs / 1000)}s`],
    ];
    rows.forEach(([label, value], i) => {
      const y = -170 + i * 80;
      card.add(this.add.text(-340, y, label, rowStyle).setOrigin(0, 0.5));
      card.add(this.add.text(340, y, value, rowStyle).setOrigin(1, 0.5).setName(`serve-${label.toLowerCase().replace(' ', '-')}`));
    });
    card.add(
      this.add
        .text(0, 245, 'Tip: — (scoring arrives in Phase 6)', { fontFamily: FONT_FAMILY, fontSize: '40px', fontStyle: 'bold', color: CSS.ink })
        .setOrigin(0.5),
    );
    card.add(new Button(this, 0, 360, 'Back to lobby', () => this.scene.stop(), { name: 'btn-serve-done' }));

    onLayout(this, (v) => card.setPosition(v.width / 2, v.height / 2));
  }
}
