// The home screen's pop-ups, in plain HTML over the game: "About us", and the
// two little forms (they need a real text box, which the canvas can't give).
import brand from '../data/brand.json';
import type { FeedbackKind } from '../systems/FeedbackService';
import { FONT_FAMILY } from './theme';

const CSS = `
.dm-back{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:50;padding:16px;box-sizing:border-box}
.dm-card{background:#fbf6ec;color:#1f1a17;border:4px solid #1f1a17;border-radius:24px;max-width:520px;width:100%;max-height:100%;overflow:auto;padding:22px 22px 18px;box-sizing:border-box;font-family:${FONT_FAMILY};box-shadow:0 8px 0 rgba(0,0,0,.25)}
.dm-card h2{margin:0 0 6px;font-size:28px}
.dm-card p{margin:8px 0;font-size:17px;line-height:1.4}
.dm-card .dm-muted{color:#6b5d52;font-size:14px}
.dm-card textarea,.dm-card input{width:100%;box-sizing:border-box;border:3px solid #1f1a17;border-radius:14px;padding:10px;font:16px ${FONT_FAMILY};background:#fff;margin:6px 0}
.dm-card textarea{min-height:120px;resize:vertical}
.dm-row{display:flex;gap:12px;margin:14px 0 8px}
.dm-btn{flex:1;min-height:52px;border:3px solid #1f1a17;border-radius:16px;font:bold 18px ${FONT_FAMILY};cursor:pointer;background:#e9c48f;color:#1f1a17;box-shadow:0 5px 0 rgba(0,0,0,.28)}
.dm-btn:active{transform:translateY(3px);box-shadow:0 2px 0 rgba(0,0,0,.28)}
/* A phone held sideways: a shorter form, so it fits with room under the buttons. */
@media (max-height:520px){.dm-card{padding:14px 18px 16px}.dm-card h2{font-size:22px}.dm-card p{margin:4px 0;font-size:15px}.dm-card textarea{min-height:64px}.dm-card input,.dm-card textarea{padding:8px;margin:4px 0}.dm-btn{min-height:46px}}
.dm-btn.dm-go{background:#f4a6c0}
.dm-card a{color:#b0406a;font-weight:bold}
`;

function ensureStyle(): void {
  if (document.getElementById('dm-style')) return;
  const s = document.createElement('style');
  s.id = 'dm-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/** Open a card; returns it and a close function. Tapping outside closes it. */
function openCard(html: string, onClose?: () => void): { card: HTMLElement; close: () => void } {
  ensureStyle();
  const back = document.createElement('div');
  back.className = 'dm-back';
  back.innerHTML = `<div class="dm-card" role="dialog" aria-modal="true">${html}</div>`;
  const card = back.firstElementChild as HTMLElement;
  const close = () => {
    back.remove();
    onClose?.();
  };
  back.addEventListener('pointerdown', (e) => e.target === back && close());
  // Keep game input (the "tap anywhere to start") out of the form.
  for (const ev of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup']) card.addEventListener(ev, (e) => e.stopPropagation());
  document.body.appendChild(back);
  return { card, close };
}

/** Is a home panel open? (The home screen ignores taps meanwhile.) */
export function panelOpen(): boolean {
  return !!document.querySelector('.dm-back');
}

const site = brand.website;
const siteShort = site.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

export function showAbout(onClose?: () => void): void {
  const { card, close } = openCard(
    `<h2>about domochi</h2>
     <p>${brand.pitch}! Founded by ${brand.founder} in ${brand.city}: chewy, pull-apart mochi donuts, made fresh daily.</p>
     <p>This game is a love letter to the trailer. The real menu, hours and where to find us are at
     <a href="${site}" target="_blank" rel="noopener">${siteShort}</a>, and on Instagram at <b>${brand.instagram}</b>.</p>
     <p class="dm-muted">The coffee shops and places in the game are made up, just for fun.</p>
     <div class="dm-row"><button class="dm-btn" data-x="close">Close</button><a class="dm-btn dm-go" style="display:flex;align-items:center;justify-content:center;text-decoration:none" href="${site}" target="_blank" rel="noopener">Visit the site</a></div>`,
    onClose,
  );
  card.querySelector('[data-x="close"]')!.addEventListener('click', close);
}

/**
 * mochi's invitation to join the team: asks your name. `join` gets the name
 * (it says whether it was accepted).
 */
export function showJoinTeam(mochiImage: string, join: (name: string) => boolean, onClose?: () => void): void {
  const { card, close } = openCard(
    `<div style="display:flex;gap:14px;align-items:center"><img src="${mochiImage}" alt="mochi" style="width:84px;height:80px;flex:none"><h2 style="margin:0">hey, what's your name?</h2></div>
     <p>would you like to join the team? Ethan would love to have you!</p>
     <input maxlength="24" placeholder="your name">
     <p class="dm-muted">you'll keep the trailer going with the crew while you're away.</p>
     <div class="dm-row"><button class="dm-btn" data-x="close">Not yet</button><button class="dm-btn dm-go" data-x="join">Join the team!</button></div>`,
    onClose,
  );
  const name = card.querySelector('input')!;
  card.querySelector('[data-x="close"]')!.addEventListener('click', close);
  card.querySelector('[data-x="join"]')!.addEventListener('click', () => {
    if (!join(name.value)) {
      name.focus();
      return;
    }
    card.innerHTML = `<h2>welcome to the team, ${escapeHtml(name.value.trim())}!</h2><p>mochi made you a name tag. see you at the trailer!</p><div class="dm-row"><button class="dm-btn dm-go" data-x="close">yay!</button></div>`;
    card.querySelector('[data-x="close"]')!.addEventListener('click', close);
  });
  setTimeout(() => name.focus(), 50);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

/**
 * A little form: a flavour idea, or a note for Ethan. `send` keeps it and
 * sends it on (it says whether the note was kept).
 */
export function showFeedback(kind: FeedbackKind, send: (text: string, name: string) => boolean, onClose?: () => void): void {
  const title = kind === 'flavor' ? 'suggest a new flavor' : 'let Ethan know';
  const prompt = kind === 'flavor' ? 'what mochi donut should Ethan make next?' : 'a hello, a thank-you, an idea... Ethan reads them all';
  const { card, close } = openCard(
    `<h2>${title}</h2>
     <p>${prompt}</p>
     <textarea maxlength="500" placeholder="${kind === 'flavor' ? 'ube with coconut flakes!' : 'type here'}"></textarea>
     <input maxlength="60" placeholder="your first name (optional)">
     <p class="dm-muted">Sent straight to domochi. Please don't include private info.</p>
     <div class="dm-row"><button class="dm-btn" data-x="close">Cancel</button><button class="dm-btn dm-go" data-x="send">Send</button></div>`,
    onClose,
  );
  const text = card.querySelector('textarea')!;
  const name = card.querySelector('input')!;
  card.querySelector('[data-x="close"]')!.addEventListener('click', close);
  card.querySelector('[data-x="send"]')!.addEventListener('click', () => {
    if (!send(text.value, name.value)) {
      text.focus();
      return;
    }
    card.innerHTML = `<h2>thank you!</h2><p>mochi will pass it on to Ethan.</p><div class="dm-row"><button class="dm-btn dm-go" data-x="close">Close</button></div>`;
    card.querySelector('[data-x="close"]')!.addEventListener('click', close);
  });
  setTimeout(() => text.focus(), 50);
}
