import Phaser from 'phaser';
import { TextureKeys } from '../assets/keys';
import type { Customer } from '../systems/GameSession';
import { audio, balance, menu, save, session, stickers } from '../systems/services';
import { Booth } from '../ui/Booth';
import { LobbyScenery } from '../ui/LobbyScenery';
import { Button } from '../ui/Button';
import type { Viewport } from '../ui/layout';
import { SpeechBubble } from '../ui/SpeechBubble';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
import { Truck } from '../ui/Truck';
import { getViewport, onLayout } from '../ui/viewport';
import { listen } from './listen';
import { SceneKeys } from './sceneKeys';

const money = (n: number) => `$${n.toFixed(2)}`;

/** Customer sprite height in texture pixels (see MANIFEST). */
const CUSTOMER_H = 340;
/** How fast customers walk, in logical px per second (visual only). */
const WALK_SPEED = 700;

/** Positions inside the content area, per orientation. */
const LAYOUT = {
  portrait: {
    groundY: 700,
    // Truck y puts the wheels on the ground line.
    truck: { x: 540, y: 470, scale: 0.9 },
    sign: { x: 120, feetY: 850, scale: 0.7 },
    chalk: { x: 215, y: 330 },
    line: { x: [600, 760, 920, 1080], feetY: 1300, scale: 0.85 },
    panel: { x: 780, y: 1060, buttonY: 1330, width: 540 },
    pickups: { x: 780, y: 1500 },
    journal: { x: 955, y: 820, scale: 0.6 },
    // On the sidewalk between the patio and the line (short phones have no room at the bottom).
    closeEarly: { x: 665, y: 905 },
    waiting: {
      x: 250,
      y: 1185,
      w: 440,
      h: 560,
      labelY: 1500,
      scale: 0.7,
      slots: [
        [150, 1170],
        [350, 1170],
        [150, 1440],
        [350, 1440],
      ],
    },
  },
  landscape: {
    groundY: 380,
    truck: { x: 420, y: 205, scale: 0.65 },
    sign: { x: 820, feetY: 470, scale: 0.6 },
    chalk: { x: 820, y: 236 },
    // The line starts at the serving window and runs right, along the front of the trailer.
    line: { x: [300, 450, 600, 750], feetY: 720, scale: 0.8 },
    // Checklists and buttons in the open middle of the lot, clear of the line and the patio.
    panel: { x: 1240, y: 330, buttonY: 640, width: 520 },
    pickups: { x: 1730, y: 215 },
    journal: { x: 105, y: 610, scale: 0.55 },
    closeEarly: { x: 1240, y: 640 },
    // The patio sits on the lot, below the sidewalk (not up in the sky).
    waiting: {
      x: 1730,
      y: 590,
      w: 360,
      h: 320,
      labelY: 765,
      scale: 0.55,
      slots: [
        [1640, 575],
        [1820, 575],
        [1640, 730],
        [1820, 730],
      ],
    },
  },
} as const;

interface CustomerView {
  id: number;
  image: Phaser.GameObjects.Image;
  tag: Phaser.GameObjects.Text;
  target: { x: number; y: number; scale: number } | null;
  moving: boolean;
  leaving: boolean;
}

/** The lot by domochi's trailer: the line, the waiting area, and handing over orders. */
export class LobbyScene extends Phaser.Scene {
  private views = new Map<number, CustomerView>();
  private frontTag!: Phaser.GameObjects.Text;
  private doneText!: Phaser.GameObjects.Text;
  private bubble: SpeechBubble | null = null;
  private truck: Truck | null = null;
  private scenery!: LobbyScenery;
  /** Morning prep / closing time: a checklist and a button (open the window, close up). */
  private panelText!: Phaser.GameObjects.Text;
  private openButton!: Button;
  private closeButton!: Button;
  /** After time's up: send whoever's still waiting home (unpaid). */
  private sendHomeButton!: Button;
  private closeEarlyButton!: Button;
  private confirmClose = false;
  private pickupsText!: Phaser.GameObjects.Text;
  /** mochi's journal: tap mochi on the lot. */
  private journalButton!: Phaser.GameObjects.Image;
  private journalLabel!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKeys.Lobby);
  }

  create(): void {
    this.views = new Map();
    this.bubble = null;
    this.confirmOpen = false;
    this.cameras.main.setBackgroundColor(COLORS.sky);
    this.scenery = new LobbyScenery(this);
    this.scenery.setWeather(session().weather?.id ?? 'sunny');
    // Pop-up days are downtown, in front of a (made-up) shop.
    this.scenery.setDowntown(!!session().event);
    // A pop-up booth on event days, the trailer otherwise.
    const ev = session().event;
    this.truck = ev ? null : new Truck(this, 0, 0);
    const truck: Phaser.GameObjects.Container = this.truck ?? new Booth(this, 0, 0, ev!.name);
    const sign = this.add.image(0, 0, TextureKeys.SignAFrame).setOrigin(0.5, 1);
    // Today's special, chalked up by the sign.
    const special = session().special;
    const specialName = special ? menu.flavors.find((f) => f.id === special)?.name : undefined;
    const chalk = this.add
      .text(0, 0, specialName ? `today's special\n${specialName}\n+${money(balance.special.priceBonus)}` : '', {
        fontFamily: FONT_FAMILY,
        fontSize: '26px',
        fontStyle: 'bold',
        color: '#f4f1e8',
        align: 'center',
        backgroundColor: '#2f4a3a',
        padding: { x: 14, y: 8 },
      })
      .setOrigin(0.5)
      .setDepth(4)
      .setAngle(-3)
      .setVisible(!!specialName)
      .setName('lobby-special');
    // A little chalkboard naming the patio where customers wait.
    const waitingLabel = this.add
      .text(0, 0, 'waiting patio', { fontFamily: FONT_FAMILY, fontSize: '34px', color: CSS.cream, backgroundColor: '#2b2522', padding: { x: 16, y: 6 } })
      .setOrigin(0.5)
      .setDepth(4);

    this.frontTag = this.add
      .text(0, 0, 'Tap me!', {
        fontFamily: FONT_FAMILY,
        fontSize: '42px',
        fontStyle: 'bold',
        color: CSS.ink,
        backgroundColor: CSS.cream,
        padding: { x: 18, y: 10 },
      })
      .setOrigin(0.5)
      .setDepth(10);
    this.tweens.add({ targets: this.frontTag, scale: 1.1, duration: 500, yoyo: true, repeat: -1 });

    this.doneText = this.add
      .text(0, 0, "that's everyone for today!\nthanks for a sweet day", {
        fontFamily: FONT_FAMILY,
        fontSize: '44px',
        color: CSS.ink,
        align: 'center',
        backgroundColor: CSS.cream,
        padding: { x: 24, y: 16 },
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.panelText = this.add
      .text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: '38px', color: CSS.ink, backgroundColor: CSS.cream, padding: { x: 24, y: 16 }, align: 'left', lineSpacing: 6 })
      .setOrigin(0.5)
      .setDepth(20)
      .setName('lobby-checklist');
    this.openButton = new Button(this, 0, 0, 'Open the window', () => this.openShop(), { width: 520, name: 'btn-open' }).setDepth(21);
    this.closeButton = new Button(this, 0, 0, 'Close up', () => this.closeUp(), { width: 520, name: 'btn-close-up' }).setDepth(21);
    // Any time while open: close the window early (two taps, so it isn't by accident).
    this.closeEarlyButton = new Button(this, 0, 0, 'Close early', () => this.closeEarly(), { width: 360, height: 120, fontSize: 42, fill: COLORS.dough, name: 'btn-close-early' }).setDepth(21);
    this.sendHomeButton = new Button(this, 0, 0, 'Send them home', () => this.sendHome(), { width: 520, fill: COLORS.dough, name: 'btn-send-home' }).setDepth(21);
    this.pickupsText = this.add
      .text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: '32px', color: CSS.ink, backgroundColor: '#fffaf0cc', padding: { x: 18, y: 12 }, align: 'left' })
      .setOrigin(0.5)
      .setDepth(8)
      .setName('lobby-pickups');
    // Pickup countdowns tick every second.
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.syncPanels() });

    listen(this, session().events, 'changed', () => this.sync(false));
    listen(this, session().events, 'friend', (e) => this.friendVisit(e.line));
    // A regular who knows you: "the usual!" as they head to the patio.
    listen(this, session().events, 'usual', (e) => {
      this.time.delayedCall(60, () => {
        const view = this.views.get(e.customerId);
        if (view) this.say(view, `${e.name}: "${e.line}"`);
      });
    });

    // mochi sits on the lot: tap for the journal. A badge says when there are new stickers.
    this.journalButton = this.add.image(0, 0, TextureKeys.Mascot).setDepth(8).setName('btn-journal').setInteractive({ useHandCursor: true });
    this.journalButton.on(Phaser.Input.Events.POINTER_UP, () => {
      audio().play('tap');
      if (!this.scene.isActive(SceneKeys.Journal)) this.scene.launch(SceneKeys.Journal);
    });
    this.journalLabel = this.add
      .text(0, 0, 'journal', { fontFamily: FONT_FAMILY, fontSize: '30px', fontStyle: 'bold', color: CSS.cream, backgroundColor: '#2b2522', padding: { x: 12, y: 4 } })
      .setOrigin(0.5, 0)
      .setDepth(8);
    this.tweens.add({ targets: this.journalButton, angle: { from: -4, to: 4 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.events.on(Phaser.Scenes.Events.WAKE, this.refreshJournalBadge, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(Phaser.Scenes.Events.WAKE, this.refreshJournalBadge, this));
    const tracker = stickers();
    if (tracker) {
      const off = tracker.events.on('earned', () => this.refreshJournalBadge());
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
    }

    onLayout(this, (v: Viewport) => {
      const L = LAYOUT[v.orientation];
      const c = v.content;
      const groundY = c.y + L.groundY;

      // The lot, sky and patio fill the whole screen width and run under the tab bar.
      this.scenery.layout(v, {
        groundY,
        truck: { x: c.x + L.truck.x, y: c.y + L.truck.y, scale: L.truck.scale },
        sign: { x: c.x + L.sign.x, feetY: c.y + L.sign.feetY },
        patio: { x: c.x + L.waiting.x, y: c.y + L.waiting.y, w: L.waiting.w, h: L.waiting.h },
      });

      truck.setPosition(c.x + L.truck.x, c.y + L.truck.y).setScale(L.truck.scale);
      sign.setPosition(c.x + L.sign.x, c.y + L.sign.feetY).setScale(L.sign.scale);
      chalk.setPosition(c.x + L.chalk.x, c.y + L.chalk.y);
      waitingLabel.setPosition(c.x + L.waiting.x, c.y + L.waiting.labelY);
      this.doneText.setPosition(c.x + c.width / 2, c.y + (v.orientation === 'landscape' ? 160 : 230));
      this.panelText.setPosition(c.x + L.panel.x, c.y + L.panel.y).setWordWrapWidth(L.panel.width);
      this.openButton.setPosition(c.x + L.panel.x, c.y + L.panel.buttonY);
      this.closeButton.setPosition(c.x + L.panel.x, c.y + L.panel.buttonY);
      this.sendHomeButton.setPosition(c.x + L.panel.x, c.y + L.panel.buttonY);
      this.closeEarlyButton.setPosition(c.x + L.closeEarly.x, c.y + L.closeEarly.y);
      this.pickupsText.setPosition(c.x + L.pickups.x, c.y + L.pickups.y);
      // Not on the tutorial day: mochi's busy teaching.
      const showJournal = !session().isTutorial;
      this.journalButton.setPosition(c.x + L.journal.x, c.y + L.journal.y).setScale(L.journal.scale).setVisible(showJournal);
      this.journalLabel.setPosition(c.x + L.journal.x, c.y + L.journal.y + 105 * L.journal.scale).setVisible(showJournal);
      this.refreshJournalBadge();
      this.sync(true);
    });
  }

  override update(_time: number, delta: number): void {
    this.scenery.update(delta);
  }

  // ---- Rendering from session state --------------------------------------

  /** Bring sprites in line with the session. `snap` skips walking (used on relayout). */
  private sync(snap: boolean): void {
    const s = session();
    const v = getViewport(this);
    const L = LAYOUT[v.orientation];
    const c = v.content;
    const present = new Set<number>();

    s.line.forEach((cust, i) => {
      present.add(cust.id);
      const x = c.x + (L.line.x[Math.min(i, L.line.x.length - 1)] ?? 0) + Math.max(0, i - 3) * 40;
      const name = i === 0 && cust.state === 'inLine' ? 'customer-front' : '';
      this.place(cust, { x, y: c.y + L.line.feetY, scale: L.line.scale }, name, snap, v);
    });

    s.waiting.forEach((cust, i) => {
      present.add(cust.id);
      const slot = L.waiting.slots[i % L.waiting.slots.length]!;
      const wrap = Math.floor(i / L.waiting.slots.length) * 30;
      this.place(cust, { x: c.x + slot[0] + wrap, y: c.y + slot[1] - wrap, scale: L.waiting.scale }, `waiting-${cust.ticketNo}`, snap, v);
    });

    for (const view of this.views.values()) {
      if (!present.has(view.id) && !view.leaving) this.leave(view);
    }

    const front = s.line[0];
    const frontView = front ? this.views.get(front.id) : undefined;
    const showTag = !!frontView && front?.state === 'inLine' && !frontView.moving;
    this.frontTag.setVisible(showTag);
    if (showTag && frontView) {
      this.frontTag.setPosition(frontView.image.x, frontView.image.y - CUSTOMER_H * frontView.image.scale - 50);
    }

    this.doneText.setVisible(s.isDayComplete && s.phase === 'open');
    this.syncPanels();
  }

  /** The prep / closing checklist and button, the sign, and the pickups list. */
  private syncPanels(): void {
    const s = session();
    // Patience hearts tick down every second.
    for (const view of this.views.values()) {
      const cust = s.customer(view.id);
      if (cust && !view.leaving) this.setTag(view, cust);
    }
    this.scenery.setPhase(s.phase);
    this.truck?.setOpen(s.phase === 'open' && !s.timeUp);
    const prep = s.phase === 'prep';
    const closing = s.phase === 'closing';
    const lastOrders = s.phase === 'open' && s.timeUp && s.unserved > 0;
    this.openButton.setVisible(prep);
    this.closeButton.setVisible(closing);
    this.sendHomeButton.setVisible(lastOrders);
    const canClose = s.phase === 'open' && !s.timeUp && Number.isFinite(s.timeLeftMs);
    this.closeEarlyButton.setVisible(canClose);
    if (!canClose) this.confirmClose = false;
    if (prep) {
      const dough = Number.isFinite(s.dough) ? s.dough : 0;
      const lines = [
        s.event ? `pop-up day: ${s.event.name}!` : 'good morning! before opening:',
        ...(s.weather ? [`(${s.weather.note})`] : []),
        ...(s.special ? [`• special: ${menu.flavors.find((f) => f.id === s.special)?.name} (+${money(balance.special.priceBonus)})`] : []),
        `• ${dough ? `dough: ${dough} donuts ready` : 'make dough (Dough station)'}`,
      ];
      if (s.pickups.length) lines.push(`• ${s.pickups.length} pickup${s.pickups.length === 1 ? '' : 's'} on the rail`);
      lines.push('then open the window!');
      this.panelText.setText(lines.join('\n')).setVisible(true);
    } else if (lastOrders) {
      const n = s.unserved;
      this.panelText
        .setText(["time's up! the window's closed.", `• finish the last ${n === 1 ? 'order' : `${n} orders`}`, "• can't? send them home", "  (they won't pay)"].join('\n'))
        .setVisible(true);
    } else if (closing) {
      const c = s.cleanup;
      const tick = (done: boolean) => (done ? '(done)' : '');
      this.panelText
        .setText(
          [
            'closing time! clean up:',
            `• wipe the glaze tray ${tick(c.glazeTray)}`,
            `• wipe the toppings tray ${tick(c.toppingsTray)}`,
            `• filter the fryer oil ${tick(c.oil)}`,
          ].join('\n'),
        )
        .setVisible(true);
      this.closeButton.setLabel(c.glazeTray && c.toppingsTray && c.oil ? 'Close up' : 'Close anyway');
    } else {
      this.panelText.setVisible(false);
    }

    // Pickups waiting for a courier, with how long until they're late.
    const pickups = s.pickups;
    if (pickups.length) {
      const rows = pickups.map((cust) => {
        const t = s.ticket(cust.ticketNo!)!;
        const left = Math.max(0, Math.round(s.typeOf(cust).patienceSec - (s.timeMs - t.takenAtMs) / 1000));
        return `#${t.no} ${s.typeOf(cust).name} · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      });
      this.pickupsText.setText(['pickups (courier):', ...rows].join('\n')).setVisible(true);
    } else {
      this.pickupsText.setVisible(false);
    }
  }

  private openShop(): void {
    const s = session();
    if (Number.isFinite(s.dough) && s.dough === 0) {
      // Allowed, but worth a nudge.
      this.panelText.setText('no dough yet! make a batch at the Dough station first\n(or open anyway: tap again)');
      if (!this.confirmOpen) {
        this.confirmOpen = true;
        return;
      }
    }
    if (s.openShop()) audio().play('chime');
  }

  private confirmOpen = false;

  /** "journal", or "new sticker!" when there's one you haven't looked at. */
  private refreshJournalBadge(): void {
    const j = save().data.journal;
    const fresh = j.stickers.length > j.seen;
    this.journalLabel?.setText(fresh ? 'new sticker!' : 'journal').setBackgroundColor(fresh ? '#b0406a' : '#2b2522');
  }

  private closeEarly(): void {
    if (!this.confirmClose) {
      this.confirmClose = true;
      this.closeEarlyButton.setLabel('Tap to confirm');
      this.time.delayedCall(3000, () => {
        this.confirmClose = false;
        this.closeEarlyButton?.setLabel('Close early');
      });
      return;
    }
    this.confirmClose = false;
    this.closeEarlyButton.setLabel('Close early');
    session().closeEarly();
  }

  private sendHome(): void {
    if (session().sendHome() > 0) audio().play('tap');
  }

  /** One of Ethan's friends walks up to the window with supplies, says hi, and heads off. */
  /** One of Ethan's friends walks up with a crate, and waits with their message until you tap it. */
  private friendVisit(line: string): void {
    const v = getViewport(this);
    const L = LAYOUT[v.orientation];
    const c = v.content;
    const keys = [TextureKeys.CustomerRegular, TextureKeys.CustomerStudent, TextureKeys.CustomerOffice, TextureKeys.CustomerParent];
    const key = keys[Math.floor(Math.random() * keys.length)]!;
    const y = c.y + L.groundY + (v.orientation === 'landscape' ? 150 : 200);
    const x = c.x + L.truck.x + (v.orientation === 'landscape' ? 120 : 160);
    const scale = L.line.scale * 0.95;
    const friend = this.add.image(v.width + 120, y, key).setOrigin(0.5, 1).setScale(scale).setDepth(7).setName('lobby-friend');
    // Carrying a supply crate.
    const crate = this.add.rectangle(friend.x, y - CUSTOMER_H * scale * 0.42, 110 * scale, 80 * scale, 0xc8955f).setStrokeStyle(5, COLORS.ink).setDepth(8);
    const follow = () => crate.setPosition(friend.x, y - CUSTOMER_H * scale * 0.42);
    const leave = () => {
      this.tweens.add({
        targets: friend,
        x: -200,
        duration: Math.max(400, ((friend.x + 200) / WALK_SPEED) * 1000),
        onComplete: () => (friend.destroy(), crate.destroy()),
      });
    };
    this.tweens.add({
      targets: friend,
      x,
      duration: Math.max(400, ((friend.x - x) / WALK_SPEED) * 1000),
      onUpdate: follow,
      onComplete: () => {
        crate.setVisible(false);
        const w = 620;
        const bx = Phaser.Math.Clamp(x, w / 2 + 20, v.width - w / 2 - 20);
        const bubble = new SpeechBubble(this, bx, y - CUSTOMER_H * scale - 130, w, `${line}\n(tap to say thanks)`, Phaser.Math.Clamp(x - bx, -200, 200), 36)
          .setDepth(30)
          .setName('friend-bubble');
        // Stays until you tap them (or their bubble): then a wave, and off they go.
        bubble.setSize(w, bubble.getBounds().height).setInteractive({ useHandCursor: true });
        friend.setInteractive({ useHandCursor: true });
        const done = () => {
          if (!bubble.active) return;
          audio().play('tap');
          bubble.destroy();
          friend.disableInteractive();
          leave();
        };
        bubble.on(Phaser.Input.Events.POINTER_UP, done);
        friend.on(Phaser.Input.Events.POINTER_UP, done);
      },
    });
  }

  private closeUp(): void {
    if (session().closeUp()) this.scene.launch(SceneKeys.DaySummary);
  }

  private place(cust: Customer, target: { x: number; y: number; scale: number }, name: string, snap: boolean, v: Viewport): void {
    let view = this.views.get(cust.id);
    if (!view) {
      view = this.createView(cust, target, v);
      this.views.set(cust.id, view);
    }
    // Hidden when empty: an empty Text still draws its background padding.
    // Regulars wear their name; waiting customers their ticket number.
    this.setTag(view, cust);

    const t = view.target;
    const same = !!t && t.x === target.x && t.y === target.y && t.scale === target.scale;
    if (same && !snap) {
      if (!view.moving) view.image.setName(name);
      return;
    }
    view.target = target;
    this.tweens.killTweensOf(view.image);

    if (snap) {
      view.image.setPosition(target.x, target.y).setScale(target.scale).setName(name);
      view.moving = false;
      this.positionTag(view);
      return;
    }

    view.image.setName('');
    view.moving = true;
    const dist = Phaser.Math.Distance.Between(view.image.x, view.image.y, target.x, target.y);
    const moving = view;
    this.tweens.add({
      targets: view.image,
      x: target.x,
      y: target.y,
      scale: target.scale,
      duration: Math.max(150, (dist / WALK_SPEED) * 1000),
      onUpdate: () => this.positionTag(moving),
      onComplete: () => {
        moving.moving = false;
        moving.image.setName(name);
        this.positionTag(moving);
        this.sync(false); // refresh the front tag now they've arrived
      },
    });
  }

  private createView(cust: Customer, target: { x: number; y: number; scale: number }, v: Viewport): CustomerView {
    const key = session().typeOf(cust).sprite;
    // New arrivals walk in from off the right edge.
    const image = this.add.image(v.width + 120, target.y, key).setOrigin(0.5, 1).setScale(target.scale).setDepth(5);
    image.setInteractive({ useHandCursor: true });
    image.on(Phaser.Input.Events.POINTER_UP, () => this.onCustomerTap(cust.id));
    const tag = this.add
      .text(0, 0, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '40px',
        fontStyle: 'bold',
        color: CSS.cream,
        backgroundColor: CSS.ink,
        padding: { x: 12, y: 4 },
      })
      .setOrigin(0.5)
      .setDepth(6);
    return { id: cust.id, image, tag, target: null, moving: false, leaving: false };
  }

  /**
   * A customer's tag: regulars' names, waiting customers' ticket numbers and
   * how patient they still are (hearts that empty as they wait).
   */
  private setTag(view: CustomerView, cust: Customer): void {
    const s = session();
    const reg = s.regularOf(cust);
    const waiting = cust.ticketNo !== undefined && cust.state === 'waiting';
    const no = waiting ? `#${cust.ticketNo}` : '';
    const hearts = waiting && !cust.delivery ? s.patienceHearts(cust) : 3;
    const mood = waiting ? ` ${'♥'.repeat(hearts)}${'♡'.repeat(3 - hearts)}` : '';
    const label = (reg ? (no ? `${reg.name} ${no}` : reg.name) : no) + mood;
    view.tag.setText(label).setVisible(label !== '').setBackgroundColor(hearts === 0 ? '#b03a3a' : CSS.ink);
  }

  private positionTag(view: CustomerView): void {
    view.tag.setPosition(view.image.x, view.image.y - CUSTOMER_H * view.image.scale - 24);
  }

  /** Served customers walk off the left edge. */
  private leave(view: CustomerView): void {
    view.leaving = true;
    view.image.disableInteractive().setName('');
    view.tag.setVisible(false);
    this.tweens.killTweensOf(view.image);
    this.tweens.add({
      targets: view.image,
      x: -200,
      duration: Math.max(300, ((view.image.x + 200) / WALK_SPEED) * 1000),
      onComplete: () => {
        view.image.destroy();
        view.tag.destroy();
        this.views.delete(view.id);
      },
    });
  }

  // ---- Input ----------------------------------------------------------------

  private onCustomerTap(id: number): void {
    const s = session();
    const cust = s.customer(id);
    const view = this.views.get(id);
    if (!cust || !view || view.moving || view.leaving) return;

    if (cust.state === 'inLine' && s.line[0]?.id === id) {
      if (this.scene.isActive(SceneKeys.Order)) return;
      const ticket = s.takeOrder(id);
      this.scene.launch(SceneKeys.Order, { ticketNo: ticket.no });
      return;
    }

    if (cust.state === 'waiting') {
      // Orders are handed over automatically when their box is closed.
      this.say(view, `#${cust.ticketNo}: can't wait! (close my box at the Box station)`);
    }
  }

  /** Short-lived speech bubble above a customer. */
  private say(view: CustomerView, text: string): void {
    this.bubble?.destroy();
    const v = getViewport(this);
    const w = 560;
    const x = Phaser.Math.Clamp(view.image.x, w / 2 + 20, v.width - w / 2 - 20);
    const bubble = new SpeechBubble(this, x, 0, w, text, Phaser.Math.Clamp(view.image.x - x, -200, 200), 38);
    bubble.setPosition(x, view.image.y - CUSTOMER_H * view.image.scale - 130).setDepth(30).setName('bubble-customer');
    this.bubble = bubble;
    this.time.delayedCall(2200, () => {
      if (this.bubble === bubble) this.bubble = null;
      bubble.destroy();
    });
  }
}
