// The game's feedback relay: a tiny Cloudflare Worker that takes a player's
// daily report (flavour ideas and notes for Ethan, POSTed by
// src/systems/FeedbackService.ts) and emails it through Resend.
//
// The Resend API key and the address the reports go to are SECRETS on the
// Worker (never in this repo: the repo and the site are public):
//   npx wrangler secret put RESEND_API_KEY
//   npx wrangler secret put FEEDBACK_TO
// See relay/README.md.

/** Most notes in one report, and longest note (the game caps them too). */
const MAX_NOTES = 50;
const MAX_TEXT = 500;

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

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405, cors);
    // Only the game's own pages may send (a browser always says where it's from).
    if (cors['Access-Control-Allow-Origin'] !== origin) return json({ error: 'not allowed' }, 403, cors);

    let body;
    try {
      body = await request.json();
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

    const line = (n) => `- ${n.text}${n.name ? ` (${n.name})` : ''}`;
    const flavors = kept.filter((n) => n.kind === 'flavor');
    const others = kept.filter((n) => n.kind === 'note');
    const day = Number.isInteger(body?.day) ? body.day : '?';
    const text = [
      `A player's notes from the domochi game (they were on day ${day}).`,
      flavors.length ? `Flavour ideas:\n${flavors.map(line).join('\n')}` : '',
      others.length ? `Notes for Ethan:\n${others.map(line).join('\n')}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.FEEDBACK_FROM || 'domochi game <onboarding@resend.dev>',
        to: [env.FEEDBACK_TO],
        subject: `domochi game: ${kept.length} note${kept.length === 1 ? '' : 's'} from a player`,
        text,
      }),
    });
    if (!r.ok) return json({ error: 'email failed' }, 502, cors);
    return json({ ok: true }, 200, cors);
  },
};
