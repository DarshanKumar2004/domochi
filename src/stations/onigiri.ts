// Rice station (onigiri). Pure: no Phaser, no clock; driven by tick(dtSec).
// Every number is in balance.json "rice".
//
// Cook a pot of rice (set the water: too little is hard, too much is mushy).
// Then, one onigiri at a time: scoop the rice (hold the paddle), put the
// filling in the middle, press it into a triangle (a few firm, not crushing,
// presses), season it, and wrap the nori round the bottom. Finished onigiri
// wait on the tray for the order's onigiri pack.
import type { Amount } from './kolache';
import { rangeScore, sideToppingScore, type SideItem, type SideMenu } from './sides';

interface Range {
  min: number;
  max: number;
}

export interface RiceBalance {
  _note?: string;
  cooker: {
    /** Seconds a pot takes. */
    cookSec: number;
    /** Onigiri one pot makes. */
    portions: number;
    /** Water level (0–1 on the pot's scale): quality 1 inside ideal, qualityFloor at zeroAt beyond. */
    water: { ideal: Range; zeroAt: number };
    qualityFloor: number;
  };
  scoop: Amount;
  /** The filling's distance from the middle (0 centre, 1 the edge): full marks within perfectWithin, 0 at zeroAt. */
  fill: { perfectWithin: number; zeroAt: number };
  /** Presses to shape it, and how long each should be held (seconds). */
  press: { count: number; idealSec: Range; zeroAt: number; extraFactor: number };
  /** Nori off-centre (0–1): full marks within perfectWithin, 0 at zeroAt. */
  nori: { perfectWithin: number; zeroAt: number };
  trayCapacity: number;
  unwantedFactor: number;
  weights: { rice: number; quality: number; filling: number; shape: number; toppings: number; nori: number };
}

export interface Onigiri {
  id: number;
  /** Rice scooped (1 = just right). */
  rice: number;
  /** The pot's quality (0–1). */
  quality: number;
  filling: string | null;
  /** 0 = right in the middle, 1 = at the edge. */
  fillOffset: number;
  /** How long each press was held (seconds). */
  presses: number[];
  toppings: Record<string, number>;
  /** Nori off-centre (0–1), null if not wrapped. */
  nori: number | null;
}

export type CookerState = 'empty' | 'cooking' | 'ready';

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** A pot's quality from its water level. */
export function riceQuality(water: number, b: RiceBalance): number {
  const w = b.cooker.water;
  return b.cooker.qualityFloor + (1 - b.cooker.qualityFloor) * rangeScore(water, w.ideal, w.zeroAt);
}

/** 0–1 for the presses: each one held about right; missing ones count 0, extras squash it a little. */
export function shapeScore(presses: readonly number[], b: RiceBalance): number {
  const p = b.press;
  let s = 0;
  for (let i = 0; i < p.count; i++) s += i < presses.length ? rangeScore(presses[i]!, p.idealSec, p.zeroAt) : 0;
  s /= p.count;
  const extra = Math.max(0, presses.length - p.count);
  return s * Math.pow(p.extraFactor, extra);
}

/** How well an onigiri matches an item, 0–1. The wrong filling is 0. */
export function onigiriScore(o: Onigiri, item: SideItem, m: SideMenu, b: RiceBalance): number {
  if (o.filling !== item.filling) return 0;
  const w = b.weights;
  const off = (v: number, r: { perfectWithin: number; zeroAt: number }) => rangeScore(v, { min: 0, max: r.perfectWithin }, r.zeroAt - r.perfectWithin);
  const parts =
    w.rice * rangeScore(o.rice, b.scoop.ideal, b.scoop.zeroAt) +
    w.quality * o.quality +
    w.filling * off(o.fillOffset, b.fill) +
    w.shape * shapeScore(o.presses, b) +
    w.toppings * sideToppingScore(item, o.toppings, m, b.unwantedFactor) +
    w.nori * (o.nori === null ? 0 : off(o.nori, b.nori));
  return clamp(parts / (w.rice + w.quality + w.filling + w.shape + w.toppings + w.nori), 0, 1);
}

/** The rice cooker, the board (one onigiri being made) and the tray. */
export class RiceStation {
  cooker: CookerState = 'empty';
  /** Seconds left on the pot. */
  cookLeft = 0;
  /** Onigiri' worth of rice in the pot. */
  portions = 0;
  quality = 1;
  board: Onigiri | null = null;
  readonly tray: Onigiri[] = [];
  private nextId = 1;
  /** The quality the pot cooking now will have. */
  potQuality = 1;

  constructor(private readonly b: RiceBalance) {}

  get trayFull(): boolean {
    return this.tray.length >= this.b.trayCapacity;
  }

  /** Start a pot with this water level (0–1). Only when the pot's empty. */
  startCooker(water: number): boolean {
    if (this.cooker !== 'empty' && !(this.cooker === 'ready' && this.portions === 0)) return false;
    this.cooker = 'cooking';
    this.cookLeft = this.b.cooker.cookSec;
    this.potQuality = riceQuality(clamp(water, 0, 1), this.b);
    return true;
  }

  tick(dtSec: number): void {
    if (this.cooker !== 'cooking') return;
    this.cookLeft -= dtSec;
    if (this.cookLeft <= 0) {
      this.cookLeft = 0;
      this.cooker = 'ready';
      this.portions = this.b.cooker.portions;
      this.quality = this.potQuality;
    }
  }

  /** Scoop rice onto the board while held (a new onigiri takes a portion from the pot). */
  scoop(dtSec: number): boolean {
    if (!this.board) {
      if (this.cooker !== 'ready' || this.portions < 1) return false;
      this.portions--;
      if (this.portions === 0) this.cooker = 'empty';
      this.board = { id: this.nextId++, rice: 0, quality: this.quality, filling: null, fillOffset: 0, presses: [], toppings: {}, nori: null };
    }
    if (this.board.presses.length > 0) return false;
    this.board.rice = Math.min(this.b.scoop.max, this.board.rice + this.b.scoop.perSec * dtSec);
    return true;
  }

  /** Put the filling in, `offset` from the middle (before shaping). */
  setFilling(id: string, offset: number): boolean {
    const o = this.board;
    if (!o || o.rice <= 0 || o.presses.length > 0) return false;
    o.filling = id;
    o.fillOffset = clamp(offset, 0, 1);
    return true;
  }

  /** One press of the hands, held `sec` seconds. */
  press(sec: number): boolean {
    const o = this.board;
    if (!o || o.rice <= 0 || o.nori !== null) return false;
    o.presses.push(Math.max(0, sec));
    return true;
  }

  /** Presses done so far (out of balance.press.count). */
  get pressesDone(): number {
    return this.board?.presses.length ?? 0;
  }

  addTopping(id: string): boolean {
    const o = this.board;
    if (!o || o.rice <= 0) return false;
    o.toppings[id] = (o.toppings[id] ?? 0) + 1;
    return true;
  }

  /** Wrap the nori, `offset` off-centre (0–1). Once. */
  wrapNori(offset: number): boolean {
    const o = this.board;
    if (!o || o.rice <= 0 || o.nori !== null) return false;
    o.nori = clamp(offset, 0, 1);
    return true;
  }

  /** Done: onto the tray. Null if there's nothing on the board or the tray's full. */
  finish(): Onigiri | null {
    const o = this.board;
    if (!o || o.rice <= 0 || this.trayFull) return null;
    this.tray.push(o);
    this.board = null;
    return o;
  }

  trashBoard(): boolean {
    if (!this.board) return false;
    this.board = null;
    return true;
  }

  takeTray(index: number): Onigiri | null {
    const o = this.tray[index];
    if (!o) return null;
    this.tray.splice(index, 1);
    return o;
  }
}

export function validateRice(b: RiceBalance): string[] {
  const e: string[] = [];
  if (!(b.cooker.cookSec > 0 && Number.isInteger(b.cooker.portions) && b.cooker.portions >= 1)) e.push('rice.cooker needs cookSec > 0 and integer portions >= 1');
  if (!(b.scoop.perSec > 0 && b.scoop.ideal.min <= b.scoop.ideal.max && b.scoop.ideal.max < b.scoop.max)) e.push('rice.scoop needs perSec > 0 and ideal.min <= ideal.max < max');
  if (!(Number.isInteger(b.press.count) && b.press.count >= 1 && b.press.idealSec.min <= b.press.idealSec.max)) e.push('rice.press needs an integer count >= 1 and idealSec min <= max');
  if (!(b.fill.zeroAt > b.fill.perfectWithin && b.nori.zeroAt > b.nori.perfectWithin)) e.push('rice.fill and rice.nori need zeroAt > perfectWithin');
  if (!(Number.isInteger(b.trayCapacity) && b.trayCapacity >= 1)) e.push('rice.trayCapacity must be an integer >= 1');
  return e;
}
