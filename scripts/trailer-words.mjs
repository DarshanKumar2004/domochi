// Ethan's calendar of the trailer's secret words: one per week (Monday to
// Sunday), worked out the same way the game checks them. Writes
// trailer-words.html (git-ignored: keep it off the public repo).
// Usage: npm run trailer-words [weeks]   (default: the next 26 weeks)
import { writeFileSync } from 'node:fs';
import { trailerWeek, trailerWord, weekStart } from '../src/systems/trailerCode.ts';

const weeks = Number(process.argv[2]) || 26;
const now = trailerWeek(new Date());
const fmt = (d) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const rows = [];
for (let w = now; w < now + weeks; w++) {
  const start = weekStart(w);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  rows.push(`<tr${w === now ? ' class="now"' : ''}><td>${fmt(start)} – ${fmt(end)}</td><td><b>${trailerWord(w)}</b></td></tr>`);
}
writeFileSync(
  'trailer-words.html',
  `<!doctype html><html><head><meta charset="utf-8"><title>domochi trailer secret words</title>
<style>body{font:16px system-ui,sans-serif;max-width:640px;margin:24px auto;padding:0 16px;color:#1f1a17}h1{font-size:24px}
table{border-collapse:collapse;width:100%}td{border-bottom:1px solid #ddd;padding:8px}b{font-size:20px;color:#b0406a}.now{background:#fdeef3}</style></head>
<body><h1>domochi trailer: secret word of the week</h1>
<p>Show this week's word on the menu board (or tell customers at the window). Players type it into the game's home screen for a reward, once a week. Last week's word also works until the next Monday.</p>
<table>${rows.join('')}</table></body></html>\n`,
);
console.log(`wrote trailer-words.html: ${weeks} weeks from this one (this week's word: ${trailerWord(now)})`);
