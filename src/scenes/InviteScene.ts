import Phaser from 'phaser';
import { audio, session } from '../systems/services';
import { Button } from '../ui/Button';
import { addCard, beginOverlay } from '../ui/overlay';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
import { onLayout } from '../ui/viewport';
import { SceneKeys } from './sceneKeys';

const CARD_W = 860;
const CARD_H = 760;

/**
 * A happy customer invites domochi to their event. Accepting makes tomorrow a
 * pop-up booth day there: more customers, bigger tips, no morning pickups.
 */
export class InviteScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Invite);
  }

  create(): void {
    beginOverlay(this);
    const ev = session().invite;
    if (!ev) {
      this.scene.stop();
      return;
    }
    audio().play('chime');
    const card = this.add.container(0, 0, [addCard(this, CARD_W, CARD_H)]).setName('invite-card');
    const text = (y: number, s: string, size: number, opts: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {}) =>
      this.add.text(0, y, s, { fontFamily: FONT_FAMILY, fontSize: `${size}px`, color: CSS.ink, align: 'center', wordWrap: { width: CARD_W - 120 }, ...opts }).setOrigin(0.5);
    card.add(text(-300, "you're invited!", 70, { fontStyle: 'bold' }));
    card.add(text(-170, `"${ev.invite}"`, 42, { fontStyle: 'italic' }));
    card.add(
      text(-10, `say yes and tomorrow is a domochi pop-up at ${ev.name}: more customers and bigger tips (no morning pickups).`, 36, {
        color: '#6b5d52',
      }),
    );
    card.add(new Button(this, 0, 170, "Yes, we'll be there!", () => this.answer(true), { width: 620, name: 'btn-invite-accept' }));
    card.add(new Button(this, 0, 310, 'Not this time', () => this.answer(false), { width: 620, fill: COLORS.dough, name: 'btn-invite-decline' }));

    onLayout(this, (v) => {
      const scale = Math.min(1, (v.height - 40) / CARD_H, (v.width - 40) / CARD_W);
      card.setPosition(v.width / 2, v.height / 2).setScale(scale);
    });
  }

  private answer(yes: boolean): void {
    session().answerInvite(yes);
    if (yes) audio().play('fanfare');
    this.scene.stop();
  }
}
