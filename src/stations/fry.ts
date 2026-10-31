// Fry station simulation. Pure: no Phaser, no clock; driven by tick(dtSec).
// See balance.json "fry" for every tuning number.
//
// The vat has a fixed number of slots. Donuts are dropped in one at a time,
// cook independently, and are flipped, taken out (to the cooling rack) or
// trashed one at a time. Orders take their fried donuts from the rack.

export interface FryBalance {
  roomTempF: number;
  startTempF: number;
  startTargetF: number;
  dial: { minF: number; maxF: number };
  /** Fraction of the gap to the target temperature closed per second. */
  heatLagPerSec: number;
  /**
   * Less oil heats hotter at the same dial setting: the oil settles at
   * dial + oilDriftF × (1 − oil level), so a low vat has to be dialled back down.
   */
  oilDriftF: number;
  idealRangeF: { min: number; max: number };
  /** Cook speed multiplier: 0 at zeroAtF, 1 at oneAtF, capped at max. */
  cookRate: { zeroAtF: number; oneAtF: number; max: number };
  /** Seconds for a side to go raw → golden at cook rate 1, fully submerged. */
  secondsPerSide: number;
  /** How much the floating top side cooks, relative to the underside. */
  topFactorFloating: number;
  /** Same, while the grate holds the donuts under. */
  topFactorGrate: number;
  dropCoolPerDonutF: number;
  oil: { start: number; perDonut: number; topUp: number; lowThreshold: number; minToFry: number };
  /** Per-slot cook-speed spread when the oil is empty (scaled down as oil rises to lowThreshold). */
  unevenAtEmpty: number;
  doneness: { perfectWithin: number; zeroAt: number };
  /** A donut with either side this done is burnt and is thrown out automatically. */
  burntAt: number;
  evennessZeroAtStdDev: number;
  /** Donuts the vat holds at once. */
  slots: number;
  /** Most fried donuts the cooling rack holds. */
  rackCapacity: number;
  /** How much a lumpy dough batch costs: score × (1 − doughEffect × (1 − dough quality)). */
  doughEffect: number;
  scoreWeights: { doneness: number; temperature: number; evenness: number };
}

/** A donut in the oil. */
export interface FryDonut {
  id: number;
  /** Doneness of the side facing down / up right now. */
  down: number;
  up: number;
  flips: number;
  seconds: number;
  secondsInRange: number;
  /** Quality (0–1) of the dough batch it was made from; 1 if not tracked. */
  dough?: number;
}

/** A fried donut, out of the oil (on the rack or in an order). */
export interface FriedDonut {
  /** Stays with the donut through every station. */
  id: number;
  /** Doneness of each side (a = the side that went in face-down). */
  a: number;
  b: number;
  /** Fraction of its frying time spent in the ideal range (0–1). */
  temperature: number;
  /** This donut's own 0–100 score. */
  score: number;
}

/** An order's fry result, from the donuts it took off the rack. */
export interface FryResult {
  ticketNo: number;
  /** 0–100 overall. */
  score: number;
  /** 0–1 component scores. */
  doneness: number;
  temperature: number;
  evenness: number;
  donuts: FriedDonut[];
}

/** Fixed per-slot cook-speed offsets, so low-oil unevenness is deterministic. */
const SLOT_SPREAD = [-1, 0.8, -0.4, 0.5, 0, -0.7, 0.9, -0.2, 0.3, -0.9, 0.6, -0.5];

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Score for one side: 1 inside ±perfectWithin of golden, falling to 0 at ±zeroAt. */
export function sideScore(doneness: number, b: FryBalance): number {
  const err = Math.abs(doneness - 1);
  const { perfectWithin, zeroAt } = b.doneness;
  if (err <= perfectWithin + 1e-9) return 1; // tolerance: 1.1 - 1 is 0.10000000000000009 in floats
  return clamp(1 - (err - perfectWithin) / (zeroAt - perfectWithin), 0, 1);
}

export function cookRateAt(tempF: number, b: FryBalance): number {
  const { zeroAtF, oneAtF, max } = b.cookRate;
  return clamp((tempF - zeroAtF) / (oneAtF - zeroAtF), 0, max);
}

/**
 * Overall 0–1 score. Temperature and evenness only count as far as the donuts
 * are cooked well: a burnt batch fried at a perfect temperature is still burnt.
 */
function combine(doneness: number, temperature: number, evenness: number, b: FryBalance): number {
  const w = b.scoreWeights;
  return (w.doneness * doneness + (w.temperature * temperature + w.evenness * evenness) * doneness) / (w.doneness + w.temperature + w.evenness);
}

/** Score a donut taken out of the oil. */
export function scoreDonut(d: FryDonut, b: FryBalance): FriedDonut {
  const flippedOdd = d.flips % 2 === 1;
  const a = flippedOdd ? d.up : d.down;
  const bSide = flippedOdd ? d.down : d.up;
  const temperature = d.seconds > 0 ? clamp(d.secondsInRange / d.seconds, 0, 1) : 0;
  const doneness = (sideScore(a, b) + sideScore(bSide, b)) / 2;
  const dough = 1 - b.doughEffect * (1 - (d.dough ?? 1));
  return { id: d.id, a, b: bSide, temperature, score: Math.round(combine(doneness, temperature, 1, b) * dough * 100) };
}

/** An order's fry result: doneness and temperature averaged, plus how even the donuts are. */
export function fryResultFromDonuts(ticketNo: number, donuts: readonly FriedDonut[], b: FryBalance): FryResult {
  const n = Math.max(donuts.length, 1);
  const doneness = donuts.reduce((s, d) => s + (sideScore(d.a, b) + sideScore(d.b, b)) / 2, 0) / n;
  const temperature = donuts.reduce((s, d) => s + d.temperature, 0) / n;
  const perDonut = donuts.map((d) => (d.a + d.b) / 2);
  const mean = perDonut.reduce((s, x) => s + x, 0) / n;
  const sd = Math.sqrt(perDonut.reduce((s, x) => s + (x - mean) ** 2, 0) / n);
  const evenness = clamp(1 - sd / b.evennessZeroAtStdDev, 0, 1);
  return {
    ticketNo,
    score: Math.round(combine(doneness, temperature, evenness, b) * 100),
    doneness,
    temperature,
    evenness,
    donuts: donuts.map((d) => ({ ...d })),
  };
}

export class Fryer {
  temp: number;
  /** The dial setting. */
  target: number;
  oil: number;
  grateHeld = false;
  readonly slots: (FryDonut | null)[];
  /** Slots whose donut burnt since the session last checked (it empties this). */
  readonly burnt: number[] = [];
  private nextId = 1;

  constructor(private readonly b: FryBalance) {
    this.temp = b.startTempF;
    this.target = b.startTargetF;
    this.oil = b.oil.start;
    this.slots = new Array<FryDonut | null>(b.slots).fill(null);
  }

  get balance(): FryBalance {
    return this.b;
  }

  /** Where the oil temperature is heading: the dial plus the low-oil drift. */
  get settleTemp(): number {
    return this.target + this.b.oilDriftF * (1 - this.oil);
  }

  get inIdealRange(): boolean {
    return this.temp >= this.b.idealRangeF.min && this.temp <= this.b.idealRangeF.max;
  }

  get oilLow(): boolean {
    return this.oil < this.b.oil.lowThreshold;
  }

  get count(): number {
    let n = 0;
    for (const d of this.slots) if (d) n++;
    return n;
  }

  get freeSlot(): number {
    return this.slots.indexOf(null);
  }

  get canDrop(): boolean {
    return this.freeSlot >= 0 && this.oil >= this.b.oil.minToFry;
  }

  setTarget(f: number): void {
    this.target = clamp(f, this.b.dial.minF, this.b.dial.maxF);
  }

  setGrate(held: boolean): void {
    this.grateHeld = held;
  }

  /** Top up with room-temperature oil, which cools the vat. Returns false if already full. */
  addOil(): boolean {
    if (this.oil >= 1) return false;
    const added = Math.min(this.b.oil.topUp, 1 - this.oil);
    this.temp = (this.temp * this.oil + this.b.roomTempF * added) / (this.oil + added);
    this.oil += added;
    return true;
  }

  /** Drop one raw donut into the first free slot. Returns the slot, or -1. */
  drop(): number {
    if (!this.canDrop) return -1;
    const slot = this.freeSlot;
    this.slots[slot] = { id: this.nextId++, down: 0, up: 0, flips: 0, seconds: 0, secondsInRange: 0 };
    this.temp -= this.b.dropCoolPerDonutF;
    this.oil = Math.max(0, this.oil - this.b.oil.perDonut);
    return slot;
  }

  flip(slot: number): boolean {
    const d = this.slots[slot];
    if (!d) return false;
    const t = d.down;
    d.down = d.up;
    d.up = t;
    d.flips++;
    return true;
  }

  flipAll(): void {
    for (let i = 0; i < this.slots.length; i++) this.flip(i);
  }

  /** Take a donut out and score it. */
  take(slot: number): FriedDonut | null {
    const d = this.slots[slot];
    if (!d) return null;
    this.slots[slot] = null;
    if (this.count === 0) this.grateHeld = false;
    return scoreDonut(d, this.b);
  }

  /** Throw a donut away. */
  trash(slot: number): boolean {
    if (!this.slots[slot]) return false;
    this.slots[slot] = null;
    if (this.count === 0) this.grateHeld = false;
    return true;
  }

  /** Advance time. No allocations unless something burns: this runs every frame. */
  tick(dtSec: number): void {
    // Oil eases toward the dial setting (plus low-oil drift); exponential, never overshoots.
    const k = 1 - Math.exp(-this.b.heatLagPerSec * dtSec);
    this.temp += (this.settleTemp - this.temp) * k;

    const inRange = this.inIdealRange;
    const base = (cookRateAt(this.temp, this.b) / this.b.secondsPerSide) * dtSec;
    const topFactor = this.grateHeld ? this.b.topFactorGrate : this.b.topFactorFloating;
    const uneven = this.oilLow ? ((this.b.oil.lowThreshold - this.oil) / this.b.oil.lowThreshold) * this.b.unevenAtEmpty : 0;
    for (let i = 0; i < this.slots.length; i++) {
      const d = this.slots[i];
      if (!d) continue;
      const rate = base * (1 + (SLOT_SPREAD[i % SLOT_SPREAD.length] ?? 0) * uneven);
      d.down += rate;
      d.up += rate * topFactor;
      d.seconds += dtSec;
      if (inRange) d.secondsInRange += dtSec;
      if (d.down >= this.b.burntAt || d.up >= this.b.burntAt) {
        this.slots[i] = null;
        this.burnt.push(i);
      }
    }
    if (this.grateHeld && this.count === 0) this.grateHeld = false;
  }
}

/** Color stops for doneness, raw → golden → burnt. */
const COLOR_STOPS: [number, number][] = [
  [0, 0xf4ead2],
  [0.6, 0xecd09a],
  [1, 0xd99a4e],
  [1.3, 0xa0612e],
  [1.7, 0x3d2616],
];

/** Display color for a doneness value (for tinting donuts). */
export function fryColor(doneness: number): number {
  const d = clamp(doneness, 0, COLOR_STOPS[COLOR_STOPS.length - 1]![0]);
  for (let i = 1; i < COLOR_STOPS.length; i++) {
    const [d1, c1] = COLOR_STOPS[i]!;
    const [d0, c0] = COLOR_STOPS[i - 1]!;
    if (d <= d1) {
      const t = (d - d0) / (d1 - d0);
      const ch = (shift: number) => Math.round(((c0 >> shift) & 0xff) + (((c1 >> shift) & 0xff) - ((c0 >> shift) & 0xff)) * t);
      return (ch(16) << 16) | (ch(8) << 8) | ch(0);
    }
  }
  return COLOR_STOPS[COLOR_STOPS.length - 1]![1];
}

/** A short word for a fry score, for the station's feedback. */
export function fryVerdict(score: number): string {
  if (score >= 90) return 'perfectly golden!';
  if (score >= 70) return 'nice fry!';
  if (score >= 40) return 'not bad';
  return 'hmm, rough one';
}
