# The feedback relay

Players' flavor ideas and notes for Ethan go out in a daily report. A small Cloudflare Worker receives each report from the game and emails it through Resend.

**Why a relay:** the Resend API key is a secret. The game's code is public (on GitHub and on the site), so anyone could read a key placed there and send email from the account. Resend also refuses calls made straight from a browser. The Worker holds the key and sends only what the game posts, and only from the game's own pages.

## One-time setup (about 5 minutes, free)

1. Create a free Cloudflare account at https://dash.cloudflare.com/sign-up.
2. From this folder, log in. A browser window opens.
   ```
   cd relay
   npx wrangler login
   ```
3. Store the two secrets. Each command asks you to paste a value.
   ```
   npx wrangler secret put RESEND_API_KEY     # your re_... key from resend.com
   npx wrangler secret put FEEDBACK_TO        # where reports go (kumardarshan425@gmail.com for now; Ethan's later)
   ```
4. Deploy. The last line prints the Worker's address, like `https://domochi-feedback.<you>.workers.dev`.
   ```
   npx wrangler deploy
   ```
5. Put that address in `src/data/brand.json` as `feedbackEndpoint`, then commit and push. From then on, the game sends each day's notes.

## Changing where reports go

To switch the reports to Ethan, run `npx wrangler secret put FEEDBACK_TO` again with his address. No game update is needed.

## Sending from a domochi address

Until a domain is verified in Resend, mail comes from `onboarding@resend.dev`, and Resend only delivers it to the email address of the Resend account itself. Once domochitreats.com is verified in Resend:

1. Set `FEEDBACK_FROM` as a secret, for example `domochi game <game@domochitreats.com>`.
2. After that, reports can go to any address.

## If the key ever leaks

Revoke it in the Resend dashboard, make a new one, and run `npx wrangler secret put RESEND_API_KEY` again.

## Ethan's daily email (set up 2026-11-02)

Notes are now kept in a Cloudflare KV store (`NOTES`, already created; its id is in `wrangler.toml`). Once a day at 8 am Lafayette time the Worker emails **one** digest, only when there's something to say:
- the day's player notes (flavour ideas first);
- the trailer's secret words: the **full list once** (the first digest), then **this week's and next week's every Monday**.

Secrets (each command asks for the value):
```
npx wrangler secret put DIGEST_TO     # who gets the daily email (Ethan; Kumar's address until the domain is verified)
npx wrangler secret put INSTANT_TO    # optional: also email each note straight away (Kumar, while testing)
npx wrangler deploy
```
Resend only delivers to the Resend account's own address until a domain (domochitreats.com) is verified in Resend. Until then, set `DIGEST_TO` to Kumar's address. Once the domain is verified, set `FEEDBACK_FROM` (for example `domochi game <game@domochitreats.com>`) and point `DIGEST_TO` at Ethan.

**Abuse limits:** reports over 16 KB are refused, one sender gets 10 reports a day, and the relay takes at most 300 a day. The Origin check stops other websites, but not scripts, so these limits are what protect the inbox and the Resend quota.

**Test the daily email by hand:** `npx wrangler dev --test-scheduled`, then open `http://localhost:8787/__scheduled`.
