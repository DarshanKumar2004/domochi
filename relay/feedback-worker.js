// The game's feedback relay: a tiny Cloudflare Worker that takes players'
// notes (flavour ideas and notes for Ethan, POSTed by
// src/systems/FeedbackService.ts) and emails them through Resend.
//
// - With the NOTES store (Workers KV) set up, notes are kept and Ethan gets one
//   email a day (the scheduled run), only when there's something to tell him:
//   the day's notes, and the trailer's secret words (the full list once, then
//   this week's and next week's every Monday). See relay/digest.js.
// - INSTANT_TO (optional secret): also email each note there straight away
//   (Kumar, for now). Without the NOTES store, notes always go out at once to
//   FEEDBACK_TO, as before.
//
// Abuse limits (the Origin check alone can be faked by a script): reports over
// 16 KB are refused, each sender gets 10 reports a day, and the whole relay
// takes 300 a day. Secrets never go in this repo (it's public):
//   npx wrangler secret put RESEND_API_KEY / FEEDBACK_TO / DIGEST_TO / INSTANT_TO
// See relay/README.md.
import { buildDigest } from './digest.js';

/** Most notes in one report, longest note, biggest report (bytes). */
const MAX_NOTES = 50;
const MAX_TEXT = 500;
const MAX_BODY = 16_384;
/** Reports a day: from one sender (by IP), and in all. */
const PER_SENDER = 10;
const PER_DAY = 300;
/** Stored notes are kept this long (seconds), in case a digest is missed. */
const KEEP_SECONDS = 8 * 86_400;

function corsHeaders(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] || '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

/** Plain text, one line, trimmed and capped (no HTML: the email is plain text). */
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max);

/** Today in Lafayette (YYYY-MM-DD). */
const today = (now = new Date()) => now.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

async function sendEmail(env, to, subject, text) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.FEEDBACK_FROM || 'domochi game <onboarding@resend.dev>', to: [to], subject, text }),
  });
  return r.ok;
}

/** Count one more against a daily limit in the store; false once it's reached. */
async function underLimit(kv, key, limit) {
  const n = Number((await kv.get(key)) || 0);
  if (n >= limit) return false;
  await kv.put(key, String(n + 1), { expirationTtl: 2 * 86_400 });
  return true;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405, cors);
    // Only the game's own pages may send (a browser always says where it's from).
    if (cors['Access-Control-Allow-Origin'] !== origin) return json({ error: 'not allowed' }, 403, cors);
    if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY) return json({ error: 'too big' }, 413, cors);

    let raw;
    try {
      raw = await request.text();
    } catch {
      return json({ error: 'bad request' }, 400, cors);
    }
    if (raw.length > MAX_BODY) return json({ error: 'too big' }, 413, cors);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: 'bad json' }, 400, cors);
    }
    const notes = (Array.isArray(body?.notes) ? body.notes : []).slice(0, MAX_NOTES).map((n) => ({
      kind: n?.kind === 'flavor' ? 'flavor' : 'note',
      text: clean(n?.text, MAX_TEXT),
      name: clean(n?.name, 60),
    }));
    const kept = notes.filter((n) => n.text);
    if (!kept.length) return json({ error: 'nothing to send' }, 400, cors);
    const day = Number.isInteger(body?.day) ? body.day : '?';

    const kv = env.NOTES;
    if (kv) {
      // Daily limits, then keep the notes for tonight's digest.
      const date = today();
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      if (!(await underLimit(kv, `limit:${date}:${ip}`, PER_SENDER)) || !(await underLimit(kv, `limit:${date}:all`, PER_DAY))) {
        return json({ error: 'slow down' }, 429, cors);
      }
      const id = `note:${date}:${Date.now()}:${crypto.randomUUID().slice(0, 8)}`;
      await kv.put(id, JSON.stringify({ day, notes: kept }), { expirationTtl: KEEP_SECONDS });
    }

    // Straight away too: to INSTANT_TO (if set), or to FEEDBACK_TO when there's no store.
    const instantTo = kv ? env.INSTANT_TO : env.FEEDBACK_TO;
    if (instantTo) {
      const line = (n) => `- ${n.text}${n.name ? ` (${n.name})` : ''}`;
      const flavors = kept.filter((n) => n.kind === 'flavor');
      const others = kept.filter((n) => n.kind === 'note');
      const text = [
        `A player's notes from the domochi game (they were on day ${day}).`,
        flavors.length ? `Flavour ideas:\n${flavors.map(line).join('\n')}` : '',
        others.length ? `Notes for Ethan:\n${others.map(line).join('\n')}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');
      const sent = await sendEmail(env, instantTo, `domochi game: ${kept.length} note${kept.length === 1 ? '' : 's'} from a player`, text);
      if (!sent && !kv) return json({ error: 'email failed' }, 502, cors);
    }
    return json({ ok: true }, 200, cors);
  },

  /** Once a day (wrangler.toml [triggers]): Ethan's email, if there's anything to tell him. */
  async scheduled(_event, env) {
    const kv = env.NOTES;
    const to = env.DIGEST_TO || env.FEEDBACK_TO;
    if (!kv || !to) return;
    // Every note kept since the last digest.
    const since = Number((await kv.get('digest:last')) || 0);
    const keys = [];
    let cursor;
    do {
      const page = await kv.list({ prefix: 'note:', cursor });
      keys.push(...page.keys.map((k) => k.name));
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
    const fresh = keys.filter((k) => Number(k.split(':')[2]) > since);
    const notes = [];
    for (const k of fresh) {
      const v = await kv.get(k, 'json');
      if (v?.notes) notes.push(...v.notes);
    }
    const wordsSent = (await kv.get('digest:words-sent')) === 'yes';
    const digest = buildDigest({ notes, now: new Date(), wordsSent });
    if (!digest) return;
    if (await sendEmail(env, to, digest.subject, digest.text)) {
      await kv.put('digest:last', String(Date.now()));
      if (!wordsSent) await kv.put('digest:words-sent', 'yes');
    }
  },
};
