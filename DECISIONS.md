# Decisions

Small decisions made during development. Large design changes are asked about first.

## Phase 0 (2026-10-30)

- ~~Phaser pinned to 3.90.0.~~ Superseded the same day (see below).
- **Upgraded to Phaser 4.2.1.** Kumar confirmed that "Phaser 3" in the plan was only a guess at the newest version. The policy now is to use the newest versions. The scaffold needed no code changes: type check, unit tests and the smoke test all pass, and the screenshot matches. CLAUDE.md was updated to say Phaser 4.
- **TypeScript 7, Vite 8, Vitest 5, Playwright 1.64.** These were the latest versions at setup time. Type checking and tests pass on them.
- **Hand-written scaffold** instead of `npm create vite`, so the layout matches the structure in CLAUDE.md without template leftovers.
- **Vite `base: './'`.** Relative asset paths work on GitHub Pages subpaths and inside Capacitor.
- **`window.__game`** is exposed so Playwright can check which scene is active.
- **Playwright runs as a Pixel 7** (mobile Chromium, touch enabled), because mobile web is the main target.
- **Ring geometry is in `src/stations/donutGeometry.ts`.** The pon de ring layout (8 balls, first at 12 o'clock, clockwise) is pure and unit-tested, and later stations will reuse it for glaze and topping hit regions.

## Phase 1 (2026-10-30)

- **Station switching uses sleep/wake.** `HudScene` puts the station you leave to sleep and wakes (or first starts) the one you tap, so each station keeps its state. A sleeping scene doesn't run `update()`, so in Phase 3 the fry simulation will advance in a `systems/` service, not inside `FryScene`. That way donuts keep cooking while you're at another station.
- **Tab bar is its own scene (`HudScene`), always on top.** Popups (Order, Serve, Settings) call `beginOverlay()`, which moves them above the tab bar and blocks taps underneath. *Bug found by screenshot review:* without this, a popup opened after a tab switch drew *under* the tab bar, because Phaser keeps a launched scene in its original slot in the scene list. The Playwright flow now asserts that each popup is the top scene.
- **Tabs: Lobby, Fry, Glaze, Toppings, Box.** Order and Serve aren't tabs. Order is a popup opened by tapping the front customer, and Serve is the result card after "Close lid & serve" (CLAUDE.md: "Serve … cuts back to the Lobby").
- **The save is loaded before Phaser starts** (`main.ts`). `SaveService` keeps the save in memory so reads are synchronous, and writes go through an *async* `SaveStorage` interface, so Capacitor Preferences (which is async) can replace localStorage in Phase 8 without touching scenes. A corrupt or partly-invalid save falls back to defaults field by field, and if localStorage is blocked the game still runs from memory.
- **Placeholder art is generated at load time under the real asset keys.** Real PNGs listed in `src/assets/files.ts` load first, and placeholders only fill keys that are still missing. Replacing art is a file drop plus one line. Anchor points that real art must match (the truck window and sign) live in `TRUCK_SPEC`.
- **A unit test checks that every key in `keys.ts` appears in `assets/MANIFEST.md`,** so the manifest can't fall out of date. It reads the file with Vite's `?raw` import rather than adding `@types/node`.
- **The loading screen shows for at least 1.2 s,** so the truck and Ethan are seen even when loading is instant. This is UI pacing, so it's a constant in `PreloadScene` rather than in `balance.json`.
- **Reset progress needs two taps** ("Tap again to reset") and uses a soft red. Replay tutorial and reset both stop every main-game scene, then start the tutorial.
- **Tutorial is a placeholder:** three lines from Ethan from `tutorial.json`, plus Skip. The guided tutorial is Phase 7.
- ~~Open question, letterboxing~~: resolved below.

## Responsive layout (2026-10-30)

Kumar chose **option B** (fill the screen, no bars) and asked for **landscape on PC, portrait in phone browsers, and landscape by default in the app with a vertical option**. CLAUDE.md's Display section was updated.

- **The orientation follows the window's shape** (width greater than height means landscape) rather than the device type. That covers PC, phone portrait, phone landscape, tablets and resized desktop windows with one rule. A square window counts as portrait.
- **The game size grows to the screen's shape** around a 1920×1080 or 1080×1920 safe area. Longer than 16:9 extends the long side, and squarer than 16:9 extends the short side. **Capped at 2.4:1:** super-ultrawide monitors get slim side bars, so the game doesn't stretch absurdly wide.
- **The short side is always 1080 logical px,** so hit targets (min 120) are the same physical size in both orientations, and the existing portrait numbers stayed valid.
- **Scenes lay out through `onLayout()`,** which runs on create and on every resize, including for sleeping stations. A rotation keeps all state: a station mid-fry stays mid-fry.
- **Tab bar:** 200 px tall in portrait and 160 in landscape. Tabs are capped at 300 px wide and centred, so they don't stretch across a wide monitor.
- **Popup dimmers and tap areas are a fixed 4000×4000 px,** bigger than any possible game, so they never need resizing.
- **Tweens no longer animate x/y** (they would fight the layout). The Lobby's 'Tap me!' pulses in scale, and the Fry donut wobbles in angle.
- **Playwright runs 3 projects:** Pixel 7 portrait, Pixel 7 landscape, and desktop at 1440×900 (mouse, no touch). A rotation test flips the phone mid-game and checks that state is kept and everything is still tappable. `tapGame` also fails if a target is off screen. The full-flow test timeout is 90 s because projects run in parallel.
