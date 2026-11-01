import Phaser from 'phaser';
import brand from '../data/brand.json';
import { flavorsForDay } from '../systems/menu';
import { addPage, dayNote, dayStars, nextMilestone, type JournalPage, type Milestone } from '../systems/journal';
import { createRng } from '../systems/rng';
import { couponCode, earnsCoupon } from '../systems/coupons';
import { audio, balance, feedback, journalData, menu, save, session, stickers } from '../systems/services';
import { drawFinishedDonut } from '../ui/donutArt';
import { Button } from '../ui/Button';
import { addCard, beginOverlay } from '../ui/overlay';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
import { onLayout } from '../ui/viewport';
import { startMainGame, stopMainGame } from './flow';
import { SceneKeys } from './sceneKeys';

const CARD_W = 860;
const CARD_H = 1320;

/** Size of a journal doodle (the day's best donut), px. Small: it lives in the save. */
const DOODLE_PX = 160;

const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2)}`;

/**
 * End of the day: how it went, what you earned, what went to waste, what's
 * new tomorrow. Carrying on banks the money and the supplies left, saves, and
 * opens the supply store before the next day.
 */
export class DaySummaryScene extends Phaser.Scene {
  private coupon: string | undefined;
  constructor() {
    super(SceneKeys.DaySummary);
  }

  create(): void {
    beginOverlay(this, 0.7);
    audio().play('fanfare');
    const s = session();
    const sum = s.summary();
    const bank = save().data.money;
    const today = sum.sales + sum.tips + sum.tidyBonus + sum.goalBonus;
    const counted = s.tracksSupplies;
    // A great day (once Ethan's coupons are on) earns a code to show at the real truck.
    const earns = earnsCoupon(brand.coupons, sum.day, dayStars(sum));
    if (earns && !save().data.playerId) {
      const id = Math.random().toString(36).slice(2, 10);
      void save().update((d) => void (d.playerId = id));
    }
    const coupon = earns ? couponCode(sum.day, save().data.playerId) : undefined;
    this.coupon = coupon;
    // The day's stickers (finishing the day, a tidy close, no waste...).
    const tracker = stickers();
    tracker?.endOfDay(sum, counted);
    const earned = (tracker?.today ?? []).map((id) => journalData.stickers.find((st) => st.id === id)).filter((st) => !!st);
    const known = new Set(flavorsForDay(menu, sum.day).map((f) => f.id));
    const fresh = flavorsForDay(menu, sum.day + 1).filter((f) => !known.has(f.id));

    const card = this.add.container(0, 0, [addCard(this, CARD_W, CARD_H)]).setName('day-summary');
    const text = (x: number, y: number, str: string, size: number, opts: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {}) =>
      this.add.text(x, y, str, { fontFamily: FONT_FAMILY, fontSize: `${size}px`, color: CSS.ink, ...opts });

    card.add(text(0, -510, `day ${sum.day} done!`, 76, { fontStyle: 'bold' }).setOrigin(0.5));
    // How the day went: up to three stars, popping in one by one.
    const stars = dayStars(sum);
    for (let i = 0; i < 3; i++) {
      const st = text(-90 + i * 90, -590, i < stars ? '★' : '☆', 72, { color: i < stars ? '#e8a33a' : '#c9bfb4', fontStyle: 'bold' }).setOrigin(0.5).setScale(0);
      card.add(st);
      this.tweens.add({ targets: st, scale: 1, delay: 250 + i * 220, duration: 320, ease: 'Back.Out', onStart: () => i < stars && audio().play('ding') });
    }
    card.add(text(0, -435, sum.event ? `what a pop-up at ${sum.event}!` : brand.tagline, 34, { fontStyle: 'italic', color: '#6b5d52' }).setOrigin(0.5));

    type Row = [string, string, string];
    const rows: Row[] = [
      ['customers served', `${sum.served}${sum.wentHome ? ` (${sum.wentHome} went home)` : ''}`, 'served'],
      ['average order', `${sum.averageScore}  (best ${sum.bestScore})`, 'average'],
      ['reactions', `${sum.tiers.great} great · ${sum.tiers.good} good · ${sum.tiers.okay + sum.tiers.bad} meh`, 'reactions'],
      ['donuts gifted', `${sum.gifts}`, 'gifts'],
      ...(sum.pickups ? [['pickups done', `${sum.pickups}`, 'pickups'] as Row] : []),
      ...(sum.tidy === null ? [] : [['clean-up', sum.tidy ? `tidy! +${money(sum.tidyBonus)}` : 'skipped', 'cleanup'] as Row]),
      ['sales', money(sum.sales), 'sales'],
      ['tips', money(sum.tips), 'tips'],
      // Waste: thrown away, plus whatever was made (or left in the tub) and not sold.
      counted
        ? ['wasted', `${sum.wasted} donut${sum.wasted === 1 ? '' : 's'}  −${money(sum.wasteCost)}`, 'waste']
        : ['donuts thrown away', `${sum.trashed}`, 'waste'],
      ...(sum.goal ? [['daily goal', sum.goalBonus ? `done! +${money(sum.goalBonus)}` : 'missed', 'goal'] as Row] : []),
      ...(sum.bestStreak >= 2 ? [['best streak', `${sum.bestStreak} in a row`, 'streak'] as Row] : []),
      ...(sum.specialsSold ? [["special sold", `${sum.specialsSold}`, 'specials'] as Row] : []),
      ...(coupon ? [['your coupon', coupon, 'coupon'] as Row] : []),
      ...(earned.length ? [['new stickers', earned.map((st) => st.glyph).join(' '), 'stickers'] as Row] : []),
      ...(counted && sum.suppliesCost - sum.wasteCost >= 0.005 ? [['other supplies used', `−${money(Math.max(0, sum.suppliesCost - sum.wasteCost))}`, 'supplies'] as Row] : []),
    ];
    rows.forEach(([label, value, name], i) => {
      const y = -365 + i * Math.min(60, 565 / Math.max(1, rows.length - 1));
      card.add(text(-360, y, label, 40).setOrigin(0, 0.5));
      card.add(text(360, y, value, 40, { fontStyle: 'bold' }).setOrigin(1, 0.5).setName(`summary-${name}`));
    });
    const line = this.add.graphics();
    line.lineStyle(4, COLORS.ink, 0.2);
    line.lineBetween(-370, 225, 370, 225);
    card.add(line);
    card.add(
      text(0, 285, counted ? `profit ${money(sum.profit)}   ·   cash ${money(bank + today)}` : `today ${money(today)}   ·   total ${money(bank + today)}`, 44, {
        fontStyle: 'bold',
        color: sum.profit < 0 && counted ? '#b03a3a' : CSS.ink,
      })
        .setOrigin(0.5)
        .setName('summary-total'),
    );
    // What's new tomorrow: or, on a coupon day, the coupon's the news.
    const news = coupon
      ? 'screenshot this and bring it to the domochi trailer to redeem your reward!'
      : [
          sum.nextEvent ? `tomorrow: pop-up at ${sum.nextEvent}!` : '',
          fresh.length ? `new tomorrow: ${fresh.map((f) => f.name).join(', ')}!\n(its glaze and toppings are at the supply store)` : sum.nextEvent ? '' : this.comingUp(sum.day),
        ]
          .filter(Boolean)
          .join('\n');
    const big = !!coupon || fresh.length > 0 || !!sum.nextEvent;
    const newsText = text(0, 378, news, coupon ? 32 : 38, {
      color: coupon ? '#2f6b3a' : big ? '#b0406a' : '#6b5d52',
      fontStyle: big ? 'bold' : 'normal',
      align: 'center',
      wordWrap: { width: CARD_W - 120 },
    })
      .setOrigin(0.5)
      .setName('summary-unlocks');
    if (coupon) newsText.setBackgroundColor('#e3f2df').setPadding(18, 10, 18, 10);
    card.add(newsText);
    card.add(new Button(this, 0, 530, counted ? 'To the supply store' : `Start day ${sum.day + 1}`, () => this.nextDay(), { width: 620, name: 'btn-next-day' }));

    onLayout(this, (v) => {
      const scale = Math.min(1, (v.height - 40) / CARD_H, (v.width - 40) / CARD_W);
      card.setPosition(v.width / 2, v.height / 2).setScale(scale);
    });
  }

  /** What opens up next (so the long road has signposts). */
  private comingUp(day: number): string {
    const list: Milestone[] = [
      ...menu.flavors.map((f) => ({ day: f.unlockDay, text: `${f.name}!` })),
      { day: balance.special.fromDay ?? 1, text: 'a special of the day' },
      { day: balance.goals.fromDay, text: 'daily goals' },
      { day: balance.supplies.friendsFromDay ?? 1, text: "Ethan's friends drop by" },
      { day: balance.events.fromDay ?? 1, text: 'invites to pop-up events' },
      { day: Math.min(...balance.decor.items.map((d) => d.unlockDay)), text: 'decorations for the lot' },
      ...(brand.coupons.enabled ? [{ day: brand.coupons.fromDay, text: 'coupons for the real truck' }] : []),
      { day: Math.min(...balance.staff.hires.map((h) => h.unlockDay)), text: 'hiring a crew' },
    ];
    const m = nextMilestone(list, day + 1);
    return m ? `next up on day ${m.day}: ${m.text}` : 'same menu tomorrow';
  }

  /** Bank today's money and the supplies left, save, then the supply store (or straight to the next day). */
  private nextDay(): void {
    const s = session();
    const sum = s.summary();
    const invite = s.inviteWasAccepted ? s.invite : undefined;
    // mochi writes the day's page, with a doodle of the best donut.
    const best = s.bestDonut;
    let doodle: string | undefined;
    if (best) {
      const c = document.createElement('canvas');
      c.width = c.height = DOODLE_PX;
      drawFinishedDonut(c.getContext('2d')!, DOODLE_PX, best);
      doodle = c.toDataURL('image/png');
    }
    const page: JournalPage = {
      day: sum.day,
      ...(s.weather ? { weather: s.weather.name } : {}),
      ...(sum.event ? { event: sum.event } : {}),
      served: sum.served,
      best: sum.bestScore,
      ...(s.tracksSupplies ? { profit: sum.profit } : {}),
      stickers: [...(stickers()?.today ?? [])],
      note: dayNote(journalData, sum, createRng(sum.day * 7919 + sum.served)),
      stars: dayStars(sum),
      ...(this.coupon ? { coupon: this.coupon } : {}),
      ...(doodle ? { doodle } : {}),
    };
    void save().update((d) => {
      d.day = sum.day + 1;
      d.money = Math.round((d.money + sum.sales + sum.tips + sum.tidyBonus + sum.goalBonus) * 100) / 100;
      // Book tomorrow's pop-up (or drop a booking that's been and gone).
      if (invite) d.event = { id: invite.id, day: sum.day + 1 };
      else if (d.event && d.event.day <= sum.day) delete d.event;
      d.served += sum.served;
      d.bestOrder = Math.max(d.bestOrder, sum.bestScore);
      if (s.stock) d.stock = { ...s.stock };
      if (s.regularsLevels) d.regulars = { ...s.regularsLevels };
      d.journal.pages = addPage(d.journal.pages, page);
      delete d.inProgress; // the day's done: tomorrow starts fresh
    });
    // Players' notes for Ethan go out as the day's report.
    void feedback().sendReport(sum.day);
    if (s.tracksSupplies) {
      this.scene.launch(SceneKeys.Store);
      this.scene.stop();
      return;
    }
    stopMainGame(this);
    startMainGame(this);
  }
}
