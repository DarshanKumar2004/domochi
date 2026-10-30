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
 * Phase 2: shows the selected ticket and boxes it. Dragging donuts into the
 * box slots arrives in Phase 5.
 */
export class BoxScene extends StationScene {
  private box!: Phaser.GameObjects.Image;
  private serveButton!: Button;
  private hint!: Phaser.GameObjects.Text;
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
      this.serveButton.setPosition(c.x + 1250, c.y + 700);
    } else {
      this.box.setPosition(c.x + 540, c.y + 470).setScale(1.1);
      this.hint.setPosition(c.x + 540, c.y + 1010);
      this.serveButton.setPosition(c.x + 540, c.y + 1420);
    }
    this.refresh();
  }

  /** Show the active ticket (or why there's nothing to box). */
  private refresh(): void {
    const s = session();
    const v = getViewport(this);
    const c = v.content;
    this.card?.destroy();
    this.card = null;

    const held = s.heldTicket;
    const active = s.activeTicket;
    if (held) {
      this.hint.setText(`you're holding box #${held.no}.\nhand it over in the Lobby first!`).setVisible(true);
    } else if (!active) {
      this.hint.setText('no order selected.\ntake an order in the Lobby,\nthen tap its ticket up top.').setVisible(true);
    } else {
      this.hint.setVisible(false);
      const L = v.orientation === 'landscape';
      this.card = new TicketCard(this, c.x + (L ? 1250 : 540), c.y + (L ? 360 : 1000), active, menu).setScale(L ? 0.9 : 1);
    }
    this.serveButton.setEnabled(!held && !!active);
  }

  /** Close the box and carry it back to the Lobby to hand over. */
  private serve(): void {
    session().boxActiveTicket();
    getHud(this).goTo(SceneKeys.Lobby);
  }
}
