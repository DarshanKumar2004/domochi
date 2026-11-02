// What goes in Ethan's daily email (pure: no Worker or network here, so it's
// unit-tested in tests/unit/digest.test.ts). The Worker gathers the day's
// notes and calls buildDigest; null means there's nothing to say today, so
// no email goes out.
import { trailerWeek, trailerWord, weekStart } from '../src/systems/trailerCode.ts';

const fmt = (d) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Chicago' });

/** A note line: "- ube with coconut (Kim)". */
const line = (n) => `- ${n.text}${n.name ? ` (${n.name})` : ''}`;

/**
 * The day's email for Ethan, or null if there's nothing to tell him.
 * - notes: the players' notes since the last digest ({ kind, text, name }).
 * - now: when it's sent.
 * - wordsSent: whether the full list of secret words has gone out before.
 */
export function buildDigest({ notes, now, wordsSent, listWeeks = 26 }) {
  const parts = [];
  const flavors = notes.filter((n) => n.kind === 'flavor');
  const others = notes.filter((n) => n.kind !== 'flavor');
  if (flavors.length) parts.push(`Flavor ideas from players (${flavors.length}):\n${flavors.map(line).join('\n')}`);
  if (others.length) parts.push(`Notes for you (${others.length}):\n${others.map(line).join('\n')}`);

  const week = trailerWeek(now);
  const monday = now.getDay() === 1;
  if (!wordsSent) {
    // The first digest: every word for the next half year, once.
    const rows = [];
    for (let w = week; w < week + listWeeks; w++) rows.push(`${fmt(weekStart(w))}: ${trailerWord(w)}`);
    parts.push(
      `The trailer's secret word, week by week (Monday to Sunday). Show it at the trailer; players type it into the game for a weekly reward:\n${rows.join('\n')}`,
    );
  } else if (monday) {
    parts.push(`This week's secret word: ${trailerWord(week)}\nNext week's: ${trailerWord(week + 1)}`);
  }
  if (!parts.length) return null;

  const bits = [];
  if (flavors.length || others.length) bits.push(`${notes.length} note${notes.length === 1 ? '' : 's'}`);
  if (!wordsSent) bits.push('the secret words');
  else if (monday) bits.push(`word: ${trailerWord(week)}`);
  return {
    subject: `domochi game today: ${bits.join(' · ')}`,
    text: `Hi Ethan! Here's what's new from the domochi game.\n\n${parts.join('\n\n')}\n\n(One email a day, only when there's something to tell you.)`,
  };
}
