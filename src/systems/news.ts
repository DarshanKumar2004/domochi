// News from the real trailer (where it is this week, a new flavour, an
// event), shown on the home screen. It comes from public/news.json on the
// game's website, so it can change without an app update: edit the file and
// push. Pure logic; the fetch is in the scene.

export interface News {
  /** What to say; empty for nothing. */
  message?: string;
  /** Last day to show it (YYYY-MM-DD, local), or empty for no end. */
  until?: string;
  /** A flavour the real shop is featuring (a menu id): it becomes the game's special of the day. */
  featured?: string;
}

/** Still in date? (No end date: yes.) */
function current(n: News, now: Date): boolean {
  if (typeof n.until !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(n.until)) return true;
  const [y, m, d] = n.until.split('-').map(Number) as [number, number, number];
  return now.getTime() < new Date(y, m - 1, d + 1).getTime();
}

/** The flavour the real shop is featuring now (a menu id), or null. */
export function activeFeatured(news: unknown, now: Date): string | null {
  if (!news || typeof news !== 'object') return null;
  const n = news as News;
  const f = typeof n.featured === 'string' ? n.featured.trim() : '';
  return f && current(n, now) ? f : null;
}

/** The message to show now, if there is one (trimmed, capped), or null. */
export function activeNews(news: unknown, now: Date): string | null {
  if (!news || typeof news !== 'object') return null;
  const n = news as News;
  const message = typeof n.message === 'string' ? n.message.trim().slice(0, 140) : '';
  return message && current(n, now) ? message : null;
}
