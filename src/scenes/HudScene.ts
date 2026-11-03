import Phaser from 'phaser';
import tutorialData from '../data/tutorial.json';
import { dailyGift } from '../systems/daily';
import { audio, awardSticker, balance, collectAwayEarnings, isClockPaused, markSeen, menu, save, saveDayInProgress, session, stickers } from '../systems/services';
import { Button } from '../ui/Button';
import { Pill } from '../ui/Pill';
import { TextureKeys } from '../assets/keys';
import { TabBar } from '../ui/TabBar';
import { visibleTabs, type StationKey } from '../ui/tabs';
import { TicketRail } from '../ui/TicketRail';
import { CSS, FONT_FAMILY, COLORS } from '../ui/theme';
import { onLayout } from '../ui/viewport';
import { listen } from './listen';
import { roundBg } from '../ui/roundBg';
import { SceneKeys } from './sceneKeys';

/** Longest step the game clock takes per frame, so a hitch doesn't skip time. */
const MAX_TICK_MS = 250;
/** Pop-ups that pause the day while they're open. */
const PAUSING = [SceneKeys.Settings, SceneKeys.Journal, SceneKeys.Invite, SceneKeys.Errand] as const;

/**
 * Always-on-top layer: ticket rail along the top, tab bar along the bottom.
 * It also runs the game clock, so customers keep arriving while you're at a
 * station. Switching stations puts the old one to sleep (keeping its state)
 * and wakes or starts the new one.
 */
export class HudScene extends Phaser.Scene {
  private current: StationKey = SceneKeys.Lobby;
  private tabBar!: TabBar;
  private rail!: TicketRail;

  constructor() {
    super(SceneKeys.Hud);
  }

  create(): void {
    this.toastQueue = [];
    this.current = SceneKeys.Lobby;
    // Bake and Rice only once kolaches / onigiri are on the menu (and not in the tutorial).
    const tabs = visibleTabs((k) => !session().isTutorial && session().sideOnMenu(k));
    this.tabBar = new TabBar(this, tabs, (key) => this.goTo(key));
    this.tabBar.selectTab(this.current);
    this.rail = new TicketRail(
      this,
      menu,
      (no) => {
        session().selectTicket(no);
        // Once: teach that tapping the picked ticket again shows it big.
        if (!session().isTutorial && !(save().data.hintsSeen ?? []).includes('ticket-tap')) {
          this.showToast('tip: tap the picked ticket again\nto see the whole order, big');
          void save().update((d) => void (d.hintsSeen = [...(d.hintsSeen ?? []), 'ticket-tap']));
        }
      },
      (no) => {
        if (!this.scene.isActive(SceneKeys.TicketView)) this.scene.launch(SceneKeys.TicketView, { ticketNo: no });
      },
      () => session().cash,
    );
    const settings = new Button(this, 0, 0, 'Settings', () => this.openSettings(), {
      width: 240,
      height: 120,
      fontSize: 42,
      name: 'btn-settings',
    });

    // mochi's journal, up in the top bar by Settings: there from every station. A badge for new stickers.
    const journal = this.add.image(0, 0, TextureKeys.Mascot).setName('btn-journal').setInteractive({ useHandCursor: true }).setVisible(!session().isTutorial);
    journal.on(Phaser.Input.Events.POINTER_UP, () => {
      audio().play('tap');
      if (!this.scene.isActive(SceneKeys.Journal)) this.scene.launch(SceneKeys.Journal);
    });
    const badge = new Pill(this, 'new!', { fontSize: 22, color: CSS.cream, fill: 0xb0406a, bold: true, padX: 8, padY: 2 }).setVisible(false);
    this.tweens.add({ targets: journal, angle: { from: -5, to: 5 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    const refreshBadge = () => {
      const j = save().data.journal;
      badge.setVisible(!session().isTutorial && j.stickers.length > j.seen);
    };
    refreshBadge();
    this.time.addEvent({ delay: 1000, loop: true, callback: refreshBadge });
    const tracker0 = stickers();
    if (tracker0) {
      const off = tracker0.events.on('earned', refreshBadge);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
    }

    let arrived = session().arrivals;
    listen(this, session().events, 'changed', () => {
      this.rail.refresh(session());
      if (session().arrivals > arrived) audio().play('chime');
      arrived = session().arrivals;
    });
    // Back from being away: the crew's takings.
    const away = collectAwayEarnings();
    if (away.amount > 0) {
      const names = away.crew;
      const who = names.length > 2 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names.join(' and ');
      this.time.delayedCall(800, () => {
        audio().play('cash');
        this.showToast(`while you were away, ${who} sold $${away.amount.toFixed(2)}!\n(tap to close)`, true);
      });
    }
    // mochi's daily gift: the first visit each day, a bit more for each day in a row.
    if (!session().isTutorial) {
      const gift = dailyGift(balance.daily, save().data.daily, new Date());
      if (gift && gift.cash > 0) {
        void save().update((d) => {
          d.daily = gift.state;
          d.money = Math.round((d.money + gift.cash) * 100) / 100;
        });
        const week = gift.streak % balance.daily.gifts.length === 0;
        if (week) awardSticker('daily-week');
        const line = week
          ? `🎁 a whole week in a row! mochi saved you $${gift.cash.toFixed(2)}!`
          : `🎁 mochi's daily gift: $${gift.cash.toFixed(2)}!${gift.streak > 1 ? ` (${gift.streak} days in a row)` : ''}\ncome back tomorrow for more`;
        this.time.delayedCall(600, () => {
          audio().play('cash');
          this.showToast(line);
        });
      }
    }
    // Good morning: today's weather and what it means.
    const wx = session().weather;
    if (wx && session().phase === 'prep') this.time.delayedCall(1200, () => this.showToast(`${wx.icon ?? ''} today: ${wx.note}`.trim()));
    // A tray nobody cleaned yesterday has grown mold: say so (donuts made on it taste funky).
    const moldy = [...(['glaze', 'toppings'] as const).filter((t) => session().moldOn(t) > 0).map((t) => `the ${t} tray`), ...(session().bowlMoldy ? ['the dough bowl'] : [])];
    if (moldy.length && session().phase === 'prep') {
      const which = moldy.length > 1 ? `${moldy.slice(0, -1).join(', ')} and ${moldy[moldy.length - 1]}` : moldy[0];
      this.time.delayedCall(1300, () => this.showToast(`yuck! ${which} grew mold overnight.\nscrub ${moldy.length > 1 ? 'them' : 'it'} clean, or customers will taste it!\n(tap to close)`, true));
    }
    // The day so far is saved every few seconds, and whenever the page is hidden.
    this.time.addEvent({ delay: 5000, loop: true, callback: () => saveDayInProgress() });
    const onHide = () => {
      if (!document.hidden) return;
      saveDayInProgress();
      markSeen();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', saveDayInProgress);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', saveDayInProgress);
    });
    // The day's clock on the rail ticks every second.
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.rail.refreshDay(session()) });
    // Ethan's friends dropping by, and the window closing, get a note at the top.
    this.toast = roundBg(this.add
      .text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: '38px', fontStyle: 'bold', color: CSS.ink, align: 'center', backgroundColor: CSS.cream, padding: { x: 28, y: 16 } })
      .setOrigin(0.5, 0)
      .setDepth(50)
      .setVisible(false)
      .setName('hud-toast'), COLORS.cream);
    this.toast.on(Phaser.Input.Events.POINTER_UP, () => {
      if (!this.toastSticky || !this.toast.visible) return;
      this.toastSticky = false;
      audio().play('tap');
      this.nextToast();
    });
    listen(this, session().events, 'friend', (e) => {
      audio().play('chime');
      // In the Lobby they walk up and say it themselves; elsewhere it's a note that stays until tapped.
      if (this.current !== SceneKeys.Lobby) this.showToast(`${e.name} (Ethan's friend) dropped by:\n"${e.line}"\n(tap to close)`, true);
    });
    // Out of materials, with money: a friend offers a run to the store.
    listen(this, session().events, 'errand', (e) => {
      if (!this.scene.isActive(SceneKeys.Errand)) this.scene.launch(SceneKeys.Errand, { name: e.name, line: e.line, errand: e.errand });
      this.scene.bringToTop(SceneKeys.Errand);
    });
    listen(this, session().events, 'streak', (e) => {
      if (e.count === 2 || e.count % 3 === 0) this.showToast(`hot streak ×${e.count}! tips +${Math.round(e.bonus * 100)}%`);
    });
    listen(this, session().events, 'goal', (e) => {
      audio().play('fanfare');
      this.showToast(`daily goal done: ${e.text}!\n+$${e.reward.toFixed(2)}`);
    });
    listen(this, session().events, 'timeUp', () => {
      audio().play('ding');
      this.showToast(session().unserved ? "time's up! the window's closed.\nfinish the last orders" : "time's up! the window's closed");
    });
    // A new sticker for mochi's journal.
    const tracker = stickers();
    if (tracker) {
      const off = tracker.events.on('earned', (st) => {
        audio().play('fanfare');
        this.showToast(`new sticker for mochi's journal!\n${st.glyph}  ${st.name}`);
      });
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
    }
    onLayout(this, (v) => {
      this.toast.setPosition(v.width / 2, v.railHeight + 20).setWordWrapWidth(Math.min(1000, v.width - 60));
      this.tabBar.layout(v);
      this.rail.layout(v, session());
      const k = v.orientation === 'landscape' ? 0.9 : 1;
      settings.setPosition(v.width - 150, v.railHeight / 2 - 2).setScale(k);
      // mochi just left of Settings, sized to the bar.
      const jx = v.width - 150 - 120 * k - 75;
      journal.setPosition(jx, v.railHeight / 2).setDisplaySize(v.railHeight * 0.8, v.railHeight * 0.75);
      badge.setPosition(jx, v.railHeight - 16);
    });
  }

  override update(_time: number, delta: number): void {
    // The day waits while a menu or a question is open (Settings, the journal, an invite, a friend's errand).
    if (isClockPaused() || PAUSING.some((k) => this.scene.isActive(k))) return;
    session().tick(Math.min(delta, MAX_TICK_MS));
    this.updateBadges();
  }

  /**
   * Alert dots on the tabs: something at another station needs you now. A
   * customer at the window, a donut side done (flip or pull it), a pan of
   * kolaches golden, a pot of rice ready. Checked every frame, no allocations.
   */
  /** The first time you open a station that came after the tutorial (Bake, Rice): mochi's quick how-to, once. */
  private stationHint(key: StationKey): void {
    const hints = (tutorialData as { stationHints?: Record<string, string> }).stationHints;
    const hint = hints?.[key];
    if (!hint || session().isTutorial || (save().data.hintsSeen ?? []).includes(key)) return;
    this.showToast(hint, true);
    void save().update((d) => void (d.hintsSeen = [...(d.hintsSeen ?? []), key]));
  }

  private updateBadges(): void {
    const s = session();
    this.tabBar.setBadge(SceneKeys.Lobby, s.phase === 'open' && s.someoneToServe);
    const fb = s.fryer.balance;
    let fry = false;
    for (const d of s.fryer.slots) if (d && d.down >= 1 - fb.doneness.perfectWithin) fry = true;
    this.tabBar.setBadge(SceneKeys.Fry, fry);
    const bk = s.bakery;
    let bake = false;
    if (bk.inOven) for (const k of bk.pan) if (k && k.baked >= 1 - balance.bake.oven.doneness.perfectWithin) bake = true;
    this.tabBar.setBadge(SceneKeys.Bake, bake);
    const r = s.riceStation;
    this.tabBar.setBadge(SceneKeys.Rice, r.cooker === 'ready' && r.portions > 0 && !r.board);
  }

  private toast!: Phaser.GameObjects.Text;

  private toastQueue: { text: string; sticky: boolean }[] = [];
  private toastSticky = false;

  private nextToast(): void {
    this.toast.setVisible(false).disableInteractive();
    const next = this.toastQueue.shift();
    if (next) this.showToast(next.text, next.sticky);
  }

  /** A note under the rail for a few seconds (one at a time: others wait their turn). */
  showToast(text: string, sticky = false): void {
    if (this.toast.visible) {
      this.toastQueue.push({ text, sticky });
      return;
    }
    this.toast.setText(text).setVisible(true).setAlpha(1).setScale(0.9);
    this.tweens.add({ targets: this.toast, scale: 1, duration: 180, ease: 'Back.Out' });
    // A sticky note stays until it's tapped (only then does it catch taps).
    this.toastSticky = sticky;
    if (sticky) {
      this.toast.setInteractive({ useHandCursor: true });
      return;
    }
    this.toast.disableInteractive();
    this.tweens.add({
      targets: this.toast,
      alpha: 0,
      delay: 3600,
      duration: 400,
      onComplete: () => {
        this.nextToast();
      },
    });
  }

  get currentStation(): StationKey {
    return this.current;
  }

  goTo(key: StationKey): void {
    if (key === this.current) return;
    this.scene.sleep(this.current);
    this.scene.run(key);
    this.scene.bringToTop();
    this.current = key;
    this.tabBar.selectTab(key);
    this.stationHint(key);
  }

  private openSettings(): void {
    if (!this.scene.isActive(SceneKeys.Settings)) this.scene.launch(SceneKeys.Settings);
  }
}
