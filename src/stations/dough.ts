// Dough station logic. Pure: no Phaser.
//
// Morning prep (and a second batch if you run out): scoop each ingredient of
// the recipe into the bowl, stir it smooth, and the batch goes in the dough
// tub. Every donut dropped in the fryer uses one donut's worth of dough. Off
// recipe scoops make a lumpier batch, which fries a little worse.

export interface Ingredient {
  id: string;
  name: string;
  /** CSS colour, for the bowl and the bin. */
  color: string;
}

export interface DoughBalance {
  /** Donuts the recipe makes (a double recipe makes twice as many). */
  batchSize: number;
  /** Most donuts' worth of dough the tub holds. */
  tubCapacity: number;
  /** Full turns of stirring to make the dough smooth. */
  stirTurns: number;
  /** Quality lost per scoop off the recipe (too many or too few). */
  scoopPenalty: number;
  /** Lowest quality a finished batch can have. */
  qualityFloor: number;
  ingredients: Ingredient[];
  /** Scoops of each ingredient, by id. */
  recipe: Record<string, number>;
}

export type DoughStage = 'ingredients' | 'stirring' | 'ready';

/** One batch in the bowl. */
export class DoughWork {
  private readonly scoops = new Map<string, number>();
  private turnsDone = 0;

  constructor(private readonly b: DoughBalance) {}

  scoopsOf(id: string): number {
    return this.scoops.get(id) ?? 0;
  }

  get totalScoops(): number {
    let n = 0;
    for (const v of this.scoops.values()) n += v;
    return n;
  }

  /** Full turns stirred so far (fractional). */
  get turns(): number {
    return this.turnsDone;
  }

  /** 0–1: how smooth the dough is. */
  get stirProgress(): number {
    return Math.min(1, this.turnsDone / this.b.stirTurns);
  }

  get stage(): DoughStage {
    if (this.stirProgress >= 1) return 'ready';
    return this.turnsDone > 0 ? 'stirring' : 'ingredients';
  }

  /**
   * How many recipes' worth is in the bowl: the scarcest ingredient decides
   * (just milk is 0; a double recipe is 2).
   */
  get recipes(): number {
    let k = Infinity;
    for (const [id, n] of Object.entries(this.b.recipe)) k = Math.min(k, this.scoopsOf(id) / n);
    return Number.isFinite(k) ? k : 0;
  }

  /** Donuts this batch makes. */
  get yield(): number {
    return Math.floor(this.b.batchSize * this.recipes + 1e-9);
  }

  /** Ingredients with nothing in the bowl yet (the batch makes nothing without them). */
  get missing(): string[] {
    return Object.keys(this.b.recipe).filter((id) => this.scoopsOf(id) === 0);
  }

  /** Scoops away from the recipe's proportions (at the batch's size; extra of anything counts). */
  get scoopsOff(): number {
    const k = Math.max(1, Math.round(this.recipes));
    let off = 0;
    const ids = new Set([...Object.keys(this.b.recipe), ...this.scoops.keys()]);
    for (const id of ids) off += Math.abs(this.scoopsOf(id) - (this.b.recipe[id] ?? 0) * k);
    return off;
  }

  /** 0–1 quality of the batch as it stands (stirring doesn't change it, it just has to be done). */
  get quality(): number {
    return Math.max(this.b.qualityFloor, 1 - this.b.scoopPenalty * this.scoopsOff);
  }

  /** One scoop of an ingredient into the bowl. False for an unknown ingredient. */
  scoop(id: string): boolean {
    if (!this.b.ingredients.some((i) => i.id === id)) return false;
    this.scoops.set(id, this.scoopsOf(id) + 1);
    return true;
  }

  /** Stir by an angle (radians, either direction). Nothing to stir until something's in the bowl. */
  stir(radians: number): void {
    if (this.totalScoops === 0) return;
    this.turnsDone += Math.abs(radians) / (Math.PI * 2);
  }
}

/** A word for a dough batch's quality. */
export function doughVerdict(quality: number): string {
  if (quality >= 0.99) return 'perfect dough!';
  if (quality >= 0.8) return 'pretty good dough';
  if (quality >= 0.5) return 'a bit off the recipe';
  return 'lumpy dough...';
}
