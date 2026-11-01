import { describe, expect, it } from 'vitest';
import { checkTrailerWord, normalizeWord, TRAILER_WORDS, trailerWeek, trailerWord, weekStart } from '../../src/systems/trailerCode';

describe("the trailer's secret word", () => {
  it('weeks run Monday to Sunday from the first week of 2026', () => {
    expect(trailerWeek(new Date(2026, 0, 5))).toBe(0);
    expect(trailerWeek(new Date(2026, 0, 11, 23))).toBe(0);
    expect(trailerWeek(new Date(2026, 0, 12))).toBe(1);
    expect(weekStart(43).getDay()).toBe(1); // a Monday
  });

  it('a word every week from the list, never the same two weeks running', () => {
    const words = Array.from({ length: 200 }, (_, w) => trailerWord(w));
    for (const w of words) expect(TRAILER_WORDS).toContain(w);
    for (let i = 1; i < words.length; i++) expect(words[i]).not.toBe(words[i - 1]);
    // Plenty of variety.
    expect(new Set(words).size).toBeGreaterThan(30);
  });

  it("this week's word works (any case, spaces, punctuation), and last week's too; others don't", () => {
    const now = new Date(2026, 10, 4, 15);
    const week = trailerWeek(now);
    expect(checkTrailerWord(trailerWord(week).toUpperCase() + '!', now)).toBe(week);
    expect(checkTrailerWord(` ${trailerWord(week - 1)} `, now)).toBe(week - 1);
    const other = TRAILER_WORDS.find((w) => w !== trailerWord(week) && w !== trailerWord(week - 1))!;
    expect(checkTrailerWord(other, now)).toBeNull();
    expect(checkTrailerWord('', now)).toBeNull();
  });

  it('words are compared on letters only', () => {
    expect(normalizeWord('King Cake!')).toBe('kingcake');
  });
});
