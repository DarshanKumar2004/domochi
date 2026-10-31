import Phaser from 'phaser';
import { AnimKeys, TextureKeys } from '../assets/keys';
import tutorial from '../data/tutorial.json';
import { menu, save, session } from '../systems/services';
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
  /** Station the step happens at (if you're elsewhere, Ethan sends you there first). */
  station?: StationKey;
  target?: Target;
}

/** Where the game is in the training order, from 0 (nothing yet) to 10 (served). */
type Stage = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

const LINES = tutorial.steps as Record<string, string>;
/** Ethan's bubble, before scaling to the screen. */
const BUBBLE_W = 760;
const FLAVOR = tutorial.order[0]!;
/** The training order's base glaze and topping (cookies & cream: its glaze, crushed cookies). */
const recipe = menu.flavors.find((f) => f.id === FLAVOR)!;
const TOPPING = recipe.toppings[0];

/**
 * The guided first day, drawn over the real game: Ethan explains each step,
 * a hand points at what to tap, and the next step comes when you've done it.
 *
 * Steps are worked out from the game's state every frame rather than ticked
 * off, so they cope with anything: if the donut burns, it's back to "drop";
 * if you wander to another station, Ethan points you back.
 */
export class TutorialScene extends Phaser.Scene {
  private bubble!: SpeechBubble;
  private ethan!: Phaser.GameObjects.Sprite;
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
    this.ethan = this.add.sprite(0, 0, TextureKeys.Ethan).setOrigin(0.5, 1).setScale(0.75).setDepth(4).play(AnimKeys.EthanWave);
    this.bubble = new SpeechBubble(this, 0, 0, BUBBLE_W, '', -BUBBLE_W / 2 + 60, 40).setDepth(4).setName('tutorial-bubble');
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
      case 1:
        if (active(SceneKeys.Order)) return { id: 'take', target: { scene: SceneKeys.Order, name: 'btn-take-order' } };
        return { id: 'drop', station: SceneKeys.Fry, target: { scene: SceneKeys.Fry, name: 'btn-drop' } };
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
        return { id: 'pour', station: SceneKeys.Glaze, target: { scene: SceneKeys.Glaze, name: 'glaze-board' } };
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
    // The panel sits away from what it's pointing at: at the top if the target is low, and vice versa.
    const top = b ? b.centerY > v.height * 0.5 : true;
    const key = `${line}|${top}|${v.width}x${v.height}`;
    if (key !== this.shownKey) {
      this.shownKey = key;
      this.panelTop = top;
      this.bubble.setMessage(line);
      this.layoutPanel(v, talking);
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

  private layoutPanel(v: Viewport, talking: boolean): void {
    const L = v.orientation === 'landscape';
    // Ethan on the left, his bubble to his right; below the rail (top) or above the tab bar (bottom).
    const left = L ? v.safe.x + 520 : 220;
    const w = L ? 820 : v.width - left - 20;
    this.bubble.setScale(w / BUBBLE_W);
    const h = this.bubble.getBounds().height;
    const cx = left + w / 2;
    const y = this.panelTop ? v.railHeight + 30 + h / 2 : v.height - v.tabBarHeight - 70 - h / 2 - (talking ? 140 : 0);
    this.bubble.setPosition(cx, y);
    this.ethan.setPosition(left - 110, y + h / 2);
    this.next.setVisible(talking).setPosition(cx + w / 2 - 160, y + h / 2 + 85);
    this.skip.setPosition(left + 130, this.panelTop ? y + h / 2 + 55 : y - h / 2 - 50);
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
