// Bake station (kolaches). Pure: no Phaser, no clock; driven by tick(dtSec).
// Every number is in balance.json "bake".
//
// Dough balls go on a sheet pan and start proofing (rising). Each one gets
// its filling (spooned in), is shaped (folded and pinched round a savory
// filling, or a well pressed for a sweet one), maybe topped, and brushed with
// egg wash. The whole pan goes in the oven; it comes out onto the cooling
// rack, and from there into the order's kolache box.
import { rangeScore, sideToppingScore, type SideItem, type SideMenu } from './sides';

interface Range {
  min: number;
  max: number;
}

/** A hold-to-add amount: grows perSec while held, up to max; full marks inside ideal, 0 at zeroAt beyond. */
export interface Amount {
  perSec: number;
  max: number;
  ideal: Range;
  zeroAt: number;
}

export interface BakeBalance {
  _note?: string;
  /** Dough balls the sheet pan holds. */
  panSize: number;
  /** Baked kolaches the cooling rack holds. */
  rackCapacity: number;
  /** Rise per second on the pan (stops once it's in the oven). */
  proof: { perSec: number; ideal: Range; zeroAt: number };
  fill: Amount;
  shape: Amount;
  /** Egg wash: brushing adds wash (the scene turns brush strokes into an amount). Too little is dull, too much is soggy. */
  wash: { max: number; ideal: Range; zeroAt: number };
  oven: {
    startTempF: number;
    startTargetF: number;
    dial: { minF: number; maxF: number };
    heatLagPerSec: number;
    idealRangeF: Range;
    cookRate: { zeroAtF: number; oneAtF: number; max: number };
    /** Seconds from raw to golden at cook rate 1. */
    secondsToGolden: number;
    /** Opening the door to slide a pan in costs this much heat. */
    doorCoolF: number;
    doneness: { perfectWithin: number; zeroAt: number };
    /** This brown and it's burnt: thrown out automatically. */
    burntAt: number;
  };
  /** Each topping that shouldn't be on it multiplies the score by this. */
  unwantedFactor: number;
  weights: { fill: number; shape: number; toppings: number; proof: number; wash: number; bake: number; temperature: number };
}

export interface Kolache {
  /** Stays with the kolache from the pan to the box. */
  id: number;
  filling: string | null;
  /** Filling spooned in (1 = just right). */
  fill: number;
  /** Folded and pinched / the well pressed (1 = just right). */
  shape: number;
  wash: number;
  /** How far it rose before baking (1 = just right). */
  proof: number;
  toppings: Record<string, number>;
  /** Doneness: 0 raw, 1 golden. */
  baked: number;
  bakeSec: number;
  inRangeSec: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function ovenRateAt(tempF: number, b: BakeBalance): number {
  const { zeroAtF, oneAtF, max } = b.oven.cookRate;
  return clamp((tempF - zeroAtF) / (oneAtF - zeroAtF), 0, max);
}

/** 0–1 for how golden it is. */
export function bakeDoneScore(baked: number, b: BakeBalance): number {
  const { perfectWithin, zeroAt } = b.oven.doneness;
  return rangeScore(baked, { min: 1 - perfectWithin, max: 1 + perfectWithin }, zeroAt - perfectWithin);
}

/** How well a kolache matches an item, 0–1. The wrong filling is 0. */
export function kolacheScore(k: Kolache, item: SideItem, m: SideMenu, b: BakeBalance): number {
  if (k.filling !== item.filling) return 0;
  const w = b.weights;
  const bake = bakeDoneScore(k.baked, b);
  const temperature = k.bakeSec > 0 ? clamp(k.inRangeSec / k.bakeSec, 0, 1) : 0;
  const parts =
    w.fill * rangeScore(k.fill, b.fill.ideal, b.fill.zeroAt) +
    w.shape * rangeScore(k.shape, b.shape.ideal, b.shape.zeroAt) +
    w.toppings * sideToppingScore(item, k.toppings, m, b.unwantedFactor) +
    w.proof * rangeScore(k.proof, b.proof.ideal, b.proof.zeroAt) +
    w.wash * rangeScore(k.wash, b.wash.ideal, b.wash.zeroAt) +
    w.bake * bake +
    // A perfect oven temperature only counts as far as it came out golden.
    w.temperature * temperature * bake;
  return clamp(parts / (w.fill + w.shape + w.toppings + w.proof + w.wash + w.bake + w.temperature), 0, 1);
}

/** The pan, the oven and the cooling rack. */
export class Bakery {
  readonly pan: (Kolache | null)[];
  readonly rack: Kolache[] = [];
  temp: number;
  target: number;
  /** The pan is in the oven. */
  inOven = false;
  /** Pan spots that burnt since last checked (the session empties this). */
  readonly burnt: number[] = [];
  private nextId = 1;

  constructor(private readonly b: BakeBalance) {
    this.pan = new Array<Kolache | null>(b.panSize).fill(null);
    this.temp = b.oven.startTempF;
    this.target = b.oven.startTargetF;
  }

  get panCount(): number {
    let n = 0;
    for (const k of this.pan) if (k) n++;
    return n;
  }

  get rackFull(): boolean {
    return this.rack.length >= this.b.rackCapacity;
  }

  setTarget(f: number): void {
    this.target = clamp(f, this.b.oven.dial.minF, this.b.oven.dial.maxF);
  }

  /** A dough ball on the pan (spot `slot` if free, else the first free one). Returns the spot, or -1. */
  placeDough(slot?: number): number {
    if (this.inOven) return -1;
    const at = slot !== undefined && slot >= 0 && slot < this.pan.length && !this.pan[slot] ? slot : this.pan.indexOf(null);
    if (at < 0) return -1;
    this.pan[at] = { id: this.nextId++, filling: null, fill: 0, shape: 0, wash: 0, proof: 0, toppings: {}, baked: 0, bakeSec: 0, inRangeSec: 0 };
    return at;
  }

  /** A raw kolache you can still work on (on the pan, out of the oven, not baked). */
  private raw(slot: number): Kolache | null {
    const k = this.pan[slot];
    return k && !this.inOven && k.baked === 0 ? k : null;
  }

  /** Choose the filling (only before any is spooned in). */
  setFilling(slot: number, id: string): boolean {
    const k = this.raw(slot);
    if (!k || (k.filling !== null && k.fill > 0)) return false;
    k.filling = id;
    return true;
  }

  /** Spoon filling in while held. */
  addFill(slot: number, dtSec: number): boolean {
    const k = this.raw(slot);
    if (!k || !k.filling) return false;
    k.fill = Math.min(this.b.fill.max, k.fill + this.b.fill.perSec * dtSec);
    return true;
  }

  /** Fold and pinch (or press the well) while held. */
  addShape(slot: number, dtSec: number): boolean {
    const k = this.raw(slot);
    if (!k) return false;
    k.shape = Math.min(this.b.shape.max, k.shape + this.b.shape.perSec * dtSec);
    return true;
  }

  addTopping(slot: number, id: string): boolean {
    const k = this.raw(slot);
    if (!k) return false;
    k.toppings[id] = (k.toppings[id] ?? 0) + 1;
    return true;
  }

  /** Brush egg wash on (amount from the brush stroke). */
  addWash(slot: number, amount: number): boolean {
    const k = this.raw(slot);
    if (!k || amount <= 0) return false;
    k.wash = Math.min(this.b.wash.max, k.wash + amount);
    return true;
  }

  /** Slide the pan in. False if it's empty or already in. */
  ovenIn(): boolean {
    if (this.inOven || this.panCount === 0) return false;
    this.inOven = true;
    this.temp -= this.b.oven.doorCoolF;
    return true;
  }

  /** Take the pan out: everything on it goes to the rack. False if the rack can't take it all. */
  ovenOut(): boolean {
    if (!this.inOven) return false;
    if (this.rack.length + this.panCount > this.b.rackCapacity) return false;
    this.inOven = false;
    for (let i = 0; i < this.pan.length; i++) {
      const k = this.pan[i];
      if (k) this.rack.push(k);
      this.pan[i] = null;
    }
    return true;
  }

  trashPan(slot: number): boolean {
    if (this.inOven || !this.pan[slot]) return false;
    this.pan[slot] = null;
    return true;
  }

  takeRack(index: number): Kolache | null {
    const k = this.rack[index];
    if (!k) return null;
    this.rack.splice(index, 1);
    return k;
  }

  tick(dtSec: number): void {
    const o = this.b.oven;
    this.temp += (this.target - this.temp) * Math.min(1, o.heatLagPerSec * dtSec);
    const rate = ovenRateAt(this.temp, this.b);
    const inRange = this.temp >= o.idealRangeF.min && this.temp <= o.idealRangeF.max;
    for (let i = 0; i < this.pan.length; i++) {
      const k = this.pan[i];
      if (!k) continue;
      if (this.inOven) {
        k.baked += (rate * dtSec) / o.secondsToGolden;
        k.bakeSec += dtSec;
        if (inRange) k.inRangeSec += dtSec;
        if (k.baked >= o.burntAt) {
          this.pan[i] = null;
          this.burnt.push(i);
        }
      } else if (k.baked === 0) {
        k.proof += this.b.proof.perSec * dtSec;
      }
    }
    if (this.inOven && this.panCount === 0) this.inOven = false;
  }

  /** Snapshot-friendly state. */
  get ovenState(): { temp: number; target: number } {
    return { temp: this.temp, target: this.target };
  }
}

/** Problems with the bake numbers. */
export function validateBake(b: BakeBalance): string[] {
  const e: string[] = [];
  if (!(Number.isInteger(b.panSize) && b.panSize >= 1 && b.rackCapacity >= 1)) e.push('bake needs panSize >= 1 and rackCapacity >= 1');
  for (const [k, a] of [['fill', b.fill], ['shape', b.shape]] as const) {
    if (!(a.perSec > 0 && a.ideal.min <= a.ideal.max && a.ideal.max < a.max && a.zeroAt > 0)) e.push(`bake.${k} needs perSec > 0, ideal.min <= ideal.max < max, zeroAt > 0`);
  }
  if (!(b.proof.perSec > 0 && b.proof.zeroAt > 0)) e.push('bake.proof needs perSec > 0 and zeroAt > 0');
  const o = b.oven;
  if (!(o.dial.minF < o.dial.maxF && o.idealRangeF.min >= o.dial.minF && o.idealRangeF.max <= o.dial.maxF)) e.push('bake.oven idealRangeF must sit inside the dial');
  if (!(o.secondsToGolden > 0 && o.heatLagPerSec > 0 && o.burntAt > 1 + o.doneness.zeroAt)) e.push('bake.oven needs secondsToGolden, heatLagPerSec > 0 and burntAt past zeroAt');
  return e;
}
