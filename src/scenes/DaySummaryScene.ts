import Phaser from 'phaser';
import brand from '../data/brand.json';
import { flavorsForDay } from '../systems/menu';
import { SIDE_KINDS, sideItemsForDay } from '../stations/sides';
import { sidePlural } from '../systems/orders';
import { addPage, dayNote, dayStars, nextMilestone, type JournalPage, type Milestone } from '../systems/journal';
import { createRng } from '../systems/rng';
import { couponCode, earnsCoupon } from '../systems/coupons';
import { audio, balance, feedback, journalData, menu, save, session, stickers, currentWeekly } from '../systems/services';
import { drawFinishedDonut } from '../ui/donutArt';
import { shareDonut } from '../ui/share';
import { Button } from '../ui/Button';
import { beginOverlay } from '../ui/overlay';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
import { onLayout } from '../ui/viewport';
import { startMainGame, stopMainGame } from './flow';
import { addWeeklyDay, weeklyText, type WeeklyState } from '../systems/weekly';
import { SceneKeys } from './sceneKeys';

const CARD_W = 860;
/** Side margin inside the card, and the rows' type size and spacing. */
const PAD_X = 50;
/** The landscape card: wide enough for two columns of rows. */
const CARD_W_WIDE = 1560;
const ROW_FONT = 36;
const ROW_H = 50;

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
  /** The weekly challenge after today (saved on the way to tomorrow). */
  private weekly: { state: WeeklyState; justDone: boolean } | undefined;
  constructor() {
    super(SceneKeys.DaySummary);
  }

  create(): void {
    beginOverlay(this, 0.7);
    audio().play('fanfare');
    const s = session();
    const sum = s.summary();
    const bank = save().data.money;
    const today = sum.sales + sum.tips + sum.tidyBonus + sum.goalBonus - sum.errandSpent;
    const counted = s.tracksSupplies;
    // A great day (once Ethan's coupons are on) earns a code to show at the real truck.
    const earns = earnsCoupon(brand.coupons, sum.day, dayStars(sum));
    if (earns && !save().data.playerId) {
      const id = Math.random().toString(36).slice(2, 10);
      void save().update((d) => void (d.playerId = id));
    }
    const coupon = earns ? couponCode(sum.day, save().data.playerId) : undefined;
    // The weekly challenge: today counts towards it.
    this.weekly = counted
      ? addWeeklyDay(currentWeekly(sum.day), { flavors: s.servedFlavors(), great: sum.tiers.great, tidy: !!sum.tidy, stars: dayStars(sum) })
      : undefined;
    const wk = this.weekly;
    const flavorName = (id: string) => menu.flavors.find((f) => f.id === id)?.name ?? id;
    this.coupon = coupon;
    // The day's stickers (finishing the day, a tidy close, no waste...).
    const tracker = stickers();
    tracker?.endOfDay(sum, counted);
    const earned = (tracker?.today ?? []).map((id) => journalData.stickers.find((st) => st.id === id)).filter((st) => !!st);
    const known = new Set(flavorsForDay(menu, sum.day).map((f) => f.id));
    const fresh = flavorsForDay(menu, sum.day + 1).filter((f) => !known.has(f.id));
    // Kolaches and onigiri coming on the menu tomorrow (the first of each kind brings a new station).
    const freshSides = SIDE_KINDS.flatMap((k) => sideItemsForDay(menu.sides?.[k], sum.day + 1).filter((i) => i.unlockDay === sum.day + 1).map((i) => ({ kind: k, item: i })));
    const firstOfKind = freshSides.find(({ kind }) => sideItemsForDay(menu.sides?.[kind], sum.day).length === 0);

    const card = this.add.container(0, 0).setName('day-summary');
    const bg = this.add.graphics();
    const rules = this.add.graphics();
    card.add([bg, rules]);
    const text = (str: string, size: number, opts: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {}) =>
      this.add.text(0, 0, str, { fontFamily: FONT_FAMILY, fontSize: `${size}px`, color: CSS.ink, ...opts });

    // How the day went: up to three stars, popping in one by one.
    const stars = dayStars(sum);
    const starTexts = [0, 1, 2].map((i) => {
      const st = text(i < stars ? '★' : '☆', 72, { color: i < stars ? '#e8a33a' : '#c9bfb4', fontStyle: 'bold' }).setOrigin(0.5).setScale(0);
      this.tweens.add({ targets: st, scale: 1, delay: 250 + i * 220, duration: 320, ease: 'Back.Out', onStart: () => i < stars && audio().play('ding') });
      return st;
    });
    const title = text(`day ${sum.day} done!`, 76, { fontStyle: 'bold' }).setOrigin(0.5);
    const tagline = text(sum.event ? `what a pop-up at ${sum.event}!` : brand.tagline, 34, { fontStyle: 'italic', color: '#6b5d52' }).setOrigin(0.5);
    card.add([...starTexts, title, tagline]);

    type Row = [string, string, string];
    // Grouped: the customers, the money, then the extras (challenges, stickers, coupon).
    const groups: Row[][] = [
      [
        ['customers served', `${sum.served}${sum.wentHome ? ` (${sum.wentHome} went home)` : ''}`, 'served'],
        ['average order', `${sum.averageScore}  (best ${sum.bestScore})`, 'average'],
        ['reactions', `${sum.tiers.great} great · ${sum.tiers.good} good · ${sum.tiers.okay + sum.tiers.bad} meh`, 'reactions'],
        ...(sum.gifts ? [['donuts gifted', `${sum.gifts}`, 'gifts'] as Row] : []),
        ...(sum.pickups ? [['pickups done', `${sum.pickups}`, 'pickups'] as Row] : []),
        ...(sum.bestStreak >= 2 ? [['best streak', `${sum.bestStreak} in a row`, 'streak'] as Row] : []),
        ...(sum.specialsSold ? [['special sold', `${sum.specialsSold}`, 'specials'] as Row] : []),
      ],
      [
        ['sales', money(sum.sales), 'sales'],
        ['tips', money(sum.tips), 'tips'],
        ...(sum.goal ? [['daily goal', sum.goalBonus ? `done! +${money(sum.goalBonus)}` : 'missed', 'goal'] as Row] : []),
        ...(sum.tidy === null ? [] : [['clean-up', sum.tidy ? `tidy! +${money(sum.tidyBonus)}` : 'skipped', 'cleanup'] as Row]),
        // Waste: thrown away, plus whatever was made (or left in the tub) and not sold.
        counted
          ? ['wasted', `${sum.wasted} donut${sum.wasted === 1 ? '' : 's'}  −${money(sum.wasteCost)}`, 'waste']
          : ['donuts thrown away', `${sum.trashed}`, 'waste'],
        ...(counted && sum.suppliesCost - sum.wasteCost >= 0.005 ? [['other supplies used', `−${money(Math.max(0, sum.suppliesCost - sum.wasteCost))}`, 'supplies'] as Row] : []),
        ...(sum.errandSpent ? [["a friend's store run", `−${money(sum.errandSpent)}`, 'errand'] as Row] : []),
      ],
      [
        ...(wk
          ? [
              (wk.justDone
                ? ['weekly challenge', `done! +${money(balance.weekly.reward)}`, 'weekly']
                : ['this week', `${weeklyText(wk.state, flavorName)} · ${wk.state.progress}/${wk.state.target}${wk.state.done ? ' ✓' : ''}`, 'weekly']) as Row,
            ]
          : []),
        ...(earned.length ? [['new stickers', earned.map((st) => st.glyph).join(' '), 'stickers'] as Row] : []),
        ...(coupon ? [['your coupon', coupon, 'coupon'] as Row] : []),
      ],
    ];
    // Each row: a label on the left, its value on the right (bold).
    const rowObjs = groups.map((rows) =>
      rows.map(([label, value, name]) => {
        const l = text(label, ROW_FONT, { color: '#4a3f37' }).setOrigin(0, 0.5);
        const v = text(value, ROW_FONT, { fontStyle: 'bold', align: 'right' }).setOrigin(1, 0.5).setName(`summary-${name}`);
        card.add([l, v]);
        return { l, v };
      }),
    );
    const total = text(counted ? `profit ${money(sum.profit)}   ·   cash ${money(bank + today)}` : `today ${money(today)}   ·   total ${money(bank + today)}`, 44, {
      fontStyle: 'bold',
      color: sum.profit < 0 && counted ? '#b03a3a' : CSS.ink,
    })
      .setOrigin(0.5)
      .setName('summary-total');
    card.add(total);
    // What's new tomorrow: or, on a coupon day, the coupon's the news.
    const news = coupon
      ? 'screenshot this and bring it to the domochi trailer to redeem your reward!'
      : [
          sum.nextEvent ? `tomorrow: pop-up at ${sum.nextEvent}!` : '',
          fresh.length
            ? `new tomorrow: ${fresh.map((f) => f.name).join(', ')}!\n(its glaze and toppings are at the supply store)`
            : firstOfKind
              ? `new tomorrow: ${sidePlural(firstOfKind.kind, firstOfKind.item.name)} and the ${firstOfKind.kind === 'kolache' ? 'Bake' : 'Rice'} station!\n(a starter kit comes with it)`
              : freshSides.length
                ? `new tomorrow: ${freshSides.map((x) => x.item.name).join(', ')}!\n(its filling is at the supply store)`
                : sum.nextEvent
                  ? ''
                  : this.comingUp(sum.day),
        ]
          .filter(Boolean)
          .join('\n');
    const big = !!coupon || fresh.length > 0 || freshSides.length > 0 || !!sum.nextEvent;
    const newsText = text(news, coupon ? 32 : 34, {
      color: coupon ? '#2f6b3a' : big ? '#b0406a' : '#6b5d52',
      fontStyle: big ? 'bold' : 'normal',
      align: 'center',
    })
      .setOrigin(0.5, 0)
      .setName('summary-unlocks');
    if (coupon) newsText.setBackgroundColor('#e3f2df').setPadding(18, 10, 18, 10);
    card.add(newsText);
    // Share the day's best donut (a picture for Instagram and friends), beside the way on.
    const best = s.bestDonut;
    let share: Button | null = null;
    if (best) {
      const flavor = s.flavorOf(best);
      const name = menu.flavors.find((f) => f.id === flavor)?.name ?? 'mochi';
      share = new Button(this, 0, 0, 'Share', () => void shareDonut(this, { donut: best, title: `my ${name} mochi donut`, subtitle: `day ${sum.day} at the domochi trailer` }), {
        width: 290,
        fill: COLORS.dough,
        name: 'btn-summary-share',
      });
      card.add(share);
    }
    const next = new Button(this, 0, 0, counted ? 'To the store' : `Start day ${sum.day + 1}`, () => this.nextDay(), { width: best ? 480 : 620, name: 'btn-next-day' });
    card.add(next);

    /**
     * Lay the card out from the top down (so nothing can overlap, however
     * many rows a day has). Portrait: one column. Landscape: a wider card with
     * the customers and the money side by side. Returns the card's size.
     */
    const place = (landscape: boolean): { w: number; h: number } => {
      const w = landscape ? CARD_W_WIDE : CARD_W;
      const inner = w - 2 * PAD_X;
      rules.clear();
      rules.lineStyle(3, COLORS.ink, 0.15);
      let y = 70;
      starTexts.forEach((st, i) => st.setPosition(-90 + i * 90, y));
      y += 85;
      title.setY(y);
      y += 70;
      tagline.setY(y);
      y += 60;
      const placeRows = (rows: { l: Phaser.GameObjects.Text; v: Phaser.GameObjects.Text }[], x0: number, width: number, top: number): number => {
        let ry = top;
        for (const { l, v } of rows) {
          l.setPosition(x0, ry);
          v.setWordWrapWidth(null).setPosition(x0 + width, ry);
          // A long value (the week's challenge) goes on its own line under the label instead of over it.
          if (l.width + v.width + 30 > width) {
            ry += ROW_H * 0.8;
            v.setWordWrapWidth(width - 40).setY(ry);
            ry += v.height - ROW_FONT;
          }
          ry += ROW_H;
        }
        return ry;
      };
      const [people, cash, extras] = rowObjs as [typeof rowObjs[0], typeof rowObjs[0], typeof rowObjs[0]];
      if (landscape) {
        const gap = 70;
        const col = (inner - gap) / 2;
        const end = Math.max(placeRows(people, -inner / 2, col, y), placeRows(cash, -inner / 2 + col + gap, col, y));
        rules.lineBetween(0, y - 20, 0, end - 30);
        y = end + 6;
      } else {
        y = placeRows(people, -inner / 2, inner, y) + 6;
        if (cash.length) {
          rules.lineBetween(-inner / 2, y - 4, inner / 2, y - 4);
          y = placeRows(cash, -inner / 2, inner, y + 22) + 6;
        }
      }
      if (extras.length) {
        rules.lineBetween(-inner / 2, y - 4, inner / 2, y - 4);
        y = placeRows(extras, -inner / 2, inner, y + 22) + 6;
      }
      rules.lineBetween(-inner / 2, y, inner / 2, y);
      y += 60;
      total.setY(y);
      y += 50;
      newsText.setWordWrapWidth(inner).setY(y);
      y += newsText.height + 100;
      share?.setPosition(-255, y);
      next.setPosition(best ? 165 : 0, y);
      y += 110;
      bg.clear();
      bg.fillStyle(0x000000, 0.25);
      bg.fillRoundedRect(-w / 2, 12, w, y, 48);
      bg.fillStyle(COLORS.card);
      bg.fillRoundedRect(-w / 2, 0, w, y, 48);
      return { w, h: y };
    };

    // The card's origin is its top centre: centred on screen, scaled to fit.
    onLayout(this, (v) => {
      const size = place(v.orientation === 'landscape');
      const scale = Math.min(1, (v.height - 40) / size.h, (v.width - 40) / size.w);
      card.setPosition(v.width / 2, v.height / 2 - (size.h * scale) / 2).setScale(scale);
    });
  }

  /** What opens up next (so the long road has signposts). */
  private comingUp(day: number): string {
    const list: Milestone[] = [
      ...menu.flavors.map((f) => ({ day: f.unlockDay, text: `${f.name}!` })),
      ...SIDE_KINDS.flatMap((k) => (menu.sides?.[k].items ?? []).map((i) => ({ day: i.unlockDay, text: `${sidePlural(k, i.name)}!` }))),
      { day: balance.special.fromDay ?? 1, text: 'a special of the day' },
      { day: balance.goals.fromDay, text: 'daily goals' },
      { day: balance.supplies.friendsFromDay ?? 1, text: "Ethan's friends drop by" },
      { day: balance.events.fromDay ?? 1, text: 'invites to pop-up events' },
      { day: Math.min(...balance.decor.items.map((d) => d.unlockDay)), text: 'decorations for the lot' },
      ...(brand.coupons.enabled ? [{ day: brand.coupons.fromDay, text: 'coupons for the real truck' }] : []),
      { day: Math.min(...balance.staff.hires.map((h) => h.unlockDay)), text: 'hiring a crew' },
    ];
    const m = nextMilestone(list, day + 1);
    return m ? `coming soon: ${m.text}` : 'same menu tomorrow';
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
      d.money = Math.round((d.money + sum.sales + sum.tips + sum.tidyBonus + sum.goalBonus - sum.errandSpent) * 100) / 100;
      if (this.weekly) {
        d.weekly = this.weekly.state;
        if (this.weekly.justDone) d.money = Math.round((d.money + balance.weekly.reward) * 100) / 100;
      }
      // Book tomorrow's pop-up (or drop a booking that's been and gone).
      if (invite) d.event = { id: invite.id, day: sum.day + 1 };
      else if (d.event && d.event.day <= sum.day) delete d.event;
      d.served += sum.served;
      d.bestOrder = Math.max(d.bestOrder, sum.bestScore);
      if (s.stock) d.stock = { ...s.stock };
      if (s.regularsLevels) d.regulars = { ...s.regularsLevels };
      d.journal.pages = addPage(d.journal.pages, page);
      delete d.inProgress; // the day's done: tomorrow starts fresh
      // ...except for trays nobody cleaned: they stay dirty (and grow mold).
      if (s.tracksSupplies) d.trays = s.traysForTomorrow();
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
