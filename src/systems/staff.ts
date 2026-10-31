// Your crew: people you hire (late in the game) who keep the trailer going
// while you're away. Earnings grow with time away but level off: each hour
// earns less than the last, up to a cap set by who you've hired. Pure logic.

export interface Hire {
  id: string;
  name: string;
  price: number;
  unlockDay: number;
  /** How much this hire adds to the most the crew can make while you're away. */
  capAdd: number;
}

export interface StaffBalance {
  hires: Hire[];
  /** Hours for the crew to make half of their cap (then half of the rest, and so on). */
  halfLifeHours: number;
  /** Shortest time away that counts (hours): no farming by flicking the app. */
  minHours: number;
}

/** The most the crew can make in one stretch away. */
export function crewCap(b: StaffBalance, hired: readonly string[]): number {
  let cap = 0;
  for (const h of b.hires) if (hired.includes(h.id)) cap += h.capAdd;
  return cap;
}

/**
 * What the crew made while you were away for `hours`: cap × (1 − ½^(hours / half-life)).
 * Nothing for a very short time away, or with nobody hired.
 */
export function awayEarnings(b: StaffBalance, hired: readonly string[], hours: number): number {
  const cap = crewCap(b, hired);
  if (cap <= 0 || !(hours >= b.minHours)) return 0;
  const share = 1 - Math.pow(0.5, hours / b.halfLifeHours);
  return Math.round(cap * share * 100) / 100;
}
