import Phaser from 'phaser';
import brand from '../data/brand.json';
import { flavorsForDay } from '../systems/menu';
import { audio, menu, save, session } from '../systems/services';
import { Button } from '../ui/Button';
import { addCard, beginOverlay } from '../ui/overlay';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
import { onLayout } from '../ui/viewport';
import { startMainGame, stopMainGame } from './flow';
import { SceneKeys } from './sceneKeys';

const CARD_W = 860;
const CARD_H = 1180;

const money = (n: number) => `$${n.toFixed(2)}`;

/**
 * End of the day: how it went, what you earned, what's new tomorrow. Starting
 * the next day banks the money, saves, and opens a fresh day at the trailer.
 */
export class DaySummaryScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.DaySummary);
  }

  create(): void {
    beginOverlay(this, 0.7);
    audio().play('fanfare');
    const s = session();
    const sum = s.summary();
    const bank = save().data.money;
    const today = sum.sales + sum.tips + sum.tidyBonus;
    const known = new Set(flavorsForDay(menu, sum.day).map((f) => f.id));
    const fresh = flavorsForDay(menu, sum.day + 1).filter((f) => !known.has(f.id));

    const card = this.add.container(0, 0, [addCard(this, CARD_W, CARD_H)]).setName('day-summary');
    const text = (x: number, y: number, str: string, size: number, opts: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {}) =>
      this.add.text(x, y, str, { fontFamily: FONT_FAMILY, fontSize: `${size}px`, color: CSS.ink, ...opts });

    card.add(text(0, -510, `day ${sum.day} done!`, 76, { fontStyle: 'bold' }).setOrigin(0.5));
    card.add(text(0, -435, sum.event ? `what a pop-up at ${sum.event}!` : brand.tagline, 34, { fontStyle: 'italic', color: '#6b5d52' }).setOrigin(0.5));

    const rows: [string, string, string][] = [
      ['customers served', `${sum.served}`, 'served'],
      ['average order', `${sum.averageScore}`, 'average'],
      ['best order', `${sum.bestScore}`, 'best'],
      ['reactions', `${sum.tiers.great} great · ${sum.tiers.good} good · ${sum.tiers.okay + sum.tiers.bad} meh`, 'reactions'],
      ['donuts thrown away', `${sum.trashed}`, 'trashed'],
      ['donuts gifted', `${sum.gifts}`, 'gifts'],
      ...(sum.pickups ? [['pickups done', `${sum.pickups}`, 'pickups'] as [string, string, string]] : []),
      ...(sum.tidy === null ? [] : [['clean-up', sum.tidy ? `tidy! +${money(sum.tidyBonus)}` : 'skipped', 'cleanup'] as [string, string, string]]),
      ['sales', money(sum.sales), 'sales'],
      ['tips', money(sum.tips), 'tips'],
    ];
    rows.forEach(([label, value, name], i) => {
      const y = -365 + i * (rows.length > 9 ? 54 : 60);
      card.add(text(-360, y, label, 40).setOrigin(0, 0.5));
      card.add(text(360, y, value, 40, { fontStyle: 'bold' }).setOrigin(1, 0.5).setName(`summary-${name}`));
    });
    const line = this.add.graphics();
    line.lineStyle(4, COLORS.ink, 0.2);
    line.lineBetween(-370, 165, 370, 165);
    card.add(line);
    card.add(text(0, 225, `today ${money(today)}   ·   total ${money(bank + today)}`, 44, { fontStyle: 'bold' }).setOrigin(0.5).setName('summary-total'));
    card.add(
      text(0, 315, [sum.nextEvent ? `tomorrow: pop-up at ${sum.nextEvent}!` : '', fresh.length ? `new tomorrow: ${fresh.map((f) => f.name).join(', ')}!` : sum.nextEvent ? '' : 'same menu tomorrow'].filter(Boolean).join('\n'), 38, {
        color: fresh.length || sum.nextEvent ? '#b0406a' : '#6b5d52',
        fontStyle: fresh.length || sum.nextEvent ? 'bold' : 'normal',
        align: 'center',
        wordWrap: { width: CARD_W - 100 },
      })
        .setOrigin(0.5)
        .setName('summary-unlocks'),
    );
    card.add(new Button(this, 0, 465, `Start day ${sum.day + 1}`, () => this.nextDay(), { width: 560, name: 'btn-next-day' }));

    onLayout(this, (v) => {
      const scale = Math.min(1, (v.height - 40) / CARD_H, (v.width - 40) / CARD_W);
      card.setPosition(v.width / 2, v.height / 2).setScale(scale);
    });
  }

  /** Bank today's money, save, and start the next day fresh. */
  private nextDay(): void {
    const s = session();
    const sum = s.summary();
    const invite = s.inviteWasAccepted ? s.invite : undefined;
    void save().update((d) => {
      d.day = sum.day + 1;
      d.money = Math.round((d.money + sum.sales + sum.tips + sum.tidyBonus) * 100) / 100;
      // Book tomorrow's pop-up (or drop a booking that's been and gone).
      if (invite) d.event = { id: invite.id, day: sum.day + 1 };
      else if (d.event && d.event.day <= sum.day) delete d.event;
      d.served += sum.served;
      d.bestOrder = Math.max(d.bestOrder, sum.bestScore);
    });
    stopMainGame(this);
    startMainGame(this);
  }
}
