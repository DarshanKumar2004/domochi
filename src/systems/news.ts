// News from the real trailer (where it is this week, a new flavour, an
// event), shown on the home screen. It comes from public/news.json on the
// game's website, so it can change without an app update: edit the file and
// push. Pure logic; the fetch is in the scene.

export interface News {
  /** What to say; empty for nothing. */
  message?: string;
  /** Last day to show it (YYYY-MM-DD, local), or empty for no end. */
  until?: string;
}

/** The message to show now, if there is one (trimmed, capped), or null. */
export function activeNews(news: unknown, now: Date): string | null {
  if (!news || typeof news !== 'object') return null;
  const n = news as News;
  const message = typeof n.message === 'string' ? n.message.trim().slice(0, 140) : '';
  if (!message) return null;
  if (typeof n.until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(n.until)) {
    const [y, m, d] = n.until.split('-').map(Number) as [number, number, number];
    if (now.getTime() >= new Date(y, m - 1, d + 1).getTime()) return null;
  }
  return message;
}
