import Phaser from 'phaser';
import { TextureKeys } from '../assets/keys';
import { menu, session } from '../systems/services';
import { Button } from '../ui/Button';
import type { Viewport } from '../ui/layout';
import { CSS, FONT_FAMILY } from '../ui/theme';
import { TicketCard } from '../ui/TicketCard';
import { getViewport } from '../ui/viewport';
import { getHud } from './flow';
import { listen } from './listen';
import { SceneKeys } from './sceneKeys';
import { StationScene } from './StationScene';

/**
 * Until Phase 5 (drag donuts into the box), closing the lid packs the
 * best-matching glazed donuts from the shelf and hands the box straight to
 * the customer.
 */
export class BoxScene extends StationScene {
  private box!: Phaser.GameObjects.Image;
  private serveButton!: Button;
  private hint!: Phaser.GameObjects.Text;
  private shelfText!: Phaser.GameObjects.Text;
  private card: TicketCard | null = null;

  constructor() {
    super(SceneKeys.Box, 'Box Station', 0x5a6b4a, 5);
  }

  protected buildStation(): void {
    this.card = null;
    this.box = this.add.image(0, 0, TextureKeys.DonutBox);
    this.hint = this.add
      .text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: '40px', color: CSS.cream, align: 'center' })
      .setOrigin(0.5);
    this.shelfText = this.add
      .text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: '36px', color: CSS.muted, align: 'center' })
      .setOrigin(0.5)
      .setName('box-shelf');
    this.serveButton = new Button(this, 0, 0, 'Close lid & serve', () => this.serve(), {
      width: 640,
      name: 'btn-serve',
    });
    listen(this, session().events, 'changed', () => this.refresh());
  }

  protected layoutStation(v: Viewport): void {
    const c = v.content;
    if (v.orientation === 'landscape') {
      this.box.setPosition(c.x + 520, c.y + 440).setScale(1);
      this.hint.setPosition(c.x + 1250, c.y + 400);
      this.shelfText.setPosition(c.x + 1250, c.y + 605);
      this.serveButton.setPosition(c.x + 1250, c.y + 700);
    } else {
      this.box.setPosition(c.x + 540, c.y + 470).setScale(1.1);
      this.hint.setPosition(c.x + 540, c.y + 1010);
      this.shelfText.setPosition(c.x + 540, c.y + 1300);
      this.serveButton.setPosition(c.x + 540, c.y + 1420);
    }
    this.refresh();
  }

  /** Show the selected ticket (or why there's nothing to serve) and what's on the shelf. */
  private refresh(): void {
    const s = session();
    const v = getViewport(this);
    const c = v.content;
    this.card?.destroy();
    this.card = null;

    const active = s.activeTicket;
    if (!active) {
      this.hint.setText('no order selected.\ntake an order in the Lobby,\nthen tap its ticket up top.').setVisible(true);
    } else {
      this.hint.setVisible(false);
      const L = v.orientation === 'landscape';
      this.card = new TicketCard(this, c.x + (L ? 1250 : 540), c.y + (L ? 330 : 1000), active, menu).setScale(L ? 0.85 : 1);
    }
    const n = s.shelf.length;
    this.shelfText.setText(n ? `${n} glazed donut${n === 1 ? '' : 's'} on the shelf` : 'the glazed shelf is empty!');
    this.serveButton.setEnabled(!!active);
  }

  /** Close the lid: pack the best shelf donuts and hand the box to the customer. */
  private serve(): void {
    const s = session();
    if (!s.activeTicket) return;
    const served = s.serveActiveTicket();
    getHud(this).goTo(SceneKeys.Lobby);
    this.scene.launch(SceneKeys.Serve, { ticketNo: served.ticket.no, waitMs: served.waitMs });
  }
}
