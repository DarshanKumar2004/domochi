import Phaser from 'phaser';
import { TextureKeys } from '../assets/keys';
import tutorial from '../data/tutorial.json';
import { balance, menu, save, session } from '../systems/services';
import { Button } from '../ui/Button';
import type { Viewport } from '../ui/layout';
import { SpeechBubble } from '../ui/SpeechBubble';
import { STATION_TABS, type StationKey } from '../ui/tabs';
import { COLORS, CSS, FONT_FAMILY } from '../ui/theme';
import { getViewport, onLayout } from '../ui/viewport';
import { getHud, startMainGame, stopMainGame } from './flow';
import type { GlazeScene } from './GlazeScene';
import { SceneKeys, type SceneKey } from './sceneKeys';
import type { ToppingsScene } from './ToppingsScene';

type StepId = keyof typeof tutorial.steps | 'intro' | 'outro';

/** What a step points at: a named object in a scene (or nothing, for talking steps). */
interface Target {
  scene: SceneKey;
  name: string;
}

interface Step {
  id: StepId;
  /** Station the step happens at (if you're elsewhere, mochi sends you there first). */
  station?: StationKey;
  target?: Target;
}

/** Where the game is in the training order, from 0 (nothing yet) to 10 (served). */
type Stage = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

const LINES = tutorial.steps as Record<string, string>;
/** mochi's bubble, before scaling to the screen. */
const BUBBLE_W = 680;
/** Room the pointing hand takes beside its target (so the bubble doesn't cover it either). */
const HAND_ROOM = 180;
const FLAVOR = tutorial.order[0]!;
/** The training order's base glaze and topping (cookies & cream: its glaze, crushed cookies). */
const recipe = menu.flavors.find((f) => f.id === FLAVOR)!;
const TOPPING = recipe.toppings[0];

/**
 * The guided first day, drawn over the real game: mochi (a donut buddy) explains each step,
 * a hand points at what to tap, and the next step comes when you've done it.
 *
 * Steps are worked out from the game's state every frame rather than ticked
 * off, so they cope with anything: if the donut burns, it's back to "drop";
 * if you wander to another station, mochi points you back. The bubble goes
 * wherever it won't cover what it's pointing at.
 */
export class TutorialScene extends Phaser.Scene {
  private bubble!: SpeechBubble;
  private mascot!: Phaser.GameObjects.Image;
  /** The bubble's height at its current message and scale. */
  private bubbleH = 0;
  private hand!: Phaser.GameObjects.Image;
  private ring!: Phaser.GameObjects.Graphics;
  private next!: Button;
  private skip!: Phaser.GameObjects.Text;
  private introIndex = 0;
  private outroIndex = 0;
  private shownKey = '';
  private finished = false;
  private bob = { t: 0 };
  private readonly bounds = new Phaser.Geom.Rectangle();
  private panelTop = true;

  constructor() {
    super(SceneKeys.Tutorial);
  }

  create(): void {
    this.introIndex = 0;
    this.outroIndex = 0;
    this.shownKey = '';
    this.finished = false;
    this.panelTop = true;

    this.ring = this.add.graphics().setDepth(1);
    this.hand = this.add.image(0, 0, TextureKeys.PointerHand).setOrigin(0.5, 0.05).setDepth(3).setVisible(false).setName('tutorial-hand');
    this.mascot = this.add.image(0, 0, TextureKeys.Mascot).setOrigin(0.5, 1).setScale(0.75).setDepth(4).setName('tutorial-mascot');
    // mochi bobs and squishes a little while it talks.
    this.tweens.add({ targets: this.mascot, scaleY: 0.7, scaleX: 0.8, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.bubble = new SpeechBubble(this, 0, 0, BUBBLE_W, '', 0, 36, 'left').setDepth(4).setName('tutorial-bubble');
    this.next = new Button(this, 0, 0, 'Next', () => this.advance(), { width: 280, height: 120, fontSize: 46, name: 'btn-tutorial-next' }).setDepth(5);
    this.skip = this.add
      .text(0, 0, 'skip tutorial', { fontFamily: FONT_FAMILY, fontSize: '34px', color: CSS.cream, backgroundColor: '#1f1a17cc', padding: { x: 18, y: 12 } })
      .setOrigin(0.5)
      .setDepth(5)
      .setName('btn-skip')
      .setInteractive({ useHandCursor: true });
    this.skip.on(Phaser.Input.Events.POINTER_UP, () => this.finish());
    this.tweens.add({ targets: this.bob, t: 1, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    onLayout(this, () => (this.shownKey = '')); // re-place everything on the next frame
  }

  // ---- Which step are we on? ------------------------------------------------------

  private stage(): Stage {
    const s = session();
    const t = s.ticket(1);
    if (t?.status === 'served') return 10;
    if (s.boxCount > 0) return 9;
    if (s.shelf.some((d) => s.flavorOf(d) === FLAVOR)) return 8;
    if (s.toppingWork) return 7;
    if (s.shelf.length > 0) return 6;
    if (s.glazeWork) return 5;
    if (s.rack.length > 0) return 4;
    if (s.fryer.slots.some((d) => d && d.flips > 0)) return 3;
    if (s.fryer.count > 0) return 2;
    if (t) return 1;
    return 0;
  }

  private step(): Step {
    if (this.introIndex < tutorial.intro.length) return { id: 'intro' };
    const s = session();
    const active = (k: SceneKey) => this.scene.isActive(k);
    switch (this.stage()) {
      case 0:
        if (active(SceneKeys.Order)) return { id: 'take', target: { scene: SceneKeys.Order, name: 'btn-take-order' } };
        return { id: 'customer', station: SceneKeys.Lobby, target: { scene: SceneKeys.Lobby, name: 'customer-front' } };
      case 1: {
        if (active(SceneKeys.Order)) return { id: 'take', target: { scene: SceneKeys.Order, name: 'btn-take-order' } };
        // No dough yet: the Dough station first (scoop each ingredient, stir, into the tub).
        if (s.dough < 1) {
          const w = s.doughBatch;
          const next = Object.entries(balance.dough.recipe).find(([id, n]) => (w?.scoopsOf(id) ?? 0) < n);
          if (next) return { id: 'scoop', station: SceneKeys.Dough, target: { scene: SceneKeys.Dough, name: `bin-${next[0]}` } };
          if (w && w.stage !== 'ready') return { id: 'stir', station: SceneKeys.Dough, target: { scene: SceneKeys.Dough, name: 'dough-stir' } };
          return { id: 'tub', station: SceneKeys.Dough, target: { scene: SceneKeys.Dough, name: 'btn-dough-done' } };
        }
        return { id: 'drop', station: SceneKeys.Fry, target: { scene: SceneKeys.Fry, name: 'btn-drop' } };
      }
      case 2:
      case 3: {
        const slot = s.fryer.slots.findIndex((d) => d !== null);
        return { id: this.stage() === 2 ? 'flip' : 'pull', station: SceneKeys.Fry, target: { scene: SceneKeys.Fry, name: `fry-donut-${slot}` } };
      }
      case 4:
        return { id: 'tray', station: SceneKeys.Glaze, target: { scene: SceneKeys.Glaze, name: 'glaze-tray-0' } };
      case 5: {
        const glaze = this.scene.get(SceneKeys.Glaze) as GlazeScene;
        const base = s.glazeWork!.currentLayer?.kind === 'base' ? s.glazeWork!.currentLayer : s.glazeWork!.layers.find((l) => l.kind === 'base');
        if (base && base.style !== 'drizzle' && base.coverage >= glazedEnough(base.style)) {
          return { id: 'glazeDone', station: SceneKeys.Glaze, target: { scene: SceneKeys.Glaze, name: 'btn-glaze-done' } };
        }
        if (glaze.selectedCup !== recipe.glaze) return { id: 'cup', station: SceneKeys.Glaze, target: { scene: SceneKeys.Glaze, name: `cup-${recipe.glaze}` } };
        return { id: 'pour', station: SceneKeys.Glaze, target: { scene: SceneKeys.Glaze, name: 'glaze-donut' } };
      }
      case 6:
        return { id: 'shelf', station: SceneKeys.Toppings, target: { scene: SceneKeys.Toppings, name: 'toppings-shelf-0' } };
      case 7: {
        const top = this.scene.get(SceneKeys.Toppings) as ToppingsScene;
        const t = menu.toppings.find((x) => x.id === TOPPING);
        if (t && s.toppingWork!.countOn(t.id) >= t.amount.min) {
          return { id: 'toppingsDone', station: SceneKeys.Toppings, target: { scene: SceneKeys.Toppings, name: 'btn-toppings-done' } };
        }
        if (top.selectedJar !== TOPPING) return { id: 'jar', station: SceneKeys.Toppings, target: { scene: SceneKeys.Toppings, name: `jar-${TOPPING}` } };
        return { id: 'shake', station: SceneKeys.Toppings, target: { scene: SceneKeys.Toppings, name: 'toppings-board' } };
      }
      case 8: {
        const i = s.shelf.findIndex((d) => s.flavorOf(d) === FLAVOR);
        return { id: 'pack', station: SceneKeys.Box, target: { scene: SceneKeys.Box, name: `box-shelf-${i}` } };
      }
      case 9:
        return { id: 'serve', station: SceneKeys.Box, target: { scene: SceneKeys.Box, name: 'btn-serve' } };
      default:
        if (active(SceneKeys.Serve)) return { id: 'card', target: { scene: SceneKeys.Serve, name: 'btn-serve-done' } };
        return { id: 'outro' };
    }
  }

  // ---- Per frame -----------------------------------------------------------------

  override update(): void {
    if (this.finished) return;
    // Stay above everything, including popups (Order, Serve) that bring themselves to the top.
    const mgr = this.scene.manager;
    if (mgr.getIndex(this.scene.key) !== mgr.scenes.length - 1) this.scene.bringToTop();

    let step = this.step();
    let target = step.target;
    let line: string;
    if (step.id === 'intro') line = tutorial.intro[this.introIndex]!;
    else if (step.id === 'outro') line = tutorial.outro[this.outroIndex]!;
    else line = LINES[step.id] ?? '';
    // At the wrong station? Point at its tab first.
    if (step.station && getHud(this).currentStation !== step.station) {
      const tab = STATION_TABS.find((t) => t.scene === step.station)!;
      target = { scene: SceneKeys.Hud, name: `tab-${tab.label}` };
      line = LINES.goTo!.replace('{station}', tab.label);
      step = { id: step.id, station: step.station, target };
    }

    const found = target ? this.findBounds(target) : null;
    this.place(line, step.id, found);
  }

  /** The named object's bounds in screen space, or null if it isn't showing. */
  private findBounds(t: Target): Phaser.Geom.Rectangle | null {
    if (!this.scene.isActive(t.scene)) return null;
    type O = Phaser.GameObjects.GameObject & { visible?: boolean; list?: O[]; getBounds?: (out: Phaser.Geom.Rectangle) => Phaser.Geom.Rectangle };
    const stack: O[] = [...(this.scene.get(t.scene).children.list as O[])];
    while (stack.length) {
      const o = stack.pop()!;
      if (o.visible === false) continue;
      if (o.name === t.name && o.getBounds) return o.getBounds(this.bounds);
      if (o.list) stack.push(...o.list);
    }
    return null;
  }

  /** Show the line, the Next button (talking steps), the highlight ring and the pointing hand. */
  private place(line: string, id: StepId, b: Phaser.Geom.Rectangle | null): void {
    const v = getViewport(this);
    const talking = id === 'intro' || id === 'outro';
    if (!this.shownKey.startsWith(`${line}|`)) {
      this.bubble.setMessage(line);
      this.layoutPanel(v, talking, this.panelTop);
      this.bubbleH = this.bubble.getBounds().height;
    }
    // The panel goes top or bottom, whichever doesn't cover the target (and the hand beside it).
    const top = this.chooseTop(v, talking, b);
    const key = `${line}|${top}|${v.width}x${v.height}`;
    if (key !== this.shownKey) {
      this.shownKey = key;
      this.panelTop = top;
      this.layoutPanel(v, talking, top);
    }

    this.ring.clear();
    if (!b) {
      this.hand.setVisible(false);
      return;
    }
    const pad = 14;
    this.ring.lineStyle(8, COLORS.pink, 0.55 + 0.45 * this.bob.t);
    this.ring.strokeRoundedRect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2, 24);
    // The hand points up-left at the target's centre, from below-right (or from above if there's no room below).
    const below = b.bottom + 180 < v.height;
    const lift = 24 * this.bob.t;
    if (below) this.hand.setPosition(b.centerX + 18 + lift * 0.5, b.centerY + 18 + lift).setAngle(-25);
    else this.hand.setPosition(b.centerX - 18 - lift * 0.5, b.centerY - 18 - lift).setAngle(155);
    this.hand.setVisible(true);
  }

  /** Panel geometry: mochi on the left, the bubble to its right. */
  private panelBox(v: Viewport, talking: boolean, top: boolean, h: number): { left: number; w: number; y: number; rect: Phaser.Geom.Rectangle } {
    const L = v.orientation === 'landscape';
    const left = L ? v.safe.x + 560 : 190;
    const w = L ? 720 : Math.min(760, v.width - left - 20);
    const y = top ? v.railHeight + 24 + h / 2 : v.height - v.tabBarHeight - 60 - h / 2 - (talking ? 130 : 0);
    // Everything the panel covers: mochi, the bubble, and the skip / Next buttons.
    const rect = new Phaser.Geom.Rectangle(left - 190, y - h / 2 - (top ? 0 : 80), w + 190, h + 80 + (talking ? 130 : 0));
    return { left, w, y, rect };
  }

  /** Top unless that covers the target (or its hand); if both do, whichever covers less. */
  private chooseTop(v: Viewport, talking: boolean, b: Phaser.Geom.Rectangle | null): boolean {
    if (!b) return true;
    const h = this.bubbleH || 200;
    const target = new Phaser.Geom.Rectangle(b.x - 20, b.y - 20, b.width + 40 + HAND_ROOM * 0.6, b.height + 40 + HAND_ROOM);
    const cover = (top: boolean) => {
      const r = Phaser.Geom.Rectangle.Intersection(this.panelBox(v, talking, top, h).rect, target);
      return r.width > 0 && r.height > 0 ? r.width * r.height : 0;
    };
    const a = cover(true);
    if (a === 0) return true;
    const bot = cover(false);
    if (bot === 0) return false;
    return a <= bot;
  }

  private layoutPanel(v: Viewport, talking: boolean, top: boolean): void {
    const L = v.orientation === 'landscape';
    const { w } = this.panelBox(v, talking, top, 0);
    this.bubble.setScale(w / BUBBLE_W);
    const h = this.bubble.getBounds().height;
    const { left, y } = this.panelBox(v, talking, top, h);
    const cx = left + w / 2;
    this.bubble.setPosition(cx, y);
    this.mascot.setPosition(left - 100, y + h / 2 + (L ? 0 : 10));
    this.next.setVisible(talking).setPosition(cx + w / 2 - 160, y + h / 2 + 80);
    this.skip.setPosition(left + 120, top ? y + h / 2 + 50 : y - h / 2 - 45);
  }

  // ---- Actions -------------------------------------------------------------------

  /** Next on a talking step. */
  private advance(): void {
    if (this.introIndex < tutorial.intro.length) {
      this.introIndex++;
      return;
    }
    if (this.step().id !== 'outro') return;
    if (this.outroIndex < tutorial.outro.length - 1) this.outroIndex++;
    else this.finish();
  }

  /** Done (or skipped): remember it, and open the trailer for the real day. */
  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    void save().update((d) => {
      d.tutorialDone = true;
    });
    stopMainGame(this);
    startMainGame(this);
  }
}

/** Base-coat coverage that counts as glazed for the tutorial (a bit under full marks, so it moves on promptly). */
function glazedEnough(style: 'dip' | 'dust'): number {
  return style === 'dip' ? 0.8 : 0.75;
}
