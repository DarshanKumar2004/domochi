// Each day's weather, and what it does to the day. Pure logic, no Phaser.

export interface WeatherType {
  id: string;
  name: string;
  /** How often it comes up, relative to the others. */
  weight: number;
  /** × the gap between walk-ups (bigger = fewer customers). */
  spawnFactor: number;
  /** More morning delivery orders. */
  extraPickups: number;
  /** × how fast the oil reaches the dial's temperature. */
  heatLag: number;
  /** × how long customers wait happily. */
  patience: number;
  /** × tips. */
  tip: number;
  /** One line for the morning checklist. */
  note: string;
}

export interface WeatherBalance {
  firstDay: string;
  types: WeatherType[];
}

/** A steady number in [0, 1) for a day: the same day always gets the same weather. */
function dayHash(day: number): number {
  let h = Math.imul(day ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000;
}

/** The weather on a given day (day 1 is always firstDay, for a friendly start). */
export function weatherFor(day: number, b: WeatherBalance): WeatherType {
  const first = b.types.find((t) => t.id === b.firstDay) ?? b.types[0]!;
  if (day <= 1) return first;
  const total = b.types.reduce((s, t) => s + t.weight, 0);
  let r = dayHash(day) * total;
  for (const t of b.types) {
    r -= t.weight;
    if (r < 0) return t;
  }
  return b.types[b.types.length - 1]!;
}
