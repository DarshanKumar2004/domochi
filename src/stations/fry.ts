// Fry station simulation. Pure: no Phaser, no clock; driven by tick(dtSec).
// See balance.json "fry" for every tuning number.

export interface FryBalance {
  roomTempF: number;
  startTempF: number;
  startTargetF: number;
  dial: { minF: number; maxF: number };
  /** Fraction of the gap to the target temperature closed per second. */
  heatLagPerSec: number;
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
  /** Per-donut cook-speed spread when the oil is empty (scaled down as oil rises to lowThreshold). */
  unevenAtEmpty: number;
  doneness: { perfectWithin: number; zeroAt: number };
  evennessZeroAtStdDev: number;
  /** Donuts dropped when frying ahead without an order. */
  prepBatchSize: number;
  /** Most fried donuts the cooling rack holds. */
  rackCapacity: number;
  scoreWeights: { doneness: number; temperature: number; evenness: number };
}

export interface FryBatch {
  /** The order this batch is for, or null for a prep batch headed to the rack. */
  ticketNo: number | null;
  count: number;
  /** Doneness of the side facing down, per donut. */
  down: number[];
  /** Doneness of the side facing up, per donut. */
  up: number[];
  flips: number;
  seconds: number;
  secondsInRange: number;
}

export interface FryResult {
  ticketNo: number | null;
  /** 0–100 overall. */
  score: number;
  /** 0–1 component scores. */
  doneness: number;
  temperature: number;
  evenness: number;
  /** Final doneness of both sides per donut (side A = first down). */
  sides: { a: number[]; b: number[] };
  seconds: number;
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

export class Fryer {
  temp: number;
  target: number;
  oil: number;
  grateHeld = false;
  batch: FryBatch | null = null;

  constructor(private readonly b: FryBalance) {
    this.temp = b.startTempF;
    this.target = b.startTargetF;
    this.oil = b.oil.start;
  }

  get balance(): FryBalance {
    return this.b;
  }

  get inIdealRange(): boolean {
    return this.temp >= this.b.idealRangeF.min && this.temp <= this.b.idealRangeF.max;
  }

  get oilLow(): boolean {
    return this.oil < this.b.oil.lowThreshold;
  }

  get canDrop(): boolean {
    return this.batch === null && this.oil >= this.b.oil.minToFry;
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

  /** Drop a batch of raw donuts for a ticket (or null: a prep batch for the rack). */
  drop(ticketNo: number | null, count: number): boolean {
    if (!this.canDrop || count < 1) return false;
    this.batch = {
      ticketNo,
      count,
      down: new Array<number>(count).fill(0),
      up: new Array<number>(count).fill(0),
      flips: 0,
      seconds: 0,
      secondsInRange: 0,
    };
    this.temp -= this.b.dropCoolPerDonutF * count;
    this.oil = Math.max(0, this.oil - this.b.oil.perDonut * count);
    return true;
  }

  flip(): void {
    const batch = this.batch;
    if (!batch) return;
    const { down, up } = batch;
    for (let i = 0; i < batch.count; i++) {
      const t = down[i]!;
      down[i] = up[i]!;
      up[i] = t;
    }
    batch.flips++;
  }

  /** Advance time. No allocations: this runs every frame. */
  tick(dtSec: number): void {
    // Oil temperature eases toward the dial setting (exponential lag, never overshoots).
    const k = 1 - Math.exp(-this.b.heatLagPerSec * dtSec);
    this.temp += (this.target - this.temp) * k;

    const batch = this.batch;
    if (!batch) return;
    batch.seconds += dtSec;
    if (this.inIdealRange) batch.secondsInRange += dtSec;

    const base = (cookRateAt(this.temp, this.b) / this.b.secondsPerSide) * dtSec;
    const topFactor = this.grateHeld ? this.b.topFactorGrate : this.b.topFactorFloating;
    const uneven = this.oilLow ? ((this.b.oil.lowThreshold - this.oil) / this.b.oil.lowThreshold) * this.b.unevenAtEmpty : 0;
    for (let i = 0; i < batch.count; i++) {
      const slot = 1 + (SLOT_SPREAD[i % SLOT_SPREAD.length] ?? 0) * uneven;
      batch.down[i] = batch.down[i]! + base * slot;
      batch.up[i] = batch.up[i]! + base * slot * topFactor;
    }
  }

  /** Take the batch out and score it. */
  pull(): FryResult {
    const batch = this.batch;
    if (!batch) throw new Error('nothing in the fryer');
    this.batch = null;
    this.grateHeld = false;
    // Side A is whichever side started face-down.
    const flippedOdd = batch.flips % 2 === 1;
    const a = flippedOdd ? batch.up : batch.down;
    const bSide = flippedOdd ? batch.down : batch.up;
    return scoreFry(batch.ticketNo, a, bSide, batch.seconds, batch.secondsInRange, this.b);
  }
}

export function scoreFry(ticketNo: number | null, a: number[], bSide: number[], seconds: number, secondsInRange: number, b: FryBalance): FryResult {
  const all = [...a, ...bSide];
  const doneness = all.reduce((s, d) => s + sideScore(d, b), 0) / all.length;
  const temperature = seconds > 0 ? clamp(secondsInRange / seconds, 0, 1) : 0;

  // Evenness: how similar the donuts are to each other (each donut = mean of its sides).
  const perDonut = a.map((d, i) => (d + (bSide[i] ?? 0)) / 2);
  const mean = perDonut.reduce((s, d) => s + d, 0) / perDonut.length;
  const sd = Math.sqrt(perDonut.reduce((s, d) => s + (d - mean) ** 2, 0) / perDonut.length);
  const evenness = clamp(1 - sd / b.evennessZeroAtStdDev, 0, 1);

  const total = combine(doneness, temperature, evenness, b);
  return {
    ticketNo,
    score: Math.round(total * 100),
    doneness,
    temperature,
    evenness,
    sides: { a: [...a], b: [...bSide] },
    seconds,
  };
}

/** One fried donut waiting on the cooling rack. */
export interface FriedDonut {
  /** Doneness of each side. */
  a: number;
  b: number;
  /** Its batch's temperature and evenness components (0–1). */
  temperature: number;
  evenness: number;
  /** This donut's own 0–100 score. */
  score: number;
}

/**
 * Overall 0–1 score. Temperature and evenness only count as far as the donuts
 * are cooked well: a burnt batch fried at a perfect temperature is still burnt.
 */
function combine(doneness: number, temperature: number, evenness: number, b: FryBalance): number {
  const w = b.scoreWeights;
  return (w.doneness * doneness + (w.temperature * temperature + w.evenness * evenness) * doneness) / (w.doneness + w.temperature + w.evenness);
}

/** Split a batch result into individually scored donuts (for the rack). */
export function donutsFromResult(r: FryResult, b: FryBalance): FriedDonut[] {
  return r.sides.a.map((a, i) => {
    const bSide = r.sides.b[i] ?? 0;
    const doneness = (sideScore(a, b) + sideScore(bSide, b)) / 2;
    return { a, b: bSide, temperature: r.temperature, evenness: r.evenness, score: Math.round(combine(doneness, r.temperature, r.evenness, b) * 100) };
  });
}

/** A ticket's fry result built from rack donuts: the average of their scores. */
export function fryResultFromDonuts(ticketNo: number, donuts: readonly FriedDonut[], b: FryBalance): FryResult {
  const n = Math.max(donuts.length, 1);
  const avg = (f: (d: FriedDonut) => number) => donuts.reduce((s, d) => s + f(d), 0) / n;
  return {
    ticketNo,
    score: Math.round(avg((d) => d.score)),
    doneness: avg((d) => (sideScore(d.a, b) + sideScore(d.b, b)) / 2),
    temperature: avg((d) => d.temperature),
    evenness: avg((d) => d.evenness),
    sides: { a: donuts.map((d) => d.a), b: donuts.map((d) => d.b) },
    seconds: 0,
  };
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

/** A short word for a fry result, for the station's feedback. */
export function fryVerdict(score: number): string {
  if (score >= 90) return 'perfectly golden!';
  if (score >= 70) return 'nice fry!';
  if (score >= 40) return 'not bad';
  return 'hmm, rough batch';
}
