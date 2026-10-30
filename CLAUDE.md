# Domochi Donuts — Mobile Game

A Papa's Pizzeria–style time-management game where the player runs the **Domochi Donuts** food truck (Lafayette, LA) and makes **mochi donuts** (pon de ring shape: a ring of 8 connected dough balls).

**Purpose:** free marketing for the business, with any ad revenue as a bonus. The game must feel friendly and on-brand. No aggressive ads, ever.

**Targets:** mobile web first (playable via a QR code on the food truck), then Android through Capacitor. iOS may come later; don't use anything that blocks it.

---

## First session: setup (the user has nothing installed yet)

Before writing code, walk the user through these one at a time and verify each with a command:

1. **Git.** Check `git --version`. Then `git init` and make a first commit.
2. **Node.js LTS (20+).** Check `node -v` and `npm -v`.
3. **Scaffold the project:** Vite + TypeScript + Phaser 3, as below.
4. **Playwright:** `npm i -D @playwright/test`, then `npx playwright install chromium`.
5. **Dev server:** confirm `npm run dev` works, and that the game loads on the user's phone over LAN with `--host`.

Defer the Android SDK and Capacitor until Phase 8.

---

## Tech stack

| Purpose | Tool |
|---|---|
| Game framework | Phaser 3 (latest 3.x), TypeScript strict mode |
| Build / dev | Vite |
| Tests | Vitest (logic), Playwright (scene flow plus screenshots) |
| Android | Capacitor (Phase 8) |
| Web hosting | Netlify or GitHub Pages (Phase 7) |
| Save data | `localStorage` behind a `SaveService` wrapper, so it can be swapped for Capacitor Preferences later |

Keep dependencies minimal. Ask before adding any new library.

---

## Display

- Portrait **1080×1920** logical resolution, using `Phaser.Scale.FIT` with auto-centering.
- Touch first: every interaction must work with one finger. Mouse support comes for free.
- Hit targets must be at least 120px at logical resolution.

---

## Game flow

```
Boot → Preload (truck + Ethan waving) → [first run?] Tutorial → Lobby
Lobby → Order → Lobby → Fry → Glaze → Toppings → Box → Serve → Lobby …
```

The player can switch between Lobby and the kitchen stations using a bottom tab bar, the same as in Papa's games. Multiple orders can be in progress at once, tracked on order tickets.

### Scenes

1. **BootScene / PreloadScene.** Shows a loading screen with the Domochi food truck and **Ethan (owner/CEO)** inside, waving (looping animation). A progress bar sits under the truck, and the player taps to start.
2. **TutorialScene.** Runs only on first launch (`save.tutorialDone`), and is replayable from Settings. It guides the player through one full order, station by station, using highlight overlays, a pointer hand, and dialogue from Ethan. Each step only advances when the player does the action.
3. **LobbyScene.** The truck's parking lot. Customers walk in and form a line. Tapping the front customer opens **OrderScene**: their dialogue bubble shows the order, a ticket is created, and they move to the waiting area.
4. **FryScene.** Plays as a mini-sim. Controls:
   - **Heat dial:** sets the target temperature. The oil temperature moves toward it with lag.
   - **Oil level:** the player tops it up. Oil depletes per batch, and low oil causes uneven frying.
   - **Fry timer:** the player decides when to pull. Under-fried is pale and over-fried is dark.
   - **Grate / press:** donuts float, so the player pushes the grate down to keep them submerged. If it isn't held down, the top side under-cooks.
   - **Flip:** each side cooks separately.
   - **Score:** based on doneness on both sides compared to the ideal, oil temperature in range, and evenness.
5. **GlazeScene.** The player picks a glaze type, then **drizzles it by dragging** a finger over the donut.
   - **Score:** coverage percentage of the target region and spill outside it.
   - Some glazes are a "dip" (full coverage) and some are a "drizzle" (stripe pattern). The ticket says which.
6. **ToppingsScene.** The player drags toppings onto the donut.
   - **Score:** correct toppings, correct amount, and distribution evenness.
7. **BoxScene.** The player drags the finished donuts into box slots in the ticket's order, then closes the lid.
   - **Score:** correct items in the box and no wrong extras.
8. **ServeScene.** Cuts back to the Lobby. The player hands the box to the matching customer, who reacts with a line of dialogue and leaves a **tip** based on overall quality. The result card shows each station's score.

---

## Scoring and tips

- Each station scores 0–100. The order score is a weighted average:
  - Fry 30%, Glaze 25%, Toppings 25%, Box 10%, Wait time 10%
- Wait time is measured from order taken to served. Use a soft curve, not a harsh penalty.
- Tip = `baseTip × f(orderScore)`, where `f` is configurable in data.
- Customer dialogue is picked from tiers (great / good / okay / bad), defined in data.

All tuning numbers go in `src/data/balance.json`. Never hardcode them in scenes.

---

## Data-driven content

Real menu items must be swappable without code changes. Data lives in:

- `src/data/menu.json`: donut bases, glazes, toppings, display names, and unlock day
- `src/data/customers.json`: customer types, dialogue lines, order preferences, patience
- `src/data/balance.json`: fry curves, score weights, tip formula, spawn rates
- `src/data/tutorial.json`: tutorial steps and Ethan's lines

Each day, the game generates orders from the menu items unlocked so far.

---

## Assets (placeholders now, real art later)

- Placeholders come from Kenney.nl (CC0) or are drawn in code as simple shapes. Never use random web images.
- **`assets/MANIFEST.md`** is the source of truth: every asset's key, file path, pixel size, frame count, and purpose. Update it whenever you add or change an asset.
- Scenes reference assets **only by key** from `src/assets/keys.ts`, so replacing art is just a file drop.
- Format: PNG with transparency. Animations are sprite sheets, with frame size listed in the manifest.

---

## Project structure

```
src/
  main.ts
  config.ts
  scenes/           # one file per scene
  stations/         # pure logic per station (no Phaser imports), unit-tested
  systems/          # OrderManager, CustomerSpawner, ScoreService, SaveService, AudioService
  ui/               # buttons, tab bar, ticket, dialogue bubble, dial, overlay
  data/             # JSON content
  assets/keys.ts
public/assets/      # images, audio
assets/MANIFEST.md
tests/              # vitest + playwright
```

**Rule:** keep game logic (scoring, frying sim, coverage math) in `stations/` and `systems/` as plain TypeScript with unit tests. Scenes handle only rendering and input.

---

## Development rules

- After each feature, run `npm run typecheck`, `npm test`, and the Playwright smoke test. Take a screenshot of the affected scene and check it visually.
- Commit after each working milestone with a clear message.
- Keep the game playable at the end of every phase.
- Hold 60 fps on a mid-range Android phone. Avoid per-frame allocations in update loops.
- Ask the user before making large design changes. Small decisions can be made directly and noted in `DECISIONS.md`.

---

## Phases

0. **Setup:** environment, scaffold, and the first commit.
1. **Skeleton:** all scenes reachable with placeholder art, plus the tab bar navigation and SaveService.
2. **Order loop:** customers in line, taking orders, tickets, the waiting area, and serving.
3. **Fry station:** full sim plus scoring.
4. **Glaze station:** drag drizzle plus coverage scoring.
5. **Toppings and Box stations.**
6. **Scoring, tips, dialogue, and days:** end-of-day summary, unlocks, and save/load.
7. **Tutorial, loading screen polish, sound, and web deploy.**
8. **Android:** Capacitor wrap, building an AAB from the CLI, and a walkthrough of Play Console upload. The user does the signing and upload.
9. **Optional:** AdMob **rewarded ads only** (e.g. "watch an ad for double tips"), Android only. Marketing hooks: high-score coupon codes, a shareable donut screenshot, and seasonal menu updates.

---

## Branding

- The business name is **Domochi Donuts**, and the owner character is **Ethan**.
- Use the owner's real logo, menu, and colors once provided. Until then, use neutral placeholder colors and mark them `TODO-BRAND` in code.