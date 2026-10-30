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

## Real domochi branding (2026-10-30)

Kumar asked for the real branding and flavours from https://www.domochitreats.com.

- **Source:** the site is a Square Online store. Its pages render in the browser, so the menu came from Square's public store API: `https://cdn5.editmysite.com/app/store/api/v28/editor/users/154290604/sites/187969059733018017/products`. Re-run that to refresh `menu.json` when the shop changes flavours.
- **`menu.json` now has the real menu:** strawberry, cookies & cream, chocolate hazelnut, fruity cereal, cookie butter and beignet, all $4. Boxes: the trio (3, $11), the flight (6, $20) and the domochi box (12, $30). Names, descriptions and prices are copied exactly.
- **Game-design guesses layered on top** (not from the shop, easy to change in the JSON):
  - "sweet glaze" for fruity cereal, because the site only says "sweet glaze".
  - **Beignet is a "dust" style**: powdered sugar shaken on at the Glaze station, a third style beside dip and drizzle. Its mechanic is decided in Phase 4.
  - Every real flavour is a full dip, so "drizzle" is unused for now but still supported.
  - **Unlock order:** day 1 strawberry plus cookies & cream (so the Toppings station is used from day 1), then chocolate hazelnut, fruity cereal, cookie butter and beignet on days 2 to 5. This is a balance placeholder, to be tuned in Phase 6.
- **`validateMenu()`** (`src/systems/menu.ts`) checks ids, references, colours and unlock days, and a unit test runs it on the real `menu.json`. A typo in a future menu edit fails the tests instead of breaking the game.
- **`brand.json`** holds the name, tagline, founder, city, website and Instagram. Address and hours were left out because they change, and stale hours in a game would be bad marketing.
- **Palette:** ink `#1f1a17` and cream `#fffaf0` from the site, with strawberry-glaze pink `#f4a6c0` as the accent. Ethan wears black with a cream outline, echoing the logo's ink outlines and keeping him visible on dark backgrounds.
- **Text:** the loading screen shows "domochi" plus the tagline, the truck sign is lowercase, and Ethan's tutorial lines use the shop's own "what's a mochi donut?" copy.
- **Not done yet, waiting on Kumar:** the official logo PNG is not in the repo (see open questions in chat). The setting is still a truck, but the real business is a walk-up window at the shop plus pop-ups.

## Rotation bug fix (2026-10-30)

**Bug (found by Kumar on a real phone):** after rotating to landscape and back to portrait, the game showed as a smaller box inside the screen.

- **Cause:** `watchWindowSize` only acted when the computed *game size changed*. Rotating back to portrait gives the same game size as before, so nothing told Phaser to re-fit the canvas, and it kept the display size it had mid-rotation. Window sizes read inside rotation events can also be stale, so one event wasn't trustworthy either.
- **Fix:**
  - `watchContainerSize` measures the `#game` container rather than `window.innerWidth`.
  - It re-checks 100, 300 and 700 ms after the last event and listens to `ResizeObserver` and `visualViewport` as well.
  - It always calls `scale.refresh()`.
  - `#game` is now `position: fixed` with overflow clipped, so a briefly oversized canvas can't widen the page and trigger mobile zoom-to-fit.
- **Tests (`tests/e2e/layout.spec.ts`):** the canvas fills the screen on load, after rapid back-and-forth rotations, and after being forced oversized. The rotation flow in `smoke.spec.ts` also asserts the canvas fills the screen. I checked that the oversized test **fails on the old code** with the canvas stuck at 3× the screen.

## Trailer, logo and drizzles (2026-10-30)

Kumar shared photos of the real trailer and A-frame sign, confirmed the setting is the trailer, confirmed we may use the official logo, and confirmed the lowercase name "domochi".

- **Logo** is in `public/assets/logo.png`, a 512 px downscale (125 KB, down from 619 KB) for phone load times. It loads in Boot because the loading screen needs it. A code-drawn fallback ring is used if the file ever fails to load.
- **The loading screen is now cream,** like the trailer. The logo is ink on transparent with a *hollow* wordmark, which would disappear on our dark background. The logo replaces the text title, and the layout puts the logo on the left and the trailer on the right in landscape, stacked in portrait.
- **The placeholder truck now matches the photos:** a white trailer with bold ink outlines, as in the logo's comic style. It has the window on the left with Ethan and a menu board, the OPEN sign, the logo and @handle on the right, and tandem white-rim wheels. The old roof sign is gone because the real trailer doesn't have one.
- **New A-frame sign** in the Lobby next to the trailer. The ground is light concrete, like the photos, and the truck's wheels now sit on the ground line.
- **Drizzles, from the A-frame photo:** strawberry and cookie butter have white icing stripes over the base glaze, and cookie butter has a cookie on top. The menu model is now *base glaze* (dip or dust) plus an *optional drizzle* plus toppings, and the validator enforces those styles. So the Glaze station (Phase 4) will be dip or dust, then drizzle when the ticket asks for it.
- **The deliveries idea** (coffee-shop batch orders, delivery apps) is recorded in CLAUDE.md under Future ideas, with a note to get partner permission before using real names.

## Phase 2: order loop (2026-10-30)

- **`GameSession` (`src/systems/GameSession.ts`) is the single source of truth for a day.** It holds customers (in line, ordering, waiting, served), tickets (open, boxed, served), the *active* ticket and the box *in hand*. It's pure TypeScript driven by `tick(dtMs)`, with no wall clock and injected randomness, and is unit-tested end to end. Scenes only render from it and call its actions, and they redraw on its `changed` event.
- **The clock runs in `HudScene.update`,** the one scene that is always awake during play. Customers keep arriving while you're at a station. Each tick is capped at 250 ms, so a hitch doesn't skip time.
- **Seeded randomness (`systems/rng.ts`, mulberry32).** `?seed=123` in the URL makes a day reproducible, for tests and bug reports.
- **Ticket rail at the top (Papa's style)** shows Day N with served/total, the open tickets and Settings. Settings moved from the Lobby to the rail, so it's reachable from every station. The content area now sits between the rail and the tab bar, and all layouts were retuned.
- **Serving flow:** tap the front customer, who says their order. The ticket is written, and "Got it!" sends them to the waiting area with a number tag. Tap a rail ticket to make it active. Box → "Close lid & serve" picks the order up and returns to the Lobby with a "hand box #N to its customer" banner, and you tap the right customer. The wrong customer says their own "not mine, I'm #2" line; a customer whose order isn't boxed yet gets a hint. This is how CLAUDE.md's "hand the box to the matching customer" works.
- **Customers never storm off** (friendly brand). `patienceSec` stays in the data for the wait-time score in Phase 6.
- **Orders:** the size is the day's range from `balance.json` narrowed by the customer type's preference. Flavours are only those unlocked that day, weighted toward the type's favourites (×`favoriteWeight`). The order is packed in the smallest real box that fits (trio, flight, domochi box), and spoken naturally ("a strawberry and two cookies & cream").
- **Four customer types** in `customers.json`, each with its own sprite key, favourites, size range, patience and dialogue tiers (great/good/okay/bad; Phase 6 picks the tier). The types are a UL student in vermilion, an office worker, a parent, and a regular in the domochi tee. A validator checks sprites against `keys.ts`, favourites against the menu, and the `{order}`/`{ticket}` placeholders.
- **Performance: donut icons are cached textures.** Phaser Graphics re-draw every shape every frame, so tickets full of Graphics donuts would cost hundreds of shapes per frame. Each flavour's icon is now drawn once into a `donut-icon:<flavor>` texture and reused as an image. These are runtime cache textures, not art, so they're not in `keys.ts`. I checked for leaks: object, tween and texture counts stay flat over time.
- **Playwright is capped at 3 workers.** Headless Chromium renders WebGL on the CPU, so with this machine's 16 threads Playwright defaulted to 8 parallel browsers. They starved each other and long flows timed out. One at a time, everything passed, which confirmed it was load rather than a bug.
- **Not saved yet:** a day in progress isn't saved, so a reload starts the day fresh. Day progress and save/load are Phase 6.

## Phase 3: Fry station (2026-10-30)

- **The simulation is `src/stations/fry.ts` (`Fryer`).** It's pure, frame-rate independent (oil heats with an exponential lag, so 30 fps and 144 fps match) and allocation-free per tick. 17 unit tests cover it, plus session tests.
- **The model:**
  - Each donut has two sides. The *underside* cooks in the oil at a rate set by temperature (0 at 250°F, 1× at 350°F, capped at 1.8×).
  - The floating *top* cooks at 5% of that, or 60% while you **hold the grate**. **Flip** swaps the sides.
  - So there are two valid techniques: flip once (classic), or hold the grate (faster, but you have to keep a finger on it).
  - Dropping donuts cools the oil by 5°F each, and topping up mixes in room-temperature oil.
  - Oil soaks up 4% per donut. Below 35% the batch fries unevenly, using a fixed per-slot spread so it's reproducible.
  - All numbers are in `balance.json` → `fry`, and `validateBalance` checks they make sense.
- **Scoring:**
  - **Doneness (60%):** each side is perfect within ±0.1 of golden, falling to 0 at ±0.6.
  - **Time in the ideal 340–360°F range (25%)** and **evenness between donuts (15%)**.
  - *Design fix found by a unit test:* temperature and evenness are now **multiplied by doneness**. Before, a fully burnt batch fried at a perfect temperature still scored 40/100. Now burnt scores ~0, and a perfect fry still scores 100.
- **The fryer lives in the `GameSession`,** ticked by the session clock, so oil heats and donuts keep cooking or burning while you're at another station (Papa's style). Leaving the station releases the grate. A batch belongs to the ticket it was dropped for, even if you select a different ticket mid-fry. Results are stored on `ticket.results.fry`, shown as "fried" on the rail ticket and as the real score on the result card.
- **Rendering:** a white `donut-fry` texture is tinted every frame by `fryColor()` (raw → golden → burnt) for the side facing up. Two meters show underside and top against the golden band. The dial is draggable (±135°, snapping to 5°F) with the ideal arc marked, alongside a thermometer, an oil gauge, and context hints ("oil is cool: turn up the heat"). Text only updates when its value changes.
- **Fry-station header goes over the control panel in landscape** (`StationScene.headerPosition` can be overridden), so it doesn't overlap the vat.
- **Bug fixed: Button press effect.** It used to scale the whole button to 0.96 and back to 1, which wiped out any layout scale, such as the landscape Settings button. It now scales the button's contents.
- **Tests can pause the real-time clock** (`__setClockPaused`) and drive time with `advance()`. Without it, slow software-rendered screenshots let real time pass and the donuts genuinely burned in the test.
- **New `HoldButton`** for press-and-hold controls. It releases on pointer-up anywhere, on sliding off, or when disabled.

## Fry station tuning and prep batches (2026-10-30, Kumar's feedback)

- **Slower and more forgiving:** `secondsPerSide` went from 6 to **9**. The floating top now cooks at **15%** (was 5%), so it visibly creeps along instead of looking stalled. Flip and grate are still much faster. With a textbook flip, the second side needs about 15% less time, because the top already pre-cooked.
- **Drop and pull animations:** a dough depositor (`fry-dispenser`) sits on the vat's corner. On Drop, each ring plops out of the nozzle in turn with a bounce and an oil-splash ring, and the depositor squishes as each one drops. On Pull, donuts lift out: order donuts rise and fade, while prep donuts fly onto the rack. Animation offsets are tweened on plain objects and layered onto the per-frame slot positions, so the allocation-free render loop stays as it was.
- **Prep batches (frying without an order):** if there's no unfried active ticket, Drop fries a **prep batch** of `prepBatchSize` (3). Pulled prep donuts go to a **cooling rack** (capacity `rackCapacity`, 12; any excess is thrown away). Each racked donut keeps its own score, taken from its two sides plus its batch's temperature and evenness. A ticket can **use rack** donuts (oldest first) instead of frying fresh, and its fry score is the average of the donuts it took. The button label says what Drop will do: "Drop #2" or "Prep 3".
- **Bug avoided:** I first named the animation-offset array `anims`, which would have overwritten Phaser's own `scene.anims` animation manager and broken Ethan's wave. TypeScript caught the clash and it's now `donutAnims`. The same kind of clash happened earlier with `TabBar.setActive`, `TabBar.active` and `HoldButton.w`, so watch for Phaser base-class names.

## Fry station v2: one donut at a time (2026-10-30, Kumar's feedback)

- **The vat has 6 slots, and donuts go in one at a time.** Each **Drop** plops one ring into the first free slot. Every donut cooks, scores and burns independently (`FryDonut` in `stations/fry.ts`; batches are gone).
- **Per-donut controls:**
  - **Tap a donut to flip it** (with a quick squash animation).
  - **Drag it onto the rack** to take it out, or **drag it into the trash can** to throw it away and fry a fresh one.
  - **Pull all** and **Hold grate** buttons stay.
  - Phaser's `dragDistanceThreshold` (16 px) separates a tap from a drag.
- **Every fried donut goes to the cooling rack. Orders take theirs from the rack** ("use rack"), so frying is a production line and you can fry ahead. An order's fry score comes from its donuts: average doneness and time-in-range, plus evenness across the set. Each rack donut also has its own score.
- **Burnt donuts take themselves out:** once either side reaches `burntAt` (1.75), the donut is thrown out automatically with a smoke puff and a "burnt!" flash, via a session `burnt` event. Trashed and burnt donuts are counted (`session.trashed`) for the Phase 6 day summary.
- **Low oil runs hot (the knob drifts):** the oil settles at `dial + oilDriftF × (1 − oil level)` (60°F at empty). As donuts soak up oil, the same dial setting gets hotter, so you have to turn it back down. Adding oil reverses this. A hint explains it ("less oil runs hotter: dial it back down").
- **Each donut gets a small two-bar meter (underside / top)** in place of the old shared meters, turning gold when a side is in the golden band.

## Loading screen and customer pacing (2026-10-30)

- **No loading bar when there's nothing to load.** Only the logo is loaded, and that happens in Boot. If `ASSET_FILES` gains non-boot files later, the bar comes back automatically, with a short 0.6 s minimum so it doesn't flash.
- **Customer pacing** (Kumar: "customer 3 only comes after you served customer 1"): `maxActiveByDay` caps how many customers are in line or waiting at once (2 on day 1, up to 4). After each serve, the next arrival is pushed at least `afterServeSec` (2–7 s, random) later. The spawn check now counts customers with plain loops instead of `filter`, because it runs every frame while someone is due.
