// mochi's daily gift: the first time you open the game each day there's a
// little something in the tip jar, a bit more for each day in a row (a 7-day
// cycle). Missing a day just starts the count again: no punishment beyond
// that. Pure logic, no Phaser.

export interface DailyBalance {
  /** Cash for day 1, 2, … of a streak (then it starts the cycle again). */
  gifts: number[];
}

export interface DailyState {
  /** The last day a gift was given (local date, YYYY-MM-DD). */
  last: string;
  /** Days in a row so far. */
  streak: number;
}

/** A local calendar date as YYYY-MM-DD. */
export function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The day before a YYYY-MM-DD date. */
function dayBefore(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return localDay(new Date(y, m - 1, d - 1));
}

/**
 * Today's gift, if there is one: the new streak and the cash. Null if today's
 * gift has already been given.
 */
export function dailyGift(b: DailyBalance, state: DailyState | undefined, now: Date): { state: DailyState; cash: number; streak: number } | null {
  const today = localDay(now);
  if (state?.last === today) return null;
  const streak = state && state.last === dayBefore(today) ? state.streak + 1 : 1;
  const cash = b.gifts.length ? b.gifts[(streak - 1) % b.gifts.length]! : 0;
  return { state: { last: today, streak }, cash, streak };
}
