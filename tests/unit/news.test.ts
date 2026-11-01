import { describe, expect, it } from 'vitest';
import { activeFeatured, activeNews } from '../../src/systems/news';

describe('news from the trailer', () => {
  const now = new Date(2026, 10, 7, 12);

  it('shows the message until the end of its last day', () => {
    expect(activeNews({ message: ' find us at the market! ', until: '2026-11-07' }, now)).toBe('find us at the market!');
    expect(activeNews({ message: 'old news', until: '2026-11-06' }, now)).toBeNull();
    expect(activeNews({ message: 'no end date' }, now)).toBe('no end date');
  });

  it('nothing to say, or a broken file: no banner', () => {
    expect(activeNews({ message: '' }, now)).toBeNull();
    expect(activeNews(null, now)).toBeNull();
    expect(activeNews('nope', now)).toBeNull();
    expect(activeNews({ message: 42 }, now)).toBeNull();
  });

  it('long messages are cut short', () => {
    expect(activeNews({ message: 'x'.repeat(500) }, now)!.length).toBe(140);
  });
});

describe('the featured flavour', () => {
  const now = new Date(2026, 10, 7, 12);
  it('comes from news.json while it is in date', () => {
    expect(activeFeatured({ featured: ' strawberry ' }, now)).toBe('strawberry');
    expect(activeFeatured({ featured: 'strawberry', until: '2026-11-06' }, now)).toBeNull();
    expect(activeFeatured({ featured: '' }, now)).toBeNull();
    expect(activeFeatured(null, now)).toBeNull();
  });
});
