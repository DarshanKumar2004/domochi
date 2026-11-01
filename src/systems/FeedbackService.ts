// Players' notes for Ethan: flavour ideas and anything they want to tell him.
// Kept on the device and sent as soon as the player sends one; anything that
// could not go out then is retried at the end of the day and at start-up. Sending needs an endpoint that
// takes a JSON POST and emails it on (a form service such as Formspree, or a
// small serverless function): brand.json `feedbackEndpoint`. Until one is set,
// notes simply wait in the queue. No Phaser imports.

export type FeedbackKind = 'flavor' | 'note';

export interface Feedback {
  kind: FeedbackKind;
  text: string;
  /** Optional: what they'd like to be called. */
  name?: string;
  /** When it was written (ISO date-time). */
  at: string;
}

export const FEEDBACK_KEY = 'domochi.feedback';
/** Longest note kept (characters). */
export const MAX_TEXT = 500;

export interface FeedbackStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export class FeedbackService {
  constructor(
    private readonly store: FeedbackStore,
    private readonly endpoint: string,
    private readonly post: (url: string, body: string) => Promise<boolean> = async (url, body) => {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body });
      return r.ok;
    },
  ) {}

  /** Sends run one after another, so two quick notes never go out twice. */
  private chain: Promise<unknown> = Promise.resolve();

  /** Notes waiting to go out. */
  get queued(): Feedback[] {
    try {
      const raw = JSON.parse(this.store.get(FEEDBACK_KEY) ?? '[]') as unknown;
      return Array.isArray(raw) ? (raw.filter((f) => f && typeof f.text === 'string') as Feedback[]) : [];
    } catch {
      return [];
    }
  }

  /** Keep a note for the next report. Returns false for an empty one. */
  add(kind: FeedbackKind, text: string, name = ''): boolean {
    const t = text.trim().slice(0, MAX_TEXT);
    if (!t) return false;
    const n = name.trim().slice(0, 60);
    const all = this.queued;
    all.push({ kind, text: t, ...(n ? { name: n } : {}), at: new Date().toISOString() });
    this.store.set(FEEDBACK_KEY, JSON.stringify(all));
    return true;
  }

  /**
   * Send everything waiting as one report. On success the queue empties; if
   * there's no endpoint yet, or it fails, the notes wait for the next time.
   */
  sendReport(day: number): Promise<'sent' | 'nothing' | 'waiting'> {
    const run = this.chain.then(() => this.sendNow(day));
    this.chain = run;
    return run;
  }

  private async sendNow(day: number): Promise<'sent' | 'nothing' | 'waiting'> {
    const notes = this.queued;
    if (!notes.length) return 'nothing';
    if (!this.endpoint) return 'waiting';
    const flavors = notes.filter((n) => n.kind === 'flavor');
    const other = notes.filter((n) => n.kind === 'note');
    const line = (n: Feedback) => `- ${n.text}${n.name ? ` (${n.name})` : ''}`;
    const body = JSON.stringify({
      subject: `domochi game: ${notes.length} note${notes.length === 1 ? '' : 's'} from players`,
      day,
      message: [
        flavors.length ? `Flavour ideas:\n${flavors.map(line).join('\n')}` : '',
        other.length ? `Notes for Ethan:\n${other.map(line).join('\n')}` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
      notes,
    });
    try {
      if (!(await this.post(this.endpoint, body))) return 'waiting';
    } catch {
      return 'waiting';
    }
    // Drop just what went out: a note added meanwhile waits for the next send.
    this.store.set(FEEDBACK_KEY, JSON.stringify(this.queued.slice(notes.length)));
    return 'sent';
  }
}
