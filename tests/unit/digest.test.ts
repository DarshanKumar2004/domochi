import { describe, expect, it } from 'vitest';
// @ts-expect-error: plain JS module (the relay Worker), no types
import { buildDigest } from '../../relay/digest.js';
import { trailerWeek, trailerWord } from '../../src/systems/trailerCode';

const tue = new Date(2026, 10, 3, 9);
const mon = new Date(2026, 10, 9, 9);

describe("Ethan's daily email", () => {
  it('nothing to tell him: no email', () => {
    expect(buildDigest({ notes: [], now: tue, wordsSent: true })).toBeNull();
  });

  it("the day's notes, flavour ideas first", () => {
    const d = buildDigest({ notes: [{ kind: 'note', text: 'love it' }, { kind: 'flavor', text: 'ube', name: 'Kim' }], now: tue, wordsSent: true });
    expect(d.subject).toContain('2 notes');
    expect(d.text.indexOf('Flavor ideas')).toBeLessThan(d.text.indexOf('Notes for you'));
    expect(d.text).toContain('- ube (Kim)');
  });

  it('the first email has every secret word, once', () => {
    const d = buildDigest({ notes: [], now: tue, wordsSent: false, listWeeks: 4 });
    const w = trailerWeek(tue);
    for (let k = 0; k < 4; k++) expect(d.text).toContain(trailerWord(w + k));
    expect(d.subject).toContain('secret words');
  });

  it("after that, Mondays bring this week's and next week's word", () => {
    const d = buildDigest({ notes: [], now: mon, wordsSent: true });
    const w = trailerWeek(mon);
    expect(d.text).toContain(`This week's secret word: ${trailerWord(w)}`);
    expect(d.text).toContain(`Next week's: ${trailerWord(w + 1)}`);
  });
});
