import { describe, expect, it } from 'vitest';
import { FEEDBACK_KEY, FeedbackService, MAX_TEXT } from '../../src/systems/FeedbackService';

function memStore() {
  const m = new Map<string, string>();
  return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), m };
}

describe('notes for Ethan', () => {
  it('keeps notes (trimmed, capped), not empty ones', () => {
    const f = new FeedbackService(memStore(), '');
    expect(f.add('flavor', '   ')).toBe(false);
    expect(f.add('flavor', '  ube coconut  ', ' Kim ')).toBe(true);
    expect(f.add('note', 'x'.repeat(MAX_TEXT + 50))).toBe(true);
    const q = f.queued;
    expect(q).toHaveLength(2);
    expect(q[0]).toMatchObject({ kind: 'flavor', text: 'ube coconut', name: 'Kim' });
    expect(q[1]!.text).toHaveLength(MAX_TEXT);
  });

  it('with no endpoint yet, notes wait; with one, the day\'s report goes out as one message and the queue empties', async () => {
    const store = memStore();
    const waiting = new FeedbackService(store, '');
    waiting.add('flavor', 'matcha');
    expect(await waiting.sendReport(3)).toBe('waiting');
    expect(waiting.queued).toHaveLength(1);

    const sent: { url: string; body: string }[] = [];
    const f = new FeedbackService(store, 'https://example.test/report', async (url, body) => (sent.push({ url, body }), true));
    f.add('note', 'love the trailer!', 'Sam');
    expect(await f.sendReport(3)).toBe('sent');
    expect(sent).toHaveLength(1);
    const body = JSON.parse(sent[0]!.body);
    expect(body.subject).toContain('2 notes');
    expect(body.message).toContain('Flavour ideas:\n- matcha');
    expect(body.message).toContain('Notes for Ethan:\n- love the trailer! (Sam)');
    expect(f.queued).toHaveLength(0);
    expect(await f.sendReport(4)).toBe('nothing');
  });

  it('a failed send keeps the notes for next time; junk in storage is ignored', async () => {
    const store = memStore();
    const f = new FeedbackService(store, 'https://example.test/report', async () => false);
    f.add('note', 'hi');
    expect(await f.sendReport(1)).toBe('waiting');
    expect(f.queued).toHaveLength(1);
    store.set(FEEDBACK_KEY, '{not json');
    expect(f.queued).toEqual([]);
  });

  it('two notes sent in quick succession each go out once, and neither is lost', async () => {
    const sent: string[][] = [];
    let release!: () => void;
    const f = new FeedbackService(memStore(), 'https://example.test/report', async (_url, body) => {
      sent.push((JSON.parse(body) as { notes: { text: string }[] }).notes.map((n) => n.text));
      if (sent.length === 1) await new Promise<void>((r) => (release = r)); // the first send is slow
      return true;
    });
    f.add('note', 'first');
    const a = f.sendReport(2);
    while (!sent.length) await Promise.resolve(); // the first send is under way
    f.add('flavor', 'second'); // written while the first is still on its way
    const b = f.sendReport(2);
    release();
    expect(await a).toBe('sent');
    expect(await b).toBe('sent');
    expect(sent).toEqual([['first'], ['second']]);
    expect(f.queued).toHaveLength(0);
  });
});
